# Arka Reading Speed Engine — V1 Design Document

**Status:** Active  
**Version:** 1  
**Computed by:** MasterEngine (nightly)  
**Stored in:** MemberDB Col O (Stats JSON) under `member.stats.readingSpeed`

---

## Overview

The Reading Speed Engine (RSE) computes a per-user estimate of how long a given member will take to read a book. It is more personalised than a raw page count because it accounts for the user's genre-specific pace and their current reading mood. The output is a single JSON object stored in the member's stats field and updated nightly by MasterEngine.

---

## Output JSON Structure

Stored at `member.stats.readingSpeed`:

```json
{
  "v": 1,
  "computed": "19-Jun-2026",
  "overallAvgPace": 22,
  "recentPace": 18,
  "moodMultiplier": 0.82,
  "genrePace": {
    "Fiction": { "pace": 28, "booksUsed": 5 },
    "Non-Fiction": { "pace": 14, "booksUsed": 3 },
    "Thriller": { "pace": 35, "booksUsed": 4 }
  }
}
```

### Field Reference

| Field | Type | Description |
|---|---|---|
| `v` | integer | Engine version. Currently `1`. Bump on any breaking change to computation logic. |
| `computed` | string (dd-MMM-yyyy) | Date of last computation. |
| `overallAvgPace` | number | Pages/day = total all-time pages (all real logs, including unlinked books) ÷ span from first to last real log. HISTORICAL_IMPORT timestamps and pages are excluded entirely. |
| `recentPace` | number | Pages/day over the last 30 days across all books, including unlinked pages. HISTORICAL_IMPORT timestamps excluded. |
| `moodMultiplier` | number \| null | `recentPace ÷ overallAvgPace`, clamped to `[0.4, 2.0]`. Represents the user's current reading state relative to their baseline. Omitted (null) when `recentPace = 0` (no logs in 30 days) to avoid distorting estimates. |
| `genrePace` | object | Map of canonical genre name → `{ pace, booksUsed }`. Only genres with **≥ 3 qualifying finished books** are included. |

---

## Estimated Days Computation (Frontend Usage)

When the frontend needs to show how long a book will take a user to read, it applies the following fallback chain in order:

| Priority | Formula | Condition |
|---|---|---|
| 1 | `pages ÷ (genrePace[genre] × moodMultiplier)` | Genre pace and mood multiplier both available |
| 2 | `pages ÷ genrePace[genre]` | Genre pace available, mood multiplier null |
| 3 | `pages ÷ (overallAvgPace × moodMultiplier)` | No genre pace; mood multiplier available |
| 4 | `pages ÷ overallAvgPace` | No genre pace; no mood multiplier |
| 5 | Raw page count | No pace data at all |

Genre is matched against `book.canonicalGenre` sourced from ArkaLibraryDB.

---

## Per-Book Pace Computation

For each finished book with page logs:

```
bookPace = totalPagesLogged ÷ max(1, daysBetweenFirstAndLastLog)
```

- **Single-day span guard:** If the first and last log fall on the same day, the span is treated as 1 day (no division by zero, no inflated pace).
- **Unlinked pages** (logs with no `bookId`, or a `bookId` not in LibraryDB) count toward `overallAvgPace` and `recentPace` — they are excluded only from `genrePace` because there is no genre to assign.

---

## Genre Pace Threshold

Only genres where the user has **≥ 3 qualifying finished books** are written into `genrePace`. This prevents noisy single-book estimates from distorting reading time predictions for an entire genre. The threshold of 3 is a V1 parameter and may be tuned as real data distributions are observed.

---

## Outlier Detection — Personal IQR-Based with Adaptive Ceiling

Outlier detection is performed per-user using the user's own pace distribution rather than a global threshold. This avoids penalising fast readers or over-correcting slow ones.

### Algorithm

1. Compute per-book pace for all finished books with valid logs.
2. Compute the **median** and **IQR** (interquartile range) across these per-book paces.  
   IQR is used in preference to standard deviation because it is more robust to skewed distributions.
3. Compute `moodMultiplier` (see field reference above).
4. Compute the adaptive ceiling multiplier:
   ```
   adaptiveIQRMultiplier = clamp(2.0 × moodMultiplier, 1.2, 3.0)
   ```
5. Discard any book whose pace exceeds:
   ```
   median + adaptiveIQRMultiplier × IQR
   ```
6. Recompute `genrePace` from the clean sample. (`overallAvgPace` is computed independently from all logs — see field reference — and is not affected by IQR filtering.)

### Rationale

A user in a fast reading streak (high `moodMultiplier`) receives a more permissive outlier ceiling — what looks historically anomalous may simply be their current elevated reading state. A user in a slow phase receives a tighter ceiling. This makes the engine self-calibrating per reading phase.

### V1 Clamp Parameters

| Parameter | Clamp Range |
|---|---|
| `moodMultiplier` | `[0.4, 2.0]` |
| `adaptiveIQRMultiplier` | `[1.2, 3.0]` |

---

## Time-Weighting for Pace Computation

Books from the **last 12 months** count with full weight (`1.0`). Older books decay linearly, reaching a floor of `0.5` at 36 months and beyond. This ensures that a member whose reading pace has genuinely increased over time is not anchored to old, slower data when outlier ceilings or averages are computed.

### Weight Formula

For books older than 12 months:

```
weight = max(0.5, 1.0 - (monthsAgo - 12) / 48)
```

Books 12 months old or less: `weight = 1.0`

### V1 Decay Parameters

| Parameter | Value |
|---|---|
| Full-weight window | 12 months |
| Floor weight | 0.5 |
| Floor reached at | 36 months |

---

## Weekly Logging Migration Caveat

The club historically logged pages weekly rather than daily. This does not distort pace calculation because the engine uses `totalPages ÷ daysBetweenFirstAndLastLog` (the envelope of the reading period), not a per-entry daily rate. A single weekly log entry covering 7 days of reading is correctly captured within the span. The IQR-based outlier detection provides a further guard against any edge cases this introduces.

---

## HISTORICAL_IMPORT Handling

Rows where `bookId === 'HISTORICAL_IMPORT'` have artificial midnight timestamps that do not reflect real reading behaviour.

| Calculation | Treatment |
|---|---|
| `pagesDelta` inclusion | **Included** in total page counts for `overallAvgPace` |
| Time-span / date-range calculations | **Excluded** |
| `recentPace` 30-day window | **Excluded** from timestamp filtering |

This is the same guard used by ArkaPersonaPass.

---

## Frontend Integration

### Sort Chip — "Reading Time"

The Library sort chip with key `'readtime'` uses the fallback chain above to sort books by estimated days to finish. Relevant frontend symbols:

- `LIBRARY_SORT_OPTIONS` — defines the `'readtime'` sort key
- `renderSortChips()` — renders the chip
- `filterLibrary()` — applies the sort

All three are in `app.js`.

### Book Detail View

The finish date estimate on the Book Detail view currently uses a simpler pace calculation. This is to be upgraded to RSE V1.

### Badge Unlock Time Estimates

Badge unlock time currently uses `badgePaceAvgPagesPerDay` from CoachInsights. RSE V1 will eventually supersede this source.

---

## Design Constraints and Assumptions

- Genre is sourced from `book.canonicalGenre` in ArkaLibraryDB. V1 does not use AI-tagged sub-genres.
- A book must be **finished** and have **valid page logs** to contribute to any pace calculation.
- `moodMultiplier` is `null` when the user has no logs in the last 30 days. The frontend must handle this null and fall back accordingly.
- All computation happens server-side (MasterEngine, nightly). The frontend consumes the pre-computed JSON read-only.

---

## Evolution Notes

- Future versions may incorporate AI-tagged sub-genres from ArkaLibraryDB for finer genre granularity.
- The genre qualification threshold (currently 3 books) may be tuned once real data distributions are observed.
- Any change to V1 decay constants, clamp bounds, or the outlier algorithm must be shipped with a version bump (`v: 2`) and a corresponding entry in the Version History below.

---

## Version History

| Version | Date | Author | Notes |
|---|---|---|---|
| V1 | Jun 2026 | Arka Product | Initial design. Per-user IQR outlier detection, adaptive mood multiplier, time-weighted pace, genre threshold of 3 books. |
