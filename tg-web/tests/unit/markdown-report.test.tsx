// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import { MarkdownReport } from '../../src/frontend/components/report/markdown-report';

it('renders report markdown as semantic document content', () => {
  render(
    <MarkdownReport
      value={
        '# Market outlook\n\n| Metric | Value |\n| --- | --- |\n| Close | **$327.50** |'
      }
    />,
  );

  expect(
    screen.getByRole('heading', { name: 'Market outlook' }),
  ).toBeInTheDocument();
  expect(screen.getByRole('table')).toHaveTextContent('Close');
  expect(screen.getByText('$327.50').tagName).toBe('STRONG');
});
