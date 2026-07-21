# Design System: TG Web — Signal Floor

**Product:** TG-web — multi-market AI equity research for individual investors  
**Skill:** stitch-design-taste  
**Locked style:** **D · Signal Floor** (see alternatives in [`DESIGN_OPTIONS.md`](./DESIGN_OPTIONS.md))  
**Implementation:** Tokens in `src/frontend/styles/globals.css` (dark-first). Page chrome in `src/frontend/components/page-chrome.tsx` + `admin-gate.tsx`. Stitch mocks in `docs/stitch-signal-floor/`.  
**Intent:** Abandon the soft gallery-SaaS look. Ship a near-black, high-density market-floor instrument — finance-first at a glance, research-only (never order tickets).

---

## Configuration — Style Dials

| Dial | Level | Rationale |
|------|-------|-----------|
| **Creativity** | `6` | Distinctive instrument chrome; still trustworthy for money-adjacent UX. |
| **Density** | `8` | Cockpit-dense: quotes, sparks, tasks, credits share the viewport without airy voids. |
| **Variance** | `5` | Stable shell; content may split asymmetrically (composer + pipeline, report + TOC). |
| **Motion Intent** | `6` | Live floor pulse — progress shimmer, running dots, tick updates. Never cinematic fluff. |

> **How to use:** Feed this entire document to Google Stitch as the single visual source of truth. Default chrome is near-black; light **Cool Paper** is reserved for long-form report reading.

---

## 1. Visual Theme & Atmosphere

TG Web should feel like a **market floor research pit** — carbon panels, wire-thin rules, amber as the only “go / live / focus” pulse. Rise and Fall carry direction; amber means attention and action.

Atmosphere keywords: **carbon, wireframe precision, live signal, dense ledger, instrument gravity**.

- Density Level 8: compact type, tight row heights, tables over cards, minimal decorative whitespace.
- Variance Level 5: nav predictable; workspaces may be uneven 2-pane splits.
- Motion Level 6: perpetual micro-loops on running jobs and live quotes — opacity/transform only.

Emotional target: *"I'm on the floor; this product is an instrument."*

Brand presence: **TG** / **TradingAgents** is a primary lockup in the sidebar and report header — must pass the remove-the-nav brand test on marketing surfaces.

Not this: Notion-soft mint, purple AI glow, private-bank brass luxury, retail BUY/SELL casino UI.

---

## 2. Color Palette & Roles

One cool carbon-neutral system. Do not mix warm cream with cool slate.

### Core neutrals (product chrome — default)

- **Floor Carbon** (#070A0E) — Primary app canvas. Near-black with blue undertone — never pure `#000000`
- **Pit Panel** (#0E141B) — Sidebar, sticky headers, elevated chrome
- **Pit Surface** (#151C25) — Cards, dialogs, popovers, input wells
- **Wire Edge** (rgba(148,163,184,0.16)) — 1px borders, table rules, section dividers
- **Hot Ink** (#F1F5F9) — Primary text on dark surfaces
- **Dim Meta** (#78879B) — Secondary copy, labels, helper text
- **Ghost Meta** (#5B6B7F) — Timestamps, data-source footnotes, disabled chrome

### Light reading surface (reports only)

- **Cool Paper / Light** — Canvas `#FFFFFF`; panels `#F4F6F9`. Borders ≥18% ink; Dim Meta `#3F4B5B` for secondary text contrast.
- **Report Ink** (#0F172A) — Body text on paper
- **Report Quiet** (#475569) — Secondary report metadata

### Single accent (ONE — do not add a second brand accent)

- **Signal Amber** (#D97706) — Primary CTAs, focus rings, active nav, selected chips, “running / live” emphasis  
  Soft wash: **Amber Wash** `rgba(217,119,6,0.14)`  
  Saturation under 80%. No outer glow. No gradient button fills.  
  Note: Amber is brand *and* caution language — use intensity carefully: solid for CTA, wash for selected/live, never paint entire screens amber.

### Semantic market colors (NOT brand accents — data only)

- **Market Rise** (#22C55E) — Positive change (default green-up for multi-market mockups)
- **Market Rise Soft** (rgba(34,197,94,0.14))
- **Market Fall** (#F43F5E) — Negative change
- **Market Fall Soft** (rgba(244,63,94,0.14))
- **Market Flat** (#94A3B8) — Unchanged

> **Locale note:** Store semantics as Rise/Fall/Flat. CN adapters may invert display mapping. Stitch mocks use Rise green / Fall rose by default.

### Status & risk (supporting)

- **Critical Rose** (#F43F5E) — Errors, failed jobs, destructive confirms (aligns with Fall family)
- **Info Steel** (#38BDF8) — Informational callouts only — never primary CTA
- Do **not** invent a second amber for warnings — reuse Signal Amber wash + Dim Meta copy for stale data / low credits

### Banned colors

- AI Purple / violet neon (`#7C3AED`, indigo glow stacks)
- Pure black `#000000`
- Warm cream `#F4F1EA` + terracotta pairs
- Signal Teal as brand (that was Style A — locked out)
- Brass/gold luxury stacks (Style B)
- Oversaturated neon lime or electric cyan
- Mixed warm/cool gray systems on one screen

---

## 3. Typography Rules

Density 8 mandate: **all numbers are monospace** — prices, percents, credits, timestamps, IDs, quantities.

- **Display / UI headings:** `Geist` — track-tight (`-0.02em`), weight 600–700. In-app page titles ~`18–22px`. Hierarchy via weight and color.
- **Body / UI:** `Geist` weight 400–500 — root / body **`14px`**, leading `1.45–1.55`. Prose blocks max ~65ch.
- **Mono:** `Geist Mono` — tabular figures. Tables `11–13px`; hero quote price ~`22–28px`.
- **Report long-form:** `Geist` `1.0625rem`, leading `1.65–1.7` on Cool Paper. Section titles weight 600. No prestige serif.

### Type behaviors

- **Instrument identity (lists, quote, headers):** company **name on top** (Geist, medium/semibold); **ticker code below** (Geist Mono, Dim Meta, tracking `0.04em`). Never ticker-above-name. If name is missing, ticker occupies the primary line only.
- Tickers: mono, slight tracking (`0.04em`); pair with exchange badge in headers / quote chrome — not as a substitute for the name row
- Moves: mono + Rise/Fall + explicit sign (`+1.24%` / `-0.86%`) — no fake `99.99%`
- Credits: mono numerals + Dim Meta label; low balance → Amber Wash chip + Signal Amber text
- **Dates / timestamps:** localize via `format-locale` helpers. **Omit the year when the value is in the current local year** (e.g. `Jul 21` / `7月21日`); keep the year for prior/future years. Apply to job times, quote as-of, trade dates, billing cycles, and admin ledgers — not to raw `<input type="date">` values.

### Banned fonts

- `Inter`
- Generic serifs (`Georgia`, `Times New Roman`, `Garamond`, `Palatino`)
- Soft rounded display fonts that read as consumer SaaS

---

## 4. Component Stylings

### Buttons

- Primary: Signal Amber fill (`#D97706`), text `#0C0A09` or `#070A0E` (high contrast on amber). Radius `0` (rectangular). No glow. Hover: slightly lighter amber. Active: `translateY(1px)` + `scale(0.98)`.
- Secondary: transparent + Wire Edge, Hot Ink text. Hover: Pit Surface fill.
- Destructive: Critical Rose outline or soft fill — never amber.
- Disabled: Ghost Meta, no strong fill.
- Max **one** primary CTA per task region (e.g. “Run analysis”).

### Cards & panels

- Prefer **flat pit surfaces** and ruled rows over floating soft cards.
- Radius `0` — rectangular instrument chrome (no soft corners).
- Fill: Pit Surface on Floor Carbon. Border: Wire Edge. Shadow: deep carbon (`0 10px 28px -12px rgba(0,0,0,0.55)`), minimal — elevation is rare.
- Lists (tasks, watchlists, admin, ledgers, report library): **no cards** — hairline rows, optional zebra `rgba(148,163,184,0.04)`, row height ~40–44px.
- Interactive plan / checkout tiles may keep a bordered panel; default sections use **SectionPanel** (ruled title + body), not soft elevated cards.

### Page chrome (authenticated app)

Every standard page follows one composition — do not invent a second title style per route.

| Piece | Rule |
|-------|------|
| **Page title** | One ruled `h1` in the page body: `text-xl` (~20px), weight 600, track-tight. Optional one-line Dim Meta subtitle under it. |
| **Title row** | `border-b` Wire Edge; padding `px-5 py-3.5` (`lg:px-6`). Actions (if any) sit end-aligned on the same row. |
| **Toolbar** | Optional filter / tab strip **flush under** the title row, separated by `border-t`. Same horizontal padding. Not a floating card. |
| **Body** | Scrollable column; default padding `px-5 py-5` (`lg:px-6`), gap `1.25rem`. Flush tables may drop body padding (`gap-0 p-0`). |
| **Site header title** | Suppressed when the page owns its `h1` (desk, tasks, reports, watchlist, billing, account, stock, admin, report detail). Header keeps utilities only: theme, language, account / sign out. |
| **Split workspaces** | Research desk & tasks may keep a custom ruled header inside the main pane; right rail is pipeline / recent runs — not a second page title. |

**Anti-pattern:** Icon + eyebrow + `text-2xl`/`text-3xl` floating headers; duplicate titles in site header and page; wrapping every section in a rounded Card.

### Instrument logos & identity (lists & tables)

Canonical size matches the research-desk recent-runs rail — **reuse everywhere jobs/instruments appear in rows**.

- Box: **`28×28px`** (`size-8`). Square — `border-radius: 0` (override Avatar’s default circle).
- Fallback: first letter, `text-xs`, weight 600, Pit Surface / Amber Wash as needed.
- Used in: research-desk recent rail, **tasks center** table, **report library** table, and any dense job/instrument row.
- Do **not** use `size-sm` (24px) or circular logos in those tables.
- Stock / report detail headers may use a slightly larger square mark (`~44px`); still rectangular, never soft-rounded pills.
- Beside the logo: **`InstrumentIdentity`** — name above, ticker below (see Type behaviors). Same stack in quote strip, ticker search selection, watchlist, pipeline active job, report headers, and admin job tables.

### Inputs & forms

- Label above; helper Dim Meta; error Critical Rose below.
- Control height: default **`h-11`** for text inputs, selects, and date fields — keep them aligned in one toolbar row.
- Wells: recessed Floor Carbon / Pit Panel, Wire Edge, focus ring `2px` Signal Amber at ~40% opacity.
- Ticker search: mono typed codes; results = **company name (sans) on top** + symbol/exchange (mono) below + **square** logo thumb. Selected instrument hint uses the same stack.
- Analyst chips: selected = Amber Wash + amber text — dense rectangular chips with short description; not oversized filled pills.
- Interactive controls (buttons, toggles, clickable rows): **`cursor: pointer`**.

### Data display (industry signature)

- **Quote strip:** sits under ticker search on the desk (not in the right rail). Instrument = name above + ticker below (not a side-by-side name/badge). Large mono last price + absolute change + percent (`+16.20 (+3.51%)`) + Rise/Fall + exchange + source + as-of (Ghost Meta). Always freshness — never unscoped “realtime”.
- **Delay / freshness:** prefer TradingView `update_mode` (e.g. `delayed_streaming_900` → “延迟 15m” / “Delayed 15m”). Stale copy pairs age with Dim Meta.
- **In-row mini spark:** dim steel stroke; optional Rise/Fall end segment. No neon area fills.
- **Credit / metric tiles:** compact bordered StatTile — Dim Meta label + mono/semibold value (`text-2xl` tabular). Optional icon + hint line. Prefer tiles over nested Card headers for usage grids.
- **Job progress:** dense step rail or thin bar with amber shimmer when running; amber pulse dot on “running”. No hero circular spinner.
- **Status tabs** (tasks): underline / border-bottom active state — not pill clusters.

### Navigation & shell

- Desktop left sidebar: Pit Panel, tight item spacing, brand lockup top.
- Nav items: brighter readable text (`~85%` of Hot Ink), denser hit target (`h-11`, body `text-base`). Admin is a **separate flat group**, not nested under Account.
- Top bar: utilities only when the page owns the title (theme, language, Clerk account, Sign out). No pill-stat clutter.
- Mobile: single column + sheet menu; touch targets ≥ 44px.

### Loaders, empty, error

- Skeleton shimmer in carbon/steel matching exact layout — quote, table, report outline.
- Empty: factual headline + one action. No emoji.
- Error: inline alert, Critical Rose left rule, recovery CTA.

### Report surfaces

- Flip main canvas to Cool Paper for reading; chrome may stay dark.
- Sticky header: ticker mono + decision badge.
- TOC as left rail or compact tabs — not equal card walls.
- Risk disclaimer: persistent quiet footer (Dim Meta) — visible, not screaming.

---

## 5. Hero & First Impression (marketing / signed-out)

- Asymmetric split: brand + one headline + one sentence + one amber CTA; opposite side = live floor composition (quote strip, dense watchlist fragment, agent pipeline).
- Brand name hero-level.
- Optional inline type-height chart glyph between words (Creativity 6) — no overlapping layers.
- Banned: centered SaaS hero, scroll arrows, 3 equal feature cards as first content, promo stickers on imagery.
- Authenticated home is a **working pit**, not a marketing hero: composer + quote strip dominant; tasks/reports flank densely.

---

## 6. Layout Principles

- Shell: CSS Grid `sidebar | main`. Main gaps `0.75rem–1.25rem` (density 8).
- Workspaces: 2-pane `minmax(0, 1.15fr) minmax(0, 0.85fr)` — avoid 3 equal card columns.
- App containment `max-width: 1440px`; report prose `max-width: 48rem`.
- `min-height: 100dvh` — never `100vh`.
- No overlapping content stacks.
- Tables over cards for tasks, report library, users, audit, credits.
- Admin overview = tight metric pit (StatTile grid) / uneven bento (2fr / 1fr) — each tile one job, amber accent only on interactive/live bits.
- Standard routes compose as **PageFrame** = PageHeader (+ optional PageToolbar) + PageBody. Admin routes wrap with **AdminGate** (loading skeleton → access denied → content) so every admin screen shares one access chrome.

---

## 7. Responsive Rules

Hard requirement: **375 / 768 / 1440**.

- `<768px`: stack all splits; sidebar → sheet; quote stacks price above meta.
- No page-level horizontal scroll; tables may scroll internally with sticky ticker column.
- `clamp()` titles; body ≥ `1rem` on mobile.
- Vertical rhythm: `clamp(0.75rem, 2vw, 1.25rem)` in-app.

---

## 8. Motion & Interaction

Spring default: **stiffness 140, damping 22** — snappier floor feel.

- List enter: opacity + `translateY(4px)`, 30–50ms stagger.
- Quote tick: crossfade / subtle y-nudge — no bounce.
- Running job: amber shimmer on rail + infinite opacity pulse on status dot.
- Hover: border brighten / surface lift — never neon glow or scale pop.
- Animate only `transform` and `opacity`. Optional film grain on Floor Carbon ≤ 3% opacity.

---

## 9. Content & Industry Voice (for Stitch copy)

Floor language, not startup landing copy.

- Prefer: "Run analysis", "Credits remaining", "Data as of", "Source", "Exchange", "Running", "Job failed — credits released"
- Avoid: "Elevate", "Unleash", "Seamless", "Next-gen", "Intelligent insights"
- Avoid fake precision and generic names — use `AAPL`, `0700.HK`, `7203.T`
- Always pair quotes with **source + timestamp**
- No emoji in UI or mock copy

---

## 10. Anti-Patterns (Banned)

- Soft mint-on-white spa/SaaS emptiness
- Gallery-airy dashboards and huge unused whitespace
- `Inter`; generic serifs in chrome
- Pure `#000000`
- Purple AI neon / glow buttons
- Second brand accent; teal or brass as primary (other style locks)
- 3 equal feature cards as default
- Centered marketing hero
- Pill clusters, emoji status, custom cursors
- Circular spinner as the only loader
- Overlapping text/image stacks; scroll-to-explore chrome
- Unscoped “realtime” claims
- Confetti, giant BUY/SELL, order tickets — research only
- Painting whole screens amber (accent starvation kills hierarchy)
- Duplicate page titles (site header + page `h1` + in-content eyebrow)
- Circular / soft-rounded logos in dense job tables; mismatched logo sizes across desk / tasks / library
- Ticker above company name (or ticker-only badge replacing the name row) in instrument lists / quote / headers
- Card-wrapped filter toolbars; oversized floating page headers with decorative icons

---

## 11. Screen Priorities for Stitch Generation

1. **Authenticated home / analysis composer** — search, quote strip, analysts, credit estimate, amber Run CTA, dense recent jobs  
2. **Report detail** — Cool Paper reading, TOC rail, decision summary, risk footer  
3. **Tasks center** — dense status table, amber running states, failure reasons  
4. **Watchlist / stock detail** — quote-first + in-row sparks  
5. **Billing / credits** — ledger table clarity  
6. **Admin overview** — metric pit, amber only on live/action affordances  

Glance test: *With logo removed, does this still read as equity research software?* If it could be notes or generic AI chat, redesign denser and more data-forward.

---

## 12. Quick Token Reference

| Token | Value | Role |
|-------|-------|------|
| Canvas | `#070A0E` | App background |
| Panel | `#0E141B` | Sidebar / chrome |
| Surface | `#151C25` | Cards / wells |
| Text | `#F1F5F9` | Primary text |
| Muted | `#78879B` | Secondary text |
| Border | `rgba(148,163,184,0.16)` | Hairlines |
| Accent | `#D97706` | Sole CTA / live / focus |
| Accent wash | `rgba(217,119,6,0.14)` | Selected / soft live |
| Rise | `#22C55E` | Positive data |
| Fall | `#F43F5E` | Negative data |
| Report bg | `#EEF2F6` | Long-form reading |
| Radius | `0` | Rectangular controls / panels |
| Font UI | Geist | Headings + body |
| Font Data | Geist Mono | All numbers, tickers, credits |
| Logo (row) | `28×28` square | Tasks, library, desk rail |
| Control h | `44px` (`h-11`) | Input / select / date |
| Page title | `text-xl` / 600 | Ruled PageHeader only |

---

## 13. Implementation Map (code)

Keep design rules above authoritative; this section maps them to `tg-web` modules so agents do not re-invent chrome.

| Concern | Module / pattern |
|---------|------------------|
| Tokens, dark/light | `src/frontend/styles/globals.css`, `lib/theme.ts` |
| PageHeader / PageToolbar / PageBody / PageFrame / SectionPanel / StatTile | `src/frontend/components/page-chrome.tsx` |
| Admin loading + access gate | `src/frontend/components/admin-gate.tsx` |
| Site header title suppression | `site-header.tsx` → `pageOwnsTitle()` |
| Quote strip + delay freshness | `dashboard/quote-strip.tsx`, `lib/snapshot-freshness.ts` |
| Locale dates (omit current year) | `lib/format-locale.ts` — `formatLocaleDate*`, `formatLocaleCalendarDate` |
| Instrument name / ticker stack | `components/instrument-identity.tsx` — name above, ticker below |
| Job / report rows (rail + full table) | `dashboard/recent-reports.tsx` — logos `size-8` square + `InstrumentIdentity` in **both** densities |
| Research desk layout | `pages/home-page.tsx` — search → quote strip → analysts → sticky Run; rail = pipeline + recent |
| Tasks / report library tables | `pages/tasks-page.tsx`, `pages/reports-page.tsx` via `ReportsTable` |

When adding a page: use **PageFrame** (or the same ruled header classes), square `28px` logos in rows, **name-above / ticker-below** for instruments, tables over cards, and do not reintroduce a site-header + page double title.
