'use client';

import { useState, useCallback } from 'react';

interface GenerateResult {
  email: string;
  companyName: string;
  summary: string;
}

interface BatchItemResult {
  id: string;
  url: string;
  success: boolean;
  email?: string;
  companyName?: string;
  summary?: string;
  error?: string;
  processingTime: number;
}

interface BatchProgress {
  total: number;
  completed: number;
  succeeded: number;
  failed: number;
  inProgress: number;
}

type Mode = 'single' | 'batch';

export default function Home() {
  // Single mode state
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [copied, setCopied] = useState(false);

  // Batch mode state
  const [mode, setMode] = useState<Mode>('single');
  const [batchUrls, setBatchUrls] = useState('');
  const [batchResults, setBatchResults] = useState<BatchItemResult[]>([]);
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null);
  const [batchLoading, setBatchLoading] = useState(false);
  const [expandedResults, setExpandedResults] = useState<Set<string>>(new Set());
  const [copiedIds, setCopiedIds] = useState<Set<string>>(new Set());

  // Single URL submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!url.trim()) {
      setError('Please enter a company URL');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: url.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate email');
      }

      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (result?.email) {
      await navigator.clipboard.writeText(result.email);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleRegenerate = () => {
    handleSubmit({ preventDefault: () => {} } as React.FormEvent);
  };

  // Batch submission with streaming
  const handleBatchSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    const urls = batchUrls
      .split('\n')
      .map((u) => u.trim())
      .filter((u) => u.length > 0);

    if (urls.length === 0) {
      setError('Please enter at least one URL');
      return;
    }

    if (urls.length > 50) {
      setError('Maximum 50 URLs allowed per batch');
      return;
    }

    setBatchLoading(true);
    setError(null);
    setBatchResults([]);
    setBatchProgress({ total: urls.length, completed: 0, succeeded: 0, failed: 0, inProgress: 0 });

    try {
      // Use SSE for streaming results
      const urlsParam = encodeURIComponent(JSON.stringify(urls));
      const eventSource = new EventSource(`/api/generate/batch?urls=${urlsParam}&maxConcurrent=5`);

      eventSource.addEventListener('progress', (event) => {
        const progress = JSON.parse(event.data);
        setBatchProgress(progress);
      });

      eventSource.addEventListener('result', (event) => {
        const result = JSON.parse(event.data);
        setBatchResults((prev) => [...prev, result]);
      });

      eventSource.addEventListener('complete', (event) => {
        const data = JSON.parse(event.data);
        setBatchProgress((prev) => prev ? { ...prev, ...data.summary } : null);
        setBatchLoading(false);
        eventSource.close();
      });

      eventSource.addEventListener('error', (event) => {
        // Check if it's a parsing error from the event
        if (event instanceof MessageEvent && event.data) {
          try {
            const data = JSON.parse(event.data);
            setError(data.error || 'An error occurred');
          } catch {
            setError('Connection error occurred');
          }
        }
        setBatchLoading(false);
        eventSource.close();
      });

      // Handle connection errors
      eventSource.onerror = () => {
        if (eventSource.readyState === EventSource.CLOSED) {
          setBatchLoading(false);
        }
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setBatchLoading(false);
    }
  }, [batchUrls]);

  const handleCopyBatchItem = async (id: string, email: string) => {
    await navigator.clipboard.writeText(email);
    setCopiedIds((prev) => new Set(prev).add(id));
    setTimeout(() => {
      setCopiedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 2000);
  };

  const toggleExpanded = (id: string) => {
    setExpandedResults((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleCopyAllSuccessful = async () => {
    const successfulEmails = batchResults
      .filter((r) => r.success && r.email)
      .map((r) => `--- ${r.companyName || r.url} ---\n\n${r.email}`)
      .join('\n\n\n');

    if (successfulEmails) {
      await navigator.clipboard.writeText(successfulEmails);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const expandAll = () => {
    setExpandedResults(new Set(batchResults.map((r) => r.id)));
  };

  const collapseAll = () => {
    setExpandedResults(new Set());
  };

  return (
    <main className="max-w-4xl mx-auto px-4 py-12">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          VC Outreach Email Generator
        </h1>
        <p className="text-gray-600">
          Generate personalized outreach emails for startups
        </p>
      </div>

      {/* Mode Toggle */}
      <div className="flex justify-center mb-6">
        <div className="inline-flex rounded-lg border border-gray-200 p-1 bg-gray-50">
          <button
            onClick={() => setMode('single')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              mode === 'single'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Single URL
          </button>
          <button
            onClick={() => setMode('batch')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              mode === 'batch'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Batch Processing
          </button>
        </div>
      </div>

      {mode === 'single' ? (
        // Single URL Mode
        <>
          <form onSubmit={handleSubmit} className="mb-8">
            <div className="flex gap-3">
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://company.com"
                className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={loading}
              />
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                        fill="none"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Generating...
                  </span>
                ) : (
                  'Generate Email'
                )}
              </button>
            </div>
          </form>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-700">{error}</p>
            </div>
          )}

          {result && (
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
              <div className="p-4 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-semibold text-gray-900">
                      {result.companyName}
                    </h2>
                    <p className="text-sm text-gray-600">{result.summary}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleRegenerate}
                      disabled={loading}
                      className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 transition-colors"
                    >
                      Regenerate
                    </button>
                    <button
                      onClick={handleCopy}
                      className="px-3 py-1.5 text-sm text-white bg-gray-900 rounded-md hover:bg-gray-800 transition-colors"
                    >
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>
              </div>
              <div className="p-4">
                <pre className="whitespace-pre-wrap font-sans text-gray-800 leading-relaxed">
                  {result.email}
                </pre>
              </div>
            </div>
          )}

          {!result && !error && !loading && (
            <div className="text-center py-12 text-gray-500">
              <p>Enter a startup&apos;s website URL above to generate a personalized outreach email</p>
            </div>
          )}
        </>
      ) : (
        // Batch Mode
        <>
          <form onSubmit={handleBatchSubmit} className="mb-8">
            <div className="space-y-3">
              <textarea
                value={batchUrls}
                onChange={(e) => setBatchUrls(e.target.value)}
                placeholder="Enter URLs (one per line):&#10;https://company1.com&#10;https://company2.com&#10;https://company3.com"
                className="w-full h-40 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none font-mono text-sm"
                disabled={batchLoading}
              />
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500">
                  {batchUrls.split('\n').filter((u) => u.trim()).length} URLs (max 50)
                </p>
                <button
                  type="submit"
                  disabled={batchLoading}
                  className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {batchLoading ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                          fill="none"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      Processing...
                    </span>
                  ) : (
                    'Generate All Emails'
                  )}
                </button>
              </div>
            </div>
          </form>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-700">{error}</p>
            </div>
          )}

          {/* Progress Bar */}
          {batchProgress && (batchLoading || batchResults.length > 0) && (
            <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">
                  Progress: {batchProgress.completed} / {batchProgress.total}
                </span>
                <div className="flex gap-4 text-sm">
                  <span className="text-green-600">{batchProgress.succeeded} succeeded</span>
                  <span className="text-red-600">{batchProgress.failed} failed</span>
                  {batchProgress.inProgress > 0 && (
                    <span className="text-blue-600">{batchProgress.inProgress} in progress</span>
                  )}
                </div>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div
                  className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                  style={{
                    width: `${(batchProgress.completed / batchProgress.total) * 100}%`,
                  }}
                />
              </div>
            </div>
          )}

          {/* Batch Results */}
          {batchResults.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">Results</h2>
                <div className="flex gap-2">
                  <button
                    onClick={expandAll}
                    className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                  >
                    Expand All
                  </button>
                  <button
                    onClick={collapseAll}
                    className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                  >
                    Collapse All
                  </button>
                  <button
                    onClick={handleCopyAllSuccessful}
                    className="px-3 py-1.5 text-sm text-white bg-gray-900 rounded-md hover:bg-gray-800 transition-colors"
                  >
                    {copied ? 'Copied!' : 'Copy All'}
                  </button>
                </div>
              </div>

              {batchResults.map((item) => (
                <div
                  key={item.id}
                  className={`border rounded-lg shadow-sm ${
                    item.success
                      ? 'bg-white border-gray-200'
                      : 'bg-red-50 border-red-200'
                  }`}
                >
                  <div
                    className="p-4 cursor-pointer"
                    onClick={() => toggleExpanded(item.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            item.success ? 'bg-green-500' : 'bg-red-500'
                          }`}
                        />
                        <div>
                          <h3 className="font-medium text-gray-900">
                            {item.companyName || item.url}
                          </h3>
                          {item.success && item.summary && (
                            <p className="text-sm text-gray-600">{item.summary}</p>
                          )}
                          {!item.success && (
                            <p className="text-sm text-red-600">{item.error}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">
                          {(item.processingTime / 1000).toFixed(1)}s
                        </span>
                        {item.success && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopyBatchItem(item.id, item.email!);
                            }}
                            className="px-2 py-1 text-xs text-white bg-gray-900 rounded hover:bg-gray-800 transition-colors"
                          >
                            {copiedIds.has(item.id) ? 'Copied!' : 'Copy'}
                          </button>
                        )}
                        <svg
                          className={`w-5 h-5 text-gray-400 transition-transform ${
                            expandedResults.has(item.id) ? 'rotate-180' : ''
                          }`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 9l-7 7-7-7"
                          />
                        </svg>
                      </div>
                    </div>
                  </div>
                  {expandedResults.has(item.id) && item.success && item.email && (
                    <div className="px-4 pb-4 border-t border-gray-100">
                      <pre className="mt-3 whitespace-pre-wrap font-sans text-gray-800 leading-relaxed text-sm">
                        {item.email}
                      </pre>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {!batchLoading && batchResults.length === 0 && !error && (
            <div className="text-center py-12 text-gray-500">
              <p>Enter multiple startup URLs above to generate emails in parallel</p>
              <p className="text-sm mt-2">Processing runs concurrently with rate limiting to avoid API throttling</p>
            </div>
          )}
        </>
      )}
    </main>
  );
}
