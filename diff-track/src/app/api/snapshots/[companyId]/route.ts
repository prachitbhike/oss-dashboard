import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq, desc, inArray } from 'drizzle-orm';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
) {
  try {
    const { companyId } = await params;
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '10');

    // Get all tracked pages for this company
    const pages = await db
      .select()
      .from(schema.trackedPages)
      .where(eq(schema.trackedPages.companyId, companyId));

    if (pages.length === 0) {
      return NextResponse.json([]);
    }

    const pageIds = pages.map(p => p.id);

    // Get snapshots for these pages
    const snapshots = await db
      .select()
      .from(schema.snapshots)
      .where(inArray(schema.snapshots.trackedPageId, pageIds))
      .orderBy(desc(schema.snapshots.scrapedAt))
      .limit(limit);

    // Get signals for these snapshots
    const snapshotIds = snapshots.map(s => s.id);
    const signals = snapshotIds.length > 0
      ? await db
          .select()
          .from(schema.signals)
          .where(inArray(schema.signals.snapshotId, snapshotIds))
      : [];

    // Build response with page info and signals
    const result = snapshots.map(snapshot => {
      const page = pages.find(p => p.id === snapshot.trackedPageId);
      const signal = signals.find(s => s.snapshotId === snapshot.id);

      return {
        ...snapshot,
        page,
        signals: signal ? JSON.parse(signal.signalsJson) : null,
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Failed to fetch snapshots:', error);
    return NextResponse.json(
      { error: 'Failed to fetch snapshots' },
      { status: 500 }
    );
  }
}
