'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from './ui/Button';

interface ScrapeButtonProps {
  companyId?: string;
  label?: string;
  variant?: 'primary' | 'secondary';
  onComplete?: (result: ScrapeResult) => void;
}

interface ScrapeResult {
  scrapeRunId: string;
  results: Array<{
    companyId: string;
    companyName: string;
    pagesScraped: number;
    changesDetected: boolean;
    diffSummary: string | null;
    errors: string[];
  }>;
  summary: {
    totalCompanies: number;
    companiesWithChanges: number;
    totalErrors: number;
  };
}

export function ScrapeButton({
  companyId,
  label = 'Scrape Now',
  variant = 'primary',
  onComplete,
}: ScrapeButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const handleScrape = async () => {
    setLoading(true);
    setStatus('Starting scrape...');

    try {
      const body = companyId ? { companyId } : {};

      const response = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error('Scrape failed');
      }

      const result: ScrapeResult = await response.json();

      if (onComplete) {
        onComplete(result);
      }

      // Show brief status
      const { summary } = result;
      if (summary.companiesWithChanges > 0) {
        setStatus(`Done! ${summary.companiesWithChanges} companies with changes`);
      } else {
        setStatus('Done! No changes detected');
      }

      router.refresh();

      // Clear status after a delay
      setTimeout(() => setStatus(null), 3000);
    } catch (error) {
      setStatus('Scrape failed');
      console.error('Scrape error:', error);
      setTimeout(() => setStatus(null), 3000);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="inline-flex items-center gap-2">
      <Button variant={variant} loading={loading} onClick={handleScrape}>
        {loading ? 'Scraping...' : label}
      </Button>
      {status && (
        <span className="text-sm text-gray-600">{status}</span>
      )}
    </div>
  );
}
