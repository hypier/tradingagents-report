"""Structured-report chrome follows output_language (#Chinese headings)."""

from __future__ import annotations

import pytest

from tradingagents.agents.schemas import (
    PortfolioDecision,
    PortfolioRating,
    ResearchPlan,
    SentimentBand,
    SentimentReport,
    TraderAction,
    TraderProposal,
    render_pm_decision,
    render_research_plan,
    render_sentiment_report,
    render_trader_proposal,
)
from tradingagents.agents.utils.agent_utils import (
    get_language_instruction,
    get_section_recommendation_instruction,
    get_transaction_proposal_instruction,
)
from tradingagents.agents.utils.rating import parse_rating
from tradingagents.agents.utils.report_i18n import (
    format_debate_argument,
    get_analyst_recommendation_phrase,
    get_debate_role_label,
    normalize_report_language,
)
from tradingagents.dataflows.config import set_config


@pytest.fixture(autouse=True)
def _reset_english_language():
    set_config({"output_language": "English"})
    yield
    set_config({"output_language": "English"})


@pytest.mark.unit
class TestNormalizeReportLanguage:
    def test_chinese_aliases(self):
        for value in ("Chinese", "chinese", "中文", "zh-CN", "zh_hans"):
            assert normalize_report_language(value) == "chinese"

    def test_english_default(self):
        assert normalize_report_language(None) == "english"
        assert normalize_report_language("English") == "english"
        assert normalize_report_language("Japanese") == "english"


@pytest.mark.unit
class TestChineseRenderHelpers:
    def test_research_plan_labels_and_rating(self):
        set_config({"output_language": "Chinese"})
        md = render_research_plan(
            ResearchPlan(
                recommendation=PortfolioRating.OVERWEIGHT,
                rationale="多头论据更强。",
                strategic_actions="分批建仓。",
            )
        )
        assert "**建议**: 增持" in md
        assert "**研究逻辑**: 多头论据更强。" in md
        assert "**执行计划**: 分批建仓。" in md
        assert "Recommendation" not in md

    def test_trader_proposal_labels(self):
        set_config({"output_language": "Chinese"})
        md = render_trader_proposal(
            TraderProposal(action=TraderAction.HOLD, reasoning="观望为主。")
        )
        assert "**操作**: 持有" in md
        assert "**理由**: 观望为主。" in md
        assert "交易执行建议: **持有**" in md
        assert "最终交易建议" not in md
        assert "FINAL TRANSACTION PROPOSAL" not in md

    def test_pm_decision_labels(self):
        set_config({"output_language": "Chinese"})
        md = render_pm_decision(
            PortfolioDecision(
                rating=PortfolioRating.BUY,
                executive_summary="逢低布局。",
                investment_thesis="基本面支撑。",
                price_target=100.0,
            )
        )
        assert "**评级**: 买入" in md
        assert "**执行摘要**: 逢低布局。" in md
        assert "**投资论点**: 基本面支撑。" in md
        assert "**目标价**: 100.0" in md

    def test_sentiment_header(self):
        set_config({"output_language": "Chinese"})
        md = render_sentiment_report(
            SentimentReport(
                overall_band=SentimentBand.BULLISH,
                overall_score=7.0,
                confidence="low",
                narrative="1. 分来源情绪拆解",
            )
        )
        assert "**整体情绪:** **看涨** (得分: 7.0/10)" in md
        assert "**置信度:** 低" in md
        assert "Overall Sentiment" not in md
        assert "1. 分来源情绪拆解" in md

    def test_english_render_unchanged(self):
        md = render_research_plan(
            ResearchPlan(
                recommendation=PortfolioRating.HOLD,
                rationale="Balanced.",
                strategic_actions="Wait.",
            )
        )
        assert "**Recommendation**: Hold" in md


@pytest.mark.unit
class TestParseLocalizedRatings:
    def test_chinese_rating_label(self):
        assert parse_rating("**评级**: 增持\n执行摘要：分批。") == "Overweight"

    def test_chinese_recommendation_label(self):
        assert parse_rating("**建议**: 买入\n研究逻辑：增长确定。") == "Buy"

    def test_english_still_works(self):
        assert parse_rating("**Rating**: Sell\nExit.") == "Sell"


@pytest.mark.unit
class TestLanguagePromptHelpers:
    def test_chinese_language_instruction_mentions_headings(self):
        set_config({"output_language": "Chinese"})
        out = get_language_instruction()
        assert "Chinese" in out
        assert "headings" in out
        assert "TRANSACTION PROPOSAL" in out

    def test_chinese_transaction_phrase_forbids_trader_chrome(self):
        set_config({"output_language": "Chinese"})
        out = get_transaction_proposal_instruction()
        assert "交易执行建议" in out
        assert "Do not conclude or prefix" in out
        assert "买入/持有/卖出" in out
        assert "最终交易建议" not in out  # phrase itself renamed
        assert "FINAL TRANSACTION PROPOSAL" not in out

    def test_english_transaction_phrase_forbids_trader_chrome(self):
        out = get_transaction_proposal_instruction()
        assert "TRANSACTION PROPOSAL" in out
        assert "Do not conclude or prefix" in out
        assert "BUY/HOLD/SELL" in out

    def test_market_section_recommendation_chinese(self):
        set_config({"output_language": "Chinese"})
        assert get_analyst_recommendation_phrase("market") == "市场分析建议"
        out = get_section_recommendation_instruction("market")
        assert "市场分析建议" in out
        assert "最终交易建议" in out  # explicit ban of the old wording
        assert "组合最终决策" in out

    def test_market_section_recommendation_english(self):
        out = get_section_recommendation_instruction("market")
        assert "Market Analysis Recommendation" in out
        assert "final portfolio decision" in out


@pytest.mark.unit
class TestDebateRoleLabels:
    def test_chinese_speaker_prefixes(self):
        set_config({"output_language": "Chinese"})
        assert get_debate_role_label("bull_analyst") == "多头分析师"
        assert get_debate_role_label("bear_analyst") == "空头分析师"
        assert get_debate_role_label("aggressive_analyst") == "激进分析师"
        assert get_debate_role_label("conservative_analyst") == "保守分析师"
        assert get_debate_role_label("neutral_analyst") == "中性分析师"
        assert format_debate_argument("bull_analyst", "增长确定。") == (
            "多头分析师: 增长确定。"
        )

    def test_english_speaker_prefixes(self):
        assert get_debate_role_label("bull_analyst") == "Bull Analyst"
        assert format_debate_argument("bear_analyst", "Risks remain.") == (
            "Bear Analyst: Risks remain."
        )
