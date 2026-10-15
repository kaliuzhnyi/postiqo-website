-- Website-owned VIN data. Publisher uploads and inventory/read remain unchanged.
CREATE TABLE inventory_enrichment (
  inventory_id INTEGER PRIMARY KEY REFERENCES inventory(id) ON DELETE CASCADE,
  vin TEXT,
  model_year INTEGER,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN
    ('pending','processing','retry','complete','partial','no_data','review','skipped','failed','inactive')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0 AND attempts <= 3),
  next_attempt_at INTEGER NOT NULL DEFAULT 0,
  lease_token TEXT,
  decoded_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(decoded_json) AND json_type(decoded_json) = 'object'),
  raw_json TEXT CHECK (raw_json IS NULL OR (length(raw_json) <= 32768 AND json_valid(raw_json) AND json_type(raw_json) = 'object')),
  error_code TEXT,
  mapping_version INTEGER NOT NULL DEFAULT 1,
  decoded_at TEXT,
  updated_at TEXT NOT NULL
);
CREATE INDEX inventory_enrichment_due ON inventory_enrichment(next_attempt_at, inventory_id)
  WHERE status IN ('pending','processing','retry');
CREATE INDEX inventory_active_scan ON inventory(id) WHERE is_active = 1;

-- One bounded scan cursor and one execution per 15-minute slot, even on retries.
CREATE TABLE inventory_enrichment_runner (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  scan_cursor INTEGER NOT NULL DEFAULT 0,
  last_slot INTEGER NOT NULL DEFAULT -1,
  locked_until INTEGER NOT NULL DEFAULT 0,
  run_token TEXT,
  cooldown_until INTEGER NOT NULL DEFAULT 0,
  last_run_at TEXT,
  last_rows_read INTEGER NOT NULL DEFAULT 0,
  last_rows_written INTEGER NOT NULL DEFAULT 0,
  last_attempted INTEGER NOT NULL DEFAULT 0
);
INSERT INTO inventory_enrichment_runner(id) VALUES (1);
