import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { emailDb, editDb, Email } from '@/lib/db';
import { processEditForPatterns } from '@/lib/pattern-analyzer';

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

// GET /api/emails/[id] - Get a single email
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const email = emailDb.getById.get(id) as Email | undefined;

    if (!email) {
      return NextResponse.json({ error: 'Email not found' }, { status: 404 });
    }

    return NextResponse.json({ email: transformEmail(email) });
  } catch (error) {
    console.error('Error fetching email:', error);
    return NextResponse.json(
      { error: 'Failed to fetch email' },
      { status: 500 }
    );
  }
}

// PATCH /api/emails/[id] - Update an email
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { currentEmail, isArchived } = body;

    const existing = emailDb.getById.get(id) as Email | undefined;
    if (!existing) {
      return NextResponse.json({ error: 'Email not found' }, { status: 404 });
    }

    const now = Date.now();

    // Handle archive/unarchive
    if (typeof isArchived === 'boolean') {
      if (isArchived) {
        emailDb.archive.run(now, id);
      } else {
        emailDb.unarchive.run(now, id);
      }
    }

    // Handle email content update
    if (currentEmail && currentEmail !== existing.current_email) {
      // Process diff and record patterns
      const diff = processEditForPatterns(existing.current_email, currentEmail);

      // Store the edit record
      editDb.create.run({
        id: uuidv4(),
        email_id: id,
        previous_content: existing.current_email,
        new_content: currentEmail,
        diff_operations: JSON.stringify(diff.operations),
        edit_timestamp: now,
      });

      // Update the email
      emailDb.update.run({
        id,
        current_email: currentEmail,
        updated_at: now,
      });
    }

    const updated = emailDb.getById.get(id) as Email;
    return NextResponse.json({ email: transformEmail(updated) });
  } catch (error) {
    console.error('Error updating email:', error);
    return NextResponse.json(
      { error: 'Failed to update email' },
      { status: 500 }
    );
  }
}

// DELETE /api/emails/[id] - Delete an email
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const existing = emailDb.getById.get(id) as Email | undefined;

    if (!existing) {
      return NextResponse.json({ error: 'Email not found' }, { status: 404 });
    }

    emailDb.delete.run(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting email:', error);
    return NextResponse.json(
      { error: 'Failed to delete email' },
      { status: 500 }
    );
  }
}
