"""Pydantic schemas used by agents that produce structured output.

The framework's primary artifact is still prose: each agent's natural-language
reasoning is what users read in the saved markdown reports and what the
downstream agents read as context.  Structured output is layered onto the
three decision-making agents (Research Manager, Trader, Portfolio Manager)
so that:

- Their outputs follow consistent section headers across runs and providers
- Each provider's native structured-output mode is used (json_schema for
  OpenAI/xAI, response_schema for Gemini, tool-use for Anthropic)
- Schema field descriptions become the model's output instructions, freeing
  the prompt body to focus on context and the rating-scale guidance
- A render helper turns the parsed Pydantic instance back into the same
  markdown shape the rest of the system already consumes, so display,
  memory log, and saved reports keep working unchanged
"""

from __future__ import annotations

from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from tradingagents.agents.utils.report_i18n import (
    localize_report_value,
    report_labels,
)

# LLMs sometimes write a placeholder string ("None", "N/A", ...) into an optional
# numeric field instead of omitting it. Coerce those to None so the structured
# call validates instead of erroring (#1058). Pydantic still parses real numeric
# strings ("189.5") to float.
_NULLISH_FLOAT = {"", "none", "n/a", "na", "null", "nil", "-", "tbd", "unknown"}


def _coerce_optional_float(value):
    if isinstance(value, str) and value.strip().lower() in _NULLISH_FLOAT:
        return None
    return value


# ---------------------------------------------------------------------------
# Shared rating types
# ---------------------------------------------------------------------------


class PortfolioRating(str, Enum):
    """5-tier rating used by the Research Manager and Portfolio Manager."""

    BUY = "Buy"
    OVERWEIGHT = "Overweight"
    HOLD = "Hold"
    UNDERWEIGHT = "Underweight"
    SELL = "Sell"


class TraderAction(str, Enum):
    """3-tier transaction direction used by the Trader.

    The Trader's job is to translate the Research Manager's investment plan
    into a concrete transaction proposal: should the desk execute a Buy, a
    Sell, or sit on Hold this round.  Position sizing and the nuanced
    Overweight / Underweight calls happen later at the Portfolio Manager.
    """

    BUY = "Buy"
    HOLD = "Hold"
    SELL = "Sell"


class DecisionConviction(str, Enum):
    """Qualitative confidence for the final decision brief."""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class DecisionStance(str, Enum):
    """Directional stance shown for each analyst section."""

    BULLISH = "bullish"
    NEUTRAL = "neutral"
    BEARISH = "bearish"
    UNAVAILABLE = "unavailable"


class PriceRange(BaseModel):
    """Inclusive price zone in the instrument's quote currency."""

    low: float = Field(gt=0, description="Lower bound of the price zone.")
    high: float = Field(gt=0, description="Upper bound of the price zone.")

    @model_validator(mode="after")
    def _validate_bounds(self):
        if self.low > self.high:
            raise ValueError("low must be less than or equal to high")
        return self


class SectionSignal(BaseModel):
    """Compact directional result for one analyst report."""

    stance: DecisionStance = Field(
        description=(
            "Bullish, neutral, bearish, or unavailable when that analyst report "
            "was not selected or produced no usable evidence."
        )
    )
    note: str = Field(description="One concise sentence supporting the stance.")


class SectionStances(BaseModel):
    """The four evidence lanes displayed in the final result card."""

    market: SectionSignal
    sentiment: SectionSignal
    news: SectionSignal
    fundamentals: SectionSignal


class DecisionBriefDraft(BaseModel):
    """LLM-authored portion of the final result card."""

    headline: str = Field(description="One concise sentence stating the final action plan.")
    conviction: DecisionConviction = Field(
        description="Qualitative conviction: low, medium, or high."
    )
    position_guidance: str | None = Field(
        default=None,
        description="Optional target exposure or position-sizing guidance.",
    )
    entry_zone: PriceRange | None = Field(
        default=None,
        description="Optional initial entry or probe zone. Use a range, not a prose value.",
    )
    add_levels: list[PriceRange] = Field(
        default_factory=list,
        description="Zero or more confirmation zones for adding exposure.",
    )
    stop_or_reduce: float | None = Field(
        default=None,
        gt=0,
        description="Optional single price that triggers a stop or exposure reduction.",
    )
    bull_case: str = Field(description="The strongest bullish argument in one sentence.")
    bear_case: str = Field(description="The strongest bearish argument in one sentence.")
    key_risk: str = Field(description="The most important current risk in one sentence.")
    what_to_watch: list[str] = Field(
        min_length=1,
        max_length=3,
        description="One to three observable confirmation points.",
    )
    invalidation: str = Field(description="One sentence stating when the thesis is invalid.")
    section_stances: SectionStances
    conflict_note: str | None = Field(
        default=None,
        description="Optional sentence explaining how conflicting section signals were resolved.",
    )

    @field_validator("stop_or_reduce", mode="before")
    @classmethod
    def _nullish_stop_to_none(cls, v):
        return _coerce_optional_float(v)


class DecisionBrief(DecisionBriefDraft):
    """Persisted and API-facing final result card."""

    rating: PortfolioRating
    as_of_price: float | None = Field(default=None, gt=0)
    as_of_date: str | None = None
    currency: str | None = None
    time_horizon: str | None = None
    target_price: float | None = Field(default=None, gt=0)


# ---------------------------------------------------------------------------
# Research Manager
# ---------------------------------------------------------------------------


class ResearchPlan(BaseModel):
    """Structured investment plan produced by the Research Manager.

    Hand-off to the Trader: the recommendation pins the directional view,
    the rationale captures which side of the bull/bear debate carried the
    argument, and the strategic actions translate that into concrete
    instructions the trader can execute against.
    """

    recommendation: PortfolioRating = Field(
        description=(
            "The investment recommendation. Exactly one of Buy / Overweight / "
            "Hold / Underweight / Sell. Reserve Hold for situations where the "
            "evidence on both sides is genuinely balanced; otherwise commit to "
            "the side with the stronger arguments."
        ),
    )
    rationale: str = Field(
        description=(
            "Conversational summary of the key points from both sides of the "
            "debate, ending with which arguments led to the recommendation. "
            "Speak naturally, as if to a teammate."
        ),
    )
    strategic_actions: str = Field(
        description=(
            "Concrete steps for the trader to implement the recommendation, "
            "including position sizing guidance consistent with the rating."
        ),
    )


def render_research_plan(plan: ResearchPlan) -> str:
    """Render a ResearchPlan to markdown for storage and the trader's prompt context."""
    labels = report_labels()
    return "\n".join([
        f"**{labels['recommendation']}**: {localize_report_value(plan.recommendation.value)}",
        "",
        f"**{labels['rationale']}**: {plan.rationale}",
        "",
        f"**{labels['strategic_actions']}**: {plan.strategic_actions}",
    ])


# ---------------------------------------------------------------------------
# Trader
# ---------------------------------------------------------------------------


class TraderProposal(BaseModel):
    """Structured transaction proposal produced by the Trader.

    The trader reads the Research Manager's investment plan and the analyst
    reports, then turns them into a concrete transaction: what action to
    take, the reasoning that justifies it, and the practical levels for
    entry, stop-loss, and sizing.
    """

    action: TraderAction = Field(
        description="The transaction direction. Exactly one of Buy / Hold / Sell.",
    )
    reasoning: str = Field(
        description=(
            "The case for this action, anchored in the analysts' reports and "
            "the research plan. Two to four sentences."
        ),
    )
    entry_price: float | None = Field(
        default=None,
        description="Optional entry price target in the instrument's quote currency.",
    )
    stop_loss: float | None = Field(
        default=None,
        description="Optional stop-loss price in the instrument's quote currency.",
    )
    position_sizing: str | None = Field(
        default=None,
        description="Optional sizing guidance, e.g. '5% of portfolio'.",
    )

    @field_validator("entry_price", "stop_loss", mode="before")
    @classmethod
    def _nullish_float_to_none(cls, v):
        return _coerce_optional_float(v)


def render_trader_proposal(proposal: TraderProposal) -> str:
    """Render a TraderProposal to markdown.

    The trailing transaction-proposal line is preserved for backward
    compatibility with older prompts and greps. Its wording follows
    ``output_language`` (English ``TRANSACTION PROPOSAL`` or Chinese
    ``交易执行建议``). It is the Trader's execution view — not the
    Portfolio Manager's final rating.
    """
    labels = report_labels()
    action = localize_report_value(proposal.action.value)
    parts = [
        f"**{labels['action']}**: {action}",
        "",
        f"**{labels['reasoning']}**: {proposal.reasoning}",
    ]
    if proposal.entry_price is not None:
        parts.extend(["", f"**{labels['entry_price']}**: {proposal.entry_price}"])
    if proposal.stop_loss is not None:
        parts.extend(["", f"**{labels['stop_loss']}**: {proposal.stop_loss}"])
    if proposal.position_sizing:
        parts.extend(["", f"**{labels['position_sizing']}**: {proposal.position_sizing}"])
    # English keeps the historical ALL-CAPS action token; Chinese uses the
    # localized display value so the saved report stays fully localized.
    proposal_action = (
        proposal.action.value.upper()
        if action == proposal.action.value
        else action
    )
    parts.extend([
        "",
        f"{labels['final_transaction_proposal']}: **{proposal_action}**",
    ])
    return "\n".join(parts)


# ---------------------------------------------------------------------------
# Portfolio Manager
# ---------------------------------------------------------------------------


class PortfolioDecision(BaseModel):
    """Structured output produced by the Portfolio Manager.

    The model fills every field as part of its primary LLM call; no separate
    extraction pass is required. Field descriptions double as the model's
    output instructions, so the prompt body only needs to convey context and
    the rating-scale guidance.
    """

    rating: PortfolioRating = Field(
        description=(
            "The final position rating. Exactly one of Buy / Overweight / Hold / "
            "Underweight / Sell, picked based on the analysts' debate."
        ),
    )
    executive_summary: str = Field(
        description=(
            "A concise action plan covering entry strategy, position sizing, "
            "key risk levels, and time horizon. Two to four sentences."
        ),
    )
    investment_thesis: str = Field(
        description=(
            "Detailed reasoning anchored in specific evidence from the analysts' "
            "debate. If prior lessons are referenced in the prompt context, "
            "incorporate them; otherwise rely solely on the current analysis."
        ),
    )
    price_target: float | None = Field(
        default=None,
        description="Optional target price in the instrument's quote currency.",
    )
    time_horizon: str | None = Field(
        default=None,
        description="Optional recommended holding period, e.g. '3-6 months'.",
    )
    brief: DecisionBriefDraft = Field(
        description=(
            "Required compact result-card data. Derive the four section stances from "
            "the source reports; use unavailable when a report is absent."
        )
    )

    @field_validator("price_target", mode="before")
    @classmethod
    def _nullish_float_to_none(cls, v):
        return _coerce_optional_float(v)


def decision_brief_from_portfolio(decision: PortfolioDecision) -> DecisionBrief:
    """Combine the Portfolio Manager's brief with its canonical rating fields."""
    return DecisionBrief(
        rating=decision.rating,
        time_horizon=decision.time_horizon,
        target_price=decision.price_target,
        **decision.brief.model_dump(),
    )


def render_pm_decision(decision: PortfolioDecision) -> str:
    """Render a PortfolioDecision back to the markdown shape the rest of the system expects.

    Memory log, CLI display, and saved report files all read this markdown.
    Section headers follow ``output_language``; parsers accept both English
    and Chinese label/value forms.
    """
    labels = report_labels()
    parts = [
        f"**{labels['rating']}**: {localize_report_value(decision.rating.value)}",
        "",
        f"**{labels['executive_summary']}**: {decision.executive_summary}",
        "",
        f"**{labels['investment_thesis']}**: {decision.investment_thesis}",
    ]
    if decision.price_target is not None:
        parts.extend(["", f"**{labels['price_target']}**: {decision.price_target}"])
    if decision.time_horizon:
        parts.extend(["", f"**{labels['time_horizon']}**: {decision.time_horizon}"])
    return "\n".join(parts)


# ---------------------------------------------------------------------------
# Sentiment Analyst
# ---------------------------------------------------------------------------


class SentimentBand(str, Enum):
    """Discrete sentiment direction produced by the Sentiment Analyst.

    Six tiers keep the signal granular enough to be actionable while remaining
    small enough for every provider to map reliably from its JSON output.
    """

    BULLISH = "Bullish"
    MILDLY_BULLISH = "Mildly Bullish"
    NEUTRAL = "Neutral"
    MIXED = "Mixed"
    MILDLY_BEARISH = "Mildly Bearish"
    BEARISH = "Bearish"


class SentimentReport(BaseModel):
    """Structured sentiment report produced by the Sentiment Analyst.

    Replaces the previous free-form prose output so downstream consumers
    (dashboards, audit logs, PDF renderers, other agents) can read
    ``overall_band`` and ``overall_score`` without maintaining fragile regex
    fallbacks that drift with every model release. ``narrative`` preserves the
    rich source-by-source analysis; ``render_sentiment_report`` prepends a
    deterministic header so the saved report stays human-readable.
    """

    overall_band: SentimentBand = Field(
        description=(
            "Overall sentiment direction. Exactly one of: "
            "Bullish / Mildly Bullish / Neutral / Mixed / Mildly Bearish / Bearish. "
            "Use Mixed when sources point in clearly different directions. "
            "Use Neutral only when all sources are genuinely silent or non-committal."
        ),
    )
    overall_score: float = Field(
        ge=0.0,
        le=10.0,
        description=(
            "Numeric sentiment intensity on a 0–10 scale. "
            "0 = maximally bearish, 5 = neutral, 10 = maximally bullish. "
            "Guideline for consistency with overall_band: "
            "Bullish ~6.5–10, Mildly Bullish ~5.5–6.4, Neutral/Mixed ~4.5–5.5, "
            "Mildly Bearish ~3.5–4.4, Bearish ~0–3.4. "
            "Only the 0–10 bounds are enforced."
        ),
    )
    confidence: Literal["low", "medium", "high"] = Field(
        description=(
            "Confidence in the assessment based on data quality and sample size. "
            "Use 'low' when one or more sources returned a placeholder or fewer "
            "than 5 data points; 'medium' when data is present but sparse; "
            "'high' when all three sources returned substantive data."
        ),
    )
    narrative: str = Field(
        description=(
            "Full sentiment report covering, in order: "
            "(1) source-by-source breakdown with specific evidence (cite message "
            "counts, ratios, notable posts); "
            "(2) cross-source divergences and alignments; "
            "(3) dominant narrative themes; "
            "(4) catalysts and risks surfaced by the data; "
            "(5) a markdown table summarising key sentiment signals, their "
            "direction, source, and supporting evidence. "
            "Keep it informative and substantive: develop each section thoroughly "
            "with concrete evidence so every point adds new signal for the trader."
        ),
    )


def render_sentiment_report(report: SentimentReport) -> str:
    """Render a SentimentReport to the markdown shape the rest of the system expects.

    The structured header (band + score + confidence) is prepended to the
    narrative so the saved report is both human-readable and machine-parseable
    without regex. Labels and band/confidence values follow ``output_language``.
    """
    labels = report_labels()
    band = localize_report_value(report.overall_band.value)
    confidence = localize_report_value(report.confidence.capitalize())
    return "\n".join([
        f"**{labels['overall_sentiment']}:** **{band}** "
        f"({labels['score']}: {report.overall_score:.1f}/10)",
        f"**{labels['confidence']}:** {confidence}",
        "",
        report.narrative,
    ])
