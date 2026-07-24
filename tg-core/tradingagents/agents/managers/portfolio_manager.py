"""Portfolio Manager: synthesises the risk-analyst debate into the final decision.

Uses LangChain's ``with_structured_output`` so the LLM produces a typed
``PortfolioDecision`` directly, in a single call.  The result is rendered
back to markdown for storage in ``final_trade_decision`` so memory log,
CLI display, and saved reports continue to consume the same shape they do
today.  When a provider does not expose structured output, the agent falls
back gracefully to free-text generation.
"""

from __future__ import annotations

from tradingagents.agents.schemas import (
    DecisionStance,
    PortfolioDecision,
    SectionSignal,
    SectionStances,
    decision_brief_from_portfolio,
    render_pm_decision,
)
from tradingagents.agents.utils.agent_utils import (
    get_instrument_context_from_state,
    get_language_instruction,
)
from tradingagents.agents.utils.structured import (
    bind_structured,
    invoke_structured_with_fallback,
)


def create_portfolio_manager(llm):
    structured_llm = bind_structured(llm, PortfolioDecision, "Portfolio Manager")

    def portfolio_manager_node(state) -> dict:
        instrument_context = get_instrument_context_from_state(state)

        history = state["risk_debate_state"]["history"]
        risk_debate_state = state["risk_debate_state"]
        research_plan = state["investment_plan"]
        trader_plan = state["trader_investment_plan"]
        source_reports = {
            "Market": state.get("market_report") or "REPORT_UNAVAILABLE",
            "Sentiment": state.get("sentiment_report") or "REPORT_UNAVAILABLE",
            "News": state.get("news_report") or "REPORT_UNAVAILABLE",
            "Fundamentals": state.get("fundamentals_report") or "REPORT_UNAVAILABLE",
        }
        source_report_context = "\n\n".join(
            f"**{name} Analyst Report:**\n{report}"
            for name, report in source_reports.items()
        )
        section_stances = _section_stances_from_state(state)
        source_signal_context = "\n".join(
            f"- {name}: {signal.stance.value} — {signal.note}"
            for name, signal in (
                ("Market", section_stances.market),
                ("Sentiment", section_stances.sentiment),
                ("News", section_stances.news),
                ("Fundamentals", section_stances.fundamentals),
            )
        )

        past_context = state.get("past_context", "")
        lessons_line = (
            f"- Lessons from prior decisions and outcomes:\n{past_context}\n"
            if past_context
            else ""
        )

        prompt = f"""As the Portfolio Manager, synthesize the risk analysts' debate and deliver the final trading decision.

{instrument_context}

---

**Rating Scale** (use exactly one):
- **Buy**: Strong conviction to enter or add to position
- **Overweight**: Favorable outlook, gradually increase exposure
- **Hold**: Maintain current position, no action needed
- **Underweight**: Reduce exposure, take partial profits
- **Sell**: Exit position or avoid entry

**Final-decision discipline:**
- Always provide a positive numeric price_target in the instrument's quote currency for every rating, including Hold, Underweight, and Sell. Make it consistent with the rating and time horizon; for Underweight/Sell, use the expected downside or exit-value level rather than omitting it.
- Prefer **Underweight**/reduced sizing when CapEx is outrunning operating cash flow, FCF is negative or sharply compressed, and AI/cloud cash-return proof is still missing — even if revenue and operating profit are strong.
- Do not upgrade to Overweight/Buy mainly on sell-side targets, peer PE discounts, or longer-horizon technical gauges while daily trend remains broken and cash returns are unverified.
- Intact franchise quality and net cash can justify keeping a core position (avoid automatic Sell), but that is not the same as adding risk. If adding, require confirmation levels and keep total size capped until FCF/CapEx evidence improves.
- Ground the executive summary in the risk debate's best-supported plan; resolve aggressive vs conservative conflicts toward capital protection when cash-flow and daily-trend evidence align negatively.

**Context:**
- Research Manager's investment plan: **{research_plan}**
- Trader's transaction proposal: **{trader_plan}**
{lessons_line}
**Source Analyst Reports:**
{source_report_context}

**Analyst-owned directional signals (use as evidence; do not rewrite them):**
{source_signal_context}

**Risk Analysts Debate History:**
{history}

---

Be decisive and ground every conclusion in specific evidence from the analysts.{get_language_instruction()}"""

        invocation = invoke_structured_with_fallback(
            structured_llm,
            llm,
            prompt,
            render_pm_decision,
            "Portfolio Manager",
        )
        final_trade_decision = invocation.text
        decision_brief = (
            decision_brief_from_portfolio(
                invocation.value,
                section_stances,
            ).model_dump(mode="json")
            if invocation.value is not None
            else None
        )

        new_risk_debate_state = {
            "judge_decision": final_trade_decision,
            "history": risk_debate_state["history"],
            "aggressive_history": risk_debate_state["aggressive_history"],
            "conservative_history": risk_debate_state["conservative_history"],
            "neutral_history": risk_debate_state["neutral_history"],
            "latest_speaker": "Judge",
            "current_aggressive_response": risk_debate_state["current_aggressive_response"],
            "current_conservative_response": risk_debate_state["current_conservative_response"],
            "current_neutral_response": risk_debate_state["current_neutral_response"],
            "count": risk_debate_state["count"],
        }

        return {
            "risk_debate_state": new_risk_debate_state,
            "final_trade_decision": final_trade_decision,
            "decision_brief": decision_brief,
        }

    return portfolio_manager_node


def _section_stances_from_state(state: dict) -> SectionStances:
    def signal(key: str, label: str) -> SectionSignal:
        try:
            return SectionSignal.model_validate(state.get(key))
        except Exception:  # noqa: BLE001 - optional state must degrade safely
            return SectionSignal(
                stance=DecisionStance.UNAVAILABLE,
                note=f"{label} did not produce a structured signal.",
            )

    return SectionStances(
        market=signal("market_signal", "Market Analyst"),
        sentiment=signal("sentiment_signal", "Sentiment Analyst"),
        news=signal("news_signal", "News Analyst"),
        fundamentals=signal("fundamentals_signal", "Fundamentals Analyst"),
    )
