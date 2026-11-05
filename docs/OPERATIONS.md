# Operations runbook

What to set up before the first real college, and what to do when something breaks. Everything here is checkable: if a step says "confirm", you can confirm it in a dashboard or with a command.

## 1. Production checklist (do before the first pilot)

| Area | Do this | Why |
|---|---|---|
| Hosting plans | Render **Standard** (not Free), Neon **Launch**, LiveKit **Ship**, Vercel **Pro** | Free tiers sleep, suspend or forbid commercial use. See `docs/INFRASTRUCTURE_COST_MODEL.md` |
| Secrets | `SESSION_SECRET` long and random (the API refuses to start in production with the dev default or under 16 characters); `ADMIN_USERNAME` not a guessable word; strong `ADMIN_PASSWORD` | Admin login is rate limited, but a strong password and non-obvious username are the real defence |
| `FRONTEND_ORIGIN` | Exactly the deployed frontend origin, with `https://` and no trailing slash | CORS and the cross-site request check both use it |
| Cookies | Split Vercel + Render hosting needs `SESSION_COOKIE_SAMESITE=none`. Prefer one registrable domain (`app.example.in` + `api.example.in`) and `lax` | `none` depends on third-party cookies, which browsers are phasing out |
| Client IPs | Set `FORWARDED_ALLOW_IPS` (see `.env.example`). **Verify** from two networks that the rate-limit key differs | Otherwise every user shares one OTP/reset bucket |
| Email | Set `RESEND_API_KEY` and `EMAIL_FROM` (verified domain, with SPF/DKIM) | EmailJS free is 200 emails a month; one college's sign-up day exceeds that |
| Error tracking | Set `SENTRY_DSN`; add alerts for new issues and 5xx spikes | You learn about breakage before a teacher calls |
| Backups | Run the nightly backup workflow (section 4) and **do one restore drill** | A backup you have never restored is a hope, not a backup |
| Uptime | Monitor `GET /health` and `GET /ready` from outside (UptimeRobot / Better Stack), alert by WhatsApp or SMS | `/ready` also checks the database |
| Worker | Run `python -m app.worker` as a separate service (Render: a paid Background Worker) | It delivers WhatsApp messages, enforces recording retention, prunes old rows and recovers stuck AI jobs. Without it those silently do nothing |
| Catalogue scope | `COURSE_CATALOG_SCOPE=college` when several colleges share the API (already set in `render.yaml`) | Otherwise a student of one college can see and join another college's published courses |
| Online payments | Optional: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`; add a Razorpay webhook to `POST /api/v1/webhooks/razorpay` for `payment.captured` and `order.paid` | Colleges can pay online; the subscription extends only on Razorpay's signed webhook. Manual payment recording works without it |
| WhatsApp | Optional: see `docs/launch/WHATSAPP.md` | Needs a Meta-approved template and the worker |
| Retention | Choose `RECORDING_RETENTION_DAYS` with the privacy notice (empty = keep forever) | Recording media is the largest personal-data store; the worker deletes expired media and keeps metadata, transcripts and approved summaries |
| Docs endpoints | Nothing to do: `/docs`, `/redoc` and `/openapi.json` are off when `APP_ENV=production` | Keeps the API map private |
| Cost guards | LiveKit and Groq spend alerts at 50% / 80% / 100% of the monthly budget | Live minutes are the main cost driver |

## 2. Monitoring and alerts

| Signal | Threshold | First action |
|---|---|---|
| `/health` or `/ready` fails | 2 checks in a row | Section 6 incident steps |
| 5xx rate | > 2% for 5 min | Open Sentry, look at the newest issue |
| API p95 latency | > 2 s for 10 min | Check Render CPU/memory and Neon connections |
| Neon storage | > 70% of plan | Prune old data or upgrade |
| LiveKit usage | > 80% of included minutes | Tell colleges to default classes to audio-only; upgrade plan |
| Backup job | any failure or no run in 26 h | Run it by hand: `ops/pg_backup.sh` |
| Failed logins / `RATE_LIMITED` spike | sudden jump | Check the audit log; a shared-IP bucket would look like this |

Platform usage per college (classes held, students attending, live minutes, submissions) is on the admin console. Review it weekly during pilots.

## 3. Releases and migrations

1. Open a pull request. CI (`.github/workflows/ci.yml`) runs backend tests, frontend lint, tests and build, a single-Alembic-head check, and dependency audits. Merge only when green.
2. Migrations run automatically when the API container starts (`alembic upgrade head`) and are idempotent.
3. **Rollback:** redeploy the previous image. Migrations are additive in this project; if one must be reverted, run `alembic downgrade -1` against a restored copy first.
4. Never release during a college's live-class hours. Release windows: weekdays 06:00-08:00 IST or Sunday.

## 4. Backups and restore

- **Neon** gives point-in-time restore (6 h on Free, 7 days on Launch, 30 days on Scale). Use it for "undo the last hour".
- **Nightly dump:** `.github/workflows/backup.yml` runs `ops/pg_backup.sh` at 02:00 IST, uploads a gzipped `pg_dump` to a **separate** R2 bucket and prunes dumps older than 30 days. Set these repository secrets: `BACKUP_DATABASE_URL`, `BACKUP_BUCKET`, `BACKUP_ENDPOINT`, `BACKUP_ACCESS_KEY_ID`, `BACKUP_SECRET_ACCESS_KEY`. Use credentials limited to the backup bucket.
- **Recordings and uploads** live in R2. Turn on object versioning or a lifecycle rule for the recordings bucket; the database dump does not contain them.

### Restore drill (monthly, 15 minutes)

```sh
# 1. fetch the latest dump
aws s3 ls s3://$BACKUP_BUCKET/db/ --endpoint-url $BACKUP_ENDPOINT | tail -1
aws s3 cp s3://$BACKUP_BUCKET/db/lanterned-<stamp>.sql.gz . --endpoint-url $BACKUP_ENDPOINT

# 2. restore into a scratch database, never straight over production
createdb lanterned_restore
gunzip -c lanterned-<stamp>.sql.gz | psql lanterned_restore

# 3. sanity checks
psql lanterned_restore -c "select count(*) from users;"
psql lanterned_restore -c "select max(created_at) from audit_events;"
```

Record the date, the dump used, and the row counts in your ops log. If a check fails, treat it as an incident (section 6).

## 5. Capacity and cost levers

- **Cost follows live participant-minutes, not registered users.** The biggest levers, in order: audio-only recording (Class setting; roadmap item to make it the default), shorter retention for recordings, per-college AI usage limits.
- Run `docs/CAPACITY_TEST_PLAN.md` against staging before the first 1,000-student college. Until you have, treat the cost model's capacity figures as assumptions.
- Run `ops/loadtest/` (k6) against staging before the first 1,000-student college; it has not been run yet, so these are still estimates.
- The frontend pings `/health` every 15 seconds per open tab. At 1,000 concurrent users that is about 67 requests/second of pure heartbeat; if it shows up in latency, lengthen the interval first.

## 5b. Personal-data requests (built in)

- **Export:** a signed-in person can download everything held about them from their profile (`GET /api/v1/users/me/export`).
- **Erasure:** from their profile (`POST /api/v1/users/me/erase`, needs their password and the word DELETE). It anonymises the account (name, email, password), removes their answers, files, notifications, WhatsApp number and sessions, and keeps marks as bare numbers. A teacher who owns courses, or a college administrator, must hand those over first (the API says which).
- A request from someone who can no longer sign in is handled by the platform administrator removing the member, then doing the steps in `docs/launch/LEGAL_AND_PRIVACY.md` section 4.

## 6. Incident playbook

**Severity:** S1 = nobody can sign in or join class; S2 = one feature down (recordings, summaries, email); S3 = degraded or cosmetic.

1. **Acknowledge** within 15 minutes during college hours. Post one line to the affected college admins: what is broken, since when, next update time.
2. **Triage:** Render status/logs, Neon status, LiveKit status, Sentry newest issue, recent deploy. Roll back the last deploy first if it is within the last hour.
3. **Mitigate before fixing:** rolling back beats debugging live. Tell teachers the offline route: students can still read downloaded material and write assignments; work syncs when the service returns.
4. **Resolve and write it down** within 48 hours: timeline, cause, what you will change. Share it with the affected colleges. Colleges forgive outages; they do not forgive silence.
5. **Personal data incident** (leaked backup, stolen credential, wrong access): follow `docs/launch/LEGAL_AND_PRIVACY.md` section 5; the breach-notification clock starts when you become aware.

## 7. Security routine

- Review `pip-audit` / `npm audit` output from CI weekly; patch high severity within 7 days.
- Rotate `SESSION_SECRET` only with a planned logout of all users (it also keys OTP hashes), and rotate the admin password after any staff change.
- Re-run the security audit (`security-audit-skill`, standard profile) before each major release. The first run (quick profile) left eight areas unreviewed; see its report.
