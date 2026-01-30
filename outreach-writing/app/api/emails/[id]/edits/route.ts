import { NextRequest, NextResponse } from 'next/server';
import { emailDb, editDb, Email, Edit } from '@/lib/db';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/emails/[id]/edits - Get edit history for an email
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Verify the email exists
    const email = emailDb.getById.get(id) as Email | undefined;
    if (!email) {
      return NextResponse.json({ error: 'Email not found' }, { status: 404 });
    }

    const edits = editDb.getByEmailId.all(id) as Edit[];

    // Transform edits to API response
    const transformedEdits = edits.map((edit) => ({
      id: edit.id,
      emailId: edit.email_id,
      previousContent: edit.previous_content,
      newContent: edit.new_content,
      diffOperations: JSON.parse(edit.diff_operations),
      editTimestamp: edit.edit_timestamp,
    }));

    return NextResponse.json({
      edits: transformedEdits,
      email: {
        id: email.id,
        companyName: email.company_name,
        originalEmail: email.original_email,
        currentEmail: email.current_email,
      },
    });
  } catch (error) {
    console.error('Error fetching edit history:', error);
    return NextResponse.json(
      { error: 'Failed to fetch edit history' },
      { status: 500 }
    );
  }
}
