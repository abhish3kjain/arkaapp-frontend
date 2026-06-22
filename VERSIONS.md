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

---

## ArkaPersonaPass.gs

**Current: `1.0.0`**

| Version | Date | Summary |
|---|---|---|
| 1.0.0 | 2026 | Initial PersonaPass — 6-axis reading DNA; ArkaPersonaProfileDB write; `ARKAPERSONAPASS_READY` gate |

---

## app.js (ArkaClubApp frontend)

**Current: `3.7.0`**

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

---

## ArkaClubApp.html

**Current: `1.2.0`**

| Version | Date | Summary |
|---|---|---|
| 1.0.0 | pre-2025 | Initial HTML shell — GAS HtmlService entry point, stylesheet links, app.js script tag |
| 1.1.0 | 2025 | Added styles.css versioned cache-bust param |
| 1.2.0 | 2025 | styles.css cache-bust updated to `?v=1.2` |

---

## AkraAdminControlPanel.html / arkaadmin_styles.css / arkaadmin_app.js

**Current: `v3.3`**

| Version | Date | Summary |
|---|---|---|
| v3.0 | pre-Jun 2026 | Initial admin panel — all views, challenge types up to PAGE_COUNT |
| v3.1 | pre-Jun 2026 | BINGO_GRID variants, genre tracking, CompetitionMode enum |
| v3.2 | Jun 2026 | Phase 4 per-view polish — design tokens, CSS class purge, section icons, mobile sub-lines |
| v3.3 | 2026-06-22 | Step 3: 10PAGESADAY challenge type — config form, year-end badge award admin action; legacy TenPagesADay files saved to repo |

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
