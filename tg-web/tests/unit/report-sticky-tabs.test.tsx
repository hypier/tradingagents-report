// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { ReportStickyTabs } from '@/frontend/components/report/report-sticky-tabs';

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

afterEach(() => {
  vi.restoreAllMocks();
});

function renderStickyTabs() {
  return render(
    <ReportStickyTabs
      stickyTop="header"
      symbol="AAPL"
      logoUrl={null}
      displayName="Apple Inc."
      ticker="AAPL"
      entries={['market_report', 'news_report']}
      activeTab="market_report"
      onSelect={vi.fn()}
      renderIcon={() => null}
      renderLabel={(key) => key}
    />,
  );
}

describe('ReportStickyTabs', () => {
  it('shows the instrument chip once the sentinel crosses the sticky offset', () => {
    let sentinelTop = 120;

    vi.spyOn(window, 'getComputedStyle').mockImplementation(
      ((el: Element) => {
        const sticky = document.querySelector(
          '[data-stuck-identity]',
        )?.closest('.sticky');
        if (sticky && el === sticky) {
          return { top: '52px', overflowY: 'visible' } as CSSStyleDeclaration;
        }
        return {
          overflowY: 'visible',
          top: 'auto',
        } as CSSStyleDeclaration;
      }) as typeof getComputedStyle,
    );

    const rectSpy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        if (this.hasAttribute('data-sticky-sentinel')) {
          return {
            x: 0,
            y: sentinelTop,
            top: sentinelTop,
            left: 0,
            bottom: sentinelTop + 1,
            right: 200,
            width: 200,
            height: 1,
            toJSON: () => ({}),
          };
        }
        return {
          x: 0,
          y: 0,
          top: 0,
          left: 0,
          bottom: 0,
          right: 0,
          width: 0,
          height: 0,
          toJSON: () => ({}),
        };
      });

    renderStickyTabs();

    const chip = document.querySelector('[data-stuck-identity]');
    expect(chip).toHaveAttribute('data-stuck-identity', 'false');
    expect(screen.getByText('Apple Inc.')).toBeInTheDocument();
    expect(screen.getByText('AAPL')).toBeInTheDocument();

    sentinelTop = 40;
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });
    expect(chip).toHaveAttribute('data-stuck-identity', 'true');

    sentinelTop = 120;
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });
    expect(chip).toHaveAttribute('data-stuck-identity', 'false');

    rectSpy.mockRestore();
  });

  it('renders a sticky sentinel above the tab bar', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 200,
      top: 200,
      left: 0,
      bottom: 201,
      right: 200,
      width: 200,
      height: 1,
      toJSON: () => ({}),
    });
    renderStickyTabs();
    const sentinel = document.querySelector('[data-sticky-sentinel]');
    expect(sentinel).toHaveAttribute('aria-hidden');
  });
});
