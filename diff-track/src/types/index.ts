export type PageType =
  | 'homepage'
  | 'pricing'
  | 'careers'
  | 'about'
  | 'customers'
  | 'product'
  | 'blog'
  | 'other';

export interface ExtractedSignals {
  product: {
    name: string | null;
    tagline: string | null;
    description: string | null;
    features: string[];
    integrations: string[];
  };
  pricing: {
    model: 'freemium' | 'subscription' | 'usage' | 'enterprise' | 'unknown';
    tiers: Array<{
      name: string;
      price: string;
      interval: string;
      features: string[];
    }>;
    hasFreeTier: boolean;
    hasTrial: boolean;
  };
  customers: {
    logoNames: string[];
    testimonialCompanies: string[];
    caseStudies: string[];
    metrics: string[];
  };
  jobs: {
    openings: Array<{
      title: string;
      department: string;
      location: string;
    }>;
    totalCount: number;
    departments: string[];
  };
  team: {
    founders: string[];
    teamSize: string | null;
    recentHires: string[];
  };
  funding: {
    mentioned: boolean;
    stage: string | null;
    amount: string | null;
    investors: string[];
  };
  other: {
    newsItems: string[];
    partnerships: string[];
    awards: string[];
  };
}

export interface Company {
  id: string;
  name: string;
  websiteUrl: string;
  notes: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface TrackedPage {
  id: string;
  companyId: string;
  url: string;
  pageType: PageType;
  createdAt: number;
}

export interface Snapshot {
  id: string;
  trackedPageId: string;
  rawHtml: string;
  cleanedText: string | null;
  scrapedAt: number;
}

export interface Signal {
  id: string;
  snapshotId: string;
  signalsJson: string;
  extractedAt: number;
}

export interface Diff {
  id: string;
  companyId: string;
  scrapeRunId: string;
  oldSignalsId: string | null;
  newSignalsId: string;
  summary: string;
  changesJson: string;
  createdAt: number;
}

export interface DiffChange {
  category: string;
  field: string;
  oldValue: unknown;
  newValue: unknown;
  changeType: 'added' | 'removed' | 'modified';
}

export interface ScrapeProgress {
  companyId: string;
  companyName: string;
  pageUrl: string;
  status: 'pending' | 'scraping' | 'extracting' | 'complete' | 'error';
  error?: string;
}

export interface ScrapeResult {
  companyId: string;
  companyName: string;
  pagesScraped: number;
  changesDetected: boolean;
  diffSummary: string | null;
  errors: string[];
}

// Discovery types
export interface DiscoveredPage {
  url: string;
  pageType: PageType;
  exists: boolean;
}

export interface DiscoveryResult {
  baseUrl: string;
  suggestedName: string | null;
  discoveredPages: DiscoveredPage[];
}

// Batch import types
export interface BatchCompanyInput {
  websiteUrl: string;
  notes?: string;
}

export interface BatchCompanyResult {
  id: string;
  name: string;
  pagesCount: number;
}

export interface BatchImportResult {
  created: BatchCompanyResult[];
  failed: Array<{ url: string; error: string }>;
}
