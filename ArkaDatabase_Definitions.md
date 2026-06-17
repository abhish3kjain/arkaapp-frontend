
All projects
Arka App
Arka Reader Club App



How can I help you today?


You've used 75% of your weekly limit
Get more usage
Revamping Members section design and layout
Last message 21 hours ago
Optimizing app HTML code before minification
Last message 21 hours ago
Goodreads export issues and data formatting
Last message 3 days ago
Challenge join cards redesign for Home Feed
Last message 3 days ago
Building Arka admin control panel
Last message 3 days ago
Audit v2 report review and next steps
Last message 4 days ago
Boosting engagement through reading data features
Last message 4 days ago
Increasing app adoption through subtle engagement tactics
Last message 6 days ago
Reading Together view redesign and visualization
Last message 7 days ago
Finish card design and trigger improvements
Last message Jun 7
REUSE Prompt to review Arka App
Last message Jun 5
Memory
Only you
Purpose & context AJ is the primary developer and product owner of Arka, a corporate book club app built on Google Apps Script (GAS) with a single-file HTML/JS frontend and Google Sheets as the database backend. The app serves an ~80-member reading community, with the core product goals of deepening reading engagement, building community identity, and surfacing personalized insights. Key architectural components: ArkaClubAppvXXX.html (single-file SPA frontend), ArkaClubAppCodevXX.gs (backend GAS), MasterEngine (nightly computation), ArkaAIPass (Gemini AI narrative generation via UrlFetchApp), ArkaEmailPass.gs (email pipeline), ArkaAdminControlPanel, and a suite of Sheets-based databases (MemberDB, MemberShelfDB, PageLogDB, BadgeDB, BadgeAwardDB, ArkaLibraryDB, EmailQueueDB, EmailSentLogDB, AppLoadTimingDB). Critical OAuth constraint (user-specified): The member-facing app (ArkaClubApp) must stay confined to already-granted OAuth scopes — Sheets, Drive, profile/email, HtmlService. Never add code to the member app that triggers a new consent prompt (e.g., UrlFetchApp/externalrequest, MailApp/GmailApp, CalendarApp). Any feature needing a sensitive scope must be routed to a separate owner-run project (future "BackEndEngine") that communicates via the Sheet (queue/polling), so members never see new permission requests. Design system is defined in ArkaDesignTokensv1.md; key tokens: --arka-accent: #A984BA, --font-body: 'Segoe UI', --text-strong: #2c3e50. --- Current state Codebase size: ArkaClubAppv111.html is ~42,378 lines. A full documentation file (ArkaClubAppDocumentationv1.md, ~3,761 lines) was generated covering 23 functional modules, global state, external call maps, and key architectural call chains. Pre-minification optimization analysis is complete: a four-driver framework identified a realistic 25% line reduction path — CSS class extraction from JS render functions (dominant driver), comment condensation, CSS consolidation, and utility helper extraction. Optimization execution has not yet started; recommended sequence is: build Render CSS layer first → rewrite render functions by feature → strip JSDoc → CSS consolidation pass. Home Feed challenge cards redesigned: SS-4 wave card (dark header, teal label pill, stat grid, avatar stack, 7-day enrollment window) and individual ARKAACTTYPCHALLENGEENROLL bubble cards (mirroring book post card pattern with border-left accent). Five surgical edits were scoped; implementation pending AJ applying them. Admin Control Panel (ArkaAdminControlPanelv2.html) is live with double security gate, lazy-loaded reports, Chart.js trend charts for load performance, and per-wave BigGulpMs breakdowns. Version sorting bug (e.g., v38.5W3 vs v110) was fixed. Reading Together full view is implemented: backend getReadingTogetherData(), Chart.js comparative line chart, member strip, pace table, shared RTMEMBERCOLORS palette. Several bugs fixed (wrong column constants, nudge card overflow, cover image sourcing). Email pipeline (ArkaEmailPass.gs) is complete: four email types (REENGAGEMENT7D/14D/30D, STREAKRISK, CHALLENGEDEADLINE, FINISHNUDGE), EmailQueueDB/EmailSentLogDB pipeline, opt-out flow, click tracking via ?eid= tokens, dual kill switch. Timezone streak fix: buildArkaTimestamp() now embeds client offset in Arka Z-format. Frontend streak display is fully resolved. A backend edge case remains in getISOWeekString() in MasterEngine (uses GAS script timezone / UTC+0); a replacement function extracting local date components directly from the Z-format string prefix was provided but may not yet be applied. Product audit score: ~8.5/10 against the Arka Product Audit v2 report. Remaining open items: Phase 6 semantic color tokens (--color-success, --color-danger, --color-warning, --color-gamification, --color-challenge), full data-action attribute migration, structured reading goal fields, removal of "Temp" badge, help-whats-new June 2026 entry, persona rarity peer signal. --- On the horizon Code optimization execution: Apply the four-driver pre-minification reduction plan (pending; analysis done). Prediction Engine Phase 1: Technical design is complete (Finish Date, DNF Risk Score, Rating Prediction; Oracle Score mechanic). AJ asked to proceed with coding Phase 1 (pure-arithmetic MasterEngine computation + shelf card UI) at end of last relevant session — likely the next active workstream. Dark mode: Full Me tab mockup and 24-row color mapping table produced. Phase 6 semantic tokens are a prerequisite gate before implementation. Reading Universe Graph: D3.js force-directed visualization designed; no new OAuth scopes required (Gemini theme-tagging routes through existing ArkaAIPass UrlFetchApp pattern). Build not yet started. BackEndEngine: Future separate owner-run GAS project for scope-sensitive features; architecture defined but not yet built. WhatsApp engagement strategy: 14-day plan produced to organically convert active WhatsApp members to app users without overt promotion. Phase 6 semantic tokens: Prerequisite for dark mode; still open. --- Key learnings & principles Surgical edits over full-file regeneration: For changes under ~30–40% of a file, AJ strongly prefers targeted find/replace blocks delivered in chat. Full file output is reserved for new files or large merges. Python patch scripts that produce opaque full-file outputs are explicitly rejected — they consume far more tokens and aren't reviewable. Mockup before code: AJ's standard workflow is visual mockup approval first, then surgical code edits. Never proceed to code without explicit approval of the direction. Scope discipline: Any feature that would require a new OAuth consent prompt must be blocked from the member app entirely and queued for BackEndEngine. This is a hard constraint, not a preference. Minimal, targeted fixes: AJ interrogates proposed solutions before accepting them and prefers the most minimal valid fix over structural refactors. He will push back on over-engineered approaches. Wave detection window: Challenge enrollment wave cards use a 7-day window anchored to Date.now() (not gap-based detection between entries). Individual enroll cards appear only when fewer than 3 members enrolled within the window; otherwise suppressed in favor of the SS-4 wave card. AppLoadTimingDB version format: v122ALL = end-to-end total; v122init = pre-wave overhead; v122w1 through v122w3b, v122w4, v122w5 = individual parallel wave GAS calls. --- Approach & patterns Works in a single large HTML file for the frontend SPA; all frontend logic, CSS, and HTML templates coexist in one file. Uses targeted range-based reading of large files rather than sequential full-file scans when analyzing the codebase. Reuses existing design system primitives consistently (feed-sc, feed-sc-stat-grid, feed-sc-info-strip, feed-sc-cta-row, feed-sc-btn--teal, buildAvatarHtml, etc.) rather than introducing new patterns. Naming conventions are consistent throughout: ARKAMEMBERX, ARKABADGEX, ARKAAWARDX, ARKAACTTYPX. AI features (Gemini) are narrowly scoped: numeric computation in MasterEngine, narrative generation in ArkaAIPass, fingerprint-based skip logic to avoid redundant API calls, results stored in MemberDB Col S CoachInsights JSON. Engagement strategy favors organic, psychology-backed mechanics (curiosity gaps, social proof via peer seeders, Fogg behavior model friction reduction) over direct promotion. --- Tools & resources Platform: Google Apps Script, HtmlService, Google Sheets Frontend: Single-file HTML/CSS/JS SPA; Chart.js for data visualization; D3.js for graph features AI: Gemini via UrlFetchApp (owner-side only, through ArkaAIPass) Design reference: ArkaDesignTokensv1.md Documentation: ArkaClubAppDocumentation_v1.md (generated output, ~3,761 lines) Audit framework: Arka Product Audit v2 (written against v109/v51; current score ~8.5/10)

Last updated 15 hours ago

Instructions
Always provide code with proper documentation. Use good variable naming convention considering the fact that app is ever growing. Always code when you have current state of code and databases known else ask. Code fix format rule: When providing bug fixes or code changes, always use this exact format for every change: (1) Name the function. (2) One sentence explaining what the bug is and why the fix works. (3) Show the exact line(s) to find, then the replacement block. Use "Find this in functionName():" followed by the old code in a block, then "Replace with:" followed by the new code. For whole-function replacements say "Replace the entire functionName() function with:". Never describe fixes in prose without accompanying the exact code location and replacement.

Files
59% of project capacity used
Search mode

ArkaClubApp_v111.html
42,709 lines

html



MasterEngine_v30.gs
5,572 lines

text



ArkaClubAppCode_v55.gs
9,469 lines

text



Arka_Database_Definitions v5.md
633 lines

md



ArkaAdminControlPanel_v4.html
3,911 lines

html



Arka_Help_v40.html
11,478 lines

html



ArkaPersonaPass.gs
1,363 lines

text



ArkaEmailPass.gs
775 lines

text



ArkaAIPass.gs
783 lines

text



Arka_Product_Audit_v2.md
373 lines

md



Arka_Design_Tokens_v1.md
115 lines

md


Arka_Database_Definitions v5.md


# Arka Readers Club — Database Definitions
**Main Spreadsheet ID:** `1qXsAAO_9aIEJuTTQ1ziX9s5plvm6WHaVI_zaKcSXF-4`
**Email BackEnd Spreadsheet ID:** `1s5h8T6PGPTOBs_RKJNRJjRCZm8igWJzmniLRoW7BFJA`
**Last updated:** Jun 2026 | **App version at time of update:** v110
 
---
 
## Table of Contents
 
### Main Spreadsheet (`1qXsAAO_9aIEJuTTQ1ziX9s5plvm6WHaVI_zaKcSXF-4`)
1. MemberDB
2. PageLogDB
3. ArkaLibraryDB
4. MemberShelfDB
5. ActivityLogDB
6. ActivityTypeDB
7. FeedbackDB
8. ClubPointLevelDB
9. BookPostDB
10. BadgeDB
11. BadgeAwardDB
12. EventDB
13. EventRSVPDB
14. ChallengeDB
15. ChallengeEnrollmentDB
16. AnnouncementDB
17. AppLoadTimingDB
18. PersonaProfileDB
19. ReadingNotesDB
### Email BackEnd Spreadsheet (`1s5h8T6PGPTOBs_RKJNRJjRCZm8igWJzmniLRoW7BFJA`)
20. EmailQueueDB
21. EmailSentLogDB
22. BackEndConfigDB
---
 
## 1. MemberDB
**Purpose:** The identity core. One row per registered member. The authoritative source for all member profile data, cumulative stats, and the badge ID cache.
 
| Col | Field | ID Format / Values | Notes |
|-----|-------|-------------------|-------|
| A | MemberID | `ARKA_MEMBER_X` | Primary key. Sequential integer suffix. Never reuse a deleted ID. |
| B | Email | `user@gmail.com` or comma-separated | Primary Gmail used for Google auth. Alternate Gmails comma-separated. Used by `getVerifiedMemberId()` for session resolution. |
| C | FullName | string | "Signature" name displayed under bio on profile. |
| D | DisplayName | string | Primary app handle/nickname. Shown everywhere in feeds. Must be unique, 2–30 chars. |
| E | JoinDate | `dd-MMM-yyyy` | Date member completed registration. Used for Anniversary badge calculation. |
| F | Country | string | User-provided location. Free text. |
| G | ShortBio | string | Personal introduction text. Shown on profile card. |
| H | LangSpoken | string | Languages with proficiency levels, comma-separated. e.g. `English (Native), Spanish (B1)` |
| I | LinkedIn | URL or blank | Full URL to LinkedIn profile. |
| J | Goodreads | URL or blank | Full URL to Goodreads profile. |
| K | FavGenre | string | Preferred book categories, comma-separated. Member-defined, not normalised. |
| L | ReadingGoal | string | Personal reading goal as free text. e.g. `Read 50 books this year` |
| M | LastAccessed | `dd-MM-yyyy HH:mm:ss Z` | Timestamp of last app open. Written on every session load. Used by Anniversary badge gate (7-day activity check). |
| N | Celebration | JSON string or blank | Pending celebration payload written by MasterEngine. Shape: `{ "badges": ["ARKA_BADGE_X", …], "newLevel": "Level Name" }`. `badges` — IDs of badges earned since the member last dismissed the celebration card; MasterEngine appends, never overwrites. `newLevel` — most recent level the member advanced to; MasterEngine replaces on every level-up (only the latest matters). Blank = nothing pending. Cleared to `''` by `clearMemberCelebration()` when the member dismisses the card. Source of truth for badge data remains BadgeAwardDB — this column is a notification signal only. |
| O | Stats | JSON string | Nightly stats snapshot written by MasterEngine. Shape: `{ "allTime": { arkaPoints, pages, books, reviews, ratings, genres, libraryAdded, badges, ploggerWeeks, longestStreak }, "2026": { same keys }, "2025": { same keys }, … }`. The `allTime` key holds lifetime cumulative values recalculated from full source tables every nightly run. Each year key (e.g. `"2026"`) holds stats for that calendar year and is never modified once the year rolls over — old year keys accumulate as a permanent history. MasterEngine is the sole writer. The frontend reads this via `member.stats` (exposed by `getWave1Data()`). **Do not edit manually.** Legacy: prior to this format, Col O held a plain integer (TotalClubPoints). `_parseStatsJson_()` in MasterEngine handles the backward-compatible read for any pre-migration cells still holding integers. || P | TotalPages | integer | Lifetime cumulative pages read, summed from PageLogDB. Recalculated by MasterEngine. |
| Q | TotalBooks | integer | Lifetime count of unique Finished books from MemberShelfDB. Recalculated by MasterEngine. |
| R | ImageURL | Drive thumbnail URL | `https://drive.google.com/thumbnail?id=FILE_ID&sz=w400` Google Drive thumbnail of member avatar. |
| S | CoachInsights | JSON string or blank | Computed insight payload. Shape: `{ tasks: [...], insights: {...}, aiAdvice: "...", statSnapshot: {...}, onboarding: { dismissed: bool, selfReported: string[], lastUpdated: string } }`. The `onboarding` sub-key is written by `saveOnboardingProgress()` and `markCoachTaskComplete()` when the member confirms self-reported tasks or dismisses the card. MasterEngine writes the full object on every nightly sync but preserves the existing `onboarding` sub-key. Blank for new members until the first nightly run. |
 
| T | ApprovalStatus | `Approved` / `Pending` / `Rejected` | Access gate. Enforced server-side in `getVerifiedMemberId()` and `initializeUser()` — only an exact `Approved` grants access; `Pending`/`Rejected`/blank are denied. New registrations start `Pending`. No grandfather rule: existing members must be set to `Approved` manually. Written by `setMemberApprovalStatus()` (admin) and seeded by `registerNewMember()`. |
| U | EmailOptOut | `TRUE` / blank | Email notification opt-out flag. `TRUE` = member has opted out and receives no Arka emails. Blank or `FALSE` = opted in (default for all members). Written by `updateEmailOptOut()` when the member flips the toggle in Edit Profile → Email Notifications. Read by MasterEngine's `_syncEmailQueue_()` — opted-out members are skipped when writing EmailQueueDB PENDING rows. Never written by MasterEngine. |
 
**Key constraints:**
- Col A: Never reuse. Middle-row deletions break the `lastRow + 1` ID pattern — use `RepairMemberIDs.gs` after any deletion.
- Col D: Unique across all members. Enforced at registration and profile edit.
- Col O: MasterEngine is the single writer via `_parseStatsJson_()` + Stats JSON build. Manual edits will be overwritten on next sync. Do not store plain integers in this column after the first post-deployment nightly run.
- Cols P, Q: MasterEngine is the single writer. Retained for backward compatibility; can be retired in a future cleanup pass once all consumers read from Col O Stats JSON.- Col N: Written only by MasterEngine (`autoAwardBadge_()`) and cleared by `clearMemberCelebration()` when the member dismisses the card. Never write manually — the payload must be the canonical JSON shape `{ badges: string[], newLevel: string }`. Col N is a notification signal only; the source of truth for badge ownership is BadgeAwardDB.
- Col T: MasterEngine pads every row to 21 columns (`MEMBER_DB_TARGET_COL_COUNT = 21`) so full-row writes never go ragged or truncate this column.
- Col U: Never written by MasterEngine — member-controlled only via `updateEmailOptOut()`. MasterEngine reads it as a gate in `_syncEmailQueue_()` but never overwrites it.
---
 
## 2. PageLogDB
**Purpose:** Immutable reading session ledger. Every page-log action creates one row. Source of truth for streak calculation, PLogger metric, and total pages.
 
| Col | Field | ID Format / Values | Notes |
|-----|-------|-------------------|-------|
| A | LogID | `ARKA_PLOG_X` | Primary key. Sequential. |
| B | Timestamp | `dd-MM-yyyy HH:mm:ss Z` | When the session was logged. Time stored in GAS script timezone (+0100). Frontend should pass `Intl.DateTimeFormat().resolvedOptions().timeZone` with writes (deferred). |
| C | MemberID | `ARKA_MEMBER_X` | FK → MemberDB. Who logged the session. |
| D | BookID | `ARKA_BOOK_X` | FK → ArkaLibraryDB. Which book was read. | "For unlinked page logs, contains a MaterialType string instead of a BookID (e.g. Academic, News / Journalism). Format is always distinct from ARKA_BOOK_X — backend resolves by checking for the ARKA_BOOK_ prefix."
| E | PagesDelta | integer | Pages read in this session (positive = progress). Zero or negative = correction entry; earns no points. |
| F | Source | `ArkaClubApp` or `10PagesADay` | Which app surface originated this log. Used for analytics. |
 
**Key constraints:**
- Rows are never deleted or updated after insert. Corrections are new rows with negative/zero delta.
- MasterEngine reads all rows to compute TotalPages (Col P of MemberDB) and streak metrics.
- Streak and PLogger badge calculations use `Timestamp` (Col B) to determine ISO week membership.
---
 
## 3. ArkaLibraryDB
**Purpose:** The shared club book repository. One row per unique book title. Shared across all members.
 
| Col | Field | ID Format / Values | Notes |
|-----|-------|-------------------|-------|
| A | BookID | `ARKA_BOOK_X` | Primary key. Sequential. |
| B | Title | string | Formal title of the book. |
| C | Author | string | Primary author name. |
| D | Genre | string | Comma-separated genre tags. Free text. Used by Genre Explorer (canonical alias matching) and Genre Collector (synonym-collapsed). Canonical genres: Fiction, Fantasy, Sci-Fi, Crime & Suspense, Non-Fiction, Self-Help, Philosophy, Psychology, Classics, Religious, Horror, Business, Poetry. |
| E | Pages | integer | Total page count of the physical/digital edition. Used for Fat Read badge evaluation. Must be > 0 for Fat Read to qualify. |
| F | AddedBy | `ARKA_MEMBER_X` | Who first added the book. Used by Librarian badge count. |
| G | AddedDate | `dd-MMM-yyyy` | Date the book was added to the library. |
| H | LastModifiedDate | `dd-MM-yyyy HH:mm:ss Z` | Full timestamp of the last metadata edit. |
| I | LastModifiedBy | `ARKA_MEMBER_X` | Who last edited the book metadata. Subject to 30-day cooldown rule in MasterEngine. |
| J | CoverURL | Drive thumbnail URL or blank | `https://drive.google.com/thumbnail?id=FILE_ID&sz=w400` Stored at w400; frontend requests smaller sizes by swapping `sz` param. |
| K | ISBN13 | 13-digit string or blank | Standard international book number. Used for auto-fill via ISBN lookup. |
| L | PublishedDate | year or date string | Year or date the book was first published. |
| M | Blurb | string | Short synopsis or description. Optional. |
 
**Key constraints:**
- Col D genre tags must use the canonical genre list (or recognised aliases) for badge engine accuracy.
- Col E (Pages) is critical for Fat Read badge — books with 0 or blank pages never qualify.
- Col F (AddedBy) drives the Librarian badge. Must contain a valid `ARKA_MEMBER_X`.
---
 
## 4. MemberShelfDB
**Purpose:** Personal reading progress tracker. One row per member–book pairing. A member can have multiple rows for the same book (re-reads).
 
| Col | Field | ID Format / Values | Notes |
|-----|-------|-------------------|-------|
| A | ShelfID | `ARKA_SHELF_X` | Primary key. Sequential. |
| B | MemberID | `ARKA_MEMBER_X` | FK → MemberDB. Owner of this shelf record. |
| C | BookID | `ARKA_BOOK_X` | FK → ArkaLibraryDB. The book being tracked. |
| D | Status | `To Read`, `Reading`, `Finished`, `Did Not Finish`, `Deleted` | Current reading status. Drives activity log entries and Club Points. Only `Finished` counts toward Book Milestone and Genre Explorer badges. `Deleted` is a soft-delete sentinel — the row is never physically removed. See constraints below. |
| E | Rating | `0`–`5` integer | Star rating. 0 = unrated. Displayed as stars in the UI. MasterEngine deduplicates — only the first rating entry per shelf record earns CP. |
| F | Review | string | Free-text review. Displayed on book detail page. MasterEngine deduplicates — only the first review entry per shelf record earns CP. |
| G | DateAdded | `dd-MMM-yyyy` | When the book was first put on shelf. |
| H | DateUpdated | `dd-MMM-yyyy` | When status or pages were last changed. |
| I | DateFinished | `dd-MMM-yyyy` or blank | Date member marked the book Finished. Used by `runYearEndBadgePass()` to count books finished per calendar year. |
| J | PagesRead | integer | Current page number reached. Updated on each page log. Cannot exceed the book's total pages by more than the `PAGE_DEVIATION_MULTIPLIER` tolerance. |
| K | LastModifiedOn | `dd-MM-yyyy HH:mm:ss Z` | Full technical audit timestamp of last write. |
 
**Key constraints:**
- `Finished` status + `DateFinished` (Col I) is the source for yearly Bookworm of the Year counting.
- Genre Explorer uses `Finished` rows only — DNF does not contribute.
- Fat Read uses `Finished` rows only — book page count is looked up from ArkaLibraryDB Col E.
- `Deleted` rows are **never physically removed** from the sheet. They are invisible to the frontend (filtered in `getWave3Data()` before Wave 3 is sent) and ignored by all MasterEngine badge and stats passes which guard on `status === 'Finished'`. They remain readable by the backend `updateMemberShelf()` for the recycle strategy below.
- **Soft-delete:** When a member removes a book from their shelf, `deleteShelfRecord()` sets Col D to `Deleted`, Col E (Rating) to `0`, and Col F (Review) to `''` in a single atomic write. An `ARKA_ACTTYP_SHELFDELETE` activity is logged as an audit trail. MasterEngine Rule 8 uses this entry to generate CP reversal corrections for all direct shelf activities referencing that `ShelfID`.
- **Recycle on re-add:** If a member re-adds a previously deleted book, `updateMemberShelf()` finds the `Deleted` row via `deletedFallbackRowIndex` (Standard Search scans all statuses but skips Deleted rows for active-record logic) and overwrites it in place — resetting all fields to fresh values — rather than appending a new row. This keeps the DB lean. A new row is only created when no Deleted row exists for that member+book (genuinely new addition or deliberate re-read of an active Finished record).
- Cols E and F (Rating, Review) are always cleared to `0` / `''` when Status is set to `Deleted`. Stale rating/review values on a Deleted row would incorrectly surface in book detail avg ratings, review cards, and the rating sort.
---
 
## 5. ActivityLogDB
**Purpose:** The append-only social feed engine and financial ledger for Club Points. Every user action and every MasterEngine write produces a row here.
 
| Col | Field | ID Format / Values | Notes |
|-----|-------|-------------------|-------|
| A | ActivityID | `ARKA_ACT_X` | Primary key. Sequential. Never reuse. Generated by `lastRow + 1` pattern — safe only inside `LockService` or `logActivityBatch()`. |
| B | ActivityTypeID | `ARKA_ACTTYP_X` or `SYS_ACTTYP_X` | FK → ActivityTypeDB. Drives feed display, point validation, and audit rules. |
| C | ActivityDate | `dd-MM-yyyy HH:mm:ss Z` | When the action occurred. GAS script timezone. |
| D | MemberID | `ARKA_MEMBER_X` | Who performed or received the action. |
| E | Description | string | Contextual payload. Format varies by ActivityTypeID — see ActivityTypeDB reference table below. |
| F | Source | `ArkaClubApp vX`, `MasterSync Engine`, `10PagesADay` | Which system wrote this row. `MasterSync Engine` is a sentinel string — **never change**. Used by `findLastMasterSyncRowIndex()`. |
| G | CPAwarded | integer | Club Points awarded for this action. May be 0 or negative (corrections). For variable-point types, injected at log time. For fixed types, must match ActivityTypeDB multiplier (Rule 5). |
 
**Key constraints:**
- Rows are **never** deleted. Feed display logic uses `status` and activity type filtering for visibility.
- All writes outside MasterEngine must use `logActivityBatch()` (locked) to prevent ID collisions.
- `SYS_ACTTYP_*` rows are hidden from the home feed. `ARKA_ACTTYP_*` rows are visible unless explicitly filtered.
- `ARKA_ACTTYP_MILESTONE_PAGES` and `ARKA_ACTTYP_MILESTONE_BOOKS` are **retired** — no longer written. Historical rows remain for audit continuity. Both types remain in `VARIABLE_POINT_TYPES` to prevent Rule 5 from re-validating them.
- `ARKA_ACTTYP_PERSONAUPDATE` carries CP 0 and is written by PersonaPass, not the member. It is listed in `VARIABLE_POINT_TYPES` so MasterEngine Rule 5 never validates its CP against a fixed multiplier, and in `HIDDEN_TYPES` in `buildFeedAggregator` so it stays out of the home feed (silent deploy). Rows are an audit trail only — the "How You've Changed" persona timeline reads them directly.
- `ARKA_ACTTYP_SHELFDELETE` is hidden from the home feed via `HIDDEN_TYPES` in `buildFeedAggregator`. It is an audit trail entry only — MasterEngine Rule 8 reads it on each nightly sync to identify soft-deleted shelves and generate CP reversal corrections for all related shelf activities. CP awarded is always 0.---
## 6. ActivityTypeDB
**Purpose:** The point economy rulebook. One row per activity type. Defines the CP multiplier and human-readable label for every action in the system.
 
| Col | Field | ID Format / Values | Notes |
|-----|-------|-------------------|-------|
| A | ActivityTypeID | `ARKA_ACTTYP_X` or `SYS_ACTTYP_X` | Primary key. `ARKA_` = user-visible; `SYS_` = system/hidden. |
| B | ActivityClubPoints | integer (can be 0 or negative) | CP multiplier. For variable-point types this is 0 or a placeholder — actual CP is injected at log time. |
| C | ActivityType | string | Human-readable name. e.g. `Finished a Book` |
| D | ActivityDescription | string | Internal description of when and how this type fires. |
| E | ActivityIntroDate | `dd-MMM-yyyy` | When this activity type was added to the system. |
| F | LogDescriptionFormat | string | Template for the `Description` field written to ActivityLogDB Col E. |
 
**Complete ActivityType Reference:**
 
| ActivityTypeID | CP | Human Name | Description | Intro | Col E Description Format |
|---|---|---|---|---|---|
| `ARKA_ACTTYP_WHATSAPP` | 5 | Shared to WhatsApp | Fires when a member shares club content to the WhatsApp group via the in-app share button. **Inactive** — button not yet built. | 22-Feb-2026 | `Preview: <message text>` |
| `ARKA_ACTTYP_BOOKADDED` | 150 | Added Book to Library | Fires when a member adds a new book record to ArkaLibraryDB. Duplicate titles are blocked by the backend before this is logged. | 22-Feb-2026 | `<BookID>` |
| `ARKA_ACTTYP_BOOKUPDATE` | 100 | Updated Book Details | Fires when a member edits the metadata of an existing library book (cover, page count, blurb). Subject to a 30-day cooldown per book per member enforced by MasterEngine. | 25-Feb-2026 | `<BookID>` |
| `ARKA_ACTTYP_BOOKREADING` | 30 | Started Reading | Fires when a member sets a book's shelf status to Reading. | 3-Mar-2026 | `<ShelfRecordID>` |
| `ARKA_ACTTYP_BOOKREAD` | 300 | Finished a Book | Fires when a member sets a book's shelf status to Finished. | 22-Feb-2026 | `<ShelfRecordID>` |
| `ARKA_ACTTYP_BOOKTOREAD` | 10 | Added to To Read | Fires when a member sets a book's shelf status to To Read. | 1-Mar-2026 | `<ShelfRecordID>` |
| `ARKA_ACTTYP_BOOKDNF` | 10 | Marked Did Not Finish | Fires when a member sets a book's shelf status to Did Not Finish (DNF). | 2-Mar-2026 | `<ShelfRecordID>` |
| `ARKA_ACTTYP_SHELFUPDATE` | 0 | Updated Shelf Record | Fires when a member edits an existing shelf record without changing its status (e.g. correcting a page position). **Hidden from home feed.** Audit trail only. | 25-Feb-2026 | `<ShelfRecordID> \| Pages: <newPagesRead>` |
| `ARKA_ACTTYP_SHELFDELETE` | 0 | Delete Shelf Record | Fires when a member deletes an existing shelf record. **Hidden from home feed.** MasterEngine Rule 8 reads these rows to generate CP reversal corrections for all related shelf activities. | 3-Apr-2026 | `<ShelfRecordID>` |
| `ARKA_ACTTYP_PAGEREAD` | 4* | Logged Pages | Fires when a member logs a reading session. Points = positive page delta × 4. Zero points if new page count is lower than previous (correction entry). | 22-Feb-2026 | `+<deltaPages> pages \| ShelfID: <ShelfRecordID> \| Note: <userNote>` |
| `ARKA_ACTTYP_BOOKRATING` | 60 | Rated a Book | Fires when a member submits or changes a star rating on a finished book. MasterEngine deduplicates — only one rating award per shelf record is retained. | 22-Feb-2026 | `<ShelfRecordID>` |
| `ARKA_ACTTYP_BOOKREVIEW` | 250 | Reviewed a Book | Fires when a member writes or edits a text review on a finished book. MasterEngine deduplicates — only one review award per shelf record is retained. | 22-Feb-2026 | `<ShelfRecordID>` |
| `ARKA_ACTTYP_PROFILEUPDATE` | 25 | Updated Profile | Fires when a member saves changes to their profile (bio, languages, social links, etc.). One point-earning update per day enforced by MasterEngine audit. | 22-Feb-2026 | `Fields changed: <changedFields>` |
| `ARKA_ACTTYP_PROFILENEW` | 1 | Joined the Club | Fires once when a new member completes registration and their profile is created. | 22-Feb-2026 | `—` |
| `ARKA_ACTTYP_MEMBERLEVELUP` | 0 | Levelled Up | Fires when a member crosses a level threshold. No CP — the level itself is the reward. Written immediately after the point sync that caused the level change. | 28-Feb-2026 | `From: <previousLevelName> \| To: <newLevelName>` |
| `ARKA_ACTTYP_FEEDBACK` | 150 | Submitted Feedback | Fires when a member submits a bug report or feature suggestion via the in-app feedback form. | 6-Mar-2026 | `Type: <Bug/Feature> \| Area: <appSection>` |
| `ARKA_ACTTYP_BOOKPOST` | 50 | Posted Book Discussion | Fires when a member publishes a discussion post (General Note, Quote I Loved, or Fan Cast) on a book's detail page. | 13-Mar-2026 | `<BookPostID>\|<BookID>` |
| `ARKA_ACTTYP_BADGEAWARD` | 0* | Badge Awarded | Fires when an admin manually awards a badge to a member. `CPAwarded` is set at log time to the badge's own point value from BadgeDB — the multiplier of 0 here is a placeholder only. | 14-Mar-2026 | `<AwardID>` |
| `ARKA_ACTTYP_BADGEREVOKE` | 0* | Badge Revoked | Fires when an admin revokes a badge from a member. `CPAwarded` is set at log time to the negative of the original badge point value, reversing the award. | 14-Mar-2026 | `<AwardID>` |
| `ARKA_ACTTYP_EVENTCREATED` | 10 | Created an Event | Fires when an admin or eligible member creates a new event in the system. | 15-Mar-2026 | `<EventID>` |
| `ARKA_ACTTYP_EVENTRSVP` | 5 | RSVPed to Event | Fires when a member RSVPs Yes or Maybe to an event. No CP for No responses. **Hidden from feed** when RSVP status is later updated to No. | 15-Mar-2026 | `<RSVP_ID>` |
| `ARKA_ACTTYP_EVENTATTENDED` | 0* | Attended Event | Fires when admin confirms a member's attendance at a club event. `CPAwarded` is injected at log time from a hardcoded map keyed on `eventType` and host status. | 15-Mar-2026 | `<EventID> \| Type: <eventType> \| Host: <true/false> \| Points: <cpAwarded>` |
| `ARKA_ACTTYP_EVENTCANCELLED` | 0 | Event Cancelled | Fires when an admin cancels a club event. No CP. **Hidden from home feed.** Audit and notification purposes only. | 15-Mar-2026 | `<EventID>` |
| `ARKA_ACTTYP_EVENTHOSTED` | 0* | Hosted Event | Fires alongside `EVENTATTENDED` when the attending member is the confirmed host. `CPAwarded` injected from the same hardcoded host map. | 18-Mar-2026 | `<EventID> \| Type: <eventType> \| Points: <cpAwarded>` |
| `ARKA_ACTTYP_ANNOUNCEMENTPOSTED` | 0 | Announcement Posted | Fires when an admin publishes a club-wide announcement. No CP. **Hidden from feed.** | 15-Mar-2026 | `<AnnouncementID>` |
| `ARKA_ACTTYP_CHALLENGE_ENROLL` | 0* | Enrolled in Challenge | Fires when a member enrols in a challenge. CP = `ChallengeDB.enrollPoints`, injected at log time. | 16-Mar-2026 | `<EnrollmentID> \| Points: <enrollPoints>` |
| `ARKA_ACTTYP_CHALLENGE_FINISH` | 0* | Finished a Challenge | Fires when a member's enrollment status transitions to Finisher. CP = `ChallengeDB.finishPoints`, injected at log time. | 16-Mar-2026 | `<EnrollmentID> \| Points: <finishPoints>` |
| `ARKA_ACTTYP_CHALLENGE_WIN` | 0* | Won a Challenge | Fires when a member's enrollment status transitions to Winner. CP = `ChallengeDB.winPoints`, injected at log time. | 16-Mar-2026 | `<EnrollmentID> \| Points: <winPoints>` |
| `ARKA_ACTTYP_CHALLENGE_DROP` | 0 | Dropped a Challenge | Fires when a member withdraws from an active challenge enrollment. No CP. Audit trail for admin drop-rate reporting. | 18-Mar-2026 | `<EnrollmentID>` |
| `ARKA_ACTTYP_PERSONAUPDATE` | 0 | Reading Personality Shift | Fires from the nightly PersonaPass when a member's verdict on a persona axis changes (including first-time resolution from a gated/forming state). One row per changed axis. **Hidden from home feed** (`HIDDEN_TYPES`). Sole history source for the "How You've Changed" persona timeline. | 2-Jun-2026 | `Axis: <axisName> \| <oldSide> → <newSide> \| Archetype: <oldArchetype> → <newArchetype>` |
| `ARKA_ACTTYP_SHAREPROGRESS` | 15 | Shared Progress | Fires when a member shares their reading progress to an external channel (e.g. WhatsApp). One CP-earning share per day enforced by MasterEngine audit. | 7-Jun-2026 | `Channel: <channelName> \| Shared: <weeklyPulse/badge/streak>` |
| `SYS_ACTTYP_CLUBPOINTS_UPDATE` | 0 | System: Sync Club Points | Written by MasterEngine after recalculating a member's true point total and syncing it to MemberDB. **Hidden from feed.** | 22-Feb-2026 | `Delta: <+/- points> synced to profile` |
| `SYS_ACTTYP_CLUBPOINTS_ADD` | 0 | System: Add Bonus Points | Written when an admin manually credits bonus points to a member's account outside the normal activity flow. | 22-Feb-2026 | `Points: <delta> \| Reason: <reasonText>` |
| `SYS_ACTTYP_CLUBPOINTS_CORRECTION` | 0 | System: Points Correction | Negative correction written by MasterEngine when an audit rule violation is detected (e.g. duplicate rating, same-day profile update spam). `CPAwarded` always negative. | 12-Mar-2026 | `Reason: <ruleViolated> \| Offsetting: <ActivityID>` |
| `SYS_ACTTYP_TOTALPAGES_UPDATE` | 0 | System: Sync Total Pages | Written by MasterEngine after syncing a member's cumulative page count to MemberDB. **Hidden from feed.** | 7-Mar-2026 | `Delta: <+/- pages> synced to profile` |
| `SYS_ACTTYP_TOTALBOOKS_UPDATE` | 0 | System: Sync Total Books | Written by MasterEngine after syncing a member's cumulative finished-book count to MemberDB. **Hidden from feed.** | 7-Mar-2026 | `Delta: <+/- books> synced to profile` |
| `SYS_ACTTYP_PAGEREAD` | 0* | System: Add Pages | Admin or system mechanism to credit pages and points directly (e.g. data imports, manual corrections). `CPAwarded` written directly to the log — multiplier not used. | 7-Mar-2026 | `Reason: <reasonText> \| Points Awarded: <cpAwarded>` |
| `SYS_ACTTYP_BADGEAWARD` | 0 | System: Auto-Award Badge | **RETIRED.** Legacy type — no longer written. Kept in `VARIABLE_POINT_TYPES` for audit safety. Historical rows remain valid. | 22-Feb-2026 | `<BadgeID>` |
| `ARKA_ACTTYP_MILESTONE_PAGES` | 0 | Page Milestone Reached | **RETIRED.** Legacy milestone type replaced by badge system. Historical rows intact. | 7-Mar-2026 | `<thresholdPages>` |
| `ARKA_ACTTYP_MILESTONE_BOOKS` | 0 | Book Milestone Reached | **RETIRED.** Legacy milestone type replaced by badge system. Historical rows intact. | 7-Mar-2026 | `<thresholdBooks>` |
 
*Variable CP — actual value injected at log time; the ActivityTypeDB multiplier of 0 is not used for point calculation.
 
**Key constraints:**
- All writes outside MasterEngine must use `logActivityBatch()` (locked) to prevent ID collisions.
- `SYS_ACTTYP_*` rows and types marked **Hidden from home feed** are filtered in `buildFeedAggregator` via the `HIDDEN_TYPES` set.
- `ARKA_ACTTYP_PERSONAUPDATE` is listed in both `VARIABLE_POINT_TYPES` (so Rule 5 never validates its CP against a fixed multiplier) and `HIDDEN_TYPES` (silent deploy — feed-invisible). Written by PersonaPass only, never by the member frontend.
- `ARKA_ACTTYP_SHELFDELETE` is **Hidden from home feed.** MasterEngine Rule 8 reads it on each nightly sync to identify soft-deleted shelves and generate CP reversal corrections for all related shelf activities. CP awarded is always 0.
- `ARKA_ACTTYP_WHATSAPP` is defined but **not yet wired** — no in-app share button exists. No rows will be written until the button is built.
- `ARKA_ACTTYP_SHAREPROGRESS` enforces one CP-earning share per day via MasterEngine audit (same pattern as `ARKA_ACTTYP_PROFILEUPDATE`).
- `ARKA_ACTTYP_BADGEREVOKE` writes a negative `CPAwarded` equal to the original badge point value. MasterEngine Rule logic should treat this the same as `SYS_ACTTYP_CLUBPOINTS_CORRECTION` for point reconciliation.
- Retired types (`SYS_ACTTYP_BADGEAWARD`, `ARKA_ACTTYP_MILESTONE_PAGES`, `ARKA_ACTTYP_MILESTONE_BOOKS`) remain in `VARIABLE_POINT_TYPES` to prevent Rule 5 from re-validating historical rows. No new rows are ever written for these types.
---
 
## 7. FeedbackDB
**Purpose:** Internal support log. Every bug report and feature request submitted via the in-app feedback form. Admin-reviewed only, not visible to members.
 
| Col | Field | ID Format / Values | Notes |
|-----|-------|-------------------|-------|
| A | Timestamp | `dd-MM-yyyy HH:mm:ss Z` | When the feedback was submitted. No primary key — row order is the identifier. |
| B | MemberID | `ARKA_MEMBER_X` | Who submitted the feedback. |
| C | MemberName | string | DisplayName at submission time. Denormalised for quick admin reference. |
| D | AppSource | string | App version at submission time. e.g. `v49` |
| E | Category | `Bug`, `Feature` | Type of submission. |
| F | Section | string | App area where the issue or idea applies. e.g. `Home Feed`, `Library`, `Badge Gallery` |
| G | Description | string | The full feedback text. |
| H | Status | `Open`, `In Progress`, `Resolved` | Admin-managed workflow status. Updated manually in the sheet. |
 
---
 
## 8. ClubPointLevelDB
**Purpose:** The progression engine. Defines the CP thresholds and names for all 100 member levels. Read-only at runtime — no writes during app operation.
 
| Col | Field | ID Format / Values | Notes |
|-----|-------|-------------------|-------|
| A | LevelNum | integer `1`–`100` | Sequential rank. |
| B | MaxClubPoints | integer | Upper CP boundary for this level. Once a member's TotalClubPoints exceeds this value they advance to the next level. |
| C | LevelName | string | Display title. e.g. `Page Turner I`, `Bookworm V`, `Oracle X` |
 
**Level tiers:** Page Turner (1–10) → Bookworm (11–20) → Scholar (21–30) → Bibliophile (31–40) → Scribe (41–50) → Sage (51–60) → Luminary (61–70) → Maven (71–80) → Virtuoso (81–90) → Oracle (91–100). Max level CP: 1,110,000.
 
---
 
## 9. BookPostDB
**Purpose:** Community discussions. Members post notes, quotes, and fan casts on individual book pages.
 
| Col | Field | ID Format / Values | Notes |
|-----|-------|-------------------|-------|
| A | BookPostID | `ARKA_BOOKPOST_X` | Primary key. Sequential. |
| B | BookID | `ARKA_BOOK_X` | FK → ArkaLibraryDB. The book being discussed. |
| C | MemberID | `ARKA_MEMBER_X` | FK → MemberDB. Author of the post. |
| D | Timestamp | `dd-MM-yyyy HH:mm:ss Z` | When the post was published. |
| E | PostType | `General Note`, `Quote I Loved`, `Fan Cast` | Category driving display icon and layout. |
| F | Content | string | Full post text. Line breaks preserved. |
| G | Status | `Active`, `Deleted` | Soft delete — `Deleted` rows hidden from display but retained for audit. |
| H | LikeCount | integer | Running total of likes. Updated in-place when a member likes the post. |
 
**Key constraints:**
- Max 3 CP-earning posts per member per calendar day (Rule 7 in MasterEngine). Posts beyond the cap are still saved and visible — only the CP is reversed.
---
 
## 10. BadgeDB
**Purpose:** The badge catalogue. One row per badge definition. Includes the 225 auto-awarded system badges (milestones, streaks, genres etc.) and any admin-created special badges.
 
| Col | Field | ID Format / Values | Notes |
|-----|-------|-------------------|-------|
| A | BadgeID | `ARKA_BADGE_X` | Primary key. Sequential. |
| B | Caption | string | Short display name. e.g. `Page Voyager`, `Fantasy Fan` |
| C | Description | string | Full description of what the badge represents and how to earn it. |
| D | ImgUrl | Drive thumbnail URL or blank | `https://drive.google.com/thumbnail?id=FILE_ID&sz=w400` — Frontend swaps `sz` for size variants. Blank until image uploaded via admin panel. |
| E | BadgePoints | integer | Club Points awarded when this badge is earned. Injected as `CPAwarded` in the `ARKA_ACTTYP_BADGEAWARD` log entry. |
| F | BadgeCategory | see values below | Gallery section grouping and MasterEngine routing key. |
| G | BadgeTier | integer `0`–`N` | Ordering within a replacing series. `1` = lowest tier, highest integer = max tier. `0` for non-tiered badges (YEARLY, SPECIAL). |
| H | BadgeMeta | string or blank | Auxiliary context: genre name for GENRE_EXPLORER (e.g. `Fantasy`), `YYYY\|TYPE_CODE` for YEARLY (e.g. `2025\|CRITIC_OF_YEAR`), blank for all others. |
 
**BadgeCategory values:**
 
| Category | Description | Display | Tiers |
|---|---|---|---|
| `PAGE_MILESTONE` | Lifetime pages crossed a threshold | Replacing | 10 tiers |
| `BOOK_MILESTONE` | Lifetime books finished crossed a threshold | Replacing | 10 tiers |
| `STREAK_MILESTONE` | All-time best consecutive ISO-week reading streak | Replacing | 9 tiers |
| `PLOGGER` | Total unique ISO weeks with at least one page log | Replacing | 9 tiers |
| `REVIEW_MILESTONE` | Lifetime reviews written crossed a threshold | Replacing | 10 tiers |
| `FAT_READ` | Finished a single book of N+ pages | Replacing | 8 tiers |
| `GENRE_EXPLORER` | Finished N books in a specific canonical genre | Replacing per genre | 10 tiers × 13 genres |
| `GENRE_COLLECTOR` | Unique normalised genre strings across all finished books | Replacing | 8 tiers |
| `ANNIVERSARY` | Years as an active Arka Club member | Replacing | 11 tiers |
| `SOCIAL_BUTTERFLY` | Events attended | Replacing | 8 tiers |
| `LIBRARIAN` | Books added to the library | Replacing | 7 tiers |
| `YEARLY` | Annual award (Critic of the Year, Bookworm, etc.) | All earned shown; current year targets shown greyed | 0 (non-tiered) |
| `SPECIAL` | Admin-created one-off badges | Earned only, no teasers | 0 |
 
**Replacing display rule:** Gallery and badge strip show only the highest-tier Active award per series. All tiers are permanently stored in BadgeAwardDB — the filter is display-only and never revokes records.
 
---
 
## 11. BadgeAwardDB
**Purpose:** Immutable ledger of every badge award and revocation. One row per award event.
 
| Col | Field | ID Format / Values | Notes |
|-----|-------|-------------------|-------|
| A | AwardID | `ARKA_AWARD_X` | Primary key. Sequential. Never reuse. |
| B | BadgeID | `ARKA_BADGE_X` | FK → BadgeDB. Which badge was awarded. |
| C | MemberID | `ARKA_MEMBER_X` | FK → MemberDB. Who received the badge. |
| D | AwardedBy | `ARKA_MEMBER_X` or `MasterEngine` | Who or what awarded the badge. `MasterEngine` (literal string) = auto-awarded by system. Any `ARKA_MEMBER_X` = admin-awarded manually. |
| E | AwardedDate | `dd-MMM-yyyy` | Date of the award. |
| F | Status | `Active`, `Revoked` | `Active` = currently held. `Revoked` = admin-revoked; CP is reversed via `ARKA_ACTTYP_BADGEREVOKE` activity entry. Records are never deleted. |
| G | Notes | string or blank | Optional admin note on manual awards. For revocations: reason and revoking admin ID written here. |
 
**Key constraints:**
- Duplicate guard: `awardBadgeToMember()` and `autoAwardBadge_()` both check for an existing `Active` row with the same `BadgeID` + `MemberID` before inserting.
- When MasterEngine re-awards a previously revoked badge it creates a **new row** — it does not flip the status of the old row.
- `MemberDB.Celebration` (Col N) is a notification signal written by MasterEngine. It is not a source of truth — BadgeAwardDB remains authoritative for all badge ownership queries.
---
 
## 12. EventDB
**Purpose:** Club event calendar. One row per event — meetings, book buddy reads, social events, and more.
 
| Col | Field | ID Format / Values | Notes |
|-----|-------|-------------------|-------|
| A | EventID | `ARKA_EVENT_X` | Primary key. Sequential. |
| B | EventType | `Meeting-Virtual`, `Meeting-F2F`, `BookBuddyRead`, `Social`, `Other` | Drives UI icon and badge colour. Used in event-type CP map for attendance awards. |
| C | Title | string | Display name of the event. |
| D | Description | string | Full event details. Can be long. |
| E | HostMemberID | `ARKA_MEMBER_X` or blank | Optional event host. When confirmed as host, fires `ARKA_ACTTYP_EVENTHOSTED` alongside `ARKA_ACTTYP_EVENTATTENDED`. |
| F | StartDate | `dd-MMM-yyyy` | Event start date. |
| G | StartTime | `HH:mm` | 24-hour format. |
| H | EndDate | `dd-MMM-yyyy` | Event end date. Can equal StartDate for single-day events. |
| I | EndTime | `HH:mm` | 24-hour format. |
| J | MeetingLink | URL or blank | Zoom/Meet/Teams link for virtual events. |
| K | AssetsJson | JSON string or blank | Consolidated media attachments. Format: `[{"type":"Photo","title":"...","link":"..."}]` No separate assets sheet. |
| L | Status | `Active`, `Cancelled`, `Completed` | `Cancelled` fires `ARKA_ACTTYP_EVENTCANCELLED`. `Completed` set by admin after event. |
 
---
 
## 13. EventRSVPDB
**Purpose:** RSVP and attendance ledger. One row per member per event. Created when a member RSVPs or when an admin pre-adds them.
 
| Col | Field | ID Format / Values | Notes |
|-----|-------|-------------------|-------|
| A | RSVPId | `ARKA_RSVP_X` | Primary key. Sequential. |
| B | EventID | `ARKA_EVENT_X` | FK → EventDB. Which event this RSVP is for. |
| C | MemberID | `ARKA_MEMBER_X` | FK → MemberDB. Which member this row belongs to. |
| D | RSVPStatus | `Yes`, `No`, `Maybe`, `Invited` | Member's own response. `Invited` = pre-added by admin/host; member has not yet responded. `Yes`/`Maybe` fire `ARKA_ACTTYP_EVENTRSVP` and earn CP. `No` earns no CP. |
| E | RSVPDate | `dd-MM-yyyy HH:mm:ss Z` | Timestamp of RSVP or when the invitation row was created. |
| F | AttendanceConfirmed | `Yes`, `No`, blank | Post-event admin confirmation of physical/virtual attendance. Blank until admin marks it. |
| G | ConfirmedBy | `ARKA_MEMBER_X` or blank | Which admin confirmed the attendance. |
| H | ConfirmedOn | `dd-MM-yyyy HH:mm:ss Z` or blank | When attendance was confirmed. Fires `ARKA_ACTTYP_EVENTATTENDED` (and `ARKA_ACTTYP_EVENTHOSTED` if member is the host). |
| I | AddedBy | `ARKA_MEMBER_X` | Who created this RSVP row. Self = member RSVPed themselves. Otherwise = admin or host pre-added them. |
 
**Key constraints:**
- `AttendanceConfirmed = Yes` is the trigger for Social Butterfly badge count in MasterEngine.
- One row per member–event pair. Updating an existing RSVP changes Col D in-place; a new row is not created.
---
 
## 14. ChallengeDB
**Purpose:** Club challenge definitions. One row per challenge edition. Challenges may have multiple enrollments (ChallengeEnrollmentDB).
 
| Col | Field | ID Format / Values | Notes |
|-----|-------|-------------------|-------|
| A | ChallengeID | `ARKA_CHAL_X` | Primary key. Sequential. |
| B | ChallengeType | `HABIT_STREAK`, `BINGO_GRID`, etc. | Type code. Drives the UI renderer and progress tracking logic for each challenge variant. |
| C | Title | string | Display name. e.g. `Book Bingo 2026` |
| D | Description | string | What members need to do to complete or win the challenge. |
| E | StartDate | `dd-MMM-yyyy` | Challenge opens for enrollment. |
| F | EndDate | `dd-MMM-yyyy` or blank | Challenge closes. Blank = open-ended. |
| G | GoalValue | integer | Primary numeric target. e.g. `24` for a 24-book challenge. |
| H | GoalUnit | `pages`, `books`, `letters`, `countries`, etc. | Unit of the goal metric. Drives progress bar label. |
| I | GoalConfigJson | JSON string or blank | Type-specific configuration. e.g. Bingo grid square definitions. Format varies by ChallengeType. |
| J | Status | `Active`, `Upcoming`, `Completed`, `Archived` | Drives visibility in Challenges tab. `Active` = enrollable and in progress. |
| K | IsCompetitive | `TRUE`/`FALSE` | If TRUE, shows a leaderboard tab within the challenge card. |
| L | SeriesTag | string or blank | Groups multiple editions of the same challenge. e.g. `BOOK_BINGO` groups all annual Bingo editions. |
| M | IsPinned | `TRUE`/`FALSE` | If TRUE, challenge is pinned to the top of the Challenges list. |
| N | CreatedBy | `ARKA_MEMBER_X` | Who created the challenge. Admin only. |
| O | CreatedOn | `dd-MM-yyyy HH:mm:ss Z` | When the challenge was created. |
 
---
 
## 15. ChallengeEnrollmentDB
**Purpose:** Member participation ledger for challenges. One row per member–challenge pairing.
 
| Col | Field | ID Format / Values | Notes |
|-----|-------|-------------------|-------|
| A | EnrollmentID | `ARKA_ENRL_X` | Primary key. Sequential. |
| B | ChallengeID | `ARKA_CHAL_X` | FK → ChallengeDB. Which challenge. |
| C | MemberID | `ARKA_MEMBER_X` | FK → MemberDB. Which member. |
| D | EnrolledOn | `dd-MM-yyyy HH:mm:ss Z` | When the member enrolled. Fires `ARKA_ACTTYP_CHALLENGE_ENROLL`. |
| E | EnrollmentStatus | `Active`, `Winner`, `Finisher`, `Dropped` | Current participation status. `Winner` and `Finisher` fire their respective activity log entries and award CP. `Dropped` fires `ARKA_ACTTYP_CHALLENGE_DROP` (no CP). |
| F | CurrentProgressValue | integer | Quick-read integer snapshot of current progress. e.g. books completed so far. Updated alongside Col G. |
| G | ProgressStateJson | JSON string | Full serialised progress state. Format varies by ChallengeType. e.g. Bingo grid completion map. Read and written by the challenge progress engine. |
| H | LastProgressUpdate | `dd-MM-yyyy HH:mm:ss Z` | Timestamp of most recent progress write. |
| I | CompletedOn | `dd-MM-yyyy HH:mm:ss Z` or blank | When status transitioned to Winner or Finisher. |
 
---
 
## 16. AnnouncementDB
**Purpose:** Club-wide announcements shown in the home feed banner. Admin-managed.
 
| Col | Field | ID Format / Values | Notes |
|-----|-------|-------------------|-------|
| A | AnnouncementID | `ARKA_ANN_X` | Primary key. Sequential. |
| B | Title | string | Short headline. Displayed as the banner title. |
| C | Body | string | Full announcement text. Supports line breaks. |
| D | IsPinned | `TRUE`/`FALSE` | If TRUE, pins the announcement to the top of the home feed banner. |
| E | ExpiryDate | `dd-MMM-yyyy` or blank | After this date the announcement stops displaying. Blank = no expiry. |
| F | Status | `Active`, `Archived` | `Active` = visible. `Archived` = hidden. The backend only sends `Active` rows to the frontend. |
| G | CreatedBy | `ARKA_MEMBER_X` | Which admin created the announcement. |
| H | CreatedOn | `dd-MM-yyyy HH:mm:ss Z` | When the announcement was published. Fires `ARKA_ACTTYP_ANNOUNCEMENTPOSTED` (no CP, hidden from feed). |
| J | DismissedBy | comma-separated `ARKA_MEMBER_X` or blank | Members who have permanently dismissed this announcement. Written by `dismissAnnouncementPermanently()`. Never set for pinned announcements — they cannot be dismissed. |
 
---
 
## 17. AppLoadTimingDB
**Purpose:** Performance monitoring. Records app load times silently on each member session open. Internal use only — not visible to members.
 
| Col | Field | ID Format / Values | Notes |
|-----|-------|-------------------|-------|
| A | MemberID | `ARKA_MEMBER_X` or `UNKNOWN` | Who loaded the app. `UNKNOWN` if session was unresolvable. |
| B | Timestamp | `dd-MM-yyyy HH:mm:ss Z` | When the load completed. |
| C | AppVersion | string | App version at time of load. e.g. `v49` |
| D | BigGulpMs | integer | Milliseconds from T0 to Big Gulp (Wave 1 data fetch) success handler firing. Includes network round-trip + GAS execution time. |
| E | RenderMs | integer | Milliseconds from Big Gulp complete to first full render. Client-side only. |
| F | TotalMs | integer | Total perceived load time (D + E). The primary performance KPI. |
 
**Key notes:**
- All writes via `logAppLoadTime()` which is fire-and-forget — failures are swallowed silently.
- No primary key — row order is the only identifier. Do not sort or reorder this sheet.
- Use this data to identify regressions after major deployments.
---
## 18. PersonaProfileDB
**Purpose:** Denormalized, pre-computed Reading Personality snapshot. **One row per member**, rewritten in full by the nightly PersonaPass (`runArkaPersonaPass`). This is a display cache, **not** a ledger — it lets any member's profile card and full personality panel render from a single row without crunching another member's PageLogDB client-side (cross-member page logs are never loaded into the app). BadgeAwardDB remains the source of truth for *which* personas are held; this table is the display + insight layer. The "How You've Changed" timeline is **not** stored here — it is read from `ARKA_ACTTYP_PERSONAUPDATE` rows in ActivityLogDB.
 
| Col | Field | ID Format / Values | Notes |
|-----|-------|-------------------|-------|
| A | MemberID | `ARKA_MEMBER_X` | Primary key. FK → MemberDB. One row per member, upserted by PersonaPass. Keyed on member — not a sequential autoincrement. |
| B | ArchetypeKey | `ARKA_PERSONA_ARCH_X` or blank | Stable key of the synthesized headline type (e.g. `ARKA_PERSONA_ARCH_MIDNIGHTSCHOLAR`). Blank if too few axes resolved to name an archetype. |
| C | ArchetypeName | string | Denormalized display name (`The Midnight Scholar`). Stored flat so the profile card needs no second lookup. |
| D | ArchetypeEmoji | string | Display glyph (`🌙`). Denormalized for the card header. |
| E | ArchetypeTagline | string | The italic one-liner under the archetype name. |
| F | AxisVerdicts | JSON string | Full spectrum. Array of `{ axis, side, badgeID, position, gated, note }`. `position` 0–100 drives the slider marker; `gated:true` = "still forming" — render the nudge instead of a verdict. Single source for the whole spectrum section. JSON (not flat columns) so new axes need no schema migration. |
| G | Insights | JSON string | "Things you didn't know" payload. Array of `{ kind, glyph, stat, caption, accent }`. Pre-computed because cross-member PageLog is not available client-side. |
| H | BlindSpot | JSON string or blank | The single highlighted dark-card insight: `{ eyebrow, text }`. Separate from G so PersonaPass can null it without disturbing the strip. |
| I | RaritySummary | JSON string | `{ archetypeShare: "3/47", axisRarities: { rhythm: "1/6", … } }`. Computed club-wide in the same pass and stored per member to avoid a club-wide recount on every profile open. |
| J | ComputedDate | `dd-MMM-yyyy` | When PersonaPass last wrote this row. Drives the "as of …" label and lets the engine skip members whose underlying data fingerprint is unchanged. |
| K | EngineVersion | string | e.g. `PersonaEngine v1`. Lets a logic change force-recompute rows written by an older ruleset. |
| L | Status | `Active`, `Suppressed` | `Active` = render normally. `Suppressed` = member opted out of public personality display; own profile still shows it, others' do not. Rows never deleted. |
 
**Key constraints:**
- Upsert, not append: PersonaPass overwrites the existing row for a member by MemberID. There is at most one row per member.
- Not the timeline source: this table holds only the *current* snapshot. Historical drift lives in `ARKA_ACTTYP_PERSONAUPDATE` rows.
- Personas carry **0 AP** by design — re-evaluable badges must never inflate the points economy. Awarding/superseding happens in BadgeAwardDB; this table only mirrors the resolved state for display.
## 19. ReadingNotesDB
**Purpose:** Immutable reading diary ledger. One row per saved note. Stores freeform session notes written during page logging. Source of truth for the future reading diary UI. Never mutated after insert — corrections are new rows.
 
| Col | Field | ID Format / Values | Notes |
|-----|-------|-------------------|-------|
| A | NoteID | `ARKA_NOTE_X` | Primary key. Sequential integer suffix. Never reuse a deleted ID. |
| B | Timestamp | `dd-MM-yyyy HH:mm:ss Z` | When the note was saved. Stored in GAS script timezone (+0100). |
| C | MemberID | `ARKA_MEMBER_X` | FK → MemberDB. Who wrote the note. |
| D | PlogID | `ARKA_PLOG_X` or blank | FK → PageLogDB. The page log session this note was written alongside. Resolves to BookID or MaterialType via PageLogDB Col D of that row. Blank is reserved for future standalone diary entries not tied to a page log event. |
| E | NoteText | string, max 10,000 chars | Freeform diary entry. Never empty — rows with blank NoteText are never written. Client enforces 10,000-char limit with a live counter. |
| F | Source | `QuickLog` \| `ProgressLog` | Which modal surface originated the note. `QuickLog` = unlinked page logger (Me tab). `ProgressLog` = book reading progress logger. Used for analytics on member logging habits. |
 
**Key constraints:**
- Rows are never deleted or updated after insert. This is an append-only diary ledger.
- A row is only written when `NoteText.trim().length > 0`. The backend `appendReadingNote()` function enforces this guard before every write.
- Col D (PlogID) is always populated for `QuickLog` and `ProgressLog` sources — the PLOG row is created first in the same function call, and its ID is passed directly to the note writer. A valid FK is guaranteed when the field is non-blank.
- Never part of the Big Gulp initial load. Fetched lazily per member via `getMemberNotes(memberId)` only when the diary view is opened.
- MasterEngine does not read or write this table. It is owned entirely by the frontend logging flow.
---
 
## Email BackEnd Spreadsheet
**Spreadsheet ID:** `1s5h8T6PGPTOBs_RKJNRJjRCZm8igWJzmniLRoW7BFJA`
**Owner:** Club admin (owner-run GAS project only — never accessed by the member-facing app)
**Purpose:** All outbound email infrastructure. Kept separate from the main spreadsheet so email queue state never touches data the member app reads, and so `MailApp` OAuth scope is permanently isolated to the BackEndEngine project.
 
---
 
## 20. EmailQueueDB
**Purpose:** Nightly job queue for outbound member emails. MasterEngine's `_syncEmailQueue_()` appends PENDING rows each night after evaluating member eligibility. ArkaEmailPass reads PENDING rows at 00:30, sends via `MailApp`, and updates each row to SENT or FAILED. EmailSentLogDB is the permanent audit trail — EmailQueueDB rows may be periodically purged after 90 days.
 
| Col | Field | ID Format / Values | Notes |
|-----|-------|-------------------|-------|
| A | QueueID | `ARKA_EMAILQ_X` | Primary key. Sequential integer suffix. Written by MasterEngine. |
| B | MemberID | `ARKA_MEMBER_X` | FK → MemberDB (main spreadsheet). Who this email is addressed to. |
| C | EmailAddress | `user@gmail.com` | Primary email only (first value from MemberDB Col B, before any comma). Copied at queue-write time so ArkaEmailPass needs no main-sheet read. |
| D | DisplayName | string | Member display name at queue-write time. Used for email personalisation. |
| E | EmailType | `REENGAGEMENT_7D` / `REENGAGEMENT_14D` / `REENGAGEMENT_30D` / `STREAK_RISK` / `CHALLENGE_DEADLINE` / `FINISH_NUDGE` | Determines which email template ArkaEmailPass uses. Priority order enforced by MasterEngine: STREAK_RISK > CHALLENGE_DEADLINE > FINISH_NUDGE > REENGAGEMENT_30D > REENGAGEMENT_14D > REENGAGEMENT_7D. At most one row per member per night. |
| F | PayloadJSON | JSON string | All personalisation data pre-baked by MasterEngine. Shape: `{ displayName, archetype, daysSinceLastLog, daysSinceAccess, currentBookTitle, currentBookAuthor, recentWeekCount, challengeTitle, challengeType, challengeDaysLeft, challengeCurrent, challengeGoal, finishBookTitle, finishBookAuthor, finishPagesLeft, clubHighlights: [{ memberDisplayName }] }`. ArkaEmailPass reads no main-sheet data — everything needed for composition is here. |
| G | ScheduledDate | `dd-MMM-yyyy` | The date MasterEngine wrote this row (i.e. tonight's date). |
| H | Status | `PENDING` / `SENT` / `FAILED` / `SUPPRESSED` | Lifecycle state. ArkaEmailPass updates this in-place immediately after each send attempt — prevents double-sends if the pass crashes mid-loop and restarts. `SUPPRESSED` = valid row but skipped (e.g. unknown EmailType). |
| I | SentAt | `dd-MM-yyyy HH:mm:ss Z` or blank | Timestamp written by ArkaEmailPass on successful send. Blank until sent. |
| J | TrackingToken | `ARKA_ET_XXXXXXXX` | Unique 8-char alphanumeric token appended to the email deep-link URL (`?eid=`). When the member opens the app via the link, `logEmailClick()` logs `ARKA_ACTTYP_EMAIL_CLICK` with this token as the description. MasterEngine matches it back here to populate ClickedAt. |
| K | ClickedAt | `dd-MM-yyyy HH:mm:ss Z` or blank | Back-filled nightly by MasterEngine's `_syncEmailQueue_()` when a matching `ARKA_ACTTYP_EMAIL_CLICK` activity is found in ActivityLogDB. Blank = email not yet clicked or token not yet matched. |
| L | CampaignID | string | Analytics identifier. Format: `emailtype_yyyyMMdd` e.g. `streak-risk_20260613`. Used to slice click rates and open rates by campaign in the sheet. |
| M | CreatedAt | `dd-MM-yyyy HH:mm:ss Z` | When MasterEngine wrote this row. Used by the frequency cap check — MasterEngine skips members whose most recent PENDING or SENT row was created within `EMAIL_FREQ_CAP_DAYS` days. |
 
**Key constraints:**
- One row per member per night maximum. Priority logic in `_syncEmailQueue_()` enforces this.
- FAILED rows do not count toward the frequency cap — a failed send should not block a retry the following night.
- Status is updated in-place (not appended) by ArkaEmailPass so crash recovery never re-sends a SENT email.
- Rows older than 90 days may be purged periodically. EmailSentLogDB is the permanent record.
- Never written by the member-facing app. Read-only from MasterEngine (via BackEndEngine project).
---
 
## 21. EmailSentLogDB
**Purpose:** Permanent, append-only audit log of every email send attempt. Never purged. Provides the historical record for deliverability analysis, click-rate reporting, and member communication history. ArkaEmailPass appends one row per send attempt (success or failure) after the queue loop completes.
 
| Col | Field | ID Format / Values | Notes |
|-----|-------|-------------------|-------|
| A | LogID | `ARKA_EMAILLOG_X` | Primary key. Sequential integer suffix. |
| B | QueueID | `ARKA_EMAILQ_X` | FK → EmailQueueDB. The queue row this log entry corresponds to. |
| C | MemberID | `ARKA_MEMBER_X` | FK → MemberDB (main spreadsheet). |
| D | EmailAddress | `user@gmail.com` | Recipient address at send time. |
| E | EmailType | string | Copied from EmailQueueDB Col E at send time. |
| F | Subject | string | Actual subject line sent. Useful for A/B subject line analysis in future. |
| G | SentAt | `dd-MM-yyyy HH:mm:ss Z` or blank | Timestamp of the `MailApp.sendEmail()` call. Blank if FAILED before send. |
| H | Status | `SENT` / `FAILED` | Outcome of the send attempt. |
| I | ErrorMessage | string or blank | `MailApp` error message if Status = FAILED. Blank if SENT. |
| J | TrackingToken | `ARKA_ET_XXXXXXXX` | Copied from EmailQueueDB Col J. Useful for cross-referencing click events directly in this log. |
| K | ClickedAt | `dd-MM-yyyy HH:mm:ss Z` or blank | Reserved for future back-fill. Currently back-filled only in EmailQueueDB Col K. |
 
**Key constraints:**
- Rows are never deleted or updated after insert. Append-only permanent record.
- All writes via `runArkaEmailPass()` batch-append after the send loop — never row-by-row writes.
- FAILED rows must be logged here even when no email was sent — they are the audit trail for deliverability issues.
---
 
## 22. BackEndConfigDB
**Purpose:** Runtime configuration for the Email BackEnd system. All thresholds and kill switches are read here by MasterEngine (`_syncEmailQueue_()`) and ArkaEmailPass (`_loadEmailConfig_()`). Change values directly in the sheet — no code deployment needed.
 
| Col | Field | Values | Notes |
|-----|-------|--------|-------|
| A | ConfigKey | string | Unique configuration key. Case-sensitive. Must match exactly the string referenced in code. |
| B | ConfigValue | string / boolean / number | Value read at runtime. Booleans stored as `true`/`false` (not `TRUE`/`FALSE`). Numbers stored as plain integers. |
| C | Notes | string | Human-readable explanation. Not read by code. |
 
**Seed rows (do not delete):**
 
| ConfigKey | Default Value | Notes |
|---|---|---|
| `EMAIL_QUEUE_ENABLED` | `true` | MasterEngine kill switch. Set `false` to stop writing queue rows without changing code. |
| `EMAILPASS_ENABLED` | `true` | ArkaEmailPass kill switch. Set `false` to stop all sends. |
| `EMAIL_SENDER_NAME` | `Arka Readers Club` | Display name in Gmail From field. |
| `EMAIL_FREQ_CAP_DAYS` | `7` | Minimum days between any two emails to the same member. |
| `REENGAGEMENT_7D_ENABLED` | `true` | 7–13 day dormancy emails. |
| `REENGAGEMENT_14D_ENABLED` | `true` | 14–29 day dormancy emails. |
| `REENGAGEMENT_30D_ENABLED` | `true` | 30+ day dormancy emails. |
| `STREAK_RISK_ENABLED` | `true` | Streak-at-risk emails. |
| `STREAK_RISK_MIN_STREAK_WEEKS` | `3` | Minimum recent active weeks to consider a streak at risk. |
| `STREAK_RISK_MIN_DAYS_SINCE_LOG` | `5` | Days without a page log before streak risk fires. |
| `CHALLENGE_DEADLINE_ENABLED` | `true` | Challenge deadline emails. |
| `CHALLENGE_DEADLINE_MAX_DAYS_LEFT` | `3` | Days remaining on a challenge to trigger the email. |
| `FINISH_NUDGE_ENABLED` | `true` | Finish-line nudge emails. |
| `FINISH_NUDGE_MAX_PAGES_LEFT` | `50` | Pages remaining in a Reading-shelf book to trigger the nudge. |
| `FINISH_NUDGE_MIN_DAYS_SINCE_LOG` | `4` | Days without a page log before the finish nudge fires. |
 
**Key constraints:**
- Config is loaded fresh on every ArkaEmailPass run — changes take effect the same night.
- Kill switches are checked by both MasterEngine (stops queue writes) and ArkaEmailPass (stops sends). Setting either to `false` is sufficient to halt the pipeline for that night.
- There is also a Script Property kill switch (`EMAILPASS_ENABLED = 'false'`) in ArkaEmailPass's GAS project that takes priority over this sheet and requires no spreadsheet read. Use the Script Property for an immediate emergency stop.
---
 
## Appendix — Google Drive Folders
 
| Constant | Folder ID | Contents |
|---|---|---|
| `PROFILE_PICS_FOLDER_ID` | `11n3v_TfITYYOCg-IQRFSrgqs89M0T1j8` | Member avatar images |
| `BADGE_IMAGES_FOLDER_ID` | `1WLX0fy5RkuvMzpQwCkQjjSVlFTajxY59` | Badge artwork images |
| `EVENT_ASSETS_FOLDER_ID` | `1R0-aaxcymLuemLRXK2E_E0sqYEQdFC37` | Event photos and assets |
| `BOOK_COVERS_FOLDER_ID` | `1a4CaUw3OjxkZQrvMxOtwFZWuWvc_-taD` | Book cover images |
 
All images stored at `sz=w400` in the Drive thumbnail URL. Frontend requests smaller sizes by swapping the `sz` parameter (e.g. `sz=w80` for strip thumbnails, `sz=w120` for gallery).
 
---
 
## Appendix — ID Format Registry
 
| Prefix | Entity | Sheet |
|---|---|---|
| `ARKA_MEMBER_X` | Member | MemberDB |
| `ARKA_BOOK_X` | Book | ArkaLibraryDB |
| `ARKA_SHELF_X` | Shelf record | MemberShelfDB |
| `ARKA_ACT_X` | Activity log entry | ActivityLogDB |
| `ARKA_PLOG_X` | Page log entry | PageLogDB |
| `ARKA_BOOKPOST_X` | Book discussion post | BookPostDB |
| `ARKA_BADGE_X` | Badge definition | BadgeDB |
| `ARKA_AWARD_X` | Badge award record | BadgeAwardDB |
| `ARKA_PERSONA_ARCH_X` | Reading Personality archetype key | PersonaProfileDB Col B (FK → archetype lookup) |
| `ARKA_ACTTYP_PERSONAUPDATE` | Persona shift audit activity type | ActivityTypeDB / ActivityLogDB |
| `ARKA_EVENT_X` | Event | EventDB |
| `ARKA_RSVP_X` | Event RSVP | EventRSVPDB |
| `ARKA_CHAL_X` | Challenge | ChallengeDB |
| `ARKA_ENRL_X` | Challenge enrollment | ChallengeEnrollmentDB |
| `ARKA_ANN_X` | Announcement | AnnouncementDB |
| `ARKA_ACTTYP_X` | User-facing activity type | ActivityTypeDB |
| `SYS_ACTTYP_X` | System/internal activity type | ActivityTypeDB |
| `ARKA_EMAILQ_X` | Email queue entry | EmailQueueDB (Email BackEnd spreadsheet) |
| `ARKA_EMAILLOG_X` | Email sent log entry | EmailSentLogDB (Email BackEnd spreadsheet) |
| `ARKA_ET_X` | Email tracking token | EmailQueueDB Col J / ActivityLogDB Col E (as description in ARKA_ACTTYP_EMAIL_CLICK rows) |
| `ARKA_NOTE_X` | Reading note | ReadingNotesDB |
 
