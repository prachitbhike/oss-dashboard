import { NextRequest, NextResponse } from 'next/server';
import { scrapeUrl } from '@/lib/scraper';
import { generateOutreachEmail } from '@/lib/anthropic';
import { getProfile } from '@/lib/config';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url } = body;

    if (!url || typeof url !== 'string') {
      return NextResponse.json(
        { error: 'URL is required' },
        { status: 400 }
      );
    }

    // Scrape the URL
    const scrapeResult = await scrapeUrl(url);

    if (!scrapeResult.success) {
      return NextResponse.json(
        { error: scrapeResult.error || 'Failed to fetch company information' },
        { status: 400 }
      );
    }

    // Build company content for the prompt
    const companyContent = `
Title: ${scrapeResult.title}
Description: ${scrapeResult.description}
Content: ${scrapeResult.content}
    `.trim();

    // Get user profile
    const profile = getProfile();

    // Generate the email
    const result = await generateOutreachEmail({
      companyContent,
      companyUrl: url,
      profile,
    });

    return NextResponse.json({
      email: result.email,
      companyName: result.companyName,
      summary: result.summary,
    });
  } catch (error) {
    console.error('Error generating email:', error);
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
