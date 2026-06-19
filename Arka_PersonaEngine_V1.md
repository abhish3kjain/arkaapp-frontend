# Arka Persona Engine — V1 Design Document

**Status:** Active  
**Version:** 1  
**Computed by:** ArkaPersonaPass.gs (nightly, triggered by MasterEngine)  
**Stored in:** PersonaProfileDB  
**Trigger flag:** `ARKAPERSONAPASS_READY` (PropertiesService)

---

## Overview

The Persona Engine (ArkaPersonaPass) analyses a member's reading behaviour and assigns them a named archetype plus verdicts on six behavioural axes. The result is a reading personality profile — a stable, data-grounded snapshot of how a member reads, updated nightly as new page logs accumulate.

Profiles are loaded to the frontend in Wave 2. When the archetype is still forming (insufficient data on one or more axes), the UI displays a forming state rather than an incomplete profile.

---

## The Six Axes

Each axis is a bipolar spectrum scored from `0` (left pole) to `100` (right pole). A score near 50 indicates a reader who sits between both poles.

| Axis | Left Pole (→ 0) | Right Pole (→ 100) |
|---|---|---|
| **Rhythm** | 🌅 Early Bird — reads earlier in the day | Night Owl 🌙 — reads later in the day |
| **Appetite** | 🍪 The Nibbler — reads in short sittings | The Devourer 📚 — reads in long sittings |
| **Cadence** | 🌊 The Binger — reads in waves or bursts | The Metronome ⏱️ — reads at a steady, even pace |
| **Era** | ✨ Trendsetter — gravitates toward recent books | Time Traveler 🏛️ — gravitates toward older books |
| **Scale** | 📄 Novella Lover — prefers shorter books | Doorstop Lover 📕 — prefers longer books |
| **Breadth** | 🎯 Devoted Specialist — reads within a narrow genre range | Genre Nomad 🌍 — reads across many genres |

---

## PersonaProfileDB Record Structure

Each member has at most one active PersonaProfileDB record. Fields:

| Field | Type | Description |
|---|---|---|
| `memberId` | string | Member identifier. |
| `archetypeName` | string \| null | Named archetype (e.g. "The Deep Diver"). `null` if the persona is still forming. |
| `archetypeEmoji` | string | Emoji representing the archetype. |
| `archetypeTagline` | string | One-line descriptor shown under the archetype name. |
| `axisVerdicts` | JSON array | Array of six verdict objects, one per axis. See structure below. |
| `insights` | JSON array | Array of insight objects surfaced in the full personality view. |
| `blindSpot` | JSON object | `{ eyebrow, text }` — shown only to the member on their own profile. |
| `raritySummary` | JSON object | `{ archetypeShare }` — what percentage of Arka members share this archetype. |
| `computedDate` | string | Date of last computation. Displayed in the UI footer. |
| `engineVersion` | string | Engine version string. Displayed in the UI footer. |
| `status` | string | `Active` or `Suppressed`. |

---

## Verdict Object Structure

Each item in the `axisVerdicts` array:

```json
{
  "axis": "Rhythm",
  "side": "Night Owl",
  "position": 74,
  "gated": false,
  "note": "You tend to read latest at night, most often after 9 PM."
}
```

| Field | Type | Description |
|---|---|---|
| `axis` | string | Axis name (e.g. `"Rhythm"`, `"Appetite"`). |
| `side` | string | The pole label the member currently maps to (e.g. `"Night Owl"`). |
| `position` | number (0–100) | Position on the spectrum. |
| `gated` | boolean | `true` = axis is still forming; not enough data to resolve. |
| `note` | string | When `gated: true`: progress text (e.g. `"5 of 8"`). When resolved: a member-facing insight string. |

---

## Forming and Gating Logic

Individual axes gate independently. An axis gates when the underlying data for that dimension is insufficient to produce a reliable verdict.

- **Gated axis:** `gated: true`, `note` shows progress as `"N of M"` (e.g. `"5 of 8 books logged"`).
- **Resolved axis:** `gated: false`, `note` contains a member insight.
- **`formingCount`:** Count of axes where `gated === true`. Shown in the UI as:  
  `"X axes are still forming. Keep logging pages…"`
- **Full persona active:** All six axes resolved **and** `archetypeName` is set.
- **Forming state:** If `archetypeName === null`, the UI shows `"Reading Personality is forming…"` in place of the archetype name and tagline.

---

## Data Exclusions

Rows where `bookId === 'HISTORICAL_IMPORT'` are excluded from all Persona Engine calculations. These rows have artificial midnight timestamps that do not reflect real reading behaviour (time of day, cadence, sitting length). This is the same guard used by the Reading Speed Engine V1.

---

## Evolution Tracking

Each time an axis verdict changes, an activity entry of type `ARKA_ACTTYP_PERSONAUPDATE` is recorded. The description format is:

```
Axis: {axis} | {fromLabel} → {toLabel} |
```

Example:
```
Axis: Rhythm | Early Bird → Night Owl |
```

The full personality view displays the last **8** `PERSONAUPDATE` activity entries as an evolution timeline, giving members a sense of how their reading personality has shifted over time.

---

## Frontend Display

### Compact Strip (Profile Cards)

Shown wherever a member's profile card appears. Contains:
- Archetype emoji
- Archetype name
- Rarity (from `raritySummary.archetypeShare`)
- First 4 trait chips (derived from axis verdicts)

Rendered by: `renderPersonaStrip()`

### Full Personality View

Opened from a profile card or the Me tab. Contains:

| Section | Content |
|---|---|
| Hero | Archetype emoji, name, tagline, rarity summary |
| Reading Spectrum | Six axis sliders with pole labels, member's position, and note text |
| Insights | Cards from the `insights` array |
| Blind Spot | `blindSpot.eyebrow` + `blindSpot.text` — **own profile only** |
| Evolution Timeline | Last 8 `ARKA_ACTTYP_PERSONAUPDATE` activity entries |
| Footer | `"Last updated {computedDate} · {engineVersion}"` |

### Me Tab Inset

A summary inset on the Me tab rendered by: `renderMeTabPersonaInset()`

---

## Wave Loading

PersonaProfileDB data is loaded in **Wave 2**. After the wave completes, the frontend calls:

1. `renderPersonaStrip()` — for `currentUser`
2. `renderMeTabPersonaInset()` — for `currentUser`

### Frontend Globals

| Global | Type | Description |
|---|---|---|
| `globalPersonaProfileDB` | array | Full array of all persona profile records. |
| `personaProfileMap` | `Map<memberId → record>` | Fast lookup map keyed by `memberId`. |
| `personaViewReturnTarget` | string | Tracks which view opened the personality view, used by the back button. |

---

## Design Constraints and Assumptions

- The engine runs nightly; the frontend consumes pre-computed data read-only.
- A member profile can be in one of three states: **fully resolved** (archetype set, all axes resolved), **partially forming** (archetype set, some axes gated), or **fully forming** (archetype null, axes gated).
- The blind spot section is suppressed when viewing another member's profile — it is only shown to the profile owner.
- Rarity (`archetypeShare`) is computed relative to the active Arka member base at computation time.
- `status: Suppressed` records are not rendered in the UI.

---

## Evolution Notes

- AXIS_META (axis definitions, pole labels, emojis) is a V1 constant set. Any addition, removal, or rename of an axis is a breaking change requiring a version bump.
- The forming thresholds (the `M` in `"N of M"` per axis) are V1 parameters defined in ArkaPersonaPass.gs.
- The number of evolution timeline entries displayed (currently 8) is a V1 UI parameter.
- Future versions may introduce weighted axis scores or cross-axis composite dimensions.

---

## Version History

| Version | Date | Author | Notes |
|---|---|---|---|
| V1 | Jun 2026 | Arka Product | Initial design. Six axes, IQR-gated forming logic, HISTORICAL_IMPORT exclusion, Wave 2 load, evolution timeline. |
