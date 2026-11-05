# Publishing LanternED on Google Play (Trusted Web Activity)

LanternED is already an installable PWA (`vite-plugin-pwa`). A Trusted Web Activity (TWA) wraps it in a thin Android app so students can find it on Google Play without a second codebase. Most of the work is accounts and assets, not code.

## 1. What you need

- A Google Play developer account (one-time fee; identity verification can take days: start now).
- The production frontend on a domain you control, over HTTPS (not a `*.vercel.app` preview URL if you can avoid it).
- The PWA must pass the installability checks: valid manifest, icons including a 512x512 and a maskable icon, a service worker, and a start URL that works offline.
- Node 18+ and Java 17+ on your machine for the build tool.

## 2. Build the Android bundle

```sh
npm i -g @bubblewrap/cli
bubblewrap init --manifest=https://YOUR-DOMAIN/manifest.webmanifest
# answer the prompts: package id (e.g. in.yourcompany.lanterned), app name, signing key (keep it SAFE and backed up)
bubblewrap build
```

This produces `app-release-bundle.aab` for Play and an `.apk` for testing on your own phone.

## 3. Link the app to your domain (so the address bar disappears)

1. Bubblewrap prints the SHA-256 fingerprint of your signing key (Play App Signing gives you a second one in the Play Console under App integrity; use both).
2. Serve `https://YOUR-DOMAIN/.well-known/assetlinks.json`:

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "in.yourcompany.lanterned",
    "sha256_cert_fingerprints": ["AA:BB:...your upload key...", "CC:DD:...Play signing key..."]
  }
}]
```

On Vercel, put the file in `frontend/public/.well-known/assetlinks.json` and make sure the SPA rewrite in `vercel.json` does not swallow it.

## 4. Store listing checklist

- [ ] Title and short description in English and Telugu/Hindi; lead with "works on weak internet"
- [ ] 512x512 icon, 1024x500 feature graphic, 4-8 phone screenshots (slow-network audio mode, downloads, assignment, language switcher)
- [ ] Privacy policy URL (from `LEGAL_AND_PRIVACY.md`, hosted on your site)
- [ ] Data safety form answered truthfully: name and email collected, data encrypted in transit, deletion on request
- [ ] Content rating questionnaire (education, user-generated content in classes)
- [ ] Target audience: choose carefully. Declaring an audience that includes children triggers extra Play requirements; colleges target 17+, which is usually the simplest declaration
- [ ] Internal testing track with ten real students on low-end Android phones before production

## 5. Things that go wrong

- A `*.vercel.app` URL changes between deployments; use your own domain.
- Camera and microphone permissions for live classes are requested by the browser engine inside the TWA; test them on a real device.
- Storage: downloaded lessons live in the browser's storage and can be cleared by the user or the OS on very low-storage phones. Keep the storage meter and warnings visible.
- Play review can take several days: submit at least two weeks before launch.
