# Pricing and sales

These prices and conversion numbers are starting hypotheses, not market data. Test them in the first twenty college conversations and change them.

## 1. Pricing logic

**What it costs you.** From `docs/INFRASTRUCTURE_COST_MODEL.md` (balanced hybrid use): about ₹140-200 of infrastructure per active user per year at 1,000-5,000 users, ranging from roughly ₹50 (recorded-first) to over ₹800 (live-heavy). Live video minutes dominate. Measure real cost per active student during pilots.

**Charge per student per year, teachers free**, with a college minimum:

| Plan | Price (indicative) | Includes |
|---|---|---|
| Pilot | Free for one semester | Everything below, hands-on setup and support |
| Standard | ₹300-400 per enrolled student per year, minimum ₹60,000 per college | Live and recorded classes, assignments, AI notes with teacher review, reports, class-list import, WhatsApp support in college hours |
| Plus | ₹450-550 per student per year | Standard + audio-first recording defaults tuned, priority support, a quarterly usage review with the principal, custom branding on the login page |

Notes:
- Price on **enrolled** students, not on active ones: it is simpler to sell and easier for a bursar to budget. Include a fair-use clause on live hours (for example 20 live hours per student per year) and offer a top-up, because live minutes are your cost.
- At ₹350 per student and ₹170 cost, gross margin is roughly 50%. Support time is the hidden cost; price it in.
- Sell annually, invoiced per term. Offer a 10% discount for a two-year commitment; never discount to zero (free pilots are the only free thing).
- Public schemes and grants may fund colleges directly; keep a GST invoice and a one-page compliance note ready.

## 2. The pitch (30 seconds)

> "Your teachers already run classes on WhatsApp and Zoom, and your students in the villages drop off when the internet does. LanternED is the classroom that keeps working: live classes that fall back to audio, recorded lessons they can download, assignments they can write offline, and notes in their own language. Your teachers upload a class list, and you see attendance and marks on one screen."

Proof points to use only if true on the day: number of colleges, teacher usage, one named champion quote, a measured number (for example "students attended X% of live classes").

## 3. The five-minute demo

Prepare a demo college with a teacher, three students, one recorded class and one published assignment.

1. **Slow network (60 s).** In Chrome DevTools set "Slow 3G", join a live class, switch to audio-only. Say: "This is what a village connection looks like."
2. **Offline (60 s).** Download a lesson, go offline, open it; write an assignment, reconnect, watch it sync.
3. **Teacher time saved (60 s).** Download attendance and the gradebook as CSV. "This is your monthly report."
4. **Language (30 s).** Switch to Telugu/Hindi.
5. **AI notes (60 s).** Open an approved summary: "The teacher reviews it before students see it."
6. **Onboarding (30 s).** Show the class-list upload: "Your whole college in one file."

End with a single ask: "Which branch would you like to start with next week?"

## 4. Buyers and what each cares about

| Role | Wants | Show them |
|---|---|---|
| Principal / director | Results, reputation, not being blamed for a failed tool | Usage numbers, other colleges' quotes, the pilot letter |
| HoD | Fewer attendance and marks chores | Attendance and gradebook CSVs |
| Teacher | Not to be embarrassed in class; works on their phone | Teacher walkthrough, WhatsApp support |
| Management / trustee | Cost and compliance | One-page pricing, privacy notice, data location |
| IT in-charge | Security and data | Security summary and backup/restore routine (OPERATIONS.md) |

## 5. Objections

| They say | You say |
|---|---|
| "We use Google Classroom / Teams." | "Keep them for documents. Use LanternED for the class itself on weak connections: audio fallback, downloads, offline assignments. Does your Classroom work when a student has 30 kbps?" |
| "Students won't install anything." | "It is a web app. They add it to the home screen; it also comes from Google Play." |
| "Is the student data safe?" | Show the privacy notice, the audit log, and the backup routine; say where data is stored and who the processors are. |
| "What if the internet is down for the teacher?" | "Recorded lessons and downloads keep students working; live classes recover when the connection returns." Be honest that a live class needs the teacher online. |
| "Too expensive." | "Per student per year it costs less than a recharge. What does a missed semester cost?" Then offer the pilot. |
| "Our management decides slowly." | "Start the pilot with one branch while they decide." |

## 6. Funnel targets (to be replaced with measured numbers)

Assume roughly 60 demos, leading to 15 pilots or trials, leading to 6-8 paid colleges in the first six months. If demos are not turning into pilots, the pitch is wrong; if pilots are not turning into payments, the numbers or the champion are.

## 7. One-page proposal (template)

- Title: "LanternED for <College name>, <term>"
- Their problem in their words (one sentence from your discovery call)
- What they will have by week 4 (three bullets from the pilot results)
- Price: plan, number of students, annual cost, per-term invoices, GST
- Support: hours, channel, named contact
- Data: where it is stored, the privacy notice, how to export or delete
- Next step with a date and a signature line
