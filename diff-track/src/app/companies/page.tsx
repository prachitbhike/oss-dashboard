import Link from 'next/link';
import { db, schema } from '@/lib/db';
import { desc } from 'drizzle-orm';
import { Button } from '@/components/ui/Button';
import { CompanyCard } from '@/components/CompanyCard';

export const dynamic = 'force-dynamic';

async function getCompanies() {
  const companies = await db
    .select()
    .from(schema.companies)
    .orderBy(desc(schema.companies.updatedAt));

  // Get page counts
  const allPages = await db.select().from(schema.trackedPages);
  const pageCountByCompany = allPages.reduce((acc, page) => {
    acc[page.companyId] = (acc[page.companyId] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Get latest diffs
  const allDiffs = await db
    .select()
    .from(schema.diffs)
    .orderBy(desc(schema.diffs.createdAt));

  const latestDiffByCompany = allDiffs.reduce((acc, diff) => {
    if (!acc[diff.companyId]) {
      acc[diff.companyId] = diff;
    }
    return acc;
  }, {} as Record<string, typeof allDiffs[0]>);

  return companies.map(company => ({
    ...company,
    pageCount: pageCountByCompany[company.id] || 0,
    lastDiff: latestDiffByCompany[company.id]
      ? {
          summary: latestDiffByCompany[company.id].summary,
          createdAt: latestDiffByCompany[company.id].createdAt,
          changesDetected: JSON.parse(latestDiffByCompany[company.id].changesJson).length > 0,
        }
      : undefined,
  }));
}

export default async function CompaniesPage() {
  const companies = await getCompanies();

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Companies</h1>
          <p className="text-gray-600 mt-1">
            {companies.length} {companies.length === 1 ? 'company' : 'companies'} tracked
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/companies/batch">
            <Button variant="secondary">Batch Import</Button>
          </Link>
          <Link href="/companies/new">
            <Button>Add Company</Button>
          </Link>
        </div>
      </div>

      {companies.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <p className="text-gray-500">No companies tracked yet.</p>
          <Link href="/companies/new">
            <Button className="mt-4">Add Your First Company</Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {companies.map(company => (
            <CompanyCard key={company.id} company={company} />
          ))}
        </div>
      )}
    </div>
  );
}
