# Arka Admin Control Panel — Comprehensive Audit v1

**App Build Audited:** v127  
**Panel File:** `AkraAdminControlPanel.html` (note: "Akra" typo in filename — actual panel, correct title)  
**Audit Date:** June 2026  
**Last Updated:** June 2026 (post-P1 implementation — see §0)  
**Auditor:** Multi-disciplinary review — UX, Architecture, Mobile, Operations  

---

## 0. Post-Audit Implementation Log

| Item | Description | Status |
|---|---|---|
| P1-1 | Mobile: Replace bottom tab strip with hamburger + slide-out drawer | ✅ Shipped |
| P1-2 | Mobile: Fix toast obscured by tab strip | ✅ Shipped (resolved by P1-1) |
| P1-3 | Mobile: Fix content overlap with topbar | ✅ Shipped (resolved by P1-1) |
| P1-4 | Approvals: Confirmation modal for Reject and Revoke Access | ✅ Shipped |
| P1-5 | Content moderation: Book post feed + delete UI using new `adminDeleteBookPost()` backend function | ✅ Shipped |
| CSS/JS extraction | Inline `<style>` → `arkaadmin_styles.css`; inline `<script>` → `arkaadmin_app.js`; both served via GitHub CDN — same pattern as member app | ✅ Shipped |

---

## Executive Summary

*Scores reflect state **after** P1-1 through P1-5 implementation.*

| Dimension | Score (at audit) | Score (now) | Notes |
|---|---|---|---|
| UX & Ease of Use | 6.5 / 10 | 7.0 / 10 | Confirmation modals close the accidental-rejection risk |
| Logic Correctness | 7.5 / 10 | 7.5 / 10 | Unchanged |
| Layout & Visual Design | 5.5 / 10 | 5.5 / 10 | Unchanged — desktop gaps remain |
| Mobile Usability | 3.0 / 10 | 6.5 / 10 | Drawer + toast + topbar fixes make mobile workable; wide tables and reports canvas still P2/P3 |
| Operational Coverage | 4.5 / 10 | 5.5 / 10 | Content moderation section adds book post delete capability |
| **Overall** | **5.4 / 10** | **6.6 / 10** | All P1 items shipped; P2 sprint is next |

---

## 1. Inventory of What Exists (and How Well Each Works)

### 1.1 Overview Section
**What it does:** 7 stat cards (Total Members, Approved, Pending, Total Pages, Books Read, Active Badges, App Version) + Quick Actions row + Pending Approvals preview table (first 5 pending members).

**Logic correctness:** ✅ Solid. Stats computed from `admPayload.memberList` on client — no extra round trip. Pending bubble on nav item updates live after approval actions. Quick Actions link directly to the right section.

**UX issues:**
- "Quick Actions" buttons (`View All Approvals`, `Award a Badge`, `View Reports`) duplicate the sidebar — redundant on desktop.
- Pending preview table shows 5 rows with no pagination indicator. If there are 20 pending members an admin sees only 5 without any cue that more exist.
- Stat cards for "Total Pages" and "Books Read" are club-wide totals — useful at a glance but not actionable without drilling into Member Stats. No sparkline or trend indicator.
- No timestamp on last data refresh. Admin cannot tell if they are looking at stale data.

**Effort to fix:** Low.

---

### 1.2 Approvals Section
**What it does:** Filter tabs (Pending / Approved / Rejected / All) + search input + 7-column table (Member ID, Display Name, Full Name, Email, Join Date, Status, Actions) + Approve/Reject/Re-Approve/Revoke buttons.

**Logic correctness:** ✅ Correct. `admSetApproval()` calls `setMemberApprovalStatus()` on the backend, disables buttons during in-flight call, updates local `admMemberMap` optimistically on success, and re-renders both the Approvals table and Overview simultaneously. Failure path re-enables buttons and shows a toast. This is the most reliable section in the panel.

**UX issues:**
- Action buttons use `onclick="admSetApproval('ARKA_MEMBER_X', 'Approved')"` inline strings. This is fine for functionality but a security note: the member ID is interpolated into HTML without further concern — `_esc()` is called on display values but not on the attribute string used in the button render (`'<button … onclick="admSetApproval(\''+m.memberId+'\'…'`). Member IDs are system-generated (`ARKA_MEMBER_N`) so the injection surface is negligible today, but this pattern is fragile.
- No bulk-approval capability. If 12 new members register at once, admins must click Approve 12 times individually.
- Email column uses `style="color:var(--text-faint);font-size:0.78rem"` inline rather than a CSS class — minor token violation.
- "Revoke Access" copies the same button text for all approved members regardless of whether they have active shelf entries, badges, or posted content. No warning that revoking hides their data from the member app.
- ~~No confirmation modal before Reject/Revoke (only Revoke Badge has a modal). Accidental rejection of an approved member has no undo prompt.~~ **✅ Fixed (P1-4)** — `admApprovalConfirmModal` now gates both Reject (Pending rows) and Revoke Access (Approved rows) with context-aware title + body copy. Approve and Re-Approve remain direct (positive, low-risk actions).

**Effort to fix:** Medium (bulk action + confirmation modals).

---

### 1.3 Badges Section
**What it does:** Two sub-tabs — "Award a Badge" (member datalist + badge datalist + notes field + submit button) and "Browse Awards" (filterable table with Revoke action).

**Logic correctness:** ✅ Core logic works. `admSubmitBadgeAward()` validates both IDs are populated, disables the button, calls `awardBadgeToMember()`, optimistically prepends the new award to `admPayload.badgeAwardList`, clears the form, and re-renders. Revoke has a confirmation modal with CP-reversal warning — the best-designed destructive-action flow in the panel.

**UX issues:**
- The datalist UX for member selection is brittle. Typing a partial name works, but the hint text relies on a regex `\(ARKA_MEMBER_(\d+)\)$` — if the admin tabs out without selecting a dropdown item the hidden ID field stays blank and submit fails silently (toast: "Select a valid member first"). There is no real-time visual confirmation until the regex fires.
- Badge datalist contains ALL 225+ badges including system-auto-awarded tiers (e.g., Plogger I/II/III) that admins would never manually award. No category filter to narrow by badge type.
- "Browse Awards" table has 8 columns. On mid-width windows (900–1100px) the notes column wraps badly due to `max-width: 160px`. No column visibility toggle.
- No way to search for all badges awarded to a specific member (the search applies across the whole award list but there's no "filter by member" shortcut from the Member Stats section).
- System-awarded badges show "System" pill (good), but there's no protection against manually awarding a duplicate of a badge the member already holds. `awardBadgeToMember()` on the backend may or may not deduplicate — this should be surfaced in the UI.

**Effort to fix:** Medium.

---

### 1.4 Performance Section
**What it does:** 6 stat cards (Latest Version, Avg Load, vs Prev Version, P90, BigGulp, Best Version) + Chart A (Total Load Trend — Avg Total, P90, BigGulp, Render, 3s/6s thresholds) + Chart B (Per-Wave Trend, one line per wave) + Wave Breakdown stat cards for the latest version.

**Logic correctness:** ✅ Excellent. This is the most technically sophisticated section. `_computeAdminTimingStats_()` correctly separates `_ALL` rows from wave rows. Charts use `spanGaps: false` so new waves appearing mid-history render as gaps instead of false interpolation. Threshold lines are filtered out of the legend. Delta logic has a 200ms noise floor to avoid false "slower/faster" alerts. P90 is computed server-side (array sort + slice) rather than client-side — correct.

**UX issues:**
- Chart A has 6 datasets on one chart. With only 4–5 data points in early club history the chart looks sparse. A table view of the trend data would be complementary for admins who want to share version-over-version numbers in a screenshot.
- Performance thresholds (3s "ok", 6s "slow") are hardcoded in the frontend (`PERF_MS_FAST = 3000`, `PERF_MS_SLOW = 6000`). There is no configuration path to adjust these thresholds without a code deploy.
- No way to annotate a data point ("this drop was because we added Wave3b"). Historical context requires admins to remember what changed per version.
- Chart canvases on mobile render at `height: 200px` (Chart.js `maintainAspectRatio: false`) — functional but cramped when reading 6-line wave charts.

**Effort to fix:** Low (annotation is medium).

---

### 1.5 Member Stats Section
**What it does:** Sort chips (Club Points / Pages / Books / Last Active) + Activity filter (All / Active / Inactive) + 9-column sortable table (Rank, Name/ID, Country, CP, Pages, Books, Join Date, Last Active, Status). Live-dot for recently active members. Gold/silver/bronze rank chips.

**Logic correctness:** ✅ Correct. Sort is client-side on `admPayload.memberList` — instant with the current club size. Active/inactive distinction uses `ACTIVE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000` (7 days) — consistent with the main app. Rank dots render by comparing `m.lastAccessedTs` to `Date.now()` at render time (not stale).

**UX issues:**
- 9 columns at `font-size: 0.82rem` on a 1100px max-width content area requires the Country column to be truncated on narrower screens. Country has no direct admin value — it is a member-facing field.
- No action column in this table. Clicking a member row does nothing. A "View Member Details" or "Go to Approvals for this member" shortcut is missing — admins must manually copy a member ID and switch sections.
- No CSV/copy export for member stats. Club admins routinely want to share this data in spreadsheets or emails.
- The `admMembersActivity` filter uses `Date.now()` at render time — if the admin loaded data 2 hours ago and renders the table now, a member who last accessed 6.5 days ago would flip from "active" to "inactive" without a data refresh. A stale-data warning would help.
- "Last Active" column shows the human-readable string `m.lastAccessed` (formatted date) but sorts by `m.lastAccessedTs` (epoch) — correct, but the inconsistency between display and sort key is non-obvious to future maintainers.

**Effort to fix:** Low-to-medium.

---

### 1.6 Club Reports Section
**What it does:** Lazy-loaded on first section visit. Weekly/Monthly mode toggle, slide canvas (1200×675px absolutely positioned, scaled to container width via CSS transform), thumbnail strip, PDF export, image share. Data loaded via `getReportsData()`.

**Logic correctness:** ✅ Lazy-load pattern is correct (flag `admReportsDataLoaded` prevents double-fetch). The Reports engine is the integrated `ArkaReports v4` — a separate well-tested system. `showToast()` is bridged to `admShowToast()` cleanly.

**UX issues:**
- `#rptSlideCanvas` is `position: absolute; width: 1200px; height: 675px` with a CSS transform scale. On a 400px mobile screen this renders at 33% scale — text becomes unreadably small and controls are unusable. This is the single worst mobile experience in the panel.
- The "Load Report Data" prompt state adds an extra click on every session (data is lazy-loaded, not auto-fetched). On desktop this is acceptable; on mobile, every tap costs more cognitive effort.
- Report slide nav (previous/next arrows) has no keyboard support. Arrow keys do not navigate slides.
- PDF export triggers `window.print()` — the browser print dialog appears. On mobile this is disorienting and doesn't produce a clean PDF. A server-side PDF generation path would be better (BackEndEngine candidate).
- No date-range override. Reports always show the last week or last month. Admins cannot pull a custom "March 2026" report.
- The thumbnail strip scrolls horizontally but has no scroll indicator — it is not obvious on first use that thumbnails are swipeable.

**Effort to fix:** High (reports rearchitecture for mobile is a separate project).

---

### 1.7 Announcements Section (Dimmed — Not Implemented)
**What it is:** Nav item exists, marked `dimmed` with `pointer-events: none; opacity: 0.4`. `saveAnnouncement()` exists in `ArkaMainAppCode.gs` backend. The UI is completely absent.

**Root cause:** The Announcements section was deprioritised in the admin panel despite the backend being written. The member app has no announcement display either — this is a two-sided gap (no create UI in admin, no display surface in member app).

**Impact:** Every club announcement currently requires a direct sheet edit by the owner. This is the largest admin workflow friction point for day-to-day club management.

---

## 2. Layout Issues (Desktop)

### 2.1 Fixed `max-width: 1100px` with No Right-Side Utilization
`.adm-content { max-width: 1100px }` means on a 1440px+ widescreen the content area stops at 1100px and the rest is empty page background. The sidebar stays at 220px. Large-format desktops waste ~250px on each side. The stat grid would benefit from a 4-column layout on wider screens (currently `auto-fill, minmax(150px, 1fr)` which goes up to 7 columns — inconsistent).

### 2.2 No Section-Level Horizontal Scroll Guard on Tables
All tables use `.adm-table-wrap { overflow-x: auto }` — correct. But the Approvals table at 900px viewport (narrow desktop/laptop) shows 7 columns compressed to unreadable widths before horizontal scroll kicks in. Columns "Full Name" and "Email" should be `display: none` at sub-1000px and visible via an expand toggle.

### 2.3 Overview Section Has No Visual Hierarchy Break
The 7 stat cards and the "Pending Approvals" preview card are visually separated only by vertical margin. On wide screens the visual weight is flat — no hero metric, no prominence hierarchy. The `Pending` count should be the focal point (it's the primary admin action driver) but it renders at the same visual weight as "Total Pages."

### 2.4 Topbar Admin Label Truncation
`.adm-topbar-admin-label { max-width: 220px; overflow: hidden; text-overflow: ellipsis }` — a long admin email gets cut. No tooltip. On screens below 900px the label disappears off-screen since the topbar items don't reflow.

### 2.5 Form Width in Badge Award Sub-Tab
The Badge Award form uses full-width inputs inside a `.adm-card` that goes to `max-width: 1100px`. The datalist inputs stretch to 1100px — poor readability for long form fields. A `max-width: 560px` constraint on the form would improve scanability.

---

## 3. Mobile Screen Issues (Critical)

### 3.1 Bottom Tab Strip is the Wrong Pattern ✅ Fixed (P1-1/P1-2/P1-3)
~~**The problem:** At ≤768px the sidebar becomes `position: fixed; bottom: 0; display: flex; flex-direction: row; overflow-x: auto`. Nav items become vertical icon-then-label chips, `min-width: 56px`. With 7 nav items that's 392px minimum — wider than a 375px iPhone screen — requiring horizontal scroll just to see all sections.~~

**Resolution:** The bottom tab strip has been removed. The sidebar is now a fixed slide-in drawer (`translateX(-100%)` → `translateX(0)`, 260px wide, full-height, z-index 400) triggered by a hamburger button in the topbar. A tap-to-close backdrop overlay sits behind it. Nav items restore full desktop appearance inside the drawer (row layout, left accent bar, correct pending bubble positioning). `admSwitchSection()` auto-closes the drawer after a nav tap.

Previously noted failures — all resolved:
- ~~Pending bubble mis-positioned~~ → bubble is inline (`margin-left: auto`) in the row layout, no absolute positioning needed.
- ~~Active state only a colour cue~~ → left accent bar (`::before`) restored in the drawer.
- ~~`font-size: 0.65rem` below legible minimum~~ → nav items use full `0.875rem` in the drawer.
- ~~Toast hidden behind tab strip~~ → strip gone; `bottom: 28px` toast is now unobstructed (P1-2).
- ~~Content padding-bottom `80px` for strip clearance~~ → reduced to `32px`; `#admShell padding-bottom: 0` (P1-3).

### 3.2 Tables Are Unworkable on Mobile
Approvals table: 7 columns. Member Stats: 9 columns. Badge Awards: 8 columns. Even with `overflow-x: auto`, horizontal scroll on a 375px screen means core action buttons (Approve/Reject) are scrolled out of view. Admins must scroll right to act, left to see the member name, right to act — a constant back-and-forth.

**Fix pattern:** Implement a "card view" toggle for mobile tables (each row becomes a card stacked vertically). This is a known pattern for responsive admin tables.

### 3.3 Reports Section is Functionally Unusable on Mobile
As detailed in §1.6: the 1200×675 fixed-canvas slide system renders at ~33% scale on a 375px screen. Text and charts are unreadable. Charts do not respond to touch events for tooltip interaction. No pinch-to-zoom is enabled.

**Mobile-appropriate alternative:** A text summary view of the same data (e.g., "This week: 847 pages, 12 books, 4 new members") that replaces the slide canvas on mobile. The visual slide report format is inherently desktop-print-oriented.

### 3.4 Content Bottom Padding Miscalculation ✅ Fixed (P1-3)
~~`.adm-content { padding: 16px 14px 80px }` on mobile. The tab strip clearance `80px` was excessive; `#admShell { padding-bottom: 64px }` paired with it.~~

**Resolution:** With the tab strip removed, mobile content padding reduced to `16px 14px 32px` and `#admShell padding-bottom: 0`. No clearance needed.

### 3.5 Toast Positioning Conflict ✅ Fixed (P1-2)
~~`#admToast { bottom: 28px }` — on mobile, this places the toast behind the tab strip. The toast is visually obscured on every action confirmation.~~

**Resolution:** Tab strip is gone. Toast at `bottom: 28px` is unobstructed on all screen sizes.

---

## 4. Features That Should Move FROM the Member App TO the Admin Panel

The main member app (`ArkaClubApp.html`) currently handles several flows that have no business being in the member-facing UI. These create both UX clutter for members and security surface area.

| Feature | Current Location | Why It Belongs in Admin Panel |
|---|---|---|
| **Event creation** (`createEvent()`) | Member app gated by `ADMIN_MEMBER_IDS_BACKEND` | Events are club-managed content; creation is an admin operation. The `admSaveEvent()` backend function doesn't exist yet but `saveEvent()` does. |
| **"Admin-only" book post types** | Member app shows different post types for admin IDs | Admin-specific post types should be created in the admin panel's content moderation section, not conditionally shown in the member UI |
| **Announcement creation** | Backend written (`saveAnnouncement()`), no UI anywhere | Should be in admin panel Announcements section |
| **Reading Together session management** | Wave3b loads for all members; admin edits go through sheets directly | A "Reading Together" admin section should handle creating/closing group reading sessions |
| **Manual badge award** | Already moved to admin panel ✅ | Done |
| **Approval status control** | Already moved to admin panel ✅ | Done |

---

## 5. Features Missing from the Admin Panel Entirely

These are operational needs with no current admin UI path whatsoever.

### 5.1 Content Moderation — Book Posts
**Gap:** `deleteBookPost()` exists in `ArkaMainAppCode.gs` (confirmed in backend grepping). There is zero UI for it anywhere — not in the admin panel, not accessible to admins in the member app. Admins cannot delete problematic book posts without direct sheet access.

**Required:** A "Content" section with a paginated book post feed, search/filter by member, post type, and date range, with a Delete action per post. Medium effort.

### 5.2 Event Management
**Gap:** `saveEvent()` exists in the backend. No admin UI. Events are presumably created via direct sheet editing.

**Required:** An "Events" section — create/edit event form (title, date, type, description, banner image URL) + event list table with edit/delete actions. Medium effort.

### 5.3 Announcement Management
**Gap:** `saveAnnouncement()` exists. Admin nav item exists but is `dimmed`. No member-side display surface either.

**Required:** Announce section — rich text input (or structured form: title + body + expiry date) + publish/unpublish toggle + archive view. Corresponding member app "Announcements" surface needed simultaneously. Medium-high effort.

### 5.4 Email Queue Monitor
**Gap:** `EmailQueueDB` holds queued emails (STREAK_RISK, CHALLENGE_DEADLINE, FINISH_NUDGE, REENGAGEMENT). Admins have no visibility into what emails are queued, which members are in the queue, when the last ArkaEmailPass run occurred, or if emails are stuck.

**Required:** Read-only email queue viewer — rows from `EmailQueueDB` with member name, email type, queued date, status. "Clear stuck entry" action. Low-medium effort.

### 5.5 Challenge Management
**Gap:** ChallengeDB is a confirmed database sheet. No admin UI for creating, editing, or closing challenges. Challenges are presumably managed via direct sheet edits.

**Required:** "Challenges" section — create challenge form (title, target, start/end date, type), active challenge list with edit/close actions, participant count per challenge. Medium effort.

### 5.6 Library Management
**Gap:** ArkaLibraryDB stores all club books. No admin UI. Adding a book, updating metadata, or removing a title requires direct sheet editing.

**Required:** "Library" section — add book form (title, author, ISBN, genre, page count, cover image URL), searchable book list with edit/archive actions. Medium-high effort (cover image upload via Drive requires BackEndEngine path).

### 5.7 AI Coach / ArkaAIPass Monitor
**Gap:** `ArkaAIpass.gs` runs on a time trigger. Admins have no visibility into: last run time, how many members were processed, how many fingerprint-skips occurred, how many API calls were used, or whether any failures occurred.

**Required:** "System" section or "Diagnostics" sub-tab — last run stats from a log sheet (ArkaAIpass should write a summary row per run). Read-only. Low effort if the log row exists.

### 5.8 MasterEngine Run History
**Gap:** MasterEngine runs nightly. No admin visibility into run history, badge award counts per run, email queue flush counts, or errors.

**Required:** Same "System" or "Diagnostics" section — MasterEngine run log viewer. Low effort if a log sheet is maintained.

### 5.9 Member Profile Correction Tool
**Gap:** Admins cannot correct member data (display name typo, wrong country, corrupted field) without direct sheet access. The member app's own `updateMemberProfile()` function is gated to the member themselves.

**Required:** "Member Detail" panel (accessible from Member Stats row click) — editable fields for FullName, Country, ShortBio, display name (with duplicate check). Write path needs a new admin-gated backend function. Medium effort.

### 5.10 BackEndConfigDB Runtime Editor
**Gap:** `BackEndConfigDB` stores runtime configuration. Changing any config requires either a sheet edit or a code deploy. Admins who are not developers cannot safely change config values.

**Required:** "Configuration" section — key-value table from `BackEndConfigDB` with edit-in-place for safe keys (e.g., email cap days, inactive threshold). Sensitive keys (spreadsheet IDs, admin member IDs) should be read-only in this UI. Medium effort.

### 5.11 Reading Notes Moderation
**Gap:** `ReadingNotesDB` is a club-shared annotation layer. No moderation UI. Inappropriate reading notes cannot be removed by admins.

**Required:** Inline with Content Moderation (§5.1) — notes feed with delete action. Low-medium effort.

### 5.12 FeedbackDB Viewer
**Gap:** If a `FeedbackDB` sheet exists, there is no admin viewer for it. Members who submit feedback (if any in-app feedback path exists) have no admin-side inbox.

**Required:** "Feedback" section — read-only list of feedback submissions with member attribution and date. Low effort.

---

## 6. Design Token & Code Quality Issues

### 6.1 Admin Panel Has Its Own Parallel Token Set
The admin panel defines `--adm-ok: #1d9e75`, `--adm-warn: #f59f00`, `--adm-danger: #e74c3c`, `--adm-page-bg: #f4f7f6` in its own `:root`. The main app's `styles.css` Phase 6 tokens define `--color-success: #1D9E75`, `--color-danger: #e74c3c`, `--color-warning: #e67e22`. The "ok" and "success" colors match; the "warn" vs "warning" colors diverge (`#f59f00` vs `#e67e22`). This two-token-set split will drift over time.

**Fix:** The admin panel should import or mirror the canonical token set. Since both are served from GAS HtmlService, a shared include (`<?!= include('Tokens') ?>`) or a shared external CSS is the path.

### 6.2 Raw Hex Values in Performance Chart Datasets
`AkraAdminControlPanel.html` lines ~958–964 (Chart A dataset definitions):
- `borderColor: '#3498db'` — hardcoded blue (BigGulp line)
- `borderColor: '#1d9e75'` — should be `var(--adm-ok)` (Render line)
- `borderColor: '#e74c3c'` — should be `var(--adm-danger)` (P90 line)
- `borderColor: '#A984BA'` — should be `var(--arka-accent)` (Avg Total line)

Chart.js dataset properties do not support `var()` CSS variables directly, so the design token rule requires using the resolved value in a JS constant that maps to the token. Pattern: `var CHART_COLORS = { accent: '#A984BA', ok: '#1d9e75', danger: '#e74c3c' }` at the top of the script, used consistently in chart definitions. This way a single constant change propagates to all charts.

### 6.3 Wave Palette Array with Raw Hex Values
Line ~1004: `var WAVE_PALETTE = ['#95a5a6','#3498db','#e74c3c','#2ecc71','#f39c12','#9b59b6','#1abc9c','#e67e22','#c0392b']` — 9 hardcoded colours with no semantic meaning. If the design token set evolves these won't update. Low priority but worth formalizing.

### 6.4 `onclick=` Attribute Pattern vs `data-action`
The main member app underwent a full `data-action` migration (136/145+ elements). The admin panel is entirely `onclick=` attribute-based. This is acceptable for the admin panel (smaller surface, controlled audience) but means the admin panel doesn't benefit from the unified event dispatch pattern. Not a blocking issue; note for consistency.

### 6.5 Filename Typo
`AkraAdminControlPanel.html` — "Akra" should be "Arka". Refactoring the filename requires updating:
- `doGet(e)` in `ArkaMainAppCode.gs` (the `HtmlService.createTemplateFromFile('AkraAdminControlPanel')` call)
- Any deployment references

Low risk to fix; low priority but creates brand inconsistency in version control history.

---

## 7. Prioritised Recommendation Backlog

### Priority 1 — Critical (fix before next admin-heavy period)
| # | Status | Issue | Effort | Impact |
|---|---|---|---|---|
| P1-1 | ✅ Done | Mobile: Replace bottom tab strip with hamburger + slide-out drawer | 1 day | Unblocks all mobile admin use |
| P1-2 | ✅ Done | Mobile: Fix toast obscured by tab strip | 30 min | Resolved by P1-1 (strip removed) |
| P1-3 | ✅ Done | Mobile: Fix content padding / topbar overlap | 30 min | Resolved by P1-1 (strip removed) |
| P1-4 | ✅ Done | Approvals: Confirmation modal for Reject and Revoke Access | 2 hrs | Prevents accidental member rejection |
| P1-5 | ✅ Done | Content moderation: Book post feed + delete UI; new `adminDeleteBookPost()` backend fn; "Posts" nav section | 4 hrs | Enables removal of problematic posts |

### Priority 2 — High (next development sprint)
| # | Issue | Effort | Impact |
|---|---|---|---|
| P2-1 | Announcements section: implement create/publish UI + member display surface | 2 days | Eliminates sheet-editing for announcements |
| P2-2 | Events management section using existing `saveEvent()` | 1.5 days | Admin-controlled event creation |
| P2-3 | Email queue monitor (read-only) | 4 hrs | Visibility into ArkaEmailPass pipeline |
| P2-4 | Mobile table card-view toggle for Approvals and Member Stats | 1 day | Core admin tables usable on mobile |
| P2-5 | Approvals: Bulk-select + bulk-approve for multi-registration events | 4 hrs | Major time-saver for club onboarding days |

### Priority 3 — Medium (quarterly roadmap)
| # | Issue | Effort | Impact |
|---|---|---|---|
| P3-1 | Challenge management section | 3 days | Admin-controlled challenge creation |
| P3-2 | Library management section | 3 days | Book additions without sheet access |
| P3-3 | Member Stats: click-through to member detail + edit panel | 2 days | Single-source member management |
| P3-4 | System/Diagnostics section (MasterEngine + ArkaAIPass run logs) | 2 days | Operational transparency |
| P3-5 | Reports: mobile text-summary fallback for slide canvas | 2 days | Reports accessible on phone |
| P3-6 | Unify admin chart color constants with design token system | 2 hrs | Token consistency |

### Priority 4 — Nice to Have
| # | Issue | Effort | Impact |
|---|---|---|---|
| P4-1 | Overview: Admin data refresh timestamp | 1 hr | Awareness of data freshness |
| P4-2 | Performance section: version annotation support | 4 hrs | Historical context for perf trends |
| P4-3 | Approvals: column hide on sub-1000px desktop | 2 hrs | Better narrow-desktop layout |
| P4-4 | Rename `AkraAdminControlPanel.html` → `ArkaAdminControlPanel.html` | 30 min | Filename correctness |
| P4-5 | BackEndConfigDB runtime editor (safe keys only) | 1.5 days | Config without code deploy |

---

## 8. What the Admin Panel Gets Right (Preserve These)

- **Confirmation modals for all destructive approval actions** — `admApprovalConfirmModal` (P1-4) now gates Reject and Revoke Access with context-aware copy, matching the existing Revoke Badge modal pattern. All three destructive actions now require explicit confirmation.
- **Optimistic UI update pattern** in Approvals — local state update + re-render on success, button re-enable on failure
- **Performance section quality** — technically the most sophisticated section; `spanGaps: false`, P90, noise floor, BigGulp vs Render split are all best-practice choices
- **Admin-gated data loading** — `doGet(e)` in the backend checks `ADMIN_MEMBER_IDS_BACKEND` before serving the panel; data functions call `getVerifiedMemberId()` which re-checks approval on every call
- **Design tokens in CSS** — `:root` block mirrors the member app token set (minor drift aside); `var(--token)` used consistently in CSS rules
- **`_esc()` helper on all rendered data** — XSS prevention on all member-sourced strings in table rows
- **Lazy-load for Reports** — avoids fetching large report datasets on panel open; correct `admReportsDataLoaded` flag prevents double-fetch
- **Live pending bubble** — real-time pending count update without page refresh; survives tab switches

---

*Audit produced against codebase at v127. Sections read: `AkraAdminControlPanel.html` (full), `ArkaMainAppCode.gs` (admin function grep + offset reads), `Claude.md`, `ArkaDatabase_Definitions.md`.*
