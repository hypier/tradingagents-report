# TG Web — Stitch Prompt Pack (Signal Floor)

**Style locked:** D · Signal Floor — use [`DESIGN.md`](./DESIGN.md) as the design-system attachment / system prompt.  
**Screens in this pack:** Home (analysis desk) · Report detail · Tasks center  
**Viewport:** Desktop 1440×900 first; then ask Stitch to adapt each to 375 mobile.

---

## How to run in Google Stitch

1. Open [labs.google/stitch](https://labs.google/stitch) and create a project named `TG Web — Signal Floor`.
2. Paste or attach the full contents of `DESIGN.md` as the project design system / global instructions (every screen must obey it).
3. Create **three screens** in order below. For each screen: paste the **Screen prompt** block only (do not paste this whole file).
4. After each generation, iterate with the **Tighten** line if needed.
5. Optional follow-ups (same project):
   - `Adapt this screen to 375px mobile width. Stack panes. Keep density 8. Touch targets ≥ 44px.`
   - `Show empty state for this screen using DESIGN.md empty-state rules.`
   - `Show running-job state with amber pulse and progress shimmer.`

**Do not** ask Stitch for BUY/SELL tickets, purple neon, Inter, cream terracotta, or 3 equal feature cards.

---

## Shared shell (assume on every authenticated screen)

Include this mental model in every prompt (already repeated per screen for copy-paste safety):

- Left sidebar `#0E141B` on canvas `#070A0E`
- Brand lockup **TG** + wordmark TradingAgents at top
- Nav (active = amber wash): Desk · Tasks · Reports · Watchlist · Billing · Account
- Compact top utility: language, account avatar
- Font: Geist UI + Geist Mono for all numbers
- Radius 6–10px, wire borders `rgba(148,163,184,0.16)`, no soft white cards

---

## Screen 1 — Analysis Desk (Home `/`)

**Goal:** Working pit. Composer + quote dominate. Not a marketing hero.

### Screen prompt (paste into Stitch)

```text
Design an authenticated desktop UI for TG Web — multi-market AI equity research (research only, no trading).

STRICTLY follow the attached Signal Floor design system:
- Canvas #070A0E, sidebar/panel #0E141B, surfaces #151C25
- Single accent Signal Amber #D97706 (CTA, focus, running). No purple, no teal brand, no glow
- Rise #22C55E / Fall #F43F5E for price moves only
- Geist + Geist Mono; ALL numbers monospace; page title ≤ 1.5rem
- Density 8: tight gaps 12–16px, tables/rows over floating cards, radius 6–10px
- No emoji, no Inter, no pure #000, no order tickets, no 3 equal feature cards

LAYOUT (1440px, CSS grid):
1) Left sidebar (~220px): TG brand lockup, nav items Desk (active, amber wash), Tasks, Reports, Watchlist, Billing, Account. Footer: credits chip "Credits 47" mono + Dim Meta "cycle ends Aug 1".
2) Main — asymmetric 2-pane (~1.15fr / 0.85fr):
   LEFT — Analysis composer:
   - Page title "Research desk"
   - Ticker search input (mono placeholder "AAPL or 0700.HK")
   - Quote strip for selected Apple Inc / NASDAQ:AAPL:
     large mono last price 214.32, Rise +1.24% in green, exchange badge, source "Polygon", as-of "2026-07-20 15:42 UTC" in Ghost Meta. Tiny muted spark line.
   - Analyst chip group: Market, Fundamentals, News, Social (all selected = amber wash)
   - Fields: Analysis date 2026-07-20, Report language English
   - Credit estimate line: "This run: 1 credit · Available: 47" mono
   - ONE primary button amber fill dark text: "Run analysis"
   RIGHT — Activity:
   - "Active job" panel: status Running with amber pulse dot, ticker NVDA, thin progress rail with amber shimmer, current step "Bull researcher", elapsed 02:14 mono
   - Below: "Recent" dense table (hairline rows, no cards): columns Ticker | Status | Date | Credits — 5 rows mixing succeeded/failed/queued. Failed uses rose text. Tickers mono.

Copy voice: research desk, factual. No "Elevate/Unleash/Seamless".
```

### Tighten (if too soft / too sparse)

```text
Increase density: reduce whitespace, shrink paddings, make quote strip and recent table feel like a trading floor instrument. Stronger amber only on Run button and running status — not the whole UI. Keep carbon near-black.
```

---

## Screen 2 — Report Detail (`/reports/:id`)

**Goal:** Cool Paper reading mode inside dark chrome. Editorial gravity, still Signal Floor.

### Screen prompt (paste into Stitch)

```text
Design an authenticated desktop report detail screen for TG Web AI equity research.

STRICTLY follow Signal Floor design system (attached):
- App chrome stays dark: canvas #070A0E, sidebar #0E141B
- Reading column uses Cool Paper #EEF2F6 with Report Ink #0F172A body text
- Accent Signal Amber #D97706 only for interactive/active (share, favorite active, focus). Decision badge may use Rise/Fall semantic colors — not amber unless "live"
- Geist + Geist Mono; tickers/prices/timestamps mono
- Density 8; no purple neon; no Inter; no emoji; research only

LAYOUT (1440px):
1) Same left sidebar; Reports nav active (amber wash)
2) Main split: left TOC rail (~240px, still dark pit surface) + right paper reading stage
   Sticky report header spanning content:
   - Mono ticker "0700.HK" + company "Tencent Holdings"
   - Exchange badge HKEX
   - Decision summary badge e.g. "Hold" (neutral steel) — not a BUY/SELL trade ticket
   - Meta: generated 2026-07-18 · source latency note · "1 credit used"
   - Actions row (ghost/secondary): Favorite, Archive, Export Markdown, Share link — one may show amber when active
3) TOC rail sections: Market · Fundamentals · News · Social · Bull · Bear · Judge · Risk — current "Judge" highlighted with amber wash
4) Paper column (max ~48rem feel):
   - H2 section titles weight 600
   - Body long-form paragraphs (fake but realistic research prose about Tencent, no AI clichés)
   - Small mono data callouts inline where numbers appear
5) Persistent quiet risk footer on paper: short disclaimer in Report Quiet — visible, not a screaming banner

Glance test: must look like equity research software, not a blog or Notion page.
```

### Tighten

```text
Make the contrast between dark chrome and Cool Paper sharper. TOC denser. Header more instrument-like with mono ticker dominant. Do not center the article like a lifestyle blog.
```

---

## Screen 3 — Tasks Center (`/tasks`)

**Goal:** Dense job ledger + optional active pipeline. Tables beat cards.

### Screen prompt (paste into Stitch)

```text
Design an authenticated desktop Tasks center for TG Web AI equity research job monitoring.

STRICTLY follow Signal Floor design system (attached):
- Near-black floor #070A0E, panels #0E141B / #151C25, wire borders
- Signal Amber #D97706 for active filter chip, running status, primary emphasis
- Rise/Fall only if a price column appears (optional — can omit prices here)
- Geist + Geist Mono; all IDs, durations, timestamps mono
- Density 8: spreadsheet-like rows ~32–36px; NO card grid of jobs
- No purple, no glow, no emoji, no order tickets

LAYOUT (1440px):
1) Sidebar with Tasks active
2) Main:
   - Title "Tasks" ≤ 1.5rem
   - Filter bar: status segmented control All | Queued | Running | Succeeded | Failed — "Running" selected with amber wash
   - Credits remnant chip top-right: "47 credits" mono
   - Dense full-width table columns:
     Status | Ticker | Exchange | Submitted | Duration | Step | Credits | Open
   - 8–10 rows:
     - 2 Running: amber pulse dot + shimmering thin progress under Step cell
     - 1 Queued: dim meta
     - Several Succeeded: muted
     - 1–2 Failed: Critical Rose status text + short reason "Vendor timeout — credits released"
   - Tickers like AAPL, NVDA, 7203.T, 0700.HK — mono
3) Optional right drawer/panel (~320px) when a running row is selected:
   - Pipeline event list (timestamp mono + event text), amber on latest event
   - No circular hero spinner — use rail shimmer

Empty marketing sections banned. This is an operations pit.
```

### Tighten

```text
Remove any card wrappers around rows. Increase table density. Amber only on Running filter, running dots, and selected pipeline — not decorative backgrounds.
```

---

## After the three screens

Suggested Stitch follow-up order:

1. `Create a shared component library from these screens: sidebar, quote strip, amber button, status pill, data table, credit chip.`
2. `Generate Watchlist page in the same system — quote-first rows with mini sparks.`
3. `Generate Billing / credits ledger — table of credit grants and spends, amber for low-balance warning wash only.`

When exporting to engineering: map tokens to CSS variables in `tg-web/src/frontend/styles/globals.css` using the Quick Token Reference in `DESIGN.md`.

---

## Copy-paste checklist

| # | Screen | Prompt section |
|---|--------|----------------|
| 1 | Analysis Desk | Screen 1 prompt |
| 2 | Report Detail | Screen 2 prompt |
| 3 | Tasks Center | Screen 3 prompt |

Attach `DESIGN.md` once at project level; reuse for all three.
