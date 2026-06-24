# Arka — File Version Registry

Each file carries only its **current version number** in its header comment.
Full history lives here.

---

## Version Scheme

`MAJOR.MINOR.PATCH`

| Increment | When |
|---|---|
| MAJOR | Breaking schema change, full engine rewrite, or fundamental behaviour change |
| MINOR | New feature, new engine pass, or significant capability addition |
| PATCH | Bug fix, copy change, or incremental improvement within an existing feature |

---

## MasterEngine.gs

**Current: `2.5.0`**

| Version | Date | Summary |
|---|---|---|
| 1.0.0 | pre-2025 | Initial sync engine — Club Points audit, badge awards, batch MemberDB write |
| 2.0.0 | 2025 | Stats JSON in Col O; year-keyed stats; `_parseStatsJson_()` migration guard |
| 2.1.0 | 2025 | Insight engine pass (`generateMemberCoachInsights_`); per-book velocity; `genrePaceMap` |
| 2.2.0 | 2025 | PersonaPass gating; `ARKAPERSONAPASS_READY` flag; persona DNA in `statSnapshot` |
| 2.3.0 | 2025 | Week-position context (`daysIntoWeek`, `projectedWeeklyPace`, `weeklyPagesTrend`) |
| 2.4.0 | Jun 2026 | RSE V1 (`computeMemberReadingSpeed_`); `readingSpeed` written to Col O Stats JSON |
| 2.5.0 | Jun 2026 | RSE V1 wired into `statSnapshot.memberReadingSpeed` for AI coach; `memberTotalClubPoints` bug fix |
| 2.5.1 | Jun 2026 | BOOK_PACE_SLOWING + GENRE_PACE_MISMATCH insights switch to pages/day (RSE V1); session fallback retained |

---

## ArkaAIpass.gs

**Current: `1.4.0`**

| Version | Date | Summary |
|---|---|---|
| 1.0.0 | pre-2025 | Initial Gemini coach — basic stat snapshot, week pace, streak |
| 1.1.0 | 2025 | Layer 3 per-book velocity; `paceRatio` PACE LOW flag; `genrePaceMap` genre mismatch coaching |
| 1.2.0 | 2025 | Layer 1 Persona DNA (`personaDNA`); archetype-aware coaching brief |
| 1.3.0 | 2025 | Week-position blindness fix; projected weekly pace; 8-week trend in brief |
| 1.4.0 | Jun 2026 | RSE V1 Layer 3 enrichment: daily pace (overall + recent), `moodMultiplier` mood label, genre pg/day alongside per-book velocity |
| 1.4.1 | Jun 2026 | Per-book velocity note switches to pages/day (RSE V1) with session fallback |

---

## ArkaPersonaPass.gs

**Current: `1.0.0`**

| Version | Date | Summary |
|---|---|---|
| 1.0.0 | 2026 | Initial PersonaPass — 6-axis reading DNA; ArkaPersonaProfileDB write; `ARKAPERSONAPASS_READY` gate |

---

## app.js (ArkaClubApp frontend)

**Current: `3.9.1`**

| Version | Date | Summary |
|---|---|---|
| 1.0.0 | pre-2025 | Initial frontend — wave loading, shelves, library, home feed |
| 2.0.0 | 2025 | Reading Together view; Book Details page; Club Shelves |
| 3.0.0 | 2025 | Me Dashboard; badge strip; heatmap; ghost chart; serendipity engine |
| 3.1.0 | 2025 | Library sort chips (Recently Added, A–Z, Top Rated, Most Read) |
| 3.2.0 | Jun 2026 | Reading Together graph fix — null data + `spanGaps:true` for accurate member dots |
| 3.3.0 | Jun 2026 | Club Shelves Finished — orange rating pill on avatar; finished date always shown |
| 3.4.0 | Jun 2026 | Library sort chips: Pages, Year Published, Reading Time, Club Activity; asc/desc toggle |
| 3.5.0 | Jun 2026 | RSE V1 frontend stub — reads `member.stats.readingSpeed` from Col O; raw page fallback |
| 3.6.0 | Jun 2026 | RSE V1 wired into 4 features: insight card pace, pace warning (genre/mood context), serendipity MOOD_MATCH, challenge pace table |
| 3.7.0 | Jun 2026 | Badge proximity confidence bands — 🟢 Easy / 🟡 Stretch / 🔴 Aggressive based on moodMultiplier |
| 3.7.1 | Jun 2026 | Remove confidence band labels from badge proximity strip (too much explanation needed) |
| 3.8.0 | Jun 2026 | 10PAGESADAY challenge detail page — Habit Pulse EKG hero, monthly constellation rings, 3-stat strip (Wks Hit / Max Gap / Recovery), qualification tracker bar, habit science blurb (B.J. Fogg / James Clear) |
| 3.8.1 | Jun 2026 | Fix BOOK_COUNT and PAGE_COUNT frontend sync: monthlyBreakdown keys now YYYY-MM (was short name); weeklyBreakdown keys now YYYY-Www (was W03 without year) — matches GAS schema |
| 3.8.2 | Jun 2026 | Fix chart rendering: monthlyBreakdown lookups in velocity timeline and monthly list now use YYYY-MM keys; BOOK_COUNT bar chart uses YYYY-MM keys — all reads match write format |
| 3.8.3 | Jun 2026 | BOOK_COUNT: booksRead entries use shelfId (not bookId); spine and book-list renderers resolve bookId via shelvesMap.get(shelfId) at render time; globalShelvesDB already excludes Deleted rows |
| 3.8.4 | Jun 2026 | 10PAGESADAY UI polish: brighten suppressed text across hero/stats/monthly/qual sections; fix June week count (include current in-progress week in monthly ring denominator); fix Club section headers for light background |
| 3.8.4 | Jun 2026 | Fix 10PAGESADAY banner fire tile and list card progress bar: targetPages was falling back to 1 (goalConfigJson uses dailyGoal, not targetPages/durationDays); now uses dailyGoal×365 || goalValue; fire tile stat text shows avg pg/day + qualified status |
| 3.9.0 | Jun 2026 | 10PAGESADAY habit-centric redesign: banner fire tile shows habitScore as hero + QUALIFIED chip + avg pg/day (no page-count bar, no challenge title); list card replaces page bar with twin stat boxes (Habit Score + Rank computed from progressValue) + qual chip + pace row |
| 3.9.1 | Jun 2026 | Enrollment deadline enforcement: unenrolled card reads `enrollmentDeadline` from goalConfigJson; shows "⏳ Enrol by dd-MMM-yyyy" when open or "🔒 Enrolment closed" when past; Enrol button replaced with grey "Closed" pill once deadline passes |

---

## ArkaClubApp.html

**Current: `1.3.0`**

| Version | Date | Summary |
|---|---|---|
| 1.0.0 | pre-2025 | Initial HTML shell — GAS HtmlService entry point, stylesheet links, app.js script tag |
| 1.1.0 | 2025 | Added styles.css versioned cache-bust param |
| 1.2.0 | 2025 | styles.css cache-bust updated to `?v=1.2` |
| 1.3.0 | Jun 2026 | 10PAGESADAY EKG hero div added to flush wrapper — persistent DOM for canvas drawing |

---

## ArkaChallengePass.gs

**Current: `1.1.0`**

| Version | Date | Summary |
|---|---|---|
| 1.0.0 | Jun 2026 | Standalone nightly challenge pass — 10PAGESADAY habitScore engine (weeksHit, maxGap, recoveryRate, earlyWeeksHit hidden), zero-state bootstrap, LockService guard, installArkaChallengePassTrigger() |
| 1.1.0 | Jun 2026 | BOOK_COUNT: booksRead entries now store `bookId` (from ActivityLogDB desc) + `finishedOn` in dd-MMM-yyyy format; added `_chalpassFmtDdMmmYyyy_()` helper |
| 1.2.0 | Jun 2026 | BOOK_COUNT: switch source from ActivityLogDB to MemberShelfDB; booksRead entries now store `shelfId` (not bookId); Deleted shelf rows excluded; added MemberShelfDB sheet read + SHELF_COL_* constants |

---

## ArkaMainAppCode.gs

**Current: `1.1.0`** *(versioning started Jun 2026)*

| Version | Date | Summary |
|---|---|---|
| 1.0.0 | pre-Jun 2026 | Core backend — page logging, shelf writes, challenge sync (BOOK_COUNT/PAGE_COUNT), completion detection |
| 1.1.0 | Jun 2026 | Fix progressStateJson key formats: monthlyBreakdown → YYYY-MM (was short name), weeklyBreakdown → YYYY-Www (was W03 without year), both BOOK_COUNT and PAGE_COUNT |
| 1.2.0 | Jun 2026 | BOOK_COUNT: booksRead now uses shelfId from MemberShelfDB Finished rows (not bookId from ActivityLogDB); Deleted status rows excluded |

---

## AkraAdminControlPanel.html / arkaadmin_styles.css / arkaadmin_app.js

**Current: `v3.3`**

| Version | Date | Summary |
|---|---|---|
| v3.0 | pre-Jun 2026 | Initial admin panel — all views, challenge types up to PAGE_COUNT |
| v3.1 | pre-Jun 2026 | BINGO_GRID variants, genre tracking, CompetitionMode enum |
| v3.2 | Jun 2026 | Phase 4 per-view polish — design tokens, CSS class purge, section icons, mobile sub-lines |
| v3.3 | 2026-06-22 | Step 3: 10PAGESADAY challenge type — config form, year-end badge award admin action; legacy TenPagesADay files saved to repo |
| v3.4 | 2026-06-22 | Step 4: BOOK_HUNT challenge type — clue builder, CSV bulk upload, badge IDs, GAS validTypes + progressState; CLAUDE.md updated with all challenge schemas |
| v3.5 | 2026-06-22 | Remove discontinued challenge types: HABIT_STREAK, BUDDY_READ, COUNTRY_SPREAD, ALPHABET — from admin panel, app.js, GAS, and Claude.md |

---

## ArkaApp Version History

| Version | Date       | Notes                                      |
|---------|------------|--------------------------------------------|
| v133    | 2026-06-21 | Fix members banner "pages this year" — now uses Col O Stats JSON (all page types, Wave 1) instead of Finished-only ShelvesDB scan |
| v132    | 2026-06-21 | Finish strip inline confirm; 20% threshold; page log source tags; carry reading log page into shelf finish modal |
| v127    | —          | (last known version before v132)           |

---

## Claude.md

**Current: `1.4.0`**

| Version | Date | Summary |
|---|---|---|
| 1.0.0 | pre-2025 | Initial project reference — architecture, conventions, file map |
| 1.1.0 | 2025 | Added PersonaEngine V1 reference; `Arka_PersonaEngine_V1.md` link |
| 1.2.0 | 2025 | Added RSE V1 to active workstreams; `Arka_ReadingSpeedEngine_V1.md` link |
| 1.3.0 | 2025 | RSE V1 MasterEngine implementation notes; frontend Col O read pattern |
| 1.4.0 | Jun 2026 | (this entry) Versioning system established; VERSIONS.md added |
