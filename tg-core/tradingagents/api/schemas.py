from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


AnalystKey = Literal["market", "social", "news", "fundamentals"]
AssetType = Literal["stock", "crypto"]
JobStatus = Literal["queued", "running", "succeeded", "failed"]


class AnalysisRequest(BaseModel):
    ticker: str = Field(min_length=1, max_length=32, examples=["NVDA", "BTC-USD"])
    trade_date: date
    asset_type: AssetType | None = None
    analysts: list[AnalystKey] = Field(
        default_factory=lambda: ["market", "social", "news", "fundamentals"]
    )
    config_overrides: dict[str, Any] = Field(default_factory=dict)
    output_language: str | None = Field(default=None, min_length=1, max_length=64)

    @field_validator("ticker")
    @classmethod
    def normalize_ticker(cls, value: str) -> str:
        ticker = value.strip().upper()
        if not ticker:
            raise ValueError("ticker is required")
        return ticker

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