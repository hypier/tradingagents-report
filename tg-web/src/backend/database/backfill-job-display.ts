/**
 * One-shot: fill analysis_jobs.display for legacy rows that lack display_name.
 *
 * Sources (in order):
 * 1. Another analysis_jobs row with the same ticker and a usable display
 * 2. watchlist_items matching display_ticker / symbol
 * 3. TradingView market search (once per unique ticker)
 *
 * Usage: `pnpm exec tsx src/backend/database/backfill-job-display.ts`
 */
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { TradingViewMarketClient } from '../market-assets/tradingview-market-client';
import {
  databaseUrlFromEnv,
  loadEnvFile,
  loadMigrationEnv,
} from './migrate-cli';

type DisplayPayload = {
  display_name: string;
  logo_url?: string;
  country?: string;
};

type JobRow = {
  id: string;
  ticker: string;
  display: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function displayNameOf(display: unknown): string {
  if (!isRecord(display)) return '';
  return typeof display.display_name === 'string'
    ? display.display_name.trim()
    : '';
}

function asDisplayPayload(display: unknown): DisplayPayload | null {
  const name = displayNameOf(display);
  if (!name) return null;
  if (!isRecord(display)) return { display_name: name };
  const logo =
    typeof display.logo_url === 'string' ? display.logo_url.trim() : '';
  const country =
    typeof display.country === 'string' ? display.country.trim() : '';
  return {
    display_name: name,
    ...(logo ? { logo_url: logo } : {}),
    ...(country ? { country } : {}),
  };
}

function tickersMatch(left: string, right: string) {
  const a = left.trim().toUpperCase();
  const b = right.trim().toUpperCase();
  if (a === b) return true;
  const stripZeros = (value: string) =>
    /^\d+$/u.test(value) ? String(Number(value)) : value;
  return stripZeros(a) === stripZeros(b);
}

export async function backfillJobDisplay(options?: {
  dryRun?: boolean;
  tradingViewApiKey?: string;
}): Promise<{ updated: number; skipped: number; unresolved: string[] }> {
  loadMigrationEnv();
  // Market identity key often lives in tg-core/.env during local monorepo runs.
  if (!process.env.TRADINGVIEW_RAPIDAPI_KEY?.trim()) {
    loadEnvFile(resolve(process.cwd(), '../tg-core/.env'), { override: false });
  }
  const connectionString = databaseUrlFromEnv();
  const pool = new Pool({ connectionString });
  const db = drizzle({ client: pool });
  const apiKey =
    options?.tradingViewApiKey?.trim() ||
    process.env.TRADINGVIEW_RAPIDAPI_KEY?.trim() ||
    undefined;
  if (!apiKey) {
    console.warn(
      'TRADINGVIEW_RAPIDAPI_KEY unset — will only use sibling jobs / watchlist',
    );
  }
  const market = new TradingViewMarketClient(apiKey);
  const dryRun = options?.dryRun === true;

  try {
    const missing = (await db.execute(sql`
      SELECT id::text AS id, ticker, display
      FROM analysis_jobs
      WHERE COALESCE(BTRIM(display->>'display_name'), '') = ''
      ORDER BY ticker, created_at
    `)) as unknown as JobRow[];

    const missingRows = Array.isArray(missing)
      ? missing
      : ((missing as { rows?: JobRow[] }).rows ?? []);

    if (!missingRows.length) {
      console.log('No analysis_jobs rows missing display_name.');
      return { updated: 0, skipped: 0, unresolved: [] };
    }

    const byTicker = new Map<string, string[]>();
    for (const row of missingRows) {
      const list = byTicker.get(row.ticker) ?? [];
      list.push(row.id);
      byTicker.set(row.ticker, list);
    }

    console.log(
      `Found ${missingRows.length} row(s) across ${byTicker.size} ticker(s)`,
    );

    const resolved = new Map<string, DisplayPayload>();
    const tickers = [...byTicker.keys()];

    // 1) Sibling jobs that already have display.
    const siblingsRaw = await db.execute(sql`
      SELECT DISTINCT ON (ticker) ticker, display
      FROM analysis_jobs
      WHERE COALESCE(BTRIM(display->>'display_name'), '') <> ''
        AND ticker IN (${sql.join(
          tickers.map((ticker) => sql`${ticker}`),
          sql`, `,
        )})
      ORDER BY ticker, updated_at DESC NULLS LAST, created_at DESC
    `);
    const siblings = (
      Array.isArray(siblingsRaw)
        ? siblingsRaw
        : ((siblingsRaw as { rows?: Array<{ ticker: string; display: unknown }> })
            .rows ?? [])
    ) as Array<{ ticker: string; display: unknown }>;
    for (const row of siblings) {
      const payload = asDisplayPayload(row.display);
      if (payload) resolved.set(row.ticker, payload);
    }

    // 2) Watchlist entries.
    const unresolvedAfterSiblings = tickers.filter(
      (ticker) => !resolved.has(ticker),
    );
    if (unresolvedAfterSiblings.length) {
      const watchlistRaw = await db.execute(sql`
        SELECT display_ticker, symbol, display_name, logo_url
        FROM watchlist_items
        WHERE display_ticker IN (${sql.join(
          unresolvedAfterSiblings.map((ticker) => sql`${ticker}`),
          sql`, `,
        )})
           OR symbol IN (${sql.join(
             unresolvedAfterSiblings.map((ticker) => sql`${ticker}`),
             sql`, `,
           )})
      `);
      const watchlist = (
        Array.isArray(watchlistRaw)
          ? watchlistRaw
          : ((
              watchlistRaw as {
                rows?: Array<{
                  display_ticker: string;
                  symbol: string;
                  display_name: string;
                  logo_url: string | null;
                }>;
              }
            ).rows ?? [])
      ) as Array<{
        display_ticker: string;
        symbol: string;
        display_name: string;
        logo_url: string | null;
      }>;
      for (const row of watchlist) {
        const name = row.display_name.trim();
        if (!name) continue;
        const payload: DisplayPayload = {
          display_name: name,
          ...(row.logo_url?.trim()
            ? { logo_url: row.logo_url.trim() }
            : {}),
        };
        for (const ticker of unresolvedAfterSiblings) {
          if (
            tickersMatch(ticker, row.display_ticker) ||
            tickersMatch(ticker, row.symbol)
          ) {
            if (!resolved.has(ticker)) resolved.set(ticker, payload);
          }
        }
      }
    }

    // 3) TradingView once per remaining ticker.
    const unresolvedAfterWatchlist = tickers.filter(
      (ticker) => !resolved.has(ticker),
    );
    for (const ticker of unresolvedAfterWatchlist) {
      const [identity] = await market.getIdentities([ticker]);
      if (!identity?.display_name?.trim()) {
        console.warn(`Unresolved ticker via TradingView: ${ticker}`);
        continue;
      }
      // Skip pure ticker fallbacks — not useful display enrichment.
      if (
        identity.display_name.trim().toUpperCase() ===
          identity.display_ticker.trim().toUpperCase() &&
        !identity.logo_url
      ) {
        console.warn(`TradingView returned ticker-only for ${ticker}`);
        continue;
      }
      resolved.set(ticker, {
        display_name: identity.display_name.trim(),
        ...(identity.logo_url ? { logo_url: identity.logo_url } : {}),
      });
      console.log(
        `TradingView identity: ${ticker} → ${identity.display_name}`,
      );
    }

    let updated = 0;
    let skipped = 0;
    const unresolved: string[] = [];

    for (const [ticker, ids] of byTicker) {
      const payload = resolved.get(ticker);
      if (!payload) {
        unresolved.push(ticker);
        skipped += ids.length;
        continue;
      }

      if (dryRun) {
        console.log(
          `[dry-run] would update ${ids.length} row(s) for ${ticker}:`,
          payload,
        );
        updated += ids.length;
        continue;
      }

      await db.execute(sql`
        UPDATE analysis_jobs
        SET
          display = COALESCE(display, '{}'::jsonb) || ${JSON.stringify(payload)}::jsonb,
          updated_at = NOW()
        WHERE id IN (${sql.join(
          ids.map((id) => sql`${id}::uuid`),
          sql`, `,
        )})
          AND COALESCE(BTRIM(display->>'display_name'), '') = ''
      `);
      updated += ids.length;
      console.log(`Updated ${ids.length} row(s) for ${ticker}`);
    }

    console.log(
      `Done. updated=${updated} skipped=${skipped} unresolved=[${unresolved.join(', ')}]`,
    );
    return { updated, skipped, unresolved };
  } finally {
    await pool.end();
  }
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const dryRun = process.argv.includes('--dry-run');
  backfillJobDisplay({ dryRun })
    .then((result) => {
      if (result.unresolved.length) process.exitCode = 2;
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
