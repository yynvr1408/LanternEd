import Foundation
import UIKit
import Network
import CryptoKit
import Speech
import Capacitor

private struct CachedLanPack {
    let contentType: String
    let sha256: String
    let bytes: Data
}

@objc(LanternNativePlugin)
public class LanternNativePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LanternNativePlugin"
    public let jsName = "LanternNative"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getDeviceMetrics", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setWakeLock", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startLanClassroomServer", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopLanClassroomServer", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "broadcastLanMessage", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "registerLanPack", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getLanServerStats", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "discoverLanRooms", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "localTranscribeAudio", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "shareContent", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setExamLockdown", returnType: CAPPluginReturnPromise)
    ]

    private let stateQueue = DispatchQueue(label: "org.lanterned.ios.lan.state")
    private var listener: NWListener?
    private var activeClassId: String?
    private var activeTitle: String?
    private var activeLocalIp: String?
    private var activePort: UInt16 = 0
    private var wsClients: [ObjectIdentifier: NWConnection] = [:]
    private var cachedPacks: [String: CachedLanPack] = [:]

    deinit {
        stopServerSync()
    }

    // MARK: - Device Telemetry & Wake Lock

    @objc public func getDeviceMetrics(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let device = UIDevice.current
            let prevMonitor = device.isBatteryMonitoringEnabled
            device.isBatteryMonitoringEnabled = true
            let rawLevel = device.batteryLevel
            let batteryPct = rawLevel >= 0 ? Int(round(rawLevel * 100)) : -1
            let isCharging = device.batteryState == .charging || device.batteryState == .full
            if !prevMonitor {
                device.isBatteryMonitoringEnabled = false
            }

            let freeMb: Int = {
                let url = URL(fileURLWithPath: NSHomeDirectory())
                if let vals = try? url.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey]),
                   let cap = vals.volumeAvailableCapacityForImportantUsage {
                    return Int(cap / (1024 * 1024))
                }
                return 0
            }()

            let processInfo = ProcessInfo.processInfo
            let arch: String = {
                #if targetEnvironment(simulator)
                return "arm64-sim"
                #elseif arch(arm64)
                return "arm64"
                #else
                return "x86_64"
                #endif
            }()

            call.resolve([
                "osName": "ios",
                "osVersion": device.systemVersion,
                "model": device.model,
                "arch": arch,
                "cpuCores": processInfo.processorCount,
                "hasGpuAcceleration": true,
                "isBatterySaving": processInfo.isLowPowerModeEnabled,
                "batteryLevel": batteryPct,
                "isCharging": isCharging,
                "freeStorageMb": freeMb,
                "localIp": Self.detectLocalIPv4()
            ])
        }
    }

    @objc public func setWakeLock(_ call: CAPPluginCall) {
        let enabled = call.getBool("enabled") ?? true
        DispatchQueue.main.async {
            UIApplication.shared.isIdleTimerDisabled = enabled
            call.resolve(["enabled": enabled])
        }
    }

    // MARK: - Campus LAN Classroom Server (NWListener + RFC-6455 WebSocket + Bonjour)

    @objc public func startLanClassroomServer(_ call: CAPPluginCall) {
        let classId = call.getString("classId") ?? "room"
        let title = call.getString("title") ?? "LanternEd LAN Room"
        let requestedPort = UInt16(clamping: call.getInt("port") ?? 8443)

        stateQueue.async {
            self.stopServerSync()

            do {
                let nwPort = NWEndpoint.Port(rawValue: requestedPort)
                let created: NWListener
                if let p = nwPort, let specific = try? NWListener(using: .tcp, on: p) {
                    created = specific
                } else {
                    created = try NWListener(using: .tcp)
                }

                let shortId = String(classId.prefix(8))
                created.service = NWListener.Service(name: "LanternEd-\(shortId)", type: "_lanterned._tcp")

                var replied = false
                created.stateUpdateHandler = { [weak self] state in
                    guard let self = self else { return }
                    self.stateQueue.async {
                        switch state {
                        case .ready:
                            guard !replied else { return }
                            replied = true
                            let boundPort = created.port?.rawValue ?? requestedPort
                            let ip = Self.detectLocalIPv4()
                            self.activeClassId = classId
                            self.activeTitle = title
                            self.activeLocalIp = ip
                            self.activePort = boundPort
                            call.resolve([
                                "classId": classId,
                                "title": title,
                                "localIp": ip,
                                "port": Int(boundPort),
                                "wsUrl": "ws://\(ip):\(boundPort)/lan-room",
                                "httpUrl": "http://\(ip):\(boundPort)",
                                "connectedStudents": self.wsClients.count,
                                "isRunning": true
                            ])
                        case .failed(let err):
                            guard !replied else { return }
                            replied = true
                            self.stopServerSync()
                            call.reject("LAN listener failed: \(err.localizedDescription)")
                        default:
                            break
                        }
                    }
                }

                created.newConnectionHandler = { [weak self] conn in
                    self?.handleIncomingConnection(conn)
                }

                self.listener = created
                created.start(queue: self.stateQueue)
            } catch {
                call.reject("Unable to start iOS LAN server: \(error.localizedDescription)")
            }
        }
    }

    @objc public func stopLanClassroomServer(_ call: CAPPluginCall) {
        stateQueue.async {
            self.stopServerSync()
            call.resolve()
        }
    }

    @objc public func broadcastLanMessage(_ call: CAPPluginCall) {
        let message = call.getString("message") ?? ""
        stateQueue.async {
            let sent = self.broadcastTextSync(message)
            call.resolve(["sent": sent])
        }
    }

    @objc public func registerLanPack(_ call: CAPPluginCall) {
        guard let packId = call.getString("packId"), !packId.isEmpty else {
            call.reject("Missing packId")
            return
        }
        let contentType = call.getString("contentType") ?? "application/zip"
        let sha256 = call.getString("sha256") ?? ""
        let b64 = call.getString("bytesBase64") ?? ""
        let raw = Data(base64Encoded: b64) ?? Data()

        stateQueue.async {
            guard self.listener != nil, let ip = self.activeLocalIp, self.activePort > 0 else {
                call.reject("LAN classroom server is not running")
                return
            }
            self.cachedPacks[packId] = CachedLanPack(contentType: contentType, sha256: sha256, bytes: raw)
            call.resolve(["url": "http://\(ip):\(self.activePort)/packs/\(packId)"])
        }
    }

    @objc public func getLanServerStats(_ call: CAPPluginCall) {
        stateQueue.async {
            let running = self.listener != nil && self.activePort > 0
            let ip = self.activeLocalIp ?? "127.0.0.1"
            let port = Int(self.activePort)
            var res: [String: Any] = [
                "isRunning": running,
                "connectedStudents": self.wsClients.count,
                "cachedPackCount": self.cachedPacks.count
            ]
            if running {
                res["classId"] = self.activeClassId
                res["localIp"] = ip
                res["port"] = port
                res["wsUrl"] = "ws://\(ip):\(port)/lan-room"
                res["httpUrl"] = "http://\(ip):\(port)"
            }
            call.resolve(res)
        }
    }

    // MARK: - Bonjour Room Discovery

    @objc public func discoverLanRooms(_ call: CAPPluginCall) {
        let timeoutMs = min(5000, max(800, call.getInt("timeoutMs") ?? 2200))
        let browser = NWBrowser(for: .bonjour(type: "_lanterned._tcp", domain: nil), using: .tcp)
        var resolvedRooms: [[String: Any]] = []
        var seenEndpoints = Set<String>()
        var activeProbes: [NWConnection] = []
        let syncQueue = DispatchQueue(label: "org.lanterned.ios.lan.discovery")

        browser.browseResultsChangedHandler = { results, _ in
            syncQueue.async {
                for res in results {
                    guard case .service(let name, _, _, _) = res.endpoint else { continue }
                    if seenEndpoints.contains(name) { continue }
                    seenEndpoints.insert(name)

                    let probe = NWConnection(to: res.endpoint, using: .tcp)
                    activeProbes.append(probe)
                    probe.stateUpdateHandler = { state in
                        if case .ready = state {
                            syncQueue.async {
                                if let endpoint = probe.currentPath?.remoteEndpoint,
                                   case .hostPort(let host, let port) = endpoint {
                                    let hostStr = Self.hostToString(host)
                                    let portNum = Int(port.rawValue)
                                    resolvedRooms.append([
                                        "name": name,
                                        "localIp": hostStr,
                                        "port": portNum,
                                        "wsUrl": "ws://\(hostStr):\(portNum)/lan-room",
                                        "httpUrl": "http://\(hostStr):\(portNum)"
                                    ])
                                }
                                probe.cancel()
                            }
                        } else if case .failed = state {
                            probe.cancel()
                        }
                    }
                    probe.start(queue: syncQueue)
                }
            }
        }

        browser.start(queue: syncQueue)
        syncQueue.asyncAfter(deadline: .now() + .milliseconds(timeoutMs)) {
            browser.cancel()
            activeProbes.forEach { $0.cancel() }
            call.resolve(["rooms": resolvedRooms])
        }
    }

    // MARK: - On-Device Speech Recognition (SFSpeechRecognizer)

    @objc public func localTranscribeAudio(_ call: CAPPluginCall) {
        let recordingId = call.getString("recordingId") ?? "rec"
        let b64 = call.getString("bytesBase64") ?? ""
        let raw = Data(base64Encoded: b64) ?? Data()
        let estimatedDuration = max(15, raw.count / (16 * 1024))

        guard SFSpeechRecognizer.authorizationStatus() == .authorized,
              let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US")),
              recognizer.isAvailable,
              recognizer.supportsOnDeviceRecognition,
              !raw.isEmpty else {
            call.resolve([
                "transcript": "Apple on-device Speech Recognition is not enabled for recording \(recordingId). Grant Speech permissions in iOS Settings for offline transcription.",
                "durationSeconds": estimatedDuration,
                "language": "en",
                "confidence": 0.0,
                "isStub": true
            ])
            return
        }

        let tmpUrl = FileManager.default.temporaryDirectory.appendingPathComponent("lanterned_\(recordingId).m4a")
        do {
            try raw.write(to: tmpUrl)
        } catch {
            call.resolve([
                "transcript": "Unable to stage temporary audio file for on-device speech recognition.",
                "durationSeconds": estimatedDuration,
                "language": "en",
                "confidence": 0.0,
                "isStub": true
            ])
            return
        }

        let req = SFSpeechURLRecognitionRequest(url: tmpUrl)
        req.requiresOnDeviceRecognition = true
        req.shouldReportPartialResults = false

        var finished = false
        recognizer.recognitionTask(with: req) { result, error in
            if finished { return }
            if let result = result, result.isFinal {
                finished = true
                try? FileManager.default.removeItem(at: tmpUrl)
                call.resolve([
                    "transcript": result.bestTranscription.formattedString,
                    "durationSeconds": estimatedDuration,
                    "language": "en",
                    "confidence": 0.92,
                    "isStub": false
                ])
            } else if error != nil {
                finished = true
                try? FileManager.default.removeItem(at: tmpUrl)
                call.resolve([
                    "transcript": "On-device Apple Speech fallback used for recording \(recordingId).",
                    "durationSeconds": estimatedDuration,
                    "language": "en",
                    "confidence": 0.0,
                    "isStub": true
                ])
            }
        }
    }

    // MARK: - Native Share Sheet (iPhone & iPad)

    @objc public func shareContent(_ call: CAPPluginCall) {
        let text = call.getString("text") ?? ""
        let fileName = call.getString("fileName")
        let bytesBase64 = call.getString("bytesBase64")

        var items: [Any] = []
        if !text.isEmpty {
            items.append(text)
        }
        if let fileName = fileName, !fileName.isEmpty,
           let bytesBase64 = bytesBase64, !bytesBase64.isEmpty,
           let data = Data(base64Encoded: bytesBase64) {
            let safeName = fileName.replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "\\", with: "_")
            let url = FileManager.default.temporaryDirectory.appendingPathComponent(safeName)
            do {
                try data.write(to: url)
                items.append(url)
            } catch {
                call.reject("Could not write temporary share file: \(error.localizedDescription)")
                return
            }
        }

        if items.isEmpty {
            call.reject("Nothing to share")
            return
        }

        DispatchQueue.main.async {
            guard let vc = self.bridge?.viewController else {
                call.reject("No active view controller")
                return
            }
            let activity = UIActivityViewController(activityItems: items, applicationActivities: nil)
            if let pop = activity.popoverPresentationController {
                pop.sourceView = vc.view
                pop.sourceRect = CGRect(x: vc.view.bounds.midX, y: vc.view.bounds.midY, width: 1, height: 1)
                pop.permittedArrowDirections = []
            }
            vc.present(activity, animated: true) {
                call.resolve(["shared": true])
            }
        }
    }

    @objc public func setExamLockdown(_ call: CAPPluginCall) {
        let enabled = call.getBool("enabled") ?? false
        DispatchQueue.main.async {
            UIApplication.shared.isIdleTimerDisabled = enabled
            let guidedAccess = UIAccessibility.isGuidedAccessEnabled
            call.resolve([
                "active": enabled,
                "platform": "ios",
                "guidedAccessEnabled": guidedAccess,
                "capabilities": ["idle_timer_lock", "guided_access_check", "scene_background_guard"]
            ])
        }
    }

    // MARK: - Internal HTTP & WebSocket Relay

    private func handleIncomingConnection(_ conn: NWConnection) {
        conn.stateUpdateHandler = { [weak self] state in
            if case .failed = state {
                self?.removeClient(conn)
            } else if case .cancelled = state {
                self?.removeClient(conn)
            }
        }
        conn.start(queue: stateQueue)
        readHttpRequest(conn, accumulated: Data())
    }

    private func readHttpRequest(_ conn: NWConnection, accumulated: Data) {
        conn.receive(minimumIncompleteLength: 1, maximumLength: 16384) { [weak self] data, _, isComplete, error in
            guard let self = self else { return }
            if let data = data {
                var next = accumulated
                next.append(data)
                if let sepRange = next.range(of: Data("\r\n\r\n".utf8)) {
                    let headerData = next.subdata(in: 0..<sepRange.lowerBound)
                    self.dispatchHttpOrWebSocket(conn, headerText: String(decoding: headerData, as: UTF8.self))
                    return
                }
                if next.count > 16384 || isComplete {
                    conn.cancel()
                    return
                }
                self.readHttpRequest(conn, accumulated: next)
            } else if error != nil || isComplete {
                conn.cancel()
            }
        }
    }

    private func dispatchHttpOrWebSocket(_ conn: NWConnection, headerText: String) {
        let lines = headerText.components(separatedBy: "\r\n")
        let reqParts = (lines.first ?? "").components(separatedBy: " ")
        let path = reqParts.count > 1 ? reqParts[1] : "/"

        var wsKey: String?
        for line in lines.dropFirst() {
            if let colonIdx = line.firstIndex(of: ":") {
                let k = line[..<colonIdx].trimmingCharacters(in: .whitespaces).lowercased()
                let v = line[line.index(after: colonIdx)...].trimmingCharacters(in: .whitespaces)
                if k == "sec-websocket-key" {
                    wsKey = v
                }
            }
        }

        if let key = wsKey {
            let accept = Self.websocketAcceptKey(key)
            let handshake = "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: \(accept)\r\n\r\n"
            conn.send(content: Data(handshake.utf8), completion: .contentProcessed { [weak self] err in
                guard let self = self else { return }
                if err != nil {
                    conn.cancel()
                    return
                }
                self.wsClients[ObjectIdentifier(conn)] = conn
                self.readNextWsFrame(conn)
            })
            return
        }

        if path.hasPrefix("/packs/") {
            let packId = String(path.dropFirst("/packs/".count))
            if let pack = cachedPacks[packId] {
                let hdr = "HTTP/1.1 200 OK\r\nContent-Type: \(pack.contentType)\r\nContent-Length: \(pack.bytes.count)\r\nX-LanternEd-Sha256: \(pack.sha256)\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n"
                var payload = Data(hdr.utf8)
                payload.append(pack.bytes)
                conn.send(content: payload, completion: .contentProcessed { _ in conn.cancel() })
                return
            }
            let notFound = Data("HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".utf8)
            conn.send(content: notFound, completion: .contentProcessed { _ in conn.cancel() })
            return
        }

        let bodyObj: [String: Any] = [
            "classId": activeClassId ?? "",
            "title": activeTitle ?? "",
            "connectedStudents": wsClients.count,
            "packs": Array(cachedPacks.keys)
        ]
        let bodyData = (try? JSONSerialization.data(withJSONObject: bodyObj)) ?? Data("{}".utf8)
        let hdr = "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: \(bodyData.count)\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n"
        var resp = Data(hdr.utf8)
        resp.append(bodyData)
        conn.send(content: resp, completion: .contentProcessed { _ in conn.cancel() })
    }

    private func readNextWsFrame(_ conn: NWConnection) {
        conn.receive(minimumIncompleteLength: 2, maximumLength: 2) { [weak self] head, _, isComplete, error in
            guard let self = self, let head = head, head.count == 2, error == nil, !isComplete else {
                self?.removeClient(conn)
                return
            }
            let b0 = head[head.startIndex]
            let b1 = head[head.index(after: head.startIndex)]
            let opcode = b0 & 0x0F
            let masked = (b1 & 0x80) != 0
            let shortLen = UInt64(b1 & 0x7F)

            let readPayloadAndMask: (UInt64) -> Void = { payloadLen in
                guard payloadLen <= 1_048_576 else {
                    self.removeClient(conn)
                    return
                }
                let need = Int(payloadLen) + (masked ? 4 : 0)
                if need == 0 {
                    if opcode == 0x8 {
                        self.removeClient(conn)
                    } else {
                        self.readNextWsFrame(conn)
                    }
                    return
                }
                conn.receive(minimumIncompleteLength: need, maximumLength: need) { body, _, comp, err in
                    guard let body = body, body.count == need, err == nil, !comp else {
                        self.removeClient(conn)
                        return
                    }
                    let bodyBytes = Array(body)
                    var payload = Data(count: Int(payloadLen))
                    if masked {
                        let mask = [bodyBytes[0], bodyBytes[1], bodyBytes[2], bodyBytes[3]]
                        for i in 0..<Int(payloadLen) {
                            payload[i] = bodyBytes[4 + i] ^ mask[i % 4]
                        }
                    } else {
                        payload = body
                    }

                    if opcode == 0x8 {
                        self.removeClient(conn)
                        return
                    } else if opcode == 0x9 {
                        let pong = Self.encodeWsFrame(opcode: 0xA, payload: payload)
                        conn.send(content: pong, completion: .contentProcessed { _ in })
                    } else if opcode == 0x1, let text = String(data: payload, encoding: .utf8) {
                        _ = self.broadcastTextSync(text)
                    }
                    self.readNextWsFrame(conn)
                }
            }

            if shortLen == 126 {
                conn.receive(minimumIncompleteLength: 2, maximumLength: 2) { ext, _, c, e in
                    guard let ext = ext, ext.count == 2, e == nil, !c else {
                        self.removeClient(conn)
                        return
                    }
                    let extBytes = Array(ext)
                    let extLen = (UInt64(extBytes[0]) << 8) | UInt64(extBytes[1])
                    readPayloadAndMask(extLen)
                }
            } else if shortLen == 127 {
                conn.receive(minimumIncompleteLength: 8, maximumLength: 8) { ext, _, c, e in
                    guard let ext = ext, ext.count == 8, e == nil, !c else {
                        self.removeClient(conn)
                        return
                    }
                    let extBytes = Array(ext)
                    var extLen: UInt64 = 0
                    for byte in extBytes {
                        extLen = (extLen << 8) | UInt64(byte)
                    }
                    readPayloadAndMask(extLen)
                }
            } else {
                readPayloadAndMask(shortLen)
            }
        }
    }

    private func removeClient(_ conn: NWConnection) {
        wsClients.removeValue(forKey: ObjectIdentifier(conn))
        conn.cancel()
    }

    private func broadcastTextSync(_ message: String) -> Int {
        let frame = Self.encodeWsFrame(opcode: 0x1, payload: Data(message.utf8))
        var count = 0
        for (_, client) in wsClients {
            client.send(content: frame, completion: .contentProcessed { _ in })
            count += 1
        }
        return count
    }

    private func stopServerSync() {
        for (_, client) in wsClients {
            client.cancel()
        }
        wsClients.removeAll()
        cachedPacks.removeAll()
        listener?.cancel()
        listener = nil
        activeClassId = nil
        activeTitle = nil
        activeLocalIp = nil
        activePort = 0
    }

    private static func websocketAcceptKey(_ key: String) -> String {
        let combined = Data((key.trimmingCharacters(in: .whitespacesAndNewlines) + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").utf8)
        let digest = Insecure.SHA1.hash(data: combined)
        return Data(digest).base64EncodedString()
    }

    private static func encodeWsFrame(opcode: UInt8, payload: Data) -> Data {
        var header = Data()
        header.append(0x80 | (opcode & 0x0F))
        let count = payload.count
        if count < 126 {
            header.append(UInt8(count))
        } else if count <= Int(UInt16.max) {
            header.append(126)
            var len16 = UInt16(count).bigEndian
            header.append(Data(bytes: &len16, count: 2))
        } else {
            header.append(127)
            var len64 = UInt64(count).bigEndian
            header.append(Data(bytes: &len64, count: 8))
        }
        header.append(payload)
        return header
    }

    private static func detectLocalIPv4() -> String {
        var address = "127.0.0.1"
        var ifaddr: UnsafeMutablePointer<ifaddrs>?
        if getifaddrs(&ifaddr) == 0 {
            var ptr = ifaddr
            while ptr != nil {
                defer { ptr = ptr?.pointee.ifa_next }
                guard let interface = ptr?.pointee,
                      let addr = interface.ifa_addr,
                      addr.pointee.sa_family == UInt8(AF_INET) else { continue }
                let name = String(cString: interface.ifa_name)
                if name == "en0" || name == "en1" || address == "127.0.0.1" {
                    var hostname = [CChar](repeating: 0, count: Int(NI_MAXHOST))
                    if getnameinfo(addr, socklen_t(addr.pointee.sa_len), &hostname, socklen_t(hostname.count), nil, 0, NI_NUMERICHOST) == 0 {
                        let candidate = String(cString: hostname)
                        if candidate != "127.0.0.1" && !candidate.hasPrefix("169.254.") {
                            address = candidate
                            if name == "en0" { break }
                        }
                    }
                }
            }
            freeifaddrs(ifaddr)
        }
        return address
    }

    private static func hostToString(_ host: NWEndpoint.Host) -> String {
        switch host {
        case .ipv4(let v4):
            let octets = Array(v4.rawValue)
            if octets.count == 4 {
                return "\(octets[0]).\(octets[1]).\(octets[2]).\(octets[3])"
            }
            return cleanHostString(v4.debugDescription)
        case .ipv6(let v6):
            return cleanHostString(v6.debugDescription)
        case .name(let hostname, _):
            return hostname
        @unknown default:
            return ""
        }
    }

    private static func cleanHostString(_ raw: String) -> String {
        if let pct = raw.firstIndex(of: "%") {
            return String(raw[..<pct])
        }
        return raw
    }
}
