// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { ReportReadingToolbar } from '@/frontend/components/report/report-reading-toolbar';

beforeAll(() => {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

function renderToolbar(showBackToTop = true) {
  return render(
    <ReportReadingToolbar
      fontStep={1}
      fontSteps={[0.92, 1, 1.08]}
      onFontStepChange={vi.fn()}
      paperTheme="mist"
      onPaperThemeChange={vi.fn()}
      deskTheme="slate"
      onDeskThemeChange={vi.fn()}
      showBackToTop={showBackToTop}
      onBackToTop={vi.fn()}
      layoutKey="market_report"
    />,
  );
}

describe('ReportReadingToolbar', () => {
  it('renders back-to-top stacked with the options control', () => {
    renderToolbar(true);

    const backToTop = screen.getByRole('button', { name: 'Back to top' });
    const options = screen.getByRole('button', {
      name: 'Open reading options',
    });

    expect(backToTop).toBeVisible();
    expect(options).toBeVisible();

    const root = options.parentElement;
    expect(root).toHaveClass('flex-col-reverse');
  });

  it('anchors the floating controls to the paper right edge on wide screens', () => {
    const paper = document.createElement('article');
    paper.setAttribute('data-report-paper', '');
    document.body.appendChild(paper);

    vi.spyOn(paper, 'getBoundingClientRect').mockReturnValue({
      x: 200,
      y: 80,
      top: 80,
      left: 200,
      bottom: 900,
      right: 1224,
      width: 1024,
      height: 820,
      toJSON: () => ({}),
    });
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1600);

    renderToolbar(true);

    const options = screen.getByRole('button', {
      name: 'Open reading options',
    });
    const root = options.parentElement;
    // 1600 - 1224 = 376 desk to the right of paper; outside = 376 - 30 - 44 = 302
    expect(root).toHaveStyle({ right: '302px' });
  });

  it('hides back-to-top until the page has scrolled far enough', () => {
    renderToolbar(false);

    const backToTop = screen.getByRole('button', { name: 'Back to top' });
    expect(backToTop).toHaveClass('opacity-0');
    expect(backToTop).toHaveClass('pointer-events-none');
  });

  it('remeasures after layoutKey changes', async () => {
    const paper = document.createElement('article');
    paper.setAttribute('data-report-paper', '');
    document.body.appendChild(paper);

    const rect = {
      x: 100,
      y: 80,
      top: 80,
      left: 100,
      bottom: 900,
      right: 800,
      width: 700,
      height: 820,
      toJSON: () => ({}),
    };
    vi.spyOn(paper, 'getBoundingClientRect').mockReturnValue(rect);
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1200);

    const view = render(
      <ReportReadingToolbar
        fontStep={1}
        fontSteps={[0.92, 1, 1.08]}
        onFontStepChange={vi.fn()}
        paperTheme="mist"
        onPaperThemeChange={vi.fn()}
        deskTheme="slate"
        onDeskThemeChange={vi.fn()}
        showBackToTop
        onBackToTop={vi.fn()}
        layoutKey="market_report"
      />,
    );

    rect.right = 1000;
    await act(async () => {
      view.rerender(
        <ReportReadingToolbar
          fontStep={1}
          fontSteps={[0.92, 1, 1.08]}
          onFontStepChange={vi.fn()}
          paperTheme="mist"
          onPaperThemeChange={vi.fn()}
          deskTheme="slate"
          onDeskThemeChange={vi.fn()}
          showBackToTop
          onBackToTop={vi.fn()}
          layoutKey="news_report"
        />,
      );
    });

    const options = screen.getByRole('button', {
      name: 'Open reading options',
    });
    // 1200 - 1000 = 200; outside = 200 - 30 - 44 = 126
    expect(options.parentElement).toHaveStyle({ right: '126px' });
  });
});
