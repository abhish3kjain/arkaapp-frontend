# Arka Design Tokens — v1
 
**Status:** Active · **Scope:** `ArkaClubApp` member app (current build v103 → v104 after Phase 5)
**Established by:** Visual Design & Branding pass — Phase 0 (doc), Phases 1–2 (token layer + accent + muted-text AA fix), Phase 3 (structural neutrals + faint-text AA fix), Phase 3b (`#bdc3c7` role-split), Phase 5 (type-family tokens + quote font).
 
> **Why this exists.** The app had **no central colour or type system** — the brand accent `#A984BA` was hardcoded 220 times, the muted-text grey `#7f8c8d` 285 times, and font stacks were repeated inline. Any change was a 200+ edit find-replace, contrast couldn't be fixed in one place, and dark mode was impossible. These tokens make colour and type a single source of truth. **All new UI (including the Reading Personality profile card) must use these tokens, never fresh hex literals or font stacks.**
 
---
 
## 1. Colour tokens (Phases 1–3b)
 
In a single `:root` block at the top of the `<style>` element.
 
| Token | Value | Replaced literal | Migrated | Purpose |
|---|---|---|---|---|
| `--arka-accent` | `#A984BA` | `#A984BA` | 220 | Primary brand purple — buttons, active states, accents, links. |
| `--arka-accent-hover` | `#8b6ba0` | `#8b6ba0` | 18 | Hover / pressed state for accent surfaces. |
| `--text-strong` | `#2c3e50` | `#2c3e50` | 262 | Primary text, headings, "Midnight Blue" UI text. Value unchanged. |
| `--text-muted` | `#5b6b6e` | `#7f8c8d` | 285 | Secondary text, labels, timestamps. **Darkened** for AA. |
| `--surface-alt` | `#f8f9fa` | `#f8f9fa` | 55 | Secondary background / subtle fill. Value unchanged. |
| `--border-soft` | `#ecf0f1` | `#ecf0f1` | 207 | Hairline borders + soft fills. Value unchanged. |
| `--text-faint` | `#6a7878` | `#95a5a6` (Ph3) + `#bdc3c7`-as-text (Ph3b) | 136 + 71 | Tertiary / faint text. **Darkened** for AA. |
| `--neutral-mid` | `#bdc3c7` | `#bdc3c7`-as-structural (Ph3b) | 25 | Mid grey — stronger borders, dividers, node dots, neutral-state fills. Value unchanged. |
 
## 2. Type tokens (Phase 5)
 
| Token | Value | Replaced stack | Migrated | Purpose |
|---|---|---|---|---|
| `--font-body` | `'Segoe UI', Tahoma, Geneva, Verdana, sans-serif` | same | 2 (rest inherit) | Default UI / body text. |
| `--font-display` | `'Cinzel', serif` | `'Cinzel', serif` (all variants) | 21 | Ceremonial chrome — header title, Our Story, Hall of Fame, avatar initials. **See note below.** |
| `--font-quote` | `'Merriweather', Georgia, serif` | `'Cinzel', serif` (quote only) | 2 | Daily-quote card (`.quote-text`, `.quote-mark`) — readable on-screen serif. |
 
### The `:root` block (authoritative copy)
 
```css
:root {
  /* === Arka Design Tokens v1 — see Arka_Design_Tokens_v1.md === */
  /* Brand accent */
  --arka-accent: #A984BA;        /* primary brand purple */
  --arka-accent-hover: #8b6ba0;  /* accent hover / pressed */
  /* Text */
  --text-strong: #2c3e50;        /* primary / heading text (Midnight Blue) */
  --text-muted: #5b6b6e;         /* secondary text — AA-compliant on white */
  /* Structural neutrals */
  --surface-alt: #f8f9fa;        /* secondary background / subtle fill */
  --border-soft: #ecf0f1;        /* hairline borders + soft fills */
  --text-faint: #6a7878;         /* tertiary / faint text — AA-compliant on white */
  --neutral-mid: #bdc3c7;        /* mid grey — stronger borders, dividers, dots, neutral fills */
  /* Type families */
  --font-body: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;  /* default UI / body text */
  --font-display: 'Cinzel', serif;  /* ceremonial chrome; face not yet loaded, falls back to serif */
  --font-quote: 'Merriweather', Georgia, serif;  /* daily-quote card — readable serif */
}
```
 
### Font loading
 
`Merriweather` is loaded via Google Fonts in `<head>` (client-side `<link>` — no Apps Script OAuth scope, like the existing Font Awesome / Chart.js loads):
 
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Merriweather:ital,wght@0,400;1,400&display=swap">
```
 
`Cinzel` is **not loaded** — `--font-display` currently falls back to the browser default serif on all ceremonial surfaces. Loading it (same `<link>` pattern, `family=Cinzel:wght@400;700`) is an open decision; until then those surfaces render in serif, not Cinzel.
 
---
 
## 3. Accessibility fixes baked into the text tokens
 
WCAG 2.1 **AA** requires 4.5 : 1 contrast for normal body text on white. Three widely-used text greys failed; routing them through tokens fixed every occurrence with one value change each.
 
| Token | Old value | Old contrast | New value | New contrast | Result |
|---|---|---|---|---|---|
| `--text-muted` | `#7f8c8d` | ~3.5 : 1 (fail) | `#5b6b6e` | ~5.6 : 1 | Passes AA (285 uses) |
| `--text-faint` | `#95a5a6` / `#bdc3c7` | ~2.6 : 1 / ~1.9 : 1 (fail) | `#6a7878` | ~4.6 : 1 | Passes AA (207 uses total) |
 
Hierarchy preserved: `--text-strong` (~11 : 1) → `--text-muted` (~5.6 : 1) → `--text-faint` (~4.6 : 1) still read as three distinct levels.
 
---
 
## 4. Usage rules
 
- **Never reintroduce raw literals** for any tokenised colour (`#A984BA`, `#8b6ba0`, `#7f8c8d`, `#2c3e50`, `#f8f9fa`, `#ecf0f1`, `#95a5a6`, `#bdc3c7`) or font stack (`'Cinzel', serif`, `'Segoe UI', …`) anywhere — CSS rules, inline `style="…"`, or JS template strings. Use the matching `var(--token)` (valid in all three contexts).
- The **only** place token literals may appear is the `:root` block.
- New recurring colours/fonts should be promoted to a token here, not hardcoded.
- The dynamic celebration vars (`--cel-ring` / `--cel-bg` / `--cel-fg`) are a separate JS-set per-event mechanism, intentionally not part of this set.
---
 
## 5. Known open items
 
| Item | Notes |
|---|---|
| Cinzel not loaded | `--font-display` falls back to serif on ceremonial chrome. Load it or repoint the token. |
| `#ffffff` / `white` surfaces (~311) | Not tokenised. Ambiguous (surface vs text-on-accent). Needed for dark mode. |
| Page background `#f4f7f6` (9) | Not tokenised. Needed for dark mode. |
| ~281 distinct hardcoded colours remain | Semantic colours (`#e74c3c`, `#1d9e75`, `#ef9f27`, light-purple fills, etc.). Triage needed for dark mode. |
 
---
 
## 6. Migration status
 
| Phase | Scope | State |
|---|---|---|
| 0 | This document | ✅ Done |
| 1 | `:root` + accent tokens | ✅ Done |
| 2 | text-strong / text-muted + muted AA fix | ✅ Done |
| 3 | surface-alt / border-soft / text-faint + faint AA fix | ✅ Done |
| 3b | `#bdc3c7` role-split (text → faint, structural → neutral-mid) | ✅ Done |
| 5 | Type families (body / display / quote) + Merriweather load + quote font | ✅ Done |
| 4 | Dark mode (surfaces, neutrals, semantic triage, `@media` override) | ⛔ Deferred — large effort (see §5) |
| 5-scale | Font-size type scale (`--text-sm/base/lg…`) | ⛔ Optional, not started |
