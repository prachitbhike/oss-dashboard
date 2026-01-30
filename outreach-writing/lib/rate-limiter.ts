/**
 * Token Bucket Rate Limiter
 *
 * Implements a token bucket algorithm for rate limiting with:
 * - Configurable tokens per interval
 * - Automatic token refill
 * - Async waiting for available tokens
 */

interface RateLimiterConfig {
  tokensPerInterval: number;  // Number of tokens added per interval
  interval: number;           // Interval in milliseconds
  maxTokens?: number;         // Maximum tokens in bucket (defaults to tokensPerInterval)
}

export class RateLimiter {
  private tokens: number;
  private maxTokens: number;
  private tokensPerInterval: number;
  private interval: number;
  private lastRefill: number;
  private waitQueue: Array<{ resolve: () => void; tokens: number }> = [];

  constructor(config: RateLimiterConfig) {
    this.tokensPerInterval = config.tokensPerInterval;
    this.interval = config.interval;
    this.maxTokens = config.maxTokens ?? config.tokensPerInterval;
    this.tokens = this.maxTokens;
    this.lastRefill = Date.now();
  }

  private refillTokens(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const tokensToAdd = Math.floor(elapsed / this.interval) * this.tokensPerInterval;

    if (tokensToAdd > 0) {
      this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
      this.lastRefill = now - (elapsed % this.interval);
    }
  }

  private processQueue(): void {
    while (this.waitQueue.length > 0 && this.tokens >= this.waitQueue[0].tokens) {
      const { resolve, tokens } = this.waitQueue.shift()!;
      this.tokens -= tokens;
      resolve();
    }
  }

  /**
   * Acquire tokens from the bucket, waiting if necessary
   * @param tokens Number of tokens to acquire (default: 1)
   * @returns Promise that resolves when tokens are acquired
   */
  async acquire(tokens: number = 1): Promise<void> {
    this.refillTokens();

    if (this.tokens >= tokens && this.waitQueue.length === 0) {
      this.tokens -= tokens;
      return;
    }

    return new Promise<void>((resolve) => {
      this.waitQueue.push({ resolve, tokens });

      // Set up periodic check for token availability
      const checkInterval = setInterval(() => {
        this.refillTokens();
        this.processQueue();

        // Clean up interval if this request has been processed
        if (!this.waitQueue.some(item => item.resolve === resolve)) {
          clearInterval(checkInterval);
        }
      }, Math.min(100, this.interval / 10));
    });
  }

  /**
   * Try to acquire tokens without waiting
   * @param tokens Number of tokens to acquire (default: 1)
   * @returns true if tokens were acquired, false otherwise
   */
  tryAcquire(tokens: number = 1): boolean {
    this.refillTokens();

    if (this.tokens >= tokens && this.waitQueue.length === 0) {
      this.tokens -= tokens;
      return true;
    }

    return false;
  }

  /**
   * Get current available tokens (for monitoring)
   */
  getAvailableTokens(): number {
    this.refillTokens();
    return this.tokens;
  }

  /**
   * Get estimated wait time for acquiring tokens
   * @param tokens Number of tokens needed
   * @returns Estimated wait time in milliseconds
   */
  getEstimatedWaitTime(tokens: number = 1): number {
    this.refillTokens();

    const deficit = tokens - this.tokens + this.waitQueue.reduce((sum, item) => sum + item.tokens, 0);
    if (deficit <= 0) return 0;

    return Math.ceil(deficit / this.tokensPerInterval) * this.interval;
  }
}

/**
 * Concurrency Limiter
 *
 * Limits the number of concurrent operations
 */
export class ConcurrencyLimiter {
  private running: number = 0;
  private maxConcurrent: number;
  private queue: Array<() => void> = [];

  constructor(maxConcurrent: number) {
    this.maxConcurrent = maxConcurrent;
  }

  /**
   * Execute a function with concurrency limiting
   */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  private async acquire(): Promise<void> {
    if (this.running < this.maxConcurrent) {
      this.running++;
      return;
    }

    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  private release(): void {
    this.running--;
    if (this.queue.length > 0) {
      this.running++;
      const next = this.queue.shift()!;
      next();
    }
  }

  /**
   * Get current number of running tasks
   */
  getRunning(): number {
    return this.running;
  }

  /**
   * Get current queue length
   */
  getQueueLength(): number {
    return this.queue.length;
  }
}

// Pre-configured rate limiters for common use cases

/**
 * Rate limiter for Anthropic Claude API
 * Conservative: 40 requests per minute to stay well under limits
 */
export const claudeRateLimiter = new RateLimiter({
  tokensPerInterval: 40,
  interval: 60000, // 1 minute
  maxTokens: 40,
});

/**
 * Rate limiter for web scraping
 * Aggressive but reasonable: 20 requests per second
 */
export const scrapeRateLimiter = new RateLimiter({
  tokensPerInterval: 20,
  interval: 1000, // 1 second
  maxTokens: 20,
});

/**
 * Concurrency limiter for parallel operations
 * Default: 10 concurrent operations
 */
export const defaultConcurrencyLimiter = new ConcurrencyLimiter(10);
