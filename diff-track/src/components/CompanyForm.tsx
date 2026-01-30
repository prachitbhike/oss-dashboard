'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { Card } from './ui/Card';
import { PageType, DiscoveryResult } from '@/types';

interface PageInput {
  url: string;
  pageType: PageType;
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

interface CompanyFormProps {
  initialData?: {
    id: string;
    name: string;
    websiteUrl: string;
    notes: string | null;
    pages?: Array<{ id: string; url: string; pageType: string }>;
  };
}

export function CompanyForm({ initialData }: CompanyFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [error, setError] = useState('');

  const [name, setName] = useState(initialData?.name || '');
  const [websiteUrl, setWebsiteUrl] = useState(initialData?.websiteUrl || '');
  const [notes, setNotes] = useState(initialData?.notes || '');
  const [pages, setPages] = useState<PageInput[]>(
    initialData?.pages?.map(p => ({ url: p.url, pageType: p.pageType as PageType })) || [
      { url: '', pageType: 'homepage' },
    ]
  );

  const discoverPages = async () => {
    if (!websiteUrl) {
      setError('Please enter a website URL first');
      return;
    }

    setDiscovering(true);
    setError('');

    try {
      const response = await fetch('/api/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl: websiteUrl }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Discovery failed');
      }

      const result: DiscoveryResult = await response.json();

      // Update name if discovered and not already set
      if (result.suggestedName && !name) {
        setName(result.suggestedName);
      }

      // Update pages with discovered pages (only those that exist)
      const existingPages = result.discoveredPages
        .filter(p => p.exists)
        .map(p => ({ url: p.url, pageType: p.pageType }));

      if (existingPages.length > 0) {
        setPages(existingPages);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Discovery failed');
    } finally {
      setDiscovering(false);
    }
  };

  const addPage = () => {
    setPages([...pages, { url: '', pageType: 'other' }]);
  };

  const removePage = (index: number) => {
    setPages(pages.filter((_, i) => i !== index));
  };

  const updatePage = (index: number, field: keyof PageInput, value: string) => {
    const newPages = [...pages];
    newPages[index] = { ...newPages[index], [field]: value };
    setPages(newPages);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Validate URL
      try {
        new URL(websiteUrl);
      } catch {
        throw new Error('Please enter a valid website URL');
      }

      // Filter out empty pages
      const validPages = pages.filter(p => p.url.trim() !== '');

      // Validate page URLs
      for (const page of validPages) {
        try {
          new URL(page.url);
        } catch {
          throw new Error(`Invalid URL: ${page.url}`);
        }
      }

      const body = {
        name,
        websiteUrl,
        notes: notes || null,
        pages: validPages,
      };

      const url = initialData
        ? `/api/companies/${initialData.id}`
        : '/api/companies';
      const method = initialData ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save company');
      }

      const company = await response.json();
      router.push(`/companies/${company.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      <Card>
        <h2 className="text-lg font-semibold mb-4">Company Details</h2>
        <div className="space-y-4">
          <Input
            label="Company Name"
            id="name"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Acme Inc"
            required
          />

          <div>
            <label htmlFor="websiteUrl" className="block text-sm font-medium text-gray-700 mb-1">
              Website URL
            </label>
            <div className="flex gap-2">
              <input
                id="websiteUrl"
                type="url"
                value={websiteUrl}
                onChange={e => setWebsiteUrl(e.target.value)}
                placeholder="https://acme.com"
                required
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <Button
                type="button"
                variant="secondary"
                onClick={discoverPages}
                disabled={discovering || !websiteUrl}
                className="whitespace-nowrap"
              >
                {discovering ? 'Discovering...' : 'Discover Pages'}
              </Button>
            </div>
          </div>

          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
              Notes (optional)
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Any notes about this company..."
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              rows={3}
            />
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">Pages to Track</h2>
          <Button type="button" variant="secondary" size="sm" onClick={addPage}>
            Add Page
          </Button>
        </div>

        <div className="space-y-3">
          {pages.map((page, index) => (
            <div key={index} className="flex gap-3 items-start">
              <div className="flex-1">
                <Input
                  placeholder="https://acme.com/pricing"
                  value={page.url}
                  onChange={e => updatePage(index, 'url', e.target.value)}
                />
              </div>
              <div className="w-36">
                <Select
                  options={PAGE_TYPE_OPTIONS}
                  value={page.pageType}
                  onChange={e => updatePage(index, 'pageType', e.target.value)}
                />
              </div>
              {pages.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removePage(index)}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  Remove
                </Button>
              )}
            </div>
          ))}
        </div>

        <p className="text-sm text-gray-500 mt-4">
          Add the URLs you want to track for this company. Common pages include homepage, pricing, careers, and customers.
        </p>
      </Card>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="secondary" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" loading={loading}>
          {initialData ? 'Save Changes' : 'Add Company'}
        </Button>
      </div>
    </form>
  );
}
