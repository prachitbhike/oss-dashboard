import { PageType, DiscoveredPage, DiscoveryResult } from '@/types';
import { probeWithRateLimit, ProbeResult } from './scraper';

const DISCOVERY_PATHS: Record<PageType, string[]> = {
  homepage: ['/'],
  pricing: ['/pricing', '/plans', '/price'],
  careers: ['/careers', '/jobs', '/join', '/hiring'],
  about: ['/about', '/company', '/team', '/about-us'],
  customers: ['/customers', '/case-studies', '/success-stories'],
  product: ['/product', '/features', '/solutions'],
  blog: ['/blog', '/news', '/articles'],
  other: [],
};

function normalizeUrl(baseUrl: string): string {
  let url = baseUrl.trim();
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }
  // Remove trailing slash
  url = url.replace(/\/$/, '');
  return url;
}

function extractCompanyNameFromTitle(title: string | null): string | null {
  if (!title) return null;

  // Common patterns to strip from titles
  const patternsToStrip = [
    /\s*[-|–—:]\s*Home.*$/i,
    /\s*[-|–—:]\s*Homepage.*$/i,
    /\s*[-|–—:]\s*Official Site.*$/i,
    /\s*[-|–—:]\s*Welcome.*$/i,
    /^Home\s*[-|–—:]\s*/i,
    /^Welcome to\s*/i,
  ];

  let name = title;
  for (const pattern of patternsToStrip) {
    name = name.replace(pattern, '');
  }

  // Take only the first part if there's a separator
  const separators = [' - ', ' | ', ' – ', ' — ', ' : '];
  for (const sep of separators) {
    if (name.includes(sep)) {
      name = name.split(sep)[0];
      break;
    }
  }

  return name.trim() || null;
}

export async function discoverPages(baseUrl: string): Promise<DiscoveryResult> {
  const normalizedBase = normalizeUrl(baseUrl);
  const discoveredPages: DiscoveredPage[] = [];
  let suggestedName: string | null = null;

  // First, probe the homepage to get the company name
  const homepageResult = await probeWithRateLimit(normalizedBase);

  if (homepageResult.exists) {
    suggestedName = extractCompanyNameFromTitle(homepageResult.title);
    discoveredPages.push({
      url: normalizedBase,
      pageType: 'homepage',
      exists: true,
    });
  } else {
    // If homepage doesn't work, still add it as non-existent
    discoveredPages.push({
      url: normalizedBase,
      pageType: 'homepage',
      exists: false,
    });
  }

  // Probe other paths
  const pageTypes: PageType[] = ['pricing', 'careers', 'about', 'customers', 'product', 'blog'];

  for (const pageType of pageTypes) {
    const paths = DISCOVERY_PATHS[pageType];
    let found = false;

    for (const path of paths) {
      if (found) break;

      const fullUrl = normalizedBase + path;
      const result = await probeWithRateLimit(fullUrl);

      if (result.exists) {
        discoveredPages.push({
          url: fullUrl,
          pageType,
          exists: true,
        });
        found = true;
      }
    }

    // If no path found for this type, add first path as non-existent
    if (!found) {
      discoveredPages.push({
        url: normalizedBase + paths[0],
        pageType,
        exists: false,
      });
    }
  }

  return {
    baseUrl: normalizedBase,
    suggestedName,
    discoveredPages,
  };
}

export async function probeUrlQuick(url: string): Promise<ProbeResult> {
  return probeWithRateLimit(url);
}
