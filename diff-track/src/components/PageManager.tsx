'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { Badge } from './ui/Badge';
import { PageType } from '@/types';

interface TrackedPage {
  id: string;
  url: string;
  pageType: string;
  createdAt: number;
}

interface PageManagerProps {
  companyId: string;
  pages: TrackedPage[];
}

const PAGE_TYPE_OPTIONS = [
  { value: 'homepage', label: 'Homepage' },
  { value: 'pricing', label: 'Pricing' },
  { value: 'careers', label: 'Careers' },
  { value: 'about', label: 'About' },
  { value: 'customers', label: 'Customers' },
  { value: 'product', label: 'Product' },
  { value: 'blog', label: 'Blog' },
  { value: 'other', label: 'Other' },
];

const PAGE_TYPE_COLORS: Record<string, 'default' | 'success' | 'warning' | 'error' | 'info'> = {
  homepage: 'info',
  pricing: 'success',
  careers: 'warning',
  about: 'default',
  customers: 'success',
  product: 'info',
  blog: 'default',
  other: 'default',
};

export function PageManager({ companyId, pages }: PageManagerProps) {
  const router = useRouter();
  const [showAddForm, setShowAddForm] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [newPageType, setNewPageType] = useState<PageType>('other');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAddPage = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Validate URL
      try {
        new URL(newUrl);
      } catch {
        throw new Error('Please enter a valid URL');
      }

      const response = await fetch('/api/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          url: newUrl,
          pageType: newPageType,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to add page');
      }

      setNewUrl('');
      setNewPageType('other');
      setShowAddForm(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePage = async (pageId: string) => {
    if (!confirm('Are you sure you want to remove this page?')) return;

    try {
      const response = await fetch(`/api/pages?id=${pageId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete page');
      }

      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete page');
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">Tracked Pages</h3>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setShowAddForm(!showAddForm)}
        >
          {showAddForm ? 'Cancel' : 'Add Page'}
        </Button>
      </div>

      {showAddForm && (
        <form onSubmit={handleAddPage} className="mb-4 p-4 bg-gray-50 rounded-lg">
          {error && (
            <p className="text-sm text-red-600 mb-3">{error}</p>
          )}
          <div className="flex gap-3">
            <div className="flex-1">
              <Input
                placeholder="https://example.com/page"
                value={newUrl}
                onChange={e => setNewUrl(e.target.value)}
                required
              />
            </div>
            <div className="w-36">
              <Select
                options={PAGE_TYPE_OPTIONS}
                value={newPageType}
                onChange={e => setNewPageType(e.target.value as PageType)}
              />
            </div>
            <Button type="submit" loading={loading}>
              Add
            </Button>
          </div>
        </form>
      )}

      {pages.length === 0 ? (
        <p className="text-gray-500 text-sm">No pages tracked yet. Add some pages to start monitoring.</p>
      ) : (
        <div className="space-y-2">
          {pages.map(page => (
            <div
              key={page.id}
              className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Badge variant={PAGE_TYPE_COLORS[page.pageType] || 'default'}>
                  {page.pageType}
                </Badge>
                <a
                  href={page.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:underline truncate"
                >
                  {page.url}
                </a>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-red-600 hover:text-red-700 hover:bg-red-50 ml-2"
                onClick={() => handleDeletePage(page.id)}
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
