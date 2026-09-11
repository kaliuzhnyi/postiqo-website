# postiqo-website

## Getting started and trial requests

- `/try/` links directly to the stable Windows installer and guides visitors through importing and previewing inventory for free, then requesting a 7-day publishing trial in the app.
- `/download/` provides the current Windows installer and links back to the setup guide.
- **Try Postiqo** is the primary action in the homepage header, hero, both pricing cards, and final call to action. Live demos remain optional setup help.

The primary trial request lives in Postiqo Publisher. Customers first sign in to Facebook in the app, which includes the account automatically. The dealership website is required and can be edited after being filled from the inventory source settings. Importing and reviewing vehicles needs neither a license nor Facebook sign-in. Publishing still requires an active license.

The collapsed website trial form is an optional fallback. It sends to `https://licensing.postiqo.io/v1/public/trial-requests`, which stores requests in the same Cloudflare D1 queue as the desktop and exposes them at `https://admin.postiqo.io/#trials`. Demo requests retain the existing Formspree endpoint. Both use the shared handler in `assets/js/request-form.js`.

Opening the website form loads the public Turnstile configuration and a managed verification widget. Submission requires server-side token verification, an allowed website Origin and an IP rate limit. The Worker fixes the source to `website`, applies the one-trial-per-account rule and schedules one administrator notification for a new request. No desktop token, Turnstile secret, admin credential or AI key is embedded in this site. A failed notification does not discard the saved request. Turnstile limits automated abuse; it does not verify ownership of a typed Facebook account, so trial activation stays manual.

With JavaScript enabled, the Facebook field accepts a numeric ID, username, or personal profile URL and sends `facebook_user_id` plus a normalized `facebook_profile_url`. Numeric IDs remain strings. Usernames are preserved as usernames; the site does not look up numeric IDs. The `/me` shortcut itself is rejected because it does not identify an account. Website trial requests require JavaScript for verification; visitors can also request a trial directly in the app.

Trial activation is manual. After adding the requested account to the license, email the customer to confirm access. While the app is open, it checks for trial activation and continues the setup guide through the first publication; **Check activation** also refreshes the status on demand. The customer chooses and explicitly publishes one vehicle, then opens its Facebook listing when a link is available. Sending a trial request never starts publication. The 7-day publishing trial starts at activation; importing and previewing inventory remains free.

The setup guide opens for new instances, saves progress, and can be reopened from **Welcome > Open setup guide**. The website checklist follows the same path: inventory source, import, listing preview, Facebook sign-in, trial request, activation, first publication.

GitHub Pages publishes the repository root from `master` without a build step. Publish onboarding copy that names new app controls only after the corresponding stable Windows installer is available.

### Setup video

Step 2 of `/try/` includes the 9:54 English setup tutorial, covering instances, settings, login, and logs. Its responsive YouTube player uses the privacy-enhanced `youtube-nocookie.com` host, loads lazily, supports fullscreen, and requests English captions. The setup checklist and a direct YouTube link remain available alongside the video.

The video ID is `RazuBwVoWag`. When replacing the tutorial, update both the iframe and the direct link in `try/index.html`, upload the English captions to YouTube, and update the duration if needed. Keep `referrerpolicy="strict-origin-when-cross-origin"` on the iframe so YouTube receives the website origin needed to identify the embedded player.

### Local preview

Serve the repository root with any static HTTP server, then open `/try/`. No build step is required. Test form submissions with a local mock endpoint to avoid sending test email to the live Formspree inbox.

#### Website template
https://bootstrapmade.com/ilanding-bootstrap-landing-page-template/
