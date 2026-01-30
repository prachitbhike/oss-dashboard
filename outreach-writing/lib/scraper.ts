import * as cheerio from 'cheerio';

interface ScrapeResult {
  title: string;
  description: string;
  content: string;
  success: boolean;
  error?: string;
}

export async function scrapeUrl(url: string): Promise<ScrapeResult> {
  try {
    // Validate and normalize URL
    const normalizedUrl = normalizeUrl(url);

    const response = await fetch(normalizedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    if (!response.ok) {
      return {
        title: '',
        description: '',
        content: '',
        success: false,
        error: `Failed to fetch URL: ${response.status} ${response.statusText}`,
      };
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Remove script, style, and other non-content elements
    $('script, style, nav, footer, header, aside, iframe, noscript').remove();

    // Extract metadata
    const title = $('title').text().trim() ||
                  $('meta[property="og:title"]').attr('content') ||
                  $('h1').first().text().trim() ||
                  '';

    const description = $('meta[name="description"]').attr('content') ||
                        $('meta[property="og:description"]').attr('content') ||
                        '';

    // Extract main content
    const contentSelectors = [
      'main',
      'article',
      '[role="main"]',
      '.content',
      '#content',
      '.main',
      '#main',
    ];

    let mainContent = '';
    for (const selector of contentSelectors) {
      const element = $(selector);
      if (element.length > 0) {
        mainContent = element.text();
        break;
      }
    }

    // Fallback to body if no main content found
    if (!mainContent) {
      mainContent = $('body').text();
    }

    // Clean up the content
    const cleanedContent = cleanText(mainContent);

    // Limit content length to avoid token limits
    const truncatedContent = cleanedContent.slice(0, 8000);

    return {
      title,
      description,
      content: truncatedContent,
      success: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    return {
      title: '',
      description: '',
      content: '',
      success: false,
      error: `Failed to scrape URL: ${message}`,
    };
  }
}

function normalizeUrl(url: string): string {
  let normalized = url.trim();

  // Add protocol if missing
  if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
    normalized = 'https://' + normalized;
  }

  // Validate URL
  try {
    new URL(normalized);
  } catch {
    throw new Error('Invalid URL format');
  }

  return normalized;
}

function cleanText(text: string): string {
  return text
    // Replace multiple whitespace with single space
    .replace(/\s+/g, ' ')
    // Remove extra newlines
    .replace(/\n{3,}/g, '\n\n')
    // Trim
    .trim();
}
