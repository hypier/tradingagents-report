# Market Asset Logo Design

## Goal

Show the TradingView asset logo before stock identity in the market snapshot and recent research reports. The market snapshot presents the resolved company name as its primary identity and keeps the ticker as secondary context.

## Scope

- Core provides a lightweight asset-identity endpoint that searches the configured TradingView provider for the resolved asset and returns its display name, ticker, and first preferred logo `logoid` as a direct SVG URL.
- The returned URL uses `https://tv-logo.tradingviewapi.com/logo/{logoid}.svg`; the frontend loads that public URL directly, without proxying, caching, or converting the image.
- The market snapshot uses the existing shadcn `Avatar` before the company name. Its ticker remains visible as secondary text.
- Recent research reports use the same avatar treatment before each ticker.
- A missing logo, failed asset search, or failed image load falls back to the ticker's first character. It does not make an existing price snapshot or research history fail.

## Boundaries

- Reuse the existing server-side TradingView client and its configured RapidAPI key. Do not expose or duplicate any API credential in the web application.
- Do not introduce a local ticker-to-logo mapping, an image proxy, new caching infrastructure, or changes to analysis jobs.
- Preserve the current public fields of the market snapshot response; add only optional `logo_url` and reuse the asset-identity response instead of fetching a quote for every report row.

## Data Flow

1. The asset-identity endpoint resolves the listing and searches TradingView for its primary market record.
2. When TradingView provides a `logo.logoid`, Core returns the direct logo URL in `logo_url`.
3. The market-snapshot endpoint obtains that identity once alongside its normal quote; the reports list requests identity metadata for its visible tickers.
4. The web app renders that URL with `AvatarImage`; `AvatarFallback` remains visible when no image is usable.
5. The market snapshot shows `display_name` as the label and `ticker` below it. The reports table keeps the ticker label with its avatar.

## Testing

- Core API coverage asserts that asset identity and snapshots can return `logo_url` without changing existing snapshot fields.
- TradingView adapter coverage verifies a direct URL is created from a returned `logo.logoid` and omits it when unavailable.
- Frontend tests assert the market card shows the company name, ticker, and logo URL, and that report rows render asset avatars with ticker fallbacks.
