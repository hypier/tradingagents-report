# Market Asset Logo Design

> Superseded implementation boundary: TG-web's Node/Cloudflare BFF performs the authenticated TradingView market search. Core remains responsible for research data only.

## Goal

Show the TradingView asset logo before stock identity in the market snapshot and recent research reports. The market snapshot presents the resolved company name as its primary identity and keeps the ticker as secondary context.

## Scope

- TG-web's BFF searches the configured TradingView provider for the resolved asset and returns its display name, ticker, and first preferred logo `logoid` as a direct SVG URL.
- The returned URL uses `https://tv-logo.tradingviewapi.com/logo/{logoid}.svg`; the frontend loads that public URL directly, without proxying, caching, or converting the image.
- The market snapshot uses the existing shadcn `Avatar` before the company name. Its ticker remains visible as secondary text.
- Recent research reports use the same avatar treatment before each ticker.
- A missing logo, failed asset search, or failed image load falls back to the ticker's first character. It does not make an existing price snapshot or research history fail.

## Boundaries

- Reuse a TG-web server-side TradingView client and `TRADINGVIEW_RAPIDAPI_KEY`. Do not expose or duplicate any API credential in the browser.
- Do not introduce a local ticker-to-logo mapping, an image proxy, new caching infrastructure, Core API changes, or changes to analysis jobs.
- Preserve the current public fields of the Core market snapshot response; TG-web obtains its display identity through its own BFF endpoint instead of fetching a quote for every report row.

## Data Flow

1. TG-web's BFF searches TradingView for each requested ticker and chooses its primary market record.
2. When TradingView provides a `logo.logoid`, the BFF returns the direct logo URL in `logo_url`.
3. The reports list requests identity metadata for its visible tickers; the market snapshot uses its Core company name with the BFF-provided logo when available.
4. The web app renders that URL with `AvatarImage`; `AvatarFallback` remains visible when no image is usable.
5. The market snapshot shows `display_name` as the label and `ticker` below it. The reports table keeps the ticker label with its avatar.

## Testing

- BFF coverage asserts that the authenticated server-side TradingView client returns a direct URL from a returned `logo.logoid` and falls back when unavailable.
- Frontend tests assert the market card shows the company name, ticker, and logo URL, and that report rows render asset avatars with ticker fallbacks.
