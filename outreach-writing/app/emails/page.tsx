'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Navigation from '@/components/layout/Navigation';
import EmailEditor from '@/components/email/EmailEditor';
import SearchInput from '@/components/ui/SearchInput';
import { useSearch } from '@/hooks/useSearch';

interface Email {
  id: string;
  url: string;
  companyName: string;
  companySummary: string | null;
  originalEmail: string;
  currentEmail: string;
  createdAt: number;
  updatedAt: number;
  isArchived: boolean;
  parentEmailId: string | null;
  followUpNumber: number;
  followUpCount: number;
}

export default function SavedEmailsPage() {
  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [generatingFollowUp, setGeneratingFollowUp] = useState<string | null>(null);

  const {
    searchQuery,
    setSearchQuery,
    filteredItems: filteredEmails,
    isSearching,
    hasResults,
  } = useSearch({
    items: emails,
    searchFields: ['companyName', 'url'],
  });

  const fetchEmails = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/emails${showArchived ? '?includeArchived=true' : ''}`
      );
      if (!response.ok) throw new Error('Failed to fetch emails');
      const data = await response.json();
      setEmails(data.emails);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [showArchived]);

  useEffect(() => {
    fetchEmails();
  }, [fetchEmails]);

  const handleArchive = async (id: string, archive: boolean) => {
    try {
      const response = await fetch(`/api/emails/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isArchived: archive }),
      });
      if (!response.ok) throw new Error('Failed to update');
      fetchEmails();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to archive');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this email?')) return;
    try {
      const response = await fetch(`/api/emails/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete');
      fetchEmails();
      if (expandedId === id) setExpandedId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  const handleCopy = async (email: string) => {
    await navigator.clipboard.writeText(email);
  };

  const handleGenerateFollowUp = async (emailId: string) => {
    setGeneratingFollowUp(emailId);
    setError(null);

    try {
      // Get prompt settings from localStorage
      const savedSettings = localStorage.getItem('outreach-prompt-settings');
      const promptSettings = savedSettings ? JSON.parse(savedSettings) : undefined;

      const response = await fetch(`/api/emails/${emailId}/follow-up`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ promptSettings }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate follow-up');
      }

      // Refresh the emails list
      fetchEmails();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate follow-up');
    } finally {
      setGeneratingFollowUp(null);
    }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  return (
    <main className="max-w-4xl mx-auto px-6 py-12">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-neutral-900 mb-2">
          Saved Emails
        </h1>
        <p className="text-neutral-500">
          Edit and manage your generated outreach emails
        </p>
      </div>

      <div className="mb-6 flex items-center justify-between">
        <Navigation />
        <label className="flex items-center gap-2 text-sm text-neutral-600 ml-6">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="rounded border-neutral-300"
          />
          Show archived
        </label>
      </div>

      {!loading && emails.length > 0 && (
        <div className="mb-6">
          <SearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search by company name or URL..."
          />
          {isSearching && (
            <p className="text-sm text-neutral-500 mt-2">
              Showing {filteredEmails.length} of {emails.length} emails
            </p>
          )}
        </div>
      )}

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-lg">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {loading && (
        <div className="text-center py-12 text-neutral-500">Loading...</div>
      )}

      {!loading && emails.length === 0 && (
        <div className="text-center py-12">
          <p className="text-neutral-500 mb-4">No saved emails yet</p>
          <Link
            href="/"
            className="text-sm text-neutral-900 underline hover:no-underline"
          >
            Generate your first email
          </Link>
        </div>
      )}

      {!loading && emails.length > 0 && isSearching && !hasResults && (
        <div className="text-center py-12">
          <p className="text-neutral-500 mb-2">No results match "{searchQuery}"</p>
          <button
            onClick={() => setSearchQuery('')}
            className="text-sm text-neutral-900 underline hover:no-underline"
          >
            Clear search
          </button>
        </div>
      )}

      {!loading && emails.length > 0 && (!isSearching || hasResults) && (
        <div className="space-y-4">
          {filteredEmails.map((email) => (
            <div
              key={email.id}
              className={`border rounded-lg ${
                email.isArchived
                  ? 'bg-neutral-50 border-neutral-200 opacity-60'
                  : 'bg-white border-neutral-200'
              }`}
            >
              <div
                className="p-4 cursor-pointer hover:bg-neutral-50"
                onClick={() =>
                  setExpandedId(expandedId === email.id ? null : email.id)
                }
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-neutral-900 truncate">
                        {email.companyName}
                      </h3>
                      {email.currentEmail !== email.originalEmail && (
                        <span className="px-2 py-0.5 text-xs bg-amber-100 text-amber-700 rounded">
                          Edited
                        </span>
                      )}
                      {email.isArchived && (
                        <span className="px-2 py-0.5 text-xs bg-neutral-200 text-neutral-600 rounded">
                          Archived
                        </span>
                      )}
                      {email.followUpCount > 0 && (
                        <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded">
                          {email.followUpCount} follow-up{email.followUpCount !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    {email.companySummary && (
                      <p className="text-sm text-neutral-500 mt-1 truncate">
                        {email.companySummary}
                      </p>
                    )}
                    <p className="text-xs text-neutral-400 mt-1">
                      Created {formatDate(email.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopy(email.currentEmail);
                      }}
                      className="btn px-3 py-1.5 text-sm text-neutral-600 border border-neutral-200 rounded-md bg-white"
                    >
                      Copy
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleGenerateFollowUp(email.id);
                      }}
                      disabled={generatingFollowUp === email.id}
                      className="btn px-3 py-1.5 text-sm text-neutral-600 border border-neutral-200 rounded-md bg-white disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                    >
                      {generatingFollowUp === email.id ? (
                        <>
                          <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          <span>...</span>
                        </>
                      ) : (
                        'Follow-up'
                      )}
                    </button>
                    <svg
                      className={`w-4 h-4 text-neutral-400 chevron ${
                        expandedId === email.id ? 'rotate-180' : ''
                      }`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </div>
                </div>
              </div>

              {expandedId === email.id && (
                <div className="border-t border-neutral-100">
                  <div className="p-4">
                    <EmailEditor
                      emailId={email.id}
                      initialContent={email.currentEmail}
                      originalContent={email.originalEmail}
                      companyName={email.companyName}
                      onSave={() => fetchEmails()}
                    />
                  </div>
                  <div className="px-4 pb-4 flex items-center justify-between">
                    <div className="flex gap-2">
                      <Link
                        href={`/emails/${email.id}`}
                        className="btn px-3 py-1.5 text-sm text-neutral-600 border border-neutral-200 rounded-md bg-white"
                      >
                        View History
                      </Link>
                      <a
                        href={email.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn px-3 py-1.5 text-sm text-neutral-600 border border-neutral-200 rounded-md bg-white"
                      >
                        Visit Site
                      </a>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() =>
                          handleArchive(email.id, !email.isArchived)
                        }
                        className="btn px-3 py-1.5 text-sm text-neutral-600 border border-neutral-200 rounded-md bg-white"
                      >
                        {email.isArchived ? 'Unarchive' : 'Archive'}
                      </button>
                      <button
                        onClick={() => handleDelete(email.id)}
                        className="btn px-3 py-1.5 text-sm text-red-600 border border-red-200 rounded-md bg-white"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
