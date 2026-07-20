const STALE_AFTER_MS = 15 * 60 * 1000;

export type SnapshotFreshness = 'as_of' | 'stale';

export function snapshotFreshness(asOf?: string | null): SnapshotFreshness {
  if (!asOf) return 'stale';
  const age = Date.now() - new Date(asOf).getTime();
  if (!Number.isFinite(age) || age < 0) return 'stale';
  return age > STALE_AFTER_MS ? 'stale' : 'as_of';
}
