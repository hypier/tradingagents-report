import { describe, expect, it } from 'vitest';

import {
  buildReportFlowStages,
  orderReportKeys,
} from '@/frontend/lib/report-flow-order';

describe('orderReportKeys', () => {
  it('reorders Core report keys into the derivation reading path', () => {
    const apiOrder = [
      'market_report',
      'sentiment_report',
      'news_report',
      'fundamentals_report',
      'research_team_decision',
      'trader_investment_plan',
      'final_trade_decision',
      'bull_researcher',
      'bear_researcher',
      'risk_management_decision',
      'risky_analyst',
      'safe_analyst',
      'neutral_analyst',
    ];

    expect(orderReportKeys(apiOrder)).toEqual([
      'market_report',
      'sentiment_report',
      'news_report',
      'fundamentals_report',
      'bull_researcher',
      'bear_researcher',
      'research_team_decision',
      'trader_investment_plan',
      'risky_analyst',
      'safe_analyst',
      'neutral_analyst',
      'risk_management_decision',
      'final_trade_decision',
    ]);
  });

  it('keeps unknown keys after the known path', () => {
    expect(
      orderReportKeys(['final_trade_decision', 'custom_note', 'market_report']),
    ).toEqual(['market_report', 'final_trade_decision', 'custom_note']);
  });
});

describe('buildReportFlowStages', () => {
  it('groups available keys into derivation stages', () => {
    const stages = buildReportFlowStages([
      'final_trade_decision',
      'market_report',
      'bull_researcher',
      'bear_researcher',
      'research_team_decision',
    ]);

    expect(stages.map((stage) => stage.id)).toEqual([
      'evidence',
      'debate',
      'research',
      'final',
    ]);
    expect(stages[0]?.keys).toEqual(['market_report']);
    expect(stages[1]?.parallel).toBe(true);
  });
});
