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
});
