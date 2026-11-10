# LanternED — Project Memory

Offline-first, low-bandwidth LMS, live classroom, and proctored examination platform targeting tier-2/3 colleges and intermittent cellular networks.

## Repository Layout

- `backend/` — FastAPI (Uvicorn ASGI), SQLAlchemy 2.0+, Alembic (37 migrations; CI enforces single head), Pydantic Settings.
  - `backend/app/main.py` — App entrypoint, lifespan (`Base.metadata.create_all`, admin bootstrap, optional `_embedded_worker_loop`), middleware (`OriginCheckMiddleware`, `RequestIdMiddleware`, `CORSMiddleware`, `GZipMiddleware`), `/health`, `/ready`. Production (`APP_ENV=production`) disables `/docs`, `/redoc`, `/openapi.json` and requires `SESSION_SECRET` >= 16 chars.
  - `backend/app/config.py` — `Settings` from `.env`; normalizes `postgres://` / `postgresql://` to `postgresql+psycopg2://`; treats blank numeric env values as defaults.
  - `backend/app/api/router.py` & `backend/app/api/v1/` — 19 route modules under `/api/v1` (`auth`, `registration`, `admin`, `institution_admin`, `users`, `courses`, `classes`, `resources`, `sections`, `recordings`, `webhooks`, `assignments`, `summaries`, `synchronization`, `dashboard`, `notifications`, `releases`, `gradebook`, `exams`).
  - `backend/app/db/base.py` & `backend/app/db/session.py` — String UUID PKs (`UUIDPrimaryKeyMixin`), **naive UTC datetimes everywhere** (`utcnow()` strips `tzinfo` for SQLite/Postgres parity; Postgres engine sets `-c timezone=utc`).
  - `backend/app/db/models/` — Models split by domain (`user`, `college`, `course`, `section`, `lesson`, `classroom`, `assignment`, `summary`, `sync_operation`, `exam`, `gradebook`, `billing`, `consent`, `notification`, `roster`, `admin_request`, `rate_limit`, `enums`).
  - `backend/app/integrations/` — `object_storage.py` (`LocalObjectStorage` in `backend/media` vs `S3ObjectStorage`/R2 using presigned PUT/GET with `s3v4`), `livekit.py`, `llm_provider.py`, `speech_to_text.py`, `elevenlabs_service.py`, `email.py` (Resend or server-side EmailJS REST), `razorpay.py`, `whatsapp.py`.
  - `backend/app/workflows/post_class_pipeline.py` — Render Workflows 4-stage pipeline (`task_transcribe` -> `task_summarize` -> `task_elevenlabs_voiceover` -> `task_save_summary_record`).
  - `backend/app/worker.py` — Standalone/embedded periodic worker (`python -m app.worker [--once]`): requeues summary jobs, prunes rate-limit buckets/audit events/notifications, archives expired recordings, delivers pending WhatsApp notifications.
  - `backend/tests/` — `conftest.py`, `api/`, `unit/`, `integration/`.
- `frontend/` — React 19, TypeScript 6, Vite 8 PWA (`vite-plugin-pwa`), Tailwind CSS v4, TanStack Query v5, Dexie v4, LiveKit Client, i18next, Vitest, Playwright, `oxlint`.
  - `frontend/src/App.tsx` — Wraps `QueryClientProvider`, `BrowserRouter`, `AuthProvider`, `NetworkProvider`, `SyncProvider`, `AppRoutes`, and floating `NetworkBandwidthController`.
  - `frontend/src/routes/AppRoutes.tsx` & `ProtectedRoute.tsx` — Lazy-loaded route chunks for public auth, `/student/*`, `/teacher/*`, `/institution/*`, `/classroom/:classId`, `/student/exams/:examId/take`, and `/super-admin`.
  - `frontend/src/db/db.ts` — `LanternEDDB` (Dexie v4, 10 tables) + `claimDataOwner` / `clearPrivateUserData`.
  - `frontend/src/services/apiClient.ts` — Single HTTP transport (`credentials: 'include'`), GET-only cold-start retries on `502`/`503`/`504`, `window.__LANTERNED_SIMULATED_KBPS__` bandwidth simulation hooks, and backend-to-frontend view-model mappers.
  - `frontend/src/i18n/` — 21 pre-bundled locale JSONs (`locales/*.json`); RTL active for `ar`, `ur`.
  - `frontend/src-tauri/` — Tauri v2 desktop shell (`org.lanterned.desktop`, `src/main.rs`).
  - `frontend/android/` & `frontend/ios/` — Capacitor v8 (`^8.6.0`, `org.lanterned.app`) native mobile wrappers.
- `deploy/self-hosted/` — `docker-compose.yml` (Postgres 16, API, worker, frontend build, Caddy HTTPS reverse proxy).
- `ops/` — `pg_backup.sh` (nightly R2 backup via `.github/workflows/backup.yml`) and `loadtest/classday.js`.
- `releases/` — `manifest.json` served by `/api/v1/releases/*` and platform installers (`windows/`, `macos/`, `android/`, `ios/`).
- `scripts/` — `test_all.ps1` / `test_all.sh`, `ci_release.py` (SemVer sync, Conventional Commits changelog, release staging), `package_release.py`, `release.py`, `sync_to_app_releases_repo.py`, service probes, seeders.
- `.github/workflows/` — `ci.yml`, `build.yml`, `release.yml`, `reusable-release.yml`, `backup.yml`.

## Authentication, Sessions & Multi-Tenancy

- **Opaque Cookie Sessions (not JWT bearer tokens)**: `auth_service.create_session` generates `secrets.token_urlsafe(32)`, stores only its SHA-256 `session_hash` in `user_sessions`, and sets the `HttpOnly` cookie `lanterned_session` (`backend/app/core/security.py`, `backend/app/dependencies.py`). `localStorage`/`sessionStorage` (`lanterned_user`) is strictly an offline UI cache.
- **Role & Portal Separation**:
  - `student` (`/student/*`) and `teacher` (`/teacher/*`) use `get_current_user`, which explicitly rejects `UserRole.admin`.
  - **Institution Admin** (`/institution/*`): a `teacher` granted a row in `college_administrators` (unique constraint: at most one admin per college). Uses the normal teacher cookie plus `college_service.assert_can_manage_college`.
  - **Platform Super-Admin** (`/super-admin`, `AdminApp.tsx`): isolated `lanterned_admin_session` cookie (`get_current_admin`), requires `x-lanterned-admin: 1` header on mutations (`require_admin_csrf`), enforces `admin_idle_timeout_seconds` (1800s) and `admin_enforce_single_session`, and is **blocked on native apps** (`platformAdapter.isNative()`).
- **CSRF Origin Check**: `OriginCheckMiddleware` validates `Origin` on `POST`/`PUT`/`PATCH`/`DELETE` against `FRONTEND_ORIGIN`, `*.vercel.app` (if Vercel is in `FRONTEND_ORIGIN`), `https://lanterned*`, or same-host requests. Requests without `Origin` (server-to-server webhooks, tests) pass.
- **Tenant Hierarchy & Scoped Teachers**: `College` (unique `code`, immutable `CollegeCodeHistory`) -> `CollegeBranch` -> `CollegeSection`. Self-registered colleges go into `college_registration_requests` until approved by super-admin. `teaching_scope_service.py` confines scoped teachers to `user_college_sections` or branch-wide `user_branch_assignments` (`"All Sections"`), while legacy teachers with neither stay unscoped.
- **OTPs & Password Hashing**: Passwords use Argon2id (`argon2-cffi`). OTP challenges (registration, concurrent login, password reset, college deletion) store HMAC hashes keyed by `session_secret`. Without Resend/EmailJS configured in dev, OTPs return in `dev_otp`.

## Offline-First, Sync & Bandwidth Architecture

- **Workbox PWA** (`frontend/vite.config.ts`): Precaches static shell assets only. `navigateFallbackDenylist` blocks `/api/`, `/health`, `/ready`, `/docs`, `/openapi.json` — API payloads are never cached in the service worker.
- **IndexedDB (`LanternEDDB` v4, `frontend/src/db/db.ts`)**: 10 tables (`downloadedResources`, `downloadedRecordings`, `downloadedSummaries`, `downloadJobs`, `downloadParts`, `playbackPositions`, `cachedLessonMetadata`, `cachedSummaries`, `assignmentDrafts`, `syncOperations`).
  - `db.claimDataOwner(userId)` wipes all cached data and downloads if a different account logs into the same browser profile.
  - `AuthContext.logout` always clears `assignmentDrafts` + `syncOperations`, and clears downloads/caches when `isSharedDevice` (`lanterned_shared_device`) is enabled.
- **Resumable Verified Downloads** (`frontend/src/services/downloadEngine.ts`): Fetches byte-range chunks into `downloadParts` and validates byte count + SHA-256 checksum before marking completed.
- **Idempotent Sync** (`frontend/src/services/syncManager.ts` -> `POST /api/v1/sync/operations` -> `backend/app/services/synchronization_service.py`):
  - Enforces DB uniqueness on `(user_id, operation_id)` (`uq_user_operation`).
  - Stores canonical `payload_hash`; reusing an `operation_id` with a different payload returns `conflict` (`OPERATION_ID_REUSED`).
  - Commits side effect + `SyncOperation` record atomically in one transaction.
  - Supports `offline_submission_grace_hours` (default 24h) using `min(client_updated_at, utcnow())`.
- **Bandwidth Simulation**: `NetworkContext.tsx` + `NetworkBandwidthController.tsx` drives `window.__LANTERNED_SIMULATED_KBPS__` (`0` fails fast with offline `ApiError`; `1..300` adds simulated latency in `apiClient.ts`).

## Live Classroom, AI Pipeline, Exams & Gradebook

- **LiveKit Classroom** (`frontend/src/pages/classroom/ClassroomPage.tsx`, `backend/app/integrations/livekit.py`):
  - `LOW_BANDWIDTH_ROOM_OPTIONS`: `adaptiveStream: true`, `dynacast: true`, `AudioPresets.speech`, `dtx: true`, `red: true`, `VideoPresets.h180`/`h360`.
  - `useAdaptiveAudio.ts` pairs LiveKit `ConnectionQualityChanged` with `getRTCStatsReport()` inbound-rtp packet loss (`>0.08` for 2 consecutive 2s polls). Sustained poor quality (5s) unsubscribes video tracks (`publication.setSubscribed(false)`); 5s sustained good restores video; 8s `Lost` while audio-only triggers `severeDegradation` text fallback.
  - Vector whiteboard (`frontend/src/components/class/whiteboard/protocol.ts`): LiveKit data channel topic `'whiteboard'`, 16:9 integer grid (`SCALE=10000`), capped at `MAX_ITEMS=600`. Student `mic_only` tokens omit `can_publish_data` so students cannot inject whiteboard messages.
- **Recordings & Post-Class Pipeline**:
  - LiveKit egress requires `STORAGE_BACKEND=s3` (Cloudflare R2 in prod).
  - `POST /api/v1/webhooks/livekit` verifies LiveKit JWT signature, updates `ClassRecording`, and dispatches Render Workflow `lanterned-audio-pipeline/process_lecture_pipeline` when `RENDER_API_KEY` is set, otherwise falling back to FastAPI `BackgroundTasks` -> `summary_service.process_summary_job`.
  - `llm_provider.py` chunks transcripts >60,000 chars and degrades to a labeled `"source": "stub"` summary when `LLM_API_KEY` is unset. `elevenlabs_service.py` truncates recap text at 2,500 chars on sentence boundaries. Summaries require teacher review (`is_approved=False` initially).
- **Proctored Exams & Gradebook**:
  - `exam_service.py` + `StudentExamRunnerPage.tsx`: Question banks (`mcq_single`, `mcq_multi`, `coding`, `numerical`, `subjective`) with `bloom_level` and `course_outcome_tag`. Heartbeats (`/exams/{id}/heartbeat`, 20s client interval) persist answers and log `ExamAuditLog` events (`tab_hidden`, `window_blur`, `fullscreen_exit`), flagging attempts when `tab_blur_count >= max_tab_switches`. Objective/numerical items auto-grade on submit and return a SHA-256 `receipt_hash`.
  - `gradebook_service.py`: Course `GradebookConfig` weights (default: assignments `0.30`, quizzes `0.20`, midterms `0.20`, finals `0.20`, attendance `0.10`), multi-criteria `Rubric` + `EvaluationFeedback` (syncs score onto `AssignmentSubmission`), and `CourseGradeRecord`.

## UI Layout Conventions

- Role consoles (`TeacherLayout.tsx`, `StudentLayout.tsx`, `InstitutionAdminLayout.tsx`) use a pinned frame: `h-full flex flex-col overflow-hidden`, fixed `AppHeader` + fixed sidebar, with scrolling isolated to `<main className="flex-1 min-w-0 min-h-0 overflow-y-auto">`.
- Primary palette: `#0F5B57` (brand teal), `#F8FAF7` (canvas background), `#202B2A` (primary ink), `#121A19` (native/admin dark background).

## Known Implementation Boundaries & Test Gotchas

- **Native Tauri / LAN Commands Are Stubs**: `frontend/src-tauri/src/main.rs` commands (`local_transcribe_audio`, `start_lan_classroom_server`, `stop_lan_classroom_server`, `get_device_metrics`) and `lanClassroomService.ts` currently return placeholder responses (e.g., hardcoded `192.168.1.100`, static transcript text) rather than running `whisper-rs` or a live LAN WebSocket server.
- **Test Isolation (`backend/tests/conftest.py`)**: Before importing `app.*`, `conftest.py` forces `APP_ENV=test`, temp SQLite DB (unless `TEST_DATABASE_URL` is set), `STORAGE_BACKEND=local`, `FRONTEND_ORIGIN=http://localhost:5173`, disables college/OTP registration gates, and sets empty strings `""` for all third-party API keys so a local `backend/.env` cannot leak real credentials into tests.
- **Single-Table Receipt Hash**: `exam_service.submit_exam_attempt` computes and returns `receipt_hash` in `ExamSubmitResponse`; `ExamAttempt` itself does not have a `receipt_hash` column.
- **Wrapper Version Drift in Docs**: `frontend/package.json` uses `@capacitor/*` `^8.6.0` (some older comments/docs still say Capacitor 6).

## Verification & Dev Commands

- **Backend tests**: `cd backend && pytest -v --tb=short` (CI checks `alembic heads` count == 1 first).
- **Frontend lint / unit / build**: `cd frontend && npm run lint && npm test && npm run build` (`oxlint`, `vitest run`, `tsc -b && vite build`).
- **Unified Windows runner**: `.\scripts\test_all.ps1 -Fast` (or `-Suite <backend|lint|build|unit|layout|offline|real|live>`, `-SkipLive`).
- **Local dev**:
  - Backend: `cd backend && alembic upgrade head && uvicorn app.main:app --reload --port 8000`
  - Worker: `cd backend && python -m app.worker` (or `--once`)
  - Frontend: `cd frontend && npm run dev` (serves on `:5173`)
