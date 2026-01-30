'use client';

import { useState, useEffect } from 'react';
import Navigation from '@/components/layout/Navigation';

interface Pattern {
  id: string;
  type: string;
  text: string;
  replacement: string | null;
  count: number;
  firstSeen: number;
  lastSeen: number;
}

interface Suggestion {
  type: 'avoid' | 'prefer' | 'replace';
  original?: string;
  suggestion: string;
  occurrences: number;
}

interface AnalysisData {
  summary: {
    totalEmails: number;
    totalEdits: number;
    totalPatterns: number;
    editedEmailsCount: number;
    averageEditsPerEmail: number;
  };
  patterns: {
    deletions: Pattern[];
    insertions: Pattern[];
    replacements: Pattern[];
    recent: Pattern[];
  };
  suggestions: Suggestion[];
}

export default function AnalysisPage() {
  const [data, setData] = useState<AnalysisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<
    'overview' | 'deletions' | 'insertions' | 'replacements'
  >('overview');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch('/api/analysis');
        if (!response.ok) throw new Error('Failed to fetch analysis');
        const result = await response.json();
        setData(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString();
  };

  return (
    <main className="max-w-4xl mx-auto px-6 py-12">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-neutral-900 mb-2">
          Edit Analysis
        </h1>
        <p className="text-neutral-500">
          Track patterns in how you edit emails to improve generation
        </p>
      </div>

      <div className="mb-8">
        <Navigation />
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-lg">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {loading && (
        <div className="text-center py-12 text-neutral-500">Loading...</div>
      )}

      {data && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-white border border-neutral-200 rounded-lg p-4">
              <div className="text-2xl font-semibold text-neutral-900">
                {data.summary.totalEmails}
              </div>
              <div className="text-sm text-neutral-500">Total Emails</div>
            </div>
            <div className="bg-white border border-neutral-200 rounded-lg p-4">
              <div className="text-2xl font-semibold text-neutral-900">
                {data.summary.totalEdits}
              </div>
              <div className="text-sm text-neutral-500">Total Edits</div>
            </div>
            <div className="bg-white border border-neutral-200 rounded-lg p-4">
              <div className="text-2xl font-semibold text-neutral-900">
                {data.summary.editedEmailsCount}
              </div>
              <div className="text-sm text-neutral-500">Edited Emails</div>
            </div>
            <div className="bg-white border border-neutral-200 rounded-lg p-4">
              <div className="text-2xl font-semibold text-neutral-900">
                {data.summary.averageEditsPerEmail.toFixed(1)}
              </div>
              <div className="text-sm text-neutral-500">Avg Edits/Email</div>
            </div>
          </div>

          {/* Prompt suggestions */}
          {data.suggestions.length > 0 && (
            <div className="mb-8">
              <h2 className="text-lg font-medium text-neutral-900 mb-4">
                Prompt Improvement Suggestions
              </h2>
              <div className="bg-amber-50 border border-amber-100 rounded-lg p-4">
                <ul className="space-y-2">
                  {data.suggestions.map((suggestion, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <span
                        className={`px-2 py-0.5 text-xs rounded ${
                          suggestion.type === 'avoid'
                            ? 'bg-red-100 text-red-700'
                            : suggestion.type === 'prefer'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-blue-100 text-blue-700'
                        }`}
                      >
                        {suggestion.type}
                      </span>
                      <span className="text-sm text-neutral-700">
                        {suggestion.suggestion}
                      </span>
                      <span className="text-xs text-neutral-400">
                        ({suggestion.occurrences}x)
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Pattern tabs */}
          <div className="flex gap-1 p-1 bg-neutral-100 rounded-lg w-fit mb-6">
            {(['overview', 'deletions', 'insertions', 'replacements'] as const).map(
              (tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 text-sm font-medium rounded-md transition-colors capitalize ${
                    activeTab === tab
                      ? 'bg-white text-neutral-900 shadow-sm'
                      : 'text-neutral-500 hover:text-neutral-700'
                  }`}
                >
                  {tab}
                </button>
              )
            )}
          </div>

          {/* Overview tab */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {data.patterns.recent.length === 0 ? (
                <div className="text-center py-8 text-neutral-500 border border-dashed border-neutral-200 rounded-lg">
                  No edit patterns detected yet. Start editing emails to see
                  patterns here.
                </div>
              ) : (
                <>
                  <div>
                    <h3 className="text-sm font-medium text-neutral-600 mb-3">
                      Recent Patterns
                    </h3>
                    <div className="space-y-2">
                      {data.patterns.recent.slice(0, 5).map((pattern) => (
                        <PatternRow key={pattern.id} pattern={pattern} />
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Deletions tab */}
          {activeTab === 'deletions' && (
            <div>
              <p className="text-sm text-neutral-500 mb-4">
                Phrases that users frequently remove from AI-generated emails
              </p>
              {data.patterns.deletions.length === 0 ? (
                <EmptyState />
              ) : (
                <div className="space-y-2">
                  {data.patterns.deletions.map((pattern) => (
                    <PatternRow key={pattern.id} pattern={pattern} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Insertions tab */}
          {activeTab === 'insertions' && (
            <div>
              <p className="text-sm text-neutral-500 mb-4">
                Phrases that users frequently add to their emails
              </p>
              {data.patterns.insertions.length === 0 ? (
                <EmptyState />
              ) : (
                <div className="space-y-2">
                  {data.patterns.insertions.map((pattern) => (
                    <PatternRow key={pattern.id} pattern={pattern} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Replacements tab */}
          {activeTab === 'replacements' && (
            <div>
              <p className="text-sm text-neutral-500 mb-4">
                Phrases that users frequently replace with alternatives
              </p>
              {data.patterns.replacements.length === 0 ? (
                <EmptyState />
              ) : (
                <div className="space-y-2">
                  {data.patterns.replacements.map((pattern) => (
                    <div
                      key={pattern.id}
                      className="bg-white border border-neutral-200 rounded-lg p-4"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded">
                          replacement
                        </span>
                        <span className="text-sm text-neutral-500">
                          {pattern.count} occurrence{pattern.count !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="bg-red-50 text-red-700 px-2 py-1 rounded line-through">
                          {pattern.text}
                        </span>
                        <span className="text-neutral-400">&rarr;</span>
                        <span className="bg-green-50 text-green-700 px-2 py-1 rounded">
                          {pattern.replacement}
                        </span>
                      </div>
                      <div className="mt-2 text-xs text-neutral-400">
                        Last seen: {formatDate(pattern.lastSeen)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </main>
  );
}

function PatternRow({ pattern }: { pattern: Pattern }) {
  return (
    <div className="bg-white border border-neutral-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <span
          className={`px-2 py-0.5 text-xs rounded ${
            pattern.type === 'deletion'
              ? 'bg-red-100 text-red-700'
              : pattern.type === 'insertion'
                ? 'bg-green-100 text-green-700'
                : 'bg-blue-100 text-blue-700'
          }`}
        >
          {pattern.type}
        </span>
        <span className="text-sm text-neutral-500">
          {pattern.count} occurrence{pattern.count !== 1 ? 's' : ''}
        </span>
      </div>
      <div className="text-sm text-neutral-700 font-mono bg-neutral-50 p-2 rounded">
        {pattern.text}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-8 text-neutral-500 border border-dashed border-neutral-200 rounded-lg">
      No patterns in this category yet.
    </div>
  );
}
