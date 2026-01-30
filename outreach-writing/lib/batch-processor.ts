/**
 * Batch Processor for Parallel Email Generation
 *
 * Handles concurrent processing of multiple URLs with:
 * - Rate limiting for both scraping and API calls
 * - Configurable concurrency
 * - Progress tracking
 * - Graceful error handling per item
 */

import { scrapeUrl } from './scraper';
import { generateOutreachEmail } from './anthropic';
import { getProfile, UserProfile } from './config';
import {
  RateLimiter,
  ConcurrencyLimiter,
  claudeRateLimiter,
  scrapeRateLimiter,
} from './rate-limiter';

export interface BatchItem {
  url: string;
  id: string; // Unique identifier for tracking
}

export interface BatchItemResult {
  id: string;
  url: string;
  success: boolean;
  email?: string;
  companyName?: string;
  summary?: string;
  error?: string;
  processingTime: number;
}

export interface BatchProgress {
  total: number;
  completed: number;
  succeeded: number;
  failed: number;
  inProgress: number;
}

export interface BatchProcessorConfig {
  maxConcurrent?: number;        // Max concurrent processing (default: 5)
  claudeRpm?: number;            // Claude requests per minute (default: 40)
  scrapeRps?: number;            // Scrape requests per second (default: 10)
  onProgress?: (progress: BatchProgress, latestResult?: BatchItemResult) => void;
  onItemComplete?: (result: BatchItemResult) => void;
}

export interface BatchResult {
  results: BatchItemResult[];
  summary: {
    total: number;
    succeeded: number;
    failed: number;
    totalTime: number;
    averageTime: number;
  };
}

export class BatchProcessor {
  private concurrencyLimiter: ConcurrencyLimiter;
  private claudeLimiter: RateLimiter;
  private scrapeLimiter: RateLimiter;
  private onProgress?: (progress: BatchProgress, latestResult?: BatchItemResult) => void;
  private onItemComplete?: (result: BatchItemResult) => void;
  private profile: UserProfile;

  constructor(config: BatchProcessorConfig = {}) {
    const {
      maxConcurrent = 5,
      claudeRpm = 40,
      scrapeRps = 10,
      onProgress,
      onItemComplete,
    } = config;

    this.concurrencyLimiter = new ConcurrencyLimiter(maxConcurrent);

    // Use custom rate limiters if specified, otherwise use defaults
    if (claudeRpm !== 40) {
      this.claudeLimiter = new RateLimiter({
        tokensPerInterval: claudeRpm,
        interval: 60000,
        maxTokens: claudeRpm,
      });
    } else {
      this.claudeLimiter = claudeRateLimiter;
    }

    if (scrapeRps !== 10) {
      this.scrapeLimiter = new RateLimiter({
        tokensPerInterval: scrapeRps,
        interval: 1000,
        maxTokens: scrapeRps,
      });
    } else {
      this.scrapeLimiter = scrapeRateLimiter;
    }

    this.onProgress = onProgress;
    this.onItemComplete = onItemComplete;
    this.profile = getProfile();
  }

  /**
   * Process a batch of URLs in parallel
   */
  async processBatch(items: BatchItem[]): Promise<BatchResult> {
    const startTime = Date.now();
    const results: BatchItemResult[] = [];
    let completed = 0;
    let succeeded = 0;
    let failed = 0;

    const reportProgress = (latestResult?: BatchItemResult) => {
      if (this.onProgress) {
        this.onProgress(
          {
            total: items.length,
            completed,
            succeeded,
            failed,
            inProgress: this.concurrencyLimiter.getRunning(),
          },
          latestResult
        );
      }
    };

    // Initial progress report
    reportProgress();

    // Process all items concurrently with rate limiting
    const promises = items.map((item) =>
      this.concurrencyLimiter.run(async () => {
        const result = await this.processItem(item);
        results.push(result);
        completed++;

        if (result.success) {
          succeeded++;
        } else {
          failed++;
        }

        if (this.onItemComplete) {
          this.onItemComplete(result);
        }

        reportProgress(result);

        return result;
      })
    );

    await Promise.all(promises);

    const totalTime = Date.now() - startTime;

    return {
      results,
      summary: {
        total: items.length,
        succeeded,
        failed,
        totalTime,
        averageTime: items.length > 0 ? totalTime / items.length : 0,
      },
    };
  }

  /**
   * Process a single item with rate limiting
   */
  private async processItem(item: BatchItem): Promise<BatchItemResult> {
    const startTime = Date.now();

    try {
      // Wait for scrape rate limit
      await this.scrapeLimiter.acquire();

      // Scrape the URL
      const scrapeResult = await scrapeUrl(item.url);

      if (!scrapeResult.success) {
        return {
          id: item.id,
          url: item.url,
          success: false,
          error: scrapeResult.error || 'Failed to scrape URL',
          processingTime: Date.now() - startTime,
        };
      }

      // Build company content
      const companyContent = `
Title: ${scrapeResult.title}
Description: ${scrapeResult.description}
Content: ${scrapeResult.content}
      `.trim();

      // Wait for Claude API rate limit
      await this.claudeLimiter.acquire();

      // Generate email
      const emailResult = await generateOutreachEmail({
        companyContent,
        companyUrl: item.url,
        profile: this.profile,
      });

      return {
        id: item.id,
        url: item.url,
        success: true,
        email: emailResult.email,
        companyName: emailResult.companyName,
        summary: emailResult.summary,
        processingTime: Date.now() - startTime,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        id: item.id,
        url: item.url,
        success: false,
        error: message,
        processingTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Get estimated time to process a batch
   */
  getEstimatedTime(itemCount: number): number {
    // Rough estimate based on rate limits and concurrency
    const claudeWait = this.claudeLimiter.getEstimatedWaitTime(itemCount);
    const scrapeWait = this.scrapeLimiter.getEstimatedWaitTime(itemCount);
    // ~8 seconds per item average (increased due to web search latency)
    const processingTime = itemCount * 8000;

    return Math.max(claudeWait, scrapeWait) + processingTime / this.concurrencyLimiter.getRunning() || 5;
  }
}

/**
 * Utility function to create batch items from URLs
 */
export function createBatchItems(urls: string[]): BatchItem[] {
  return urls.map((url, index) => ({
    url: url.trim(),
    id: `item-${index}-${Date.now()}`,
  }));
}

/**
 * Process URLs in parallel with default settings
 * Simple convenience function for common use case
 */
export async function processUrlsInParallel(
  urls: string[],
  options?: {
    maxConcurrent?: number;
    onProgress?: (progress: BatchProgress, latestResult?: BatchItemResult) => void;
  }
): Promise<BatchResult> {
  const processor = new BatchProcessor({
    maxConcurrent: options?.maxConcurrent ?? 5,
    onProgress: options?.onProgress,
  });

  const items = createBatchItems(urls);
  return processor.processBatch(items);
}
