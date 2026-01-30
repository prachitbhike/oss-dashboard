'use client';

import { formatDistanceToNow } from 'date-fns';
import { Card, CardTitle } from './ui/Card';
import { Badge } from './ui/Badge';
import { DiffChange } from '@/types';

interface Diff {
  id: string;
  summary: string;
  changes: DiffChange[];
  createdAt: number;
}

interface DiffViewerProps {
  diffs: Diff[];
}

export function DiffViewer({ diffs }: DiffViewerProps) {
  if (diffs.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p>No changes detected yet.</p>
        <p className="text-sm mt-1">Scrape the company multiple times to see changes over time.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {diffs.map(diff => (
        <Card key={diff.id}>
          <div className="flex justify-between items-start">
            <CardTitle>
              {formatDistanceToNow(new Date(diff.createdAt), { addSuffix: true })}
            </CardTitle>
            <Badge variant="warning">{diff.changes.length} changes</Badge>
          </div>

          <p className="mt-3 text-gray-700">{diff.summary}</p>

          <div className="mt-4 space-y-2">
            {diff.changes.map((change, i) => (
              <ChangeItem key={i} change={change} />
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

function ChangeItem({ change }: { change: DiffChange }) {
  const getChangeColor = () => {
    switch (change.changeType) {
      case 'added':
        return 'text-green-700 bg-green-50';
      case 'removed':
        return 'text-red-700 bg-red-50';
      case 'modified':
        return 'text-yellow-700 bg-yellow-50';
      default:
        return 'text-gray-700 bg-gray-50';
    }
  };

  const getChangeIcon = () => {
    switch (change.changeType) {
      case 'added':
        return '+';
      case 'removed':
        return '-';
      case 'modified':
        return '~';
      default:
        return '?';
    }
  };

  const formatValue = (value: unknown): string => {
    if (value === null || value === undefined) return 'null';
    if (Array.isArray(value)) {
      if (value.length === 0) return '[]';
      return value.map(v => typeof v === 'object' ? JSON.stringify(v) : String(v)).join(', ');
    }
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  return (
    <div className={`p-3 rounded-lg ${getChangeColor()}`}>
      <div className="flex items-start gap-2">
        <span className="font-mono font-bold">{getChangeIcon()}</span>
        <div className="flex-1 min-w-0">
          <span className="font-medium">{change.category}.{change.field}</span>
          <div className="mt-1 text-sm">
            {change.changeType === 'added' && (
              <span>Added: {formatValue(change.newValue)}</span>
            )}
            {change.changeType === 'removed' && (
              <span>Removed: {formatValue(change.oldValue)}</span>
            )}
            {change.changeType === 'modified' && (
              <>
                <div>From: {formatValue(change.oldValue)}</div>
                <div>To: {formatValue(change.newValue)}</div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
