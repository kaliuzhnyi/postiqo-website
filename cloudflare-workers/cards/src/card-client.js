(() => {
  'use strict';
  document.querySelector('[data-retry]')?.addEventListener('click', () => location.reload());
  document.querySelectorAll('[data-enhanced]').forEach(element => { element.hidden = false; });
  const track = document.querySelector('.photo-track');
  const dialog = document.querySelector('.lightbox');
  const photos = [...document.querySelectorAll('.slide img')];
  const thumbnails = [...document.querySelectorAll('[data-photo]')];
  let current = 0;

  function photoState(img) {
    const failed = img.complete && img.naturalWidth === 0;
    img.hidden = failed;
    const fallback = img.parentElement.querySelector('.photo-unavailable');
    if (fallback) fallback.hidden = !failed;
  }
  photos.forEach(img => {
    img.addEventListener('error', () => photoState(img));
    img.addEventListener('load', () => photoState(img));
    if (img.complete) photoState(img);
  });

  function lightboxImage() {
    if (!dialog?.open) return;
    const img = dialog.querySelector('img');
    img.hidden = false;
    dialog.querySelector('.photo-unavailable').hidden = true;
    img.src = photos[current].src;
    img.alt = photos[current].alt;
    dialog.querySelector('[data-lightbox-number]').textContent = String(current + 1);
    if (img.complete) photoState(img);
  }
  function select(index, scroll = true) {
    if (!photos.length) return;
    current = (index + photos.length) % photos.length;
    document.querySelector('[data-photo-number]').textContent = String(current + 1);
    thumbnails.forEach((button, i) => button.setAttribute('aria-pressed', String(i === current)));
    if (scroll) track.scrollTo({ left: current * track.clientWidth, behavior: 'instant' });
    const thumb = thumbnails[current];
    if (thumb) {
      const list = thumb.parentElement;
      if (thumb.offsetLeft < list.scrollLeft || thumb.offsetLeft + thumb.offsetWidth > list.scrollLeft + list.clientWidth) {
        list.scrollTo({ left: thumb.offsetLeft - list.clientWidth / 2 + thumb.clientWidth / 2, behavior: 'instant' });
      }
    }
    lightboxImage();
  }
  if (track) {
    track.addEventListener('scroll', () => {
      const index = Math.round(track.scrollLeft / track.clientWidth);
      if (index !== current) select(index, false);
    }, { passive: true });
    thumbnails.forEach((button, i) => button.addEventListener('click', () => select(i)));
    document.querySelectorAll('[data-previous]').forEach(b => b.addEventListener('click', () => select(current - 1)));
    document.querySelectorAll('[data-next]').forEach(b => b.addEventListener('click', () => select(current + 1)));
    const openButton = document.querySelector('[data-expand]');
    openButton.addEventListener('click', () => { dialog.showModal(); lightboxImage(); });
    document.querySelector('[data-close]').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => openButton.focus({ preventScroll: true }));
    dialog.querySelector('img').addEventListener('error', event => photoState(event.target));
    dialog.querySelector('img').addEventListener('load', event => photoState(event.target));
    const arrows = event => {
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault();
        select(current + (event.key === 'ArrowRight' ? 1 : -1));
      }
    };
    track.addEventListener('keydown', arrows);
    dialog.addEventListener('keydown', arrows);
    let touchStart;
    dialog.addEventListener('touchstart', event => {
      touchStart = event.touches.length === 1 ? [event.touches[0].clientX, event.touches[0].clientY] : null;
    }, { passive: true });
    dialog.addEventListener('touchend', event => {
      if (!touchStart || !event.changedTouches.length) return;
      const dx = event.changedTouches[0].clientX - touchStart[0], dy = event.changedTouches[0].clientY - touchStart[1];
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) select(current + (dx < 0 ? 1 : -1));
      touchStart = null;
    }, { passive: true });
    new ResizeObserver(() => { track.scrollLeft = current * track.clientWidth; }).observe(track);
  }

  const card = document.querySelector('[data-vehicle-card]');
  if (!card) return;
  let refreshing = false, lastCheck = Date.now();
  const note = document.querySelector('[data-refresh-note]');
  const pricePanel = document.querySelector('[data-price-panel]');
  function setAvailability(value) {
    const badge = document.querySelector('[data-availability]');
    badge.textContent = value === false ? 'No longer listed' : value === true ? 'Available' : 'Check availability';
    badge.classList.toggle('inactive', value === false);
    badge.classList.toggle('unknown', value === null);
    pricePanel.hidden = value === false;
    document.querySelector('[data-inactive-note]').hidden = value !== false;
  }
  async function refresh(force = false) {
    if (document.hidden || refreshing || (!force && Date.now() - lastCheck < 15000)) return;
    refreshing = true;
    lastCheck = Date.now();
    try {
      const response = await fetch(card.dataset.endpoint, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
      if (response.status === 404) {
        setAvailability(false);
        note.hidden = true;
        return;
      }
      if (!response.ok) throw new Error('refresh_failed');
      const { vehicle } = await response.json();
      if (!vehicle || ![true, false, null].includes(vehicle.is_active)
        || (vehicle.price !== null && (typeof vehicle.price !== 'number' || !Number.isFinite(vehicle.price)))) throw new Error('invalid_response');
      setAvailability(vehicle.is_active);
      document.querySelector('[data-price]').textContent = vehicle.price === null || vehicle.price <= 0 ? 'Contact for price'
        : new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: Number.isInteger(vehicle.price) ? 0 : 2 }).format(vehicle.price);
      document.querySelector('[data-currency]').hidden = !vehicle.price;
      note.hidden = true;
    } catch {
      note.textContent = 'Live updates are temporarily unavailable. Please confirm the price with the dealership.';
      note.hidden = false;
    } finally { refreshing = false; }
  }
  setInterval(() => refresh(), 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  window.addEventListener('focus', () => refresh());
  window.addEventListener('pageshow', event => { if (event.persisted) refresh(true); });
})();
