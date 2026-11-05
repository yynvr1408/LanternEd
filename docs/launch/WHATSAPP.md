# WhatsApp notifications

LanternEd can message students and teachers on WhatsApp when a class goes live, a new assignment is posted, work is graded, or class notes are approved. It is off until you configure it, and nobody is messaged unless they add their number **and** tick the consent box on their profile.

SMS is not built: sending SMS in India needs sender and template registration (DLT) with your telecom provider, which is a business process first.

## 1. Set up the Meta side (you do this once)

1. Create a Meta Business account and a **WhatsApp Business** app in the Meta developer console; add a phone number you control and complete business verification.
2. Create a **message template** (Meta must approve it before you can message anyone first):
   - Name: `lanterned_update` (or change `WHATSAPP_TEMPLATE_NAME`)
   - Category: **Utility**
   - Language: English (`en`). Create the same template in Telugu (`te`) and Hindi (`hi`) if you want to send in those; the current setting sends one language per installation.
   - Body (exactly two variables):
     `LanternEd: {{1}}. {{2}}`
   - Sample for review: `LanternEd: Class is live: Physics. Tap to join now.`
3. Create a **permanent access token** (a System User token with `whatsapp_business_messaging`) and note the **Phone number ID**.

## 2. Configure LanternEd

Set these on the API **and the worker** (messages are sent by the worker, not during the request):

```
WHATSAPP_PHONE_NUMBER_ID=<phone number id>
WHATSAPP_ACCESS_TOKEN=<system user token>
WHATSAPP_TEMPLATE_NAME=lanterned_update
WHATSAPP_TEMPLATE_LANGUAGE=en
```

Make sure the worker is running (`python -m app.worker`); on Render that means a separate worker service, because the free web service does not run it. Without the worker, messages queue but are never delivered.

## 3. How it behaves

- A person adds their number in international format (for example `+919876543210`) on their **Profile**, ticks the consent line, and saves. Un-ticking, or removing the number, stops messages immediately, including ones already queued.
- Each notification creates an outbox row per opted-in person; the worker sends up to 50 per pass. A temporary failure is retried up to 3 times; a rejected number or unapproved template is marked failed and not retried.
- The number is personal data: it is exported with the person's data, removed when they erase their account, and never written to logs.
- Meta limits how many people you may message per day until your business is verified and your quality rating grows. Start with pilots, not a whole university at once.

## 4. Checking it works

1. Opt in with your own number on a staging account.
2. Publish an assignment in a course that account is enrolled in.
3. Within a worker pass (about 5 seconds) you should receive the template message. If not, look at the worker log for `WhatsApp rejected a message (status=...)`: `400` usually means the template is not approved or the variables do not match; `401/403` means the token or permissions.
