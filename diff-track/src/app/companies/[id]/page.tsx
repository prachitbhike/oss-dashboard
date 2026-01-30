import { notFound } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { db, schema } from '@/lib/db';
import { eq, desc, inArray } from 'drizzle-orm';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PageManager } from '@/components/PageManager';
import { ScrapeButton } from '@/components/ScrapeButton';
import { SignalCard } from '@/components/SignalCard';
import { DiffViewer } from '@/components/DiffViewer';
import { ExtractedSignals } from '@/types';

export const dynamic = 'force-dynamic';

async function getCompanyData(id: string) {
  const company = await db
    .select()
    .from(schema.companies)
    .where(eq(schema.companies.id, id))
    .limit(1);

  if (company.length === 0) {
    return null;
  }

  const pages = await db
    .select()
    .from(schema.trackedPages)
    .where(eq(schema.trackedPages.companyId, id));

  // Get latest signals for each page
  const pageIds = pages.map(p => p.id);
  let latestSignals: ExtractedSignals | null = null;

  if (pageIds.length > 0) {
    const snapshots = await db
      .select()
      .from(schema.snapshots)
      .where(inArray(schema.snapshots.trackedPageId, pageIds))
      .orderBy(desc(schema.snapshots.scrapedAt));

    // Get most recent snapshot per page
    const latestSnapshotPerPage = new Map<string, string>();
    for (const snapshot of snapshots) {
      if (!latestSnapshotPerPage.has(snapshot.trackedPageId)) {
        latestSnapshotPerPage.set(snapshot.trackedPageId, snapshot.id);
      }
    }

    const snapshotIds = Array.from(latestSnapshotPerPage.values());
    if (snapshotIds.length > 0) {
      const signals = await db
        .select()
        .from(schema.signals)
        .where(inArray(schema.signals.snapshotId, snapshotIds));

      if (signals.length > 0) {
        // Merge signals from all pages
        const signalsList = signals.map(s => JSON.parse(s.signalsJson) as ExtractedSignals);

        // Simple merge - take first non-null values
        latestSignals = {
          product: {
            name: signalsList.find(s => s.product.name)?.product.name ?? null,
            tagline: signalsList.find(s => s.product.tagline)?.product.tagline ?? null,
            description: signalsList.find(s => s.product.description)?.product.description ?? null,
            features: [...new Set(signalsList.flatMap(s => s.product.features))],
            integrations: [...new Set(signalsList.flatMap(s => s.product.integrations))],
          },
          pricing: {
            model: signalsList.find(s => s.pricing.model !== 'unknown')?.pricing.model ?? 'unknown',
            tiers: signalsList.find(s => s.pricing.tiers.length > 0)?.pricing.tiers ?? [],
            hasFreeTier: signalsList.some(s => s.pricing.hasFreeTier),
            hasTrial: signalsList.some(s => s.pricing.hasTrial),
          },
          customers: {
            logoNames: [...new Set(signalsList.flatMap(s => s.customers.logoNames))],
            testimonialCompanies: [...new Set(signalsList.flatMap(s => s.customers.testimonialCompanies))],
            caseStudies: [...new Set(signalsList.flatMap(s => s.customers.caseStudies))],
            metrics: [...new Set(signalsList.flatMap(s => s.customers.metrics))],
          },
          jobs: {
            openings: signalsList.find(s => s.jobs.openings.length > 0)?.jobs.openings ?? [],
            totalCount: Math.max(...signalsList.map(s => s.jobs.totalCount), 0),
            departments: [...new Set(signalsList.flatMap(s => s.jobs.departments))],
          },
          team: {
            founders: [...new Set(signalsList.flatMap(s => s.team.founders))],
            teamSize: signalsList.find(s => s.team.teamSize)?.team.teamSize ?? null,
            recentHires: [...new Set(signalsList.flatMap(s => s.team.recentHires))],
          },
          funding: {
            mentioned: signalsList.some(s => s.funding.mentioned),
            stage: signalsList.find(s => s.funding.stage)?.funding.stage ?? null,
            amount: signalsList.find(s => s.funding.amount)?.funding.amount ?? null,
            investors: [...new Set(signalsList.flatMap(s => s.funding.investors))],
          },
          other: {
            newsItems: [...new Set(signalsList.flatMap(s => s.other.newsItems))],
            partnerships: [...new Set(signalsList.flatMap(s => s.other.partnerships))],
            awards: [...new Set(signalsList.flatMap(s => s.other.awards))],
          },
        };
      }
    }
  }

  // Get diffs
  const diffs = await db
    .select()
    .from(schema.diffs)
    .where(eq(schema.diffs.companyId, id))
    .orderBy(desc(schema.diffs.createdAt))
    .limit(10);

  const diffsWithChanges = diffs.map(diff => ({
    ...diff,
    changes: JSON.parse(diff.changesJson),
  }));

  return {
    company: company[0],
    pages,
    latestSignals,
    diffs: diffsWithChanges,
  };
}

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getCompanyData(id);

  if (!data) {
    notFound();
  }

  const { company, pages, latestSignals, diffs } = data;
  const domain = new URL(company.websiteUrl).hostname.replace('www.', '');

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{company.name}</h1>
          <a
            href={company.websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
          >
            {domain}
          </a>
          {company.notes && (
            <p className="text-gray-600 mt-2">{company.notes}</p>
          )}
          <p className="text-sm text-gray-500 mt-2">
            Added {formatDistanceToNow(new Date(company.createdAt), { addSuffix: true })}
          </p>
        </div>
        <div className="flex gap-2">
          <ScrapeButton companyId={company.id} label="Scrape" />
          <Button
            variant="danger"
            onClick={async () => {
              'use server';
              // Delete handled via API
            }}
          >
            Delete
          </Button>
        </div>
      </div>

      {/* Tabs-like sections */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Pages */}
          <Card>
            <PageManager companyId={company.id} pages={pages} />
          </Card>

          {/* Signals */}
          {latestSignals && (
            <div>
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Latest Signals</h2>
              <SignalCard signals={latestSignals} />
            </div>
          )}

          {!latestSignals && pages.length > 0 && (
            <Card>
              <div className="text-center py-8">
                <p className="text-gray-500">No signals extracted yet.</p>
                <p className="text-sm text-gray-400 mt-1">
                  Click &quot;Scrape&quot; to fetch pages and extract signals.
                </p>
              </div>
            </Card>
          )}
        </div>

        {/* Sidebar - Changes history */}
        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Change History</h2>
          <DiffViewer diffs={diffs} />
        </div>
      </div>
    </div>
  );
}
