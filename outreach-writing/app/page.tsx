'use client';

import { useState, useCallback, useEffect } from 'react';
import Navigation from '@/components/layout/Navigation';
import SearchInput from '@/components/ui/SearchInput';
import { useSearch } from '@/hooks/useSearch';
import SettingsModal, {
  PromptSettings,
  DEFAULT_SYSTEM_PROMPT,
  DEFAULT_USER_PROMPT_TEMPLATE,
} from '@/components/settings/SettingsModal';

const SETTINGS_STORAGE_KEY = 'outreach-prompt-settings';

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

export default function Home() {
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [batchUrls, setBatchUrls] = useState('');
  const [batchResults, setBatchResults] = useState<BatchItemResult[]>([]);
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null);
  const [batchLoading, setBatchLoading] = useState(false);
  const [expandedResults, setExpandedResults] = useState<Set<string>>(new Set());
  const [copiedIds, setCopiedIds] = useState<Set<string>>(new Set());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [promptSettings, setPromptSettings] = useState<PromptSettings>({
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    userPromptTemplate: DEFAULT_USER_PROMPT_TEMPLATE,
  });

  // Load settings from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setPromptSettings(parsed);
      } catch {
        // Ignore invalid stored settings
      }
    }
  }, []);

  const handleSaveSettings = (settings: PromptSettings) => {
    setPromptSettings(settings);
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  };

  const {
    searchQuery,
    setSearchQuery,
    filteredItems: filteredResults,
    isSearching,
    hasResults,
  } = useSearch({
    items: batchResults,
    searchFields: ['companyName', 'url'],
  });

  const handleBatchSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const urls = batchUrls.split('\n').map((u) => u.trim()).filter((u) => u.length > 0);

    if (urls.length === 0) {
      setError('Please enter at least one URL');
      return;
    }
    if (urls.length > 50) {
      setError('Maximum 50 URLs allowed');
      return;
    }

    setBatchLoading(true);
    setError(null);
    setBatchResults([]);
    setBatchProgress({ total: urls.length, completed: 0, succeeded: 0, failed: 0, inProgress: 0 });

    try {
      const urlsParam = encodeURIComponent(JSON.stringify(urls));
      const promptSettingsParam = encodeURIComponent(JSON.stringify(promptSettings));
      const eventSource = new EventSource(`/api/generate/batch?urls=${urlsParam}&maxConcurrent=5&promptSettings=${promptSettingsParam}`);

      eventSource.addEventListener('progress', (event) => {
        setBatchProgress(JSON.parse(event.data));
      });

      eventSource.addEventListener('result', (event) => {
        setBatchResults((prev) => [...prev, JSON.parse(event.data)]);
      });

      eventSource.addEventListener('complete', (event) => {
        const data = JSON.parse(event.data);
        setBatchProgress((prev) => prev ? { ...prev, ...data.summary } : null);
        setBatchLoading(false);
        eventSource.close();
      });

      eventSource.addEventListener('error', (event) => {
        if (event instanceof MessageEvent && event.data) {
          try {
            setError(JSON.parse(event.data).error || 'An error occurred');
          } catch {
            setError('Connection error');
          }
        }
        setBatchLoading(false);
        eventSource.close();
      });

      eventSource.onerror = () => {
        if (eventSource.readyState === EventSource.CLOSED) setBatchLoading(false);
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setBatchLoading(false);
    }
  }, [batchUrls, promptSettings]);

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
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleCopyAll = async () => {
    const emails = batchResults
      .filter((r) => r.success && r.email)
      .map((r) => `--- ${r.companyName || r.url} ---\n\n${r.email}`)
      .join('\n\n\n');
    if (emails) {
      await navigator.clipboard.writeText(emails);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const urlCount = batchUrls.split('\n').filter((u) => u.trim()).length;

  return (
    <main className="max-w-2xl mx-auto px-6 py-12 relative">
      <button
        onClick={() => setSettingsOpen(true)}
        className="absolute top-6 right-6 p-2 text-neutral-500 hover:text-neutral-900 transition-colors"
        title="Prompt Settings"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
        </svg>
      </button>

      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-neutral-900 mb-2">
          Generate Emails
        </h1>
        <p className="text-neutral-500">
          Create personalized outreach emails from company URLs
        </p>
      </div>

      <div className="mb-8">
        <Navigation />
      </div>

      <form onSubmit={handleBatchSubmit} className="mb-8">
        <textarea
          value={batchUrls}
          onChange={(e) => setBatchUrls(e.target.value)}
          placeholder="Enter URLs, one per line"
          className="w-full h-36 px-4 py-3 bg-white border border-neutral-200 rounded-lg input-field resize-none font-mono text-sm text-neutral-900 placeholder-neutral-400 mb-3"
          disabled={batchLoading}
        />
        <div className="flex items-center justify-between">
          <span className="text-sm text-neutral-400">
            {urlCount} URL{urlCount !== 1 ? 's' : ''}
          </span>
          <button
            type="submit"
            disabled={batchLoading}
            className="btn px-5 py-2.5 bg-neutral-900 text-white text-sm font-medium rounded-lg"
          >
            {batchLoading ? 'Processing...' : 'Generate All'}
          </button>
        </div>
      </form>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-lg animate-fade-in">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {batchProgress && (batchLoading || batchResults.length > 0) && (
        <div className="mb-8 animate-fade-in">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-neutral-600">
              {batchProgress.completed} of {batchProgress.total}
            </span>
            <div className="flex gap-4 text-neutral-500">
              <span>{batchProgress.succeeded} done</span>
              {batchProgress.failed > 0 && (
                <span className="text-red-500">{batchProgress.failed} failed</span>
              )}
            </div>
          </div>
          <div className="h-1 bg-neutral-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-neutral-900 rounded-full progress-fill"
              style={{ width: `${(batchProgress.completed / batchProgress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {batchResults.length > 0 && (
        <div className="space-y-3">
          <SearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search by company name or URL..."
            className="mb-4"
          />

          <div className="flex items-center justify-between mb-4">
            <h2 className="font-medium text-neutral-900">
              {isSearching
                ? `Showing ${filteredResults.length} of ${batchResults.length} results`
                : 'Results'}
            </h2>
            <div className="flex gap-2">
              <button
                onClick={() => setExpandedResults(new Set(filteredResults.map((r) => r.id)))}
                className="btn px-3 py-1.5 text-sm text-neutral-600 border border-neutral-200 rounded-md bg-white"
              >
                Expand
              </button>
              <button
                onClick={() => setExpandedResults(new Set())}
                className="btn px-3 py-1.5 text-sm text-neutral-600 border border-neutral-200 rounded-md bg-white"
              >
                Collapse
              </button>
              <button
                onClick={handleCopyAll}
                className="btn px-3 py-1.5 text-sm text-white bg-neutral-900 rounded-md"
              >
                {copied ? 'Copied' : 'Copy All'}
              </button>
            </div>
          </div>

          {isSearching && !hasResults && (
            <div className="text-center py-8 text-neutral-500">
              <p className="mb-2">No results match "{searchQuery}"</p>
              <button
                onClick={() => setSearchQuery('')}
                className="text-sm text-neutral-900 underline hover:no-underline"
              >
                Clear search
              </button>
            </div>
          )}

          {filteredResults.map((item) => (
            <div
              key={item.id}
              className={`border rounded-lg card-hover ${
                item.success ? 'bg-white border-neutral-200' : 'bg-red-50 border-red-100'
              }`}
            >
              <div
                className="p-4 cursor-pointer flex items-center justify-between"
                onClick={() => toggleExpanded(item.id)}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                    item.success ? 'bg-green-500' : 'bg-red-500'
                  }`} />
                  <div className="min-w-0">
                    <p className="font-medium text-neutral-900 truncate">
                      {item.companyName || item.url}
                    </p>
                    {item.success && item.summary && (
                      <p className="text-sm text-neutral-500 truncate">{item.summary}</p>
                    )}
                    {!item.success && (
                      <p className="text-sm text-red-500">{item.error}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                  <span className="text-xs text-neutral-400">
                    {(item.processingTime / 1000).toFixed(1)}s
                  </span>
                  {item.success && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopyBatchItem(item.id, item.email!);
                      }}
                      className="btn px-2 py-1 text-xs text-neutral-600 border border-neutral-200 rounded bg-white"
                    >
                      {copiedIds.has(item.id) ? 'Copied' : 'Copy'}
                    </button>
                  )}
                  <svg
                    className={`w-4 h-4 text-neutral-400 chevron ${
                      expandedResults.has(item.id) ? 'rotate-180' : ''
                    }`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
              {expandedResults.has(item.id) && item.success && item.email && (
                <div className="px-4 pb-4 border-t border-neutral-100">
                  <pre className="mt-4 whitespace-pre-wrap font-sans text-sm text-neutral-700 leading-relaxed">
                    {item.email}
                  </pre>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {!batchLoading && batchResults.length === 0 && !error && (
        <p className="text-center text-neutral-400 py-12">
          Enter URLs to generate emails
        </p>
      )}

      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={promptSettings}
        onSave={handleSaveSettings}
      />
    </main>
  );
}
