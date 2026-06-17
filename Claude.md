# Claude.md — Arka Readers Club App: Project Reference for Claude

> **Purpose:** This file captures all standing instructions, conventions, architecture decisions, and constraints for the Arka project. Claude must read and apply everything here before responding to any Arka-related task. It eliminates the need to repeat context session-by-session.

---

## 0. Quick-Start Checklist (read before every response)

- [ ] Do I have the current version of the relevant file open/read? If not, **ask first**.
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

| File | Purpose | Current Version |
|---|---|---|
| `styles.css` | core style css for the app|
| `app.js` | Core Javascript of the app |  |
| `ArkaAppBody` | Google App Script html file | Versioning done in styles.css and app.js link |
| `ArkaMainAppCode.gs` | Backend GAS — all `google.script.run` handlers | version varibale to be maintained |
| `MasterEngine.gs` | Nightly batch engine — stats, badges, email queue | current |
| `ArkaAIPass.gs` | Gemini AI narrative generation via `UrlFetchApp` | (current) |
| `ArkaEmailPass.gs` | Email pipeline — reads queue, sends, logs | (current) |
| `ArkaPersonaPass.gs` | Reading personality / archetype computation | (current) |
| `ArkaAdminControlPanel.html` | Admin-only control panel (separate GAS file) | v4 |
| `Arka_Help.html` | In-app help content (47 articles as of Jun 2026) | v40 |
| `Arka_Design_Tokens.md` | Design token definitions — single source of truth for colour/type | v1 |
| `ArkaDatabase_Definitions.md` | Column-by-column schema for every sheet | v5 |
| `Arka_Product_Audit_v2.md` | Product audit framework + open items | v2 |

**Version naming:** Frontend increments as `v111`, `v112`, …. Backend as `v55`, `v56`, …. MasterEngine as `v30`, `v31`, …. Never skip or reset version numbers.

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

### Frontend SPA (`ArkaClubApp_v111.html`)
- Single-file HTML/CSS/JS. All frontend logic, CSS, and HTML templates coexist in one file.
- No build step. Served directly by GAS `HtmlService`.
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

### Phase 6 Semantic Tokens (Open — Prerequisite for Dark Mode)
These tokens are **planned but not yet implemented**. Dark mode is blocked until they exist:
- `--color-success` (currently hardcoded `#1d9e75`)
- `--color-danger` (currently hardcoded `#e74c3c`)
- `--color-warning` (currently hardcoded `#ef9f27`)
- `--color-gamification` (currently hardcoded light-purple fills)
- `--color-challenge` (currently hardcoded teal variants)

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

**Score:** ~8.5 / 10 against Arka Product Audit v2.

### Open / In-Progress Items
| Item | Priority |
|---|---|
| Phase 6 semantic color tokens (`--color-success`, `--color-danger`, `--color-warning`, `--color-gamification`, `--color-challenge`) | Prerequisite for dark mode |
| Full `data-action` attribute migration (8/145 done) | Accessibility |
| Structured reading goal fields (replace free-text with `{ type, target, period }`) | Product |
| Remove "Temp" badge | Cleanup |
| `help-whats-new` June 2026 entry | Help content |
| Persona rarity peer signal ("You're 1 of 3 Midnight Scholars") | Product |
| Dark mode (`@media (prefers-color-scheme: dark)` + surface audit) | Blocked by Phase 6 tokens |
| Archetype chip on Home header | Quick win |

---

## 12. Active / Upcoming Workstreams

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

## 14. Communication Style Preferences

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

*Last updated: June 2026 | App version at time of writing: v127*
