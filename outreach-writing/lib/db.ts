import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Ensure data directory exists
const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'emails.db');
const db = new Database(dbPath);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');

// Check if we need to migrate the schema (add new columns)
function migrateSchema() {
  // Check if parent_email_id column exists
  const columns = db.prepare("PRAGMA table_info(emails)").all() as { name: string }[];
  const columnNames = columns.map(c => c.name);

  if (!columnNames.includes('parent_email_id')) {
    db.exec(`
      ALTER TABLE emails ADD COLUMN parent_email_id TEXT;
      ALTER TABLE emails ADD COLUMN follow_up_number INTEGER DEFAULT 0;
    `);
  }
}

// Try to migrate if table exists
try {
  const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='emails'").get();
  if (tableExists) {
    migrateSchema();
  }
} catch {
  // Table doesn't exist yet, schema will be created fresh
}

// Initialize schema
db.exec(`
  -- Store generated emails
  CREATE TABLE IF NOT EXISTS emails (
    id TEXT PRIMARY KEY,
    url TEXT NOT NULL,
    company_name TEXT NOT NULL,
    company_summary TEXT,
    original_email TEXT NOT NULL,
    current_email TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    is_archived INTEGER DEFAULT 0,
    parent_email_id TEXT,
    follow_up_number INTEGER DEFAULT 0,
    FOREIGN KEY (parent_email_id) REFERENCES emails(id) ON DELETE SET NULL
  );

  -- Store every edit event with diffs
  CREATE TABLE IF NOT EXISTS edits (
    id TEXT PRIMARY KEY,
    email_id TEXT NOT NULL,
    previous_content TEXT NOT NULL,
    new_content TEXT NOT NULL,
    diff_operations TEXT NOT NULL,
    edit_timestamp INTEGER NOT NULL,
    FOREIGN KEY (email_id) REFERENCES emails(id) ON DELETE CASCADE
  );

  -- Aggregated edit patterns for analysis
  CREATE TABLE IF NOT EXISTS edit_patterns (
    id TEXT PRIMARY KEY,
    pattern_type TEXT NOT NULL,
    pattern_text TEXT NOT NULL,
    replacement_text TEXT,
    occurrence_count INTEGER DEFAULT 1,
    first_seen INTEGER NOT NULL,
    last_seen INTEGER NOT NULL
  );

  -- Indexes for better query performance
  CREATE INDEX IF NOT EXISTS idx_emails_created_at ON emails(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_emails_is_archived ON emails(is_archived);
  CREATE INDEX IF NOT EXISTS idx_emails_parent_id ON emails(parent_email_id);
  CREATE INDEX IF NOT EXISTS idx_edits_email_id ON edits(email_id);
  CREATE INDEX IF NOT EXISTS idx_edits_timestamp ON edits(edit_timestamp DESC);
  CREATE INDEX IF NOT EXISTS idx_edit_patterns_type ON edit_patterns(pattern_type);
  CREATE INDEX IF NOT EXISTS idx_edit_patterns_count ON edit_patterns(occurrence_count DESC);
`);

// Type definitions
export interface Email {
  id: string;
  url: string;
  company_name: string;
  company_summary: string | null;
  original_email: string;
  current_email: string;
  created_at: number;
  updated_at: number;
  is_archived: number;
  parent_email_id: string | null;
  follow_up_number: number;
}

export interface Edit {
  id: string;
  email_id: string;
  previous_content: string;
  new_content: string;
  diff_operations: string; // JSON string
  edit_timestamp: number;
}

export interface EditPattern {
  id: string;
  pattern_type: 'deletion' | 'insertion' | 'replacement';
  pattern_text: string;
  replacement_text: string | null;
  occurrence_count: number;
  first_seen: number;
  last_seen: number;
}

// Email operations
export const emailDb = {
  create: db.prepare(`
    INSERT INTO emails (id, url, company_name, company_summary, original_email, current_email, created_at, updated_at, parent_email_id, follow_up_number)
    VALUES (@id, @url, @company_name, @company_summary, @original_email, @current_email, @created_at, @updated_at, @parent_email_id, @follow_up_number)
  `),

  getById: db.prepare(`
    SELECT * FROM emails WHERE id = ?
  `),

  getAll: db.prepare(`
    SELECT * FROM emails WHERE is_archived = 0 AND follow_up_number = 0 ORDER BY created_at DESC
  `),

  getAllWithArchived: db.prepare(`
    SELECT * FROM emails WHERE follow_up_number = 0 ORDER BY created_at DESC
  `),

  getByParentId: db.prepare(`
    SELECT * FROM emails WHERE parent_email_id = ? ORDER BY follow_up_number ASC
  `),

  getThread: db.prepare(`
    SELECT * FROM emails
    WHERE id = ? OR parent_email_id = ?
    ORDER BY follow_up_number ASC, created_at ASC
  `),

  getFollowUpCount: db.prepare(`
    SELECT COUNT(*) as count FROM emails WHERE parent_email_id = ?
  `),

  getMaxFollowUpNumber: db.prepare(`
    SELECT MAX(follow_up_number) as max_num FROM emails WHERE parent_email_id = ?
  `),

  update: db.prepare(`
    UPDATE emails SET current_email = @current_email, updated_at = @updated_at WHERE id = @id
  `),

  archive: db.prepare(`
    UPDATE emails SET is_archived = 1, updated_at = ? WHERE id = ?
  `),

  unarchive: db.prepare(`
    UPDATE emails SET is_archived = 0, updated_at = ? WHERE id = ?
  `),

  delete: db.prepare(`
    DELETE FROM emails WHERE id = ?
  `),
};

// Edit operations
export const editDb = {
  create: db.prepare(`
    INSERT INTO edits (id, email_id, previous_content, new_content, diff_operations, edit_timestamp)
    VALUES (@id, @email_id, @previous_content, @new_content, @diff_operations, @edit_timestamp)
  `),

  getByEmailId: db.prepare(`
    SELECT * FROM edits WHERE email_id = ? ORDER BY edit_timestamp DESC
  `),

  getAll: db.prepare(`
    SELECT * FROM edits ORDER BY edit_timestamp DESC
  `),

  getRecent: db.prepare(`
    SELECT * FROM edits ORDER BY edit_timestamp DESC LIMIT ?
  `),
};

// Pattern operations
export const patternDb = {
  create: db.prepare(`
    INSERT INTO edit_patterns (id, pattern_type, pattern_text, replacement_text, occurrence_count, first_seen, last_seen)
    VALUES (@id, @pattern_type, @pattern_text, @replacement_text, @occurrence_count, @first_seen, @last_seen)
  `),

  getByTypeAndText: db.prepare(`
    SELECT * FROM edit_patterns WHERE pattern_type = ? AND pattern_text = ? AND (replacement_text = ? OR (replacement_text IS NULL AND ? IS NULL))
  `),

  updateOccurrence: db.prepare(`
    UPDATE edit_patterns SET occurrence_count = occurrence_count + 1, last_seen = ? WHERE id = ?
  `),

  getAll: db.prepare(`
    SELECT * FROM edit_patterns ORDER BY occurrence_count DESC
  `),

  getByType: db.prepare(`
    SELECT * FROM edit_patterns WHERE pattern_type = ? ORDER BY occurrence_count DESC
  `),

  getTopPatterns: db.prepare(`
    SELECT * FROM edit_patterns ORDER BY occurrence_count DESC LIMIT ?
  `),
};

export default db;
