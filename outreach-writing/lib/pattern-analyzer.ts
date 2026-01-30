import { v4 as uuidv4 } from 'uuid';
import { patternDb, EditPattern, editDb } from './db';
import {
  computeDiff,
  extractReplacements,
  normalizeForPattern,
  isSignificantChange,
  DiffResult,
} from './diff';

export type PatternType = 'deletion' | 'insertion' | 'replacement';

export interface PatternMatch {
  type: PatternType;
  text: string;
  replacement?: string;
  normalized: string;
}

/**
 * Extract patterns from a diff result
 */
export function extractPatternsFromDiff(diff: DiffResult): PatternMatch[] {
  const patterns: PatternMatch[] = [];
  const replacements = extractReplacements(diff);

  // Track which deletions/insertions are part of replacements
  const replacementDeletes = new Set(replacements.map((r) => r.deleted));
  const replacementInserts = new Set(replacements.map((r) => r.inserted));

  // Add replacements
  for (const r of replacements) {
    if (isSignificantChange(r.deleted) || isSignificantChange(r.inserted)) {
      patterns.push({
        type: 'replacement',
        text: r.deleted,
        replacement: r.inserted,
        normalized: normalizeForPattern(r.deleted),
      });
    }
  }

  // Add standalone deletions (not part of replacements)
  for (const deletion of diff.deletions) {
    if (!replacementDeletes.has(deletion) && isSignificantChange(deletion)) {
      patterns.push({
        type: 'deletion',
        text: deletion,
        normalized: normalizeForPattern(deletion),
      });
    }
  }

  // Add standalone insertions (not part of replacements)
  for (const insertion of diff.insertions) {
    if (!replacementInserts.has(insertion) && isSignificantChange(insertion)) {
      patterns.push({
        type: 'insertion',
        text: insertion,
        normalized: normalizeForPattern(insertion),
      });
    }
  }

  return patterns;
}

/**
 * Record patterns to the database
 */
export function recordPatterns(patterns: PatternMatch[]): void {
  const now = Date.now();

  for (const pattern of patterns) {
    // Check if pattern already exists
    const existing = patternDb.getByTypeAndText.get(
      pattern.type,
      pattern.normalized,
      pattern.replacement ? normalizeForPattern(pattern.replacement) : null,
      pattern.replacement ? normalizeForPattern(pattern.replacement) : null
    ) as EditPattern | undefined;

    if (existing) {
      // Update occurrence count
      patternDb.updateOccurrence.run(now, existing.id);
    } else {
      // Create new pattern
      patternDb.create.run({
        id: uuidv4(),
        pattern_type: pattern.type,
        pattern_text: pattern.normalized,
        replacement_text: pattern.replacement
          ? normalizeForPattern(pattern.replacement)
          : null,
        occurrence_count: 1,
        first_seen: now,
        last_seen: now,
      });
    }
  }
}

/**
 * Process an edit and extract/record patterns
 */
export function processEditForPatterns(
  previousContent: string,
  newContent: string
): DiffResult {
  const diff = computeDiff(previousContent, newContent);

  if (diff.hasChanges) {
    const patterns = extractPatternsFromDiff(diff);
    recordPatterns(patterns);
  }

  return diff;
}

/**
 * Get analysis data for the dashboard
 */
export interface AnalysisData {
  summary: {
    totalEmails: number;
    totalEdits: number;
    totalPatterns: number;
    editedEmailsCount: number;
    averageEditsPerEmail: number;
  };
  topDeletions: EditPattern[];
  topInsertions: EditPattern[];
  topReplacements: EditPattern[];
  recentPatterns: EditPattern[];
}

export function getAnalysisData(): AnalysisData {
  const allPatterns = patternDb.getAll.all() as EditPattern[];
  const deletions = patternDb.getByType.all('deletion') as EditPattern[];
  const insertions = patternDb.getByType.all('insertion') as EditPattern[];
  const replacements = patternDb.getByType.all('replacement') as EditPattern[];

  // Get edit counts
  const allEdits = editDb.getAll.all() as { email_id: string }[];
  const uniqueEditedEmails = new Set(allEdits.map((e) => e.email_id)).size;

  // Count emails (import here to avoid circular dependency)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { emailDb } = require('./db');
  const emails = emailDb.getAll.all();
  const totalEmails = emails.length;

  return {
    summary: {
      totalEmails,
      totalEdits: allEdits.length,
      totalPatterns: allPatterns.length,
      editedEmailsCount: uniqueEditedEmails,
      averageEditsPerEmail:
        uniqueEditedEmails > 0 ? allEdits.length / uniqueEditedEmails : 0,
    },
    topDeletions: deletions.slice(0, 10),
    topInsertions: insertions.slice(0, 10),
    topReplacements: replacements.slice(0, 10),
    recentPatterns: allPatterns
      .sort((a, b) => b.last_seen - a.last_seen)
      .slice(0, 10),
  };
}

/**
 * Generate prompt improvement suggestions based on patterns
 */
export interface PromptSuggestion {
  type: 'avoid' | 'prefer' | 'replace';
  original?: string;
  suggestion: string;
  occurrences: number;
}

export function generatePromptSuggestions(): PromptSuggestion[] {
  const suggestions: PromptSuggestion[] = [];

  // Get patterns with at least 2 occurrences
  const deletions = (patternDb.getByType.all('deletion') as EditPattern[])
    .filter((p) => p.occurrence_count >= 2);
  const insertions = (patternDb.getByType.all('insertion') as EditPattern[])
    .filter((p) => p.occurrence_count >= 2);
  const replacements = (patternDb.getByType.all('replacement') as EditPattern[])
    .filter((p) => p.occurrence_count >= 2);

  // Phrases to avoid (frequently deleted)
  for (const pattern of deletions.slice(0, 5)) {
    suggestions.push({
      type: 'avoid',
      suggestion: `Avoid: "${pattern.pattern_text}"`,
      occurrences: pattern.occurrence_count,
    });
  }

  // Phrases users prefer (frequently inserted)
  for (const pattern of insertions.slice(0, 5)) {
    suggestions.push({
      type: 'prefer',
      suggestion: `Consider using: "${pattern.pattern_text}"`,
      occurrences: pattern.occurrence_count,
    });
  }

  // Replacement suggestions
  for (const pattern of replacements.slice(0, 5)) {
    suggestions.push({
      type: 'replace',
      original: pattern.pattern_text,
      suggestion: `Instead of "${pattern.pattern_text}", say "${pattern.replacement_text}"`,
      occurrences: pattern.occurrence_count,
    });
  }

  return suggestions;
}
