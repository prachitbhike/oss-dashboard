'use client';

interface DiffOperation {
  type: 'delete' | 'insert' | 'equal';
  text: string;
}

interface DiffViewerProps {
  operations: DiffOperation[];
  mode?: 'inline' | 'side-by-side';
}

export default function DiffViewer({
  operations,
  mode = 'inline',
}: DiffViewerProps) {
  if (mode === 'inline') {
    return <InlineDiff operations={operations} />;
  }

  return <SideBySideDiff operations={operations} />;
}

function InlineDiff({ operations }: { operations: DiffOperation[] }) {
  return (
    <div className="font-mono text-sm leading-relaxed whitespace-pre-wrap">
      {operations.map((op, index) => {
        const className =
          op.type === 'delete'
            ? 'bg-red-100 text-red-800 line-through'
            : op.type === 'insert'
              ? 'bg-green-100 text-green-800'
              : '';

        return (
          <span key={index} className={className}>
            {op.text}
          </span>
        );
      })}
    </div>
  );
}

function SideBySideDiff({ operations }: { operations: DiffOperation[] }) {
  // Build left side (original) and right side (new) content
  const leftParts: { text: string; type: 'delete' | 'equal' }[] = [];
  const rightParts: { text: string; type: 'insert' | 'equal' }[] = [];

  for (const op of operations) {
    if (op.type === 'equal') {
      leftParts.push({ text: op.text, type: 'equal' });
      rightParts.push({ text: op.text, type: 'equal' });
    } else if (op.type === 'delete') {
      leftParts.push({ text: op.text, type: 'delete' });
    } else if (op.type === 'insert') {
      rightParts.push({ text: op.text, type: 'insert' });
    }
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="border border-neutral-200 rounded-lg p-3">
        <div className="text-xs font-medium text-neutral-500 mb-2">Before</div>
        <div className="font-mono text-sm leading-relaxed whitespace-pre-wrap">
          {leftParts.map((part, index) => (
            <span
              key={index}
              className={
                part.type === 'delete'
                  ? 'bg-red-100 text-red-800'
                  : ''
              }
            >
              {part.text}
            </span>
          ))}
        </div>
      </div>
      <div className="border border-neutral-200 rounded-lg p-3">
        <div className="text-xs font-medium text-neutral-500 mb-2">After</div>
        <div className="font-mono text-sm leading-relaxed whitespace-pre-wrap">
          {rightParts.map((part, index) => (
            <span
              key={index}
              className={
                part.type === 'insert'
                  ? 'bg-green-100 text-green-800'
                  : ''
              }
            >
              {part.text}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// Edit history item component
interface EditHistoryItemProps {
  edit: {
    id: string;
    editTimestamp: number;
    diffOperations: DiffOperation[];
  };
  isExpanded: boolean;
  onToggle: () => void;
}

export function EditHistoryItem({
  edit,
  isExpanded,
  onToggle,
}: EditHistoryItemProps) {
  const timestamp = new Date(edit.editTimestamp);
  const deletions = edit.diffOperations.filter((op) => op.type === 'delete');
  const insertions = edit.diffOperations.filter((op) => op.type === 'insert');

  return (
    <div className="border border-neutral-200 rounded-lg">
      <button
        onClick={onToggle}
        className="w-full p-3 flex items-center justify-between text-left hover:bg-neutral-50"
      >
        <div className="flex items-center gap-3">
          <span className="text-sm text-neutral-600">
            {timestamp.toLocaleDateString()} {timestamp.toLocaleTimeString()}
          </span>
          <span className="flex items-center gap-2 text-xs">
            {deletions.length > 0 && (
              <span className="text-red-600">
                -{deletions.reduce((sum, d) => sum + d.text.length, 0)} chars
              </span>
            )}
            {insertions.length > 0 && (
              <span className="text-green-600">
                +{insertions.reduce((sum, i) => sum + i.text.length, 0)} chars
              </span>
            )}
          </span>
        </div>
        <svg
          className={`w-4 h-4 text-neutral-400 chevron ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isExpanded && (
        <div className="px-3 pb-3 border-t border-neutral-100">
          <div className="mt-3">
            <DiffViewer operations={edit.diffOperations} mode="inline" />
          </div>
        </div>
      )}
    </div>
  );
}
