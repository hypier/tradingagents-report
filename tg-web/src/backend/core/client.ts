import { AppError } from '../errors/app-error';
import type { ListingResolver, ResolvedListing } from '../../shared/listing';

const CORE_TIMEOUT_MS = 5_000;

export interface CoreClientContract extends ListingResolver {
  healthcheck(): Promise<void>;
  submitAnalysis(input: unknown): Promise<unknown>;
  listAnalyses(
    input: URLSearchParams,
    ownerId: string | null,
  ): Promise<unknown>;
  getAnalysis(id: string, ownerId: string | null): Promise<unknown>;
  getAnalysisEvents(id: string, ownerId: string | null): Promise<unknown>;
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

  async resolveListing(ticker: string): Promise<ResolvedListing> {
    const normalized = ticker.trim().toUpperCase();
    const payload = await this.request(
      `/api/v1/listings/resolve?ticker=${encodeURIComponent(normalized)}`,
      {},
      true,
    );
    return readResolvedListing(payload, normalized);
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

  listAnalyses(
    input: URLSearchParams,
    ownerId: string | null,
  ): Promise<unknown> {
    const parameters = new URLSearchParams(input);
    parameters.delete('owner_id');
    if (ownerId) parameters.set('owner_id', ownerId);
    const search = parameters.toString();
    return this.request(
      `/api/v1/analyses${search ? `?${search}` : ''}`,
      {},
      true,
    );
  }

  getAnalysis(id: string, ownerId: string | null): Promise<unknown> {
    return this.request(
      withOwnerScope(`/api/v1/analyses/${encodeURIComponent(id)}`, ownerId),
      {},
      true,
    );
  }

  getAnalysisEvents(id: string, ownerId: string | null): Promise<unknown> {
    return this.request(
      withOwnerScope(
        `/api/v1/analyses/${encodeURIComponent(id)}/events`,
        ownerId,
      ),
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
        if (response.status === 404) {
          throw new AppError(
            'ANALYSIS_NOT_FOUND',
            404,
            'Analysis job not found',
          );
        }
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

function withOwnerScope(path: string, ownerId: string | null) {
  if (!ownerId) return path;
  return `${path}?owner_id=${encodeURIComponent(ownerId)}`;
}

function readResolvedListing(
  payload: unknown,
  fallbackTicker: string,
): ResolvedListing {
  if (!isRecord(payload)) {
    throw coreUnavailable();
  }

  const symbol = stringValue(payload.symbol) || fallbackTicker;
  const displayTicker = stringValue(payload.display_ticker) || fallbackTicker;
  const exchange = stringValue(payload.exchange) || null;
  const providerSymbol = stringValue(payload.provider_symbol) || null;

  return {
    ticker: stringValue(payload.ticker) || fallbackTicker,
    exchange,
    symbol,
    display_ticker: displayTicker,
    provider_symbol: providerSymbol,
  };
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
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
