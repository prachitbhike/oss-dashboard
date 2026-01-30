import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { PageType } from '@/types';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const companyId = searchParams.get('companyId');

    if (companyId) {
      const pages = await db
        .select()
        .from(schema.trackedPages)
        .where(eq(schema.trackedPages.companyId, companyId));
      return NextResponse.json(pages);
    }

    const pages = await db.select().from(schema.trackedPages);
    return NextResponse.json(pages);
  } catch (error) {
    console.error('Failed to fetch pages:', error);
    return NextResponse.json(
      { error: 'Failed to fetch pages' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { companyId, url, pageType } = body;

    if (!companyId || !url || !pageType) {
      return NextResponse.json(
        { error: 'Company ID, URL, and page type are required' },
        { status: 400 }
      );
    }

    // Verify company exists
    const company = await db
      .select()
      .from(schema.companies)
      .where(eq(schema.companies.id, companyId))
      .limit(1);

    if (company.length === 0) {
      return NextResponse.json(
        { error: 'Company not found' },
        { status: 404 }
      );
    }

    const pageId = uuidv4();
    await db.insert(schema.trackedPages).values({
      id: pageId,
      companyId,
      url,
      pageType: pageType as PageType,
      createdAt: Date.now(),
    });

    // Update company's updatedAt
    await db
      .update(schema.companies)
      .set({ updatedAt: Date.now() })
      .where(eq(schema.companies.id, companyId));

    const page = await db
      .select()
      .from(schema.trackedPages)
      .where(eq(schema.trackedPages.id, pageId))
      .limit(1);

    return NextResponse.json(page[0], { status: 201 });
  } catch (error) {
    console.error('Failed to create page:', error);
    return NextResponse.json(
      { error: 'Failed to create page' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const pageId = searchParams.get('id');

    if (!pageId) {
      return NextResponse.json(
        { error: 'Page ID is required' },
        { status: 400 }
      );
    }

    const existing = await db
      .select()
      .from(schema.trackedPages)
      .where(eq(schema.trackedPages.id, pageId))
      .limit(1);

    if (existing.length === 0) {
      return NextResponse.json(
        { error: 'Page not found' },
        { status: 404 }
      );
    }

    await db
      .delete(schema.trackedPages)
      .where(eq(schema.trackedPages.id, pageId));

    // Update company's updatedAt
    await db
      .update(schema.companies)
      .set({ updatedAt: Date.now() })
      .where(eq(schema.companies.id, existing[0].companyId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete page:', error);
    return NextResponse.json(
      { error: 'Failed to delete page' },
      { status: 500 }
    );
  }
}
