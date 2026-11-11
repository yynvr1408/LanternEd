package org.lanterned.app;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.net.nsd.NsdManager;
import android.net.nsd.NsdServiceInfo;
import android.net.wifi.WifiManager;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Environment;
import android.os.PowerManager;
import android.os.StatFs;
import android.view.WindowManager;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.DatagramSocket;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Enumeration;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * LanternNative Capacitor Plugin for Android.
 * Provides Campus LAN WebSocket + HTTP Pack Relay, mDNS/NSD service discovery,
 * Wake Lock, device telemetry, and FileProvider Share Sheet integration.
 */
@CapacitorPlugin(name = "LanternNative")
public class LanternNativePlugin extends Plugin {
    private static final String SERVICE_TYPE = "_lanterned._tcp.";

    private final ExecutorService executor = Executors.newCachedThreadPool();
    private final CopyOnWriteArrayList<ClientSession> wsClients = new CopyOnWriteArrayList<>();
    private final Map<String, CachedPack> cachedPacks = new ConcurrentHashMap<>();

    private ServerSocket serverSocket;
    private WifiManager.MulticastLock multicastLock;
    private NsdManager nsdManager;
    private NsdManager.RegistrationListener registrationListener;
    private final AtomicBoolean serverRunning = new AtomicBoolean(false);
    private volatile String activeClassId;
    private volatile String activeTitle;
    private volatile String activeLocalIp;
    private volatile int activePort;

    private static final class CachedPack {
        final String contentType;
        final String sha256;
        final byte[] bytes;

        CachedPack(String contentType, String sha256, byte[] bytes) {
            this.contentType = contentType;
            this.sha256 = sha256;
            this.bytes = bytes;
        }
    }

    private final class ClientSession {
        final Socket socket;
        final OutputStream out;

        ClientSession(Socket socket, OutputStream out) {
            this.socket = socket;
            this.out = out;
        }

        synchronized boolean sendText(String text) {
            try {
                byte[] frame = LanProtocol.encodeFrame(0x1, text.getBytes(StandardCharsets.UTF_8));
                out.write(frame);
                out.flush();
                return true;
            } catch (IOException e) {
                return false;
            }
        }

        void closeQuietly() {
            try {
                socket.close();
            } catch (IOException ignored) {
            }
        }
    }

    @PluginMethod
    public void getDeviceMetrics(PluginCall call) {
        Context ctx = getContext();
        int batteryPct = -1;
        boolean isCharging = false;
        boolean isPowerSave = false;

        BatteryManager bm = (BatteryManager) ctx.getSystemService(Context.BATTERY_SERVICE);
        if (bm != null) {
            batteryPct = bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY);
            isCharging = bm.isCharging();
        }
        PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
        if (pm != null) {
            isPowerSave = pm.isPowerSaveMode();
        }

        long freeBytes = 0;
        try {
            StatFs stat = new StatFs(Environment.getDataDirectory().getPath());
            freeBytes = stat.getAvailableBytes();
        } catch (Exception ignored) {
        }

        JSObject res = new JSObject();
        res.put("osName", "android");
        res.put("osVersion", Build.VERSION.RELEASE);
        res.put("sdkInt", Build.VERSION.SDK_INT);
        res.put("model", Build.MODEL);
        res.put("arch", System.getProperty("os.arch", "arm64"));
        res.put("cpuCores", Runtime.getRuntime().availableProcessors());
        res.put("hasGpuAcceleration", true);
        res.put("isBatterySaving", isPowerSave);
        res.put("batteryLevel", batteryPct);
        res.put("isCharging", isCharging);
        res.put("freeStorageMb", Math.round(freeBytes / (1024.0 * 1024.0)));
        res.put("localIp", detectLocalIp());
        call.resolve(res);
    }

    @PluginMethod
    public void setWakeLock(PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", true));
        if (getActivity() == null) {
            call.resolve();
            return;
        }
        getActivity().runOnUiThread(() -> {
            if (enabled) {
                getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            } else {
                getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            }
            JSObject out = new JSObject();
            out.put("enabled", enabled);
            call.resolve(out);
        });
    }

    @PluginMethod
    public void startLanClassroomServer(PluginCall call) {
        String classId = call.getString("classId", "room");
        String title = call.getString("title", "LanternEd LAN Room");
        Integer reqPort = call.getInt("port", 8443);
        int requestedPort = reqPort != null ? reqPort : 8443;

        executor.execute(() -> {
            stopServerInternal();
            try {
                acquireMulticastLock();
                final ServerSocket ss = openServerSocket(requestedPort);
                int boundPort = ss.getLocalPort();
                String localIp = detectLocalIp();

                serverSocket = ss;
                activeClassId = classId;
                activeTitle = title;
                activeLocalIp = localIp;
                activePort = boundPort;
                serverRunning.set(true);

                executor.execute(() -> acceptLoop(ss));
                registerNsdService(classId, boundPort);

                JSObject res = new JSObject();
                res.put("classId", classId);
                res.put("title", title);
                res.put("localIp", localIp);
                res.put("port", boundPort);
                res.put("wsUrl", "ws://" + localIp + ":" + boundPort + "/lan-room");
                res.put("httpUrl", "http://" + localIp + ":" + boundPort);
                res.put("connectedStudents", wsClients.size());
                res.put("isRunning", true);
                call.resolve(res);
            } catch (IOException e) {
                call.reject("Failed to start Android LAN classroom server: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void stopLanClassroomServer(PluginCall call) {
        stopServerInternal();
        call.resolve();
    }

    @PluginMethod
    public void broadcastLanMessage(PluginCall call) {
        String message = call.getString("message", "");
        int sent = broadcastText(message);
        JSObject out = new JSObject();
        out.put("sent", sent);
        call.resolve(out);
    }

    @PluginMethod
    public void registerLanPack(PluginCall call) {
        if (!serverRunning.get()) {
            call.reject("LAN classroom server is not running");
            return;
        }
        String packId = call.getString("packId");
        String contentType = call.getString("contentType", "application/zip");
        String sha256 = call.getString("sha256", "");
        String bytesBase64 = call.getString("bytesBase64", "");
        if (packId == null || packId.isEmpty()) {
            call.reject("Missing packId");
            return;
        }

        byte[] raw = LanProtocol.base64Decode(bytesBase64);
        cachedPacks.put(packId, new CachedPack(contentType, sha256, raw));
        String url = "http://" + activeLocalIp + ":" + activePort + "/packs/" + packId;
        JSObject res = new JSObject();
        res.put("url", url);
        call.resolve(res);
    }

    @PluginMethod
    public void getLanServerStats(PluginCall call) {
        JSObject res = new JSObject();
        boolean running = serverRunning.get();
        res.put("isRunning", running);
        res.put("classId", running ? activeClassId : null);
        res.put("localIp", running ? activeLocalIp : null);
        res.put("port", running ? activePort : null);
        res.put("wsUrl", running ? ("ws://" + activeLocalIp + ":" + activePort + "/lan-room") : null);
        res.put("httpUrl", running ? ("http://" + activeLocalIp + ":" + activePort) : null);
        res.put("connectedStudents", wsClients.size());
        res.put("cachedPackCount", cachedPacks.size());
        call.resolve(res);
    }

    @PluginMethod
    public void discoverLanRooms(PluginCall call) {
        Integer timeoutObj = call.getInt("timeoutMs", 2200);
        int timeoutMs = Math.min(5000, Math.max(800, timeoutObj != null ? timeoutObj : 2200));
        executor.execute(() -> {
            List<JSObject> found = new ArrayList<>();
            Map<String, NsdServiceInfo> seen = new ConcurrentHashMap<>();
            acquireMulticastLock();
            NsdManager mgr = (NsdManager) getContext().getSystemService(Context.NSD_SERVICE);
            if (mgr == null) {
                JSObject out = new JSObject();
                out.put("rooms", new JSArray());
                call.resolve(out);
                return;
            }

            CountDownLatch resolveLatch = new CountDownLatch(1);
            NsdManager.DiscoveryListener listener = new NsdManager.DiscoveryListener() {
                @Override
                public void onDiscoveryStarted(String regType) {}

                @Override
                public void onServiceFound(NsdServiceInfo serviceInfo) {
                    if (!SERVICE_TYPE.equals(serviceInfo.getServiceType())
                        && !"_lanterned._tcp".equals(serviceInfo.getServiceType())) {
                        return;
                    }
                    String name = serviceInfo.getServiceName();
                    if (seen.putIfAbsent(name, serviceInfo) != null) return;
                    mgr.resolveService(serviceInfo, new NsdManager.ResolveListener() {
                        @Override
                        public void onResolveFailed(NsdServiceInfo info, int errorCode) {}

                        @Override
                        public void onServiceResolved(NsdServiceInfo resolved) {
                            InetAddress host = resolved.getHost();
                            if (host == null) return;
                            String ip = host.getHostAddress();
                            int port = resolved.getPort();
                            JSObject item = new JSObject();
                            item.put("name", resolved.getServiceName());
                            item.put("localIp", ip);
                            item.put("port", port);
                            item.put("wsUrl", "ws://" + ip + ":" + port + "/lan-room");
                            item.put("httpUrl", "http://" + ip + ":" + port);
                            synchronized (found) {
                                found.add(item);
                            }
                            resolveLatch.countDown();
                        }
                    });
                }

                @Override
                public void onServiceLost(NsdServiceInfo serviceInfo) {}

                @Override
                public void onDiscoveryStopped(String serviceType) {}

                @Override
                public void onStartDiscoveryFailed(String serviceType, int errorCode) {}

                @Override
                public void onStopDiscoveryFailed(String serviceType, int errorCode) {}
            };

            try {
                mgr.discoverServices(SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, listener);
                resolveLatch.await(timeoutMs, TimeUnit.MILLISECONDS);
                Thread.sleep(250);
            } catch (Exception ignored) {
            } finally {
                try {
                    mgr.stopServiceDiscovery(listener);
                } catch (Exception ignored) {
                }
            }

            JSArray arr = new JSArray();
            synchronized (found) {
                for (JSObject item : found) {
                    arr.put(item);
                }
            }
            JSObject out = new JSObject();
            out.put("rooms", arr);
            call.resolve(out);
        });
    }

    @PluginMethod
    public void shareContent(PluginCall call) {
        String title = call.getString("title", "LanternED Export");
        String text = call.getString("text", "");
        String fileName = call.getString("fileName");
        String contentType = call.getString("contentType", "application/octet-stream");
        String bytesBase64 = call.getString("bytesBase64");

        try {
            Intent sendIntent = new Intent(Intent.ACTION_SEND);
            if (fileName != null && !fileName.isEmpty() && bytesBase64 != null && !bytesBase64.isEmpty()) {
                byte[] bytes = LanProtocol.base64Decode(bytesBase64);
                File shareDir = new File(getContext().getCacheDir(), "shared");
                if (!shareDir.exists()) {
                    //noinspection ResultOfMethodCallIgnored
                    shareDir.mkdirs();
                }
                File target = new File(shareDir, fileName.replaceAll("[/\\\\]", "_"));
                try (FileOutputStream fos = new FileOutputStream(target)) {
                    fos.write(bytes);
                }
                Uri contentUri = FileProvider.getUriForFile(
                    getContext(),
                    getContext().getPackageName() + ".fileprovider",
                    target
                );
                sendIntent.setType(contentType);
                sendIntent.putExtra(Intent.EXTRA_STREAM, contentUri);
                sendIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            } else {
                sendIntent.setType("text/plain");
            }
            if (!text.isEmpty()) {
                sendIntent.putExtra(Intent.EXTRA_TEXT, text);
            }
            sendIntent.putExtra(Intent.EXTRA_SUBJECT, title);

            Intent chooser = Intent.createChooser(sendIntent, title);
            chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(chooser);

            JSObject out = new JSObject();
            out.put("shared", true);
            call.resolve(out);
        } catch (Exception e) {
            call.reject("Share failed: " + e.getMessage());
        }
    }

    private static ServerSocket openServerSocket(int preferredPort) throws IOException {
        try {
            return new ServerSocket(preferredPort);
        } catch (IOException busy) {
            return new ServerSocket(0);
        }
    }

    private void acceptLoop(ServerSocket ss) {
        while (serverRunning.get() && !ss.isClosed()) {
            try {
                Socket client = ss.accept();
                executor.execute(() -> handleClient(client));
            } catch (IOException e) {
                break;
            }
        }
    }

    private void handleClient(Socket client) {
        ClientSession wsSession = null;
        try {
            InputStream in = new BufferedInputStream(client.getInputStream());
            OutputStream out = client.getOutputStream();

            ByteArrayOutputStream headerBuf = new ByteArrayOutputStream();
            int prev3 = 0, prev2 = 0, prev1 = 0;
            int b;
            while ((b = in.read()) != -1) {
                headerBuf.write(b);
                if (prev3 == '\r' && prev2 == '\n' && prev1 == '\r' && b == '\n') {
                    break;
                }
                prev3 = prev2;
                prev2 = prev1;
                prev1 = b;
                if (headerBuf.size() > 16384) {
                    client.close();
                    return;
                }
            }

            String rawHeader = headerBuf.toString(StandardCharsets.UTF_8.name());
            String[] lines = rawHeader.split("\r\n");
            if (lines.length == 0) {
                client.close();
                return;
            }
            String[] reqParts = lines[0].split(" ");
            String path = reqParts.length > 1 ? reqParts[1] : "/";

            String wsKey = null;
            for (int i = 1; i < lines.length; i++) {
                int colon = lines[i].indexOf(':');
                if (colon > 0) {
                    String k = lines[i].substring(0, colon).trim().toLowerCase(Locale.ROOT);
                    String v = lines[i].substring(colon + 1).trim();
                    if ("sec-websocket-key".equals(k)) {
                        wsKey = v;
                    }
                }
            }

            if (wsKey != null) {
                String accept = LanProtocol.websocketAcceptKey(wsKey);
                String handshake = "HTTP/1.1 101 Switching Protocols\r\n"
                    + "Upgrade: websocket\r\n"
                    + "Connection: Upgrade\r\n"
                    + "Sec-WebSocket-Accept: " + accept + "\r\n\r\n";
                out.write(handshake.getBytes(StandardCharsets.UTF_8));
                out.flush();

                wsSession = new ClientSession(client, out);
                wsClients.add(wsSession);

                while (serverRunning.get() && !client.isClosed()) {
                    LanProtocol.WsFrame frame = LanProtocol.readFrame(in);
                    if (frame == null || frame.opcode == 0x8) {
                        break;
                    }
                    if (frame.opcode == 0x9) {
                        synchronized (wsSession) {
                            out.write(LanProtocol.encodeFrame(0xA, frame.payload));
                            out.flush();
                        }
                    } else if (frame.opcode == 0x1) {
                        String text = new String(frame.payload, StandardCharsets.UTF_8);
                        broadcastText(text);
                    }
                }
                return;
            }

            if (path.startsWith("/packs/")) {
                String packId = path.substring("/packs/".length());
                CachedPack pack = cachedPacks.get(packId);
                if (pack != null) {
                    String hdr = "HTTP/1.1 200 OK\r\n"
                        + "Content-Type: " + pack.contentType + "\r\n"
                        + "Content-Length: " + pack.bytes.length + "\r\n"
                        + "X-LanternEd-Sha256: " + pack.sha256 + "\r\n"
                        + "Access-Control-Allow-Origin: *\r\n"
                        + "Connection: close\r\n\r\n";
                    out.write(hdr.getBytes(StandardCharsets.UTF_8));
                    out.write(pack.bytes);
                    out.flush();
                } else {
                    out.write("HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".getBytes(StandardCharsets.UTF_8));
                    out.flush();
                }
                return;
            }

            JSObject statusJson = new JSObject();
            statusJson.put("classId", activeClassId);
            statusJson.put("title", activeTitle);
            statusJson.put("connectedStudents", wsClients.size());
            JSArray packNames = new JSArray();
            for (String k : cachedPacks.keySet()) packNames.put(k);
            statusJson.put("packs", packNames);
            byte[] body = statusJson.toString().getBytes(StandardCharsets.UTF_8);
            String hdr = "HTTP/1.1 200 OK\r\n"
                + "Content-Type: application/json\r\n"
                + "Content-Length: " + body.length + "\r\n"
                + "Access-Control-Allow-Origin: *\r\n"
                + "Connection: close\r\n\r\n";
            out.write(hdr.getBytes(StandardCharsets.UTF_8));
            out.write(body);
            out.flush();
        } catch (IOException ignored) {
        } finally {
            if (wsSession != null) {
                wsClients.remove(wsSession);
            }
            try {
                client.close();
            } catch (IOException ignored) {
            }
        }
    }

    private int broadcastText(String message) {
        int count = 0;
        for (ClientSession session : wsClients) {
            if (session.sendText(message)) {
                count++;
            } else {
                wsClients.remove(session);
                session.closeQuietly();
            }
        }
        return count;
    }

    private void registerNsdService(String classId, int port) {
        try {
            NsdManager mgr = (NsdManager) getContext().getSystemService(Context.NSD_SERVICE);
            if (mgr == null) return;
            nsdManager = mgr;
            NsdServiceInfo info = new NsdServiceInfo();
            String shortId = classId.length() > 8 ? classId.substring(0, 8) : classId;
            info.setServiceName("LanternEd-" + shortId);
            info.setServiceType(SERVICE_TYPE);
            info.setPort(port);

            registrationListener = new NsdManager.RegistrationListener() {
                @Override
                public void onServiceRegistered(NsdServiceInfo nsdServiceInfo) {}

                @Override
                public void onRegistrationFailed(NsdServiceInfo serviceInfo, int errorCode) {}

                @Override
                public void onServiceUnregistered(NsdServiceInfo serviceInfo) {}

                @Override
                public void onUnregistrationFailed(NsdServiceInfo serviceInfo, int errorCode) {}
            };
            mgr.registerService(info, NsdManager.PROTOCOL_DNS_SD, registrationListener);
        } catch (Exception ignored) {
        }
    }

    private void acquireMulticastLock() {
        try {
            WifiManager wifi = (WifiManager) getContext().getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wifi != null && multicastLock == null) {
                multicastLock = wifi.createMulticastLock("LanternEdLanLock");
                multicastLock.setReferenceCounted(false);
            }
            if (multicastLock != null && !multicastLock.isHeld()) {
                multicastLock.acquire();
            }
        } catch (Exception ignored) {
        }
    }

    private void stopServerInternal() {
        serverRunning.set(false);
        if (nsdManager != null && registrationListener != null) {
            try {
                nsdManager.unregisterService(registrationListener);
            } catch (Exception ignored) {
            }
            registrationListener = null;
        }
        for (ClientSession s : wsClients) {
            s.closeQuietly();
        }
        wsClients.clear();
        cachedPacks.clear();
        if (serverSocket != null) {
            try {
                serverSocket.close();
            } catch (IOException ignored) {
            }
            serverSocket = null;
        }
        if (multicastLock != null && multicastLock.isHeld()) {
            try {
                multicastLock.release();
            } catch (Exception ignored) {
            }
        }
    }

    private static String detectLocalIp() {
        try {
            try (DatagramSocket s = new DatagramSocket()) {
                s.connect(InetAddress.getByName("8.8.8.8"), 80);
                InetAddress addr = s.getLocalAddress();
                if (addr instanceof Inet4Address && !addr.isLoopbackAddress()) {
                    return addr.getHostAddress();
                }
            }
        } catch (Exception ignored) {
        }
        try {
            Enumeration<NetworkInterface> ifaces = NetworkInterface.getNetworkInterfaces();
            for (NetworkInterface nif : Collections.list(ifaces)) {
                if (!nif.isUp() || nif.isLoopback()) continue;
                for (InetAddress addr : Collections.list(nif.getInetAddresses())) {
                    if (addr instanceof Inet4Address && !addr.isLoopbackAddress()) {
                        return addr.getHostAddress();
                    }
                }
            }
        } catch (Exception ignored) {
        }
        return "127.0.0.1";
    }

    @Override
    protected void handleOnDestroy() {
        stopServerInternal();
        executor.shutdownNow();
        super.handleOnDestroy();
    }
}
