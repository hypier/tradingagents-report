import { z } from 'zod';

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

export const createAnalysisSchema = z.object({
  requestId: z.string().uuid().optional(),
  ticker: z.string().trim().min(1).max(32),
  tradeDate: z.string().date(),
  analysts: z
    .array(z.enum(['market', 'social', 'news', 'fundamentals']))
    .min(1),
  quickModelId: z.string().uuid().optional(),
  deepModelId: z.string().uuid().optional(),
  configOverrides: z.record(z.string(), z.unknown()).default({}),
  instrument: z
    .object({
      exchange: z.string().trim().min(2).max(16),
      symbol: z.string().trim().min(1).max(32),
      display_ticker: z.string().trim().min(1).max(32).optional(),
    })
    .optional(),
  display: z
    .object({
      display_name: z.string().trim().min(1).max(256).optional(),
      english_name: z.string().trim().min(1).max(256).optional(),
      logo_url: z.string().trim().url().optional(),
      country: z.string().trim().min(2).max(8).optional(),
    })
    .optional(),
});
