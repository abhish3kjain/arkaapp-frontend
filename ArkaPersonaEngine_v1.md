# Arka Persona Engine — V1 Reference

**Status:** Live  
**Nightly pass:** PersonaPass (standalone GAS project — separate from MasterEngine)  
**Storage:** `PersonaProfileDB` sheet in the main spreadsheet  
**Frontend rendering:** `renderPersonaStrip()` · `renderPersonalityView()` in `app.js`

---

## 1. What It Is

Reading Personality is a data-driven identity fingerprint computed automatically from each member's page logs and finished books. No surveys, no self-reporting. The engine evaluates six behavioural axes nightly, assigns a named **archetype** once enough axes have resolved, and writes the result to `PersonaProfileDB`.

Members see their personality on the **My Profile** view (compact strip) and the full **Personality panel** (opened from the profile). Other members see the compact strip on any member's profile card.

---

## 2. The Six Axes

Each axis has two named poles. A member's position (0–100 on the spectrum) is derived from their actual reading behaviour. An axis stays **gated** ("Still forming…") until enough data is available to make a reliable call.

| # | Axis | Left Pole | Right Pole | What it measures |
|---|------|-----------|------------|-----------------|
| 1 | **Rhythm** | 🌅 Early Bird | Night Owl 🌙 | The time of day the member most often reads (session timestamps). |
| 2 | **Appetite** | 🍪 The Nibbler | The Devourer 📚 | Pages read per typical session (average session size across all logs). |
| 3 | **Cadence** | 🌊 The Binger | The Metronome ⏱️ | Whether reading days are evenly spread or come in bursts. |
| 4 | **Era** | ✨ Trendsetter | Time Traveler 🏛️ | The publication era of books the member tends to finish. |
| 5 | **Scale** | 📄 Novella Lover | Doorstop Lover 📕 | The average length (pages) of books the member finishes. |
| 6 | **Breadth** | 🎯 Devoted Specialist | Genre Nomad 🌍 | How wide the member's reading spans across canonical genres. |

### Axis details

**Rhythm** — Derived from the hour component of page-log timestamps. A member whose sessions cluster before noon resolves as Early Bird; sessions clustering in the evening/night resolve as Night Owl. Needs a meaningful number of timestamped sessions to settle.

**Appetite** — Average pages per session across all positive page-log deltas. Low average → The Nibbler; high average → The Devourer. Needs enough sessions to produce a stable mean.

**Cadence** — Looks at how evenly reading days are distributed over time. Long quiet stretches followed by intensive runs → The Binger. Consistent, regularly spaced days → The Metronome. Needs enough logged reading days to show a repeating pattern.

**Era** — Derived from the publication years of Finished shelf records. Recent publications dominate → Trendsetter. Older / classic-era titles dominate → Time Traveler. The `note` field includes a computed "spirit decade" (e.g., "Your reads skew toward the 1990s"). Needs a few finished books with known publication dates.

**Scale** — Average page count of finished books (using `ArkaLibraryDB` page counts). Below a threshold → Novella Lover; above → Doorstop Lover. The `note` field states the member's average book length (e.g., "average 312 pages"). Needs several finished books with known page counts.

**Breadth** — Counts the number of distinct canonical genres (via `resolveCanonicalGenres_()`) across all Finished shelf records. Narrow spread (1–2 dominant genres) → Devoted Specialist. Wide spread across many canonical genres → Genre Nomad. Needs several finished books across varied genres to show a clear pattern.

---

## 3. Verdict Data Structure

Each axis produces a **verdict** object stored in the `AxisVerdicts` JSON array in `PersonaProfileDB` Col F:

```json
{
  "axis"    : "Cadence",
  "side"    : "The Metronome ⏱️",
  "position": 78,
  "gated"   : false,
  "note"    : "You've logged reading on 4 out of every 5 days over the past 12 weeks.",
  "badgeID" : "ARKA_BADGE_METRONOME_BRONZE"
}
```

| Field | Type | Meaning |
|-------|------|---------|
| `axis` | string | One of the six axis names above. |
| `side` | string | The resolved pole label (e.g., `"The Binger 🌊"`). Null/absent when gated. |
| `position` | 0–100 | Drives the slider marker in the UI. 0 = hard left pole, 100 = hard right pole, 50 = centre. |
| `gated` | boolean | `true` = not enough data yet ("Still forming…"). `false` = resolved. |
| `note` | string | Member-specific explanatory text shown below the slider. For gated axes, contains progress ("4 of 6 books needed"). |
| `badgeID` | string | Optional — links to a badge the member has (or could earn) related to this axis. |

---

## 4. Archetype Assignment

### What an archetype is

Once enough axes are resolved (gated count drops below the PersonaPass threshold), the engine synthesises the dominant traits into a **named archetype** — a single headline label that captures the member's reading personality at a glance.

Examples: *The Midnight Scholar*, *The Wanderer*

### How archetypes are named

Archetypes are determined by the **PersonaPass backend** (a standalone GAS project separate from MasterEngine and this repository). The PersonaPass holds an internal archetype matrix that maps combinations of axis verdicts to archetype keys of the form `ARKA_PERSONA_ARCH_<NAME>`.

The naming logic follows this pattern:
- Each archetype corresponds to a specific combination (or weighted cluster) of axis poles.
- Not every possible combination of six axes maps to a distinct archetype — many combinations share an archetype when the distinguishing axes are the same.
- The archetype name and its tagline (e.g., *"Reads deep into the night, one genre, all in"*) are stored per-member in `PersonaProfileDB` Col C and Col E respectively.
- An **archetype key** (Col B, e.g., `ARKA_PERSONA_ARCH_MIDNIGHTSCHOLAR`) provides a stable programmatic handle that won't break if the display name changes.

### Forming state

When a member has too few resolved axes to name a type, `ArchetypeName` and `ArchetypeKey` are left blank. The frontend shows a placeholder:
> *"📖 Reading Personality is forming… Keep logging to reveal your type."*

No archetype is ever inferred or partially assigned — the member either has a full named type or is in forming state.

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

## 5. PersonaProfileDB Schema

One row per member. Fully rewritten nightly by PersonaPass (display cache, not a ledger).

| Col | Field | Type | Notes |
|-----|-------|------|-------|
| A | MemberID | string | FK → MemberDB Col A. |
| B | ArchetypeKey | string | Stable key e.g. `ARKA_PERSONA_ARCH_MIDNIGHTSCHOLAR`. Blank if forming. |
| C | ArchetypeName | string | Display name e.g. `The Midnight Scholar`. Blank if forming. |
| D | ArchetypeEmoji | string | Single emoji for the archetype (e.g. `🌙`). |
| E | ArchetypeTagline | string | One-line italic description shown under the archetype name. |
| F | AxisVerdicts | JSON string | Array of verdict objects (see §3). Full spectrum — resolved and gated axes both present. |
| G | Insights | JSON string | Computed standout-facts array `[{ label, sub, helpArticleId }]` — unusual or memorable stats the member likely hasn't consciously noticed. |
| H | BlindSpot | JSON string | Single `{ label, sub }` — the most surprising insight, highlighted prominently on the member's own profile only. |
| I | RaritySummary | JSON string | `{ archetypeShare, axisRarities }` (see §4). |

---

## 6. Drift Tracking — How You've Changed

Because the PersonaPass re-evaluates all axes every night, an axis verdict can shift as reading habits change. When a shift is detected, the PersonaPass logs one `ARKA_ACTTYP_PERSONAUPDATE` row to `ActivityLogDB` **per changed axis**:

```
activityDesc format:
"Axis: <axisName> | <oldSide> → <newSide> | Archetype: <oldArchetype> → <newArchetype>"
```

These rows are **hidden from the home feed** (listed in `HIDDEN_TYPES` in the feed aggregator) — they are an audit trail only.

The **"How You've Changed"** timeline in the Personality panel reads directly from these rows, building a permanent history of every axis shift since the member joined. Once logged, a shift is never removed.

### Celebration card

When `renderPersonaCelebrationCard_()` finds one or more `ARKA_ACTTYP_PERSONAUPDATE` entries within the last **7 days** (`PERSONA_CELEB_WINDOW_DAYS = 7`) in `globalActivityLogDB`, and the member has not dismissed that specific shift (tracked via `personaShiftSeen` in `MemberDB` Col N), it renders a celebration card on the Me tab.

Dismissal writes `{ personaShiftSeen: <activityID>, personaShiftSeenAt: <epochMs> }` to `MemberDB` Col N via `setPersonaCelebrationSeen()`. The seen marker expires after 7 days (same window as the appearance gate) and is cleaned up by `clearMemberCelebration()` to avoid stale suppression of future shifts.

---

## 7. Data Flow

```
Nightly (PersonaPass, standalone GAS)
  ├── Reads: MemberDB, PageLogDB, MemberShelfDB, ArkaLibraryDB, ActivityLogDB
  ├── Computes: 6 axis verdicts per member
  ├── Resolves: archetype key + name + tagline (internal matrix)
  ├── Computes: rarity counts club-wide
  ├── Writes: PersonaProfileDB (full rewrite per row)
  └── Logs: ARKA_ACTTYP_PERSONAUPDATE to ActivityLogDB (one row per changed axis)

MasterEngine (nightly, after PersonaPass)
  ├── Reads PersonaProfileDB → builds personaProfileMap { memberId: { archetypeName, archetypeTagline, axisVerdicts[] } }
  └── Passes personaDNA into buildMemberInsights_() for persona-aware coaching chips

App frontend — Wave 2 (globalPersonaProfileDB)
  ├── renderPersonaStrip()   → compact archetype chip on My Profile
  ├── renderPersonalityView() → full panel (archetype hero, axis sliders, insights, blind spot, timeline)
  └── renderPersonaCelebrationCard_() → celebration card if a shift is within 7 days and unseen

ArkaAIPass (nightly, after MasterEngine)
  └── Uses personaDNA.archetypeName + axes as Layer 1 ("Reading DNA") of the Gemini coaching prompt
```

---

## 8. Frontend Display Constants

These are defined inline in `renderPersonalityView()` in `app.js`:

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
  Rhythm   : ['🌅 Early Bird',        'Night Owl 🌙'],
  Appetite : ['🍪 The Nibbler',       'The Devourer 📚'],
  Cadence  : ['🌊 The Binger',        'The Metronome ⏱️'],
  Era      : ['✨ Trendsetter',       'Time Traveler 🏛️'],
  Scale    : ['📄 Novella Lover',     'Doorstop Lover 📕'],
  Breadth  : ['🎯 Devoted Specialist','Genre Nomad 🌍']
};
```

---

## 9. Privacy

Members can hide their Reading Personality from other members via the **Reading Personality** visibility toggle in the Edit Profile flow. The toggle writes to `MemberDB` via `updatePersonaVisibility()`. When hidden:
- Other members' profile cards show no personality strip for this member.
- The member themselves still sees their full personality on their own Me tab.

---

## 10. Known Gaps & Notes

- **Archetype matrix not in this repo.** The full lookup table (axis combination → archetype name/key/tagline) lives exclusively in the PersonaPass GAS project. Any new archetype or axis requires a PersonaPass deployment.
- **Axis count.** The system has **6 axes**. The Help article (`help-reading-personality`) incorrectly states "seven axes" — this is a documentation error; there are six.
- **MasterEngine reads but does not write PersonaProfileDB.** MasterEngine consumes the PersonaPass output for the AI coaching layer. It never modifies `PersonaProfileDB`.
- **ArkaPersonaPass.gs in this repo is a misnomer.** The file is actually `ArkaAIPass` (the Gemini coaching script). The true PersonaPass is a separate GAS project not included here.
