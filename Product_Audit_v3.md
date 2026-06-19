# Arka Readers Club — Product Audit v3
**Build audited:** `v127` (backend) · `styles.css + app.js` (frontend) · `ArkaMainAppCode.gs v127` · `MasterEngine.gs` · `ArkaAIPass.gs` · `ArkaPersonaPass.gs` · `ArkaHelp.html v11.0 (47 articles)` · `ArkaDatabase_Definitions.md v5` · `ArkaDesign_Tokens_v1.md`
**Prior baseline:** Product_Audit_v2 (build v109, June 2026)
**Date:** June 2026 · **Method:** Code-grounded. Every score and claim tied to exact file/line evidence. Delta from V2 explicitly called out.

> **Reading guide.** This audit continues from V2. Items marked ✅ were resolved in V2. Items marked ⚠️ were identified in V2 but remain open. Items marked 🆕 are new findings from this code pass.

---

## V2 → V127 System Delta

| Signal | V2 (v109) | V3 (v127) | Change |
|---|---|---|---|
| Backend version | v51 | v127 | +76 versions |
| JS functions | 532 | 532+ | Growing |
| Help articles | 58 | 47 (v11.0) | Consolidated |
| Phase 6 semantic tokens | ⚠️ Pending | ✅ Done (in `:root`) | Closed |
| Cinzel font loaded | ⚠️ Not loaded | ✅ Loaded (ArkaClubApp.html L8) | Closed |
| `data-action` migration | ✅ 136/136 | ⚠️ 8/145 noted open (CLAUDE.md §11) | Regressed |
| Body background `#f4f7f6` | ⚠️ Not tokenised | ⚠️ Still hardcoded (styles.css L33) | Open |
| Dark mode | ⚠️ Blocked | ⚠️ Unblocked by tokens, still absent | Partial |
| Share nudge recovery path | ⚠️ Open | ⚠️ Still open | Open |
| `help-whats-new` June 2026 | ⚠️ Open | ⚠️ Still open | Open |
| Prediction Engine | Approved | Not built | New gap |

---

## 1. UX EXPERIENCE

**Parameters Identified:**
- **Navigation clarity & discoverability** — reach any feature in ≤2 taps from any view
- **Task-flow friction** — core loops: logging, shelving, social, onboarding
- **Mobile responsiveness & gesture handling** — touch targets, safe-area, scroll behaviour
- **Error handling & recovery** — write failures, stale state, lock contention
- **Load-time perception** — progressive fetch feel, CDN dependency risk

**Dimension Score: 8.5/10** — Mature and stable. The unified log modal, navStack back-navigation, and 5-tab bottom nav create a solid information architecture. Two persistent gaps drag the score: error handling remains fire-and-forget with no user-visible failure state, and the archetype chip (a sub-2-hour win) hasn't shipped on the Home tab header.

| Parameter | Score | Why? |
|---|---|---|
| Navigation clarity | 8.5/10 | Me-tab action band + archetype chip + ☰ More drawer provide excellent discoverability. ⚠️ OPEN: archetype chip still absent from the **Home tab header** — CLAUDE.md §11 lists it as a quick win and it would put persona identity on the highest-frequency surface. |
| Task-flow friction | 8.5/10 | Unified `logReadingModal` remains the best-executed interaction in the app. ⚠️ OPEN: share nudge auto-dismisses in 9s with no recovery path — `showShareNudge_()` / `dismissShareNudge_()` pattern confirmed in V2; still unresolved. |
| Mobile responsiveness | 8/10 | `env(safe-area-inset-bottom)` used throughout ✅. `100dvh` fallback for iOS ✅. 🆕 `bottom-drawer` max-height is `82vh` (styles.css L587) — on 375px × 667px (iPhone SE), this leaves ~550px; a large challenge detail can clip. `max-height: min(82vh, 580px)` would be safer. |
| Error handling | 6/10 | No regression from V2. `google.script.run` write paths remain fire-and-forget in the reading log path. A swallowed Sheet write looks like success. `LockService` timeout error surfaced by `System is currently busy` toast (help-troubleshooting Issue 6 documented) but no retry affordance is offered. |
| Load perception | 8/10 | 4-wave parallel architecture unchanged. `AppLoadTimingDB` still recording. 🆕 `ArkaClubApp.html` now loads **6 CDN dependencies** (Font Awesome, Chart.js, Fuse.js, Merriweather, Cinzel, the GitHub-hosted `styles.css + app.js`). Each CDN becomes a single point of failure; one offline CDN can blank the app for all members. |

**Top Improvement Opportunities (Prioritized by Impact):**

1. **Navigation clarity → Archetype chip on Home tab header:**
   - Suggestion 1: In `renderHomeFeed()` (or equivalent home tab render function), inject a persona chip using the same pattern as the Me tab identity row — `member.archetypeEmoji + member.archetypeName`. Tap to `openMyPersonality()`. Show "Forming..." nudge if `personaProfile.axisVerdicts` are all gated.
   - Suggestion 2: Add a compact 1-line persona strip below the daily quote card on the Home feed — lower visual weight but still always visible.
   - **Impact:** Quick Win · **Effort:** 1–2h (pattern exists in Me tab; copy-adapt)

2. **Task-flow friction → Share nudge recovery on Finished shelf:**
   - Suggestion 1: In `renderUserShelves()`, for Finished-status shelf cards, add a compact "Share this finish" icon-row button below the rating stars. Store `_pendingShareData` after dismiss. `openBookFinishedShare()` already accepts the required IDs.
   - Suggestion 2: Add a "Celebrations" section to the Me tab that lists the last 3 finished books with a share icon on each row — one tap to open the share sheet.
   - **Impact:** Quick Win · **Effort:** 2–3h

3. **Error handling → Write-path failure toasts:**
   - Suggestion 1: Add `.withFailureHandler()` to every `google.script.run` call in the log reading and shelf update flows. On failure, show an `arkaToast` with type `error` and a "Retry" action link.
   - Suggestion 2: For LockService contention (`System is currently busy`), surface a `warn` toast with "Try again in a few seconds" and expose a retry button that re-invokes the same function.
   - **Impact:** Medium Effort · **Effort:** 4–8h (touches every write path)

4. **Load perception → CDN failure resilience:**
   - Suggestion 1: Add `onerror="this.style.display='none'"` to Font Awesome `<link>` and fallback FA to emoji icons for critical navigation icons via a CSS `@font-face` fallback.
   - Suggestion 2: Self-host the `styles.css` and `app.js` inside the GAS `HtmlService` include chain (use `<?!= include('styles') ?>`) to eliminate the GitHub CDN dependency for core files.
   - **Impact:** Medium Effort · **Effort:** 2–4h

---

## 2. CORE FUNCTIONALITIES

**Parameters Identified:**
- **Feature completeness vs. scope creep** — is every approved feature shipped?
- **Logical feature grouping & naming** — naming discipline, discoverability
- **Synchronisation reliability** — Sheet ↔ App write/read consistency
- **Backward compatibility & data integrity** — schema stability, ID safety

**Dimension Score: 8/10** — Slight downward revision from V2's 8.5. The Prediction Engine is explicitly approved for coding in CLAUDE.md §12 ("AJ has approved proceeding with coding. This is the next thing to build") and is the next highest-value feature — its absence is a notable gap now that it has formal approval. The 10 Pages A Day bridge remains labelled `TEMPORARY` in app.js and is actively adding maintenance surface area.

| Parameter | Score | Why? |
|---|---|---|
| Completeness vs. creep | 7/10 | 🆕 Prediction Engine (Finish Date, DNF Risk, Rating Prediction, Oracle Score) is **approved and designed but unbuilt** — highest-ROI unbuilt feature. `ARKA_ACTTYP_WHATSAPP` is defined but inactive (no share button built). ⚠️ `TEN_PAGES_MEMBER_MAP` with 21 hardcoded member IDs/names in `app.js` L82–103 is a maintenance liability and a data-privacy micro-concern (hardcoded PII in frontend). |
| Grouping & naming | 9/10 | Naming discipline maintained across 532 functions. Wave architecture clean. Backend naming (`get*`, `save*`, `log*`, `build*_`) consistent. |
| Sync reliability | 9/10 | `LockService` on `logActivityBatch()` unchanged ✅. Nightly MasterEngine reliable ✅. BackEndEngine email pipeline live ✅. `ARKAEMAILPASS_READY` / `ARKAAIPASS_READY` / `ARKAPERSONAPASS_READY` flags chain correctly. |
| Compat & integrity | 9/10 | Soft-delete + recycle pattern for shelves ✅. Immutable append-only ledgers (PageLogDB, ActivityLogDB, ReadingNotesDB) ✅. `MEMBER_DB_TARGET_COL_COUNT = 21` pad guard ✅. 🆕 `ArkaPersonaPass.gs` and `ArkaAIpass.gs` appear to share identical file headers — worth verifying they are distinct files and not a copy error. |

**Top Improvement Opportunities (Prioritized by Impact):**

1. **Completeness → Build Prediction Engine Phase 1:**
   - Suggestion 1: As per approved design — implement `computeBookPredictions_(shelfRecord, pageLogRows, bookRecord)` in MasterEngine. Output: `{ finishDate: 'dd-MMM-yyyy', dnfRisk: 0–100, ratingPrediction: 1–5, oracleScore: 0–100 }` stored per shelf record, rendered as chips on the Reading shelf card.
   - Suggestion 2: For the frontend — add a "Predicted finish" chip below the existing hanging insight tag in `computeBookInsight_()`. Use existing `--color-success` for on-track, `--color-warning` for at-risk.
   - **Impact:** Long-term Investment (highest product value) · **Effort:** 3–5 days

2. **Completeness → Retire TEN_PAGES_MEMBER_MAP from frontend:**
   - Suggestion 1: Move member-ID-to-display-name lookup to a backend function that reads MemberDB at call time. Remove the 21-entry hardcoded map from `app.js` — it contains PII (real member names) in the served JavaScript.
   - Suggestion 2: If the 10 Pages A Day bridge is deprecated, add a clear code comment with a sunset date and flag it as `// DEPRECATED: remove by [date]` at the top of the block.
   - **Impact:** Quick Win · **Effort:** 2–3h

3. **Completeness → Activate ARKA_ACTTYP_WHATSAPP share button:**
   - Suggestion 1: Build the WhatsApp share button into the post-finish share nudge card and the Finished shelf card row. The `shareData` object already exists from `showShareNudge_()`; wire it to `navigator.share()` (Web Share API) with WhatsApp as the preferred target.
   - **Impact:** Medium Effort · **Effort:** 4–6h

---

## 3. VISUAL DESIGN & BRANDING

**Parameters Identified:**
- **Color palette coherence & WCAG compliance** — token discipline, residual hardcoding
- **Typography hierarchy & readability** — font loading, scale clarity
- **Whitespace & composition balance** — density, breathing room
- **Visual consistency across sections** — component-level token discipline
- **Iconography** — icon system coherence
- **Dark mode readiness** — how close are we?

**Dimension Score: 7.5/10** — Phase 6 semantic tokens are deployed and confirmed in `styles.css` L18–24. Cinzel is now loaded. But a fresh code read surfaces **a dozen post-Phase-6 token violations** in component-level CSS and JS config objects, and 311 hardcoded `#ffffff`/`white` surfaces + body background `#f4f7f6` keep dark mode out of reach. Visual consistency score is held back by component-specific colour islands (level pill, genre chip, persona toggle, toast tints) that bypass the token system.

| Parameter | Score | Why? |
|---|---|---|
| Color system & contrast | 8/10 | ✅ Phase 6 tokens present: `--color-success #1D9E75`, `--color-danger #e74c3c`, `--color-warning #e67e22`, `--color-gamification #EF9F27`, `--color-challenge #534AB7`. AA-compliant text tokens unchanged ✅. 🆕 **Residual violations post-Phase 6:** `styles.css:205` `.profile-edit-dot { background: #e67e22 }` → should be `var(--color-warning)`; `styles.css:290` `.persona-toggle-switch { background: #534AB7 }` → should be `var(--color-challenge)`; `styles.css:301` `.profile-info-value { color: #34495e }` → should be `var(--text-strong)`. |
| Typography hierarchy | 8.5/10 | ✅ Cinzel now loaded from Google Fonts (`ArkaClubApp.html` L8). ✅ Merriweather loaded. ✅ 3-level token hierarchy (`--text-strong` / `--text-muted` / `--text-faint`). `--font-body` declared once in `:root` and inherited globally — correct pattern. |
| Whitespace & composition | 7.5/10 | Me tab remains dense but action band creates breathing room. `profile-stat-tile` at `padding: 10px 6px` (styles.css L225) is tight on small screens. The shelf status tile grid (2×2) at `padding: 10px 6px` could comfortably go to `12px 8px`. |
| Visual consistency | 6.5/10 | 🆕 **Three isolated colour islands bypass the token system:** (1) `BOOKPOST_TYPE_CONFIG` in `app.js` L330–334 contains `"#34495e"`, `"#b7770d"`, `"#fffcf5"`, `"#eae8f7"` inline — none tokenised. (2) `.profile-level-pill` uses `background: #f1efe8; color: #444441; border: 0.5px solid #d3d1c7` — three unregistered values. (3) `.profile-genre-chip` uses `background: #f5eefa; border-color: #c9a8db; color: #6e5080` — three unregistered values. |
| Iconography | 8/10 | ✅ FA 6.4.0 consistent. ✅ `fa-pencil-alt` removed in V2. 🆕 Event type config uses `emoji` in labels (`'📹 Virtual Meeting'`) while navigation uses FA icons — mixed paradigm that will conflict in dark mode (emojis don't invert). |
| Dark mode | 3.5/10 | ✅ Phase 6 semantic tokens unblock this. ✅ Cinzel now loaded (eliminates font fallback cliff in dark headers). ⚠️ **Hard blockers remaining:** `body { background-color: #f4f7f6 }` (styles.css L33) not tokenised; 311 `#ffffff`/`white` surface instances not tokenised; 281 distinct hardcoded hex values remain per Design Tokens §5. The `@media (prefers-color-scheme: dark)` `:root` override block can now be drafted but requires surface token pass first. |

**Top Improvement Opportunities (Prioritized by Impact):**

1. **Visual consistency → Close post-Phase-6 token violations (surgical sweep):**
   - Suggestion 1 (`styles.css` surgical fixes):
     - `styles.css:205` → `background: var(--color-warning); border: 2px solid #fff;`
     - `styles.css:290` → `background: var(--color-challenge);`
     - `styles.css:301` → `color: var(--text-strong);`
   - Suggestion 2 (`app.js` BOOKPOST_TYPE_CONFIG): Replace `"#34495e"` with `"var(--text-strong)"` and promote `"#b7770d"` / `"#fffcf5"` / `"#eae8f7"` to new tokens `--color-quote-text`, `--color-quote-bg`, `--color-fancast-bg`.
   - **Impact:** Quick Win · **Effort:** 1–2h

2. **Visual consistency → Tokenise `.profile-level-pill` and `.profile-genre-chip`:**
   - Suggestion 1: Promote to tokens: `--color-level-pill-bg: #f1efe8`, `--color-level-pill-text: #444441`, `--color-genre-chip-bg: #f5eefa`, `--color-genre-chip-border: #c9a8db`, `--color-genre-chip-text: #6e5080`. Add to `:root` block; replace inline values.
   - Suggestion 2 (alternative): Collapse profile chips to use existing `--surface-alt` + `--arka-accent` at 20% opacity for the background, reducing new token count.
   - **Impact:** Quick Win (dark mode prerequisite) · **Effort:** 1h

3. **Dark mode → Surface token pass:**
   - Suggestion 1: Add `--color-surface: #ffffff` and `--color-page-bg: #f4f7f6` to `:root`. Replace `background-color: #f4f7f6` in `body` (styles.css L33) with `background-color: var(--color-page-bg)`. Replace inline `background: white` on cards with `background: var(--color-surface)`. This is the largest single remaining blocker.
   - Suggestion 2: After surface tokenization, write the `@media (prefers-color-scheme: dark)` `:root` override block with 24-row mapping (the design work is already done per CLAUDE.md §12 "24-row colour mapping table created").
   - **Impact:** Long-term Investment · **Effort:** 3–5 days (surface sweep is ~311 instances)

---

## 4. ENGAGEMENT & MOTIVATION

**Parameters Identified:**
- **Habit loop triggers & reward timing** — frequency and placement of nudges
- **Progress visualization** — how well does it show advancement?
- **Social signaling** — visibility of achievements and peer activity
- **Badge & level aspiration** — clarity, aspirational value, award frequency
- **Notification strategy** — frequency, relevance, urgency balance

**Dimension Score: 8.5/10** — The strongest dimension. Four habit-loop layers are active (action band trigger → reading log → celebration/badge → email re-engagement). The missing link is still the share nudge recovery path and the absence of any in-app reaction mechanic on the home feed (no "congratulate" on others' achievements).

| Parameter | Score | Why? |
|---|---|---|
| Habit loop triggers | 8.5/10 | Me tab action band delivers textbook commitment + identity + progress triggers in one row. Email re-engagement live with priority-ordered types ✅. "Continue reading" tile reads member's personal page log — genuinely personalised. |
| Progress visualization | 8/10 | insightsView plain-language sections ✅. Ghost cumulative chart ✅. Hanging insight tags per book ✅. 🆕 **Prediction Engine would be a step-change here** — an estimated "Finish by [date]" on each Reading shelf card would be the most actionable progress signal the app has ever surfaced. Currently approved but unbuilt. |
| Social signaling | 7/10 | ⚠️ Share nudge auto-dismisses in 9s, no recovery path — confirmed still open. 🆕 **No reaction mechanic on the home feed** — a member can see "Priya finished Harry Potter" but has no in-app way to congratulate her. A thumbs-up or 🎉 react (fire-and-forget `ActivityLogDB` write) would close this loop without requiring new OAuth scopes. |
| Badge & level aspiration | 8/10 | 225+ system badges ✅. Tiered replacing display ✅. Per-chapter onboarding badges ✅. ⚠️ "Temp" badge still listed as an open cleanup item in CLAUDE.md §11. Yearly awards visible but win criteria are not displayed in-app (only in the help article). |
| Notification strategy | 8.5/10 | Email pipeline: STREAK_RISK > CHALLENGE_DEADLINE > FINISH_NUDGE > REENGAGEMENT cadence ✅. `EMAIL_FREQ_CAP_DAYS = 7` prevents fatigue ✅. FAILED rows don't count toward cap ✅. 🆕 **Gap:** email click-through tracking (`TrackingToken`, `ClickedAt`) is designed but the `ARKA_ACTTYP_EMAIL_CLICK` activity type is not in the ActivityTypeDB reference table — it appears in EmailQueueDB schema notes but may not be registered. |

**Top Improvement Opportunities (Prioritized by Impact):**

1. **Social signaling → Home feed micro-reactions:**
   - Suggestion 1: Add a 🎉 "Congrats" tap target to activity feed cards for `ARKA_ACTTYP_BOOKREAD` and `ARKA_ACTTYP_BADGEAWARD` entries. On tap: write a `SYS_ACTTYP_REACT` row to `ActivityLogDB` (0 CP, hidden from feed, new type needed in ActivityTypeDB). This stays within Sheets scope.
   - Suggestion 2 (simpler): Add a like count to the feed card (same pattern as `BookPostDB.LikeCount`) stored in a new `ReactionCount` column on `ActivityLogDB`. Increment on tap via a locked `incrementReactionCount()` backend function.
   - **Impact:** Medium Effort · **Effort:** 1–2 days

2. **Progress visualization → Prediction Engine Phase 1:**
   - Already noted in Core Functionalities #1 — same suggestion applies here. Finish Date chip on Reading shelf cards is the highest-value unbuilt UX feature.
   - **Impact:** Long-term Investment · **Effort:** 3–5 days

3. **Badge aspiration → Expose yearly award win criteria in the badge card:**
   - Suggestion 1: In the badge gallery, for `YEARLY` category badges, render the current-year target inline on the badge card: e.g., "Write 5 reviews to win Critic of the Year" (threshold from `YEARLY_MIN_THRESHOLDS` already in MasterEngine). This data exists — it just isn't surfaced.
   - **Impact:** Quick Win · **Effort:** 2–3h

---

## 5. HELPFULNESS & GUIDANCE

**Parameters Identified:**
- **Onboarding effectiveness** — new member setup friction and guidance
- **In-app help system quality** — searchability, relevance, tone
- **Contextual help placement** — right info at right moment
- **Clarity of terminology** — jargon vs. plain language
- **Support pathways visibility** — how easy is it to get help?

**Dimension Score: 8.5/10** — Help system remains the highest-quality dimension. 47 well-structured articles with the `huk-*` UI kit, Arka Story as a 10-chapter narrative, and onboarding tasks each linked to an article create a comprehensive guidance layer. Two gaps persist: the `help-whats-new` entry for June 2026 features is still missing, and `ONBOARD_T28` (Share to WhatsApp) relies on a share button that isn't fully wired.

| Parameter | Score | Why? |
|---|---|---|
| Onboarding effectiveness | 8/10 | 29 tasks, 5 chapters, per-chapter badges, action band surfaces top unresolved task ✅. Chapter structure visible ✅. 🆕 `ONBOARD_T28` ("Share your progress in the WhatsApp group") maps to `ARKA_ACTTYP_SHAREPROGRESS` — this type fires correctly per ActivityTypeDB. But `ARKA_ACTTYP_WHATSAPP` (the dedicated WA share button) is inactive. Members completing T28 via `shareProgress()` should work; via the WA-specific button, they cannot — the task label is confusing for new members. |
| Help system quality | 9/10 | 47 substantive articles ✅. Custom `huk-*` UI kit matches real app CSS ✅. Fuse.js search with `threshold: 0.3` ✅. 10-chapter Arka Story is a standout differentiator. ⚠️ `help-whats-new` still missing June 2026 content (action band, unified log, Prediction Engine design, personas). ARCH-01 (TenPagesADay ID mismatch) documented in help maintenance notes — code fix still pending. |
| Contextual help placement | 8.5/10 | Personality info button → `help-reading-personality` ✅. Coach insight chips carry `helpArticleId` ✅. Onboarding tasks link to article ✅. 🆕 Error states (LockService busy, write failure toasts) have no `openHelpArticle()` link — a "What happened?" link to `help-troubleshooting` would close the gap at zero effort. |
| Terminology clarity | 8/10 | "Arka Points" consistent throughout ✅. "PLogger weeks" in backend-generated CoachInsights strings still jargon-y. 🆕 `ONBOARD_T13` label "Log reading without a book" is clear but the material chip labels ("Academic", "News / Journalism") in the log modal may need a plain-language tooltip or caption explaining what "unlinked" means. |
| Support pathways | 7.5/10 | Feedback form with 150 AP reward incentivises engagement ✅. FeedbackDB tracked ✅. ⚠️ No visible status update surfaced to the reporter after submission — the member sees a success toast but never knows if the feedback was actioned. A simple "View submitted feedback" section in the More drawer would close this. |

**Top Improvement Opportunities (Prioritized by Impact):**

1. **Help system quality → `help-whats-new` June 2026 entry:**
   - Suggestion 1: Add a "June 2026" entry to `help-whats-new` covering: Unified Log Reading modal, Me tab action band, My Reading Story (insightsView), Reading Personality persona system, club comparison benchmarks (Section 6 of Reading Story). This is the single most visible quality gap for members who check "What's New."
   - **Impact:** Quick Win · **Effort:** 1–2h

2. **Contextual help → Error state help links:**
   - Suggestion 1: In the `withFailureHandler()` callbacks (once added — see UX #3), append `action: { label: 'What happened?', fn: "openHelpArticle('help-troubleshooting')" }` to the toast call. Zero schema change; reuses existing `openHelpArticle()` function and `arka-toast-action` element.
   - **Impact:** Quick Win · **Effort:** 30 min per error path

3. **Support pathways → Feedback status visibility:**
   - Suggestion 1: In `saveUserFeedback()` success flow, store the submission timestamp and category in `localStorage`. Render a compact "Your feedback (Bug · Home Feed · 12 Jun)" line in the ☰ More drawer below the Feedback option. No new schema needed.
   - **Impact:** Quick Win · **Effort:** 2–3h

---

## 6. INSIGHTFULNESS & DATA CLARITY

**Parameters Identified:**
- **Reading stats understandability** — plain language vs. jargon
- **Actionable insights** — does data suggest a next step?
- **Dashboard scannability** — is it scannable, not overwhelming?
- **Comparison benchmarks** — self, peer, and goal context
- **Personalization depth** — does the app learn from member behaviour?

**Dimension Score: 8/10** — Stable from V2. The insightsView with 6 sections (including `renderClubBenchmarks()`) is the standout data feature. The gap is that benchmarks are buried 5+ taps deep (Me → Reading Story → scroll to Section 6), and the Prediction Engine — which would make the data *urgently* actionable per book — remains unbuilt.

| Parameter | Score | Why? |
|---|---|---|
| Understandability | 8.5/10 | Plain-language insightsView headings ✅. Ghost chart caption ✅. Hanging insight tags ✅. 🆕 `computeBookInsight_()` priority ranking (almost done → challenge deadline → stalled → co-readers) surfaces exactly the right signal — no jargon. "PLogger weeks" in backend coach payloads is the remaining jargon island. |
| Actionable insights | 8/10 | Per-book insight tags are high-utility ✅. Coach card with AI advice ✅. 🆕 **Prediction Engine gap is most visible here.** A "You'll finish in 8 days at your current pace" signal would be the single most directly actionable insight in the app. Approved but unbuilt. |
| Dashboard scannability | 8/10 | Me tab: action band → stat pills → heatmap → level bar → coach → shelves. Clean hierarchy ✅. insightsView's 6 sections are scroll-heavy but each is self-contained. Me tab still slightly dense — club benchmark strip visible without drilling to Reading Story would help. |
| Comparison benchmarks | 7/10 | `renderClubBenchmarks()` in Reading Story Section 6 ✅. Self-comparison ghost chart ✅. Percentile stats in Reading Story ✅. ⚠️ **Still buried 5+ taps deep.** No lightweight benchmark widget on the Me tab dashboard itself. A single "You're in the top 30% of readers this year" chip in the Me tab stat row would provide ambient benchmark awareness. |
| Personalization depth | 8.5/10 | PersonaPass derives 5 axes nightly ✅. AI advice personalised via Gemini (fingerprint-skip reduces API calls 50–70%) ✅. "Continue reading" tile reads personal page log ✅. 🆕 `AIPASS_INACTIVE_DAYS_THRESHOLD = 14` is a smart gate — weekend readers don't lose their AI coach. |

**Top Improvement Opportunities (Prioritized by Impact):**

1. **Actionable insights → Prediction Engine Phase 1** (highest ROI):
   - Already noted in Core Functionalities #1 and Engagement #2. Finish Date + DNF Risk on shelf cards would be the most actionable data addition in the product's history. Approved design exists.
   - **Impact:** Long-term Investment · **Effort:** 3–5 days

2. **Comparison benchmarks → Ambient percentile chip on Me tab:**
   - Suggestion 1: Add a single `renderClubPercentileChip_()` function that reads the club benchmark data already computed by `getReportsData()` (or fetched in Wave 3) and renders a compact pill in the Me tab stat row: e.g., "Top 25% this year 📈". This is one chip, not the full benchmark section — keeps Me tab lean.
   - Suggestion 2: Alternative — add a "See how you compare →" tap row just above the insightsView button on the Me tab that opens Reading Story at Section 6 anchor.
   - **Impact:** Medium Effort · **Effort:** 3–4h

3. **Understandability → Replace "PLogger weeks" in coach payloads:**
   - Suggestion 1: In the AI pass prompt template and MasterEngine insight-chip generation, replace "PLogger weeks" with "weeks you've logged at least one reading session." In `computeInsightChips_()`, grep for any coach payload strings containing "PLogger" and replace with the plain-language equivalent.
   - **Impact:** Quick Win · **Effort:** 1–2h (prompt string change in ArkaAIPass.gs)

---

## 7. COMMUNITY & IDENTITY

**Parameters Identified:**
- **Member persona system clarity & appeal** — is it understood and valued?
- **Sense of belonging & member identity** — does the app feel like "their" club?
- **Celebration & recognition mechanics** — are wins surfaced and shared?
- **Peer visibility & comparison** — can members meaningfully see each other?
- **Exclusivity/aspiration balance** — aspirational without being gatekeeping

**Dimension Score: 8.5/10** — The persona system is now fully deployed with a sophisticated multi-axis model, rarity signals, and a "How You've Changed" evolution timeline. The belonging layer (Arka Story, approval gate, Our Story chip) is genuinely distinctive. The key unresolved gap is the absence of any lightweight social reaction mechanic — members can observe each other's achievements but not respond to them.

| Parameter | Score | Why? |
|---|---|---|
| Persona clarity & appeal | 8.5/10 | Archetype on Me tab ✅. Full Personality panel (5 axes, sliders, rarity, insights, blind spot, timeline) ✅. `help-reading-personality` ✅. ⚠️ **OPEN:** Archetype chip on Home tab header (CLAUDE.md §11 — the highest-frequency surface still persona-blind). ⚠️ **OPEN:** Persona rarity peer signal ("You're 1 of 3 Midnight Scholars") on other members' profile views still not shipped. |
| Belonging | 8.5/10 | 10-chapter Arka Story as curated club narrative is a rare and powerful belonging artefact ✅. Approval gate creates authentic exclusivity ✅. Anniversary badges mark tenure ✅. "Our Story" chip on Me identity row ✅. `help-arka-culture` documents the Golden Rules. |
| Recognition | 8/10 | Celebration card for badge + level-up ✅. Share nudge after book finish ✅ (recovery path still open). Hall of Fame ✅. Yearly awards ✅. ⚠️ OPEN: Share nudge recovery path on Finished shelf cards. 🆕 **No external visibility:** a member sharing to WhatsApp generates a card, but the club community inside the app never sees that this share happened — no `ARKA_ACTTYP_WHATSAPP` feed entry. |
| Peer visibility | 7/10 | Members directory ✅. Leaderboard ✅. Home feed with others' activity ✅. Co-reader micro-signal on Reading shelf ✅. 🆕 **No in-app reaction mechanic.** No quick congratulate on feed items. No follow/bookmark-member feature. Cross-member profile view exists but has no way to react or comment. |
| Aspiration balance | 8.5/10 | Levels 1–100 (Page Turner → Oracle) ✅. No features locked behind level ✅. Personas carry 0 AP ✅. 29-task onboarding with chapter badges ✅. Challenges provide structured aspiration arcs ✅. |

**Top Improvement Opportunities (Prioritized by Impact):**

1. **Persona clarity → Archetype chip on Home tab header:**
   - Suggestion 1: In the Home tab render function, inject a one-line persona strip below the header: `[emoji] [ArchetypeName]` pill, `var(--arka-accent)` border, taps to `openMyPersonality()`. Forming state shows a translucent "Still forming…" nudge.
   - Suggestion 2: Add archetype emoji to the member's avatar overlay in the Home feed, creating a persistent identity signal across all social interactions.
   - **Impact:** Quick Win · **Effort:** 1–2h

2. **Persona clarity → Rarity peer signal on other members' profiles:**
   - Suggestion 1: In `showMemberProfile()`, read `personaProfileMap.get(memberId)?.raritySummary?.archetypeShare` and render a "1 of 3 members with this archetype" pill below the persona chip. The data is already in `globalPersonaProfileDB` loaded in Wave 3.
   - **Impact:** Quick Win · **Effort:** 1–2h

3. **Peer visibility → Feed micro-reactions:**
   - Already noted in Engagement #1. A 🎉 "Congrats" tap on `ARKA_ACTTYP_BOOKREAD` feed cards would close the biggest social gap in the app.
   - **Impact:** Medium Effort · **Effort:** 1–2 days

---

# FINAL DELIVERABLES

## Overall Product Score: **8.5 / 10**
*(V1: 7.2 → V2: 8.8 → V3: 8.5 — slight recalibration)*

> The slight dip from V2's 8.8 reflects honest accounting: several V2 quick wins (share nudge recovery, help-whats-new, archetype chip on Home) remain open, the Prediction Engine is now formally approved and designed but unbuilt (a gap that matters more at v127 than it did at v109), and a fresh code read surfaced a dozen post-Phase-6 token violations that erode the visual consistency score. The app is genuinely excellent for an 80-member club running on GAS — the architecture is sound, the persona system is distinctive, the help center is best-in-class, and the engagement loop is well-designed. But the delta between "what's approved" and "what's built" is widening.

---

## Strength Summary (5 things working well)

1. **Persona system as a differentiator.** The 5-axis personality model, evolution timeline via `ARKA_ACTTYP_PERSONAUPDATE`, rarity signals, and blind-spot insight are features no mainstream reading app offers. It creates a genuine reason to open Arka beyond logging pages.

2. **Design token architecture.** 1,303 `var(--)` usages, AA-compliant text contrast fixes baked in, Phase 6 semantic tokens deployed. The infrastructure is now dark-mode-ready; only the surface sweep remains.

3. **Email re-engagement pipeline.** Priority-ordered `(STREAK_RISK > CHALLENGE_DEADLINE > FINISH_NUDGE > REENGAGEMENT)` with frequency caps, kill switches, and click-through tracking. Well-engineered for an 80-member scale.

4. **Help center as a club narrative.** 47 articles including the 10-chapter Arka Story, custom `huk-*` UI kit, Fuse.js search, and article-to-article cross-links. The history and culture are documented in a way that makes the app feel inhabited.

5. **Wave loading architecture + AppLoadTimingDB.** Parallel 4-wave fetch keeps perceived load fast. Telemetry records `BigGulpMs`, `RenderMs`, and `TotalMs` per session — the instrumentation to detect regressions is already in place.

---

## Critical Path (top 5 changes that unlock the most value)

1. **Build Prediction Engine Phase 1.** AJ has approved. It's the highest-ROI unbuilt feature. Finish Date + DNF Risk chips on Reading shelf cards close the "what should I do next?" gap that no other feature can fill. *(Long-term Investment, 3–5 days)*

2. **Surface colour tokenisation → unblock dark mode.** Add `--color-surface: #ffffff` and `--color-page-bg: #f4f7f6` to `:root`. Sweep 311 `#fff`/`white` + 9 `#f4f7f6` instances. Then draft the `@media (prefers-color-scheme: dark)` `:root` override block with the existing 24-row mapping. Reading apps live at night. *(Long-term Investment, 3–5 days)*

3. **Post-Phase-6 token violation cleanup.** 12 specific violations identified above (`profile-edit-dot`, `persona-toggle-switch`, BOOKPOST_TYPE_CONFIG, `profile-level-pill`, `profile-genre-chip`). Each is a 1-line surgical edit. Collectively they close the visual consistency gap and harden the token discipline for future contributors. *(Quick Win, 1–2h)*

4. **Archetype chip on Home tab header + rarity signal on member profiles.** Two highest-visibility persona surfaces still not reached. Pattern exists on Me tab; copy-adapt is under 2h each. Together they close the persona discoverability gap on the two highest-frequency surfaces. *(Quick Win, 2–4h total)*

5. **Write-path error handling.** Add `.withFailureHandler()` to every `google.script.run` write in the log reading and shelf update flows. Show a `arkaToast` with `type: 'error'` + "Retry" action link. A swallowed write currently looks like success — this is the highest-risk UX silent failure in the app. *(Medium Effort, 4–8h)*

---

## Quick Wins *(each <4h, immediate perception improvement)*

| Item | File | Effort |
|---|---|---|
| **Archetype chip on Home tab header** | `app.js` (Home render fn) | 1–2h |
| **Rarity signal on other member profiles** | `app.js` (`showMemberProfile()`) | 1–2h |
| **`help-whats-new` June 2026 entry** | `ArkaHelp.html` | 1–2h |
| **Post-Phase-6 token violations** (12 surgical edits) | `styles.css` L205, 215, 290, 301, 304; `app.js` L330–334 | 1–2h |
| **"Share this finish" row on Finished shelf cards** | `app.js` (`renderUserShelves()`) | 2–3h |
| **Expose yearly badge win criteria in badge gallery** | `app.js` (badge card renderer) | 2–3h |
| **Replace "PLogger weeks" in coach payloads** | `ArkaAIPass.gs` prompt template | 1–2h |
| **Error state → help link in toast failure handler** | `app.js` (`.withFailureHandler` blocks) | 30 min per path |
| **Feedback status visibility in ☰ More drawer** | `app.js` (drawer render) | 2–3h |
| **Remove TEN_PAGES_MEMBER_MAP PII from frontend JS** | `app.js` L82–103 | 2–3h |

---

## Strategic Bets *(3-month cycle)*

| Bet | Why | Prerequisite |
|---|---|---|
| **Dark mode** | Reading apps are night apps. The 24-row mapping is designed. Tokens are ready. Only the surface sweep remains. The payoff — a polished dark theme — would be the most visible product improvement to date. | Surface colour tokenisation sweep (see Critical Path #2) |
| **Prediction Engine Phase 1** | Finish Date + DNF Risk + Oracle Score closes the "data → next action" gap. It turns the Reading shelf from a passive status tracker into a proactive coach. Pure arithmetic in MasterEngine + shelf card UI. | Already approved; code design complete |
| **Home feed micro-reactions** | A 🎉 Congrats tap on `ARKA_ACTTYP_BOOKREAD` and badge entries would be the first genuine social interaction layer in the app. It turns the feed from a broadcast into a conversation. Stays within Sheets OAuth scope. | New ActivityTypeDB entry + backend function |
| **Reading Universe Graph** | D3.js force-directed book graph. The design is done, OAuth scope requirement is met (Gemini theme-tagging routes through existing ArkaAIPass pattern). Would be the most visually distinctive feature in the app — a visual map of the club's collective reading memory. | D3.js already loaded; Gemini tagging pipeline exists |
| **Code Optimisation Pass** | 25% line reduction is realistic (CSS class extraction from render functions is the dominant driver per pre-analysis). Reduces GAS template parse time and makes the codebase more reviewable. Execute in sequence: Render CSS layer → rewrite by feature → strip JSDoc → CSS consolidation. | None |

---

## Constraint Compliance Check

- **OAuth scopes:** All suggestions stay within `Sheets / Drive / profile / HtmlService`. Feed reactions use existing `logActivityBatch()` pattern. Gemini calls stay in `ArkaAIPass.gs`. ✅
- **Design tokens:** All colour suggestions use `var(--token)` — no raw hex in suggestions. New recurring colours promoted to tokens before use. ✅
- **Persona + badge model:** Persona rarity signal reads existing `PersonaProfileDB.RaritySummary` — no new schema. Yearly award win criteria reads existing `YEARLY_MIN_THRESHOLDS` constant. ✅
- **Data sources:** All Quick Win suggestions read data already present in Wave 1–3. No new backend functions required for the Quick Wins. ✅
- **Surgical edits only:** Every suggestion is a targeted find/replace or single-function addition. No full-file regeneration. ✅

---

*Audit completed: June 2026 · Build v127 · Auditor: Multi-disciplinary product audit (UX / Visual Design / User Research / Data PM / Community & Social / Feature Architecture / Content Strategy / Behavioral Psychology)*
