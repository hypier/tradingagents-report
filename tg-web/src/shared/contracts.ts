export type ApiSuccess<T> = { data: T; requestId: string };

export type ApiFailure = {
  error: { code: string; message: string; requestId: string };
};

export function apiSuccess<T>(data: T, requestId: string): ApiSuccess<T> {
  return { data, requestId };
}

export function isApiFailure(value: unknown): value is ApiFailure {
  return typeof value === 'object' && value !== null && 'error' in value;
}
import { z } from 'zod';

export const createAnalysisSchema = z.object({
  ticker: z.string().trim().min(1).max(32),
  tradeDate: z.string().date(),
  analysts: z
    .array(z.enum(['market', 'social', 'news', 'fundamentals']))
    .min(1),
  configOverrides: z.record(z.string(), z.unknown()).default({}),
});
