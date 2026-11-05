# 🏮 LanternED

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Live Web App](https://img.shields.io/badge/Vercel-Live%20Frontend-black?logo=vercel)](https://lantern-ed.vercel.app)
[![Live API](https://img.shields.io/badge/Render-Live%20API-46E3B7?logo=render)](https://lanterned-api.onrender.com)
[![Verified Email](https://img.shields.io/badge/Resend-Verified%20Domain-black?logo=resend)](https://resend.com)
[![Database](https://img.shields.io/badge/Neon-PostgreSQL%2018-00E599?logo=postgresql)](https://neon.tech)
[![Object Storage](https://img.shields.io/badge/Cloudflare-R2%20Storage-F38020?logo=cloudflare)](https://www.cloudflare.com/products/r2/)
[![WebRTC](https://img.shields.io/badge/LiveKit-Cloud%20SFU-FF6359?logo=webrtc)](https://livekit.io)
[![Backend Tests](https://img.shields.io/badge/pytest-634%20passed-brightgreen.svg)](backend/)
[![Frontend Tests](https://img.shields.io/badge/vitest-263%20passed-brightgreen.svg)](frontend/)
[![Platforms](https://img.shields.io/badge/Cross--Platform-Web%20%7C%20Windows%20%7C%20macOS%20%7C%20Android%20%7C%20iOS-teal.svg)](releases/)

> **An offline-first, low-bandwidth, AI-augmented educational ecosystem engineered for colleges and schools where internet connectivity is congested, intermittent, or expensive. Built to bridge the digital divide with adaptive real-time classes, local peer synchronization, automated multi-modal lecture notes, and seamless offline assignment workflows.**

---

### 🌐 Live Production Endpoints & Release Channels

* 🚀 **Production Web Application:** [https://lantern-ed.vercel.app](https://lantern-ed.vercel.app)
* ⚡ **Production Backend API:** [https://lanterned-api.onrender.com](https://lanterned-api.onrender.com)
* 📖 **Interactive OpenAPI / Swagger Documentation:** [https://lanterned-api.onrender.com/docs](https://lanterned-api.onrender.com/docs)
* 🩺 **Backend Health & Telemetry Probe:** [https://lanterned-api.onrender.com/health](https://lanterned-api.onrender.com/health)
* ✉️ **Verified Transactional Mail Domain:** `notifications@mail.afzaltech.in` (Powered by Resend)
* 📦 **Official Native Installers (Desktop & Mobile):** [LanternEd-App-Releases](releases/) (*Windows `.exe`, macOS `.dmg`, Android `.apk`, iOS `.ipa`*)

---

## 📑 Table of Contents

1. [Executive Summary & Problem Statement](#1-executive-summary--problem-statement)
2. [Current Solutions: Pros & Cons Analysis](#2-current-solutions-pros--cons-analysis)
3. [The LanternED Proposed Solution & Core Innovations](#3-the-lanterned-proposed-solution--core-innovations)
4. [Hackathon Evaluation Framework (Judging Criteria)](#4-hackathon-evaluation-framework-judging-criteria)
   * [Impact (25%)](#41-impact-25)
   * [Technical Execution (25%)](#42-technical-execution-25)
   * [UX & Polish (25%)](#43-ux--polish-25)
   * [Sprint Alignment & Completeness (25%)](#44-sprint-alignment--completeness-25)
5. [Business Scope, Unit Economics & Global Scalability](#5-business-scope-unit-economics--global-scalability)
6. [System Architecture & Data Flow](#6-system-architecture--data-flow)
7. [Four-Tier Institutional Governance Model](#7-four-tier-institutional-governance-model)
8. [Comprehensive Feature Matrix & Capabilities](#8-comprehensive-feature-matrix--capabilities)
9. [Technology Stack](#9-technology-stack)
10. [Local Development & Setup Guide](#10-local-development--setup-guide)
11. [Security Architecture & Shared Device Protection](#11-security-architecture--shared-device-protection)
12. [Verification & Automated Test Suite](#12-verification--automated-test-suite)

---

## 1. Executive Summary & Problem Statement

### The Global Reality: The Digital Divide in Education
Over **1.3 billion learners** globally are situated in regions characterized by low-bandwidth, intermittent, or expensive internet connectivity. In rural, semi-urban, and tier-2/3 institutions across developing nations (such as India, Sub-Saharan Africa, and Southeast Asia), traditional online learning infrastructure fails completely:

1. **Bandwidth Starvation & Cellular Instability:** Most students access education over congested 2G/3G or throttled 4G mobile data with frequent packet loss (>15%) and high latency (>300ms). Heavy video streams choke networks and disconnect students within minutes.
2. **Device Sharing & Security Hazards:** In low-income families and rural campuses, smartphones and cybercafe computers are shared among multiple users. Traditional LMS platforms persist login states and unencrypted local caches, exposing private assignments and credentials.
3. **Prohibitive Data & Subscription Costs:** Enterprise LMS tools (like Canvas, Blackboard) charge $15–$50 per student annually, and an hour-long Zoom call consumes 800 MB to 1.5 GB of mobile data—costing up to a full day's wage in impoverished areas.
4. **Linguistic Isolation:** While higher education institutions teach in multilingual regions, 90% of edtech software is English-centric. Regional students face steep comprehension hurdles when navigation and learning resources lack localized accessibility.

---

## 2. Current Solutions: Pros & Cons Analysis

Existing market solutions fall into three main categories—none of which are designed for resource-constrained environments:

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                CURRENT EDTECH LANDSCAPE vs. LANTERNED                                  │
├──────────────────────┬───────────────────────────────┬─────────────────────────────────────────────────┤
│ PLATFORM TYPE        │ PROS                          │ CONS / FAILURES IN CONSTRAINED REGIONS          │
├──────────────────────┼───────────────────────────────┼─────────────────────────────────────────────────┤
│ Video Conferencing   │ • High-definition video       │ ❌ Fatal under <1 Mbps bandwidth (<200 kbps drop)│
│ (Zoom, Google Meet,  │ • Broad brand familiarity     │ ❌ Consumes 800 MB–1.5 GB data per 60 min class │
│  MS Teams)           │ • Screen sharing & recording  │ ❌ Zero offline persistence or assignment tools │
│                      │                               │ ❌ Cloud recordings cost $10+/GB to host/stream │
├──────────────────────┼───────────────────────────────┼─────────────────────────────────────────────────┤
│ Cloud LMS Platforms  │ • Rich grading & rubrics      │ ❌ Heavy monolithic SPAs (require constant link)│
│ (Canvas, Blackboard, │ • Comprehensive student logs  │ ❌ Zero offline assignment drafting/queueing    │
│  Moodle Cloud)       │ • Enterprise SIS integrations │ ❌ Cost-prohibitive ($5,000–$50,000 / year)     │
│                      │                               │ ❌ Clumsy non-localized mobile interfaces       │
├──────────────────────┼───────────────────────────────┼─────────────────────────────────────────────────┤
│ Informal Channels    │ • Extremely low data cost     │ ❌ Zero institutional structure or oversight    │
│ (WhatsApp, Telegram, │ • Ubiquitous mobile access    │ ❌ No live audio/whiteboard or synchronized flow│
│  YouTube Links)      │ • Asynchronous communication  │ ❌ Exhausts low-end phone storage immediately   │
│                      │                               │ ❌ Distraction-heavy & zero anti-cheating audit │
├──────────────────────┼───────────────────────────────┼─────────────────────────────────────────────────┤
│ LANTERNED            │ ✅ Audio-first WebRTC (12kbps)│ ⚡ Requires initial PWA / native shell install  │
│ (Our Solution)       │ ✅ 100% offline sync engine   │   (one-time ~2.3 MB cached bundle)              │
│                      │ ✅ AI notes & audio recaps    │                                                 │
│                      │ ✅ 21 bundled locales (0 data)│                                                 │
│                      │ ✅ Zero cloud-egress cost R2  │                                                 │
└──────────────────────┴───────────────────────────────┴─────────────────────────────────────────────────┘
```

### Deep Comparative Matrix

| Feature / Metric | Zoom / Meet | Canvas / Blackboard | WhatsApp Groups | **LanternED (Our Solution)** |
| :--- | :---: | :---: | :---: | :---: |
| **Minimum Bandwidth** | 1,200 kbps | 500 kbps | 50 kbps (text only) | **12 kbps (Live Audio + Whiteboard)** |
| **Data Usage (1-Hour Class)** | ~900 MB | ~150 MB | N/A | **~35 MB (>95% Bandwidth Savings)** |
| **Offline-First Assignment Sync** | ❌ No | ❌ No | ❌ No | **✅ Yes (IndexedDB + Idempotent Queue)** |
| **Offline Class Media Playback** | ❌ No | ❌ No | ⚠️ Clutters Gallery | **✅ Yes (Encrypted Local Storage API)** |
| **AI Multi-Modal Summaries** | Paid Add-on | ❌ No | ❌ No | **✅ Whisper Transcription + LLM Notes** |
| **Audio-Synthesized Lecture Recaps**| ❌ No | ❌ No | ❌ No | **✅ Yes (ElevenLabs Studio Voice)** |
| **Bundled Offline Languages** | 2–5 (online) | 1–4 (online) | OS dependent | **✅ 21 Languages (Zero-network cost)** |
| **Shared Computer Privacy Wipe** | ❌ No | ❌ No | ❌ No | **✅ Yes (Single-click credential wipe)** |
| **Multi-College Branch/Section Isolation** | ❌ No | Paid Tier | ❌ No | **✅ Yes (Cryptographic College Codes)** |
| **Annual Institutional Cost** | $15–$30/user | $20–$50/user | Free (No Control) | **<$1/user (Open-Source Architecture)** |

---

## 3. The LanternED Proposed Solution & Core Innovations

LanternED is an engineered paradigm shift from **"Heavy Cloud Video"** to **"Intelligent, Low-Bandwidth Edge Learning"**.

```mermaid
flowchart TD
    subgraph EDGE["Client / Campus Edge (Offline-First)"]
        SW["Service Worker<br/>(PWA Precache 2.3 MB)"]
        IDB[("IndexedDB Local Store<br/>Drafts, Offline Media, Notes")]
        WB["Collaborative Whiteboard<br/>(<300 bytes / stroke)"]
        ADAPT["Adaptive WebRTC Engine<br/>(12-32 kbps DTX Voice)"]
        I18N["Bundled i18n Engine<br/>(21 Locales with Instant Search)"]
    end

    subgraph CLOUD["High-Efficiency Cloud Infrastructure"]
        API["FastAPI Stateless Engine<br/>(Deployed on Render)"]
        DB[("Neon Serverless Postgres<br/>(Connection Pooling)")]
        R2[("Cloudflare R2 Storage<br/>(Zero Egress Fees)")]
        LK["LiveKit Cloud SFU<br/>(Dynamic Simulcast & Audio DTX)"]
        AI["AI Pipeline<br/>(Groq Whisper + LLM Summaries)"]
        VOICE["Audio Synthesis<br/>(ElevenLabs Speech Synthesis)"]
        MAIL["Resend Transactional API<br/>(mail.afzaltech.in)"]
    end

    EDGE <-->|"Direct Presigned Ranged GET/PUT"| R2
    EDGE <-->|"WebRTC Media & Whiteboard Sync"| LK
    EDGE <-->|"Encrypted HTTPS API (Session Cookie)"| API
    API <--> DB
    API <--> AI
    API <--> VOICE
    API <--> MAIL
    API <--> LK
```

### Key Technical Add-Ups & Innovations

1. **Adaptive Audio-First Live Engine:**
   * Uses WebRTC with Opus Discontinuous Transmission (DTX) and Forward Error Correction (FEC).
   * Automatically drops downstream video when packet loss exceeds 12%, preserving crystal-clear 12–24 kbps teacher voice without dropping the call.
   * Collaborative whiteboard updates are streamed as vector coordinates over LiveKit data channels consuming **under 300 bytes per stroke**.
2. **Zero-Data Local Persistence Engine:**
   * Powered by Dexie.js (IndexedDB) and Workbox PWA precaching.
   * The complete web app shell is precached in **2.28 MB**, meaning subsequent loads consume **0 bytes** of data.
   * Students can draft assignments, write multi-paragraph answers, and attach documents offline; an idempotent sync worker dispatches them when network returns.
3. **Automated Multi-Modal AI Lecture Notes:**
   * Classroom recordings stored in Cloudflare R2 are automatically chunked and transcribed via **Groq Whisper Large v3 Turbo** (~15x real-time speed).
   * Summarized into key study topics, actionable bullet points, and flashcard questions via open-source LLMs.
   * Synthesized into an audio recap via **ElevenLabs**, allowing auditory learners to listen to a 5-minute lesson summary rather than burning hundreds of megabytes watching a full recording.
4. **21 Bundled Regional & Global Languages (Zero-Network Switching):**
   * Pre-compiled JSON dictionaries for 21 world and Indian scheduled languages (English, Hindi, Telugu, Tamil, Bengali, Marathi, Urdu, Gujarati, Kannada, Malayalam, Odia, Punjabi, Assamese, Maithili, Mandarin, Arabic, Portuguese, Russian, Indonesian, Swahili, Japanese).
   * Features a custom searchable dropdown pill with native script rendering, English subtitles, and instantaneous client-side filtering.
5. **Shared Device Mode (Cybercafe & Lab Safety):**
   * One-click session toggle for students using community or school lab computers.
   * Enforces non-persistent authentication and wipes local IndexedDB drafts, download caches, and session cookies upon sign-out.
6. **Concurrent Session Sentinel & Resend Transactional Security:**
   * If a compromised or shared account is accessed from a second device, the backend issues a `202 Accepted {otp_required: true}` challenge and emails an OTP code from `notifications@mail.afzaltech.in`.
   * Verifying the OTP immediately terminates and revokes stale sessions on older machines.

---

## 4. Hackathon Evaluation Framework (Judging Criteria)

### 4.1. Impact (25%)

| Evaluation Dimension | Real-World Impact Delivered by LanternED |
| :--- | :--- |
| **Bandwidth Reduction** | Reduces data consumption by **>95%**: A standard 1-hour university lecture drops from **850 MB** (Zoom/Meet) to **~35 MB** in audio-first mode with vector whiteboard sync. |
| **Socio-Economic Equality** | Allows tier-2, tier-3, and rural polytechnic students on ₹199/month mobile data plans to attend live classes all month without running out of data. |
| **Hardware Democratization** | Runs smoothly on low-end $50 Android smartphones and decade-old Windows desktop computers (Intel Dual-Core, 2 GB RAM) via optimized PWA and lightweight Tauri wrappers. |
| **Academic Continuity** | Students living in areas with regular load shedding or network blackouts can download study packs, review AI notes, and draft assignments completely offline. |
| **Linguistic Inclusion** | Eliminates English-only intimidation for regional language speakers by offering 21 localized interfaces with zero network overhead. |

---

### 4.2. Technical Execution (25%)

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                    PRODUCTION SYSTEM METRICS                                    │
├───────────────────────────────┬─────────────────────────────┬───────────────────────────────────┤
│ COMPONENT                     │ ENGINE / IMPLEMENTATION     │ PERFORMANCE / BENCHMARK           │
├───────────────────────────────┼─────────────────────────────┼───────────────────────────────────┤
│ Backend API                   │ FastAPI + Python 3.12       │ 8ms P95 latency on standard routes│
│ Database                      │ Neon PostgreSQL 18          │ Serverless pooling, SSL-enforced  │
│ Object Storage                │ Cloudflare R2 (S3-Compat)   │ 0 egress fees, presigned transfers│
│ Real-Time SFU                 │ LiveKit Cloud               │ Global edge WebRTC, Opus DTX      │
│ Speech-to-Text                │ Groq Whisper Large v3 Turbo │ 15x faster than real-time audio   │
│ Audio Synthesis               │ ElevenLabs Turbo v2.5       │ Low-latency natural speech recap  │
│ Transactional Email           │ Resend REST API (Custom DNS)│ Verified SPF/DKIM (mail.afzaltech)│
│ Frontend Bundle Size          │ Vite 8 + Manual Code-Split  │ 1.15s build, 73 precached entries │
│ Test Suite Coverage           │ Pytest + Vitest             │ 897 total automated tests passing │
└───────────────────────────────┴─────────────────────────────┴───────────────────────────────────┘
```

* **Zero-Egress Direct Presigned Architecture:** Large recording files and assignment attachments never proxy through the API server. The FastAPI backend generates short-lived HMAC-signed URLs, allowing direct client-to-R2 upload and ranged resumable streaming.
* **Strict Teaching Scope Authorization:** Zero reliance on client-side routing guards for security. Every request runs through `teaching_scope_service.py` to enforce that teachers can only access cohorts, classes, and submissions belonging to their assigned college, branch, or section.
* **Idempotent Background Synchronization:** The offline assignment queue assigns cryptographic UUIDs to submissions; retry loops guarantee that intermittent reconnections never submit duplicate records or corrupt teacher rosters.

---

### 4.3. UX & Polish (25%)

* **Visual Cohesion & Theming:** Built with an accessible, high-contrast palette—calming deep emerald (`#0F5B57`), fresh mint (`#EAF6F0`), crisp typography (Inter), and subtle ambient depth gradients.
* **Searchable Language Selector Pill:** A custom popover component offering instant fuzzy search across 21 languages, displaying native scripts (e.g., **తెలుగు**, **हिन्दी**, **தமிழ்**) alongside English subtitles with active checkmark feedback.
* **Interactive Network Bandwidth Controller:** An integrated floating simulator allowing evaluators and developers to test the live application under 2G (50 kbps), 3G (400 kbps), 4G (5 Mbps), and fully offline conditions on the fly.
* **Responsive HTML Transactional Emails:** 4 custom-styled email templates designed for high readability across mobile and desktop email clients (Registration OTP, Sign-In Approval, Password Reset, College Deletion).
* **Tactile Micro-Interactions:** Subtle hover lifts, skeleton loading states, and smooth collapsible panels.

---

### 4.4. Sprint Alignment & Completeness (25%)

LanternED is not a prototype or wireframe mock—**it is a 100% deployed, live, verified, full-stack product**:

* ✅ **Live Frontend on Vercel:** [https://lantern-ed.vercel.app](https://lantern-ed.vercel.app)
* ✅ **Live Docker Backend on Render:** [https://lanterned-api.onrender.com](https://lanterned-api.onrender.com)
* ✅ **Database Migrations Applied:** Complete Neon PostgreSQL schema initialized with Alembic.
* ✅ **Custom Domain Mail Sending Verified:** Live test email delivered successfully from `LanternED <notifications@mail.afzaltech.in>` via Resend.
* ✅ **All 4 Portals Operational:** Student, Teacher, College Admin, and Platform Super-Admin dashboards active and tested.
* ✅ **Automated CI/CD Pipeline:** GitHub Actions workflow building and packaging native installers for Windows, macOS, Android, and iOS.

---

## 5. Business Scope, Unit Economics & Global Scalability

```
                       GLOBAL ADDRESSABLE MARKET
  ┌─────────────────────────────────────────────────────────────────┐
  │  TOTAL ADDRESSABLE MARKET (TAM)                                 │
  │  $45 Billion - Global Low-Connectivity Education Market          │
  │  (350M+ students across South Asia, Africa, LATAM)              │
  ├─────────────────────────────────────────────────────────────────┤
  │  SERVICEABLE ADDRESSABLE MARKET (SAM)                           │
  │  $4.8 Billion - 45,000+ Tier-2/3 Colleges, Polytechnics, &     │
  │  Vocational Training Centers in India alone                     │
  ├─────────────────────────────────────────────────────────────────┤
  │  SERVICEABLE OBTAINABLE MARKET (SOM)                            │
  │  $48 Million (Initial 1% adoption = 450 institutions)           │
  └─────────────────────────────────────────────────────────────────┘
```

### Radical Unit Economics (Why LanternED Costs 95% Less)

Traditional LMS and video conferencing solutions incur massive cloud compute and egress costs ($0.09/GB on AWS/GCP). LanternED achieves industry-disrupting margins:

| Expense Item | Traditional Video LMS | LanternED Infrastructure | Cost Reduction |
| :--- | :--- | :--- | :---: |
| **Video/Audio Bandwidth** | $12.00 / student / mo | $0.00 / mo (Cloudflare R2 $0 Egress) | **100% Savings** |
| **Real-Time SFU Routing** | $4.50 / student / mo | $0.08 / student / mo (Audio-first SFU)| **98% Savings** |
| **Database Compute** | $2.00 / student / mo | $0.01 / student / mo (Neon Serverless)| **99% Savings** |
| **Total Cost Per Student** | **~$18.50 / student / mo**| **~$0.10 / student / mo** | **>99% Savings** |

### Revenue Model
1. **B2G & Institutional Licensing:** ₹25 ($0.30) to ₹50 ($0.60) per student per month for private rural colleges and state government polytechnics.
2. **AI Study Credits:** Freemium text summaries with paid voice recap quotas powered by ElevenLabs.
3. **White-Label University Deployment:** Self-hosted or managed private cloud instances for government education boards.

---

## 6. System Architecture & Data Flow

### 6.1. High-Level Real-Time Media & Whiteboard Flow

```mermaid
sequenceDiagram
    autonumber
    participant T as Teacher (Broadcaster)
    participant LK as LiveKit Cloud (SFU)
    participant S as Student (Subscriber)
    participant R2 as Cloudflare R2
    participant API as FastAPI Backend
    participant AI as Groq / Whisper AI

    T->>API: Start Live Class (Class ID, Branch Scope)
    API-->>T: Authorized Token (Can Publish Audio/Video/Data)
    S->>API: Join Live Class (Class ID)
    API-->>S: Subscriber Token (Subscribe Only)

    T->>LK: Publish Opus Audio (16-24 kbps) + Video Track
    T->>LK: Publish Whiteboard Stroke (Data Channel <300 bytes)
    LK-->>S: Broadcast Audio + Whiteboard Vector coordinates

    Note over S: Low Bandwidth Detected (<100 kbps)
    S->>LK: Unsubscribe Video Track (Retain Audio + Whiteboard)

    T->>API: End Class & Request Recording Egress
    API->>LK: Trigger Room Composite Egress -> Cloudflare R2
    LK-->>R2: Save MP4 Recording (0 Egress Transfer)
    LK->>API: Signed Webhook (Recording Complete)
    API->>AI: Dispatch Audio Track for Transcription & Summary
    AI-->>API: Transcribed Text & Bullet-Point Summary
    API-->>T: Ready for Teacher Review & Publication
```

### 6.2. Offline Assignment Drafting & Idempotent Sync

```mermaid
sequenceDiagram
    autonumber
    participant S as Student (Offline Browser)
    participant IDB as Local IndexedDB (Dexie)
    participant NET as Network Listener
    participant API as FastAPI Backend
    participant R2 as Cloudflare R2

    Note over S: Internet Disconnected (Offline)
    S->>IDB: Save Assignment Draft & Upload Attachments (PDF/DOCX)
    IDB-->>S: Confirmation (Draft Persisted with Client UUID)

    Note over NET: Internet Reconnected (Online Event)
    NET->>IDB: Query Pending Sync Queue
    IDB-->>NET: Return Unsynced Submissions

    NET->>API: POST /assignments/{id}/submit (Idempotency Key: UUID)
    alt Attachments Included
        API-->>NET: Return Presigned S3 PUT URL for Cloudflare R2
        NET->>R2: Upload Encrypted Binary directly to R2
    end
    API-->>NET: 200 OK (Submission Logged)
    NET->>IDB: Mark Submission Status = "SYNCED"
    IDB-->>S: UI Badge Updates to "Synced Successfully"
```

---

## 7. Four-Tier Institutional Governance Model

```mermaid
flowchart TD
    User([Platform Ingress]) --> Choice[Login Portal Selection]
    Choice -->|Student Portal| S_Dash["Student Dashboard (/student/dashboard)<br/>• Enrolled Courses & Real-Time Classes<br/>• Offline Downloads & Assignment Submissions"]
    Choice -->|Teacher Portal| T_Dash["Teacher Console (/teacher/dashboard)<br/>• Live Class Broadcaster & Whiteboard<br/>• AI Syllabus Import & Summary Review"]
    Choice -->|College Admin Portal| CA_Dash["College Admin Dashboard (/institution/dashboard)<br/>• Branch & Section Hierarchy Setup<br/>• Student & Teacher Registration Approvals"]
    Choice -.->|Super-Admin Link| SA_Check{"Native Shell Barrier"}
    SA_Check -->|Web Browser| SA_Dash["Super-Admin Console (/super-admin)<br/>• Multi-College Provisioning & Codes<br/>• Global Quotas, Billing & Server Telemetry"]
    SA_Check -->|Native Desktop / Mobile App| Blocked["ACCESS BARRED<br/>Web Console Required for Security"]
```

| Dashboard | Route | Primary Persona | Core Responsibilities |
| :--- | :--- | :--- | :--- |
| **1. Student Portal** | `/login/student` | Learner | Access low-bandwidth live classes, download offline lessons, read/listen to AI summaries, submit assignments. |
| **2. Teacher Console** | `/login/teacher` | Educator | Broadcast classes (DTX voice, floating camera, whiteboard), import curriculum via PDF, review AI summaries, grade work. |
| **3. College Admin** | `/login/college-admin` | Principal / Dean | Approve campus registrations, manage college codes (`EV-XXXX-XXXX`), configure branches, departments, batches, sections. |
| **4. Super Admin** | `/super-admin` | Platform Operator | Provision new colleges, monitor server health, manage storage quotas, oversee multi-tenant telemetry. |

---

## 8. Comprehensive Feature Matrix & Capabilities

### 🎙️ Real-Time Low-Bandwidth Classroom
* **Floating Broadcaster Pip:** Movable, resizable teacher camera window with hardware-accelerated background blur.
* **Vector Whiteboard:** Real-time collaborative whiteboard featuring drawing pens, color swatches, shapes, text, undo/redo, and single-click JPEG export. Works seamlessly even at 2G dial-up speeds.
* **Multi-Screen Sharing:** High-efficiency screen capture streaming with automatic frame rate downsampling when network degrades.

### 🤖 AI Study Assistant & Lecture Intelligence
* **Whisper Audio Transcription:** Automatic background audio transcription of recorded lectures into timestamped paragraphs.
* **Smart Study Notes:** AI-generated summary structured into:
  * Core Concept Overviews
  * Key Takeaways & Exam Points
  * Interactive Flashcard Review Prompts
* **Word & PDF Notes Export:** One-click client-side generation of polished `.docx` and `.pdf` study guides using `docx` and `jspdf`.
* **ElevenLabs Audio Recaps:** Listen to natural-sounding 3-to-5 minute audio summaries on the go.

### 📥 Resumable Offline Storage Engine
* **Byte-Range Resumable Downloads:** Downloads pause and resume automatically when cellular connectivity cuts out.
* **Device Storage Meter:** Live visualization of browser IndexedDB storage quota and campus download sizes.
* **File System Save:** Direct download of decrypted media packs to the operating system's native storage.

---

## 9. Technology Stack

### Frontend Architecture
* **Core:** React 19, TypeScript, Vite 8
* **Styling:** Tailwind CSS v4, Lucide Icons
* **State & Query:** TanStack Query (React Query)
* **Local Persistence:** Dexie.js (IndexedDB wrapper)
* **Service Worker:** `vite-plugin-pwa` (Workbox)
* **Real-Time Client:** LiveKit Client SDK, `@livekit/components-react`, `@livekit/track-processors`
* **Document Generation:** `jspdf`, `docx`
* **Internationalization:** `i18next`, `react-i18next`, `i18next-browser-languagedetector` (21 bundled locales)

### Backend Architecture
* **Framework:** Python 3.12, FastAPI, Uvicorn
* **Data Layer:** SQLAlchemy 2.0, Alembic Migrations, Pydantic v2
* **Database:** Neon PostgreSQL 18 (Production) / SQLite (Local Dev)
* **Object Storage:** Cloudflare R2 via `boto3` (AWS S3-compatible API)
* **Live Media Controller:** `livekit-api` Python SDK
* **Speech & AI:** Groq SDK (`openai/gpt-oss-120b`, `whisper-large-v3-turbo`), ElevenLabs API
* **Transactional Email:** Resend REST API via `httpx`
* **Security & Crypto:** Argon2-cffi, itsdangerous, cryptographic token hashing

### Deployment & DevOps
* **Frontend Hosting:** Vercel (Edge CDN, SPA Rewrites)
* **Backend Hosting:** Render (Docker Web Service)
* **Cross-Platform Native Shells:** Tauri 2.0 (Windows/macOS), Capacitor 6 (Android/iOS)
* **Testing:** Pytest, Vitest, Playwright E2E

---

## 10. Local Development & Setup Guide

### Prerequisites
* **Node.js** >= 20.x and **npm** >= 10.x
* **Python** >= 3.11
* **Docker** (Optional, for running PostgreSQL locally)

### 1. Clone the Monorepo
```bash
git clone https://github.com/yynvr1408/LanternEd.git
cd LanternEd
```

### 2. Backend Setup
```bash
cd backend
python -m venv venv
# On Windows:
.\venv\Scripts\activate
# On Linux/macOS:
source venv/bin/activate

pip install -r requirements.txt
cp .env.example .env

# Run database migrations
alembic upgrade head

# Seed initial demonstration college, teacher, and student
python -m app.seed

# Start the FastAPI development server
uvicorn app.main:app --reload --port 8000
```

### 3. Frontend Setup
```bash
cd ../frontend
npm install

# Start Vite development server
npm run dev
# App will be accessible at http://localhost:5173
```

---

## 11. Security Architecture & Shared Device Protection

LanternED implements an airtight, defense-in-depth security model:

1. **HttpOnly, SameSite=None, Secure Cookies:** Authentication session tokens are never accessible to client-side JavaScript, completely neutralizing Cross-Site Scripting (XSS) token theft.
2. **Dual-Session Isolation:** Super-Admin sessions use a separate `lanterned_admin_session` cookie requiring the custom header `X-LanternED-Admin: 1`, preventing CSRF attacks.
3. **Argon2 Password Hashing:** Industry-standard Argon2id cryptographic password hashing with memory and parallelism constraints.
4. **Second-Device Sign-In Challenge:** If an account is logged in on Device A and someone attempts to sign in on Device B, a 6-digit OTP is dispatched via Resend from `notifications@mail.afzaltech.in`. Confirming the OTP terminates the stale session on Device A immediately.
5. **Shared Device Guard:** On public cybercafe or shared school machines, checking "Using a shared community / school device?" automatically wipes all stored assignment drafts, media caches, and credentials on logout.

---

## 12. Verification & Automated Test Suite

LanternED maintains an exhaustive test suite covering all layers of the stack:

```bash
# Run Backend Test Suite (634 passing tests)
cd backend
pytest

# Run Frontend Component & Unit Test Suite (263 passing tests)
cd ../frontend
npm test

# Run End-to-End Offline Simulation Tests (Playwright)
npm run test:e2e:offline
```

* **Backend Unit & Integration:** Rate limiting, college code generation, teaching scope validation, dual session invalidation, Resend dispatch fallback, R2 presigned URL generation.
* **Frontend Component Tests:** Searchable language switcher, offline IndexedDB sync queue, classroom whiteboard render, portal authorization guards.
* **E2E Offline Resilience:** Real headless Chromium tests simulating offline service worker precaching, media playback, and assignment sync.

---

## 📄 License & Attribution

Distributed under the **MIT License**. See `LICENSE` for more information.

* **Project Lead & Architecture:** LanternED Engineering Team
* **Live Application:** [https://lantern-ed.vercel.app](https://lantern-ed.vercel.app)
* **Support & Institution Inquiries:** `notifications@mail.afzaltech.in`
