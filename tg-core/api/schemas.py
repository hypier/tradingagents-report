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


class AnalysisRequest(BaseModel):
    ticker: str | None = Field(default=None, min_length=1, max_length=32, examples=["NVDA", "0005.HK", "HKEX:5"])
    instrument: InstrumentInput | None = None
    request_id: UUID | None = None
    trade_date: date
    asset_type: AssetType | None = None
    analysts: list[AnalystKey] = Field(
        default_factory=lambda: ["market", "social", "news", "fundamentals"]
    )
    config_overrides: dict[str, Any] = Field(default_factory=dict)
    output_language: str | None = Field(default=None, min_length=1, max_length=64)

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


class HealthResponse(BaseModel):
    status: Literal["ok", "error"]
    database: Literal["ok", "error"]
    detail: str | None = None
