import DiffMatchPatch from 'diff-match-patch';

const dmp = new DiffMatchPatch();

// Diff operation types
export const DIFF_DELETE = -1;
export const DIFF_INSERT = 1;
export const DIFF_EQUAL = 0;

export interface DiffOperation {
  type: 'delete' | 'insert' | 'equal';
  text: string;
}

export interface DiffResult {
  operations: DiffOperation[];
  hasChanges: boolean;
  deletions: string[];
  insertions: string[];
  stats: {
    charsDeleted: number;
    charsInserted: number;
    charsUnchanged: number;
  };
}

/**
 * Compute the diff between two texts
 */
export function computeDiff(oldText: string, newText: string): DiffResult {
  const diffs = dmp.diff_main(oldText, newText);

  // Cleanup for more human-readable diffs
  dmp.diff_cleanupSemantic(diffs);

  const operations: DiffOperation[] = [];
  const deletions: string[] = [];
  const insertions: string[] = [];
  let charsDeleted = 0;
  let charsInserted = 0;
  let charsUnchanged = 0;

  for (const [op, text] of diffs) {
    switch (op) {
      case DIFF_DELETE:
        operations.push({ type: 'delete', text });
        deletions.push(text);
        charsDeleted += text.length;
        break;
      case DIFF_INSERT:
        operations.push({ type: 'insert', text });
        insertions.push(text);
        charsInserted += text.length;
        break;
      case DIFF_EQUAL:
        operations.push({ type: 'equal', text });
        charsUnchanged += text.length;
        break;
    }
  }

  return {
    operations,
    hasChanges: deletions.length > 0 || insertions.length > 0,
    deletions,
    insertions,
    stats: {
      charsDeleted,
      charsInserted,
      charsUnchanged,
    },
  };
}

/**
 * Generate HTML for displaying diffs
 */
export function diffToHtml(diff: DiffResult): string {
  return diff.operations
    .map(({ type, text }) => {
      const escapedText = escapeHtml(text);
      switch (type) {
        case 'delete':
          return `<span class="diff-delete">${escapedText}</span>`;
        case 'insert':
          return `<span class="diff-insert">${escapedText}</span>`;
        case 'equal':
          return `<span class="diff-equal">${escapedText}</span>`;
      }
    })
    .join('');
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/\n/g, '<br>');
}

/**
 * Extract replacement pairs from diffs
 * A replacement is when text is deleted and immediately followed by an insertion
 */
export interface ReplacementPair {
  deleted: string;
  inserted: string;
}

export function extractReplacements(diff: DiffResult): ReplacementPair[] {
  const replacements: ReplacementPair[] = [];
  const ops = diff.operations;

  for (let i = 0; i < ops.length - 1; i++) {
    if (ops[i].type === 'delete' && ops[i + 1].type === 'insert') {
      replacements.push({
        deleted: ops[i].text,
        inserted: ops[i + 1].text,
      });
    }
  }

  return replacements;
}

/**
 * Normalize text for pattern matching
 * Removes extra whitespace and converts to lowercase
 */
export function normalizeForPattern(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Check if a diff change is significant enough to track
 * Filters out trivial changes like whitespace-only edits
 */
export function isSignificantChange(text: string): boolean {
  const trimmed = text.trim();
  // Must have at least 3 non-whitespace characters
  return trimmed.length >= 3;
}
