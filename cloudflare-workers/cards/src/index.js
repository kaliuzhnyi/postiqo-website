import { assets } from '../generated/assets.js';
import { renderPage, renderMessage, renderCardsDisabled, projectVehicle } from './render.js';

const headers = {
  'Cache-Control': 'no-store, max-age=0',
  'Cloudflare-CDN-Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'X-Robots-Tag': 'noindex, nofollow',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' https:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
};

function response(body, status = 200, type = 'text/html; charset=utf-8', extra = {}) {
  return new Response(body, { status, headers: { ...headers, 'Content-Type': type, ...extra } });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!['GET', 'HEAD'].includes(request.method)) return response('Method not allowed', 405, 'text/plain', { Allow: 'GET, HEAD' });
    let result;
    const asset = assets[url.pathname];
    if (asset) {
      const body = Uint8Array.from(atob(asset.body), c => c.charCodeAt(0));
      result = response(body, 200, asset.type, { 'Cache-Control': 'public, max-age=31536000, immutable', 'Cloudflare-CDN-Cache-Control': 'public, max-age=31536000' });
    } else if (url.pathname === '/robots.txt') {
      result = response('User-agent: *\nDisallow: /\n', 200, 'text/plain');
    } else {
      const match = /^(\/api)?\/([1-9]\d{2,15})\/([a-hj-npr-zA-HJ-NPR-Z0-9]{17})\/?$/.exec(url.pathname);
      const isApi = url.pathname.startsWith('/api/');
      if (!match || !Number.isSafeInteger(Number(match[2]))) {
        result = isApi ? response(JSON.stringify({ error: 'not_found' }), 404, 'application/json')
          : response(renderMessage('Vehicle card not found', 'Scan the QR code on the vehicle to open its details. If the link no longer works, please contact the dealership.'), 404);
      } else {
        const dealerId = Number(match[2]), vin = match[3].toUpperCase();
        const path = `/${dealerId}/${vin}`;
        if (url.pathname !== `${match[1] || ''}${path}`) {
          result = response(null, 308, 'text/plain', { Location: `${match[1] || ''}${path}${url.search}` });
        } else try {
          // Match the same stable key as Publisher ingestion. The unique index
          // scopes every read to this dealer, even when another dealer has the VIN.
          // Keep this projection explicit: licensing and inventory keys are private.
          const row = await env.DB.prepare(`SELECT
            d.cards_enabled, v.id AS vehicle_id,
            v.title, v.vin, v.stockno, v.year, v.make, v.model, v.trim, v.description,
            v.price, v.mileage, v.cylinders, v.drivetrain, v.vehicle_type,
            v.vehicle_condition, v.body_type, v.exterior_color, v.interior_color,
            v.fuel_type, v.transmission, v.location, v.video, v.photos_json, v.is_active,
            d.name AS dealer_name, d.address AS dealer_address, d.phone AS dealer_phone,
            d.email AS dealer_email, d.website AS dealer_website
            FROM dealers d LEFT JOIN inventory v ON v.dealer_id = d.id
              AND v.vehicle_key = ? AND d.cards_enabled = 1
            WHERE d.id = ?`).bind(`vin:${vin}`, dealerId).first();
          if (row && row.cards_enabled !== 1) {
            result = isApi ? response(JSON.stringify({ error: 'cards_disabled' }), 403, 'application/json')
              : response(renderCardsDisabled(path), 403);
          } else if (!row || row.vehicle_id === null) {
            result = isApi ? response(JSON.stringify({ error: 'not_found' }), 404, 'application/json')
              : response(renderMessage('This vehicle is no longer listed', 'The dealership may have removed this vehicle. Please contact them for current availability.'), 404);
          } else {
            const vehicle = projectVehicle(row);
            result = isApi ? response(JSON.stringify({ vehicle }), 200, 'application/json; charset=utf-8')
              : response(renderPage(vehicle, path));
          }
        } catch {
          // A database outage must never look like a removed vehicle, or expose
          // SQL errors, account data or credentials to the public page.
          result = isApi ? response(JSON.stringify({ error: 'temporarily_unavailable' }), 503, 'application/json', { 'Retry-After': '30' })
            : response(renderMessage('Temporarily unavailable', 'We could not load this vehicle right now. Please try again in a moment.', true), 503, 'text/html; charset=utf-8', { 'Retry-After': '30' });
        }
      }
    }
    return request.method === 'HEAD' ? new Response(null, result) : result;
  },
};
