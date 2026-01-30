import { NextRequest, NextResponse } from 'next/server';
import {
  BatchProcessor,
  createBatchItems,
  BatchResult,
  BatchItemResult,
} from '@/lib/batch-processor';
import { PromptSettings } from '@/lib/anthropic';

export const maxDuration = 300; // 5 minute timeout for batch processing

interface BatchRequestBody {
  urls: string[];
  promptSettings?: PromptSettings;
  options?: {
    maxConcurrent?: number;
  };
}

export async function POST(request: NextRequest) {
  try {
    const body: BatchRequestBody = await request.json();
    const { urls, promptSettings, options } = body;

    // Validate input
    if (!urls || !Array.isArray(urls)) {
      return NextResponse.json(
        { error: 'URLs array is required' },
        { status: 400 }
      );
    }

    if (urls.length === 0) {
      return NextResponse.json(
        { error: 'At least one URL is required' },
        { status: 400 }
      );
    }

    // Limit batch size to prevent abuse
    const MAX_BATCH_SIZE = 50;
    if (urls.length > MAX_BATCH_SIZE) {
      return NextResponse.json(
        { error: `Maximum batch size is ${MAX_BATCH_SIZE} URLs` },
        { status: 400 }
      );
    }

    // Filter out empty URLs and validate
    const validUrls = urls
      .map((url) => (typeof url === 'string' ? url.trim() : ''))
      .filter((url) => url.length > 0);

    if (validUrls.length === 0) {
      return NextResponse.json(
        { error: 'No valid URLs provided' },
        { status: 400 }
      );
    }

    // Create batch processor with options
    const processor = new BatchProcessor({
      maxConcurrent: Math.min(options?.maxConcurrent ?? 5, 10), // Cap at 10
      promptSettings,
    });

    // Process the batch
    const items = createBatchItems(validUrls);
    const result: BatchResult = await processor.processBatch(items);

    return NextResponse.json({
      success: true,
      results: result.results,
      summary: result.summary,
    });
  } catch (error) {
    console.error('Error processing batch:', error);
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Streaming endpoint for real-time progress updates
 * Uses Server-Sent Events (SSE)
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const urlsParam = searchParams.get('urls');
  const maxConcurrentParam = searchParams.get('maxConcurrent');
  const promptSettingsParam = searchParams.get('promptSettings');

  if (!urlsParam) {
    return NextResponse.json(
      { error: 'URLs parameter is required' },
      { status: 400 }
    );
  }

  let urls: string[];
  try {
    urls = JSON.parse(urlsParam);
  } catch {
    return NextResponse.json(
      { error: 'Invalid URLs parameter - must be JSON array' },
      { status: 400 }
    );
  }

  let promptSettings: PromptSettings | undefined;
  if (promptSettingsParam) {
    try {
      promptSettings = JSON.parse(promptSettingsParam);
    } catch {
      // Ignore invalid prompt settings, use defaults
    }
  }

  if (!Array.isArray(urls) || urls.length === 0) {
    return NextResponse.json(
      { error: 'URLs must be a non-empty array' },
      { status: 400 }
    );
  }

  const MAX_BATCH_SIZE = 50;
  if (urls.length > MAX_BATCH_SIZE) {
    return NextResponse.json(
      { error: `Maximum batch size is ${MAX_BATCH_SIZE} URLs` },
      { status: 400 }
    );
  }

  const validUrls = urls
    .map((url) => (typeof url === 'string' ? url.trim() : ''))
    .filter((url) => url.length > 0);

  if (validUrls.length === 0) {
    return NextResponse.json(
      { error: 'No valid URLs provided' },
      { status: 400 }
    );
  }

  const maxConcurrent = maxConcurrentParam
    ? Math.min(parseInt(maxConcurrentParam, 10) || 5, 10)
    : 5;

  // Create a readable stream for SSE
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      const allResults: BatchItemResult[] = [];

      const processor = new BatchProcessor({
        maxConcurrent,
        promptSettings,
        onProgress: (progress) => {
          sendEvent('progress', progress);
        },
        onItemComplete: (result) => {
          allResults.push(result);
          sendEvent('result', result);
        },
      });

      try {
        const items = createBatchItems(validUrls);
        const batchResult = await processor.processBatch(items);

        sendEvent('complete', {
          summary: batchResult.summary,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        sendEvent('error', { error: message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
