# Legal and privacy drafts

**These are drafts to give to a lawyer, not legal advice.** India's Digital Personal Data Protection Act, 2023 (DPDP Act) and its rules, plus the IT Act, apply to a product that stores students' personal data. Rules and enforcement dates change; confirm every point with qualified counsel before you rely on any of this.

## 1. Facts to give your lawyer

| Topic | What the product does today |
|---|---|
| Data collected | Name, email, role, college, branch, section, password hash (argon2), sessions, class attendance, submitted work and grades, uploaded files, class recordings, transcripts, AI summaries, audit events |
| Who can see it | Students see their own; teachers see enrolled students; college administrators see their college's members; the platform administrator sees colleges and aggregate usage |
| Processors (where data goes) | Render (API), Neon (database), Cloudflare R2 (files, recordings, backups), LiveKit (live media), Groq (speech-to-text and summaries), Resend or EmailJS (OTP email), Sentry (errors, no request bodies or cookies), Vercel (frontend) |
| Children | Some first-year students may be under 18. DPDP treats a person under 18 as a child and generally requires verifiable parental consent and restricts tracking and behavioural advertising. Decide how your colleges will handle this (for example, the college collects consent at admission) |
| Retention | Not enforced yet. Recordings, transcripts, submissions and audit events are kept until deleted |
| Rights requests | No self-service export or erasure yet; handle by email and by the platform administrator (see section 4) |

## 2. Draft privacy notice (plain language)

> **What LanternED is.** LanternED is a learning platform your college has chosen. Your college decides who may join; LanternED runs the service for them.
>
> **What we collect and why.** Your name, email, college and class, so you can sign in and see the right classes. Your attendance in live classes, your submitted work and your marks, so teachers can run the course. Recordings of live classes, only when your teacher starts a recording, so you can catch up. Text of recordings and a summary written by an AI model and reviewed by your teacher, so you can revise.
>
> **What we do not do.** We do not sell your data, show advertising, or use your work to train AI models. Recordings and transcripts are sent to our speech and language service providers only to produce your class notes.
>
> **Who sees it.** Your teachers, your college administrators, and our support staff when you ask for help. Service providers that store or process data for us are listed below.
>
> **Where it is stored.** <list of processors and countries; fill in from section 1>.
>
> **How long.** Until your college asks us to delete it or you ask us to delete your account, and no longer than <period> after your college stops using LanternED.
>
> **Your rights.** To know what we hold about you, to correct it, to ask for it to be erased, and to complain. Write to <grievance officer name, email, phone>. We reply within <period>. If you are under 18, your parent or guardian can make these requests.
>
> **If something goes wrong.** If your personal data is exposed, we will tell the affected colleges and, where the law requires, the Data Protection Board and you.

## 3. Recording consent text (show before a live class that is recorded)

> This class may be recorded. The recording includes your voice and, if you turn it on, your video, and it will be available to students of this class. Your teacher decides whether it is published. If you do not want to be recorded, tell your teacher before the class; you can listen without speaking.

Product to-do (small, worth doing before launch): show this notice on the join screen when a recording is active and record that the student continued. This is not built yet.

## 4. Handling rights requests until self-service exists

1. Identify the person (the college administrator can confirm).
2. **Access/export:** export the user's rows from the database (user, enrollments, submissions, attendance) and send securely.
3. **Erasure:** removing a member through the college console disables access; permanent deletion of the user, their files and recordings is a manual task today. Log it in the audit trail and delete the matching R2 objects.
4. Record the request, the date, and what was done; keep the record for audit.

## 5. If personal data is exposed

1. Contain it (rotate secrets, revoke sessions, disable the leaking route or bucket policy).
2. Write down what data, whose, since when, how found. Keep logs.
3. Tell the affected colleges the same day; ask counsel whether and when the Data Protection Board and affected people must be notified under the current rules.
4. Publish a short, factual post-incident note.

## 6. Draft terms of service (points to cover)

Who the contract is with (the college vs. each user), acceptable use, content ownership (colleges and students own their content; a licence to host and process it), recording rules, service availability (best effort, no uptime guarantee until you offer an SLA), fees and term, suspension rights, data return on exit, liability cap, governing law and jurisdiction, changes to the terms, contact for grievances.

## 7. Checklist before launch

- [ ] Counsel reviewed the privacy notice, terms and consent text
- [ ] Grievance officer named and published
- [ ] Data-processing terms in place with each processor you can negotiate with; list them in the notice
- [ ] Decision on minors' consent recorded
- [ ] Retention periods chosen and, where possible, enforced (recordings, transcripts, audit events)
- [ ] Rights-request procedure rehearsed once
- [ ] Breach procedure printed and known by two people
- [ ] Privacy notice and terms linked in the app footer and shown at registration
