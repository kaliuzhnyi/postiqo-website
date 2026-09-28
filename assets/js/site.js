(() => {
  'use strict';
  document.documentElement.classList.add('site-enhanced');
  const header = document.querySelector('.site-header');
  const toggle = document.querySelector('.site-menu-toggle');
  const products = document.querySelector('.site-products');
  function closeMenu() {
    header?.classList.remove('nav-open');
    toggle?.setAttribute('aria-expanded', 'false');
    toggle?.setAttribute('aria-label', 'Open navigation');
  }
  toggle?.addEventListener('click', () => {
    const open = header.classList.toggle('nav-open');
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
  });
  document.querySelectorAll('.site-nav a').forEach(link => link.addEventListener('click', closeMenu));
  document.addEventListener('click', event => {
    if (!products?.contains(event.target) && products) products.open = false;
    if (!header?.contains(event.target)) closeMenu();
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (products?.open) {
      products.open = false;
      products.querySelector('summary').focus();
    } else if (header?.classList.contains('nav-open')) {
      closeMenu();
      toggle.focus();
    }
  });
  // A pointer click can blur the summary before the link receives focus.
  // Close only after focus reaches another element, so the link stays clickable.
  document.addEventListener('focusin', event => {
    if (!header?.contains(event.target)) {
      closeMenu();
      if (products) products.open = false;
    }
  });
  // Homepage enquiry context and links to sections moved to Publisher.
  if (location.pathname === '/' || location.pathname === '/index.html') {
    // Website enquiries reuse the existing contact form and its protected endpoint.
    // Only known product/intent values select copy; URL content is never inserted.
    const params = new URLSearchParams(location.search);
    const request = params.get('request');
    const form = document.querySelector('#contact-form');
    if (form && params.get('product') === 'website' && ['quote', 'demo'].includes(request)) {
      const quote = request === 'quote';
      const message = form.querySelector('[name="message"]');
      form.dataset.requestContext = quote ? 'Postiqo Website quote request' : 'Postiqo Website demo request';
      document.querySelector('[data-contact-title]').textContent = quote ? 'Request a Website quote.' : 'Book a Website demo.';
      document.querySelector('[data-contact-intro]').textContent = quote
        ? 'Tell us which DMS or inventory source you use and what you want to improve. We will review the integration and get back to you with the next steps.'
        : 'Tell us which DMS or inventory source you use. We will contact you to arrange a Website demo and discuss your setup.';
      document.querySelector('label[for="contact-message"]').textContent = 'Your DMS and website goals';
      message.placeholder = 'Your DMS / inventory source, the website you have today, and what you would like to improve.';
      message.maxLength -= form.dataset.requestContext.length + 2;
      if (!message.value.trim()) {
        message.defaultValue = 'DMS / inventory source: \nWhat I would like to improve: ';
        message.value = message.defaultValue;
      }
      form.querySelector('button[type="submit"]').textContent = quote ? 'Request a Quote' : 'Request a Demo';
    }
    // Preserve links to detailed sections that used to live on the homepage.
    const moved = new Set(['savings', 'features', 'features-cards', 'dealer-tools', 'description-templates', 'price-sheets', 'clients']);
    const followLegacyLink = () => {
      if (moved.has(location.hash.slice(1))) location.replace('/products/postiqo-publisher/' + location.hash);
    };
    followLegacyLink();
    window.addEventListener('hashchange', followLegacyLink);
  }
})();
