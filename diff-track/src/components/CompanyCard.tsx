'use client';

import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { Card } from './ui/Card';
import { Badge } from './ui/Badge';

interface Company {
  id: string;
  name: string;
  websiteUrl: string;
  notes: string | null;
  createdAt: number;
  updatedAt: number;
  pageCount?: number;
  lastDiff?: {
    summary: string;
    createdAt: number;
    changesDetected: boolean;
  };
}

interface CompanyCardProps {
  company: Company;
}

export function CompanyCard({ company }: CompanyCardProps) {
  const domain = new URL(company.websiteUrl).hostname.replace('www.', '');

  return (
    <Link href={`/companies/${company.id}`}>
      <Card className="hover:border-blue-300 hover:shadow-md transition-all cursor-pointer">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{company.name}</h3>
            <p className="text-sm text-gray-500 mt-0.5">{domain}</p>
          </div>
          {company.lastDiff?.changesDetected && (
            <Badge variant="warning">Changes</Badge>
          )}
        </div>

        {company.notes && (
          <p className="text-sm text-gray-600 mt-2 line-clamp-2">{company.notes}</p>
        )}

        <div className="mt-4 flex items-center justify-between text-xs text-gray-500">
          <span>
            {company.pageCount !== undefined
              ? `${company.pageCount} page${company.pageCount === 1 ? '' : 's'} tracked`
              : 'No pages tracked'}
          </span>
          <span>
            Updated {formatDistanceToNow(new Date(company.updatedAt), { addSuffix: true })}
          </span>
        </div>

        {company.lastDiff && company.lastDiff.changesDetected && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <p className="text-sm text-gray-700 line-clamp-2">
              {company.lastDiff.summary}
            </p>
          </div>
        )}
      </Card>
    </Link>
  );
}
