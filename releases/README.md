# LanternEd Native Applications & Official Releases

[![Release](https://img.shields.io/badge/Release-v0.1.0-teal.svg)](manifest.json)
[![Platform](https://img.shields.io/badge/Platforms-Windows%20%7C%20macOS%20%7C%20Android%20%7C%20iOS-0F5B57.svg)](manifest.json)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

Official distribution repository for **LanternEd** cross-platform client applications across **Windows**, **macOS**, **Android**, and **iOS**.

LanternEd is an offline-first, low-bandwidth classroom platform designed for educational institutions, rural campuses, and low-connectivity environments. These native desktop and mobile applications enable offline lesson package synchronization, on-device Whisper AI lecture transcription, and zero-internet peer-to-peer campus LAN classroom mode.

---

## Download Catalog (v0.1.0)

| Operating System | Package Type | Architecture | File Size | Direct Download | SHA-256 Verification |
| :--- | :--- | :--- | :---: | :---: | :---: |
| **Windows 10 / 11** | Installer (`.exe`) | `x64` | 14.8 MB | [Download](windows/LanternEd-Setup-0.1.0.exe) | [SHA-256](windows/release.json) |
| **macOS 10.15+** | Disk Image (`.dmg`) | Universal (Apple Silicon & Intel) | 16.2 MB | [Download](macos/LanternEd-0.1.0-universal.dmg) | [SHA-256](macos/release.json) |
| **Android 8.0+** | Package (`.apk`) | `arm64-v8a`, `armeabi-v7a` | 18.5 MB | [Download](android/LanternEd-v0.1.0.apk) | [SHA-256](android/release.json) |
| **iOS 14.0+** | App Archive (`.ipa`) | `arm64` | 22.1 MB | [Download](ios/LanternEd-v0.1.0.ipa) | [SHA-256](ios/release.json) |

> [!NOTE]
> All binaries are cryptographically indexed in [manifest.json](manifest.json). You can verify binary integrity using standard SHA-256 checksum tools.

---

## System Requirements & Features

### Desktop Client (Windows & macOS)
- **Engine:** Built with Rust & Tauri 2.0. Memory footprint is <60 MB RAM.
- **Hardware Acceleration:** Native WebRTC audio processing with Opus DTX (Discontinuous Transmission) and RED (Redundant Audio Data) for surviving high packet loss.
- **Offline Campus LAN:** Embedded local HTTP & WebSocket server for sharing lessons peer-to-peer with classmates across local Wi-Fi hotspots when the internet is completely down.
- **On-Device AI:** Runs local Whisper AI lecture transcription directly on your laptop without sending recordings to external clouds.

### Mobile Client (Android & iOS)
- **Engine:** Built with Capacitor 6 native container.
- **Storage:** Secure hardware-backed storage for offline audiobooks, course notes, and assignment drafts.
- **Background Sync:** Automatic queue synchronization that submits pending assignments the moment 2G/3G connectivity is restored.
- **Data Saver Mode:** Voice-only low-bitrate streaming (caps bandwidth consumption at ~15-20 kbps).

---

## Verifying Checksums

### Windows (PowerShell)
```powershell
Get-FileHash -Algorithm SHA256 .\windows\LanternEd-Setup-0.1.0.exe
```

### macOS / Linux (Terminal)
```bash
shasum -a 256 macos/LanternEd-0.1.0-universal.dmg
```

### Android (Terminal / Termux)
```bash
sha256sum android/LanternEd-v0.1.0.apk
```

---

## In-App Auto-Updates

LanternEd native applications include an embedded **Update Engine**. When connected to the internet, navigating to **Profile > LanternEd Application & Updates** or clicking the update badge automatically queries the release manifest to download and install updates.

---

## Security & Architecture Scope

- **Student, Teacher & College Admin Portals:** Fully supported on all native applications.
- **Platform Super-Administrator Console:** Restricted to web browsers (`/super-admin`) for enterprise zero-trust security. Native client attempts to access super-admin endpoints are automatically blocked at the binary runtime level.

---

## License

Distributed under the MIT License. See [LICENSE](LICENSE) for details.
