import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { emailDb, Email } from '@/lib/db';

// GET /api/emails - List all emails
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const includeArchived = searchParams.get('includeArchived') === 'true';

    const rawEmails = includeArchived
      ? (emailDb.getAllWithArchived.all() as Email[])
      : (emailDb.getAll.all() as Email[]);

    const emails = rawEmails.map((e) => {
      const followUpCount = (emailDb.getFollowUpCount.get(e.id) as { count: number })?.count ?? 0;
      return {
        id: e.id,
        url: e.url,
        companyName: e.company_name,
        companySummary: e.company_summary,
        originalEmail: e.original_email,
        currentEmail: e.current_email,
        createdAt: e.created_at,
        updatedAt: e.updated_at,
        isArchived: e.is_archived === 1,
        parentEmailId: e.parent_email_id,
        followUpNumber: e.follow_up_number,
        followUpCount,
      };
    });

    return NextResponse.json({ emails });
  } catch (error) {
    console.error('Error fetching emails:', error);
    return NextResponse.json(
      { error: 'Failed to fetch emails' },
      { status: 500 }
    );
  }
}

// POST /api/emails - Create a new email
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, companyName, companySummary, email } = body;

    if (!url || !companyName || !email) {
      return NextResponse.json(
        { error: 'Missing required fields: url, companyName, email' },
        { status: 400 }
      );
    }

    const now = Date.now();
    const id = uuidv4();

    emailDb.create.run({
      id,
      url,
      company_name: companyName,
      company_summary: companySummary || null,
      original_email: email,
      current_email: email,
      created_at: now,
      updated_at: now,
      parent_email_id: null,
      follow_up_number: 0,
    });

    const created = emailDb.getById.get(id) as Email;

    return NextResponse.json({
      email: {
        id: created.id,
        url: created.url,
        companyName: created.company_name,
        companySummary: created.company_summary,
        originalEmail: created.original_email,
        currentEmail: created.current_email,
        createdAt: created.created_at,
        updatedAt: created.updated_at,
        isArchived: created.is_archived === 1,
        parentEmailId: created.parent_email_id,
        followUpNumber: created.follow_up_number,
        followUpCount: 0,
      },
    });
  } catch (error) {
    console.error('Error creating email:', error);
    return NextResponse.json(
      { error: 'Failed to create email' },
      { status: 500 }
    );
  }
}
