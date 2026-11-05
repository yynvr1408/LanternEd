# LanternEd launch kit (4 months: late October 2026 to late February 2027)

Target: **public launch in the week of 22 February 2027**, aimed at the even-semester start. Pilots run before it; a college that has used the product for a term is your best sales asset.

| File | What it is |
|---|---|
| [PILOT_PLAYBOOK.md](PILOT_PLAYBOOK.md) | How to run 2-3 free pilots, what to measure, how to turn them into paid contracts |
| [PRICING_AND_SALES.md](PRICING_AND_SALES.md) | Pricing logic, the pitch, the 5-minute demo, objections, a one-page proposal |
| [MARKETING.md](MARKETING.md) | Positioning, channels, content calendar, launch-week checklist, funnel targets |
| [LEGAL_AND_PRIVACY.md](LEGAL_AND_PRIVACY.md) | Draft privacy notice, terms, recording consent, DPDP checklist. **Have a lawyer review before use** |
| [PLAY_STORE.md](PLAY_STORE.md) | Publishing the PWA on Google Play as a Trusted Web Activity |
| [WHATSAPP.md](WHATSAPP.md) | Setting up WhatsApp alerts end to end |
| [../OPERATIONS.md](../OPERATIONS.md) | Production checklist, monitoring, backups, incident playbook |

## What is built and what is yours to do

| Built in the product (this repo) | Needs you |
|---|---|
| Class-list CSV import with automatic approval for listed emails | Paid hosting plans; domain; DNS (SPF/DKIM for email) |
| Teachers asking to administer their college; the platform admin approves in the console | A Background Worker service on Render (WhatsApp, retention) |
| Attendance and gradebook CSV downloads for teachers | Resend account and verified sender domain |
| Online payments (Razorpay) plus manual payment records, renewals list, seat use | Razorpay account and webhook; a GST invoicing process |
| WhatsApp alerts with explicit opt-in (`WHATSAPP.md`) | Meta business verification and an approved message template |
| Audio-only recording by default; recording notice before a student speaks; retention; data export and erasure | A lawyer-reviewed privacy notice and retention periods |
| College-scoped course catalogue; right-to-left layout for Arabic and Urdu | Native-speaker review of the translations |
| Load-test kit (`ops/loadtest/`) | Running it against staging, and acting on the result |
| Per-college usage scorecard in the admin console | Sentry project; uptime monitor; backup bucket and secrets |
| In-app notifications (class live, new assignment, graded, notes ready) | Choosing 2-3 pilot colleges; signing pilot letters |
| Resend email provider (EmailJS still works as a fallback) | Lawyer review of the legal drafts; a named grievance officer |
| Error tracking hook, CI, nightly backup workflow, runbook | Google Play developer account; Razorpay account |
| Cross-site request refusal, short-lived LiveKit tokens, draft-lesson privacy, summary-job ownership checks (from the security audit) | Real-device tests on the networks your colleges actually use |

## Calendar

| Weeks (Mon start) | Theme | Done when |
|---|---|---|
| 1-2 (26 Oct - 8 Nov) | **Make it dependable.** Paid plans, Resend, Sentry, uptime, backups + one restore drill, `FORWARDED_ALLOW_IPS` verified, CI green | Section 1 of OPERATIONS.md fully ticked |
| 3-4 (9 - 22 Nov) | **Pilot prep.** Pick 2-3 colleges, sign pilot letters, import their class lists, train 3-5 champion teachers, record a 3-minute Telugu/Hindi walkthrough | Each pilot college has a college admin, a class list, and 3 teachers trained |
| 5-8 (23 Nov - 20 Dec) | **Pilot, exam-season edition.** Recorded lessons, assignments, revision material, and one live class per week. Fix what teachers hit | 60% of invited teachers used it in 2 of the last 3 weeks |
| 9-10 (21 Dec - 3 Jan) | **Hardening + pricing.** Run the capacity test, re-run the security audit (standard), set final price, write 2 case studies | No S1/S2 issues open; two written case studies |
| 11-14 (4 Jan - 31 Jan) | **Semester start push.** Onboard pilots to the new term, run 20+ demos, start paid contracts, publish the Play Store listing | 3+ colleges signed or verbally committed |
| 15-17 (1 - 21 Feb) | **Launch prep.** Website, pricing page, press/partner outreach, support rota, final rehearsal | Launch checklist in MARKETING.md ticked |
| 18 (22 - 28 Feb) | **Launch week** | Public announcement; first 10 demos booked |

If a pilot slips, protect the order: dependable first, pilots second, polish last. A launch with two real colleges using it daily beats a launch with ten features and no users.

## Honest risks

- **Academic calendar.** November and December are exam months; do not promise live-class volume from pilots. Their value then is recorded lessons, assignments and trust.
- **Decision speed.** Indian colleges buy through principals and management committees; budget one to three months per contract. Pilots in parallel, not in sequence.
- **Cost surprises.** Live video is the expensive part. Keep recording audio-first and watch the usage table weekly.
- **Support load.** Teachers, not students, generate most support. A WhatsApp support line staffed in college hours is worth more than a help centre.
- **Everything marked "assumption" in the cost model is untested.** The pilots exist partly to replace those assumptions with measurements.
