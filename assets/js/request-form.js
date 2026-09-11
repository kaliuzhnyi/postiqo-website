(() => {
  "use strict";

  // Trial requests use Cloudflare; demo requests retain the existing inbox.
  function facebookAccount(value) {
    const input = value.trim();
    const numericId = /^[1-9]\d{0,29}$/;
    const username = /^(?=.{5,100}$)[a-zA-Z0-9]+(?:\.[a-zA-Z0-9]+)*$/;
    const reservedPaths = new Set([
      "me", "profile", "profile.php", "home", "home.php", "login", "login.php",
      "logout", "settings", "help", "marketplace", "groups", "pages", "people",
      "share", "sharer", "sharer.php", "watch", "reel", "reels", "stories",
      "photo", "photo.php", "photos", "events", "gaming", "friends", "notifications"
    ]);

    function account(identifier) {
      if (numericId.test(identifier)) {
        return { id: identifier, url: `https://www.facebook.com/profile.php?id=${identifier}` };
      }
      if (username.test(identifier) && !/^\d+$/.test(identifier) && !reservedPaths.has(identifier.toLowerCase())) {
        return { id: identifier, url: `https://www.facebook.com/${identifier}` };
      }
      return null;
    }

    if (!/[/:?]/.test(input) && !/facebook\.com/i.test(input)) return account(input);

    try {
      const url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port ||
          !["facebook.com", "www.facebook.com", "m.facebook.com", "mbasic.facebook.com"].includes(url.hostname.toLowerCase())) {
        return null;
      }
      const path = url.pathname.replace(/\/$/, "");
      if (path === "/profile.php") {
        const id = url.searchParams.get("id") || "";
        return numericId.test(id) ? account(id) : null;
      }
      return /^\/[^/]+$/.test(path) ? account(path.slice(1)) : null;
    } catch {
      return null;
    }
  }

  document.querySelectorAll("form[data-postiqo-request]").forEach(form => {
    const loading = form.querySelector(".loading");
    const error = form.querySelector(".error-message");
    const success = form.querySelector(".sent-message");
    const button = form.querySelector('button[type="submit"]');
    const facebook = form.querySelector('[name="facebook_user_id"]');
    const website = form.querySelector('[name="website"]');
    let sending = false;
    const cloudflareTrial = Boolean(form.dataset.trialConfig);
    let trialWidget, trialReady = null;
    async function prepareTrial() {
      if (!cloudflareTrial) return;
      if (trialReady) return trialReady;
      trialReady = (async () => {
        const response = await fetch(form.dataset.trialConfig, {credentials:'omit', signal:AbortSignal.timeout(10000)});
        const config = await response.json();
        if (!response.ok || config.ok !== true || typeof config.site_key !== 'string') throw new Error('Website trial requests are temporarily unavailable. Please request your trial in the Postiqo app.');
        if (!window.turnstile) await new Promise((resolve,reject) => {
          const script = document.createElement('script');
          const fail = () => { script.remove(); reject(new Error('Could not load verification. Check your connection and try again.')); };
          const deadline = setTimeout(fail, 10000);
          script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
          script.async = true;
          script.onload = () => { clearTimeout(deadline); resolve(); };
          script.onerror = () => { clearTimeout(deadline); fail(); };
          document.head.append(script);
        });
        const challenge = document.createElement('div');
        challenge.className = 'try-verification'; button.before(challenge);
        trialWidget = window.turnstile.render(challenge, {sitekey:config.site_key, action:'trial_request', size:'flexible'});
      })().catch(failure => {trialReady=null; throw failure;});
      return trialReady;
    }
    if (cloudflareTrial) {
      const details = form.closest('details');
      const initialize = () => {if (!details || details.open) prepareTrial().catch(failure => {error.textContent=failure.message;error.style.display='block';});};
      details?.addEventListener('toggle',initialize);
      initialize();
    }

    // Keep native validation available if JavaScript is unavailable. With JS,
    // normalize pasted profile URLs and bare dealership domains before validation.
    form.noValidate = true;

    form.addEventListener("input", event => {
      const field = event.target;
      if (typeof field.setCustomValidity !== "function") return;
      field.setCustomValidity("");
      field.removeAttribute("aria-invalid");
      field.classList.remove("is-invalid");
    });

    form.addEventListener("submit", async event => {
      event.preventDefault();
      if (sending) return;

      [loading, error, success].forEach(element => { element.style.display = "none"; });

      form.querySelectorAll("input:not([type='hidden']), textarea").forEach(field => {
        field.value = field.value.trim();
        field.setCustomValidity("");
        if (field.required && !field.value) field.setCustomValidity("Please fill in this field.");
      });

      if (website?.value) {
        try {
          const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(website.value) ? website.value : `https://${website.value}`);
          if (!['http:', 'https:'].includes(url.protocol) || !url.hostname.includes('.') || url.username || url.password) {
            throw new Error("Invalid website");
          }
          website.value = url.href;
        } catch {
          website.setCustomValidity("Enter your dealership website, for example https://yourdealership.com.");
        }
      }

      const account = facebook ? facebookAccount(facebook.value) : null;
      if (facebook?.value && !account) {
        facebook.setCustomValidity("Enter your Facebook ID, username, or full personal profile URL. Open facebook.com/me and copy the address after your profile loads, not the /me link.");
      }

      const valid = form.checkValidity();
      form.querySelectorAll("input, textarea").forEach(field => {
        const invalid = !field.validity.valid;
        field.classList.toggle("is-invalid", invalid);
        if (invalid) field.setAttribute("aria-invalid", "true");
        else field.removeAttribute("aria-invalid");
      });
      if (!valid) {
        form.reportValidity();
        return;
      }

      const payload = new FormData(form);
      if (account) {
        // Keep identifiers as strings to preserve long Facebook IDs exactly.
        payload.set("facebook_user_id", account.id);
        payload.set("facebook_profile_url", account.url);
      }

      sending = true;
      button.disabled = true;
      form.setAttribute("aria-busy", "true");
      loading.style.display = "block";
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);

      try {
        if (cloudflareTrial) {
          await prepareTrial();
          const token = window.turnstile.getResponse(trialWidget);
          if (!token) throw new Error('Please complete the verification below, then send your request.');
          payload.set('turnstile_token',token);
        }
        const response = await fetch(form.action, {
          method: form.method,
          body: cloudflareTrial ? JSON.stringify(Object.fromEntries(payload)) : payload,
          headers: { Accept: "application/json", ...(cloudflareTrial ? {'Content-Type':'application/json'} : {}) },
          credentials: "omit",
          signal: controller.signal
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          if (cloudflareTrial) throw new Error({
            licence_active:'This Facebook account already has active access. Sign in to it in the Postiqo app.',
            trial_already_used:'This Facebook account has already requested a trial. Each account can receive only one trial. Contact support@postiqo.io for help.',
            verification_required:'Please complete verification and try again.',
            verification_failed:'Verification expired or failed. Please try again.',
            rate_limited:'Too many requests. Please wait a minute and try again.',
            validation_error:'Check your contact details, website and Facebook account, then try again.',
            website_trial_disabled:'Website trial requests are temporarily unavailable. Please request your trial in the Postiqo app.',
          }[data.error] || 'Your request could not be sent. Please try again or contact support@postiqo.io.');
          const messages = Array.isArray(data.errors)
            ? data.errors.map(item => item.message).filter(message => typeof message === "string")
            : [];
          throw new Error(response.status === 429
            ? "Too many requests. Please wait a few minutes and try again."
            : messages.join(" ") || (typeof data.error === "string" && data.error) || "Your request could not be sent. Please try again or email support@postiqo.io.");
        }

        if (cloudflareTrial) {
          const data = await response.json();
          if (data.ok !== true) throw new Error('We could not confirm delivery. Please check with support@postiqo.io before sending again.');
        }
        form.reset();
        success.style.display = "block";
        success.focus();
      } catch (failure) {
        error.textContent = ['AbortError', 'TimeoutError'].includes(failure.name)
          ? "We couldn't confirm delivery in time. Your details are still here. Please try again later or email support@postiqo.io."
          : failure instanceof TypeError
            ? "We couldn't confirm delivery. Check your connection and try again, or email support@postiqo.io. Your details are still here."
            : failure.message;
        error.style.display = "block";
        error.focus();
      } finally {
        clearTimeout(timeout);
        sending = false;
        button.disabled = false;
        form.removeAttribute("aria-busy");
        loading.style.display = "none";
        if (cloudflareTrial && trialWidget !== undefined) window.turnstile?.reset(trialWidget);
      }
    });
  });
})();
