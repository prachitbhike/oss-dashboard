import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';
import path from 'path';
import fs from 'fs';

const dbPath = path.join(process.cwd(), 'data', 'diff-track.db');

// Ensure data directory exists
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const sqlite = new Database(dbPath);
export const db = drizzle(sqlite, { schema });

// Initialize tables if they don't exist
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS companies (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    website_url TEXT NOT NULL,
    notes TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tracked_pages (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    page_type TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS snapshots (
    id TEXT PRIMARY KEY,
    tracked_page_id TEXT NOT NULL REFERENCES tracked_pages(id) ON DELETE CASCADE,
    raw_html TEXT NOT NULL,
    cleaned_text TEXT,
    scraped_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS signals (
    id TEXT PRIMARY KEY,
    snapshot_id TEXT NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
    signals_json TEXT NOT NULL,
    extracted_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS diffs (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    scrape_run_id TEXT NOT NULL,
    old_signals_id TEXT REFERENCES signals(id),
    new_signals_id TEXT NOT NULL REFERENCES signals(id),
    summary TEXT NOT NULL,
    changes_json TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_tracked_pages_company ON tracked_pages(company_id);
  CREATE INDEX IF NOT EXISTS idx_snapshots_page ON snapshots(tracked_page_id);
  CREATE INDEX IF NOT EXISTS idx_signals_snapshot ON signals(snapshot_id);
  CREATE INDEX IF NOT EXISTS idx_diffs_company ON diffs(company_id);
  CREATE INDEX IF NOT EXISTS idx_diffs_scrape_run ON diffs(scrape_run_id);
`);

export { schema };
