import type { CreateBillingPlanInput } from './contract';

export type DefaultBillingPlanDefinition = CreateBillingPlanInput & {
  catalogKey: string;
  legacyCatalogKey: string;
};

const SUPPORTED_MARKETS = ['US', 'HK', 'CN', 'CRYPTO'];

export const DEFAULT_MONTHLY_BILLING_PLANS: DefaultBillingPlanDefinition[] = [
  {
    catalogKey: 'starter-usd-monthly-2000-v2',
    legacyCatalogKey: 'starter-usd-monthly-20-v1',
    name: 'Starter 20',
    description: '2,000 usage points, renewed monthly',
    unitAmount: 2_000,
    currency: 'usd',
    interval: 'month',
    analysisCredits: 2_000,
    supportedMarkets: [...SUPPORTED_MARKETS],
    features: ['2,000 usage points per month', 'All supported markets'],
  },
  {
    catalogKey: 'growth-usd-monthly-5000-v2',
    legacyCatalogKey: 'growth-usd-monthly-50-v1',
    name: 'Growth 50',
    description: '5,000 usage points, renewed monthly',
    unitAmount: 5_000,
    currency: 'usd',
    interval: 'month',
    analysisCredits: 5_000,
    supportedMarkets: [...SUPPORTED_MARKETS],
    features: ['5,000 usage points per month', 'All supported markets'],
  },
  {
    catalogKey: 'scale-usd-monthly-10000-v2',
    legacyCatalogKey: 'scale-usd-monthly-100-v1',
    name: 'Scale 100',
    description: '10,000 usage points, renewed monthly',
    unitAmount: 10_000,
    currency: 'usd',
    interval: 'month',
    analysisCredits: 10_000,
    supportedMarkets: [...SUPPORTED_MARKETS],
    features: ['10,000 usage points per month', 'All supported markets'],
  },
];
