# Claude.md — Arka Readers Club App: Project Reference for Claude

> **Purpose:** This file captures all standing instructions, conventions, architecture decisions, and constraints for the Arka project. Claude must read and apply everything here before responding to any Arka-related task. It eliminates the need to repeat context session-by-session.

---

## 0. Quick-Start Checklist (read before every response)

- [ ] Do I have the current version of the relevant file open/read? If not, **ask first**.
- [ ] After any feature or fix, has **VERSIONS.md** been updated with the new version number and a one-line summary? If not, **do it before committing**.
- [ ] Is this a bug fix? Use the **exact fix format** in §3.
- [ ] Does the requested feature need a new OAuth scope? If yes, **block it from the member app** (§7).
- [ ] Is this a visual feature? **Show a mockup first** and wait for approval before writing code (§4).
- [ ] Am I about to add a new hex colour or font stack inline? Use a **design token** instead (§9).
- [ ] Is the change < ~30–40% of the file? Deliver **surgical find/replace blocks**, never a full file dump (§4).

---

## 1. Project Identity

| Field | Value |
|---|---|
| App name | **Arka** — a corporate book club app |
| Community size | ~80 members |
| Primary developer | AJ (product owner + sole developer) |
| Platform | Google Apps Script (GAS), Google Sheets as DB, HtmlService for frontend |
| Deployment | GAS Web App served via `doGet()` |
| Main product goals | Deepen reading engagement · Build community identity · Surface personalised insights |

---

## 2. File Map & Versioning

Full version history for all versioned files lives in **`VERSIONS.md`**.
Each file carries only its current version number in its header comment.
Update `VERSIONS.md` with a one-line summary on every commit that changes a versioned file.

| File | Purpose | Current Version |
|---|---|---|
| `app.js` | Core frontend JavaScript | **v3.7.0** |
| `ArkaClubApp.html` | GAS HtmlService entry point | **v1.2.0** |
| `MasterEngine.gs` | Nightly batch engine — stats, badges, RSE, email queue | **v2.5.0** |
| `ArkaAIpass.gs` | Gemini AI narrative generation via `UrlFetchApp` | **v1.4.0** |
| `ArkaPersonaPass.gs` | Reading personality / archetype computation | **v1.0.0** |
| `styles.css` | Core stylesheet | (cache-busted via URL param) |
| `ArkaMainAppCode.gs` | Backend GAS — all `google.script.run` handlers | (unversioned) |
| `ArkaEmailPass.gs` | Email pipeline — reads queue, sends, logs | (unversioned) |
| `ArkaAdminControlPanel.html` | Admin-only control panel | v4 |
| `Arka_Help.html` | In-app help content | v40 |
| `Arka_Design_Tokens.md` | Design token definitions | v1 |
| `ArkaDatabase_Definitions.md` | Column-by-column schema for every sheet | v5 |
| `Arka_Product_Audit_v2.md` | Product audit framework + open items | v2 |
| `Arka_PersonaEngine_V1.md` | Formal design doc for ArkaPersonaPass | v1 |
| `Arka_ReadingSpeedEngine_V1.md` | Formal design doc for RSE V1 | v1 |
### Member App
| File | Purpose | Notes |
|---|---|---|
| `ArkaClubApp.html` | GAS HTML shell — markup only (367 lines) | Links `styles.css` and `app.js` via GitHub CDN |
| `styles.css` | Member app CSS | Served from GitHub CDN `?v=1.5` |
| `app.js` | Member app JavaScript | Served from GitHub CDN `?v=1.5` |
| `ArkaMainAppCode.gs` | Backend GAS — all `google.script.run` handlers | Version variable in file |
| `MasterEngine.gs` | Nightly batch engine — stats, badges, email queue | current |
| `ArkaAIPass.gs` | Gemini AI narrative generation via `UrlFetchApp` | current |
| `ArkaEmailPass.gs` | Email pipeline — reads queue, sends, logs | current |
| `ArkaPersonaPass.gs` | Reading personality / archetype computation | current |

### Admin Panel
| File | Purpose | Notes |
|---|---|---|
| `AkraAdminControlPanel.html` | GAS HTML shell — markup only (367 lines) | ⚠️ Filename typo: "Akra" not "Arka". Links `arkaadmin_styles.css` and `arkaadmin_app.js` via GitHub CDN |
| `arkaadmin_styles.css` | Admin panel CSS | Served from GitHub CDN `?v=1.0` |
| `arkaadmin_app.js` | Admin panel JavaScript (admin IIFE + reports engine) | Served from GitHub CDN `?v=1.0` |

### Reference & Docs
| File | Purpose |
|---|---|
| `ArkaHelp.html` | In-app help content (47 articles as of Jun 2026) — v11.0 |
| `ArkaDesign_Tokens.md` | Design token definitions — single source of truth for colour/type |
| `ArkaDatabase_Definitions.md` | Column-by-column schema for every sheet |
| `Product_Audit_v3.md` | Latest comprehensive product audit (v127 build) — overall 8.5/10 |
| `Product_Audit_Admin_v1.md` | Admin panel audit — overall 5.4/10 (6.3/10 post-P1) |
| `Arka_PersonaEngine_V1.md` | Formal design doc for ArkaPersonaPass — axes, archetypes, gating logic, frontend integration |
| `Arka_ReadingSpeedEngine_V1.md` | Formal design doc for Reading Speed Engine — pace computation, outlier detection, genre fallback chain, frontend usage |

**Version scheme:** `MAJOR.MINOR.PATCH` — see `VERSIONS.md` for increment rules.

**CDN cache busting:** When deploying changes to `styles.css`, `app.js`, `arkaadmin_styles.css`, or `arkaadmin_app.js`, increment the `?v=X.Y` query string in the corresponding HTML shell file.

---

## 3. Code Fix Format (MANDATORY)

**Every bug fix or code change must use this exact structure. No exceptions.**

1. **Name the function.**
2. **One sentence** explaining what the bug is and why the fix works.
3. Show the exact location then the replacement.

**Format template:**

```
Function: functionName()
Bug: [One sentence — what is wrong and why the fix resolves it.]

Find this in functionName():
```[old code block]```

Replace with:
```[new code block]```
```

- For whole-function replacements: "Replace the entire `functionName()` function with:"
- **Never describe a fix in prose without the accompanying exact code location and replacement block.**
- Old code block must be a verbatim copy of the current file content — not paraphrased.

---

## 4. Delivery Preferences (Critical)

### Surgical Edits Over Full-File Regeneration
- Direct edits of the file in Github
- **Python patch scripts that produce full-file outputs are explicitly rejected.** They are not reviewable and consume excessive tokens.

### Mockup Before Code (AJ's Standard Workflow)
- For **any visual or UI feature**, produce a mockup/wireframe first and wait for explicit approval.
- **Never proceed to code a UI feature without explicit approval of the visual direction.**
- Approval words to look for: "looks good", "go ahead", "implement it", "proceed".

### Know the Code Before Writing It
- **Never write code for a function without first reading its current state in the project files.**
- If the relevant file or function is not in context, **ask AJ to share it** rather than guessing.
- This applies to both frontend and backend files.

### Minimal Valid Fix
- AJ prefers the **most minimal valid fix** over structural refactors.
- Always interrogate whether a simpler targeted change solves the problem before proposing a broader rewrite.
- Push back proactively if a refactor is unnecessary — AJ will ask for it explicitly if he wants it.

---

## 5. Coding Standards

### Documentation Requirements
All functions must have a JSDoc header:
```javascript
/**
 * Function: functionName()
 * Parameters: paramName {Type} — description
 * Return Type: {Type}
 * Logic Summary: One-paragraph plain-English description of what this does
 *   and any non-obvious implementation decisions.
 */
```

Inline comments should explain **why**, not what. Code already shows what it does.

### Variable Naming Conventions

| Context | Convention | Example |
|---|---|---|
| GAS backend constants | `UPPER_SNAKE_CASE` | `SPREADSHEET_ID`, `MEMBERS_SHEET_NAME` |
| GAS backend functions | `camelCase` | `getWave1Data()`, `savePageLog()` |
| Private/helper GAS functions | `camelCase_` (trailing underscore) | `buildBadgeTierMap_()`, `parseArkaDateString_()` |
| Frontend JS variables | `camelCase` | `currentMemberId`, `homeFeedData` |
| Frontend JS constants | `UPPER_SNAKE_CASE` | `ACTIVITY_LOG_FETCH_LIMIT`, `RT_MEMBER_COLORS` |
| CSS classes | `kebab-case` | `feed-sc`, `feed-sc-stat-grid` |
| Data IDs | `ARKA_ENTITY_X` pattern | `ARKA_MEMBER_1`, `ARKA_BOOK_42`, `ARKA_PLOG_3001` |
| Activity types | `ARKA_ACTTYP_VERB` | `ARKA_ACTTYP_BOOKREAD`, `ARKA_ACTTYP_CHALLENGE_ENROLL` |

### ID Naming Reference

| Entity | Format | Sheet |
|---|---|---|
| Member | `ARKA_MEMBER_X` | MemberDB Col A |
| Book | `ARKA_BOOK_X` | ArkaLibraryDB Col A |
| Shelf entry | `ARKA_SHELF_X` | MemberShelfDB Col A |
| Page log | `ARKA_PLOG_X` | PageLogDB Col A |
| Activity log entry | `ARKA_ACT_X` | ActivityLogDB Col A |
| Badge definition | `ARKA_BADGE_X` | BadgeDB Col A |
| Badge award | `ARKA_AWARD_X` | BadgeAwardDB Col A |
| Book post | `ARKA_BOOKPOST_X` | BookPostDB Col A |
| Challenge | `ARKA_CHAL_X` | ChallengeDB Col A |
| Challenge enrollment | `ARKA_ENROLL_X` | ChallengeEnrollmentDB Col A |
| Email queue entry | `ARKA_EMAILQ_X` | EmailQueueDB Col A |
| Reading note | `ARKA_NOTE_X` | ReadingNotesDB Col A |

---

## 6. Architecture Overview

### Frontend SPA (`ArkaClubApp.html` + `styles.css` + `app.js`)
- HTML shell is markup-only (~367 lines). CSS and JS are split into separate files served from the GitHub Pages CDN (`https://abhish3kjain.github.io/arkaapp-frontend/`).
- No build step. Served directly by GAS `HtmlService`. The CDN files are loaded as external `<link>` and `<script src>` tags.
- Same pattern applies to the Admin Panel: `AkraAdminControlPanel.html` + `arkaadmin_styles.css` + `arkaadmin_app.js`.
- External libraries (loaded from CDN, no new OAuth scopes):
  - `Font Awesome 6.4.0` — icons
  - `Chart.js` — data visualisation
  - `Fuse.js` — fuzzy search
  - `D3.js` — planned for Reading Universe Graph
  - Google Fonts (`Merriweather`, `Cinzel`)

### Wave Loading Architecture
App data is loaded in parallel GAS calls on startup:

| Wave | Function | Contents |
|---|---|---|
| Wave 1 | `getWave1Data()` | Member profile, stats, shelf, page log (global 90-day slice) |
| Wave 2 | `getWave2Data()` | Activity log (last 2000 rows), book posts, announcements |
| Wave 3 | `getWave3Data()` | Members list, badges, badge awards, library |
| Wave 3b | `getWave3bData()` | Reading Together data |
| Wave 4 | `getWave4Data()` | Challenges, enrollments, events |
| Wave 5 | `getWave5Data()` | Admin-only data (gated) |

AppLoadTimingDB version format: `v122_ALL` (end-to-end total), `v122_init` (pre-wave), `v122_w1` through `v122_w5` (individual wave calls).

### Backend (`ArkaClubAppCode_v55.gs`)
- All `google.script.run` handlers live here.
- Acts as the API layer between the frontend and Google Sheets.
- Approved OAuth scopes (member app): `Sheets`, `Drive`, `profile/email`, `HtmlService`. **No others.**

### MasterEngine (`MasterEngine_v30.gs`)
- Standalone GAS project. Runs nightly via time-based trigger.
- Responsibilities: stats recalculation, badge awards, email queue sync (`_syncEmailQueue_()`).
- Signals completion to downstream passes via `PropertiesService` flags:
  - `ARKAAIPASS_READY` → ArkaAIPass gate
  - `ARKAPERSONAPASS_READY` → ArkaPersonaPass gate
  - `ARKAEMAILPASS_READY` → ArkaEmailPass gate
- `MASTERSYNC_SOURCE = 'MasterSync Engine'` string is a sentinel — **never change it**.
- `MEMBER_DB_TARGET_COL_COUNT = 21` — MasterEngine pads every row to 21 columns on write.

### ArkaAIPass (`ArkaAIPass.gs`)
- Separate owner-run GAS project. Calls Gemini API via `UrlFetchApp`.
- Uses fingerprint-based skip logic to avoid redundant API calls.
- Results stored in MemberDB Col S (`CoachInsights`) as JSON.
- Respects 15 RPM free-tier limit. Never blocks MasterEngine.

### ArkaEmailPass (`ArkaEmailPass.gs`)
- Separate owner-run GAS project. Reads `EmailQueueDB` PENDING rows, sends via `MailApp`, writes SENT/FAILED.
- Runs at 00:30 nightly (after MasterEngine).
- Dual kill switch: `EMAILPASS_ENABLED` in BackEndConfigDB + `ARKAEMAILPASS_READY` PropertiesService flag.

### Spreadsheets

| Spreadsheet | ID | Used By |
|---|---|---|
| Main app data | `1qXsAAO_9aIEJuTTQ1ziX9s5plvm6WHaVI_zaKcSXF-4` | All GAS files |
| Email backend | `1s5h8T6PGPTOBs_RKJNRJjRCZm8igWJzmniLRoW7BFJA` | MasterEngine + ArkaEmailPass only |

---

## 7. OAuth Scope Constraint (HARD RULE — Never Break)

The **member-facing app** (`ArkaClubApp` + `ArkaClubAppCode`) must **permanently stay within** these already-granted OAuth scopes:
- `spreadsheets` (Sheets read/write)
- `drive` (Drive file access for profile pics)
- `profile` / `email` (Google identity for session resolution)
- `HtmlService` (serving the web app)

### Forbidden from the member app:
- `UrlFetchApp` / external HTTP requests → **blocked** (triggers `external_request` scope)
- `MailApp` / `GmailApp` → **blocked** (triggers mail scope)
- `CalendarApp` → **blocked**
- Any other scope not listed above

### The BackEndEngine Pattern
Any feature requiring a sensitive scope must be routed through a **separate owner-run GAS project** (the future `BackEndEngine`). Communication happens **through the Sheet** — the member app writes a queue row; the BackEndEngine polls and processes it. Members never see a new consent prompt.

**Scope discipline is not a preference. It is a hard constraint. Never propose code that violates it.**

---

## 8. Design System

### Design Token Reference (all new UI must use tokens — never raw hex or font stacks)

```css
/* From :root — Arka_Design_Tokens_v1.md */
--arka-accent:        #A984BA;   /* Primary brand purple */
--arka-accent-hover:  #8b6ba0;   /* Hover / pressed state */
--text-strong:        #2c3e50;   /* Primary text / Midnight Blue */
--text-muted:         #5b6b6e;   /* Secondary text (AA-compliant) */
--surface-alt:        #f8f9fa;   /* Secondary background */
--border-soft:        #ecf0f1;   /* Hairline borders */
--text-faint:         #6a7878;   /* Tertiary text (AA-compliant) */
--neutral-mid:        #bdc3c7;   /* Stronger borders, dividers, dots */
--font-body:          'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
--font-display:       'Cinzel', serif;   /* Ceremonial chrome */
--font-quote:         'Merriweather', Georgia, serif;  /* Daily quote card */
```

**Rules:**
- Never reintroduce raw literals (`#A984BA`, `#7f8c8d`, `#2c3e50`, etc.) anywhere — in CSS, inline `style=""`, or JS template strings. Always use `var(--token)`.
- The only place token literal values may appear is inside the `:root` block.
- New recurring colours must be **promoted to a token**, not hardcoded inline.

### Phase 6 Semantic Tokens (✅ Deployed in `styles.css` lines 18–24)
```css
--color-success:      #1D9E75;   /* success states, approved, streaks */
--color-danger:       #e74c3c;   /* errors, warnings, rejection */
--color-warning:      #e67e22;   /* caution states */
--color-gamification: #EF9F27;   /* XP, points, gamification accents */
--color-challenge:    #534AB7;   /* challenge-specific UI */
```
Dark mode is still blocked pending surface tokenisation (~311 `#ffffff` uses, body background `#f4f7f6`, ~281 other hardcoded colours — see `ArkaDesign_Tokens.md §5`).

### Reusable Component Classes (always prefer these over new patterns)

| Class | Purpose |
|---|---|
| `feed-sc` | Base feed signal card container |
| `feed-sc-stat-grid` | 2-col stat grid inside a card |
| `feed-sc-info-strip` | Info row inside a card |
| `feed-sc-cta-row` | Action button row at card bottom |
| `feed-sc-btn--teal` | Teal CTA button |
| `buildAvatarHtml(...)` | JS function — generates member avatar markup |

---

## 9. Database Quick Reference

Full column specs are in `Arka_Database_Definitions_v5.md`. Key columns to know:

### MemberDB (Main Spreadsheet)
| Col | Field | Key Notes |
|---|---|---|
| A | MemberID | PK. Never reuse. |
| B | Email | Comma-separated for alternates |
| D | DisplayName | Unique, 2–30 chars |
| M | LastAccessed | `dd-MM-yyyy HH:mm:ss Z` — written every session load |
| N | Celebration | JSON `{ badges: [], newLevel: "" }` — MasterEngine writes, `clearMemberCelebration()` clears |
| O | Stats | JSON stats snapshot — MasterEngine is the **sole writer** |
| P | TotalPages | Recalculated by MasterEngine |
| Q | TotalBooks | Recalculated by MasterEngine |
| R | ImageURL | Drive thumbnail `https://drive.google.com/thumbnail?id=X&sz=w400` |
| S | CoachInsights | JSON — ArkaAIPass writes, onboarding sub-key preserved on each run |
| T | ApprovalStatus | `Approved` / `Pending` / `Rejected` |
| U | EmailOptOut | `TRUE` / blank — member-controlled only, never written by MasterEngine |

### Date/Timestamp Formats
| Context | Format |
|---|---|
| ActivityLogDB timestamps | `dd-MM-yyyy HH:mm:ss Z` |
| PageLogDB timestamps | `dd-MM-yyyy HH:mm:ss Z` |
| JoinDate (MemberDB Col E) | `dd-MMM-yyyy` (e.g. `01-Jan-2024`) |
| Arka Z-format | Same as above — client offset embedded in Z component |

### Sheet Name Constants (defined in MasterEngine and ArkaClubAppCode)
```javascript
MEMBERS_SHEET_NAME         = 'MemberDB'
BADGE_DB_SHEET_NAME        = 'BadgeDB'
BADGE_AWARD_DB_SHEET_NAME  = 'BadgeAwardDB'
LIBRARY_SHEET_NAME         = 'ArkaLibraryDB'
CHALLENGE_SHEET_NAME       = 'ChallengeDB'
CHALLENGE_ENROLLMENT_SHEET_NAME = 'ChallengeEnrollmentDB'
MASTERSYNC_SOURCE          = 'MasterSync Engine'  // sentinel — never change
```

---

## 10. Key Architectural Patterns

### GAS Server-Side Cache
- `CacheService.getScriptCache()` is used to cache expensive sheet reads (e.g. BadgeAwardDB).
- Cache keys are namespaced: `arka_cache_badgeawards_v1`.
- MasterEngine calls `invalidateCacheKey()` after nightly writes so the member app gets fresh data.
- Cache key strings in MasterEngine (`MASTER_CACHE_KEYS`) must stay in sync with `CACHE_KEYS` in ArkaClubAppCode.

### LockService Pattern
```javascript
const lock = LockService.getScriptLock();
if (!lock.tryLock(10000)) {
  console.error("Database busy. Aborting sync to prevent data collisions.");
  return;
}
try { /* ... */ } finally { lock.releaseLock(); }
```
Always use `tryLock()` with a timeout. Always release in `finally`.

### Admin Gate (Double Security)
- `doGet()` checks `isAdminMember()` before serving admin HTML.
- `getAdminPanelData()` has its own server-side check (defence-in-depth).
- Admin member IDs: `ADMIN_MEMBER_IDS_BACKEND = ['ARKA_MEMBER_1']` (backend) and `ADMIN_MEMBER_IDS` (frontend). **Keep in sync.**

### Approval Gate
- `getVerifiedMemberId()` enforces `ApprovalStatus === 'Approved'` on every request.
- Any other value (`Pending`, `Rejected`, blank) is denied at the server level.
- This is not just a UI gate — it is enforced in every backend function.

### Challenge Wave Card Logic
- **Wave card** (SS-4 dark header card): shown when ≥ 3 members enrolled within a 7-day window anchored to `Date.now()`.
- **Individual enroll bubble cards**: shown only when < 3 members enrolled in the 7-day window.
- The 7-day window is not gap-based between entries — it is always anchored to `Date.now()`.

### Timestamp / Timezone
- `buildArkaTimestamp_()` embeds the client's UTC offset in the Z component.
- `getISOWeekString_()` in MasterEngine uses GAS script timezone (UTC+0) — a known edge case.
- Frontend streak display is resolved. Backend week-string edge case may still need the local-date-extraction fix.

---

## 11. Current Product Audit Score & Open Items

**Member App:** 8.5 / 10 (Product_Audit_v3.md, v127 build)
**Admin Panel:** 5.4 / 10 (Product_Audit_Admin_v1.md, v127 build)

### Member App — Open Items
| Item | Priority |
|---|---|
| Full `data-action` attribute migration (8 remaining of 145) | Accessibility |
| Structured reading goal fields (replace free-text with `{ type, target, period }`) | Product |
| Remove "Temp" badge | Cleanup |
| `help-whats-new` June 2026 entry | Help content |
| Persona rarity peer signal ("You're 1 of 3 Midnight Scholars") | Product |
| Dark mode (`@media (prefers-color-scheme: dark)` + surface audit) | Blocked — needs surface tokenisation |
| Archetype chip on Home header | Quick win |
| TEN_PAGES_MEMBER_MAP PII in served frontend JS (`app.js` L82–103) | Privacy / security |
| Prediction Engine Phase 1 (Finish Date, DNF Risk, Rating Prediction, Oracle Score) | Approved, not yet built |

| Deprecate admin-only announcements section from main member app — admin panel Announcements section is now the canonical management UI | Deferred — do after P2 sprint |

### Admin Panel — P1 + P2 Items
| Item | Status |
|---|---|
| P1-1: Replace mobile bottom tab strip with hamburger + slide-out drawer | ✅ Done |
| P1-2: Toast obscured by tab strip | ✅ Done (resolved by P1-1) |
| P1-3: Mobile content overlap with topbar | ✅ Done (resolved by P1-1) |
| P1-4: Confirmation modal for Reject and Revoke Access in Approvals | ✅ Done |
| P1-5: Book post delete UI using existing `deleteBookPost()` backend | ✅ Done |
| P2-1: Announcements section — create/edit/archive/pin + member audience picker | ✅ Done |
| P2-2: Events management section using existing `saveEvent()` | ⬜ Next |
| P2-3: Email queue monitor (read-only) | ⬜ Queued |
| P2-4: Mobile table card-view toggle for Approvals and Member Stats | ⬜ Queued |
| P2-5: Approvals bulk-select + bulk-approve | ⬜ Queued |

---

## 12. Active / Upcoming Workstreams

### Reading Speed Engine V1 (Active)
- Design fully documented in `Arka_ReadingSpeedEngine_V1.md`.
- Output stored in `member.stats.readingSpeed` (MemberDB Col O). MasterEngine is the sole writer.
- Key parameters: genre threshold = 3 books, moodMultiplier clamp = [0.4, 2.0], adaptiveIQR clamp = [1.2, 3.0], time-weight full period = 12 months, floor = 0.5 at 36+ months.
- Frontend: Library "Reading Time" sort chip uses RSE fallback chain. Book Detail finish estimate to be upgraded to RSE V1.
- Any change to V1 parameters requires a version bump in the JSON (`v` field) and a new entry in the version history table in the MD file.

### Admin Panel Improvement (Active)
- Audit complete (`Product_Audit_Admin_v1.md`).
- All P1 items shipped. P2-1 (Announcements) shipped.
- P2-2 (Events) is next; P2-3/4/5 queued after.
- See §11 Admin Panel tracking table for full status.


### Prediction Engine Phase 1 (Next Active Workstream)
- Technical design is complete: **Finish Date**, **DNF Risk Score**, **Rating Prediction**, **Oracle Score** mechanic.
- Implementation: pure-arithmetic computation in MasterEngine + shelf card UI in frontend.
- AJ has approved proceeding with coding. This is the next thing to build.

### Code Optimization (Pre-Minification)
- Four-driver analysis is complete (25% line reduction realistic):
  1. CSS class extraction from JS render functions (dominant driver)
  2. Comment condensation
  3. CSS consolidation
  4. Utility helper extraction
- **Recommended sequence:** Build Render CSS layer first → rewrite render functions by feature → strip JSDoc → CSS consolidation pass.
- Execution has not started.

### Dark Mode
- Full Me tab mockup produced. 24-row colour mapping table created.
- **Blocked** until Phase 6 semantic tokens are implemented.

### Reading Universe Graph
- D3.js force-directed visualisation designed.
- No new OAuth scopes required (Gemini theme-tagging routes through existing ArkaAIPass pattern).
- Build not yet started.

### BackEndEngine
- Future separate owner-run GAS project for scope-sensitive features.
- Architecture defined. Not yet built.

---

## 13. What NOT To Do (Explicit Rejections)

| ❌ Do Not | Reason |
|---|---|
| Add `UrlFetchApp`, `MailApp`, `CalendarApp`, or any new scope to the member app | Hard OAuth constraint — members must never see a new consent prompt |
| Write a Python patch script that outputs a full replacement file | Not reviewable, excessive tokens, explicitly rejected by AJ |
| Output the full `ArkaClubApp_v111.html` file for small changes | 42,000+ lines; surgical edits only |
| Write code for a function without reading its current state first | Risk of regressing existing logic |
| Hardcode `#A984BA`, `#7f8c8d`, `#2c3e50`, or any tokenised colour/font | Violates design token system |
| Introduce new CSS class naming patterns | Reuse existing `feed-sc-*` and documented component patterns |
| Proceed to code a UI feature before mockup approval | AJ's workflow requires visual sign-off first |
| Provide a wordy prose description of a fix without the exact code blocks | Violates fix format rule in §3 |
| Assume MasterEngine is the writer for `EmailOptOut` (Col U) | MasterEngine reads it but never writes it — member-controlled only |
| Reuse or renumber an existing `ARKA_ENTITY_X` ID | Primary keys are never reused |

---

## 14. Future Ideas (Parked)

Ideas that have been considered but explicitly deferred. Do not implement without AJ re-raising them.

| Idea | Context | Parked |
|---|---|---|
| Club benchmark on book detail | Show per-member pace bars + club avg pg/day for the book's genre; mockup in `mock-book-detail-club-benchmark.html` | Jun 2026 |

---

## 15. Communication Style Preferences

- **Surgical and direct.** Minimal preamble. Get to the code.
- AJ **interrogates solutions** before accepting them — this is normal, not a rejection. Engage constructively.
- When AJ pushes back on an approach, acknowledge and propose the minimal alternative — do not defend over-engineering.
- Deliver fixes as exact replaceable blocks, not descriptions of what to change.
- Flag trade-offs proactively: if the minimal fix has a known limitation, say so in one sentence before the code block.
- If uncertain about the current state of any function, **ask** rather than guess or assume.

---

## 15. Versioning Discipline

- When providing code that goes into production, state the new version number..
- Never suggest reverting to a prior version as a fix strategy.
- The `help-whats-new` article in `Arka_Help` should be updated whenever user-facing features ship.

---

*Last updated: June 2026 | Member app version: v127 | Admin panel: post-P1-1 (mobile drawer)*

---

## 16. Challenge System — Schemas & Design Reference

### ChallengeDB columns (A–R, 0-indexed 0–17)
```
A=challengeId  B=challengeType  C=title  D=description  E=startDate  F=endDate
G=goalValue    H=goalUnit       I=goalConfigJson  J=status  K=competitionMode
L=seriesTag    M=isPinned       N=createdBy       O=createdOn
P=enrollPoints Q=finishPoints   R=winPoints
```

### ChallengeEnrollmentDB columns (A–I, 0-indexed 0–8)
```
A=enrollmentId  B=challengeId  C=memberId  D=enrolledOn  E=enrollmentStatus
F=currentProgressValue  G=progressStateJson  H=lastProgressUpdate  I=completedOn
```

### CompetitionMode enum
`NONE` | `INDIVIDUAL` | `SHARED` | `TEAM`

---

### Per-type goalConfigJson schemas

#### BINGO_GRID
```json
{
  "variant": "BOOK_BINGO | GENRE_BINGO | AUTHOR_BINGO",
  "gridSize": 5,
  "winCondition": "ALL_CELLS | ANY_LINE",
  "finisherCondition": "ANY_LINE | HALF_CELLS",
  "trackingMode": "CANONICAL | NON_CANONICAL",
  "cells": [
    { "clueId": "C1", "position": [0, 0], "prompt": "A book set in another country" }
  ]
}
```
goalValue = totalCells, goalUnit = "cells"

#### BOOK_COUNT
```json
{
  "defaultGoal": 24,
  "allowPersonalGoal": true
}
```
goalValue = defaultGoal, goalUnit = "books"

#### PAGE_COUNT
```json
{
  "defaultGoal": 5000,
  "allowPersonalGoal": true
}
```
goalValue = defaultGoal, goalUnit = "pages"

#### 10PAGESADAY
```json
{
  "year": 2027,
  "dailyGoal": 10,
  "qualifyingAvgPagesPerDay": 10,
  "enrollmentDeadline": "28-Feb-2027",
  "consistencyMode": true,
  "challengerBadge": "ARKA_BADGE_XXX",
  "finisherBadge":   "ARKA_BADGE_XXX",
  "winnerBadge":     "ARKA_BADGE_XXX"
}
```
goalValue = dailyGoal × 365, goalUnit = "pages"
Badge award triggered manually by admin via `award10PagesADayBadges(challengeId)`.
Page data sourced from PageLogDB (all sources count, including legacy `Data_10PagesADay_*`).

**Mechanic (from 2027, `consistencyMode: true`):**
- Qualification is a live rolling check: `totalPagesSinceEnrollment / daysSinceEnrollment >= 10`. Drops below = disqualified in real time. Recoverable if avg climbs back.
- Winner = highest `habitScore` among currently-qualified members at year end.
- Finisher = `totalPages >= finisherPages` (half-pace threshold, independent of qualification).
- Enrollment closes on `enrollmentDeadline` — late enrollments rejected by GAS.
- `earlyWeeksHit` counts weeks 1–10 from **enrollment date**, not Jan 1.

**habitScore formula:**
```
habitScore = (weeksHit × 10)
           + (earlyWeeksHit × 10)   ← double weight, anchored to enrollment date
           + (recoveryRate × 50)    ← 0–50 pts; recovery after a missed week
           - (maxGap × 5)           ← penalty for longest consecutive zero-page-week gap
```
All inputs derived at sync time from PageLogDB — nothing extra stored in PageLogDB.

**Badge tiers:**
| Badge | Condition |
|---|---|
| Challenger | Enrolled + any pages logged |
| Finisher | Sustained rolling avg ≥ 10 pages/day through year end |
| Winner | Highest habitScore among Finishers |

Finisher = the qualification threshold. No separate Qualifier badge. The `finisherPages` half-pace concept is dropped.

**2023–2026 legacy:** ran as pure PAGE_COUNT (highest total pages wins). `award10PagesADayBadges` reads PageLogDB total — no consistency logic applied to past years.

#### BOOK_HUNT
```json
{
  "clues": [
    { "clueId": "C1", "order": 1, "prompt": "A book with a color in the title", "hint": "Think beyond red and blue" },
    { "clueId": "C2", "order": 2, "prompt": "A book set in Asia", "hint": "" }
  ],
  "totalClues": 20,
  "finisherCondition": "N_CLUES",
  "finisherThreshold": 15,
  "winCondition": "MOST_CLUES",
  "allowMultiClaim": false,
  "requireApproval": false,
  "challengerBadge": "ARKA_BADGE_240",
  "finisherBadge": "ARKA_BADGE_241",
  "winnerBadge": "ARKA_BADGE_242"
}
```
goalValue = totalClues, goalUnit = "clues"
competitionMode = INDIVIDUAL (leaderboard by clues completed).
One distinct shelfId per clue per member — a member cannot use the same book for two clues,
but another member may use the same book for any clue.
Claiming a clue: member links a **currently-reading** book from their shelf.
**Member-side claiming is NOT yet built** — see Future Work below.

---

### Per-type progressStateJson schemas

#### BINGO_GRID
```json
{ "cellsCompleted": [], "booksLinked": {}, "genreTagged": {}, "linesCompleted": [], "hasBingo": false }
```

#### BOOK_COUNT
```json
{ "personalGoal": 24, "booksRead": [], "totalBooks": 0, "pacingProjection": 0, "monthlyBreakdown": {} }
```

#### PAGE_COUNT
```json
{ "personalGoal": 5000, "totalPages": 0, "monthlyBreakdown": {}, "weeklyBreakdown": {},
  "pacingProjection": 0, "aheadBehindTarget": "" }
```

#### 10PAGESADAY
```json
{
  "totalPages": 3240,
  "daysSinceEnrollment": 180,
  "avgPagesPerDay": 18.0,
  "isQualified": true,
  "weeksHit": 24,
  "earlyWeeksHit": 9,
  "maxGap": 1,
  "recoveryRate": 0.85,
  "habitScore": 431,
  "lastSyncedOn": "01-Jul-2027"
}
```
All fields computed from PageLogDB on sync. No day-by-day map stored — derived on demand.

#### BOOK_HUNT
```json
{
  "claims": {
    "C1": { "shelfId": "ARKA_SHELF_42", "bookTitle": "The Red House", "claimedOn": "15-Jun-2026", "status": "Claimed" }
  },
  "completedCount": 2,
  "isFinisher": false,
  "finishedOn": ""
}
```

---

### Future Work — Challenge Member-Side (not yet built)

#### BOOK_HUNT — Member-side claiming
- **Where:** Me tab → Challenges → challenge card → clue grid
- **Flow:** Tap a clue → pick a book from **currently-reading** shelf → confirm → progressStateJson updated
- **Validation:** `status = "Reading"` in MemberShelfDB at claim time; each `shelfId` satisfies only one clue per member
- **GAS function to build:** `claimBookHuntClue(enrollmentId, clueId, shelfId)`

#### 10PAGESADAY — Member-side display
- Progress bar vs yearly goal + monthly breakdown circles (matching legacy TenPagesADay_v3.html UI)
- No new logging needed — reads PageLogDB automatically
- Live leaderboard: two sections — "Qualified (avg ≥ 10 pages/day)" ranked by habitScore, then "Not yet qualified" ranked by avgPagesPerDay with gap-to-qualify shown

#### 10PAGESADAY — Auto-enroll toggle (NOT YET BUILT)
- A toggle on the member's 10PAGESADAY challenge page: "Auto-enroll me next year"
- Toggle state stored as `autoEnrollNextYear: true/false` in ChallengeEnrollmentDB (new col or inside progressStateJson)
- At year-end award computation (`award10PagesADayBadges`): scan all enrollments for the current year's challenge where `autoEnrollNextYear = true`, find next year's challenge record with the same `seriesTag`, create enrollment records for those members
- If next year's challenge record doesn't exist yet, queue them (store pending list somewhere) or skip and let admin trigger manually
- Default state: OFF — member must opt in deliberately (preserves commitment signal)

### Admin Panel Version Control
When bumping the admin panel cache-bust version (`v3.X` in `AkraAdminControlPanel.html`):
- Update both `arkaadmin_styles.css?v=X` and `arkaadmin_app.js?v=X` in the same commit
- Add a row to the `AkraAdminControlPanel` table in `VERSIONS.md`
