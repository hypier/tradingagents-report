import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export type NavMode = 'user' | 'admin';

const STORAGE_KEY = 'tg-nav-mode';

function readStoredMode(): NavMode {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'admin'
      ? 'admin'
      : 'user';
  } catch {
    return 'user';
  }
}

function writeStoredMode(mode: NavMode) {
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Ignore quota / private-mode failures.
  }
}

function isAdminPath(pathname: string) {
  return pathname === '/admin' || pathname.startsWith('/admin/');
}

function applyDocumentNavMode(mode: NavMode) {
  if (typeof document === 'undefined') return;
  if (mode === 'admin') {
    document.documentElement.dataset.navMode = 'admin';
  } else {
    delete document.documentElement.dataset.navMode;
  }
}

/**
 * Admin-only menu mode: user menus vs admin console menus.
 * Pass `null` while the session is still loading so admin routes do not
 * briefly flash the research menu.
 */
export function useNavMode(isAdmin: boolean | null) {
  const location = useLocation();
  const navigate = useNavigate();
  const [mode, setMode] = useState<NavMode>(() => {
    if (typeof window === 'undefined') return 'user';
    if (isAdminPath(window.location.pathname)) return 'admin';
    return readStoredMode();
  });

  useEffect(() => {
    if (isAdmin === false) {
      setMode('user');
      return;
    }
    if (isAdmin === true && isAdminPath(location.pathname)) {
      setMode('admin');
      writeStoredMode('admin');
    }
  }, [isAdmin, location.pathname]);

  const effectiveMode: NavMode = isAdmin === false ? 'user' : mode;

  useEffect(() => {
    applyDocumentNavMode(effectiveMode);
    return () => {
      applyDocumentNavMode('user');
    };
  }, [effectiveMode]);

  const setNavMode = useCallback(
    (next: NavMode) => {
      if (isAdmin !== true && next === 'admin') return;
      setMode(next);
      writeStoredMode(next);
      if (next === 'admin' && !isAdminPath(location.pathname)) {
        navigate('/admin');
      } else if (next === 'user' && isAdminPath(location.pathname)) {
        navigate('/');
      }
    },
    [isAdmin, location.pathname, navigate],
  );

  return {
    navMode: effectiveMode,
    setNavMode,
    isAdminMenu: effectiveMode === 'admin',
  };
}
