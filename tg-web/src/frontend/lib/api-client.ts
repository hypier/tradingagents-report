import { hc } from 'hono/client';

import type { AppType } from '@/backend/app';
import type { ApiSuccess } from '@/shared/contracts';

export const apiClient = hc<AppType>('/api');

export type ApiResponse<T> = ApiSuccess<T>;
