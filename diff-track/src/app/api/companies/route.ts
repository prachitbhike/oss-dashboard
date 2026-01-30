import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq, desc } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { PageType } from '@/types';

export async function GET() {
  try {
    const companies = await db
      .select()
      .from(schema.companies)
      .orderBy(desc(schema.companies.updatedAt));

    return NextResponse.json(companies);
  } catch (error) {
    console.error('Failed to fetch companies:', error);
    return NextResponse.json(
      { error: 'Failed to fetch companies' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, websiteUrl, notes, pages } = body;

    if (!name || !websiteUrl) {
      return NextResponse.json(
        { error: 'Name and website URL are required' },
        { status: 400 }
      );
    }

    const now = Date.now();
    const companyId = uuidv4();

    // Create company
    await db.insert(schema.companies).values({
      id: companyId,
      name,
      websiteUrl,
      notes: notes || null,
      createdAt: now,
      updatedAt: now,
    });

    // Create tracked pages if provided
    if (pages && Array.isArray(pages)) {
      for (const page of pages) {
        if (page.url && page.pageType) {
          await db.insert(schema.trackedPages).values({
            id: uuidv4(),
            companyId,
            url: page.url,
            pageType: page.pageType as PageType,
            createdAt: now,
          });
        }
      }
    }

    const company = await db
      .select()
      .from(schema.companies)
      .where(eq(schema.companies.id, companyId))
      .limit(1);

    return NextResponse.json(company[0], { status: 201 });
  } catch (error) {
    console.error('Failed to create company:', error);
    return NextResponse.json(
      { error: 'Failed to create company' },
      { status: 500 }
    );
  }
}
