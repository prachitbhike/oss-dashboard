import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const company = await db
      .select()
      .from(schema.companies)
      .where(eq(schema.companies.id, id))
      .limit(1);

    if (company.length === 0) {
      return NextResponse.json(
        { error: 'Company not found' },
        { status: 404 }
      );
    }

    // Get tracked pages
    const pages = await db
      .select()
      .from(schema.trackedPages)
      .where(eq(schema.trackedPages.companyId, id));

    return NextResponse.json({
      ...company[0],
      pages,
    });
  } catch (error) {
    console.error('Failed to fetch company:', error);
    return NextResponse.json(
      { error: 'Failed to fetch company' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, websiteUrl, notes } = body;

    const existing = await db
      .select()
      .from(schema.companies)
      .where(eq(schema.companies.id, id))
      .limit(1);

    if (existing.length === 0) {
      return NextResponse.json(
        { error: 'Company not found' },
        { status: 404 }
      );
    }

    await db
      .update(schema.companies)
      .set({
        name: name ?? existing[0].name,
        websiteUrl: websiteUrl ?? existing[0].websiteUrl,
        notes: notes !== undefined ? notes : existing[0].notes,
        updatedAt: Date.now(),
      })
      .where(eq(schema.companies.id, id));

    const updated = await db
      .select()
      .from(schema.companies)
      .where(eq(schema.companies.id, id))
      .limit(1);

    return NextResponse.json(updated[0]);
  } catch (error) {
    console.error('Failed to update company:', error);
    return NextResponse.json(
      { error: 'Failed to update company' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const existing = await db
      .select()
      .from(schema.companies)
      .where(eq(schema.companies.id, id))
      .limit(1);

    if (existing.length === 0) {
      return NextResponse.json(
        { error: 'Company not found' },
        { status: 404 }
      );
    }

    await db
      .delete(schema.companies)
      .where(eq(schema.companies.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete company:', error);
    return NextResponse.json(
      { error: 'Failed to delete company' },
      { status: 500 }
    );
  }
}
