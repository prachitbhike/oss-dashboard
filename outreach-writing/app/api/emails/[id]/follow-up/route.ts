import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { emailDb, Email } from '@/lib/db';
import { generateFollowUpEmail, PromptSettings } from '@/lib/anthropic';
import { getProfile } from '@/lib/config';

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

// POST /api/emails/[id]/follow-up - Generate a follow-up email
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const promptSettings = body.promptSettings as PromptSettings | undefined;

    // Fetch the target email
    const email = emailDb.getById.get(id) as Email | undefined;
    if (!email) {
      return NextResponse.json({ error: 'Email not found' }, { status: 404 });
    }

    // Find the root parent email (if this is a follow-up, trace back to original)
    let rootEmail = email;
    if (email.parent_email_id) {
      const parent = emailDb.getById.get(email.parent_email_id) as Email | undefined;
      if (parent) {
        rootEmail = parent;
      }
    }

    // Fetch all follow-ups for the root email
    const followUps = emailDb.getByParentId.all(rootEmail.id) as Email[];

    // Get the original email content and all previous follow-up contents
    const originalEmailContent = rootEmail.current_email;
    const previousFollowUps = followUps
      .sort((a, b) => a.follow_up_number - b.follow_up_number)
      .map((f) => f.current_email);

    // Determine the next follow-up number
    const maxFollowUp = (emailDb.getMaxFollowUpNumber.get(rootEmail.id) as { max_num: number | null })?.max_num ?? 0;
    const nextFollowUpNumber = maxFollowUp + 1;

    // Get user profile
    const profile = getProfile();

    // Generate the follow-up email
    const result = await generateFollowUpEmail({
      companyName: rootEmail.company_name,
      companySummary: rootEmail.company_summary || '',
      companyUrl: rootEmail.url,
      originalEmail: originalEmailContent,
      previousFollowUps,
      followUpNumber: nextFollowUpNumber,
      profile,
      promptSettings,
    });

    // Save the new follow-up email
    const now = Date.now();
    const newId = uuidv4();

    emailDb.create.run({
      id: newId,
      url: rootEmail.url,
      company_name: rootEmail.company_name,
      company_summary: rootEmail.company_summary,
      original_email: result.email,
      current_email: result.email,
      created_at: now,
      updated_at: now,
      parent_email_id: rootEmail.id,
      follow_up_number: nextFollowUpNumber,
    });

    const created = emailDb.getById.get(newId) as Email;

    return NextResponse.json({
      email: transformEmail(created),
      rootEmailId: rootEmail.id,
    });
  } catch (error) {
    console.error('Error generating follow-up:', error);
    return NextResponse.json(
      { error: 'Failed to generate follow-up email' },
      { status: 500 }
    );
  }
}
