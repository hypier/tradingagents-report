import type { CreateBillingPlanInput } from './contract';

export type DefaultBillingPlanDefinition = CreateBillingPlanInput & {
  catalogKey: string;
};

const SUPPORTED_MARKETS = ['US', 'HK', 'CN', 'CRYPTO'];

export const DEFAULT_MONTHLY_BILLING_PLANS: DefaultBillingPlanDefinition[] = [
  {
    catalogKey: 'starter-usd-monthly-20-v1',
    name: 'Starter 20',
    description: '20 analysis credits, renewed monthly',
    unitAmount: 2_000,
    currency: 'usd',
    interval: 'month',
    analysisCredits: 20,
    supportedMarkets: [...SUPPORTED_MARKETS],
    features: ['20 analysis credits per month', 'All supported markets'],
  },
  {
    catalogKey: 'growth-usd-monthly-50-v1',
    name: 'Growth 50',
    description: '50 analysis credits, renewed monthly',
    unitAmount: 5_000,
    currency: 'usd',
    interval: 'month',
    analysisCredits: 50,
    supportedMarkets: [...SUPPORTED_MARKETS],
    features: ['50 analysis credits per month', 'All supported markets'],
  },
  {
    catalogKey: 'scale-usd-monthly-100-v1',
    name: 'Scale 100',
    description: '100 analysis credits, renewed monthly',
    unitAmount: 10_000,
    currency: 'usd',
    interval: 'month',
    analysisCredits: 100,
    supportedMarkets: [...SUPPORTED_MARKETS],
    features: ['100 analysis credits per month', 'All supported markets'],
  },
];
