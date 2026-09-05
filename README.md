# postiqo-website

## Getting started and trial requests

- `/try/` guides visitors through downloading, exploring the app, and requesting a trial.
- `/download/` provides the current Windows installer and links back to the setup guide.
- The homepage links to **Try Postiqo** from the navigation, hero, demo section, and footer.

Demo and trial forms use the existing Formspree endpoint `https://formspree.io/f/xvgeqgdd` and the shared handler in `assets/js/request-form.js`. Trial emails have the subject **New Postiqo trial request** and include name, dealership, website, email, phone, Facebook account, and optional notes.

With JavaScript enabled, the Facebook field accepts a numeric ID, username, or personal profile URL and sends `facebook_user_id` plus a normalized `facebook_profile_url`. Numeric IDs remain strings. Usernames are preserved as usernames; the site does not look up numeric IDs. The `/me` shortcut itself is rejected because it does not identify an account. Without JavaScript, the required fields still apply and Formspree receives the Facebook value as entered.

Trial activation is manual. After adding the requested account to the license, email the customer to confirm access. The website only collects the request and tells the customer to wait for that email before signing in through Postiqo and running a flow.

### Adding the setup video

Replace the commented `.try-video-placeholder` figure in `try/index.html` with the finished setup video. Use a native `<video controls preload="metadata">` or an iframe with a descriptive title. Provide captions for spoken instructions and keep the setup checklist available.

### Local preview

Serve the repository root with any static HTTP server, then open `/try/`. No build step is required. Test form submissions with a local mock endpoint to avoid sending test email to the live Formspree inbox.

#### Website template
https://bootstrapmade.com/ilanding-bootstrap-landing-page-template/
