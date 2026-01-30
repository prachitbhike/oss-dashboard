import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import { BatchCompanyInput, BatchCompanyResult, BatchImportResult } from '@/types';
import { discoverPages } from '@/lib/discovery';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { companies, autoDiscover = true } = body as {
      companies: BatchCompanyInput[];
      autoDiscover?: boolean;
    };

    if (!companies || !Array.isArray(companies) || companies.length === 0) {
      return NextResponse.json(
        { error: 'At least one company is required' },
        { status: 400 }
      );
    }

    const results: BatchImportResult = {
      created: [],
      failed: [],
    };

    for (const input of companies) {
      try {
        // Validate URL
        let websiteUrl = input.websiteUrl.trim();
        if (!websiteUrl.startsWith('http://') && !websiteUrl.startsWith('https://')) {
          websiteUrl = 'https://' + websiteUrl;
        }

        try {
          new URL(websiteUrl);
        } catch {
          results.failed.push({
            url: input.websiteUrl,
            error: 'Invalid URL format',
          });
          continue;
        }

        const now = Date.now();
        const companyId = uuidv4();
        let companyName = new URL(websiteUrl).hostname.replace('www.', '');
        let pagesToCreate: Array<{ url: string; pageType: string }> = [];

        if (autoDiscover) {
          try {
            const discovery = await discoverPages(websiteUrl);

            if (discovery.suggestedName) {
              companyName = discovery.suggestedName;
            }

            pagesToCreate = discovery.discoveredPages
              .filter(p => p.exists)
              .map(p => ({ url: p.url, pageType: p.pageType }));
          } catch (discoverError) {
            console.error(`Discovery failed for ${websiteUrl}:`, discoverError);
            // Fall back to just homepage
            pagesToCreate = [{ url: websiteUrl, pageType: 'homepage' }];
          }
        } else {
          // Just add homepage
          pagesToCreate = [{ url: websiteUrl, pageType: 'homepage' }];
        }

        // Create company
        await db.insert(schema.companies).values({
          id: companyId,
          name: companyName,
          websiteUrl,
          notes: input.notes || null,
          createdAt: now,
          updatedAt: now,
        });

        // Create tracked pages
        for (const page of pagesToCreate) {
          await db.insert(schema.trackedPages).values({
            id: uuidv4(),
            companyId,
            url: page.url,
            pageType: page.pageType,
            createdAt: now,
          });
        }

        const result: BatchCompanyResult = {
          id: companyId,
          name: companyName,
          pagesCount: pagesToCreate.length,
        };

        results.created.push(result);
      } catch (error) {
        console.error(`Failed to create company for ${input.websiteUrl}:`, error);
        results.failed.push({
          url: input.websiteUrl,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return NextResponse.json(results);
  } catch (error) {
    console.error('Batch import failed:', error);
    return NextResponse.json(
      { error: 'Batch import failed' },
      { status: 500 }
    );
  }
}
