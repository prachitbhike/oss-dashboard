import { NextRequest, NextResponse } from 'next/server';
import { emailDb, Email } from '@/lib/db';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Transform database row to API response
function transformEmail(email: Email) {
  return {
    id: email.id,
    url: email.url,
    companyName: email.company_name,
    companySummary: email.company_summary,
    originalEmail: email.original_email,
    currentEmail: email.current_email,
    createdAt: email.created_at,
    updatedAt: email.updated_at,
    isArchived: email.is_archived === 1,
    parentEmailId: email.parent_email_id,
    followUpNumber: email.follow_up_number,
  };
}

// GET /api/emails/[id]/thread - Get the complete email thread
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Fetch the target email
    const email = emailDb.getById.get(id) as Email | undefined;
    if (!email) {
      return NextResponse.json({ error: 'Email not found' }, { status: 404 });
    }

    // Find the root email (if this is a follow-up, trace back to original)
    let rootEmail = email;
    if (email.parent_email_id) {
      const parent = emailDb.getById.get(email.parent_email_id) as Email | undefined;
      if (parent) {
        rootEmail = parent;
      }
    }

    // Fetch all follow-ups for the root email
    const followUps = emailDb.getByParentId.all(rootEmail.id) as Email[];

    // Sort follow-ups by follow_up_number
    const sortedFollowUps = followUps.sort((a, b) => a.follow_up_number - b.follow_up_number);

    return NextResponse.json({
      rootEmail: transformEmail(rootEmail),
      followUps: sortedFollowUps.map(transformEmail),
    });
  } catch (error) {
    console.error('Error fetching thread:', error);
    return NextResponse.json(
      { error: 'Failed to fetch email thread' },
      { status: 500 }
    );
  }
}
