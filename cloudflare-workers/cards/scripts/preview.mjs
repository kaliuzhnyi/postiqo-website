import './build.mjs';
import { readFile } from 'node:fs/promises';
import { createRuntime, VIN } from '../tests/fixture.mjs';
import { createInterface } from 'node:readline';

// Isolated local D1 only. No production credentials or writes.
const { mf, db } = await createRuntime({ port: 8788 });
if (process.env.CARD_PREVIEW_FIXTURE) {
  const values = JSON.parse(await readFile(process.env.CARD_PREVIEW_FIXTURE, 'utf8'));
  const inventoryFields = ['title', 'stockno', 'year', 'make', 'model', 'trim', 'description', 'price', 'mileage',
    'cylinders', 'drivetrain', 'vehicle_type', 'vehicle_condition', 'body_type', 'exterior_color', 'interior_color',
    'fuel_type', 'transmission', 'location', 'video', 'photos_json', 'is_active'];
  const keys = inventoryFields.filter(key => Object.hasOwn(values, key));
  if (keys.length) await db.prepare(`UPDATE inventory SET ${keys.map(key => `${key} = ?`).join(',')} WHERE dealer_id = 100`)
    .bind(...keys.map(key => values[key])).run();
}
console.log(`Preview: ${await mf.ready}100/${VIN}`);
// A terminal-only control for testing live refresh. There is no HTTP write API.
createInterface({ input: process.stdin }).on('line', async line => {
  try {
    const value = JSON.parse(line);
    if (typeof value.price === 'number' && Number.isFinite(value.price) && value.price >= 0) {
      await db.prepare('UPDATE inventory SET price = ? WHERE dealer_id = 100').bind(value.price).run();
      console.log(`Local preview price: ${value.price}`);
    }
    if ([0, 1].includes(value.active)) {
      await db.prepare('UPDATE inventory SET is_active = ? WHERE dealer_id = 100').bind(value.active).run();
      console.log(`Local preview active: ${value.active}`);
    }
  } catch { console.log('Enter JSON such as {"price":11995} to update the local fixture.'); }
});
process.on('SIGINT', async () => { await mf.dispose(); process.exit(); });
