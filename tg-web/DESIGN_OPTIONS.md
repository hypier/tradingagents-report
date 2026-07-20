# TG Web — Design Style Options

**Product:** TG-web — multi-market AI equity research  
**Status:** **Locked → D · Signal Floor.** Canonical spec: [`DESIGN.md`](./DESIGN.md). This file remains an archive of A/B/C alternatives.

**Shared rules for all options**
- One brand accent only; market Rise/Fall are semantic data colors, not brand
- No AI purple neon, no Inter, no pure `#000`, no 3-equal-card feature rows
- Prices / tickers / credits / timestamps → monospace
- Research only — never order-ticket / buy-sell gamification
- Authenticated app prefers density 6–8; marketing may breathe more

---

## At-a-glance

| | **A · Research Terminal** | **B · Brass Vault** | **C · Carbon Ledger** | **D · Signal Floor ✓ LOCKED** |
|---|---|---|---|---|
| **Mood** | Modern desk after open | Private wealth research | Daytime institutional | Market-floor intensity |
| **Default mode** | Dark | Dark (warm ink) | Light | Near-black |
| **Accent** | Signal Teal `#0D9488` | Muted Brass `#B8952A` | Ink Emerald `#047857` | Caution Amber `#D97706` |
| **Creativity** | 6 | 5 | 5 | 6 |
| **Density** | 7 | 6 | 7 | 8 |
| **Variance** | 5 | 4 | 4 | 5 |
| **Motion** | 5 | 4 | 4 | 6 |
| **Feels premium?** | High / tech | Highest / wealth | High / clean | High / intense |
| **Industry read** | Terminal | Private bank | Workspace | Trading floor |
| **Risk** | Can feel cold | Can feel “luxury SaaS” | Closer to current if soft | Can feel harsh/alarming |
| **Best if you want…** | Bloomberg-modern | Expensive & calm | Light, dense, serious | Strongest market identity |

---

## Style A — Research Terminal

**One-liner:** Private research desk on a cool navy terminal — precise, live, institutional-calm.

### Atmosphere
Ink navy canvas, steel panels, one teal signal for CTAs. Quote strips and job progress feel “on”. Report reading flips to cool paper. Emotional target: *a serious research instrument*.

### Dials
Creativity `6` · Density `7` · Variance `5` · Motion `5`

### Palette
| Role | Token | Hex |
|------|-------|-----|
| Canvas | Terminal Ink | `#0B1220` |
| Panel | Panel Slate | `#121A2B` |
| Surface | Surface Steel | `#1A2438` |
| Text | Primary Ink | `#E8EEF7` |
| Muted | Muted Ledger | `#8B9BB4` |
| Border | Hairline Edge | `rgba(148,163,184,0.18)` |
| Accent | Signal Teal | `#0D9488` |
| Rise / Fall | | `#22A06B` / `#E11D48` |
| Report paper | | `#F4F6F9` |

### Typography
- UI: `Geist` or `Satoshi`
- Data: `Geist Mono` (mandatory for quotes & credits)
- Radius: `10–16px` (terminal-tight, not blob cards)

### Signature UI moments
- Dark shell + teal Run CTA
- Large mono last price in quote strip
- Skeleton shimmer progress (no hero spinner)
- Report mode: paper canvas, dark chrome around it

### Choose A if
You want the clearest break from today’s soft mint SaaS, and users will live in dark mode.

---

## Style B — Brass Vault

**One-liner:** Quiet private-banking research vault — warm charcoal, brass accent, less “hacker”, more “subscription worth paying for”.

### Atmosphere
Warmer deep charcoal (not blue-navy). Brass used sparingly on primary actions and active nav — like metal on a leather desk. Feels expensive without gold-glitter kitsch. Emotional target: *a private desk that charges for access*.

### Dials
Creativity `5` · Density `6` · Variance `4` · Motion `4`

### Palette
| Role | Token | Hex |
|------|-------|-----|
| Canvas | Vault Charcoal | `#14110F` |
| Panel | Smoked Oak | `#1C1917` |
| Surface | Warm Panel | `#292524` |
| Text | Parchment | `#F5F0E8` |
| Muted | Stone Mute | `#A8A29E` |
| Border | Soft Edge | `rgba(214,211,209,0.14)` |
| Accent | Muted Brass | `#B8952A` |
| Accent soft | Brass Wash | `rgba(184,149,42,0.14)` |
| Rise / Fall | | `#16A34A` / `#E11D48` |
| Report paper | Warm Paper | `#FAF7F2` |

> Accent saturation kept muted — brass, not neon gold. No metallic gradients, no glitter.

### Typography
- UI: `Satoshi` (slightly warmer geometric)
- Data: `JetBrains Mono` or `Geist Mono`
- Page titles slightly more weight-driven than size-driven
- Radius: `12–18px` — a touch softer than A, still not pill-blob

### Signature UI moments
- Brass primary button on charcoal (rare — one per region)
- Credit balance as a small “ledger plate” with brass hairline
- Watchlist rows with warm zebra, not blue steel
- Report paper slightly warm; risk footer in stone mute

### Choose B if
You care most about **premium / paid-product** perception and a calmer, wealth-desk vibe over terminal coolness.

---

## Style C — Carbon Ledger

**One-liner:** Daytime institutional workspace — light zinc canvas, ink type, deep emerald accent, dense tables. Serious without living in the dark.

### Atmosphere
Cool light surfaces (zinc, not cream). High contrast ink text. Emerald is deeper and quieter than today’s mint primary. Feels like Refinitiv / professional portfolio tools in light mode. Emotional target: *I can read reports and scan markets all afternoon*.

### Dials
Creativity `5` · Density `7` · Variance `4` · Motion `4`

### Palette
| Role | Token | Hex |
|------|-------|-----|
| Canvas | Ledger Mist | `#F1F5F9` |
| Panel / sidebar | Fog Panel | `#E2E8F0` |
| Surface | Pure Surface | `#FFFFFF` |
| Text | Carbon Ink | `#0F172A` |
| Muted | Slate Mute | `#64748B` |
| Border | Cool Rule | `rgba(15,23,42,0.10)` |
| Accent | Ink Emerald | `#047857` |
| Accent soft | Emerald Wash | `rgba(4,120,87,0.10)` |
| Rise / Fall | | `#15803D` / `#BE123C` |
| Dark optional chrome | | sidebar may stay `#0F172A` with light main |

### Typography
- UI: `Geist` + `Geist Mono`
- Tables denser: row height ~36–40px, mono for all numeric columns
- Radius: `8–12px` — crisp workspace, not soft consumer app

### Signature UI moments
- Light main stage + optional dark slim sidebar (hybrid shell)
- Spreadsheet-like task / credit ledgers
- Quote strip as a flat ruled band, not a floating card
- Report reading: same light family — less mode-switch jarring than A/B

### Choose C if
You want industry density and polish but **prefer light UI**, or your users hate dark-first products. Closest to “upgrade current” rather than “replace with terminal”.

---

## Style D — Signal Floor ✓ LOCKED

**One-liner:** Near-black market floor — highest density, amber as the single brand pulse, data-first hierarchy.  
**Canonical:** Full Stitch-ready spec lives in [`DESIGN.md`](./DESIGN.md).

### Atmosphere
Carbon black-blue canvas, tight panels, amber only for primary action / live / focus. Rise/Fall carry emotion; amber means “attention / go”. Emotional target: *I’m on the floor; the product is an instrument*.

### Dials
Creativity `6` · Density `8` · Variance `5` · Motion `6`

### Palette
| Role | Token | Hex |
|------|-------|-----|
| Canvas | Floor Carbon | `#070A0E` |
| Panel | Pit Panel | `#0E141B` |
| Surface | Pit Surface | `#151C25` |
| Text | Hot Ink | `#F1F5F9` |
| Muted | Dim Meta | `#78879B` |
| Border | Wire Edge | `rgba(148,163,184,0.16)` |
| Accent | Signal Amber | `#D97706` |
| Accent soft | Amber Wash | `rgba(217,119,6,0.14)` |
| Rise / Fall | | `#22C55E` / `#F43F5E` |
| Report paper | Cool Paper | `#EEF2F6` |

### Typography
- UI: `Geist`
- **All numbers mono** (density 8 rule)
- Compact type scale; page title ≤ `1.5rem` in-app
- Radius: `6–10px` — sharp instrument chrome

### Signature UI moments
- Amber Run Analysis button; running jobs get amber pulse dot
- Dense watchlist + mini spark in-row
- Admin overview as tight metric pit (no airy KPI cards)
- Strongest “finance app” glance test — least likely to look like notes/SaaS

### Choose D if
You want maximum industry punch and are OK with a more aggressive, high-information look.

---

## Shared semantic & bans (all styles)

### Market semantics
Store meaning as **Rise / Fall / Flat**. Default mock: Rise green-family, Fall rose-family. Locale adapters may invert for CN conventions.

### Always show
Data **source + as-of time** on quotes. Never claim unscoped “实时”.

### Never
- Purple / violet neon stacks  
- Emoji in chrome  
- “Elevate / Unleash / Seamless / Next-gen” copy  
- Fake `99.99%` stats  
- Order tickets, confetti, giant BUY/SELL  
- Cream `#F4F1EA` + terracotta “AI editorial” combo  
- Inter; generic Georgia/Times serifs in app chrome  

### Screen priority (any style)
1. Analysis composer home  
2. Report detail  
3. Tasks center  
4. Stock / watchlist  
5. Billing credits  
6. Admin overview  

---

## How to pick

Ask yourself:

1. **Dark or light as the daily default?** → A/B/D dark · C light  
2. **Wealth-calm or instrument-sharp?** → B calm · A/D sharp · C clean  
3. **How dense?** → B lighter · A/C medium-high · D max  
4. **Accent personality?** → Teal (tech) · Brass (premium) · Emerald (classic finance) · Amber (alert/live)

**Recommendation if undecided:**  
- Product positioning “AI 投研工具” → **A**  
- Positioning “付费精品研究” → **B**  
- Users mostly daytime / report-heavy → **C**  
- Want strongest break from 素雅 → **D**

---

## Next step

**D is locked.** Stitch pack ready:

- Spec: [`DESIGN.md`](./DESIGN.md)  
- Paste-ready prompts (Home / Report / Tasks): [`docs/STITCH_PROMPTS.md`](./docs/STITCH_PROMPTS.md)  

Other follow-ups: apply tokens to `globals.css`, or generate Watchlist / Billing prompts.
