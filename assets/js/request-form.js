(() => {
  "use strict";

  // Both requests use the site's existing Formspree inbox. Trial activation is manual.
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
        const response = await fetch(form.action, {
          method: form.method,
          body: payload,
          headers: { Accept: "application/json" },
          credentials: "omit",
          signal: controller.signal
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          const messages = Array.isArray(data.errors)
            ? data.errors.map(item => item.message).filter(message => typeof message === "string")
            : [];
          throw new Error(response.status === 429
            ? "Too many requests. Please wait a few minutes and try again."
            : messages.join(" ") || (typeof data.error === "string" && data.error) || "Your request could not be sent. Please try again or email support@postiqo.io.");
        }

        form.reset();
        success.style.display = "block";
        success.focus();
      } catch (failure) {
        error.textContent = failure.name === "AbortError"
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
      }
    });
  });
})();
