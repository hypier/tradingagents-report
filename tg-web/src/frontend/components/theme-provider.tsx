import * as React from 'react';
import { ThemeProvider as NextThemesProvider } from 'next-themes';

import {
  DEFAULT_UI_THEME,
  UI_THEME_STORAGE_KEY,
} from '@/frontend/lib/theme';

export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme={DEFAULT_UI_THEME}
      enableSystem
      disableTransitionOnChange
      storageKey={UI_THEME_STORAGE_KEY}
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
