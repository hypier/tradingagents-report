// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { ReportMindMap } from '@/frontend/components/report/report-mind-map';

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

describe('ReportMindMap', () => {
  it('renders an indented outline and selects a chapter on click', () => {
    const onSelect = vi.fn();

    render(
      <ReportMindMap
        entries={[
          'market_report',
          'bull_researcher',
          'bear_researcher',
          'research_team_decision',
          'final_trade_decision',
        ]}
        activeTab="market_report"
        onSelect={onSelect}
        renderIcon={() => null}
        renderLabel={(key) => key}
      />,
    );

    expect(screen.getByText('Report outline')).toBeInTheDocument();
    expect(screen.getByText('Evidence')).toBeInTheDocument();
    expect(screen.getByText('Bull / Bear debate')).toBeInTheDocument();

    const finalTab = screen.getByRole('tab', { name: /final_trade_decision/i });
    fireEvent.click(finalTab);
    expect(onSelect).toHaveBeenCalledWith('final_trade_decision');
  });

  it('marks the active chapter and completed chapters', () => {
    render(
      <ReportMindMap
        entries={[
          'market_report',
          'news_report',
          'research_team_decision',
          'final_trade_decision',
        ]}
        activeTab="research_team_decision"
        onSelect={vi.fn()}
        renderIcon={() => null}
        renderLabel={(key) => key}
      />,
    );

    expect(
      screen.getByRole('tab', { name: /research_team_decision/i }),
    ).toHaveAttribute('aria-selected', 'true');
    expect(
      screen.getByRole('tab', { name: /market_report/i }),
    ).toHaveAccessibleName(/Read/i);
  });
});
