// Shared, deterministic normalization and website-only source priority.
export const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/;
export const FILL_FIELDS = ['year', 'make', 'model', 'trim', 'body_type', 'vehicle_type',
  'cylinders', 'drivetrain', 'transmission', 'fuel_type'];
export const EXTRA_FIELDS = ['engine_displacement_l', 'engine_model', 'engine_configuration',
  'transmission_speeds', 'doors', 'seats', 'seat_rows', 'electrification_level', 'fuel_type_secondary', 'plant_country'];
const clean = value => typeof value === 'string' && !/^(?:not applicable|not available|unknown|n\/a)$/i.test(value.trim())
  ? value.trim().replace(/[\u2013\u2014]/g, '-') : '';
const numericFields = new Set(['year', 'cylinders', 'engine_displacement_l', 'transmission_speeds', 'doors', 'seats', 'seat_rows']);
function positive(value, max, integer = true) {
  const text = clean(value);
  if (!/^\d+(?:\.\d+)?$/.test(text)) return null;
  const n = Number(text);
  return n > 0 && n <= max && (!integer || Number.isInteger(n)) ? n : null;
}
function lookup(value, pairs) { const key = clean(value).toLowerCase(); return Object.hasOwn(pairs, key) ? pairs[key] : null; }
function fuel(row) {
  const level = clean(row.ElectrificationLevel);
  if (/^PHEV\b/i.test(level)) return 'Plug-in hybrid';
  if (/^BEV\b/i.test(level)) return 'Electric';
  if (/^(?:HEV|Mild HEV|Strong HEV)\b/i.test(level)) return 'Hybrid';
  if (level && !/^Not electrified$/i.test(level)) return null;
  const primary = clean(row.FuelTypePrimary), secondary = clean(row.FuelTypeSecondary);
  if (/electric/i.test(primary + secondary) && primary && secondary) return null;
  if (/ethanol/i.test(primary + secondary) && /gasoline/i.test(primary + secondary)) return 'Flex';
  return lookup(primary, { gasoline: 'Gasoline', diesel: 'Diesel', electric: 'Electric' });
}

export function normalizeDecode(row, vin, year) {
  if (!row || typeof row !== 'object' || Array.isArray(row) || row.VIN?.toUpperCase() !== vin
    || typeof row.ErrorCode !== 'string' || !/^\d+(?:\s*,\s*\d+)*$/.test(row.ErrorCode.trim())) {
    throw new Error('invalid_response');
  }
  const codes = [...new Set(row.ErrorCode.split(',').map(v => Number(v.trim())))];
  const errorCode = codes.join(',');
  if (codes.length !== 1 || codes[0] !== 0) {
    return { status: codes.every(code => [7, 8].includes(code)) ? 'no_data' : 'review', data: {}, errorCode };
  }
  const modelYear = positive(row.ModelYear, 2200);
  if (year !== null && year !== undefined && modelYear !== year) return { status: 'review', data: {}, errorCode: 'year_conflict' };
  const data = {
    year: modelYear, make: clean(row.Make), model: clean(row.Model), trim: clean(row.Trim), series: clean(row.Series),
    body_type: lookup(row.BodyClass, {
      'sedan/saloon': 'Sedan', coupe: 'Coupe', 'hatchback/liftback/notchback': 'Hatchback',
      'sport utility vehicle (suv)/multi-purpose vehicle (mpv)': 'SUV',
      'sport utility vehicle [suv]/multipurpose vehicle [mpv]': 'SUV',
      'sport utility vehicle (suv)/multipurpose vehicle (mpv)': 'SUV',
      'convertible/cabriolet': 'Convertible', wagon: 'Wagon', pickup: 'Truck', minivan: 'Minivan',
    }),
    vehicle_type: lookup(row.VehicleType, { 'passenger car': 'Car/Truck', truck: 'Car/Truck',
      'multipurpose passenger vehicle (mpv)': 'Car/Truck', motorcycle: 'Motorcycle', trailer: 'Trailer' }),
    cylinders: positive(row.EngineCylinders, 32),
    drivetrain: lookup(row.DriveType, { 'awd/all-wheel drive': 'AWD', '4wd/4-wheel drive/4x4': '4WD',
      'fwd/front-wheel drive': 'FWD', 'rwd/rear-wheel drive': 'RWD' }),
    transmission: lookup(row.TransmissionStyle, { automatic: 'Automatic transmission', manual: 'Manual transmission',
      'continuously variable transmission (cvt)': 'Automatic transmission', 'dual-clutch transmission (dct)': 'Automatic transmission' }),
    fuel_type: fuel(row), engine_displacement_l: positive(row.DisplacementL, 30, false),
    engine_model: clean(row.EngineModel), engine_configuration: clean(row.EngineConfiguration),
    transmission_speeds: positive(row.TransmissionSpeeds, 30), doors: positive(row.Doors, 10),
    seats: positive(row.Seats, 100), seat_rows: positive(row.SeatRows, 30),
    electrification_level: lookup(row.ElectrificationLevel, {
      'bev (battery electric vehicle)': 'Battery electric', 'phev (plug-in hybrid electric vehicle)': 'Plug-in hybrid',
      'hev (hybrid electric vehicle) - level unknown': 'Hybrid',
      'mild hev (hybrid electric vehicle)': 'Mild hybrid', 'strong hev (hybrid electric vehicle)': 'Full hybrid',
    }),
    fuel_type_secondary: clean(row.FuelTypeSecondary), plant_country: clean(row.PlantCountry),
  };
  for (const key of Object.keys(data)) if (data[key] === null || data[key] === '') delete data[key];
  if (!data.year || !data.make || !data.model) return { status: 'no_data', data: {}, errorCode };
  return { status: ['trim', 'body_type', 'drivetrain', 'transmission', 'fuel_type', 'doors', 'seats'].every(key => data[key])
    ? 'complete' : 'partial', data, errorCode };
}

const canonical = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const makeKey = value => ({ mercedesbenz: 'mercedes', vw: 'volkswagen', chevy: 'chevrolet' }[canonical(value)] || canonical(value));
const blank = value => value === null || value === undefined || (typeof value === 'string' && !value.trim());

export function mergeEnrichment(row) {
  const result = { ...row };
  if (!['complete', 'partial'].includes(row.enrichment_status) || row.enrichment_vin !== row.vin) return result;
  let data;
  try { data = JSON.parse(row.enrichment_json); } catch { return result; }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return result;
  if ((!blank(row.year) && row.year !== data.year) || (!blank(row.make) && makeKey(row.make) !== makeKey(data.make))) return result;
  if (!blank(row.model)) {
    const model = canonical(String(row.model).split(/\s+[|*]\s+/)[0]);
    const choices = [data.model, data.series].map(canonical).filter(Boolean);
    if (!choices.some(value => model === value || model.startsWith(value) || model === makeKey(row.make) + value)) return result;
  }
  for (const key of [...FILL_FIELDS, ...EXTRA_FIELDS]) {
    const value = data[key];
    if (!blank(result[key])) continue;
    if (numericFields.has(key)) {
      if (typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= (key === 'year' ? 2200 : 100)
        && (key === 'engine_displacement_l' || Number.isInteger(value))) result[key] = value;
    } else if (typeof value === 'string' && value.trim() && value.length <= 200) result[key] = clean(value);
  }
  return result;
}
