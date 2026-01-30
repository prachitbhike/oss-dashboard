'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

interface EmailEditorProps {
  emailId: string;
  initialContent: string;
  originalContent: string;
  companyName: string;
  onSave?: (content: string) => void;
}

export default function EmailEditor({
  emailId,
  initialContent,
  originalContent,
  companyName,
  onSave,
}: EmailEditorProps) {
  const [content, setContent] = useState(initialContent);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedContentRef = useRef(initialContent);

  // Debounced save function
  const debouncedSave = useCallback(
    async (newContent: string) => {
      // Don't save if content hasn't changed from last save
      if (newContent === lastSavedContentRef.current) {
        return;
      }

      setIsSaving(true);
      setError(null);

      try {
        const response = await fetch(`/api/emails/${emailId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ currentEmail: newContent }),
        });

        if (!response.ok) {
          throw new Error('Failed to save');
        }

        lastSavedContentRef.current = newContent;
        setLastSaved(new Date());
        onSave?.(newContent);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save');
      } finally {
        setIsSaving(false);
      }
    },
    [emailId, onSave]
  );

  // Handle content change with debounce
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newContent = e.target.value;
      setContent(newContent);

      // Clear existing timeout
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      // Set new timeout for debounced save (1 second after user stops typing)
      saveTimeoutRef.current = setTimeout(() => {
        debouncedSave(newContent);
      }, 1000);
    },
    [debouncedSave]
  );

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // Reset to original
  const handleReset = useCallback(() => {
    setContent(originalContent);
    // Clear any pending save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    // Immediately save the reset
    debouncedSave(originalContent);
  }, [originalContent, debouncedSave]);

  const hasChanges = content !== originalContent;

  return (
    <div className="bg-white border border-neutral-200 rounded-lg">
      {/* Header */}
      <div className="p-4 border-b border-neutral-100">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-medium text-neutral-900">{companyName}</h3>
            <div className="flex items-center gap-3 mt-1">
              {isSaving && (
                <span className="text-xs text-neutral-400">Saving...</span>
              )}
              {!isSaving && lastSaved && (
                <span className="text-xs text-neutral-400">
                  Saved {lastSaved.toLocaleTimeString()}
                </span>
              )}
              {error && <span className="text-xs text-red-500">{error}</span>}
              {hasChanges && !isSaving && (
                <span className="text-xs text-amber-600">Modified</span>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowOriginal(!showOriginal)}
              className="btn px-3 py-1.5 text-sm text-neutral-600 border border-neutral-200 rounded-md bg-white"
            >
              {showOriginal ? 'Hide Original' : 'View Original'}
            </button>
            {hasChanges && (
              <button
                onClick={handleReset}
                className="btn px-3 py-1.5 text-sm text-neutral-600 border border-neutral-200 rounded-md bg-white"
              >
                Reset
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Original content (collapsible) */}
      {showOriginal && (
        <div className="px-4 py-3 bg-neutral-50 border-b border-neutral-100">
          <div className="text-xs font-medium text-neutral-500 mb-2">
            Original (AI Generated)
          </div>
          <pre className="whitespace-pre-wrap font-sans text-sm text-neutral-600 leading-relaxed">
            {originalContent}
          </pre>
        </div>
      )}

      {/* Editor */}
      <div className="p-4">
        <textarea
          value={content}
          onChange={handleChange}
          className="w-full min-h-[200px] p-3 bg-white border border-neutral-200 rounded-lg input-field resize-y font-sans text-sm text-neutral-700 leading-relaxed"
          placeholder="Email content..."
        />
      </div>
    </div>
  );
}
