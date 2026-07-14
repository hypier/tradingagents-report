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
