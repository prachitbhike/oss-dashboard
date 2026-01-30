import { chromium, Browser, Page } from 'playwright';

let browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browser) {
    browser = await chromium.launch({
      headless: true,
    });
  }
  return browser;
}

export async function closeBrowser(): Promise<void> {
  if (browser) {
    await browser.close();
    browser = null;
  }
}

interface ScrapeResult {
  rawHtml: string;
  cleanedText: string;
  error?: string;
}

export async function scrapePage(url: string): Promise<ScrapeResult> {
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });

  const page = await context.newPage();

  try {
    // Navigate with timeout
    await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    // Wait a bit for any dynamic content
    await page.waitForTimeout(2000);

    // Get raw HTML
    const rawHtml = await page.content();

    // Extract and clean text content
    const cleanedText = await extractCleanText(page);

    await context.close();

    return {
      rawHtml,
      cleanedText,
    };
  } catch (error) {
    await context.close();
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      rawHtml: '',
      cleanedText: '',
      error: errorMessage,
    };
  }
}

async function extractCleanText(page: Page): Promise<string> {
  return page.evaluate(() => {
    // Clone the body to avoid modifying the actual page
    const clone = document.body.cloneNode(true) as HTMLElement;

    // Remove unwanted elements
    const selectorsToRemove = [
      'script',
      'style',
      'noscript',
      'iframe',
      'nav',
      'header',
      'footer',
      'aside',
      '[role="navigation"]',
      '[role="banner"]',
      '[role="contentinfo"]',
      '.cookie-banner',
      '.cookie-notice',
      '#cookie-banner',
      '.gdpr',
      '.popup',
      '.modal',
      '.advertisement',
      '.ads',
      '.social-share',
      '.comments',
    ];

    selectorsToRemove.forEach(selector => {
      clone.querySelectorAll(selector).forEach(el => el.remove());
    });

    // Get text content
    let text = clone.innerText || clone.textContent || '';

    // Clean up whitespace
    text = text
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .join('\n');

    // Remove excessive newlines
    text = text.replace(/\n{3,}/g, '\n\n');

    return text;
  });
}

// Lightweight URL probing for discovery
export interface ProbeResult {
  exists: boolean;
  statusCode: number | null;
  title: string | null;
  error?: string;
}

export async function probeUrl(url: string): Promise<ProbeResult> {
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });

  const page = await context.newPage();

  try {
    const response = await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 10000,
    });

    const statusCode = response?.status() ?? null;
    const exists = statusCode !== null && statusCode >= 200 && statusCode < 400;

    let title: string | null = null;
    if (exists) {
      title = await page.title().catch(() => null);
    }

    await context.close();

    return {
      exists,
      statusCode,
      title,
    };
  } catch (error) {
    await context.close();
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      exists: false,
      statusCode: null,
      title: null,
      error: errorMessage,
    };
  }
}

// Rate limiting helper
const lastScrapeTime: Map<string, number> = new Map();
const MIN_DELAY_MS = 2000; // 2 seconds between requests to same domain

export async function scrapeWithRateLimit(url: string): Promise<ScrapeResult> {
  const domain = new URL(url).hostname;
  const now = Date.now();
  const lastTime = lastScrapeTime.get(domain) || 0;
  const timeSinceLast = now - lastTime;

  if (timeSinceLast < MIN_DELAY_MS) {
    await new Promise(resolve => setTimeout(resolve, MIN_DELAY_MS - timeSinceLast));
  }

  lastScrapeTime.set(domain, Date.now());
  return scrapePage(url);
}

export async function probeWithRateLimit(url: string): Promise<ProbeResult> {
  const domain = new URL(url).hostname;
  const now = Date.now();
  const lastTime = lastScrapeTime.get(domain) || 0;
  const timeSinceLast = now - lastTime;

  if (timeSinceLast < MIN_DELAY_MS) {
    await new Promise(resolve => setTimeout(resolve, MIN_DELAY_MS - timeSinceLast));
  }

  lastScrapeTime.set(domain, Date.now());
  return probeUrl(url);
}
