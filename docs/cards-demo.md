# Cards vehicle demo

Public route: `https://postiqo.io/products/postiqo-cards/demo/`.

The Cards product hero, QR, phone preview and dedicated demo section link here. The example is a fictional 2023 Toyota RAV4 XLE AWD at a fictional Postiqo Motors dealership. Price, mileage, VIN, stock number and other listing details are examples. The product page and demo metadata identify it as a demonstration; the visible vehicle page uses exactly the production card layout.

## Template and behavior

`scripts/generate-cards-demo.mjs` imports the existing card renderer from `cloudflare-workers/cards/src/render.js` with local asset URLs. It produces:

- `products/postiqo-cards/demo/index.html`
- `assets/css/cards-template.css`, copied from the Cards stylesheet with the local font URL
- `assets/js/cards-template.js`, an unchanged copy of the Cards client

The demo omits the live-card data attribute. The original client initializes the gallery, then returns before registering price-refresh requests. No inventory API, database or Cloudflare service is used by the demo. There is no additional header, image caption, contact explanation, marketing call to action or custom demo stylesheet/script. The vehicle description contains normal listing copy. The same production renderer adds the footer, `Powered by Postiqo Cards`, linked to the Cards product page.

The call button uses `tel:+14374416585` and the email button uses `mailto:support@postiqo.io`, matching the public website contacts. These open the visitor's phone or email application, just like a live card. They also work without JavaScript. The page has `noindex, follow`, a self canonical, demo-specific social metadata, no sale schema, and no sitemap entry.

Regenerate with `node scripts/generate-cards-demo.mjs`. Verify with `node scripts/generate-cards-demo.mjs --check` and `python scripts/check-seo.py`. The generator fails if the source template no longer matches the deliberate demo substitutions.

## Image assets

Created with the built-in imagegen tool for this demo on 2026-09-26. These are illustrative generated images, not photographs documenting an actual vehicle for sale. All three are 1448 x 1086. The generated PNGs were encoded as WebP at quality 86 without cropping, resizing or changing the image content.

Final project files:

- `assets/img/cards-demo/exterior.webp`
- `assets/img/cards-demo/rear.webp`
- `assets/img/cards-demo/interior.webp`

The exterior image served as the vehicle reference for the other two. These are the complete generation prompts.

### Exterior

Create a photorealistic dealership inventory photograph for a clearly labeled fictional demonstration vehicle listing. Landscape 4:3. Subject: silver metallic 2023 Toyota RAV4 XLE AWD, factory silver alloy wheels, black lower body cladding, black cloth interior. Front left three-quarter view, entire vehicle visible, straight wheels, parked on clean pale asphalt outside a modern neutral light-gray dealership, distant green trees, overcast daylight, realistic natural reflections, eye-level camera with a 50mm lens. Ordinary professional used-car listing photo, no dramatic effects. No people, no price tag, no dealership signage, no watermark, no text or lettering, blank white license plate. Center the vehicle with generous space on all sides. This is an illustrative generated demo image, not documentation of a real car for sale.

### Rear

Reference image shows the example vehicle whose identity must remain consistent. Generate one new photorealistic vehicle inventory photo of this SAME silver 2023 Toyota RAV4 XLE AWD from the rear left three-quarter angle. Show the entire vehicle and factory silver alloy wheels, all doors and rear hatch closed. Same clean neutral gray dealership asphalt location, overcast daylight, green trees, natural reflections, 50mm eye-level photography. Landscape 4:3. No people, signs, prices, text, watermark. Blank white license plate. It is a fictional demonstration listing.

### Interior

Reference image shows the example vehicle whose identity must remain consistent. Generate one new photorealistic vehicle inventory photo INSIDE this silver 2023 Toyota RAV4 XLE AWD, looking from the open front passenger door toward the left hand drive dashboard, steering wheel, center console and black cloth front seats. Clearly show interior details, modern Toyota RAV4 interior consistent with 2023 XLE. Clean cabin, unoccupied, daylight, same pale gray dealership glimpsed outside the windows. Natural used-car inventory photography, realistic materials, neutral light. Landscape 4:3. No people, prices, added text, watermarks, clutter. It is a fictional demonstration listing.

## QR

`assets/img/cards-qr.svg` encodes the public demo route with medium error correction and a four-module quiet zone. It can be regenerated with Python's qrcode package and SvgPathFillImage. The SVG remains sharp when displayed on a phone or printed.
