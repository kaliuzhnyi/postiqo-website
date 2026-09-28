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
  // Preserve links to detailed sections that used to live on the homepage.
  if (location.pathname === '/' || location.pathname === '/index.html') {
    const moved = new Set(['savings', 'features', 'features-cards', 'dealer-tools', 'description-templates', 'price-sheets', 'clients']);
    const followLegacyLink = () => {
      if (moved.has(location.hash.slice(1))) location.replace('/products/postiqo-publisher/' + location.hash);
    };
    followLegacyLink();
    window.addEventListener('hashchange', followLegacyLink);
  }
})();
