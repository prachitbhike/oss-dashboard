import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq, desc } from 'drizzle-orm';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
) {
  try {
    const { companyId } = await params;
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '20');

    const diffs = await db
      .select()
      .from(schema.diffs)
      .where(eq(schema.diffs.companyId, companyId))
      .orderBy(desc(schema.diffs.createdAt))
      .limit(limit);

    const result = diffs.map(diff => ({
      ...diff,
      changes: JSON.parse(diff.changesJson),
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error('Failed to fetch diffs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch diffs' },
      { status: 500 }
    );
  }
}
