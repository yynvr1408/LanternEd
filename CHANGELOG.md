# LanternED — Changelog & Cross-Platform Release Notes

All notable changes to the LanternED educational platform and native client applications are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [v0.1.0] — 2026-11-05

### 🚀 Cross-Platform Client Applications (All 4 Platforms)

This release delivers verified native binaries across Windows, macOS, Android, and iOS packaged for zero-internet rural campus LANs and low-bandwidth cellular environments.

| Platform | Target Package | Installer | Target Architecture | Min OS Version | SHA-256 Checksum |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **Windows** | `LanternEd-Setup-0.1.0.exe` | NSIS / EXE | x64 (64-bit) | Windows 10 / 11 | `2fd51e677b9d0cbe94851f95650709f309e43abe526d3c15c5e4ee37e13041e7` |
| **macOS** | `LanternEd-0.1.0-universal.dmg` | DMG | Universal (Apple Silicon & Intel) | macOS 10.15+ (Catalina–Sequoia) | `2380bbb5ae64b6f85202d2627757a78d5ee86b58809e1d2fa6a072f31fada38e` |
| **Android** | `LanternEd-v0.1.0.apk` | Standalone APK | `arm64-v8a`, `armeabi-v7a` | Android 8.0+ (Oreo through 15) | `734777ba3c3a1cc6585a0dfb695983ecb67db18922ab4988c16828fae17e956d` |
| **iOS** | `LanternEd-v0.1.0.ipa` | Xcode Archive / IPA | `arm64` | iOS 14.0+ (iPhone & iPad) | `788c528fd4fcd65ec8da28287c55eb2e9f04222969bb895cd201db38673dc954` |

---

### 🌟 Key Feature Highlights & Architectural Implementations

#### 1. Inbuilt Draggable Network Bandwidth Simulation Controller
- **Floating Draggable Widget:** Available across all student, teacher, classroom, and admin dashboards. Drag anywhere across the viewport using mouse or mobile touch controls.
- **Dynamic Speed Controls:**
  - **Range Slider:** Drag to set real-time incoming and outgoing bandwidth limits from 0 kbps to 5,000 kbps (5 Mbps).
  - **Manual Input & Submit:** Input exact kbps thresholds (e.g., 20 kbps, 64 kbps, 512 kbps) with instant application.
  - **One-Click Presets:**
    - `🔴 Offline (0 kbps)`: Simulates total internet severance. Replaces network calls with offline-first local IndexedDB storage and queues operations.
    - `⚡ 2G Ultra-Low (20 kbps)`: Simulates severe rural cellular degradation. Engages LiveKit audio-only fallback, 800ms latency, and data saver mode.
    - `📶 3G Degraded (150 kbps)`: High-latency edge connection simulation.
    - `🚀 4G Fast (1.5 Mbps)`: Standard cellular network.
    - `⚡ Native / Unlimited`: Restores native device network.
- **Automatic Forward-Push on Network Restoration:**
  - Includes prominent **"Restore Internet & Forward-Push Queue"** action.
  - Automatically flushes and syncs all pending offline assignment drafts and sync operations from Dexie.js to the backend server with live count reporting.

#### 2. Adaptive Audio-First Fallback & LiveKit Hardening
- **WebRTC Transport Video Unsubscription:** Listens to `RoomEvent.ConnectionQualityChanged` and independently polls WebRTC `getRTCStatsReport()` packet loss. Explicitly calls `publication.setSubscribed(false)` on incoming video tracks when quality drops to `Poor` or packet loss exceeds 8%.
- **5-Second Hysteresis Recovery Buffer:** Prevents video flapping during intermittent signal blips. Video is only restored after 5 uninterrupted seconds of `Good` or `Excellent` link health.
- **Teacher Audio Profile:** Configures microphone with `audioPreset: AudioPresets.speech` (~24 kbps Opus), `dtx: true` (discontinuous transmission), and `red: true` (redundant audio encoding).
- **Responsive Fallback UI:** Replaces video feed with an animated pulsing speaker avatar (`#2DBE8B`), voice stream label, and low-bandwidth status banner with manual switch override.
- **Student Data Saver Toggle:** Dedicated toolbar button allowing students to manually force voice-only mode (~20 kbps) over HD video (~800 kbps).

#### 3. ElevenLabs Voice Summary Integration
- **Text-to-Speech Lecture Recap Service:** Integrates ElevenLabs Python SDK (`text_to_speech.convert`) using `eleven_turbo_v2_5` and sentence-boundary text truncation (capped at 2,500 characters, generating ~1.2 MB MP3s).
- **Database Schema & Migrations:** `LectureSummary` model extended with `audio_recap_key` (nullable String) and `is_approved` (Boolean), supported by linear Alembic migration `33eb0e755582`.
- **Teacher Review Gate:** Interactive audio preview player in `SummaryReviewModal.tsx` allowing teachers to listen to generated recaps before publishing to students.
- **Frontend Player & Offline Download:** Accessible via `SummaryViewer.tsx` across student notes and recorded lectures with one-click offline saving into IndexedDB.

#### 4. Render Workflows Orchestration Pipeline
- **Render Workflows Integration:** Migrated post-class media processing to `render>=1.0.1` Workflows in `backend/app/workflows/post_class_pipeline.py`.
- **Chained Task Stages:**
  1. `task_transcribe`: Audio extraction and Whisper chunked transcription.
  2. `task_summarize`: Groq/LLM structured study notes generation.
  3. `task_elevenlabs_voiceover`: ElevenLabs voice recap synthesis and Cloudflare R2 upload.
  4. `task_save_summary_record`: PostgreSQL persistence with teacher review status.
- **LiveKit Webhook Dispatch:** `egress_ended` triggers the pipeline asynchronously using `RenderAsync.workflows.start_task("lanterned-audio-pipeline/process_lecture_pipeline")`.
- **Render Blueprint (`render.yaml`):** Updated with `rootDir: backend`, `lanterned-api` naming, and synchronized environment variables.

#### 5. Offline-First Integrity & Idempotent Synchronization
- **Dexie.js Offline Drafts:** Written assignment submissions save instantly to browser/desktop IndexedDB (`LanternEDDB`) with client-generated UUIDs and idempotency keys (`sub-${assignmentId}-${studentId}-${uuid}`).
- **Backend Idempotency Engine:** `(user_id, operation_id)` unique constraint prevents duplicate rows and 500 errors on retry, atomically committing side effects and idempotency logs.
- **Shared Device Security:** Logging out in Shared Device Mode wipes all 8 Dexie storage tables (drafts, queues, cached downloads, and media blobs) and clears session tokens.

---

### 📦 Build & Release Instructions

1. **Verify Integrity of Built Binaries:**
   ```bash
   python scripts/package_release.py --action verify
   ```
2. **Export to Dedicated App Releases Repository:**
   ```bash
   python scripts/sync_to_app_releases_repo.py --target-dir ../LanternEd-App-Releases
   ```
3. **Publish to GitHub:**
   - Push release tag `v0.1.0` to trigger GitHub Actions automated cross-platform build workflow:
     ```bash
     git tag -a v0.1.0 -m "LanternEd v0.1.0 Cross-Platform Release"
     git push origin v0.1.0
     ```
