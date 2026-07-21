// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { ReportTabsNav } from '@/frontend/components/report/report-tabs-nav';

beforeAll(() => {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.scrollTo = vi.fn();
});

describe('ReportTabsNav', () => {
  it('marks the active tab with a primary bottom border underline', () => {
    render(
      <ReportTabsNav
        entries={['market_report', 'news_report']}
        activeTab="market_report"
        onSelect={vi.fn()}
        renderIcon={() => null}
        renderLabel={(key) => key}
      />,
    );

    const active = screen.getByRole('tab', { name: 'market_report' });
    expect(active).toHaveAttribute('aria-selected', 'true');
    expect(active.className).toMatch(/border-b-primary/);

    const inactive = screen.getByRole('tab', { name: 'news_report' });
    expect(inactive).toHaveAttribute('aria-selected', 'false');
    expect(inactive.className).toMatch(/border-b-transparent/);
  });

  it('scrolls the active tab toward the center of the scroller', () => {
    const scrollTo = vi.fn();
    Element.prototype.scrollTo = scrollTo;

    const { rerender } = render(
      <ReportTabsNav
        entries={[
          'market_report',
          'sentiment_report',
          'news_report',
          'fundamentals_report',
          'investment_plan',
          'trader_investment_plan',
          'final_trade_decision',
        ]}
        activeTab="market_report"
        onSelect={vi.fn()}
        renderIcon={() => null}
        renderLabel={(key) => key}
      />,
    );

    const tablist = screen.getByRole('tablist');
    Object.defineProperty(tablist, 'clientWidth', {
      configurable: true,
      value: 200,
    });
    Object.defineProperty(tablist, 'scrollWidth', {
      configurable: true,
      value: 800,
    });
    Object.defineProperty(tablist, 'scrollLeft', {
      configurable: true,
      writable: true,
      value: 0,
    });
    vi.spyOn(tablist, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      bottom: 40,
      right: 200,
      width: 200,
      height: 40,
      toJSON: () => ({}),
    });

    const newsTab = screen.getByRole('tab', { name: 'news_report' });
    vi.spyOn(newsTab, 'getBoundingClientRect').mockReturnValue({
      x: 320,
      y: 0,
      top: 0,
      left: 320,
      bottom: 40,
      right: 420,
      width: 100,
      height: 40,
      toJSON: () => ({}),
    });

    scrollTo.mockClear();
    rerender(
      <ReportTabsNav
        entries={[
          'market_report',
          'sentiment_report',
          'news_report',
          'fundamentals_report',
          'investment_plan',
          'trader_investment_plan',
          'final_trade_decision',
        ]}
        activeTab="news_report"
        onSelect={vi.fn()}
        renderIcon={() => null}
        renderLabel={(key) => key}
      />,
    );

    expect(scrollTo).toHaveBeenCalledWith(
      expect.objectContaining({
        left: 270,
        behavior: 'smooth',
      }),
    );
  });
});
