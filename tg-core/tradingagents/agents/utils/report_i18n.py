"""Localize structured-report headings and enum display values.

Analyst/researcher prose already follows ``output_language`` via
``get_language_instruction``. Structured agents, however, fill typed schemas
and then go through Python ``render_*`` helpers that historically hard-coded
English labels (``Recommendation``, ``Overall Sentiment``,
``TRANSACTION PROPOSAL``, …). Those helpers read the active config here
so a Chinese run no longer mixes English template chrome into an otherwise
localized report.

Canonical English enum *wire* values stay on the Pydantic models; only the
rendered markdown is localized. Downstream parsers accept both English and
Chinese forms (see :mod:`tradingagents.agents.utils.rating`).
"""

from __future__ import annotations

from collections.abc import Mapping

# Languages that get a full label/value map. Anything else falls back to English
# chrome so we never invent half-translated headings.
_CHINESE_ALIASES = frozenset({
    "chinese",
    "zh",
    "zh-cn",
    "zh_cn",
    "zh-hans",
    "zh_hans",
    "中文",
    "简体中文",
    "汉语",
})

_LABELS_EN: dict[str, str] = {
    "recommendation": "Recommendation",
    "rationale": "Rationale",
    "strategic_actions": "Strategic Actions",
    "action": "Action",
    "reasoning": "Reasoning",
    "entry_price": "Entry Price",
    "stop_loss": "Stop Loss",
    "position_sizing": "Position Sizing",
    # Trader deliverable — not the portfolio-manager final decision.
    "final_transaction_proposal": "TRANSACTION PROPOSAL",
    "market_analysis_recommendation": "Market Analysis Recommendation",
    "sentiment_analysis_recommendation": "Sentiment Analysis Recommendation",
    "news_analysis_recommendation": "News Analysis Recommendation",
    "fundamentals_analysis_recommendation": "Fundamentals Analysis Recommendation",
    "rating": "Rating",
    "executive_summary": "Executive Summary",
    "investment_thesis": "Investment Thesis",
    "price_target": "Price Target",
    "time_horizon": "Time Horizon",
    "overall_sentiment": "Overall Sentiment",
    "score": "Score",
    "confidence": "Confidence",
}

_LABELS_ZH: dict[str, str] = {
    "recommendation": "建议",
    "rationale": "研究逻辑",
    "strategic_actions": "执行计划",
    "action": "操作",
    "reasoning": "理由",
    "entry_price": "入场价",
    "stop_loss": "止损",
    "position_sizing": "仓位",
    # 交易员交付物 — 不是组合经理的最终决策。
    "final_transaction_proposal": "交易执行建议",
    "market_analysis_recommendation": "市场分析建议",
    "sentiment_analysis_recommendation": "情绪分析建议",
    "news_analysis_recommendation": "新闻分析建议",
    "fundamentals_analysis_recommendation": "基本面分析建议",
    "rating": "评级",
    "executive_summary": "执行摘要",
    "investment_thesis": "投资论点",
    "price_target": "目标价",
    "time_horizon": "持有周期",
    "overall_sentiment": "整体情绪",
    "score": "得分",
    "confidence": "置信度",
}

# Analyst section → report chrome key for a scoped directional view.
_ANALYST_RECOMMENDATION_KEYS: dict[str, str] = {
    "market": "market_analysis_recommendation",
    "sentiment": "sentiment_analysis_recommendation",
    "news": "news_analysis_recommendation",
    "fundamentals": "fundamentals_analysis_recommendation",
}

# Display values for structured enums. Keys are the English canonical forms.
_VALUES_ZH: dict[str, str] = {
    "Buy": "买入",
    "Overweight": "增持",
    "Hold": "持有",
    "Underweight": "减持",
    "Sell": "卖出",
    "Bullish": "看涨",
    "Mildly Bullish": "偏多",
    "Neutral": "中性",
    "Mixed": "分化",
    "Mildly Bearish": "偏空",
    "Bearish": "看跌",
    "low": "低",
    "medium": "中",
    "high": "高",
    "Low": "低",
    "Medium": "中",
    "High": "高",
}


def normalize_report_language(language: str | None) -> str:
    """Return ``chinese`` or ``english`` for report chrome localization."""
    if not language or not str(language).strip():
        return "english"
    key = str(language).strip().lower().replace(" ", "")
    # Accept "Chinese", "zh-CN", "中文", etc.
    compact = key.replace("-", "_")
    if key in _CHINESE_ALIASES or compact in _CHINESE_ALIASES:
        return "chinese"
    if key.startswith("zh") or "chinese" in key or "中文" in str(language):
        return "chinese"
    return "english"


def get_report_language() -> str:
    """Resolve the active ``output_language`` into a localization bucket."""
    from tradingagents.dataflows.config import get_config

    return normalize_report_language(get_config().get("output_language", "English"))


def report_labels(language: str | None = None) -> Mapping[str, str]:
    """Return the label map for ``language`` (or the active config language)."""
    lang = normalize_report_language(language) if language is not None else get_report_language()
    return _LABELS_ZH if lang == "chinese" else _LABELS_EN


def localize_report_value(value: str, language: str | None = None) -> str:
    """Translate a known structured enum/display value when the report is Chinese."""
    lang = normalize_report_language(language) if language is not None else get_report_language()
    if lang != "chinese":
        return value
    return _VALUES_ZH.get(value, value)


def get_transaction_proposal_phrase(language: str | None = None) -> str:
    """Trader trailing-proposal phrase (also referenced in analyst prompts)."""
    return report_labels(language)["final_transaction_proposal"]


def get_analyst_recommendation_phrase(
    section: str,
    language: str | None = None,
) -> str:
    """Return the section-scoped recommendation label for an analyst report."""
    key = _ANALYST_RECOMMENDATION_KEYS.get(section)
    if key is None:
        raise ValueError(
            f"Unknown analyst section {section!r}; expected one of "
            f"{sorted(_ANALYST_RECOMMENDATION_KEYS)}"
        )
    return report_labels(language)[key]


# Extra label spellings accepted by API decision-field parsers. Kept here so
# ``api/formatters.py`` can stay ASCII-only while still recognizing Chinese
# chrome produced by the localized render helpers.
PRICE_TARGET_LABELS: tuple[str, ...] = (
    "Price Target",
    "Target Price",
    "target_price",
    _LABELS_ZH["price_target"],
)
CONFIDENCE_LABELS: tuple[str, ...] = (
    "Confidence",
    "confidence",
    _LABELS_ZH["confidence"],
)
REASONING_LABELS: tuple[str, ...] = (
    "Investment Thesis",
    "Reasoning",
    "Executive Summary",
    _LABELS_ZH["investment_thesis"],
    _LABELS_ZH["reasoning"],
    _LABELS_ZH["executive_summary"],
    _LABELS_ZH["rationale"],
)
