(() => {
  'use strict';
  const notice = document.querySelector('[data-demo-notice]');
  const messages = {
    call: "On a real card, this opens your phone app with the dealership's number ready to call. This sample dealership is fictional, so no call is placed.",
    email: "On a real card, this opens your email app addressed to the dealership. This sample dealership is fictional, so no email app is opened or message sent.",
  };
  document.querySelectorAll('[data-demo-contact]').forEach(link => {
    link.addEventListener('click', event => {
      event.preventDefault();
      notice.textContent = messages[link.dataset.demoContact];
      const panel = document.querySelector('#demo-contact');
      panel.classList.add('is-active');
      panel.focus({ preventScroll: true });
      panel.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    });
  });
})();
