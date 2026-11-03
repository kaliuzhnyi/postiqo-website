(() => {
  let active = null, pinned = false, closing;
  function close() {
    clearTimeout(closing);
    if (!active) return;
    active.querySelector('.help-toggle').setAttribute('aria-expanded', 'false');
    active.querySelector('.help-popover').hidden = true; active = null; pinned = false;
  }
  function position() {
    if (!active) return;
    const button = active.querySelector('button'), tip = active.querySelector('.help-popover');
    if (!button.getClientRects().length) return close();
    const box = button.getBoundingClientRect();
    tip.style.width = Math.min(340, innerWidth - 32) + 'px';
    tip.style.left = Math.max(16, Math.min(box.left - 15, innerWidth - tip.offsetWidth - 16)) + 'px';
    const height = tip.offsetHeight;
    tip.style.top = (box.bottom + height + 12 > innerHeight && box.top > height + 12 ? box.top - height - 8 : Math.min(box.bottom + 8, Math.max(8, innerHeight - height - 8))) + 'px';
  }
  function show(wrapper) {
    clearTimeout(closing);
    if (active !== wrapper) { close(); active = wrapper; }
    active.querySelector('.help-popover').hidden = false;
    active.querySelector('.help-toggle').setAttribute('aria-expanded', 'true'); position();
  }
  document.querySelectorAll('.field-help').forEach(wrapper => {
    const button = wrapper.querySelector('button');
    wrapper.addEventListener('pointerenter', event => { if (event.pointerType === 'mouse') show(wrapper); });
    wrapper.addEventListener('pointerleave', () => {
      if (!pinned) closing = setTimeout(() => { if (active === wrapper && document.activeElement !== button) close(); }, 100);
    });
    button.addEventListener('focus', () => show(wrapper));
    button.addEventListener('blur', () => { if (!pinned && active === wrapper && !wrapper.matches(':hover')) close(); });
    button.addEventListener('click', () => { if (active === wrapper && pinned) close(); else { show(wrapper); pinned = true; } });
  });
  document.addEventListener('pointerdown', event => { if (active && !active.contains(event.target)) close(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
  document.addEventListener('tool-help-close', close);
  addEventListener('resize', position);
  addEventListener('scroll', position, true);
})();
