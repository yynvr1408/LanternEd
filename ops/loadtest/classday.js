// k6 scenario: a class day on STAGING. Never point this at production.
//
//   k6 run -e BASE_URL=https://staging-api.example.com -e USERS_CSV=users.csv \
//          -e VUS=300 -e DURATION=10m -e CLASS_ID=<live class id> ops/loadtest/classday.js
//
// Each virtual user signs in once (cookie session, like the browser), then loops the way a student's open app does:
// the 15 s health heartbeat, a dashboard refresh, notifications, and one join-token request (set CLASS_ID to a live
// class on a staging LiveKit project to include it; leave it out to test the API alone).
//
// Thresholds mirror docs/CAPACITY_TEST_PLAN.md; adjust them there first, then here.
import http from 'k6/http'
import { check, group, sleep } from 'k6'
import { SharedArray } from 'k6/data'
import { Rate } from 'k6/metrics'

const BASE = (__ENV.BASE_URL || '').replace(/\/$/, '')
if (!BASE) throw new Error('Set -e BASE_URL=https://your-staging-api')
if (/lanterned|edu-village|onrender\.com/.test(BASE) && !__ENV.I_KNOW_THIS_IS_STAGING) {
  throw new Error('BASE_URL looks like a production host. Set -e I_KNOW_THIS_IS_STAGING=1 only for a staging host.')
}

const API = `${BASE}/api/v1`
const CLASS_ID = __ENV.CLASS_ID || ''

const users = new SharedArray('users', () => {
  const rows = open(__ENV.USERS_CSV || 'users.csv').trim().split('\n').slice(1)
  return rows.map((line) => {
    const [email, password] = line.split(',')
    return { email, password }
  })
})

const failedChecks = new Rate('failed_checks')

export const options = {
  scenarios: {
    class_day: {
      executor: 'ramping-vus',
      stages: [
        { duration: '2m', target: Number(__ENV.VUS || 100) }, // students arriving
        { duration: __ENV.DURATION || '8m', target: Number(__ENV.VUS || 100) }, // everyone in class
        { duration: '1m', target: 0 },
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1500'],
    'http_req_duration{name:login}': ['p(95)<3000'], // argon2 on purpose: login is the first CPU limit
    failed_checks: ['rate<0.01'],
  },
}

export default function () {
  const user = users[(__VU - 1) % users.length]
  const jar = http.cookieJar()

  group('sign in', () => {
    const res = http.post(`${API}/auth/login`, JSON.stringify({ email: user.email, password: user.password }), {
      headers: { 'Content-Type': 'application/json' },
      tags: { name: 'login' },
    })
    const ok = check(res, { 'login 200': (r) => r.status === 200 })
    failedChecks.add(!ok)
    if (!ok) {
      sleep(5)
      return
    }
  })

  let joined = false
  for (let minute = 0; minute < 10; minute++) {
    // the frontend heartbeat: every 15 s while the app is open
    for (let beat = 0; beat < 4; beat++) {
      const res = http.get(`${BASE}/health`, { tags: { name: 'health' } })
      failedChecks.add(!check(res, { 'health 200': (r) => r.status === 200 }))
      sleep(15)
    }

    group('dashboard refresh', () => {
      for (const path of ['/users/me', '/courses', '/assignments', '/notifications?limit=20']) {
        const res = http.get(`${API}${path}`, { tags: { name: path.split('?')[0] } })
        failedChecks.add(!check(res, { [`${path} 200`]: (r) => r.status === 200 }))
      }
    })

    if (CLASS_ID && !joined) {
      joined = true
      const res = http.post(`${API}/classes/${CLASS_ID}/join-token`, null, { tags: { name: 'join-token' } })
      failedChecks.add(!check(res, { 'join-token 200': (r) => r.status === 200 }))
    }
  }

  jar.clear(BASE)
}
