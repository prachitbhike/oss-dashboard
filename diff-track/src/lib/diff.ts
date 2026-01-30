import { callClaude } from './llm';
import { ExtractedSignals, DiffChange } from '@/types';

export function computeChanges(
  oldSignals: ExtractedSignals | null,
  newSignals: ExtractedSignals
): DiffChange[] {
  if (!oldSignals) {
    return []; // No previous data to compare
  }

  const changes: DiffChange[] = [];

  // Compare product
  compareScalar(changes, 'product', 'name', oldSignals.product.name, newSignals.product.name);
  compareScalar(changes, 'product', 'tagline', oldSignals.product.tagline, newSignals.product.tagline);
  compareArray(changes, 'product', 'features', oldSignals.product.features, newSignals.product.features);
  compareArray(changes, 'product', 'integrations', oldSignals.product.integrations, newSignals.product.integrations);

  // Compare pricing
  compareScalar(changes, 'pricing', 'model', oldSignals.pricing.model, newSignals.pricing.model);
  compareScalar(changes, 'pricing', 'hasFreeTier', oldSignals.pricing.hasFreeTier, newSignals.pricing.hasFreeTier);
  compareScalar(changes, 'pricing', 'hasTrial', oldSignals.pricing.hasTrial, newSignals.pricing.hasTrial);
  if (JSON.stringify(oldSignals.pricing.tiers) !== JSON.stringify(newSignals.pricing.tiers)) {
    changes.push({
      category: 'pricing',
      field: 'tiers',
      oldValue: oldSignals.pricing.tiers,
      newValue: newSignals.pricing.tiers,
      changeType: 'modified',
    });
  }

  // Compare customers
  compareArray(changes, 'customers', 'logoNames', oldSignals.customers.logoNames, newSignals.customers.logoNames);
  compareArray(changes, 'customers', 'testimonialCompanies', oldSignals.customers.testimonialCompanies, newSignals.customers.testimonialCompanies);
  compareArray(changes, 'customers', 'caseStudies', oldSignals.customers.caseStudies, newSignals.customers.caseStudies);
  compareArray(changes, 'customers', 'metrics', oldSignals.customers.metrics, newSignals.customers.metrics);

  // Compare jobs
  compareScalar(changes, 'jobs', 'totalCount', oldSignals.jobs.totalCount, newSignals.jobs.totalCount);
  compareArray(changes, 'jobs', 'departments', oldSignals.jobs.departments, newSignals.jobs.departments);
  if (JSON.stringify(oldSignals.jobs.openings) !== JSON.stringify(newSignals.jobs.openings)) {
    const oldTitles = oldSignals.jobs.openings.map(j => j.title);
    const newTitles = newSignals.jobs.openings.map(j => j.title);
    const addedJobs = newTitles.filter(t => !oldTitles.includes(t));
    const removedJobs = oldTitles.filter(t => !newTitles.includes(t));

    if (addedJobs.length > 0 || removedJobs.length > 0) {
      changes.push({
        category: 'jobs',
        field: 'openings',
        oldValue: oldSignals.jobs.openings,
        newValue: newSignals.jobs.openings,
        changeType: 'modified',
      });
    }
  }

  // Compare team
  compareArray(changes, 'team', 'founders', oldSignals.team.founders, newSignals.team.founders);
  compareScalar(changes, 'team', 'teamSize', oldSignals.team.teamSize, newSignals.team.teamSize);
  compareArray(changes, 'team', 'recentHires', oldSignals.team.recentHires, newSignals.team.recentHires);

  // Compare funding
  compareScalar(changes, 'funding', 'mentioned', oldSignals.funding.mentioned, newSignals.funding.mentioned);
  compareScalar(changes, 'funding', 'stage', oldSignals.funding.stage, newSignals.funding.stage);
  compareScalar(changes, 'funding', 'amount', oldSignals.funding.amount, newSignals.funding.amount);
  compareArray(changes, 'funding', 'investors', oldSignals.funding.investors, newSignals.funding.investors);

  // Compare other
  compareArray(changes, 'other', 'newsItems', oldSignals.other.newsItems, newSignals.other.newsItems);
  compareArray(changes, 'other', 'partnerships', oldSignals.other.partnerships, newSignals.other.partnerships);
  compareArray(changes, 'other', 'awards', oldSignals.other.awards, newSignals.other.awards);

  return changes;
}

function compareScalar(
  changes: DiffChange[],
  category: string,
  field: string,
  oldValue: unknown,
  newValue: unknown
): void {
  if (oldValue !== newValue) {
    let changeType: 'added' | 'removed' | 'modified' = 'modified';
    if (oldValue === null && newValue !== null) changeType = 'added';
    if (oldValue !== null && newValue === null) changeType = 'removed';

    changes.push({
      category,
      field,
      oldValue,
      newValue,
      changeType,
    });
  }
}

function compareArray(
  changes: DiffChange[],
  category: string,
  field: string,
  oldArray: string[],
  newArray: string[]
): void {
  const oldSet = new Set(oldArray);
  const newSet = new Set(newArray);

  const added = newArray.filter(item => !oldSet.has(item));
  const removed = oldArray.filter(item => !newSet.has(item));

  if (added.length > 0) {
    changes.push({
      category,
      field,
      oldValue: [],
      newValue: added,
      changeType: 'added',
    });
  }

  if (removed.length > 0) {
    changes.push({
      category,
      field,
      oldValue: removed,
      newValue: [],
      changeType: 'removed',
    });
  }
}

export async function generateDiffSummary(
  companyName: string,
  changes: DiffChange[],
  oldDate: Date,
  newDate: Date
): Promise<string> {
  if (changes.length === 0) {
    return 'No significant changes detected.';
  }

  const systemPrompt = `You are an analyst summarizing changes detected in a startup company's online presence. Be concise and focus on the most important business-relevant changes.`;

  const changesText = changes.map(change => {
    const { category, field, oldValue, newValue, changeType } = change;
    if (changeType === 'added') {
      return `- ${category}.${field}: Added ${JSON.stringify(newValue)}`;
    } else if (changeType === 'removed') {
      return `- ${category}.${field}: Removed ${JSON.stringify(oldValue)}`;
    } else {
      return `- ${category}.${field}: Changed from ${JSON.stringify(oldValue)} to ${JSON.stringify(newValue)}`;
    }
  }).join('\n');

  const userPrompt = `Summarize the following changes detected for ${companyName} between ${oldDate.toLocaleDateString()} and ${newDate.toLocaleDateString()}.

Changes detected:
${changesText}

Focus on:
- New customers or logos added
- Pricing changes
- New product features or integrations
- Job posting changes (hiring trends)
- Funding announcements
- Significant partnerships or awards

Ignore minor wording changes. Write a brief summary (2-3 sentences) of the most important changes. If changes are minimal, say so.`;

  try {
    const summary = await callClaude(systemPrompt, userPrompt, 500);
    return summary.trim();
  } catch (error) {
    console.error('Failed to generate diff summary:', error);
    return `${changes.length} changes detected across ${[...new Set(changes.map(c => c.category))].join(', ')}.`;
  }
}

export function hasSignificantChanges(changes: DiffChange[]): boolean {
  // Define what counts as significant
  const significantFields = [
    'customers.logoNames',
    'customers.caseStudies',
    'pricing.model',
    'pricing.tiers',
    'jobs.openings',
    'jobs.totalCount',
    'funding.mentioned',
    'funding.stage',
    'funding.amount',
    'other.partnerships',
  ];

  return changes.some(change =>
    significantFields.includes(`${change.category}.${change.field}`)
  );
}
