'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

interface ThreadEmail {
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
}

interface ThreadData {
  rootEmail: ThreadEmail;
  followUps: ThreadEmail[];
}

interface EmailThreadProps {
  emailId: string;
  onFollowUpGenerated?: (email: ThreadEmail) => void;
  showGenerateButton?: boolean;
}

export default function EmailThread({
  emailId,
  onFollowUpGenerated,
  showGenerateButton = true,
}: EmailThreadProps) {
  const [thread, setThread] = useState<ThreadData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const fetchThread = useCallback(async () => {
    try {
      const response = await fetch(`/api/emails/${emailId}/thread`);
      if (!response.ok) throw new Error('Failed to fetch thread');
      const data = await response.json();
      setThread(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load thread');
    } finally {
      setLoading(false);
    }
  }, [emailId]);

  useEffect(() => {
    fetchThread();
  }, [fetchThread]);

  const handleGenerateFollowUp = async () => {
    if (!thread) return;

    setGenerating(true);
    setError(null);

    try {
      // Get prompt settings from localStorage
      const savedSettings = localStorage.getItem('outreach-prompt-settings');
      const promptSettings = savedSettings ? JSON.parse(savedSettings) : undefined;

      const response = await fetch(`/api/emails/${thread.rootEmail.id}/follow-up`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ promptSettings }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate follow-up');
      }

      const data = await response.json();

      // Refresh the thread
      await fetchThread();

      // Call the callback with the new email
      onFollowUpGenerated?.(data.email);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate follow-up');
    } finally {
      setGenerating(false);
    }
  };

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  const getPreview = (content: string, maxLength = 100) => {
    const trimmed = content.trim().replace(/\n+/g, ' ');
    if (trimmed.length <= maxLength) return trimmed;
    return trimmed.substring(0, maxLength) + '...';
  };

  if (loading) {
    return (
      <div className="text-center py-4 text-neutral-500 text-sm">
        Loading thread...
      </div>
    );
  }

  if (error && !thread) {
    return (
      <div className="p-3 bg-red-50 border border-red-100 rounded-lg">
        <p className="text-sm text-red-600">{error}</p>
      </div>
    );
  }

  if (!thread) return null;

  const allEmails = [thread.rootEmail, ...thread.followUps];

  return (
    <div className="space-y-4">
      {/* Header with Generate Button */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-neutral-700">
          Email Thread
          {thread.followUps.length > 0 && (
            <span className="ml-2 text-neutral-500 font-normal">
              ({thread.followUps.length} follow-up{thread.followUps.length !== 1 ? 's' : ''})
            </span>
          )}
        </h3>
        {showGenerateButton && (
          <button
            onClick={handleGenerateFollowUp}
            disabled={generating}
            className="btn px-3 py-1.5 text-sm text-white bg-neutral-900 rounded-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {generating ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Generating...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Generate Follow-up
              </>
            )}
          </button>
        )}
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-100 rounded-lg">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* Thread List */}
      <div className="border border-neutral-200 rounded-lg overflow-hidden">
        {allEmails.map((email, index) => {
          const isExpanded = expandedIds.has(email.id);
          const isOriginal = email.followUpNumber === 0;
          const isLast = index === allEmails.length - 1;

          return (
            <div
              key={email.id}
              className={`${!isLast ? 'border-b border-neutral-100' : ''}`}
            >
              {/* Thread Item Header */}
              <div
                className="px-4 py-3 cursor-pointer hover:bg-neutral-50 flex items-start gap-3"
                onClick={() => toggleExpanded(email.id)}
              >
                {/* Thread Line */}
                <div className="flex flex-col items-center pt-1">
                  <div
                    className={`w-2.5 h-2.5 rounded-full ${
                      isOriginal
                        ? 'bg-neutral-900'
                        : 'bg-blue-500'
                    }`}
                  />
                  {!isLast && (
                    <div className="w-0.5 flex-1 bg-neutral-200 mt-1" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`px-2 py-0.5 text-xs rounded font-medium ${
                        isOriginal
                          ? 'bg-neutral-100 text-neutral-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}
                    >
                      {isOriginal ? 'Original' : `Follow-up #${email.followUpNumber}`}
                    </span>
                    <span className="text-xs text-neutral-400">
                      {formatDate(email.createdAt)}
                    </span>
                    {email.currentEmail !== email.originalEmail && (
                      <span className="px-1.5 py-0.5 text-xs bg-amber-100 text-amber-700 rounded">
                        Edited
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-neutral-600 truncate">
                    {getPreview(email.currentEmail)}
                  </p>
                </div>

                {/* Expand/Collapse Icon */}
                <svg
                  className={`w-4 h-4 text-neutral-400 transition-transform ${
                    isExpanded ? 'rotate-180' : ''
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>

              {/* Expanded Content */}
              {isExpanded && (
                <div className="px-4 pb-4 ml-6 border-l-2 border-neutral-100">
                  <div className="bg-neutral-50 rounded-lg p-4">
                    <pre className="whitespace-pre-wrap font-sans text-sm text-neutral-700 leading-relaxed">
                      {email.currentEmail}
                    </pre>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Link
                      href={`/emails/${email.id}`}
                      className="btn px-3 py-1.5 text-xs text-neutral-600 border border-neutral-200 rounded-md bg-white hover:bg-neutral-50"
                    >
                      View Details
                    </Link>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigator.clipboard.writeText(email.currentEmail);
                      }}
                      className="btn px-3 py-1.5 text-xs text-neutral-600 border border-neutral-200 rounded-md bg-white hover:bg-neutral-50"
                    >
                      Copy
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
