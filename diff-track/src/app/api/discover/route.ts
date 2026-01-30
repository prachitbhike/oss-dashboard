import { NextRequest, NextResponse } from 'next/server';
import { discoverPages } from '@/lib/discovery';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { baseUrl } = body;

    if (!baseUrl) {
      return NextResponse.json(
        { error: 'Base URL is required' },
        { status: 400 }
      );
    }

    // Validate URL format
    try {
      const url = baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`;
      new URL(url);
    } catch {
      return NextResponse.json(
        { error: 'Invalid URL format' },
        { status: 400 }
      );
    }

    const result = await discoverPages(baseUrl);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Discovery failed:', error);
    return NextResponse.json(
      { error: 'Failed to discover pages' },
      { status: 500 }
    );
  }
}
