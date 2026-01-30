'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { BatchImportResult } from '@/types';

interface ParsedCompany {
  websiteUrl: string;
  notes?: string;
}

interface ImportProgress {
  url: string;
  status: 'queued' | 'processing' | 'done' | 'error';
  result?: string;
  error?: string;
}

function parseInputLines(input: string): ParsedCompany[] {
  return input
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(line => {
      // Check for notes separator (pipe)
      const pipeIndex = line.indexOf(' | ');
      if (pipeIndex !== -1) {
        return {
          websiteUrl: line.substring(0, pipeIndex).trim(),
          notes: line.substring(pipeIndex + 3).trim(),
        };
      }
      return { websiteUrl: line };
    });
}

export function BatchCompanyForm() {
  const router = useRouter();
  const [input, setInput] = useState('');
  const [autoDiscover, setAutoDiscover] = useState(true);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<ImportProgress[]>([]);
  const [error, setError] = useState('');
  const [result, setResult] = useState<BatchImportResult | null>(null);

  const parsedCompanies = parseInputLines(input);

  const handleImport = async () => {
    if (parsedCompanies.length === 0) {
      setError('Please enter at least one URL');
      return;
    }

    setImporting(true);
    setError('');
    setResult(null);

    // Initialize progress
    setProgress(
      parsedCompanies.map(c => ({
        url: c.websiteUrl,
        status: 'queued',
      }))
    );

    try {
      const response = await fetch('/api/companies/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companies: parsedCompanies,
          autoDiscover,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Import failed');
      }

      const importResult: BatchImportResult = await response.json();
      setResult(importResult);

      // Update progress with results
      setProgress(
        parsedCompanies.map(c => {
          const created = importResult.created.find(
            r => r.name.toLowerCase().includes(c.websiteUrl.toLowerCase().replace(/https?:\/\//, '').split('.')[0])
          );
          const failed = importResult.failed.find(f => f.url === c.websiteUrl);

          if (failed) {
            return {
              url: c.websiteUrl,
              status: 'error',
              error: failed.error,
            };
          }

          if (created) {
            return {
              url: c.websiteUrl,
              status: 'done',
              result: `${created.name} - ${created.pagesCount} pages`,
            };
          }

          return {
            url: c.websiteUrl,
            status: 'done',
          };
        })
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const handleDone = () => {
    router.push('/companies');
    router.refresh();
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      <Card>
        <h2 className="text-lg font-semibold mb-4">Add Multiple Companies</h2>

        <div className="space-y-4">
          <div>
            <label htmlFor="urls" className="block text-sm font-medium text-gray-700 mb-1">
              Paste URLs (one per line). Add notes with &quot; | &quot;:
            </label>
            <textarea
              id="urls"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={`https://stripe.com | Payments leader
https://notion.so | Competitor
https://linear.app`}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono text-sm"
              rows={8}
              disabled={importing || result !== null}
            />
          </div>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={autoDiscover}
              onChange={e => setAutoDiscover(e.target.checked)}
              disabled={importing || result !== null}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">
              Auto-discover pages (pricing, careers, etc.)
            </span>
          </label>

          {parsedCompanies.length > 0 && !result && (
            <p className="text-sm text-gray-500">
              {parsedCompanies.length} {parsedCompanies.length === 1 ? 'company' : 'companies'} to import
            </p>
          )}
        </div>
      </Card>

      {(importing || progress.length > 0) && (
        <Card>
          <h2 className="text-lg font-semibold mb-4">Progress</h2>
          <div className="space-y-2">
            {progress.map((p, i) => (
              <div key={i} className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0">
                <div className="flex-1 font-mono text-sm truncate" title={p.url}>
                  {p.url.replace(/https?:\/\//, '')}
                </div>
                <div className="flex items-center gap-2">
                  {p.status === 'queued' && (
                    <span className="text-gray-400 text-sm">Queued</span>
                  )}
                  {p.status === 'processing' && (
                    <span className="text-blue-600 text-sm flex items-center gap-1">
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Discovering...
                    </span>
                  )}
                  {p.status === 'done' && (
                    <span className="text-green-600 text-sm flex items-center gap-1">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      {p.result || 'Done'}
                    </span>
                  )}
                  {p.status === 'error' && (
                    <span className="text-red-600 text-sm flex items-center gap-1">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      {p.error || 'Failed'}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {result && (
        <Card>
          <h2 className="text-lg font-semibold mb-4">Import Complete</h2>
          <div className="space-y-2">
            <p className="text-green-600">
              {result.created.length} {result.created.length === 1 ? 'company' : 'companies'} created successfully
            </p>
            {result.failed.length > 0 && (
              <p className="text-red-600">
                {result.failed.length} {result.failed.length === 1 ? 'company' : 'companies'} failed
              </p>
            )}
          </div>
        </Card>
      )}

      <div className="flex justify-end gap-3">
        <Button type="button" variant="secondary" onClick={() => router.back()}>
          Cancel
        </Button>
        {result ? (
          <Button type="button" onClick={handleDone}>
            View Companies
          </Button>
        ) : (
          <Button
            type="button"
            onClick={handleImport}
            loading={importing}
            disabled={parsedCompanies.length === 0}
          >
            {importing ? 'Importing...' : 'Import Companies'}
          </Button>
        )}
      </div>
    </div>
  );
}
