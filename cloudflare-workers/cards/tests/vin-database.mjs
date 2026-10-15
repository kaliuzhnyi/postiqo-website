import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

export function localDatabase() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`PRAGMA foreign_keys = ON;
    CREATE TABLE inventory(id INTEGER PRIMARY KEY, dealer_id INTEGER NOT NULL DEFAULT 100,
      vin TEXT, year INTEGER, make TEXT, model TEXT, trim TEXT, price REAL, is_active INTEGER,
      content_hash TEXT NOT NULL DEFAULT 'publisher-hash', updated_at TEXT NOT NULL DEFAULT 'publisher-time');`);
  sqlite.exec(readFileSync(new URL('./enrichment-schema.sql', import.meta.url), 'utf8'));
  const db = { sqlite, prepare(sql) {
    function bind(values = []) {
      const execute = () => {
        const stmt = sqlite.prepare(sql), before = sqlite.prepare('SELECT total_changes() AS n').get().n;
        const results = stmt.columns().length ? stmt.all(...values) : (stmt.run(...values), []);
        return { results, meta: { changes: sqlite.prepare('SELECT total_changes() AS n').get().n - before } };
      };
      return { bind: (...values) => bind(values), all: async () => execute(), run: async () => execute(),
        first: async () => execute().results[0] || null, execute };
    }
    return bind();
  }, async batch(statements) {
    sqlite.exec('BEGIN');
    try { const results = statements.map(statement => statement.execute()); sqlite.exec('COMMIT'); return results; }
    catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  } };
  return db;
}
export const vin = id => `1HGCM82633A${String(id).padStart(6, '0')}`;
export function add(db, id, { active = 1, year = 2003, value = vin(id), dealer = 100 } = {}) {
  db.sqlite.prepare('INSERT INTO inventory(id, dealer_id, vin, year, make, model, is_active) VALUES (?,?,?,?,?,?,?)')
    .run(id, dealer, value, year, 'Honda', 'Accord', active);
}
export function decoded(value, changes = {}) {
  return { VIN: value, ErrorCode: '0', ModelYear: '2003', Make: 'HONDA', Model: 'Accord', Trim: 'EX',
    BodyClass: 'Sedan/Saloon', VehicleType: 'PASSENGER CAR', EngineCylinders: '4', DisplacementL: '2.4',
    FuelTypePrimary: 'Gasoline', DriveType: 'FWD/Front-Wheel Drive', TransmissionStyle: 'Automatic',
    TransmissionSpeeds: '5', Doors: '4', Seats: '5', SeatRows: '2', PlantCountry: 'UNITED STATES (USA)', ...changes };
}
export function decoder(requests, transform = values => values) {
  return async (url, options) => {
    const form = new URLSearchParams(options.body);
    requests.push({ url, method: options.method, form: Object.fromEntries(form) });
    const values = form.get('data').split(';').map(value => decoded(value.split(',')[0]));
    return Response.json({ Results: await transform(values) });
  };
}
