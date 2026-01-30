import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const companies = sqliteTable('companies', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  websiteUrl: text('website_url').notNull(),
  notes: text('notes'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const trackedPages = sqliteTable('tracked_pages', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  pageType: text('page_type').notNull(), // homepage|pricing|careers|about|customers|product|blog|other
  createdAt: integer('created_at').notNull(),
});

export const snapshots = sqliteTable('snapshots', {
  id: text('id').primaryKey(),
  trackedPageId: text('tracked_page_id').notNull().references(() => trackedPages.id, { onDelete: 'cascade' }),
  rawHtml: text('raw_html').notNull(),
  cleanedText: text('cleaned_text'),
  scrapedAt: integer('scraped_at').notNull(),
});

export const signals = sqliteTable('signals', {
  id: text('id').primaryKey(),
  snapshotId: text('snapshot_id').notNull().references(() => snapshots.id, { onDelete: 'cascade' }),
  signalsJson: text('signals_json').notNull(),
  extractedAt: integer('extracted_at').notNull(),
});

export const diffs = sqliteTable('diffs', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  scrapeRunId: text('scrape_run_id').notNull(),
  oldSignalsId: text('old_signals_id').references(() => signals.id),
  newSignalsId: text('new_signals_id').notNull().references(() => signals.id),
  summary: text('summary').notNull(),
  changesJson: text('changes_json').notNull(),
  createdAt: integer('created_at').notNull(),
});

export type CompanyInsert = typeof companies.$inferInsert;
export type CompanySelect = typeof companies.$inferSelect;
export type TrackedPageInsert = typeof trackedPages.$inferInsert;
export type TrackedPageSelect = typeof trackedPages.$inferSelect;
export type SnapshotInsert = typeof snapshots.$inferInsert;
export type SnapshotSelect = typeof snapshots.$inferSelect;
export type SignalInsert = typeof signals.$inferInsert;
export type SignalSelect = typeof signals.$inferSelect;
export type DiffInsert = typeof diffs.$inferInsert;
export type DiffSelect = typeof diffs.$inferSelect;
