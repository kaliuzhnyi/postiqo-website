import { Miniflare } from 'miniflare';
import { readFile } from 'node:fs/promises';

export const VIN = 'WBA8E1C5XJA756297';
// Mirrors the public columns in Publisher licensing migrations 0006-0008 and 0011.
// Extra private columns prove that the public projection cannot leak them.
const schema = [
  `CREATE TABLE dealers (id INTEGER PRIMARY KEY, name TEXT NOT NULL, address TEXT, email TEXT,
    phone TEXT, website TEXT, inventory_key TEXT, updated_at TEXT,
    cards_enabled INTEGER NOT NULL DEFAULT 0 CHECK (cards_enabled IN (0, 1)))`,
  `CREATE TABLE inventory (id INTEGER PRIMARY KEY AUTOINCREMENT, dealer_id INTEGER NOT NULL REFERENCES dealers(id),
    vehicle_key TEXT NOT NULL, title TEXT, vin TEXT, stockno TEXT, year INTEGER, make TEXT, model TEXT, trim TEXT,
    description TEXT, price REAL, mileage INTEGER, cylinders INTEGER, drivetrain TEXT, vehicle_type TEXT,
    vehicle_condition TEXT, body_type TEXT, exterior_color TEXT, interior_color TEXT, fuel_type TEXT,
    transmission TEXT, location TEXT, video TEXT, photos_json TEXT, is_active INTEGER,
    content_hash TEXT, observed_at TEXT, created_at TEXT, updated_at TEXT, UNIQUE(dealer_id, vehicle_key))`,
];
export const sample = {
  title: '2018 BMW 3 Series', vin: VIN, stockno: 'B-2018', year: 2018, make: 'BMW', model: '3 Series', trim: '330e iPerformance',
  description: 'A comfortable sport sedan with plug-in hybrid efficiency.\n\nLeather interior, heated front seats, navigation and a power sunroof.\n\nContact the dealership for more information or to arrange a viewing.',
  price: 12888, mileage: 181913, cylinders: 4, drivetrain: 'RWD', vehicle_type: 'Car',
  vehicle_condition: 'Used', body_type: 'Sedan', exterior_color: 'Black', interior_color: 'Black',
  fuel_type: 'Hybrid', transmission: 'Automatic transmission', location: 'Toronto, ON', video: null,
  photos_json: '[]', is_active: 1,
};

export async function insertVehicle(db, dealerId, values = {}) {
  const row = { ...sample, ...values };
  const keys = Object.keys(row);
  await db.prepare(`INSERT INTO inventory(dealer_id, vehicle_key, ${keys.join(',')}, content_hash, updated_at)
    VALUES (?, ?, ${keys.map(() => '?').join(',')}, 'private-content-hash', '2026-09-26T00:00:00.000Z')`)
    .bind(dealerId, `vin:${row.vin}`, ...keys.map(key => row[key])).run();
}

export async function createRuntime(options = {}) {
  const mf = new Miniflare({ telemetry: { enabled: false }, host: '127.0.0.1', ...options,
    workers: [{ config: {
      name: 'cards-test', type: 'worker', compatibilityDate: '2026-09-08',
      manifest: { mainModule: 'index.js', modulesRoot: '/', modules: {
        'index.js': { type: 'esm', contents: await readFile(new URL('../dist/index.js', import.meta.url), 'utf8') },
      } }, env: { DB: { type: 'd1', id: 'local-cards-test' } },
    } }],
  });
  const db = await mf.getD1Database('DB');
  await db.batch(schema.map(sql => db.prepare(sql)));
  await db.prepare(`INSERT INTO dealers VALUES
    (100, 'Example Motors', '123 Example Street, Toronto, ON', 'sales@example.com', '+1 (416) 555-0100', 'https://example.com', 'PRIVATE-INVENTORY-KEY', '2026-09-26', 1),
    (101, 'Second Dealer', '', '', '', '', 'SECOND-PRIVATE-KEY', '2026-09-26', 1)`).run();
  await insertVehicle(db, 100);
  await insertVehicle(db, 101, { title: 'Another dealer vehicle', price: 25900 });
  return { mf, db };
}
