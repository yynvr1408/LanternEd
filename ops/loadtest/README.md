# Load testing on staging

Follows `docs/CAPACITY_TEST_PLAN.md`. **Nothing here has been run yet**: no load test result exists, so every capacity figure in the cost model is still an estimate. Run this before the first 1,000-student college.

## What you need
- A **staging** environment that mirrors production (separate Render service, separate Neon project, separate R2 bucket, a LiveKit project used only for tests). Never production.
- [k6](https://k6.io/docs/get-started/installation/) on a machine in the same region as the API, not on the API host.
- Python (the backend's virtualenv) pointed at the staging database.

## Steps
1. Seed synthetic data (refuses `APP_ENV=production`; needs the explicit flag):
   ```sh
   cd backend
   DATABASE_URL=<staging url> python scripts/seed_loadtest.py --students 500 --out ../ops/loadtest/users.csv --i-know-this-is-staging
   ```
   It prints a teacher login and a course id. Seed at least 10x the number of users you plan to simulate at once.
2. (Optional, to include the LiveKit join) sign in as the printed teacher on the staging frontend, create a class in that course, start it, and copy its id.
3. Run:
   ```sh
   k6 run -e BASE_URL=https://staging-api.example.com -e USERS_CSV=ops/loadtest/users.csv \
          -e VUS=100 -e DURATION=8m -e CLASS_ID=<id> ops/loadtest/classday.js
   ```
   Start at 100 virtual users and double (200, 400, ...) until a threshold fails; the last passing level is your **measured capacity** for that instance size.
4. Watch while it runs: Render CPU and memory, Neon connections and compute, LiveKit participants and minutes, Sentry for errors.

## Reading the result
| k6 line | Meaning |
|---|---|
| `http_req_failed` | share of requests that errored; over 1% fails the run |
| `http_req_duration` p(95) | 95th-percentile latency; 1.5 s target |
| `http_req_duration{name:login}` | login is slow on purpose (argon2 hashing); it saturates CPU first |
| `failed_checks` | an unexpected status code (a 429 here means a rate limit tripped: see below) |

- **Rate limits will trip under one IP.** Login is limited per account and per client address, and several endpoints have per-user budgets. A load generator is one address: if you see 429s, raise the staging limits (`_MAX_ATTEMPTS`, the `enforce(...)` budgets) on staging only, and record that you did.
- Record: users simulated, instance size, p95/p99, error rate, CPU, DB connections, and the first thing that broke. Replace the matching assumption in `docs/INFRASTRUCTURE_COST_MODEL.md` and `docs/cost_model.py` with the measured value.
- Delete the seeded data (or the staging database) afterwards, and delete `users.csv`: it holds a shared password.
