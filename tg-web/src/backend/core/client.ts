import { AppError } from '../errors/app-error';

const CORE_TIMEOUT_MS = 5_000;

export interface CoreClientContract {
  healthcheck(): Promise<void>;
  submitAnalysis(input: unknown): Promise<unknown>;
  listAnalyses(input: URLSearchParams): Promise<unknown>;
  getAnalysis(id: string): Promise<unknown>;
  getAnalysisEvents(id: string): Promise<unknown>;
}

type FetchImplementation = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export class CoreClient implements CoreClientContract {
  constructor(
    private readonly baseUrl: URL,
    private readonly apiKey: string,
    private readonly fetchImplementation: FetchImplementation = fetch,
  ) {}

  async healthcheck(): Promise<void> {
    await this.request('/health');
  }

  submitAnalysis(input: unknown): Promise<unknown> {
    return this.request(
      '/api/v1/analyses',
      {
        method: 'POST',
        body: JSON.stringify(input),
        headers: { 'Content-Type': 'application/json' },
      },
      true,
    );
  }

  listAnalyses(input: URLSearchParams): Promise<unknown> {
    const search = input.toString();
    return this.request(
      `/api/v1/analyses${search ? `?${search}` : ''}`,
      {},
      true,
    );
  }

  getAnalysis(id: string): Promise<unknown> {
    return this.request(`/api/v1/analyses/${encodeURIComponent(id)}`, {}, true);
  }

  getAnalysisEvents(id: string): Promise<unknown> {
    return this.request(
      `/api/v1/analyses/${encodeURIComponent(id)}/events`,
      {},
      true,
    );
  }

  private async request(
    path: string,
    init: RequestInit = {},
    authenticated = false,
  ): Promise<unknown> {
    const headers = headersFrom(init.headers);
    if (authenticated) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }

    try {
      const response = await this.fetchImplementation(
        new URL(path, this.baseUrl).toString(),
        {
          ...init,
          headers,
          signal: AbortSignal.timeout(CORE_TIMEOUT_MS),
        },
      );

      if (!response.ok) {
        if (response.status === 400 || response.status === 409) {
          throw new AppError(
            'CORE_REQUEST_REJECTED',
            response.status,
            'Analysis service rejected the request',
          );
        }
        throw coreUnavailable();
      }

      if (response.status === 204) {
        return undefined;
      }

      return response.json();
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      throw coreUnavailable(error);
    }
  }
}

function coreUnavailable(cause?: unknown): AppError {
  return new AppError(
    'CORE_UNAVAILABLE',
    503,
    'Analysis service is temporarily unavailable',
    cause,
  );
}

function headersFrom(headers: HeadersInit | undefined): Record<string, string> {
  if (headers === undefined) {
    return {};
  }

  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }

  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }

  return { ...headers };
}
