import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq, desc, inArray } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { scrapeWithRateLimit, closeBrowser } from '@/lib/scraper';
import { extractSignals, mergeSignals } from '@/lib/signals';
import { computeChanges, generateDiffSummary } from '@/lib/diff';
import { PageType, ExtractedSignals, ScrapeResult } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { companyId, companyIds } = body;

    // Handle single company or multiple
    const targetCompanyIds: string[] = companyId
      ? [companyId]
      : companyIds || [];

    if (targetCompanyIds.length === 0) {
      // Scrape all companies if none specified
      const allCompanies = await db.select().from(schema.companies);
      targetCompanyIds.push(...allCompanies.map(c => c.id));
    }

    const results: ScrapeResult[] = [];
    const scrapeRunId = uuidv4();

    for (const cId of targetCompanyIds) {
      const result = await scrapeCompany(cId, scrapeRunId);
      results.push(result);
    }

    // Close browser after all scraping is done
    await closeBrowser();

    return NextResponse.json({
      scrapeRunId,
      results,
      summary: {
        totalCompanies: results.length,
        companiesWithChanges: results.filter(r => r.changesDetected).length,
        totalErrors: results.reduce((sum, r) => sum + r.errors.length, 0),
      },
    });
  } catch (error) {
    console.error('Scrape failed:', error);
    await closeBrowser();
    return NextResponse.json(
      { error: 'Scrape failed' },
      { status: 500 }
    );
  }
}

async function scrapeCompany(companyId: string, scrapeRunId: string): Promise<ScrapeResult> {
  const result: ScrapeResult = {
    companyId,
    companyName: '',
    pagesScraped: 0,
    changesDetected: false,
    diffSummary: null,
    errors: [],
  };

  try {
    // Get company
    const company = await db
      .select()
      .from(schema.companies)
      .where(eq(schema.companies.id, companyId))
      .limit(1);

    if (company.length === 0) {
      result.errors.push('Company not found');
      return result;
    }

    result.companyName = company[0].name;

    // Get tracked pages
    const pages = await db
      .select()
      .from(schema.trackedPages)
      .where(eq(schema.trackedPages.companyId, companyId));

    if (pages.length === 0) {
      result.errors.push('No pages to scrape');
      return result;
    }

    const newSignalsList: ExtractedSignals[] = [];
    const now = Date.now();

    // Scrape each page
    for (const page of pages) {
      try {
        // Scrape the page
        const scrapeResult = await scrapeWithRateLimit(page.url);

        if (scrapeResult.error) {
          result.errors.push(`Failed to scrape ${page.url}: ${scrapeResult.error}`);
          continue;
        }

        // Store snapshot
        const snapshotId = uuidv4();
        await db.insert(schema.snapshots).values({
          id: snapshotId,
          trackedPageId: page.id,
          rawHtml: scrapeResult.rawHtml,
          cleanedText: scrapeResult.cleanedText,
          scrapedAt: now,
        });

        // Extract signals
        const signals = await extractSignals(
          scrapeResult.cleanedText,
          page.pageType as PageType,
          company[0].name,
          page.url
        );

        // Store signals
        const signalId = uuidv4();
        await db.insert(schema.signals).values({
          id: signalId,
          snapshotId,
          signalsJson: JSON.stringify(signals),
          extractedAt: Date.now(),
        });

        newSignalsList.push(signals);
        result.pagesScraped++;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        result.errors.push(`Error processing ${page.url}: ${errorMsg}`);
      }
    }

    if (newSignalsList.length === 0) {
      return result;
    }

    // Merge signals from all pages
    const mergedNewSignals = mergeSignals(newSignalsList);

    // Get previous signals for comparison
    const previousSignals = await getPreviousMergedSignals(companyId);

    // Compute changes
    const changes = computeChanges(previousSignals, mergedNewSignals);

    if (changes.length > 0) {
      result.changesDetected = true;

      // Generate summary
      const oldDate = previousSignals ? new Date(await getPreviousScrapedAt(companyId)) : new Date();
      const summary = await generateDiffSummary(
        company[0].name,
        changes,
        oldDate,
        new Date()
      );

      result.diffSummary = summary;

      // Get the latest signal ID for reference
      const latestSignal = await db
        .select()
        .from(schema.signals)
        .orderBy(desc(schema.signals.extractedAt))
        .limit(1);

      // Store diff
      await db.insert(schema.diffs).values({
        id: uuidv4(),
        companyId,
        scrapeRunId,
        oldSignalsId: null, // We're comparing merged signals, not individual ones
        newSignalsId: latestSignal[0]?.id || '',
        summary,
        changesJson: JSON.stringify(changes),
        createdAt: Date.now(),
      });
    }

    // Update company timestamp
    await db
      .update(schema.companies)
      .set({ updatedAt: Date.now() })
      .where(eq(schema.companies.id, companyId));

    return result;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    result.errors.push(`Company scrape failed: ${errorMsg}`);
    return result;
  }
}

async function getPreviousMergedSignals(companyId: string): Promise<ExtractedSignals | null> {
  // Get pages for this company
  const pages = await db
    .select()
    .from(schema.trackedPages)
    .where(eq(schema.trackedPages.companyId, companyId));

  if (pages.length === 0) return null;

  const pageIds = pages.map(p => p.id);

  // Get the most recent snapshots before the current run
  // We need to find snapshots that aren't from the current scrape
  const recentSnapshots = await db
    .select()
    .from(schema.snapshots)
    .where(inArray(schema.snapshots.trackedPageId, pageIds))
    .orderBy(desc(schema.snapshots.scrapedAt));

  // Group by page and get second-most-recent for each
  const pageLastSnapshots = new Map<string, string>();
  const pageSnapshotCount = new Map<string, number>();

  for (const snapshot of recentSnapshots) {
    const count = pageSnapshotCount.get(snapshot.trackedPageId) || 0;
    if (count === 1) {
      // This is the second snapshot (the previous one)
      pageLastSnapshots.set(snapshot.trackedPageId, snapshot.id);
    }
    pageSnapshotCount.set(snapshot.trackedPageId, count + 1);
  }

  if (pageLastSnapshots.size === 0) return null;

  const snapshotIds = Array.from(pageLastSnapshots.values());
  const signals = await db
    .select()
    .from(schema.signals)
    .where(inArray(schema.signals.snapshotId, snapshotIds));

  if (signals.length === 0) return null;

  const signalsList = signals.map(s => JSON.parse(s.signalsJson) as ExtractedSignals);
  return mergeSignals(signalsList);
}

async function getPreviousScrapedAt(companyId: string): Promise<number> {
  const pages = await db
    .select()
    .from(schema.trackedPages)
    .where(eq(schema.trackedPages.companyId, companyId));

  if (pages.length === 0) return Date.now();

  const pageIds = pages.map(p => p.id);

  const snapshots = await db
    .select()
    .from(schema.snapshots)
    .where(inArray(schema.snapshots.trackedPageId, pageIds))
    .orderBy(desc(schema.snapshots.scrapedAt))
    .limit(2);

  // Return second most recent if exists
  if (snapshots.length >= 2) {
    return snapshots[1].scrapedAt;
  }

  return Date.now();
}
