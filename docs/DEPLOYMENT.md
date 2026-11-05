# 🚀 Production Deployment & Multi-Platform CI/CD Pipeline

> **Standard operating procedures, infrastructure matrix, CI/CD automated release workflows, and environment variable configurations for LanternED.**

---

## 1. Production Infrastructure Matrix

| Service Role | Provider | Deployment Architecture | Configuration Notes |
| :--- | :--- | :--- | :--- |
| **Web Frontend** | Vercel Edge | Static Single Page Application (SPA) | Precached PWA bundle (~2.28 MB), automatic Brotli compression. |
| **Backend API** | Render | Docker Linux Container (Python 3.12 + Uvicorn) | Stateless container with health-check endpoint (`/health`). |
| **Database** | Neon Serverless | Managed PostgreSQL 18 | Connection pooling enabled with SSL enforcement (`sslmode=require`). |
| **Object Storage** | Cloudflare R2 | S3-Compatible Object Store | Zero egress transfer costs; presigned HMAC URLs for media/papers. |
| **Real-Time SFU** | LiveKit Cloud | Global Edge SFU Network | Adaptive Opus DTX voice, vector data channels, room composite egress. |
| **Speech-to-Text** | Groq Cloud | `whisper-large-v3-turbo` API | 15x real-time transcription of recorded classroom sessions. |
| **Voice Synthesis** | ElevenLabs | `turbo-v2.5` REST API | AI lecture summary audio synthesis. |
| **Transactional Mail**| Resend | REST API | Custom verified sending domain: `mail.afzaltech.in`. |

---

## 2. Environment Configuration Reference

### Backend `.env` Variables
```bash
# Core Platform Configuration
ENVIRONMENT=production
DEBUG=false
SECRET_KEY=your-cryptographically-secure-256bit-secret-key
PORT=8000
FRONTEND_URL=https://lantern-ed.vercel.app

# Database (Neon PostgreSQL)
DATABASE_URL=postgresql://user:password@ep-sample-pooler.region.neon.tech/lanterned?sslmode=require

# Cloudflare R2 Object Storage (S3-Compatible)
R2_ACCOUNT_ID=your-cloudflare-account-id
R2_ACCESS_KEY_ID=your-r2-access-key
R2_SECRET_ACCESS_KEY=your-r2-secret-key
R2_BUCKET_NAME=lanterned-production-media
R2_PUBLIC_DOMAIN=https://media.lanterned.afzaltech.in

# LiveKit SFU Real-Time Media
LIVEKIT_URL=wss://lanterned-prod.livekit.cloud
LIVEKIT_API_KEY=your-livekit-api-key
LIVEKIT_API_SECRET=your-livekit-api-secret

# AI & Speech Synthesis APIs
GROQ_API_KEY=gsk_your_groq_api_key_here
ELEVENLABS_API_KEY=your_elevenlabs_api_key_here

# Transactional Email (Resend)
RESEND_API_KEY=re_your_resend_api_key_here
EMAIL_FROM=LanternED <notifications@mail.afzaltech.in>

# Session & Token Lifecycles
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_HOURS=12
IDLE_SESSION_TIMEOUT_MINUTES=30
COOKIE_SECURE=true
COOKIE_SAMESITE=none
```

### Frontend `.env` Variables
```bash
VITE_API_BASE_URL=https://lanterned-api.onrender.com
VITE_LIVEKIT_URL=wss://lanterned-prod.livekit.cloud
VITE_APP_RELEASES_URL=https://github.com/yynvr1408/LanternEd/releases/latest
```

---

## 3. Cloudflare R2 Storage Bucket Configuration

To permit direct, low-latency browser uploads without routing gigabytes through backend compute, Cloudflare R2 must have CORS headers configured:

```json
[
  {
    "AllowedOrigins": [
      "https://lantern-ed.vercel.app",
      "http://localhost:5173",
      "tauri://localhost"
    ],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag", "Content-Range", "Accept-Ranges"],
    "MaxAgeSeconds": 3600
  }
]
```

---

## 4. Multi-Platform Automated CI/CD Workflows

LanternED ships client binaries across 4 platforms using automated GitHub Actions pipelines located in `.github/workflows/`.

### 4.1. Automated Release Pipeline Architecture
Whenever a semantic version tag (e.g., `v1.2.0`) is pushed to `main`, the build pipeline triggers automatically:

```mermaid
flowchart TD
    PUSH["Git Push Tag (v*.*.*) to main"] --> TRIGGER["GitHub Actions Release Workflow"]
    
    TRIGGER --> LINT_TEST["Code Quality & Automated Verification"]
    
    LINT_TEST --> WEB_BUILD["Web Production Bundle<br/>(Vercel Production Deploy)"]
    LINT_TEST --> WIN_BUILD["Windows Tauri Matrix<br/>(LanternEd-Setup.exe / .msi)"]
    LINT_TEST --> MAC_BUILD["macOS Tauri Matrix<br/>(LanternEd-Universal.dmg)"]
    LINT_TEST --> AND_BUILD["Android Capacitor Matrix<br/>(LanternEd-Release.apk)"]
    LINT_TEST --> IOS_BUILD["iOS Capacitor Matrix<br/>(LanternEd-Archive.ipa)"]

    WIN_BUILD & MAC_BUILD & AND_BUILD & IOS_BUILD --> DRAFT_REL["Draft GitHub Release with Assets"]
    DRAFT_REL --> PUBLISH["Publish Release & Tag Notes"]
    PUBLISH --> SYNC_LATEST["Client Update Modal pulls from /releases/latest"]
```

### 4.2. Sample GitHub Actions Workflow (`.github/workflows/release.yml`)
```yaml
name: Automated Multi-Platform Release Pipeline

on:
  push:
    tags:
      - 'v*'

jobs:
  verify:
    name: Lint & Test Verification
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'

      - name: Verify Backend Compilation
        run: |
          python -m py_compile backend/app/main.py

      - name: Verify Frontend Compilation
        run: |
          cd frontend
          npm ci
          npm run build

  build-android:
    name: Build Android APK
    needs: verify
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          distribution: 'zulu'
          java-version: '17'
      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Build Web Assets & Sync Capacitor
        run: |
          cd frontend
          npm ci
          npm run build
          npx cap sync android

      - name: Build Android Release APK
        run: |
          cd frontend/android
          ./gradlew assembleRelease

      - name: Upload APK Artifact
        uses: actions/upload-artifact@v4
        with:
          name: LanternEd-Android-APK
          path: frontend/android/app/build/outputs/apk/release/*.apk

  publish-release:
    name: Publish Semantic GitHub Release
    needs: [build-android]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/download-artifact@v4
      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          files: |
            **/*.apk
            **/*.exe
            **/*.dmg
          generate_release_notes: true
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

---

## 5. Live Release Distribution Endpoint

The frontend download modals ([`AppDownloadModal.tsx`](file:///frontend/src/components/ui/AppDownloadModal.tsx)) and update services ([`releaseService.ts`](file:///frontend/src/services/releaseService.ts)) dynamically query the active GitHub release channel:

- **Download Redirect URL:** [`https://github.com/yynvr1408/LanternEd/releases/latest`](https://github.com/yynvr1408/LanternEd/releases/latest)
- **Direct Windows Installer:** `https://github.com/yynvr1408/LanternEd/releases/latest/download/LanternEd-Setup.exe`
- **Direct Android APK:** `https://github.com/yynvr1408/LanternEd/releases/latest/download/LanternEd-release.apk`
- **Direct macOS DMG:** `https://github.com/yynvr1408/LanternEd/releases/latest/download/LanternEd.dmg`

This ensures end users and institutional computer labs always receive the newest stable binary without manual hyperlink maintenance.
