import { isValidTimezone } from '@/shared/timezone';

/** Account display timezone for Intl formatters; null → browser local. */
let displayTimezone: string | null = null;

export function getDisplayTimezone(): string | null {
  return displayTimezone;
}

export function setDisplayTimezone(timezone?: string | null) {
  if (!timezone || !isValidTimezone(timezone)) {
    displayTimezone = null;
    return;
  }
  displayTimezone = timezone;
}
