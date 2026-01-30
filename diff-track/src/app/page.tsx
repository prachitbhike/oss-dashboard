import Link from 'next/link';
import { db, schema } from '@/lib/db';
import { desc } from 'drizzle-orm';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ScrapeButton } from '@/components/ScrapeButton';
import { formatDistanceToNow } from 'date-fns';

export const dynamic = 'force-dynamic';

async function getDashboardData() {
  // Get all companies
  const companies = await db
    .select()
    .from(schema.companies)
    .orderBy(desc(schema.companies.updatedAt));

  // Get recent diffs
  const recentDiffs = await db
    .select()
    .from(schema.diffs)
    .orderBy(desc(schema.diffs.createdAt))
    .limit(10);

  // Get page counts for companies
  const allPages = await db.select().from(schema.trackedPages);
  const pageCountByCompany = allPages.reduce((acc, page) => {
    acc[page.companyId] = (acc[page.companyId] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Match diffs with companies
  const diffsWithCompanies = recentDiffs.map(diff => {
    const company = companies.find(c => c.id === diff.companyId);
    return {
      ...diff,
      companyName: company?.name || 'Unknown',
      changes: JSON.parse(diff.changesJson),
    };
  });

  return {
    companies,
    recentDiffs: diffsWithCompanies,
    pageCountByCompany,
    stats: {
      totalCompanies: companies.length,
      totalPages: allPages.length,
      companiesWithChanges: new Set(recentDiffs.map(d => d.companyId)).size,
    },
  };
}

export default async function DashboardPage() {
  const { companies, recentDiffs, pageCountByCompany, stats } = await getDashboardData();

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600 mt-1">Track company changes and signals</p>
        </div>
        <ScrapeButton label="Scrape All Companies" />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <p className="text-sm text-gray-500">Total Companies</p>
          <p className="text-3xl font-bold text-gray-900">{stats.totalCompanies}</p>
        </Card>
        <Card>
          <p className="text-sm text-gray-500">Tracked Pages</p>
          <p className="text-3xl font-bold text-gray-900">{stats.totalPages}</p>
        </Card>
        <Card>
          <p className="text-sm text-gray-500">Companies with Changes</p>
          <p className="text-3xl font-bold text-gray-900">{stats.companiesWithChanges}</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Recent Changes */}
        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Recent Changes</h2>
          {recentDiffs.length === 0 ? (
            <Card>
              <p className="text-gray-500 text-center py-4">
                No changes detected yet. Scrape companies to see changes.
              </p>
            </Card>
          ) : (
            <div className="space-y-3">
              {recentDiffs.map(diff => (
                <Link key={diff.id} href={`/companies/${diff.companyId}`}>
                  <Card className="hover:border-blue-300 hover:shadow-md transition-all cursor-pointer">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium text-gray-900">{diff.companyName}</p>
                        <p className="text-sm text-gray-500 mt-0.5">
                          {formatDistanceToNow(new Date(diff.createdAt), { addSuffix: true })}
                        </p>
                      </div>
                      <Badge variant="warning">{diff.changes.length} changes</Badge>
                    </div>
                    <p className="text-sm text-gray-700 mt-2 line-clamp-2">{diff.summary}</p>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Companies */}
        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-gray-900">Companies</h2>
            <Link href="/companies/new">
              <Button variant="secondary" size="sm">Add Company</Button>
            </Link>
          </div>
          {companies.length === 0 ? (
            <Card>
              <div className="text-center py-8">
                <p className="text-gray-500">No companies tracked yet.</p>
                <Link href="/companies/new">
                  <Button className="mt-4">Add Your First Company</Button>
                </Link>
              </div>
            </Card>
          ) : (
            <div className="space-y-3">
              {companies.slice(0, 5).map(company => (
                <Link key={company.id} href={`/companies/${company.id}`}>
                  <Card className="hover:border-blue-300 hover:shadow-md transition-all cursor-pointer">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium text-gray-900">{company.name}</p>
                        <p className="text-sm text-gray-500">
                          {pageCountByCompany[company.id] || 0} pages tracked
                        </p>
                      </div>
                      <span className="text-xs text-gray-400">
                        {formatDistanceToNow(new Date(company.updatedAt), { addSuffix: true })}
                      </span>
                    </div>
                  </Card>
                </Link>
              ))}
              {companies.length > 5 && (
                <Link href="/companies">
                  <Button variant="ghost" className="w-full">
                    View all {companies.length} companies
                  </Button>
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
