import { useEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useTranslation } from 'react-i18next';

import { Button } from '@/frontend/components/ui/button';
import {
  type UiTheme,
  UI_THEMES,
  normalizeUiTheme,
} from '@/frontend/lib/theme';
import { cn } from '@/frontend/lib/utils';

const THEME_ICONS = {
  light: Sun,
  dark: Moon,
  system: Monitor,
} as const;

export function ThemeSwitcher({ className }: { className?: string }) {
  const { t } = useTranslation('common');
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const active = normalizeUiTheme(mounted ? theme : undefined);

  function selectTheme(next: UiTheme) {
    setTheme(next);
  }

  return (
    <div
      className={cn('flex items-center gap-1', className)}
      role="group"
      aria-label={t('theme.label')}
    >
      {UI_THEMES.map((value) => {
        const Icon = THEME_ICONS[value];
        return (
          <Button
            key={value}
            type="button"
            size="icon-sm"
            variant={active === value ? 'secondary' : 'ghost'}
            aria-pressed={active === value}
            aria-label={t(`theme.${value}`)}
            title={t(`theme.${value}`)}
            onClick={() => selectTheme(value)}
          >
            <Icon />
          </Button>
        );
      })}
    </div>
  );
}
