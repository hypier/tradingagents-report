import { beforeEach, expect, it } from 'vitest';

import i18n from '../../src/frontend/i18n';
import { localizeProgressMessage } from '../../src/frontend/lib/localize-progress-message';

beforeEach(async () => {
  await i18n.changeLanguage('zh');
});

it('localizes Core tool-call and stage progress messages', () => {
  const t = i18n.t.bind(i18n);

  expect(
    localizeProgressMessage(
      'Fundamentals Analyst: calling get_income_statement',
      t,
    ),
  ).toBe('基本面分析师：正在调用 get_income_statement');

  expect(localizeProgressMessage('Running Fundamentals Analyst', t)).toBe(
    '正在运行基本面分析师',
  );

  expect(
    localizeProgressMessage('Market Analyst: calling get_verified_market_snapshot', t),
  ).toBe('市场分析师：正在调用 get_verified_market_snapshot');

  expect(localizeProgressMessage('Running research debate (0/2)', t)).toBe(
    '正在进行研究辩论（0/2）',
  );

  expect(localizeProgressMessage('Running Portfolio Manager', t)).toBe(
    '正在运行组合经理',
  );

  expect(localizeProgressMessage('Portfolio Manager completed', t)).toBe(
    '组合经理已完成',
  );
});

it('keeps unknown messages unchanged', () => {
  const t = i18n.t.bind(i18n);
  expect(localizeProgressMessage('Custom backend note', t)).toBe(
    'Custom backend note',
  );
});
