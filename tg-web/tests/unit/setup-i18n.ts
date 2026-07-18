import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';

import i18n from '../../src/frontend/i18n';
import { UI_LANGUAGE_STORAGE_KEY } from '../../src/frontend/i18n/locales';
import { UI_THEME_STORAGE_KEY } from '../../src/frontend/lib/theme';

function isJsdom() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
}

function hasWorkingLocalStorage() {
  const storage = globalThis.localStorage;
  if (
    !storage ||
    typeof storage.getItem !== 'function' ||
    typeof storage.setItem !== 'function' ||
    typeof storage.removeItem !== 'function'
  ) {
    return false;
  }

  try {
    const probeKey = '__tg_web_storage_probe__';
    storage.setItem(probeKey, '1');
    const ok = storage.getItem(probeKey) === '1';
    storage.removeItem(probeKey);
    return ok;
  } catch {
    return false;
  }
}

function ensureLocalStorage() {
  if (hasWorkingLocalStorage()) return;

  const memory = createMemoryStorage();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: memory,
  });
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: memory,
    });
  }
}

function ensureMatchMedia() {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}

beforeEach(async () => {
  if (!isJsdom()) return;

  ensureLocalStorage();
  ensureMatchMedia();

  localStorage.removeItem(UI_LANGUAGE_STORAGE_KEY);
  localStorage.removeItem(UI_THEME_STORAGE_KEY);
  document.documentElement.classList.remove('dark');
  document.documentElement.style.colorScheme = '';

  if (i18n.resolvedLanguage !== 'en') {
    await i18n.changeLanguage('en');
  }
});

afterEach(() => {
  if (isJsdom()) {
    cleanup();
  }
});
