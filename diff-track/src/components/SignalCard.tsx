'use client';

import { Card, CardTitle } from './ui/Card';
import { Badge } from './ui/Badge';
import { ExtractedSignals } from '@/types';

interface SignalCardProps {
  signals: ExtractedSignals;
}

export function SignalCard({ signals }: SignalCardProps) {
  return (
    <div className="space-y-4">
      {/* Product */}
      {(signals.product.name || signals.product.features.length > 0) && (
        <Card>
          <CardTitle>Product</CardTitle>
          {signals.product.name && (
            <p className="text-lg font-medium mt-2">{signals.product.name}</p>
          )}
          {signals.product.tagline && (
            <p className="text-gray-600 mt-1">{signals.product.tagline}</p>
          )}
          {signals.product.description && (
            <p className="text-sm text-gray-500 mt-2">{signals.product.description}</p>
          )}
          {signals.product.features.length > 0 && (
            <div className="mt-3">
              <p className="text-sm font-medium text-gray-700 mb-2">Features:</p>
              <div className="flex flex-wrap gap-2">
                {signals.product.features.map((feature, i) => (
                  <Badge key={i} variant="info">{feature}</Badge>
                ))}
              </div>
            </div>
          )}
          {signals.product.integrations.length > 0 && (
            <div className="mt-3">
              <p className="text-sm font-medium text-gray-700 mb-2">Integrations:</p>
              <div className="flex flex-wrap gap-2">
                {signals.product.integrations.map((integration, i) => (
                  <Badge key={i}>{integration}</Badge>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Pricing */}
      {(signals.pricing.model !== 'unknown' || signals.pricing.tiers.length > 0) && (
        <Card>
          <CardTitle>Pricing</CardTitle>
          <div className="mt-2 flex gap-2">
            <Badge variant="success">{signals.pricing.model}</Badge>
            {signals.pricing.hasFreeTier && <Badge>Free tier</Badge>}
            {signals.pricing.hasTrial && <Badge>Free trial</Badge>}
          </div>
          {signals.pricing.tiers.length > 0 && (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {signals.pricing.tiers.map((tier, i) => (
                <div key={i} className="p-3 bg-gray-50 rounded-lg">
                  <p className="font-medium">{tier.name}</p>
                  <p className="text-lg font-bold text-blue-600">
                    {tier.price}
                    <span className="text-sm text-gray-500 font-normal">/{tier.interval}</span>
                  </p>
                  {tier.features.length > 0 && (
                    <ul className="mt-2 text-sm text-gray-600 space-y-1">
                      {tier.features.slice(0, 4).map((f, j) => (
                        <li key={j}>• {f}</li>
                      ))}
                      {tier.features.length > 4 && (
                        <li className="text-gray-400">+{tier.features.length - 4} more</li>
                      )}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Customers */}
      {(signals.customers.logoNames.length > 0 || signals.customers.metrics.length > 0) && (
        <Card>
          <CardTitle>Customers</CardTitle>
          {signals.customers.metrics.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {signals.customers.metrics.map((metric, i) => (
                <Badge key={i} variant="success">{metric}</Badge>
              ))}
            </div>
          )}
          {signals.customers.logoNames.length > 0 && (
            <div className="mt-3">
              <p className="text-sm font-medium text-gray-700 mb-2">Customer logos:</p>
              <div className="flex flex-wrap gap-2">
                {signals.customers.logoNames.map((name, i) => (
                  <Badge key={i}>{name}</Badge>
                ))}
              </div>
            </div>
          )}
          {signals.customers.caseStudies.length > 0 && (
            <div className="mt-3">
              <p className="text-sm font-medium text-gray-700 mb-2">Case studies:</p>
              <ul className="text-sm text-gray-600 space-y-1">
                {signals.customers.caseStudies.map((cs, i) => (
                  <li key={i}>• {cs}</li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      {/* Jobs */}
      {signals.jobs.totalCount > 0 && (
        <Card>
          <CardTitle>Jobs</CardTitle>
          <p className="mt-2 text-lg font-medium">{signals.jobs.totalCount} open positions</p>
          {signals.jobs.departments.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {signals.jobs.departments.map((dept, i) => (
                <Badge key={i} variant="warning">{dept}</Badge>
              ))}
            </div>
          )}
          {signals.jobs.openings.length > 0 && (
            <div className="mt-3">
              <p className="text-sm font-medium text-gray-700 mb-2">Sample openings:</p>
              <ul className="text-sm text-gray-600 space-y-1">
                {signals.jobs.openings.slice(0, 5).map((job, i) => (
                  <li key={i}>• {job.title} ({job.department}) - {job.location}</li>
                ))}
                {signals.jobs.openings.length > 5 && (
                  <li className="text-gray-400">+{signals.jobs.openings.length - 5} more</li>
                )}
              </ul>
            </div>
          )}
        </Card>
      )}

      {/* Funding */}
      {signals.funding.mentioned && (
        <Card>
          <CardTitle>Funding</CardTitle>
          <div className="mt-2 flex flex-wrap gap-2">
            {signals.funding.stage && <Badge variant="success">{signals.funding.stage}</Badge>}
            {signals.funding.amount && <Badge variant="info">{signals.funding.amount}</Badge>}
          </div>
          {signals.funding.investors.length > 0 && (
            <div className="mt-3">
              <p className="text-sm font-medium text-gray-700 mb-2">Investors:</p>
              <div className="flex flex-wrap gap-2">
                {signals.funding.investors.map((investor, i) => (
                  <Badge key={i}>{investor}</Badge>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Team */}
      {(signals.team.founders.length > 0 || signals.team.teamSize) && (
        <Card>
          <CardTitle>Team</CardTitle>
          {signals.team.teamSize && (
            <p className="mt-2 text-gray-600">Team size: {signals.team.teamSize}</p>
          )}
          {signals.team.founders.length > 0 && (
            <div className="mt-2">
              <p className="text-sm font-medium text-gray-700 mb-2">Founders:</p>
              <div className="flex flex-wrap gap-2">
                {signals.team.founders.map((founder, i) => (
                  <Badge key={i}>{founder}</Badge>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Other */}
      {(signals.other.newsItems.length > 0 || signals.other.partnerships.length > 0 || signals.other.awards.length > 0) && (
        <Card>
          <CardTitle>Other Signals</CardTitle>
          {signals.other.partnerships.length > 0 && (
            <div className="mt-2">
              <p className="text-sm font-medium text-gray-700 mb-2">Partnerships:</p>
              <div className="flex flex-wrap gap-2">
                {signals.other.partnerships.map((p, i) => (
                  <Badge key={i} variant="info">{p}</Badge>
                ))}
              </div>
            </div>
          )}
          {signals.other.awards.length > 0 && (
            <div className="mt-3">
              <p className="text-sm font-medium text-gray-700 mb-2">Awards:</p>
              <div className="flex flex-wrap gap-2">
                {signals.other.awards.map((a, i) => (
                  <Badge key={i} variant="success">{a}</Badge>
                ))}
              </div>
            </div>
          )}
          {signals.other.newsItems.length > 0 && (
            <div className="mt-3">
              <p className="text-sm font-medium text-gray-700 mb-2">News:</p>
              <ul className="text-sm text-gray-600 space-y-1">
                {signals.other.newsItems.map((news, i) => (
                  <li key={i}>• {news}</li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
