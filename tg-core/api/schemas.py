from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator

from tradingagents.dataflows.listings import listing_from_parts, resolve_listing

AnalystKey = Literal["market", "social", "news", "fundamentals"]
AssetType = Literal["stock", "crypto"]
JobStatus = Literal["queued", "running", "succeeded", "failed"]


class InstrumentInput(BaseModel):
    exchange: str = Field(min_length=2, max_length=16, examples=["HKEX", "NASDAQ"])
    symbol: str = Field(min_length=1, max_length=32, examples=["5", "AAPL"])
    display_ticker: str | None = Field(default=None, min_length=1, max_length=32)


class InstrumentDisplayInput(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=256)
    logo_url: str | None = Field(default=None, min_length=1, max_length=1024)
    country: str | None = Field(default=None, min_length=2, max_length=8)

    @field_validator("display_name", "logo_url", "country")
    @classmethod
    def strip_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class AnalysisRequest(BaseModel):
    ticker: str | None = Field(default=None, min_length=1, max_length=32, examples=["NVDA", "0005.HK", "HKEX:5"])
    instrument: InstrumentInput | None = None
    display: InstrumentDisplayInput | None = None
    request_id: UUID | None = None
    trade_date: date
    asset_type: AssetType | None = None
    analysts: list[AnalystKey] = Field(
        default_factory=lambda: ["market", "social", "news", "fundamentals"]
    )
    config_overrides: dict[str, Any] = Field(default_factory=dict)
    output_language: str | None = Field(default=None, min_length=1, max_length=64)
    clerk_user_id: str | None = Field(default=None, min_length=1, max_length=128)
    credit_pricing: dict[str, Any] | None = None

    @field_validator("ticker")
    @classmethod
    def normalize_ticker(cls, value: str | None) -> str | None:
        if value is None:
            return None
        ticker = value.strip().upper()
        if not ticker:
            raise ValueError("ticker is required")
        return ticker

    @model_validator(mode="after")
    def require_consistent_listing_input(self) -> AnalysisRequest:
        ticker_listing = resolve_listing(self.ticker) if self.ticker is not None else None
        instrument_listing = None
        if self.instrument is not None:
            instrument_listing = listing_from_parts(
                self.instrument.exchange,
                self.instrument.symbol,
                self.instrument.display_ticker,
            )

        if ticker_listing is None and instrument_listing is None:
            raise ValueError("ticker or instrument is required")
        if ticker_listing and instrument_listing and ticker_listing != instrument_listing:
            raise ValueError("ticker does not match instrument")
        return self

    @field_validator("output_language")
    @classmethod
    def normalize_output_language(cls, value: str | None) -> str | None:
        if value is None:
            return None
        language = value.strip()
        if not language:
            raise ValueError("output_language cannot be blank")
        return language

    @field_validator("analysts")
    @classmethod
    def require_analysts(cls, value: list[AnalystKey]) -> list[AnalystKey]:
        if not value:
            raise ValueError("at least one analyst must be selected")
        return list(dict.fromkeys(value))


class AnalysisJob(BaseModel):
    id: UUID
    request_id: UUID | None = None
    ticker: str
    exchange: str | None = None
    trade_date: date
    asset_type: AssetType
    analysts: list[AnalystKey]
    status: JobStatus
    progress_percent: int = 0
    current_step: str | None = None
    events: list[dict[str, Any]] = Field(default_factory=list)
    tokens_used: int = 0
    token_usage: dict[str, Any] = Field(default_factory=dict)
    cost_usd: float = 0
    cost_breakdown: dict[str, Any] = Field(default_factory=dict)
    display: dict[str, Any] = Field(default_factory=dict)
    output_language: str | None = None
    decision: str | None = None
    error: str | None = None
    report_path: str | None = None
    created_at: datetime
    updated_at: datetime
    started_at: datetime | None = None
    finished_at: datetime | None = None


class AnalysisResult(AnalysisJob):
    request: dict[str, Any]
    config: dict[str, Any]
    final_state: dict[str, Any] | None = None


class AnalysisProgress(BaseModel):
    percent: int = 0
    current_step: str | None = None


class AnalysisPriceRange(BaseModel):
    low: float
    high: float


class AnalysisSectionSignal(BaseModel):
    stance: Literal["bullish", "neutral", "bearish", "unavailable"]
    note: str


class AnalysisSectionStances(BaseModel):
    market: AnalysisSectionSignal
    sentiment: AnalysisSectionSignal
    news: AnalysisSectionSignal
    fundamentals: AnalysisSectionSignal


class AnalysisDecision(BaseModel):
    # Compatibility alias for clients that historically treated the 5-tier
    # portfolio rating as an "action".
    action: str
    rating: str
    headline: str | None = None
    conviction: Literal["low", "medium", "high"] | None = None
    as_of_price: float | None = None
    as_of_date: str | None = None
    currency: str | None = None
    time_horizon: str | None = None
    position_guidance: str | None = None
    entry_zone: AnalysisPriceRange | None = None
    add_levels: list[AnalysisPriceRange] = Field(default_factory=list)
    stop_or_reduce: float | None = None
    bull_case: str | None = None
    bear_case: str | None = None
    key_risk: str | None = None
    what_to_watch: list[str] = Field(default_factory=list)
    invalidation: str | None = None
    section_stances: AnalysisSectionStances | None = None
    conflict_note: str | None = None
    confidence: float = 0
    risk_score: float = 0
    target_price: float | None = None
    reasoning: str = ""


class AnalysisUsage(BaseModel):
    tokens: int = 0
    token_usage: dict[str, Any] = Field(default_factory=dict)


class AnalysisCost(BaseModel):
    usd: float = 0
    breakdown: dict[str, Any] = Field(default_factory=dict)


class AnalysisDetail(BaseModel):
    id: UUID
    request_id: UUID | None = None
    ticker: str
    exchange: str | None = None
    trade_date: date | None = None
    asset_type: AssetType
    analysts: list[AnalystKey]
    status: JobStatus
    progress: AnalysisProgress
    decision: AnalysisDecision
    reports: dict[str, Any] = Field(default_factory=dict)
    usage: AnalysisUsage
    cost: AnalysisCost
    display: dict[str, Any] = Field(default_factory=dict)
    output_language: str | None = None
    error: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None


class AnalysisEventLog(BaseModel):
    time: datetime | None = None
    progress_percent: int = 0
    message: str
    kind: str = "stage"


class HealthResponse(BaseModel):
    status: Literal["ok", "error"]
    database: Literal["ok", "error"]
    detail: str | None = None


class ListingResolveResponse(BaseModel):
    ticker: str
    exchange: str | None = None
    symbol: str
    display_ticker: str
    provider_symbol: str | None = None
