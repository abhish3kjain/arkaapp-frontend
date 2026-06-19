# Arka Persona Engine — V1 Design Document

**Status:** Active  
**Version:** 1  
**Computed by:** ArkaPersonaPass.gs (nightly, triggered by MasterEngine)  
**Stored in:** PersonaProfileDB  
**Trigger flag:** `ARKAPERSONAPASS_READY` (PropertiesService)  
**Frontend rendering:** `renderPersonaStrip()` · `renderPersonalityView()` · `renderMeTabPersonaInset()` in `app.js`

---

## Overview

The Persona Engine (ArkaPersonaPass) analyses a member's reading behaviour and assigns them a named archetype plus verdicts on six behavioural axes. The result is a reading personality profile — a stable, data-grounded snapshot of how a member reads, updated nightly as new page logs accumulate.

Reading Personality is computed automatically from each member's page logs and finished books. No surveys, no self-reporting. The engine evaluates six behavioural axes nightly, assigns a named **archetype** once enough axes have resolved, and writes the result to `PersonaProfileDB`.

Profiles are loaded to the frontend in Wave 2. When the archetype is still forming (insufficient data on one or more axes), the UI displays a forming state rather than an incomplete profile. Members see their personality on the **My Profile** view (compact strip) and the full **Personality panel**. Other members see the compact strip on any member's profile card.

---

## The Six Axes

Each axis is a bipolar spectrum scored from `0` (left pole) to `100` (right pole). A score near 50 indicates a reader who sits between both poles. An axis stays **gated** ("Still forming…") until enough data is available to make a reliable call.

| # | Axis | Left Pole (→ 0) | Right Pole (→ 100) | What it measures |
|---|------|-----------------|---------------------|-----------------|
| 1 | **Rhythm** | 🌅 Early Bird | Night Owl 🌙 | The time of day the member most often reads (session timestamps). |
| 2 | **Appetite** | 🍪 The Nibbler | The Devourer 📚 | How much the member reads in a typical sitting (average session size). |
| 3 | **Cadence** | 🌊 The Binger | The Metronome ⏱️ | Whether reading days are evenly spread or come in bursts. |
| 4 | **Era** | ✨ Trendsetter | Time Traveler 🏛️ | The publication era of books the member tends to finish. |
| 5 | **Scale** | 📄 Novella Lover | Doorstop Lover 📕 | The average length (pages) of books the member finishes. |
| 6 | **Breadth** | 🎯 Devoted Specialist | Genre Nomad 🌍 | How wide the member's reading spans across canonical genres. |

### Axis computation details

**Rhythm** — Derived from the hour component of page-log timestamps. Sessions clustering before noon → Early Bird; sessions clustering in the evening/night → Night Owl. Needs a meaningful number of timestamped sessions to settle.

**Appetite** — Average pages per session across all positive page-log deltas. Low average → The Nibbler; high average → The Devourer. Needs enough sessions to produce a stable mean.

**Cadence** — Looks at how evenly reading days are distributed over time. Long quiet stretches followed by intensive runs → The Binger. Consistent, regularly spaced days → The Metronome. Needs enough logged reading days to show a repeating pattern.

**Era** — Derived from the publication years of Finished shelf records. Recent publications dominate → Trendsetter. Older/classic-era titles dominate → Time Traveler. The `note` field includes a computed "spirit decade" (e.g., "Your reads skew toward the 1990s"). Needs a few finished books with known publication dates.

**Scale** — Average page count of finished books (using `ArkaLibraryDB` page counts). Below a threshold → Novella Lover; above → Doorstop Lover. The `note` field states the member's average book length (e.g., "average 312 pages"). Needs several finished books with known page counts.

**Breadth** — Counts the number of distinct canonical genres (via `resolveCanonicalGenres_()`) across all Finished shelf records. Narrow spread (1–2 dominant genres) → Devoted Specialist. Wide spread across many canonical genres → Genre Nomad. Needs several finished books across varied genres to show a clear pattern.

---

## Verdict Object Structure

Each item in the `axisVerdicts` array:

```json
{
  "axis"    : "Rhythm",
  "side"    : "Night Owl",
  "position": 74,
  "gated"   : false,
  "note"    : "You tend to read latest at night, most often after 9 PM.",
  "badgeID" : "ARKA_BADGE_NIGHTOWL_BRONZE"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `axis` | string | Axis name (e.g. `"Rhythm"`, `"Cadence"`). |
| `side` | string | The pole label the member currently maps to (e.g. `"Night Owl"`). Null/absent when gated. |
| `position` | number (0–100) | Drives the slider marker in the UI. 0 = hard left pole, 100 = hard right pole, 50 = centre. |
| `gated` | boolean | `true` = axis still forming — not enough data to resolve. `false` = resolved. |
| `note` | string | When `gated: true`: progress text (e.g. `"5 of 8 books logged"`). When resolved: a member-facing insight string. |
| `badgeID` | string | Optional — links to a badge the member has (or could earn) related to this axis. |

---

## Forming and Gating Logic

Individual axes gate independently. An axis gates when the underlying data for that dimension is insufficient to produce a reliable verdict.

- **Gated axis:** `gated: true`, `note` shows progress as `"N of M"` (e.g. `"5 of 8 books logged"`).
- **Resolved axis:** `gated: false`, `note` contains a member insight.
- **`formingCount`:** Count of axes where `gated === true`. Shown in the UI as:  
  `"X axes are still forming. Keep logging pages…"`
- **Full persona active:** All six axes resolved **and** `archetypeName` is set.
- **Forming state:** If `archetypeName === null`, the UI shows `"Reading Personality is forming…"` in place of the archetype name and tagline. No archetype is ever inferred or partially assigned — a member either has a full named type or is in forming state.

---

## Archetype Assignment

### What an archetype is

Once enough axes are resolved (gated count drops below the PersonaPass threshold), the engine synthesises the dominant traits into a **named archetype** — a single headline label that captures the member's reading personality at a glance.

Examples: *The Midnight Scholar*, *The Wanderer*, *The Deep Diver*

### Archetype key format

Each archetype has a stable programmatic key of the form `ARKA_PERSONA_ARCH_<NAME>` stored in `PersonaProfileDB` Col B (e.g. `ARKA_PERSONA_ARCH_MIDNIGHTSCHOLAR`). This key is the durable handle — the display name (Col C) and tagline (Col E) can be updated without breaking references.

### Archetype matrix (combination rules)

The full matrix is defined in the PersonaPass GAS project (standalone — not in this repository). Each archetype maps to a combination of axis poles. Not every possible 6-axis combination is a distinct archetype — combinations that share the same distinguishing axes resolve to the same name.

> ⚠️ **The complete matrix below must be filled in from the PersonaPass source.** The structure is shown here for reference:

| Archetype Key | Display Name | Emoji | Tagline | Rhythm | Appetite | Cadence | Era | Scale | Breadth |
|---|---|---|---|---|---|---|---|---|---|
| `ARKA_PERSONA_ARCH_MIDNIGHTSCHOLAR` | The Midnight Scholar | 🌙 | *(from PersonaPass)* | Night Owl | — | — | — | — | Devoted Specialist |
| `ARKA_PERSONA_ARCH_WANDERER` | The Wanderer | 🌍 | *(from PersonaPass)* | — | — | — | — | — | Genre Nomad |
| `ARKA_PERSONA_ARCH_DEEPDIVER` | The Deep Diver | 🤿 | *(from PersonaPass)* | — | The Devourer | — | — | Doorstop Lover | Devoted Specialist |
| *(add remaining archetypes from PersonaPass)* | | | | | | | | | |

> **Note:** A `—` in an axis column means that axis does not determine this archetype (other axes take precedence). The PersonaPass evaluates axes in weighted priority order; axes marked `—` for a given archetype are treated as neutral for that classification.

### Rarity

After assigning archetypes, the PersonaPass computes club-wide rarity counts and writes a `RaritySummary` JSON to `PersonaProfileDB` Col I:

```json
{
  "archetypeShare": "3/47",
  "axisRarities": {
    "Rhythm": "2/47",
    "Cadence": "5/47"
  }
}
```

The frontend displays this as: *"Only 3 of 47 members share this type."*

---

## PersonaProfileDB Schema

One row per member. Fully rewritten nightly by PersonaPass (display cache — not a ledger).

| Col | Field | Type | Description |
|-----|-------|------|-------------|
| A | MemberID | string | FK → MemberDB Col A. |
| B | ArchetypeKey | string | Stable key e.g. `ARKA_PERSONA_ARCH_MIDNIGHTSCHOLAR`. Blank if forming. |
| C | ArchetypeName | string | Display name e.g. `The Midnight Scholar`. Blank if forming. |
| D | ArchetypeEmoji | string | Single emoji for the archetype (e.g. `🌙`). |
| E | ArchetypeTagline | string | One-line italic description shown under the archetype name. |
| F | AxisVerdicts | JSON string | Array of six verdict objects (see above). Full spectrum — resolved and gated axes both present. |
| G | Insights | JSON string | Computed standout-facts array `[{ label, sub, helpArticleId }]` — unusual or memorable stats the member likely hasn't consciously noticed. |
| H | BlindSpot | JSON string | `{ eyebrow, text }` — the most surprising insight, shown only to the profile owner. |
| I | RaritySummary | JSON string | `{ archetypeShare, axisRarities }` (see Archetype Assignment §). |
| — | computedDate | string | Date of last computation. Displayed in the UI footer. |
| — | engineVersion | string | Engine version string. Displayed in the UI footer. |
| — | status | string | `Active` or `Suppressed`. Suppressed records are not rendered. |

---

## Data Exclusions

Rows where `bookId === 'HISTORICAL_IMPORT'` are excluded from all Persona Engine calculations. These rows have artificial midnight timestamps that do not reflect real reading behaviour (time of day, cadence, sitting length). This is the same guard used by the Reading Speed Engine V1.

---

## Drift Tracking — How You've Changed

Because the PersonaPass re-evaluates all axes every night, an axis verdict can shift as reading habits change. When a shift is detected, the PersonaPass logs one `ARKA_ACTTYP_PERSONAUPDATE` row to `ActivityLogDB` **per changed axis**:

```
activityDesc format:
"Axis: {axis} | {fromLabel} → {toLabel} | Archetype: {oldArchetype} → {newArchetype}"

Example:
"Axis: Rhythm | Early Bird → Night Owl | Archetype: The Dawn Reader → The Midnight Scholar"
```

These rows are **hidden from the home feed** (listed in `HIDDEN_TYPES` in the feed aggregator) — they are an audit trail only.

The **"How You've Changed"** timeline in the Personality panel reads the last **8** `ARKA_ACTTYP_PERSONAUPDATE` entries for the member, building a permanent history of every axis shift since joining. Once logged, a shift is never removed.

### Persona shift celebration card

When `renderPersonaCelebrationCard_()` finds one or more `ARKA_ACTTYP_PERSONAUPDATE` entries within the last **7 days** (`PERSONA_CELEB_WINDOW_DAYS = 7`) in `globalActivityLogDB`, and the member has not dismissed that specific shift, it renders a celebration card on the Me tab.

Dismissal flow:
1. User taps **Dismiss** → `dismissPersonaCelebrationCard_(seenActivityId)` called.
2. Writes `{ personaShiftSeen: <activityID>, personaShiftSeenAt: <epochMs> }` to `MemberDB` Col N via `setPersonaCelebrationSeen()` (server-side, fire-and-forget).
3. The seen marker expires after **7 days** (same window as the appearance gate). `clearMemberCelebration()` checks `personaShiftSeenAt` and drops the marker if stale, preventing a stale ID from suppressing a future shift's card.

> **Important:** `clearMemberCelebration()` (called when dismissing the badge/level card) only clears `badges` and `newLevel` from Col N — it **preserves** `personaShiftSeen`/`personaShiftSeenAt` to avoid resetting the persona dismiss state.

---

## Data Flow

```
Nightly (PersonaPass, standalone GAS — external to this repo)
  ├── Reads: MemberDB, PageLogDB, MemberShelfDB, ArkaLibraryDB, ActivityLogDB
  ├── Computes: 6 axis verdicts per member (excludes HISTORICAL_IMPORT rows)
  ├── Resolves: archetype key + name + tagline via internal matrix
  ├── Computes: rarity counts club-wide
  ├── Writes: PersonaProfileDB (full rewrite per row)
  └── Logs: ARKA_ACTTYP_PERSONAUPDATE to ActivityLogDB (one row per changed axis)

MasterEngine (nightly, after PersonaPass)
  ├── Reads PersonaProfileDB → builds personaProfileMap
  │     { memberId: { archetypeName, archetypeTagline, axisVerdicts[] } }
  └── Passes personaDNA into buildMemberInsights_() for persona-aware coaching chips
        (e.g. Cadence-aware absence message, Scale-mismatch insight)

App frontend — Wave 2 (globalPersonaProfileDB)
  ├── renderPersonaStrip()        → compact archetype chip on My Profile / member cards
  ├── renderPersonalityView()     → full panel (archetype hero, axis sliders, insights,
  │                                  blind spot, evolution timeline)
  ├── renderMeTabPersonaInset()   → summary inset on Me tab dashboard
  └── renderPersonaCelebrationCard_() → celebration card if a shift is within 7 days and unseen

ArkaAIPass (nightly, after MasterEngine)
  └── Uses personaDNA.archetypeName + resolved axis verdicts as Layer 1
        ("Reading DNA") of the Gemini coaching prompt
```

---

## Frontend Display

### Compact Strip (Profile Cards)

Rendered by `renderPersonaStrip()`. Contains:
- Archetype emoji + name
- Rarity (from `raritySummary.archetypeShare`)
- First 4 trait chips (derived from resolved axis verdicts)

### Full Personality View

Rendered by `renderPersonalityView()`. Opened from a profile card or the Me tab.

| Section | Content |
|---------|---------|
| Hero | Archetype emoji, name, tagline, rarity summary, trait chips |
| Reading Spectrum | Six axis sliders with pole labels, member's position marker, and note text |
| Insights | Cards from the `insights` array |
| Blind Spot | `blindSpot.eyebrow` + `blindSpot.text` — **own profile only** |
| How You've Changed | Last 8 `ARKA_ACTTYP_PERSONAUPDATE` activity entries |
| Footer | `"Last updated {computedDate} · {engineVersion}"` |

### Me Tab Inset

Rendered by `renderMeTabPersonaInset()` — a summary inset on the Me tab.

### Frontend Display Constants

Defined inline in `renderPersonalityView()` in `app.js`:

```js
// Axis icons and descriptions
const AXIS_META = {
  Rhythm   : { icon: '🕐', desc: 'The time of day you most often read.' },
  Appetite : { icon: '📄', desc: 'How much you typically read in a single sitting.' },
  Cadence  : { icon: '📅', desc: 'Whether your reading is evenly paced or comes in waves.' },
  Era      : { icon: '🗓️', desc: 'The era of books you tend to gravitate toward.' },
  Scale    : { icon: '📏', desc: 'The length of books you choose and finish.' },
  Breadth  : { icon: '🗺️', desc: 'How wide or narrow your reading spans across genres.' }
};

// Left-pole and right-pole labels for the spectrum slider
const POLE_LABELS = {
  Rhythm   : ['🌅 Early Bird',         'Night Owl 🌙'],
  Appetite : ['🍪 The Nibbler',        'The Devourer 📚'],
  Cadence  : ['🌊 The Binger',         'The Metronome ⏱️'],
  Era      : ['✨ Trendsetter',        'Time Traveler 🏛️'],
  Scale    : ['📄 Novella Lover',      'Doorstop Lover 📕'],
  Breadth  : ['🎯 Devoted Specialist', 'Genre Nomad 🌍']
};
```

---

## Wave Loading

PersonaProfileDB data is loaded in **Wave 2**. After the wave completes, the frontend calls:

1. `renderPersonaStrip()` — for `currentUser`
2. `renderMeTabPersonaInset()` — for `currentUser`

### Frontend Globals

| Global | Type | Description |
|--------|------|-------------|
| `globalPersonaProfileDB` | array | Full array of all persona profile records. |
| `personaProfileMap` | `Map<memberId → record>` | Fast lookup map keyed by `memberId`. |
| `personaViewReturnTarget` | string | Tracks which view opened the personality view, used by the back button. |

---

## Privacy

Members can hide their Reading Personality from other members via the **Reading Personality** visibility toggle in the Edit Profile flow. The toggle writes to `MemberDB` via `updatePersonaVisibility()`. When hidden:
- Other members' profile cards show no personality strip for this member.
- The member themselves still sees their full personality on their own Me tab.

---

## Design Constraints and Assumptions

- The engine runs nightly; the frontend consumes pre-computed data read-only.
- A member profile can be in one of three states: **fully resolved** (archetype set, all axes resolved), **partially forming** (archetype set, some axes gated), or **fully forming** (archetype null, axes gated).
- The blind spot section is suppressed when viewing another member's profile — it is only shown to the profile owner.
- Rarity (`archetypeShare`) is computed relative to the active Arka member base at computation time.
- `status: Suppressed` records are not rendered in the UI.
- MasterEngine reads but does **not** write PersonaProfileDB. It consumes PersonaPass output for the AI coaching layer only.

---

## Known Gaps & Notes

- **Archetype matrix not fully documented.** The complete lookup table (axis combination → archetype name/key/tagline) lives in the PersonaPass GAS project. The table skeleton above must be filled in from that source. Any new archetype or axis requires a PersonaPass deployment.
- **Axis count.** The system has **6 axes**. The Help article (`help-reading-personality`) incorrectly states "seven axes" — this is a documentation error; there are six.
- **`ArkaPersonaPass.gs` in this repo is a misnomer.** The file is actually the ArkaAIPass (Gemini coaching script). The true PersonaPass is a separate, standalone GAS project not included in this repository.

---

## Evolution Notes

- `AXIS_META` (axis definitions, pole labels, emojis) is a V1 constant set. Any addition, removal, or rename of an axis is a breaking change requiring a version bump.
- The forming thresholds (the `M` in `"N of M"` per axis) are V1 parameters defined in the PersonaPass project.
- The number of evolution timeline entries displayed (currently 8) is a V1 UI parameter.
- Future versions may introduce weighted axis scores or cross-axis composite dimensions.

---

## Version History

| Version | Date | Author | Notes |
|---------|------|--------|-------|
| V1 | Jun 2026 | Arka Product | Initial design. Six axes, IQR-gated forming logic, HISTORICAL_IMPORT exclusion, Wave 2 load, evolution timeline. |
| V1.1 | Jun 2026 | Claude | Added archetype matrix section, axis computation details, verdict badgeID field, celebration card dismiss logic (personaShiftSeen/personaShiftSeenAt), data flow diagram, frontend display constants, privacy section, known gaps. |
