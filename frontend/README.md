# LanternED frontend

The LanternED web app: a React 19 + TypeScript single-page application and progressive web app (installable, works offline) for students, teachers and the administrator. Deployed as static files on Vercel. Project overview: [../README.md](../README.md).

## Stack

React 19, TypeScript, Vite 8, Tailwind CSS v4, React Router 7, TanStack Query, React Hook Form with Zod, Dexie (IndexedDB), `vite-plugin-pwa` (Workbox), LiveKit client and React components, `@livekit/track-processors` (background blur), `jspdf` and `docx` (notes export, loaded only when used), `i18next` / `react-i18next` / `i18next-browser-languagedetector` (21 bundled locales, never fetched over the network), lucide-react icons. Tests: Vitest with Testing Library, Playwright. Lint: oxlint.

## Commands

```bash
npm install
npm run dev                  # http://localhost:5173
npm run build                # tsc -b && vite build  (output in dist/)
npm run preview              # serve the production build
npm test                     # Vitest (unit and component tests)
npm run lint                 # oxlint

npm run test:e2e:offline     # real Chromium, production build, service worker: offline downloads and playback
npm run test:e2e:layout      # responsive layout at desktop, tablet and phone sizes (API mocked at the network layer)
npm run test:e2e:real        # real backend + SQLite + built frontend, nothing mocked
npm run test:e2e:live        # real LiveKit Cloud (needs LIVEKIT_* in backend/.env)
```

Set `VITE_API_BASE_URL` (default `http://localhost:8000`) when the API is elsewhere. In production on Vercel, this is set to `https://lanterned-api.onrender.com`. It is the only environment variable the frontend uses and it is public; secrets never belong in a `VITE_` variable. The API lists the frontend's origin in `FRONTEND_ORIGIN`, because sign-in uses an httpOnly cookie.

## Portals and routes

| Area | Routes |
|---|---|
| Public & Auth | `/login`, `/login/student`, `/login/teacher`, `/login/college-admin`, `/register`, `/register/student`, `/register/teacher`, `/register/college`, `/forgot-password`, `/verify-otp`, `/reset-password` |
| Student | `/student/dashboard`, `courses`, `courses/:id`, `lessons/:id`, `classes`, `classes/:id/summary`, `recorded-lessons`, `assignments`, `assignments/:id`, `downloads`, `downloads/:id`, `profile` |
| Teacher | `/teacher/dashboard`, `courses`, `courses/new`, `courses/:id/manage`, `classes`, `classes/new`, `recorded-lessons`, `materials`, `assignments`, `summaries`, `profile`, `institution` (delegated college administrator) |
| College Admin | `/login/college-admin` -> `/institution/dashboard` (structure, branch/section setup, student approvals) |
| Live class | `/classroom/:classId` (students and teachers) |
| Super-Admin | `/super-admin` (multi-college provisioning, global telemetry; blocked inside native desktop/mobile apps) |

## Source layout

```
src/
  pages/        auth, student, teacher (+ institution admin), classroom, admin
  components/   ui (design system, incl. searchable LanguageSwitcher), layout, course, class (+ whiteboard), assignment, recording, summary, download, common (NetworkBandwidthController, AppDownloadModal)
  context/      AuthContext, NetworkContext, SyncContext
  services/     apiClient (single transport and view-model mapping), authService, adminApi, institutionAdminApi, registrationApi,
                courseService, classService, assignmentService, syncManager, downloadEngine, downloadManager, playbackStore, connectivity
  hooks/        useAdaptiveAudio, useConnectionRecovery, useScreenShares, useBackgroundBlur, useIsInstitutionAdmin
  i18n/         i18next setup (SUPPORTED_LANGUAGES) and 21 bundled locale JSON files under locales/
  db/           Dexie schema (drafts, sync queue, downloads, caches)
  utils/        dates, summaryExport (PDF and Word)
  routes/       AppRoutes, ProtectedRoute
  test/         Vitest suites
e2e-offline/  e2e-layout/  e2e-real/  e2e-live/  e2e/      Playwright suites
```

## Design system

Teal brand colour `#0F5B57` on warm light surfaces (`#F8FAF7`, borders `#E1E8E4`, text `#202B2A` / `#687775`), Inter typography, shared components in `src/components/ui` (Button, Input, Select, Card, Badge, Dialog, Sheet, EmptyState, ErrorState, LoadingState, Skeleton), minimum 44 px touch targets, visible focus states and layouts that stay inside the viewport from phones to wide desktops.

## Offline-first behaviour

* **Drafts and sync:** assignment answers are saved on the device (IndexedDB) while typing and sent through an idempotent queue when the connection returns; a submission shows as confirmed only after the server accepts it.
* **Downloads:** recordings and resources download in resumable ranged chunks into IndexedDB and open offline; the Downloads page shows real storage use.
* **Service worker:** the application shell is precached (2.28 MB) so any route opens offline; API responses are never cached (private data stays out of the cache).
* **Connectivity:** the device, the API and the live media connection are tracked separately so guidance matches the real cause; live classes switch to audio-only on a weak link and restore video when it recovers.
* **Shared devices:** signing out on a shared device clears drafts, the queue, downloads and caches.

## Live classroom

The teacher's camera is a small floating window (drag, enlarge, hide) for the teacher and the students; the teacher can blur their background, open a whiteboard shared over the LiveKit data channel, and share one or several screens. Students see a tab per shared item, can save the whiteboard as an image and receive a late join's full board. Implementation: `pages/classroom/ClassroomPage.tsx`, `components/class/`, `hooks/useScreenShares.ts`, `hooks/useBackgroundBlur.ts`. Details: [../docs/CLASSROOM_AND_COURSE_TOOLS.md](../docs/CLASSROOM_AND_COURSE_TOOLS.md).

## Institution admin

A teacher the administrator has delegated to manage one college sees an extra **Institution Admin** nav item and `/teacher/institution` route (`pages/teacher/TeacherInstitutionAdminPage.tsx`), reusing the same `CollegeStructureDialog` the platform `/super-admin` panel uses, pointed at `services/institutionAdminApi.ts` instead of `adminApi.ts`. Visibility is driven by `hooks/useIsInstitutionAdmin.ts`, which calls `GET /api/v1/institution-admin/colleges` and renders nothing while that list is empty — true for almost every teacher.

## Internationalisation

21 bundled languages are imported directly into the bundle (never requested over the network) so changing languages is instantaneous and costs zero data. Features a modern searchable popover dropdown with native script display (e.g. Telugu, Hindi, Tamil) and English subtitles.
