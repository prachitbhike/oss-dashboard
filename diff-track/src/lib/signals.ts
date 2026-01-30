import { callClaudeWithJson } from './llm';
import { ExtractedSignals, PageType } from '@/types';

const SIGNAL_SCHEMA = `{
  "product": {
    "name": "string or null",
    "tagline": "string or null",
    "description": "string or null",
    "features": ["array of feature strings"],
    "integrations": ["array of integration names"]
  },
  "pricing": {
    "model": "freemium|subscription|usage|enterprise|unknown",
    "tiers": [{
      "name": "tier name",
      "price": "price string",
      "interval": "monthly|yearly|one-time|custom",
      "features": ["features included"]
    }],
    "hasFreeTier": boolean,
    "hasTrial": boolean
  },
  "customers": {
    "logoNames": ["company names from logo sections"],
    "testimonialCompanies": ["companies mentioned in testimonials"],
    "caseStudies": ["case study titles or companies"],
    "metrics": ["metrics like '10,000+ users'"]
  },
  "jobs": {
    "openings": [{
      "title": "job title",
      "department": "department",
      "location": "location"
    }],
    "totalCount": number,
    "departments": ["unique departments hiring"]
  },
  "team": {
    "founders": ["founder names"],
    "teamSize": "string or null",
    "recentHires": ["recent hire announcements"]
  },
  "funding": {
    "mentioned": boolean,
    "stage": "seed|series-a|series-b|etc or null",
    "amount": "amount string or null",
    "investors": ["investor names"]
  },
  "other": {
    "newsItems": ["news or announcements"],
    "partnerships": ["partnership mentions"],
    "awards": ["awards or recognition"]
  }
}`;

const PAGE_TYPE_GUIDANCE: Record<PageType, string> = {
  homepage: 'Focus on product overview, tagline, key features, and social proof (logos, metrics).',
  pricing: 'Focus on pricing tiers, pricing model, free tier availability, and trial options.',
  careers: 'Focus on job openings, departments hiring, team size, and company culture signals.',
  about: 'Focus on team information, founders, company story, and funding/investor mentions.',
  customers: 'Focus on customer logos, testimonials, case studies, and success metrics.',
  product: 'Focus on product features, integrations, and technical capabilities.',
  blog: 'Focus on news items, announcements, partnerships, and company updates.',
  other: 'Extract any relevant signals you can find from the content.',
};

export async function extractSignals(
  cleanedText: string,
  pageType: PageType,
  companyName: string,
  pageUrl: string
): Promise<ExtractedSignals> {
  const systemPrompt = `You are an expert at extracting structured business intelligence signals from startup company webpages. Your job is to extract factual information that would be valuable for investors tracking early-stage companies.

Rules:
- Only include information that is explicitly stated on the page
- Use null for fields where information is not available
- Use empty arrays [] when no items are found for a list field
- Be conservative - do not infer or guess information
- For pricing, only include if actual prices are shown
- For customers, only include company names you can clearly identify
- Return valid JSON that matches the schema exactly`;

  const userPrompt = `Analyze this webpage from ${companyName} and extract structured signals.

Page Type: ${pageType}
Page URL: ${pageUrl}
Guidance: ${PAGE_TYPE_GUIDANCE[pageType]}

Page Content:
${cleanedText.slice(0, 15000)}

Extract signals according to this JSON schema:
${SIGNAL_SCHEMA}

Return ONLY the JSON object, no explanation.`;

  try {
    const signals = await callClaudeWithJson<ExtractedSignals>(
      systemPrompt,
      userPrompt,
      4096
    );
    return normalizeSignals(signals);
  } catch (error) {
    console.error('Failed to extract signals:', error);
    return getEmptySignals();
  }
}

function normalizeSignals(signals: Partial<ExtractedSignals>): ExtractedSignals {
  return {
    product: {
      name: signals.product?.name ?? null,
      tagline: signals.product?.tagline ?? null,
      description: signals.product?.description ?? null,
      features: signals.product?.features ?? [],
      integrations: signals.product?.integrations ?? [],
    },
    pricing: {
      model: signals.pricing?.model ?? 'unknown',
      tiers: signals.pricing?.tiers ?? [],
      hasFreeTier: signals.pricing?.hasFreeTier ?? false,
      hasTrial: signals.pricing?.hasTrial ?? false,
    },
    customers: {
      logoNames: signals.customers?.logoNames ?? [],
      testimonialCompanies: signals.customers?.testimonialCompanies ?? [],
      caseStudies: signals.customers?.caseStudies ?? [],
      metrics: signals.customers?.metrics ?? [],
    },
    jobs: {
      openings: signals.jobs?.openings ?? [],
      totalCount: signals.jobs?.totalCount ?? 0,
      departments: signals.jobs?.departments ?? [],
    },
    team: {
      founders: signals.team?.founders ?? [],
      teamSize: signals.team?.teamSize ?? null,
      recentHires: signals.team?.recentHires ?? [],
    },
    funding: {
      mentioned: signals.funding?.mentioned ?? false,
      stage: signals.funding?.stage ?? null,
      amount: signals.funding?.amount ?? null,
      investors: signals.funding?.investors ?? [],
    },
    other: {
      newsItems: signals.other?.newsItems ?? [],
      partnerships: signals.other?.partnerships ?? [],
      awards: signals.other?.awards ?? [],
    },
  };
}

export function getEmptySignals(): ExtractedSignals {
  return {
    product: {
      name: null,
      tagline: null,
      description: null,
      features: [],
      integrations: [],
    },
    pricing: {
      model: 'unknown',
      tiers: [],
      hasFreeTier: false,
      hasTrial: false,
    },
    customers: {
      logoNames: [],
      testimonialCompanies: [],
      caseStudies: [],
      metrics: [],
    },
    jobs: {
      openings: [],
      totalCount: 0,
      departments: [],
    },
    team: {
      founders: [],
      teamSize: null,
      recentHires: [],
    },
    funding: {
      mentioned: false,
      stage: null,
      amount: null,
      investors: [],
    },
    other: {
      newsItems: [],
      partnerships: [],
      awards: [],
    },
  };
}

export function mergeSignals(signalsArray: ExtractedSignals[]): ExtractedSignals {
  const merged = getEmptySignals();

  for (const signals of signalsArray) {
    // Product - take first non-null values
    if (!merged.product.name && signals.product.name) {
      merged.product.name = signals.product.name;
    }
    if (!merged.product.tagline && signals.product.tagline) {
      merged.product.tagline = signals.product.tagline;
    }
    if (!merged.product.description && signals.product.description) {
      merged.product.description = signals.product.description;
    }
    merged.product.features = [...new Set([...merged.product.features, ...signals.product.features])];
    merged.product.integrations = [...new Set([...merged.product.integrations, ...signals.product.integrations])];

    // Pricing - prefer more complete data
    if (signals.pricing.model !== 'unknown') {
      merged.pricing.model = signals.pricing.model;
    }
    if (signals.pricing.tiers.length > merged.pricing.tiers.length) {
      merged.pricing.tiers = signals.pricing.tiers;
    }
    merged.pricing.hasFreeTier = merged.pricing.hasFreeTier || signals.pricing.hasFreeTier;
    merged.pricing.hasTrial = merged.pricing.hasTrial || signals.pricing.hasTrial;

    // Customers - merge all
    merged.customers.logoNames = [...new Set([...merged.customers.logoNames, ...signals.customers.logoNames])];
    merged.customers.testimonialCompanies = [...new Set([...merged.customers.testimonialCompanies, ...signals.customers.testimonialCompanies])];
    merged.customers.caseStudies = [...new Set([...merged.customers.caseStudies, ...signals.customers.caseStudies])];
    merged.customers.metrics = [...new Set([...merged.customers.metrics, ...signals.customers.metrics])];

    // Jobs - take the most complete data
    if (signals.jobs.openings.length > merged.jobs.openings.length) {
      merged.jobs.openings = signals.jobs.openings;
    }
    merged.jobs.totalCount = Math.max(merged.jobs.totalCount, signals.jobs.totalCount);
    merged.jobs.departments = [...new Set([...merged.jobs.departments, ...signals.jobs.departments])];

    // Team - merge
    merged.team.founders = [...new Set([...merged.team.founders, ...signals.team.founders])];
    if (!merged.team.teamSize && signals.team.teamSize) {
      merged.team.teamSize = signals.team.teamSize;
    }
    merged.team.recentHires = [...new Set([...merged.team.recentHires, ...signals.team.recentHires])];

    // Funding - take if mentioned
    if (signals.funding.mentioned) {
      merged.funding.mentioned = true;
      if (signals.funding.stage) merged.funding.stage = signals.funding.stage;
      if (signals.funding.amount) merged.funding.amount = signals.funding.amount;
      merged.funding.investors = [...new Set([...merged.funding.investors, ...signals.funding.investors])];
    }

    // Other - merge all
    merged.other.newsItems = [...new Set([...merged.other.newsItems, ...signals.other.newsItems])];
    merged.other.partnerships = [...new Set([...merged.other.partnerships, ...signals.other.partnerships])];
    merged.other.awards = [...new Set([...merged.other.awards, ...signals.other.awards])];
  }

  return merged;
}
