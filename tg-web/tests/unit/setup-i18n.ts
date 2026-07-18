import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';

import i18n from '../../src/frontend/i18n';
import { UI_LANGUAGE_STORAGE_KEY } from '../../src/frontend/i18n/locales';

function isJsdom() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

beforeEach(async () => {
  if (!isJsdom()) return;

  try {
    globalThis.localStorage?.removeItem?.(UI_LANGUAGE_STORAGE_KEY);
  } catch {
    // Node/jsdom environments may expose a non-functional localStorage stub.
  }

  if (i18n.resolvedLanguage !== 'en') {
    await i18n.changeLanguage('en');
  }
});

afterEach(() => {
  if (isJsdom()) {
    cleanup();
  }
});
