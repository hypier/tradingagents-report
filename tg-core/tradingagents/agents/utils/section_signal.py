"""Analyst-owned directional signals for the compact decision brief."""

from __future__ import annotations

import logging
from typing import Any

from tradingagents.agents.schemas import DecisionStance, SectionSignal

logger = logging.getLogger(__name__)


def unavailable_section_signal(agent_name: str) -> dict[str, str]:
    """Return an explicit fallback without guessing direction from prose."""
    return {
        "stance": DecisionStance.UNAVAILABLE.value,
        "note": f"{agent_name} did not produce a structured signal.",
    }


def extract_section_signal(
    structured_llm: Any | None,
    report: str,
    agent_name: str,
) -> dict[str, str]:
    """Compress one completed analyst report into its own typed signal."""
    if not report.strip() or structured_llm is None:
        return unavailable_section_signal(agent_name)

    prompt = f"""You are the {agent_name}. Convert your completed report below into one machine-readable section signal.

Choose exactly one stance: bullish, neutral, bearish, or unavailable. Use unavailable only when the report contains no usable directional evidence. The note must be one concise evidence-based sentence written in the same language as the report. Do not infer facts that are absent from the report.

Completed report:
{report}"""
    try:
        result = structured_llm.invoke(prompt)
        signal = (
            result
            if isinstance(result, SectionSignal)
            else SectionSignal.model_validate(result)
        )
        return signal.model_dump(mode="json")
    except Exception as exc:  # noqa: BLE001 - signal failure must not fail analysis
        logger.warning("%s signal extraction failed: %s", agent_name, exc)
        return unavailable_section_signal(agent_name)
