'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import Navigation from '@/components/layout/Navigation';
import { EditHistoryItem } from '@/components/email/DiffViewer';
import EmailEditor from '@/components/email/EmailEditor';
import EmailThread from '@/components/email/EmailThread';

interface DiffOperation {
  type: 'delete' | 'insert' | 'equal';
  text: string;
}

interface Edit {
  id: string;
  emailId: string;
  previousContent: string;
  newContent: string;
  diffOperations: DiffOperation[];
  editTimestamp: number;
}

interface Email {
  id: string;
  companyName: string;
  originalEmail: string;
  currentEmail: string;
  parentEmailId: string | null;
  followUpNumber: number;
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function EmailDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const [email, setEmail] = useState<Email | null>(null);
  const [edits, setEdits] = useState<Edit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedEditId, setExpandedEditId] = useState<string | null>(null);
  const [threadKey, setThreadKey] = useState(0);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch(`/api/emails/${id}/edits`);
        if (!response.ok) throw new Error('Failed to fetch email history');
        const data = await response.json();
        setEmail(data.email);
        setEdits(data.edits);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id]);

  const refreshData = async () => {
    const response = await fetch(`/api/emails/${id}/edits`);
    if (response.ok) {
      const data = await response.json();
      setEmail(data.email);
      setEdits(data.edits);
    }
  };

  if (loading) {
    return (
      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="text-center py-12 text-neutral-500">Loading...</div>
      </main>
    );
  }

  if (error || !email) {
    return (
      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-lg">
          <p className="text-sm text-red-600">{error || 'Email not found'}</p>
        </div>
        <Link
          href="/emails"
          className="text-sm text-neutral-600 hover:text-neutral-900"
        >
          &larr; Back to emails
        </Link>
      </main>
    );
  }

  const isFollowUp = email.followUpNumber > 0;
  const emailLabel = isFollowUp
    ? `Follow-up #${email.followUpNumber}`
    : 'Original Email';

  const handleFollowUpGenerated = () => {
    setThreadKey((prev) => prev + 1);
  };

  return (
    <main className="max-w-4xl mx-auto px-6 py-12">
      <div className="mb-8">
        <Link
          href="/emails"
          className="text-sm text-neutral-500 hover:text-neutral-700 mb-4 inline-block"
        >
          &larr; Back to saved emails
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold text-neutral-900">
                {email.companyName}
              </h1>
              <span
                className={`px-2 py-0.5 text-xs rounded font-medium ${
                  isFollowUp
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-neutral-100 text-neutral-700'
                }`}
              >
                {emailLabel}
              </span>
            </div>
            <p className="text-neutral-500 mt-1">Edit history and version tracking</p>
          </div>
        </div>
      </div>

      <div className="mb-8">
        <Navigation />
      </div>

      {/* Email Thread */}
      <div className="mb-8">
        <EmailThread
          key={threadKey}
          emailId={id}
          onFollowUpGenerated={handleFollowUpGenerated}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Editor */}
        <div>
          <h2 className="text-lg font-medium text-neutral-900 mb-4">
            Current Version
          </h2>
          <EmailEditor
            emailId={email.id}
            initialContent={email.currentEmail}
            originalContent={email.originalEmail}
            companyName={email.companyName}
            onSave={refreshData}
          />
        </div>

        {/* Edit history */}
        <div>
          <h2 className="text-lg font-medium text-neutral-900 mb-4">
            Edit History
            {edits.length > 0 && (
              <span className="ml-2 text-sm font-normal text-neutral-500">
                ({edits.length} edit{edits.length !== 1 ? 's' : ''})
              </span>
            )}
          </h2>

          {edits.length === 0 ? (
            <div className="text-center py-8 text-neutral-500 border border-dashed border-neutral-200 rounded-lg">
              No edits yet. Start editing to track changes.
            </div>
          ) : (
            <div className="space-y-3">
              {edits.map((edit) => (
                <EditHistoryItem
                  key={edit.id}
                  edit={edit}
                  isExpanded={expandedEditId === edit.id}
                  onToggle={() =>
                    setExpandedEditId(
                      expandedEditId === edit.id ? null : edit.id
                    )
                  }
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
