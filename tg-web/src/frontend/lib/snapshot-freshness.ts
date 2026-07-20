const STALE_AFTER_MS = 15 * 60 * 1000;

export type SnapshotFreshness = 'as_of' | 'stale';

export type SnapshotFreshnessInput = {
  asOf?: string | null;
  updateMode?: string | null;
  delaySeconds?: number | null;
};

/** Parse TradingView `update_mode`, e.g. `delayed_streaming_900` → 900. */
export function parseUpdateModeDelaySeconds(
  updateMode?: string | null,
): number | null {
  if (!updateMode) return null;
  const normalized = updateMode.trim().toLowerCase();
  if (normalized === 'streaming') return 0;
  const match = /^delayed(?:_streaming)?_(\d+)$/u.exec(normalized);
  if (!match) return null;
  const seconds = Number(match[1]);
  return Number.isFinite(seconds) ? seconds : null;
}

export function resolveDelaySeconds(
  input: SnapshotFreshnessInput,
): number | null {
  if (
    typeof input.delaySeconds === 'number' &&
    Number.isFinite(input.delaySeconds) &&
    input.delaySeconds >= 0
  ) {
    return input.delaySeconds;
  }
  return parseUpdateModeDelaySeconds(input.updateMode);
}

export function snapshotAgeMs(asOf?: string | null): number | null {
  if (!asOf) return null;
  const age = Date.now() - new Date(asOf).getTime();
  if (!Number.isFinite(age) || age < 0) return null;
  return age;
}

export function snapshotFreshness(
  input: SnapshotFreshnessInput | string | null | undefined,
): SnapshotFreshness {
  const normalized: SnapshotFreshnessInput =
    typeof input === 'string' || input == null
      ? { asOf: input }
      : input;

  const delaySeconds = resolveDelaySeconds(normalized);
  if (delaySeconds !== null) {
    return delaySeconds > 0 ? 'stale' : 'as_of';
  }

  const age = snapshotAgeMs(normalized.asOf);
  if (age === null) return 'stale';
  return age > STALE_AFTER_MS ? 'stale' : 'as_of';
}

function formatDurationFromSeconds(totalSeconds: number): string {
  const totalMinutes = Math.max(1, Math.floor(totalSeconds / 60));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  }
  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  return `${minutes}m`;
}

/**
 * Vendor delay label from `update_mode` / `delay_seconds`.
 * Falls back to age-from-`as_of` only when mode is unknown.
 */
export function formatSnapshotDelay(
  input: SnapshotFreshnessInput | string | null | undefined,
): string | null {
  const normalized: SnapshotFreshnessInput =
    typeof input === 'string' || input == null
      ? { asOf: input }
      : input;

  const delaySeconds = resolveDelaySeconds(normalized);
  if (delaySeconds !== null) {
    return delaySeconds > 0 ? formatDurationFromSeconds(delaySeconds) : null;
  }

  const age = snapshotAgeMs(normalized.asOf);
  if (age === null || age <= STALE_AFTER_MS) return null;
  return formatDurationFromSeconds(Math.floor(age / 1000));
}
