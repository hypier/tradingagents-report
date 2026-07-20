# Design System: TG Web — Research Terminal

**Product:** TG-web — multi-market AI equity research for individual investors  
**Skill:** stitch-design-taste  
**Intent:** Replace the current soft, gallery-minimal SaaS look with a premium research-terminal identity that reads as finance-first, not generic productivity software.

---

## Configuration — Style Dials

| Dial | Level | Rationale |
|------|-------|-----------|
| **Creativity** | `6` | Distinctive enough to feel crafted; still trustworthy for money-adjacent UX. No editorial chaos. |
| **Density** | `7` | Research cockpit: quotes, tasks, credit meters, and report structure must coexist without feeling sparse. |
| **Variance** | `5` | Controlled asymmetry (split workspaces, offset report headers). Predictable navigation; expressive content panels. |
| **Motion Intent** | `5` | Fluid, weighty micro-motion. Markets feel alive; never cinematic or playful. |

> **How to use:** Feed this entire document to Google Stitch as the visual source of truth when generating screens. Prefer dark-forward product chrome; light surfaces are reserved for long-form report reading.

---

## 1. Visual Theme & Atmosphere

TG Web should feel like a **private research desk after market open** — not a Notion clone, not a purple AI dashboard, not a retail brokerage gamified ticker wall.

Atmosphere keywords: **ink, precision, institutional calm, live data pulse, editorial report gravity**.

- Density sits at cockpit-balanced (Level 7): information is present and legible, whitespace is intentional breathing room between data clusters — never empty luxury voids.
- Variance is moderate (Level 5): shell and nav stay stable; content regions may use asymmetric splits (quote strip + analysis composer, report TOC + long-form column).
- Motion is restrained fluid (Level 5): prices tick, progress shimmers, panels cascade in — nothing theatrical.

Emotional target: *"This is a serious research instrument I trust with my attention and subscription credits."*

Brand presence: product name **TG** / **TradingAgents** must read as a primary identity signal in authenticated chrome (sidebar brand lockup, report header), not a tiny nav label.

---

## 2. Color Palette & Roles

Stick to **one cool-neutral ink system** across the product. Do not mix warm cream and cool slate.

### Core neutrals (product chrome — default dark)

- **Terminal Ink** (#0B1220) — Primary app canvas. Deep navy-charcoal, never pure black `#000000`
- **Panel Slate** (#121A2B) — Sidebar, elevated panels, sticky headers
- **Surface Steel** (#1A2438) — Cards, dialogs, popovers, input wells
- **Hairline Edge** (rgba(148,163,184,0.18)) — 1px borders, table rules, section dividers
- **Primary Ink** (#E8EEF7) — Primary text on dark surfaces
- **Muted Ledger** (#8B9BB4) — Secondary copy, labels, helper text
- **Ghost Meta** (#64748B) — Timestamps, data-source footnotes, disabled chrome

### Light reading surface (reports only)

- **Report Paper** (#F4F6F9) — Long-form report reading canvas (not cream, not pure white)
- **Report Ink** (#0F172A) — Body text on report paper
- **Report Quiet** (#475569) — Secondary report metadata

### Single accent (ONE — do not add a second brand accent)

- **Signal Teal** (#0D9488) — Primary CTAs, focus rings, active nav, selected chips, progress emphasis  
  Saturation kept under 80%. No glow. No gradient fill on buttons.

### Semantic market colors (NOT brand accents — data only)

Use for price change, P&L deltas, and directional badges only. Never as primary button fill.

- **Market Rise** (#22A06B) — Positive change when locale convention is green-up (default for multi-market US/JP-style UX unless locale overrides)
- **Market Rise Soft** (rgba(34,160,107,0.14)) — Positive row/chip background
- **Market Fall** (#E11D48) — Negative change
- **Market Fall Soft** (rgba(225,29,72,0.14)) — Negative row/chip background
- **Market Flat** (#94A3B8) — Unchanged / zero move

> **Locale note for implementers:** A-share / CN conventions may invert red-up / green-down. The design system stores semantics as Rise/Fall, not Red/Green. Locale adapters remap display colors; Stitch mockups may use Rise=teal-green / Fall=rose as the default visual.

### Status & risk (supporting, not accents)

- **Caution Amber** (#D97706) — Warnings, stale data, credit-low
- **Critical Rose** (#E11D48) — Errors, failed jobs, destructive confirms
- **Info Steel** (#38BDF8) — Informational callouts only (links to docs, data freshness tips) — never primary CTA

### Banned colors

- AI Purple / violet neon gradients (`#7C3AED`, indigo glow stacks)
- Pure black `#000000` canvases
- Warm cream `#F4F1EA` + terracotta accent pairs
- Oversaturated neon cyan or electric lime
- Mixing warm gray and cool gray in one screen

---

## 3. Typography Rules

Finance products earn trust through **numeric clarity** and **editorial report hierarchy**. Dashboard UI is sans + mono only. Serif is banned in app chrome.

- **Display / UI headings:** `Satoshi` or `Geist` — track-tight (`-0.02em` to `-0.03em`), weight 600–700. Hierarchy via weight and color contrast, not oversized scream. Scale: `clamp(1.5rem, 2.2vw, 2rem)` for page titles; larger only on marketing/landing if present.
- **Body / UI:** Same sans family, weight 400–500 — leading `1.55`, max ~65ch for prose blocks. Color: Primary Ink on dark / Report Ink on paper.
- **Mono (mandatory for market data):** `Geist Mono` or `JetBrains Mono` — **all prices, percents, credit balances, timestamps, ticker codes, exchange IDs, job IDs**. Tabular figures. Size `0.8125rem–0.9375rem` in dense tables; `1.25rem–1.75rem` for hero quote price.
- **Report long-form:** Same sans as UI (or `Satoshi`) at `1.0625rem`, leading `1.7`. Section titles weight 600. No decorative serif for "prestige."

### Type behaviors

- Ticker symbols: mono, uppercase tracking slight (`0.04em`), always paired with exchange badge
- Percent moves: mono + Rise/Fall color; include sign (`+1.24%` / `-0.86%`) — never fake round numbers like `99.99%`
- Credit meters: mono numerals + muted label; low-credit uses Caution Amber

### Banned fonts

- `Inter` everywhere
- Generic serifs (`Georgia`, `Times New Roman`, `Garamond`, `Palatino`)
- Playful display fonts, handwritten fonts, neo-grotesk clichés that read as "AI SaaS"

---

## 4. Component Stylings

### Buttons

- Primary: Signal Teal fill (`#0D9488`), text `#F0FDFA`, radius `0.625rem` (10px). No outer glow. Hover: slightly lighter teal. Active: `translateY(1px)` + `scale(0.98)` tactile press.
- Secondary: transparent with Hairline Edge border, Primary Ink text. Hover: Surface Steel fill.
- Destructive: Critical Rose outline or soft fill — never teal.
- Disabled: Ghost Meta text, no strong fill.
- Max one primary CTA per primary task region (e.g. "Run analysis").

### Cards & panels

- Prefer **panel surfaces** over soft white floating cards. Radius `0.75rem–1rem` (12–16px) — not pill-round 2.5rem blobs.
- Fill: Surface Steel on Terminal Ink. Border: Hairline Edge. Shadow: soft navy-tinted (`0 12px 32px -12px rgba(2,8,23,0.55)`), never gray drop-shadow on dark.
- High-density lists (tasks, watchlists, admin tables): **no cards** — use full-bleed rows with top/bottom hairlines and zebra-optional `rgba(148,163,184,0.04)`.
- Marketing/landing may use larger radius; authenticated app stays tighter and more terminal-like.

### Inputs & forms

- Label above field (not floating). Helper muted below. Error Critical Rose below.
- Input well: slightly recessed (`#0F172A` / Panel Slate), Hairline Edge, focus ring `2px` Signal Teal at 40% opacity offset.
- Ticker search: mono for typed codes; results show company name (sans) + symbol/exchange (mono).
- Analyst toggles: segmented control or chip group — selected chip uses Signal Teal soft fill + teal text, not heavy filled pills everywhere.

### Data display (industry signature)

- **Quote strip:** large mono last price + Rise/Fall delta + exchange + data source + "as of" timestamp (Ghost Meta). Always show freshness — never claim "realtime" without source latency.
- **Spark/mini chart:** muted steel line; Rise/Fall stroke only for the move segment if needed. No neon area fills.
- **Credit / subscription chip:** compact ledger style — remaining credits mono, cycle end date muted.
- **Job progress:** horizontal skeletal bar or step rail with shimmer; current step label in sans; avoid circular spinners as the primary loader.

### Navigation & shell

- Persistent left sidebar on desktop: Panel Slate, brand lockup top, primary routes with quiet icons, admin section visually separated.
- Top bar: contextual page title + utility cluster (language, theme if kept, account). Avoid cluttered pill clusters.
- Mobile: collapse to single-column + clean sheet menu. Touch targets ≥ 44px.

### Loaders, empty, error

- Loaders: skeleton blocks matching quote strip / table / report outline — shimmer in steel tones. No generic centered circular spinner as the hero loading state.
- Empty states: composed layout — short factual headline + one action ("Add a watchlist symbol", "Run your first analysis"). No emoji. No "Nothing here yet ✨".
- Errors: inline Alert with Critical Rose border/left rule, plain language, recovery CTA.

### Report surfaces

- Switch to Report Paper background for reading mode.
- Sticky report header on dark or paper with ticker mono + decision summary badge.
- Section navigation as left rail or top tabs — not a wall of equal cards.
- Risk disclaimer: quiet but persistent footer band in Ghost Meta / muted — never buried, never screaming banner unless legally required.

---

## 5. Hero & First Impression (marketing / signed-out)

When generating landing or promo screens:

- Asymmetric split preferred: left brand + one headline + one supporting sentence + one CTA; right a live-feeling research composition (quote strip + partial report outline + agent pipeline), not stock-photo collage.
- Brand name is hero-level — must survive the "remove the nav" brand test.
- Inline image typography optional at Creativity 6: small chart thumbnail or exchange glyph between words — type-height, rounded `0.375rem`, never overlapping text.
- Banned: centered generic SaaS hero, "Scroll to explore", bouncing chevrons, floating promo stickers on imagery, 3 equal feature cards under the fold as the first content pattern.
- CTA: single primary — e.g. "Start research" / "查看分析额度". No secondary "Learn more" clutter.

Authenticated home is **not** a marketing hero — it is a working desk: search/composer dominant, recent reports and running tasks flanking.

---

## 6. Layout Principles

- **Shell:** CSS Grid — `sidebar | main`. Main contains stacked regions with consistent `1.25rem–1.75rem` gaps at density 7.
- **Workspaces:** Prefer 2-pane splits (`minmax(0, 1.1fr) minmax(0, 0.9fr)`) for analyze + pipeline, or report + outline. Avoid equal 3-column card rows.
- **Containment:** Main content `max-width: 1440px` for app; report reading column `max-width: 48rem` for prose comfort.
- **Full height:** `min-height: 100dvh` — never `100vh`.
- **No overlapping content layers.** Charts and badges sit in their own cells; no absolute text over hero media in product UI.
- **Tables over cards** for tasks, admin users, audit logs, credit ledgers.
- **Bento only** for overview dashboards (admin home): uneven tiles (2fr / 1fr), each tile one metric job — not decorative.

---

## 7. Responsive Rules

Hard requirement — every Stitch screen must consider **375 / 768 / 1440**.

- `<768px`: all multi-column splits stack to one column. Sidebar becomes sheet/drawer. Quote strip stacks price above meta.
- No horizontal page scroll. Tables may use internal horizontal scroll with sticky first column for ticker.
- Headlines via `clamp()`. Body ≥ `1rem` on mobile.
- Inline hero images (if any) stack under headline on mobile.
- Section vertical rhythm: `clamp(1.25rem, 3vw, 2rem)` inside app; larger only on marketing.

---

## 8. Motion & Interaction

Spring physics default: **stiffness 120, damping 22** — slightly snappier than gallery apps, still weighty.

- Page/region enter: short opacity + `translateY(6px)` cascade (40–60ms stagger) for lists.
- Quote updates: number crossfade or subtle tick — no bouncing.
- Running analysis: perpetual shimmer on progress rail + soft pulse on "running" status dot (opacity only).
- Hover: background shift / border brighten — never neon glow or scale explosion.
- Animate **only** `transform` and `opacity`. Grain/noise, if used, on fixed pseudo-element at ≤4% opacity over Terminal Ink — optional atmosphere, not a gimmick.

---

## 9. Content & Industry Voice (for Stitch copy)

Write like a research desk, not a startup landing page.

- Prefer: "Run analysis", "Credits remaining", "Data as of", "Source", "Exchange", "Job failed — credits released"
- Avoid AI clichés: "Elevate", "Unleash", "Seamless", "Next-gen", "Intelligent insights"
- Avoid fake precision: `99.99%` win rates, `50%` faster claims
- Avoid generic names: use plausible tickers (`AAPL`, `0700.HK`, `7203.T`) and company names — never "Acme" / "John Doe"
- Always pair market data with **source + timestamp** in UI chrome
- Emojis banned in product UI and mock copy

---

## 10. Anti-Patterns (Banned)

- Soft mint-on-white "wellness SaaS" emptiness that currently makes TG feel underbuilt
- Gallery-airy sparse dashboards with huge unused whitespace
- `Inter` font; generic serifs in app chrome
- Pure black `#000000`
- Purple/violet AI neon gradients and glow buttons
- Oversaturated accents; second brand accent color
- 3 equal feature cards in a row as the default section
- Centered marketing hero when variance dial is ≥5
- Pill clusters, stat-strip clutter, emoji status
- Custom mouse cursors
- Circular spinner as the only loading language
- Overlapping text/image stacks
- "Scroll to explore" / swipe hints / bouncing chevrons
- Claiming realtime without latency/source labeling
- Trading-game visual language (confetti, giant green buy buttons, casino contrast)
- Fake brokerage / order-ticket UI — this product does **research only**, never order entry

---

## 11. Screen Priorities for Stitch Generation

Generate in this order when redesigning:

1. **Authenticated home / analysis composer** — ticker search, quote strip, analyst selection, credit estimate, primary Run CTA, recent jobs
2. **Report detail** — paper reading mode, section rail, decision summary, risk footer
3. **Tasks center** — dense status table, progress, failure reasons
4. **Watchlist / stock detail** — quote-first identity
5. **Billing / credits** — ledger clarity, not marketing fluff
6. **Admin overview** — cockpit metrics bento (still teal accent, still no purple)

Each screen must pass: *Would a user recognize this as equity research software with the logo removed?* If it could be a notes app or generic AI chat, redesign.

---

## 12. Quick Token Reference

| Token | Value | Role |
|-------|-------|------|
| Canvas | `#0B1220` | App background |
| Panel | `#121A2B` | Sidebar / chrome |
| Surface | `#1A2438` | Cards / wells |
| Text | `#E8EEF7` | Primary text |
| Muted | `#8B9BB4` | Secondary text |
| Border | `rgba(148,163,184,0.18)` | Hairlines |
| Accent | `#0D9488` | Sole CTA / focus |
| Rise | `#22A06B` | Positive data |
| Fall | `#E11D48` | Negative data |
| Report bg | `#F4F6F9` | Long-form reading |
| Radius | `10–16px` | Controls / panels |
| Font UI | Satoshi / Geist | Headings + body |
| Font Data | Geist Mono | Prices, tickers, credits |
