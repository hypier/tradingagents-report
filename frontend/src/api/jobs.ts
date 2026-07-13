export type AnalystKey = 'market' | 'social' | 'news' | 'fundamentals'
export type AssetType = 'stock' | 'crypto'
export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed'

export interface AnalysisJob {
  id: string
  ticker: string
  trade_date: string
  asset_type: AssetType
  analysts: AnalystKey[]
  status: JobStatus
  progress_percent: number
  current_step: string | null
  events: Array<{
    progress?: number
    progress_percent?: number
    step?: string
    message?: string
    time?: string
    timestamp?: string
  }>
  tokens_used: number
  token_usage: Record<string, unknown>
  cost_usd: number
  cost_breakdown: Record<string, unknown>
  decision: string | null
  error: string | null
  report_path: string | null
  created_at: string
  updated_at: string
  started_at: string | null
  finished_at: string | null
}

export interface AnalysisDetail {
  task_id: string
  stock_symbol: string
  analysis_date: string | null
  market_type: string
  analysts: AnalystKey[]
  status: JobStatus
  status_label: string
  progress_percent: number
  current_step: string | null
  events: Array<{
    progress?: number
    progress_percent?: number
    step?: string
    message?: string
    time?: string
    timestamp?: string
  }>
  summary: string
  decision: {
    action?: string
    confidence?: number
    risk_score?: number
    target_price?: number | null
    reasoning?: string
  }
  recommendation: Record<string, unknown> | string
  reports: Record<string, string>
  tokens_used: number
  cost_usd: number
  error: string | null
  created_at: { $date: string } | null
  updated_at: { $date: string } | null
}

export interface CreateAnalysisInput {
  ticker: string
  trade_date: string
  asset_type: AssetType
  analysts: AnalystKey[]
  output_language: string
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...init?.headers
    }
  })

  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`
    try {
      const body = (await response.json()) as { detail?: string | Array<{ msg?: string }> }
      if (typeof body.detail === 'string') detail = body.detail
      if (Array.isArray(body.detail)) {
        detail =
          body.detail
            .map(item => item.msg)
            .filter(Boolean)
            .join('; ') || detail
      }
    } catch {
      // Keep the HTTP status when the response has no JSON body.
    }
    throw new Error(detail)
  }

  return (await response.json()) as T
}

export function checkHealth() {
  return apiFetch<{ status: string; database: string; detail: string | null }>('/health')
}

export function listAnalyses(params: { status?: JobStatus; ticker?: string; limit?: number } = {}) {
  const search = new URLSearchParams({ limit: String(params.limit ?? 100) })
  if (params.status) search.set('status', params.status)
  if (params.ticker) search.set('ticker', params.ticker)
  return apiFetch<AnalysisJob[]>(`/api/v1/analyses?${search.toString()}`)
}

export function createAnalysis(input: CreateAnalysisInput) {
  return apiFetch<AnalysisJob>('/api/v1/analyses', {
    method: 'POST',
    body: JSON.stringify(input)
  })
}

export function getAnalysis(id: string) {
  return apiFetch<AnalysisDetail>(`/api/v1/analyses/${encodeURIComponent(id)}`)
}
