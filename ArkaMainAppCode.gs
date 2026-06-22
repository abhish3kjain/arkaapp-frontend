/**
 * ============================================================================
 * ARKA READERS CLUB - BACKEND SYSTEM (Google Apps Script)
 * ============================================================================
 * This file acts as the "Server" for the app. It handles all the reading and 
 * writing to the Google Sheets database. The frontend HTML file calls these 
 * functions using `google.script.run`.
 */

/**
 * @typedef {Object} MemberRecord
 * @property {string} memberId - Unique ID: ARKA_MEMBER_X (Col A)
 * @property {string} email - Primary and Alternate Gmails (Col B)
 * @property {string} fullName - The "Signature" name (Col C)
 * @property {string} displayName - Primary handle/nickname (Col D)
 * @property {string} joinDate - Date user registered: dd-MMM-yyyy (Col E)
 * @property {string} country - User-provided location (Col F)
 * @property {string} shortBio - Personal introduction text (Col G)
 * @property {string} langSpoken - Languages and levels (Col H)
 * @property {string} linkedIn - Full URL to LinkedIn profile (Col I)
 * @property {string} goodreads - Full URL to Goodreads profile (Col J)
 * @property {string} favGenre - Preferred book categories (Col K)
 * @property {string} readingGoal - Personal reading goal (Col L)
 * @property {string}      lastAccessed  - Timestamp of last app open (Col M)
 * @property {Object|null} celebration   - Pending celebration payload written by MasterEngine (Col N).
 *   JSON shape: { badges: string[], newLevel: string }. Null/blank = nothing pending.
 *   Cleared server-side by clearMemberCelebration() when the member dismisses the card.
 * @property {number} totalClubPoints - Numeric sum of points (Col O)
 * @property {number} totalPages - Lifetime pages read (Col P)
 * @property {number} totalBooks - Lifetime books finished (Col Q)
 * @property {string} imageUrl - Direct link to Google Drive avatar (Col R)
 */

/**
 * @typedef {Object} LibraryRecord
 * @property {string} bookId - Unique ID: ARKA_BOOK_X (Col A)
 * @property {string} title - Formal name of the book (Col B)
 * @property {string} author - Writer's name (Col C)
 * @property {string} genre - Primary genre/category (Col D)
 * @property {number} pages - Total page count (Col E)
 * @property {string} addedBy - MemberID of person who added the book (Col F)
 * @property {string} addedDate - Simple date: dd-MMM-yyyy (Col G)
 * @property {string} lastModifiedDate - Timestamp of last info update (Col H)
 * @property {string} lastModifiedBy - MemberID of person who last edited (Col I)
 * @property {string} coverUrl - External link to book cover image (Col J)
 * @property {string} isbn13 - 13-digit standard book identifier (Col K)
 * @property {string|number} publishedDate - Year or date book was released (Col L)
 * @property {string} blurb - Short summary or description (Col M)
 */

/**
 * @typedef {Object} ShelfRecord
 * @property {string} shelfId - Unique ID: ARKA_SHELF_X (Col A)
 * @property {string} memberId - ARKA_MEMBER_X owning this shelf (Col B)
 * @property {string} bookId - ARKA_BOOK_X being tracked (Col C)
 * @property {string} status - To Read, Reading, Finished, or Did Not Finish (Col D)
 * @property {number} rating - Numeric rating from 1 to 5, 0 = Unrated (Col E)
 * @property {string} review - Text-based thoughts (Col F)
 * @property {string} dateAdded - When book was first put on shelf (Col G)
 * @property {string} dateUpdated - When status/pages were last changed (Col H)
 * @property {string} dateFinished - Date user finished the book (Col I)
 * @property {number} pagesRead - Current page number reached (Col J)
 * @property {string} lastModifiedOn - Full technical timestamp (Col K)
 */

/**
 * @typedef {Object} ActivityLogRecord
 * @property {string} activityId - Unique ID: ARKA_ACT_X (Col A)
 * @property {string} activityTypeId - Code for action, e.g., ARKA_ACTTYP_BOOKREAD (Col B)
 * @property {string} activityDate - Timestamp: dd-mm-yyyy hh:mm:ss Z (Col C)
 * @property {string} memberId - Who performed the action (Col D)
 * @property {string} description - Extra context like BookID or ShelfID (Col E)
 * @property {string} source - App version or external app name (Col F)
 * @property {number} cpAwarded - Points granted for this action (Col G)
 */

/**
 * @typedef {Object} BookPostRecord
 * @property {string} postId - Unique ID: ARKA_BOOKPOST_X (Col A)
 * @property {string} bookId - ARKA_BOOK_X being discussed (Col B)
 * @property {string} memberId - ARKA_MEMBER_X of the post author (Col C)
 * @property {string} timestamp - Date and time of the post: dd-mm-yyyy hh:mm:ss Z (Col D)
 * @property {string} postType - Category of the post (e.g., 'General Note', 'Quote I Loved') (Col E)
 * @property {string} content - The actual text content of the post (Col F)
 * @property {string} status - Visibility status: 'Active' or 'Deleted' (Col G)
 * @property {number} likeCount - Numeric sum of likes received (Col H)
 */
 
/**
 * @typedef {Object} ChallengeRecord
 * @property {string}  challengeId     - Unique ID: ARKA_CHAL_X               (Col A)
 * @property {string}  challengeType   - HABIT_STREAK | BINGO_GRID | etc.     (Col B)
 * @property {string}  title           - Display name                          (Col C)
 * @property {string}  description     - What members need to do               (Col D)
 * @property {string}  startDate       - dd-MMM-yyyy                           (Col E)
 * @property {string}  endDate         - dd-MMM-yyyy or blank if open-ended    (Col F)
 * @property {number}  goalValue       - Primary numeric target                (Col G)
 * @property {string}  goalUnit        - pages | books | letters | countries   (Col H)
 * @property {string}  goalConfigJson  - Type-specific config as JSON string   (Col I)
 * @property {string}  status          - Active | Upcoming | Completed |       (Col J)
 *                                       Archived
 * @property {string}  competitionMode  - NONE | INDIVIDUAL | SHARED | TEAM     (Col K)
 * @property {string}  seriesTag       - Groups editions e.g. BOOK_BINGO       (Col L)
 * @property {boolean} isPinned        - Pin to top of Challenges list         (Col M)
 * @property {string}  createdBy       - ARKA_MEMBER_X                         (Col N)
 * @property {string}  createdOn       - dd-MM-yyyy HH:mm:ss Z                 (Col O)
 */
 
/**
 * @typedef {Object} ChallengeEnrollmentRecord
 * @property {string} enrollmentId         - Unique ID: ARKA_ENRL_X           (Col A)
 * @property {string} challengeId          - ARKA_CHAL_X                      (Col B)
 * @property {string} memberId             - ARKA_MEMBER_X                    (Col C)
 * @property {string} enrolledOn           - dd-MM-yyyy HH:mm:ss Z            (Col D)
 * @property {string} enrollmentStatus     - Active | Winner | Finisher |     (Col E)
 *                                           Dropped
 * @property {number} currentProgressValue - Quick-read integer progress      (Col F)
 * @property {string} progressStateJson    - Full progress state as JSON str  (Col G)
 * @property {string} lastProgressUpdate   - dd-MM-yyyy HH:mm:ss Z            (Col H)
 * @property {string} completedOn          - dd-MM-yyyy HH:mm:ss Z or blank   (Col I)
 */

const APP_VERSION = "v134";
// ── Sheet names ───────────────────────────────────────────────────────────────
const SPREADSHEET_ID             = '1qXsAAO_9aIEJuTTQ1ziX9s5plvm6WHaVI_zaKcSXF-4';
const MEMBERS_SHEET              = "MemberDB";
const LIBRARY_SHEET              = "ArkaLibraryDB";
const SHELF_SHEET                = "MemberShelfDB";
const ACTIVITYLOG_SHEET          = "ActivityLogDB";
const FEEDBACK_SHEET             = "FeedbackDB";
const PAGELOG_SHEET  = 'PageLogDB';
const BADGE_DB_SHEET             = "BadgeDB";
const BADGE_AWARD_DB_SHEET       = "BadgeAwardDB";
const ANNOUNCEMENT_SHEET         = "AnnouncementDB";
const EVENT_SHEET                = "EventDB";
const EVENT_RSVP_SHEET           = "EventRSVPDB";
const CHALLENGE_SHEET            = "ChallengeDB";
const CHALLENGE_ENROLLMENT_SHEET = "ChallengeEnrollmentDB";
const BOOK_POST_SHEET            = "BookPostDB";
const READING_NOTES_SHEET        = "ReadingNotesDB";

// ── Google Drive folder IDs ───────────────────────────────────────────────────
const PROFILE_PICS_FOLDER_ID  = '11n3v_TfITYYOCg-IQRFSrgqs89M0T1j8';
const BADGE_IMAGES_FOLDER_ID    = '1WLX0fy5RkuvMzpQwCkQjjSVlFTajxY59';
const EVENT_ASSETS_FOLDER_ID    = '1R0-aaxcymLuemLRXK2E_E0sqYEQdFC37';
const BOOK_COVERS_FOLDER_ID     = '1a4CaUw3OjxkZQrvMxOtwFZWuWvc_-taD';
const FEEDBACK_IMAGES_FOLDER_ID = '1lhRX1kpIYLRXHAk0znVCoSkMoIOGtZ0i';

// ── BackEndEngine spreadsheet (EmailQueueDB lives here, separate from main DB) ──
const EMAIL_BACKEND_SPREADSHEET_ID = '1s5h8T6PGPTOBs_RKJNRJjRCZm8igWJzmniLRoW7BFJA';

// ── 10 Pages A Day bridge constants ───────────────────────────────────────
// TEMPORARY — deprecated when the 10 Pages A Day app is retired.
// All functions that reference these constants are clearly marked TEMPORARY.
const TEN_PAGES_SPREADSHEET_ID = "1AaGClZVoDcq-YOnd1cUwWWl6ZgEiuTDS5fvalp71_o0";
const TEN_PAGES_SHEET_NAME     = "10aDay_Input_2026";


/**
 * Fallback timezone offset string used when the client does not supply one.
 * Matches the GAS script timezone so existing behaviour is preserved for
 * writes that predate timezone-awareness.
 * Format: "+0530" or "-0500" — matches Arka Z-Format offset segment.
 */
const DEFAULT_TZ_OFFSET_FALLBACK = '+0000';

/**
 * buildArkaTimestamp_(rawClientTzOffset)
 *
 * Builds a timestamp string in Arka Z-format (dd-MM-yyyy HH:mm:ss ±HHMM) that
 * encodes the MEMBER'S LOCAL TIME rather than the script server time. The offset
 * is embedded so any downstream reader (_personaExtractHour_, MasterEngine audit
 * rules, time-of-day analytics) can reconstruct the exact local hour.
 *
 * Correctness note: new Date() in GAS gives a UTC instant. getHours() on that
 * object returns the hour in the script project's configured timezone — NOT the
 * member's local time. To get the member's local hour we must:
 *   1. Read the UTC millisecond epoch.
 *   2. Add the client's offset in milliseconds to produce a "shifted" Date.
 *   3. Read getUTC* from the shifted Date — those methods always use UTC,
 *      so they give us the local components correctly.
 *
 * Falls back to DEFAULT_TZ_OFFSET_FALLBACK (+0000 UTC) when rawClientTzOffset
 * is absent or malformed. This makes all server-side / MasterEngine calls safe
 * with no change to their call signatures.
 *
 * @param  {string|null|undefined} rawClientTzOffset - Client offset e.g. '+0530' or '-0500'.
 * @returns {string} Timestamp in format 'dd-MM-yyyy HH:mm:ss ±HHMM'.
 */
function buildArkaTimestamp_(rawClientTzOffset) {
  // ── Validate offset — must be ±HHmm, e.g. '+0530' or '-0500' ─────────────
  const raw             = (rawClientTzOffset || '').toString().trim();
  const validatedOffset = /^[+-]\d{4}$/.test(raw) ? raw : DEFAULT_TZ_OFFSET_FALLBACK;

  // ── Compute the member's local time from the UTC instant ──────────────────
  // Parse offset into total minutes, convert to ms, shift the UTC epoch.
  const offsetSign    = validatedOffset[0] === '+' ? 1 : -1;
  const offsetHours   = parseInt(validatedOffset.substring(1, 3), 10);
  const offsetMinutes = parseInt(validatedOffset.substring(3, 5), 10);
  const offsetMs      = offsetSign * (offsetHours * 60 + offsetMinutes) * 60 * 1000;

  // Shift: treat the resulting Date's UTC fields as the member's local fields.
  const shiftedDate = new Date(new Date().getTime() + offsetMs);

  const dd   = String(shiftedDate.getUTCDate()).padStart(2, '0');
  const mm   = String(shiftedDate.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = shiftedDate.getUTCFullYear();
  const HH   = String(shiftedDate.getUTCHours()).padStart(2, '0');
  const min  = String(shiftedDate.getUTCMinutes()).padStart(2, '0');
  const sec  = String(shiftedDate.getUTCSeconds()).padStart(2, '0');

  return `${dd}-${mm}-${yyyy} ${HH}:${min}:${sec} ${validatedOffset}`;
}

/**
 * buildArkaDateOnly_(rawClientTzOffset)
 *
 * Returns the member's LOCAL calendar date as 'dd-MMM-yyyy', applying the same
 * UTC-shift logic as buildArkaTimestamp_() so the recorded date matches the
 * member's timezone — not the script server's timezone.
 *
 * Use this for date-only columns (e.g. ArkaLibraryDB AddedDate Col G,
 * MemberShelfDB DateAdded Col G) where storing the full timestamp is not
 * appropriate but the correct local calendar day still matters.
 *
 * Falls back to DEFAULT_TZ_OFFSET_FALLBACK (+0000 UTC) when rawClientTzOffset
 * is absent or malformed — identical fallback behaviour to buildArkaTimestamp_().
 *
 * @param  {string|null|undefined} rawClientTzOffset - Client offset e.g. '+0530' or '-0500'.
 * @returns {string} Date string in format 'dd-MMM-yyyy', e.g. '14-Jun-2026'.
 */
function buildArkaDateOnly_(rawClientTzOffset) {
  const MONTH_ABBREV = ['Jan','Feb','Mar','Apr','May','Jun',
                        'Jul','Aug','Sep','Oct','Nov','Dec'];

  // ── Validate offset — same rules as buildArkaTimestamp_ ───────────────────
  const raw             = (rawClientTzOffset || '').toString().trim();
  const validatedOffset = /^[+-]\d{4}$/.test(raw) ? raw : DEFAULT_TZ_OFFSET_FALLBACK;

  // ── Shift UTC instant to member's local time ──────────────────────────────
  const offsetSign    = validatedOffset[0] === '+' ? 1 : -1;
  const offsetHours   = parseInt(validatedOffset.substring(1, 3), 10);
  const offsetMinutes = parseInt(validatedOffset.substring(3, 5), 10);
  const offsetMs      = offsetSign * (offsetHours * 60 + offsetMinutes) * 60 * 1000;
  const shiftedDate   = new Date(new Date().getTime() + offsetMs);

  const dd   = String(shiftedDate.getUTCDate()).padStart(2, '0');
  const mmm  = MONTH_ABBREV[shiftedDate.getUTCMonth()];
  const yyyy = shiftedDate.getUTCFullYear();

  return `${dd}-${mmm}-${yyyy}`;
}

/**
 * Canonical dual-member map: Arka member ID → 10 Pages A Day display name.
 * Used by getTenPagesNote() and bridgeTenPagesUpdate_() to resolve member names.
 *
 * ─── HOW TO UPDATE MEMBERSHIP ────────────────────────────────────────────────
 * Do NOT edit this block here. Edit TEN_PAGES_MEMBER_MAP in TenPagesADay_V3.gs,
 * then copy-paste this exact object literal here and into ArkaClubApp.html.
 *
 * TEMPORARY — deprecated when 10 Pages A Day is retired.
 * @type {Object.<string, string>}
 */
const TEN_PAGES_MEMBER_MAP = {
  'ARKA_MEMBER_1'  : 'Abhishek Jain',
  'ARKA_MEMBER_2'  : 'Jayasimha',
  'ARKA_MEMBER_3'  : 'Bhaskara',
  'ARKA_MEMBER_4'  : 'Meghana',
  'ARKA_MEMBER_5'  : 'Santhosh Kumar',
  'ARKA_MEMBER_6'  : 'Ishan Kulkarni',
  'ARKA_MEMBER_7'  : 'Shilpa B K',
  'ARKA_MEMBER_9'  : 'Sushma',
  'ARKA_MEMBER_12' : 'Jayashree',
  'ARKA_MEMBER_14' : 'Pranav',
  'ARKA_MEMBER_15' : 'Radhika',
  'ARKA_MEMBER_16' : 'Sriraksha Sudheendra',
  'ARKA_MEMBER_17' : 'Raunak R',
  'ARKA_MEMBER_18' : 'Riya',
  'ARKA_MEMBER_19' : 'Vaibhav Bhatnagar',
  'ARKA_MEMBER_25' : 'Meena',
  'ARKA_MEMBER_28' : 'Mahima',
  'ARKA_MEMBER_29' : 'Akhtar',
  'ARKA_MEMBER_30' : 'Lakshmi V',
  'ARKA_MEMBER_32' : 'Viswamohan',
  'ARKA_MEMBER_33' : 'Aswathy Girija'
};

/**
 * Member IDs that have administrative privileges.
 * Update this array to add or remove admins.
 * Must be kept in sync with ADMIN_MEMBER_IDS on the frontend.
 * @type {string[]}
 */
const ADMIN_MEMBER_IDS_BACKEND = ['ARKA_MEMBER_1'];

/**
 * ── Member approval gate ────────────────────────────────────────────────────
 * MemberDB Col T (the 20th column) holds each member's access-approval state.
 * A member may only read club data or perform writes when this cell is exactly
 * APPROVAL_STATUS.APPROVED. Any other value — Pending, Rejected, or blank — is
 * treated as "not approved" and is denied at the SERVER level (not just the UI).
 *
 * NOTE: there is intentionally NO grandfather rule. Every legitimate existing
 * member must be set to 'Approved' in Col T BEFORE this gate is deployed, or
 * they will be locked out on their next load.
 */
const MEMBER_APPROVAL_COL_INDEX  = 19;   // 0-based index into a MemberDB row (Col T)
const MEMBER_APPROVAL_COL_NUMBER = 20;   // 1-based sheet column number (Col T) for getRange/setValue

/**
 * ── Member celebration column ───────────────────────────────────────────────
 * MemberDB Col N holds the pending celebration JSON written by MasterEngine.
 * Shape: { badges: string[], newLevel: string }
 *   badges   — badge IDs earned since the member last saw a celebration card.
 *              MasterEngine appends; never overwrites existing IDs. [] = none.
 *   newLevel — most recent level the member advanced to (e.g. "Bookworm III").
 *              MasterEngine replaces on every level-up. '' = no pending level-up.
 * Cleared (set to '') by clearMemberCelebration() when the member dismisses the card.
 * Source of truth for badge data remains BadgeAwardDB — this column is a signal only.
 */
const MEMBER_CELEBRATION_COL_INDEX  = 13;  // 0-based (Col N)
const MEMBER_CELEBRATION_COL_NUMBER = 14;  // 1-based for getRange/setValue (Col N)
const APPROVAL_STATUS = Object.freeze({
  APPROVED : 'Approved',
  PENDING  : 'Pending',
  REJECTED : 'Rejected'
});

/**
 * Maximum ActivityLogDB rows fetched by getWave2Data() per load.
 * At ~300 bytes/row, 2000 rows ≈ 600 KB — safely within the 6 MB GAS response cap.
 * Increase if the Home feed starts missing recent activity as membership grows.
 */
const ACTIVITY_LOG_FETCH_LIMIT = 2000;

/**
 * Maximum rows scanned from the bottom of PageLogDB when building the 90-day
 * global slice in getWave1Data(). At 12 rows/day club-wide, 90 days = ~1,080
 * rows. 2000 gives a 2× safety margin for burst activity without a full scan.
 * Personal all-time data is fetched separately via getMyPageLogs().
 */
const PAGE_LOG_GLOBAL_SCAN_LIMIT = 2000;

/**
 * Function: doGet(e)
 * Parameters: e {Object} — GAS request event (unused but required by GAS framework)
 * Return Type: HtmlOutput
 * Logic Summary: Entry point for all web requests. Serves ArkaClubApp.html as a processed
 * template enabling <?!= include() ?> partials. Sets the page title, viewport meta tag,
 * and ALLOWALL X-Frame policy (required for GAS web apps served inside iframes).
 */
function doGet(e) {
  // Route ?page=reports to the standalone admin reports web app.
  var requestedPage = (e && e.parameter && e.parameter.page) ? e.parameter.page : '';

  if (requestedPage === 'admin') {
    // Gate at the doGet() level — non-admins never receive the admin HTML.
    // getAdminPanelData() has its own server-side check too, providing
    // defence-in-depth, but this first gate is cleaner and leaks nothing.
    const adminRequesterId = getVerifiedMemberId();
    if (!adminRequesterId || !isAdminMember(adminRequesterId)) {
      return HtmlService.createHtmlOutput(
        '<!DOCTYPE html><html><head><meta charset="UTF-8">' +
        '<style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;' +
        'min-height:100vh;margin:0;background:#f4f7f6;color:#5b6b6e;flex-direction:column;gap:12px}' +
        'h2{color:#2c3e50;margin:0}p{margin:0;font-size:.9rem}</style></head>' +
        '<body><h2>🔒 Access Denied</h2>' +
        '<p>Admin privileges are required to view this page.</p></body></html>'
      )
      .setTitle('Access Denied')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }
    return HtmlService.createTemplateFromFile('ArkaAdminControlPanel')
        .evaluate()
        .setTitle('Arka Admin Control Panel')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
        .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }

  if (requestedPage === 'reports') {
    return HtmlService.createTemplateFromFile('ArkaReports')
        .evaluate()
        .setTitle('Arka Club Reports')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
        .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }

  // Default: serve the main Arka Club app.
  //
  // Extract ?eid= (email tracking token) injected by ArkaEmailPass into every
  // email deep-link. Sanitised to alphanumeric + underscore only — rejects any
  // attempt to inject arbitrary content via the URL parameter before it reaches
  // the HTML template. Empty string when the app is opened directly (no email link).
  var rawEid          = (e && e.parameter && e.parameter.eid) ? e.parameter.eid.toString() : '';
  var emailTrackingId = /^[A-Z0-9_]+$/i.test(rawEid) ? rawEid : '';

  // launchParamsJson is a scriptlet variable read by ArkaClubApp.html at serve
  // time via  <?!= launchParamsJson ?>  — injected as window.ARKA_LAUNCH_PARAMS.
  // Flat object so future launch params (e.g. optout, campaign) can be added
  // without changing the injection pattern or the frontend reading pattern.
  var template             = HtmlService.createTemplateFromFile('ArkaClubApp');
  template.launchParamsJson = JSON.stringify({ eid: emailTrackingId });

  return template
      .evaluate()
      .setTitle('Arka Readers Club')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * GAS Template Helper — required for <?!= include('FileName') ?> to work.
 * Reads any HTML file in the project and returns its raw content as a string.
 * Called at serve time by the template engine, never by frontend JS.
 *
 * @param {string} filename - The GAS HTML file name without .html extension
 * @returns {string} Raw file contents injected inline into the parent template
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * 2. Check if user exists on load
 * Runs immediately when the app opens to see if the logged-in Google account 
 * is already registered in the MemberDB.
 * @returns {Object} Status of the user ("exists" or "new") and their basic info.
 */

/**
 * Checks if the authenticated Google user is a registered Arka member.
 * Called once on every app load via google.script.run.
 *
 * Uses UserCache to skip the MemberDB scan and LastAccessed write on
 * repeat loads within the same browser session (6-minute TTL).
 * Cache miss (first load or expired) does the full scan and write.
 *
 * @returns {{ status: 'exists'|'new', memberID?: string,
 *             email?: string, version: string }}
 */
function initializeUser() {
  const email      = Session.getActiveUser().getEmail();
  const emailKey   = email.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const userCache  = CacheService.getUserCache();
  const INIT_CACHE_KEY = 'arka_init_member_' + emailKey;

  // ── Cache hit — only APPROVED members are cached, so this is a fast path ──
  const cachedMemberId = userCache.get(INIT_CACHE_KEY);
  if (cachedMemberId) {
    return { status: 'exists', memberID: cachedMemberId, version: APP_VERSION };
  }

  // ── Cache miss — full MemberDB scan ──────────────────────────────────────
  const t0    = Date.now();
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(MEMBERS_SHEET);
  const data  = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    const storedEmails = data[i][1].toString().split(',');
    if (storedEmails.map(function(e) { return e.trim(); }).includes(email)) {
      const memberId    = data[i][0];
      const displayName = data[i][3];
      const approval    = (data[i][MEMBER_APPROVAL_COL_INDEX] || '').toString().trim();

      // ── Not approved — route to the pending/rejected screen ────────────────
      // No cache write, no LastAccessed write: the next load after an admin
      // approves them re-scans and lets them straight in.
      if (approval !== APPROVAL_STATUS.APPROVED) {
        const routedStatus = (approval === APPROVAL_STATUS.REJECTED) ? 'rejected' : 'pending';
        console.log('initializeUser: ' + memberId + ' not approved (' + (approval || 'blank') + ')');
        return {
          status      : routedStatus,
          email       : email,
          displayName : displayName,
          version     : APP_VERSION
        };
      }

      // ── Approved member — normal path ──────────────────────────────────────
      const now = Utilities.formatDate(
        new Date(), Session.getScriptTimeZone(), 'dd-MM-yyyy HH:mm:ss Z'
      );
      sheet.getRange(i + 1, 13).setValue(now); // Col M — LastAccessed
      userCache.put(INIT_CACHE_KEY, memberId, 360);

      // Prime getVerifiedMemberId()'s cache too. initializeUser runs before the
      // wave calls, so this makes every wave's approval-gate check a pure cache
      // hit — no wave triggers its own MemberDB scan just to verify approval.
      userCache.put('verified_member_id_' + emailKey, memberId, 360);

      console.log('initializeUser full scan: ' + (Date.now() - t0) + 'ms');
      return { status: 'exists', memberID: memberId, version: APP_VERSION };
    }
  }

  // New user — registration flow handles their first entry
  console.log('initializeUser new user scan: ' + (Date.now() - t0) + 'ms');
  return { status: 'new', email: email, version: APP_VERSION };
}

/**
 * Private helper: extracts a Drive file ID from a thumbnail URL and returns
 * the file as a base64 data-URI. Centralises the identical blob-fetch pattern
 * shared by getBookCoverBase64, getDriveImageBase64, and getMyProfileImageBase64.
 *
 * @param  {string} driveUrl       - Drive URL containing ?id=FILE_ID or &id=FILE_ID.
 * @param  {string} [fallbackMime] - MIME type if the blob has no content type. Default 'image/jpeg'.
 * @returns {string|null}            Base64 data-URI or null on any failure.
 */
function _driveUrlToBase64_(driveUrl, fallbackMime) {
  if (!driveUrl) return null;
  const match = driveUrl.toString().match(/[?&]id=([^&]+)/);
  if (!match) return null;
  try {
    const blob   = DriveApp.getFileById(match[1]).getBlob();
    const mime   = blob.getContentType() || (fallbackMime || 'image/jpeg');
    return 'data:' + mime + ';base64,' + Utilities.base64Encode(blob.getBytes());
  } catch (e) {
    console.warn('_driveUrlToBase64_ failed for ' + driveUrl + ': ' + e.message);
    return null;
  }
}

/**
 * Fetches a book's cover image from Google Drive and returns it as a base64
 * data-URI. Called by the frontend share-card generator to bypass browser-side
 * CORS restrictions on Drive thumbnail URLs — DriveApp runs server-side where
 * those restrictions do not apply.
 *
 * Extracts the Drive file ID from the stored thumbnail URL, reads the blob,
 * and encodes it. Returns null on any failure so the caller can fall back to
 * the coloured placeholder cover.
 *
 * @param  {string} bookId - ARKA_BOOK_X identifier.
 * @returns {string|null}   Base64 data-URI ("data:image/jpeg;base64,…") or null.
 */
function getBookCoverBase64(bookId) {
  try {
    const ss       = SpreadsheetApp.openById(SPREADSHEET_ID);
    const libSheet = ss.getSheetByName(LIBRARY_SHEET);
    const libData  = libSheet.getDataRange().getValues();

    let coverUrl = '';
    for (let i = 1; i < libData.length; i++) {
      if (libData[i][0] === bookId) {
        coverUrl = (libData[i][9] || '').toString().trim(); // Col J: coverImageURL
        break;
      }
    }
    if (!coverUrl) return null;

    return _driveUrlToBase64_(coverUrl, 'image/jpeg');
  } catch (err) {
    console.warn('getBookCoverBase64 failed for ' + bookId + ': ' + err.message);
    return null;
  }
}


/**
 * Generic Drive-image → base64 fetcher.
 *
 * html2canvas cannot rasterize cross-origin Drive images (no CORS headers), so any
 * card that is captured client-side must have its Drive images inlined as base64
 * first. This is the badge-image counterpart to getBookCoverBase64() — same blob
 * pattern, but accepts an arbitrary Drive thumbnail URL rather than a bookId lookup.
 *
 * Accepts the standard Drive thumbnail URL format (…?id=FILE_ID&sz=…). Returns null
 * on any failure so the caller can fall back to the original URL / emoji placeholder.
 *
 * @param  {string} driveUrl - Drive thumbnail URL containing ?id=FILE_ID.
 * @returns {string|null}      Base64 data-URI ("data:image/png;base64,…") or null.
 */
function getDriveImageBase64(driveUrl) {
  return _driveUrlToBase64_(driveUrl, 'image/png');
}

/**
 * Fetches the current user's profile photo from Google Drive and returns it
 * as a base64 data-URI. Called once per session by the share card system to
 * avoid repeated GAS round-trips (result is cached in _arkaSCMyAvatarBase64).
 *
 * Uses the same Drive blob pattern as getBookCoverBase64() — server-side fetch
 * bypasses the browser CORS restriction on Drive thumbnail URLs.
 *
 * @returns {string|null} Base64 data-URI ("data:image/jpeg;base64,…") or null.
 */
function getMyProfileImageBase64() {
  try {
    const email     = Session.getActiveUser().getEmail();
    const ss        = SpreadsheetApp.openById(SPREADSHEET_ID);
    const memSheet  = ss.getSheetByName(MEMBERS_SHEET);
    const memData   = memSheet.getDataRange().getValues();

    // Lowercase once outside the loop — avoids repeated .toLowerCase() calls per row.
    const emailLower = email.toLowerCase().trim();

    let imageUrl = '';
    for (let i = 1; i < memData.length; i++) {
      // Split on comma to handle primary + alternate email entries in Col B,
      // matching the same pattern used by initializeUser and updateMemberProfile.
      const storedEmails = (memData[i][1] || '').toString().toLowerCase().split(',')
        .map(function(e) { return e.trim(); });
      if (storedEmails.includes(emailLower)) {
        imageUrl = (memData[i][17] || '').toString().trim(); // Col R: imageURL
        break;
      }
    }
    if (!imageUrl) return null;

    return _driveUrlToBase64_(imageUrl, 'image/jpeg');
  } catch (err) {
    console.warn('getMyProfileImageBase64 failed: ' + err.message);
    return null;
  }
}

/**
 * Fetches one or more badge images from Google Drive and returns them as a map
 * of badgeId → base64 data-URI. Called by the celebration share flow so that
 * html2canvas captures same-origin data URIs instead of cross-origin Drive
 * thumbnail URLs (which the browser blocks with a CORS 302).
 *
 * Reads the BadgeDB sheet once, builds an id→imageURL lookup, then encodes only
 * the requested badges. Server-side DriveApp access bypasses browser CORS.
 *
 * @param   {string[]} badgeIds - Array of ARKA_BADGE_X identifiers to fetch.
 * @returns {Object}             Map of badgeId → "data:image/...;base64,..."
 *                               Badges that fail/lack an image are omitted.
 */
function getBadgeImagesBase64(badgeIds) {
  const resultMap = {};
  try {
    if (!Array.isArray(badgeIds) || badgeIds.length === 0) return resultMap;

    const requestedIdSet = {};
    badgeIds.forEach(function(id) { requestedIdSet[id] = true; });

    const ss          = SpreadsheetApp.openById(SPREADSHEET_ID);
    const badgeSheet  = ss.getSheetByName(BADGE_DB_SHEET);
    const badgeData   = badgeSheet.getDataRange().getValues();

    // Locate the image-URL column by header so we are resilient to layout shifts.
    const headerRow      = badgeData[0];
    let   imageUrlColIdx  = -1;
    let   badgeIdColIdx   = 0; // Col A is the badge ID by convention
    for (let c = 0; c < headerRow.length; c++) {
      const header = (headerRow[c] || '').toString().trim().toLowerCase();
      if (header === 'imageurl' || header === 'imgurl' || header === 'image url') {
        imageUrlColIdx = c;
      }
      if (header === 'badgeid' || header === 'badge id') {
        badgeIdColIdx = c;
      }
    }
    if (imageUrlColIdx === -1) {
      console.warn('getBadgeImagesBase64: image URL column not found in BadgeDB');
      return resultMap;
    }

    for (let i = 1; i < badgeData.length; i++) {
      const rowBadgeId = (badgeData[i][badgeIdColIdx] || '').toString().trim();
      if (!requestedIdSet[rowBadgeId]) continue;

      const imageUrl = (badgeData[i][imageUrlColIdx] || '').toString().trim();
      if (!imageUrl) continue;

      const fileIdMatch = imageUrl.match(/[?&]id=([^&]+)/);
      if (!fileIdMatch) continue;

      try {
        const blob   = DriveApp.getFileById(fileIdMatch[1]).getBlob();
        const mime   = blob.getContentType() || 'image/png';
        const base64 = Utilities.base64Encode(blob.getBytes());
        resultMap[rowBadgeId] = 'data:' + mime + ';base64,' + base64;
      } catch (innerErr) {
        console.warn('getBadgeImagesBase64: failed for ' + rowBadgeId + ': ' + innerErr.message);
      }
    }
  } catch (err) {
    console.warn('getBadgeImagesBase64 failed: ' + err.message);
  }
  return resultMap;
}

/**
 * 3. Register a new member
 * Takes data from the registration form and creates a new row in MemberDB.
 * Wraps the entire ID-generation → duplicate-check → appendRow sequence inside
 * LockService so concurrent registrations cannot collide on the same member ID
 * or the same display name.
 *
 * @param {Object} formData - Contains the user's email and desired display name.
 * @returns {Object} { status: 'success', id: string } | { status: 'error', message: string }
 */
function registerNewMember(formData) {

  // ── Pre-lock validation — reject bad input before touching the DB ─────────
  const rawDisplayName = (formData.displayName || '').trim();
  if (!rawDisplayName)              return { status: 'error', message: 'Display Name cannot be empty.' };
  if (rawDisplayName.length < 2)    return { status: 'error', message: 'Display Name must be at least 2 characters.' };
  if (rawDisplayName.length > 30)   return { status: 'error', message: 'Display Name cannot exceed 30 characters.' };
  if (rawDisplayName.includes('<') || rawDisplayName.includes('>')) {
    return { status: 'error', message: 'Display Name contains invalid characters.' };
  }

  // ── Acquire script lock before any sheet read ─────────────────────────────
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return { status: 'error', message: 'System is currently busy. Please try again.' };
  }

  try {
    const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(MEMBERS_SHEET);
    const data  = sheet.getDataRange().getValues();

    // ── Duplicate display-name check (authoritative snapshot inside the lock) ──
    const desiredNameLower = rawDisplayName.toLowerCase();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][3]).toLowerCase() === desiredNameLower) {
        return { status: 'error', message: 'That Display Name is already taken. Please choose another one.' };
      }
    }

    // ── Generate a unique member ID (ARKA_MEMBER_X) ───────────────────────────
    let newIdNum = 1;
    if (data.length > 1) {
      const lastNum = parseInt(data[data.length - 1][0].toString().split('_')[2]);
      if (!isNaN(lastNum)) newIdNum = lastNum + 1;
    }
    const newMemberId = 'ARKA_MEMBER_' + newIdNum;

    const joinDate     = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd-MMM-yyyy');
    const lastAccessed = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd-MM-yyyy HH:mm:ss Z');

    // Full MemberDB row, columns A–T (20 cells). Col S (CoachInsights) seeded
    // blank for MasterEngine; Col T (ApprovalStatus) starts Pending — the member
    // cannot enter the app until an admin approves them.
    const newMemberRow = [
      newMemberId,             // A — MemberID
      formData.email,          // B — Email
      '',                      // C — FullName
      rawDisplayName,          // D — DisplayName
      joinDate,                // E — JoinDate
      '',                      // F — Country
      '',                      // G — ShortBio
      '',                      // H — LangSpoken
      '',                      // I — LinkedIn
      '',                      // J — Goodreads
      '',                      // K — FavGenre
      '',                      // L — ReadingGoal
      lastAccessed,            // M — LastAccessed
      'None',                  // N — Badges
      1,                       // O — TotalClubPoints (seed: 1 for joining)
      0,                       // P — TotalPages
      0,                       // Q — TotalBooks
      '',                      // R — ImageURL
      '',                      // S — CoachInsights
      APPROVAL_STATUS.PENDING  // T — ApprovalStatus
    ];

    sheet.appendRow(newMemberRow);

    // ── Log the join activity (skipLock=true — we already hold the lock) ──────
    try {
      logActivityBatch(
        newMemberId,
        [{ typeId: 'ARKA_ACTTYP_PROFILENEW', val: 1, desc: newMemberId }],
        1, '', {}, ss, true
      );
    } catch (activityLogError) {
      console.error('registerNewMember: activity log failed (non-fatal):', activityLogError);
    }

    // NOTE: admin notification email is intentionally NOT sent here. Email is
    // delegated to a separate BackEndEngine project so the member-facing app
    // never requires the "send email as you" OAuth scope.
    return { status: 'success', id: newMemberId, displayName: rawDisplayName, pendingApproval: true };

  } finally {
    lock.releaseLock();
  }
}

/**
 * 4. Update existing member profile
 * Saves changes made on the "Edit Profile" screen, handling text fields and image uploads.
 * @param {Object} formData - All updated profile fields, including base64 image data.
 * @returns {Object} Success status, new activity log, and updated image URL.
 */
function updateMemberProfile(formData) {
  // ── Lock: prevents two simultaneous saves both passing the display-name
  // uniqueness check and writing conflicting data (read-check-write must be atomic).
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return { status: 'error', message: 'System is currently busy. Please try again.' };
  }
  try {

  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(MEMBERS_SHEET);
  const data  = sheet.getDataRange().getValues();
  const sessionEmail = Session.getActiveUser().getEmail().toLowerCase();

  let currentUserRowIndex = -1;
  let currentMemberId = "";

  // Step 1: Security check - find the user's exact row using their active Google session
  for (let i = 1; i < data.length; i++) {
    let storedEmails = data[i][1].toString().toLowerCase().split(',');
    if (storedEmails.map(e => e.trim()).includes(sessionEmail)) {
      currentUserRowIndex = i;
      currentMemberId = data[i][0]; // Col A: Member ID
      break;
    }
  }

  if (currentUserRowIndex === -1) {
    return { status: "error", message: "User not found. Your session may have expired." };
  }

  // Extract the new alternate email if the user provided one
  let newEmails = (formData.updatedEmails || "").toLowerCase().split(',').map(e => e.trim());
  let altEmail = newEmails.length > 1 ? newEmails[1] : null;

  // Step 2: Check if the new display name or alternate email is already taken by someone else
  const desiredName = (formData.displayName || "").toLowerCase().trim();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === currentMemberId) continue; // Skip the user's own record
    
    // Check Display Name
    let existingName = String(data[i][3]).toLowerCase().trim();
    if (existingName === desiredName) {
      return { status: "error", message: "That Display Name is already taken by another member." };
    }

    // Check Alternate Email
    if (altEmail) {
      let existingEmails = data[i][1].toString().toLowerCase().split(',').map(e => e.trim());
      if (existingEmails.includes(altEmail)) {
        return { status: "error", message: "That alternate email is already linked to another member's account." };
      }
    }
  }

  // Step 3: Handle Profile Image Upload to Google Drive
  let finalImageUrl = data[currentUserRowIndex][17] || ""; // Keep existing if no new one provided

  if (formData.newProfilePic) {
    const folder = DriveApp.getFolderById(PROFILE_PICS_FOLDER_ID);
    const fileName = currentMemberId + "_profilepic.jpg";
    
    // Delete the old picture to save Drive space
    const existingFiles = folder.getFilesByName(fileName);
    while (existingFiles.hasNext()) {
      existingFiles.next().setTrashed(true);
    }
    
    // Decode the base64 string from the frontend and save as an image file
    const imgData = formData.newProfilePic.split(',')[1];
    const blob = Utilities.newBlob(Utilities.base64Decode(imgData), 'image/jpeg', fileName);
    const newFile = folder.createFile(blob);
    
    // Generate Direct Link for the app to use and save to Column 18
    finalImageUrl = "https://drive.google.com/thumbnail?id=" + newFile.getId() + "&sz=w300";
    sheet.getRange(currentUserRowIndex + 1, 18).setValue(finalImageUrl);
  }

  // Step 4: Batch update all text columns at once for speed
  let row = currentUserRowIndex + 1;      //+1 to account for header
  // Update columns (Remember: Sheets are 1-indexed)
  const updatedValues = [[
    formData.updatedEmails,        // Col B
    formData.fullName || "",       // Col C
    formData.displayName,          // Col D
    data[currentUserRowIndex][4],  // Col E (JoinDate - Keep existing!)
    formData.country || "",        // Col F
    formData.shortBio || "",       // Col G
    formData.langSpoken || "",     // Col H
    formData.linkedin || "",       // Col I
    formData.goodreads || "",      // Col J
    formData.favGenre || "",       // Col K
    formData.readingGoal || "",    // Col L
  ]];
  
  // Single hit to the database instead of 10!
  sheet.getRange(row, 2, 1, 11).setValues(updatedValues);

  // Build a human-readable list of which fields the member actually changed.
  // Compared against the row data read at the start of this function (before the write).
  // col indices: B=1 emails, C=2 fullName, D=3 displayName, F=5 country,
  //              G=6 shortBio, H=7 langSpoken, I=8 linkedin, J=9 goodreads,
  //              K=10 favGenre, L=11 readingGoal
  const profileFieldMap = [
    { label: 'email',        incoming: formData.updatedEmails,       colIdx: 1  },
    { label: 'full name',    incoming: formData.fullName || '',       colIdx: 2  },
    { label: 'display name', incoming: formData.displayName,         colIdx: 3  },
    { label: 'country',      incoming: formData.country || '',       colIdx: 5  },
    { label: 'bio',          incoming: formData.shortBio || '',      colIdx: 6  },
    { label: 'languages',    incoming: formData.langSpoken || '',    colIdx: 7  },
    { label: 'LinkedIn',     incoming: formData.linkedin || '',      colIdx: 8  },
    { label: 'Goodreads',    incoming: formData.goodreads || '',     colIdx: 9  },
    { label: 'genres',       incoming: formData.favGenre || '',      colIdx: 10 },
    { label: 'reading goal', incoming: formData.readingGoal || '',   colIdx: 11 }
  ];
  const changedFieldLabels = profileFieldMap
    .filter(function(f) {
      return (f.incoming || '').toString().trim() !== (data[currentUserRowIndex][f.colIdx] || '').toString().trim();
    })
    .map(function(f) { return f.label; });
  // Always note a profile picture change if a new one was uploaded.
  if (formData.newProfilePic) changedFieldLabels.push('profile photo');
  const profileUpdateDesc = changedFieldLabels.length > 0
    ? 'Fields changed: ' + changedFieldLabels.join(', ')
    : 'Fields changed: none';

  // ── Activity log: only fire when at least one field actually changed.
  // A no-op save (member opens Edit Profile and clicks Save without editing anything)
  // must produce zero rows in ActivityLogDB and zero CP — the changedFieldLabels
  // array already knows whether anything changed, so we gate the entire batch call on it.
  let newActivity = null;
  if (changedFieldLabels.length > 0) {
    try {
      // currentMemberId is session-verified above via Session.getActiveUser() — safe to pass.
      // skipLock=true because the outer updateMemberProfile() already holds the script lock.
      const profileClientTzOffset = (formData.clientTzOffset || '').toString().trim();
      const batchResult = logActivityBatch(
        currentMemberId,
        [{ typeId: 'ARKA_ACTTYP_PROFILEUPDATE', val: 1, desc: profileUpdateDesc }],
        1,
        '',
        formData.activityPointsMap || {},
        ss,                    // reuse the already-open spreadsheet — avoids a redundant openById
        true,                  // skipLock — outer updateMemberProfile already holds the script lock
        profileClientTzOffset
      );
      newActivity = batchResult.length > 0 ? {
        activityID       : batchResult[0].activityID,
        activityTypeID   : batchResult[0].activityTypeID,
        activityCPAwarded: batchResult[0].activityCPAwarded,
        activityDate     : buildArkaTimestamp_(profileClientTzOffset),
        activityMemberID : currentMemberId,
        activityDesc     : profileUpdateDesc,
        activitySource   : 'ArkaClubApp ' + APP_VERSION
      } : null;
    } catch(e) {
      console.error('updateMemberProfile: activity log write failed (non-fatal):', e);
    }
  }
  
  return { status: "success", newActivity: newActivity, newImageURL: finalImageUrl };

  } finally {
    lock.releaseLock();
  }
}

/**
 * Writes one or more activity log rows to ActivityLogDB in a single batched write.
 * Used by all write operations that need to award CP — shelf updates, page logs,
 * challenge completions, registrations, and event RSVPs.
 *
 * Performance parameters (both optional, default to safe standalone behaviour):
 *   ss       — pass the already-open Spreadsheet object to skip a redundant
 *              SpreadsheetApp.openById() call. Pass null to open internally.
 *   skipLock — pass true when the calling function already holds a Script lock
 *              for this execution. Prevents a redundant nested tryLock() that
 *              burns timeout budget and causes contention with concurrent users.
 *
 * @param {string}   memberId        - ARKA_MEMBER_X receiving the CP.
 * @param {Array|string} activityData - Array of {typeId, val, desc} objects, or a single typeId string.
 * @param {number}   activityValue   - Val to use when activityData is a plain string.
 * @param {string}   description     - Desc to use when activityData is a plain string.
 * @param {Object}   clientPointsMap - globalActivityPointsMap from the frontend; enables fast multiplier lookup.
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet|null} ss - Open spreadsheet instance, or null to open internally.
 * @param {boolean}  skipLock        - true = skip LockService (caller already holds the lock).
 * @returns {Array<{activityID: string, activityTypeID: string, activityCPAwarded: number}>}
 */
function logActivityBatch(memberId, activityData, activityValue = 1, description = "", clientPointsMap = {}, ss = null, skipLock = false, clientTzOffset = null) {
  // ── Lock acquisition — skipped when the caller already holds the Script lock ──
  // Prevents a redundant nested tryLock that wastes timeout budget and competes
  // with concurrent users waiting on the same lock.
  let lock = null;
  if (!skipLock) {
    lock = LockService.getScriptLock();
    if (!lock.tryLock(5000)) {
      console.error("logActivityBatch: system busy, could not acquire lock.");
      return [];
    }
  }

  try {
    // ── Spreadsheet access — reuse the caller's open instance when provided ────
    const spreadsheet = ss || SpreadsheetApp.openById(SPREADSHEET_ID);

    // Normalize input to an array so we can always batch-process
    let pendingLogs = [];
    if (Array.isArray(activityData)) {
      pendingLogs = activityData; // Expected: [{typeId: "...", val: 1, desc: "..."}, ...]
    } else {
      pendingLogs = [{ typeId: activityData, val: activityValue, desc: description }];
    }

    // Get starting ID — reads one cell instead of the full table
    const logSheet     = spreadsheet.getSheetByName(ACTIVITYLOG_SHEET);
    let currentActNum  = getNextActivityNumber(logSheet) - 1; // Subtract 1; loop below increments it

    // Use the member's local timezone offset so ActivityLogDB timestamps reflect the
    // actual hour of day the member was active — critical for time-of-day analytics
    // and persona hour-bucket calculations. Falls back to UTC (+0000) for server-side
    // calls (MasterEngine, admin functions) that have no client context.
    const activityDate = buildArkaTimestamp_(clientTzOffset);
    const rowsToWrite  = [];
    const returnedLogs = [];

    // Build the data grid in memory — one pass, no per-row sheet reads
    pendingLogs.forEach(function(log) {
      currentActNum++;
      const activityId  = "ARKA_ACT_" + currentActNum;
      const multiplier  = getActivityMultiplier(log.typeId, clientPointsMap, spreadsheet);

      // Use directCp when explicitly provided (event attendance, enrolment bonuses, etc.).
      // Guard: val defaults to 1 only when truly absent — NOT when intentionally zero.
      const resolvedVal = (log.val !== undefined && log.val !== null) ? Number(log.val) : 1;
      const cpAwarded   = (log.directCp !== undefined && log.directCp !== null)
        ? Number(log.directCp)
        : resolvedVal * multiplier;

      rowsToWrite.push([
        activityId,
        log.typeId,
        activityDate,
        memberId,
        log.desc || "",
        "ArkaClubApp " + APP_VERSION,
        cpAwarded
      ]);

      returnedLogs.push({
        activityID       : activityId,
        activityTypeID   : log.typeId,
        activityCPAwarded: cpAwarded
      });
    });

    // Single atomic write — one setValues call regardless of how many rows
    if (rowsToWrite.length > 0) {
      const appendStartRow = logSheet.getLastRow() + 1;
      logSheet.getRange(appendStartRow, 1, rowsToWrite.length, rowsToWrite[0].length).setValues(rowsToWrite);
    }

    return returnedLogs;

  } catch (error) {
    console.error("logActivityBatch failed:", error);
    return [];
  } finally {
    // Only release the lock if this function acquired it
    if (lock) lock.releaseLock();
  }
}

/**
 * 6. Add a new book to the Arka Library
 * Validates uniqueness, generates a sequential BookID, uploads an optional cover
 * to Drive, appends the row to ArkaLibraryDB, and logs an activity for the librarian.
 *
 * The entire ID-generation → duplicate-check → appendRow block is wrapped inside
 * LockService to prevent two concurrent admin submissions from colliding on the
 * same ARKA_BOOK_X number.
 *
 * Cover handling:
 *   - If bookData.coverBase64 is provided → upload to Drive → store URL
 *   - If bookData.coverBase64 is absent   → store '' (no cover)
 *
 * @param {Object} bookData
 * @param {string} bookData.title
 * @param {string} bookData.author
 * @param {string} bookData.genre          - Comma-separated genres e.g. "Sci-Fi, Adventure"
 * @param {number} bookData.pages
 * @param {string} [bookData.coverBase64]  - Base64 JPEG from frontend canvas (optional)
 * @param {string} [bookData.isbn13]       - 13-digit string (optional)
 * @param {string} [bookData.publishedDate]- e.g. "2021" or "2021-05-04"
 * @param {string} [bookData.blurb]        - Short description (optional)
 * @param {Object} bookData.activityPointsMap
 * @returns {{ status: string, bookId?: string, newActivity?: Object, message?: string }}
 */
function addBookToLibrary(bookData) {
  const currentMemberId = getVerifiedMemberId();
  if (!currentMemberId) return { status: 'error', message: 'Unauthorized session.' };

  // ── Acquire script lock before reading the library sheet ─────────────────
  // Without this, two simultaneous submissions both read the same lastRow,
  // generate the same ARKA_BOOK_X, and append duplicate rows.
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return { status: 'error', message: 'System is currently busy. Please try again.' };
  }

  try {
    const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(LIBRARY_SHEET);
    const data  = sheet.getDataRange().getValues();

    // ── Duplicate title check (fuzzy normalised match) ────────────────────────
    const normalizedNewTitle = normalizeTitleInternal(bookData.title);
    for (let i = 1; i < data.length; i++) {
      if (normalizeTitleInternal(data[i][1]) === normalizedNewTitle) {
        return {
          status : 'error',
          message: 'Duplicate alert! "' + data[i][1] + '" is already in the library.'
        };
      }
    }

    // ── Generate sequential book ID ───────────────────────────────────────────
    let newBookNum = 1;
    if (data.length > 1) {
      const lastId  = data[data.length - 1][0].toString();
      const lastNum = parseInt(lastId.split('_')[2]);
      if (!isNaN(lastNum)) newBookNum = lastNum + 1;
    }
    const newBookId = 'ARKA_BOOK_' + newBookNum;

    // ── Resolve client timezone before building any timestamps ────────────────
    // bookAddedTzOffset is also reused below by the activity log block so that
    // all three timestamp writes (AddedDate, LastModifiedDate, ActivityLogDB) are
    // consistent and reflect the member's local clock, not the script server's.
    const bookAddedTzOffset = (bookData.clientTzOffset || '').toString().trim();
    const dateFormatted     = buildArkaDateOnly_(bookAddedTzOffset);     // Col G — 'dd-MMM-yyyy'
    const dateTimeFormatted = buildArkaTimestamp_(bookAddedTzOffset);    // Col H — full Z-format

    // ── Upload cover to Drive if provided ─────────────────────────────────────
    // Done inside the lock so the bookId used for the Drive filename matches
    // the ID we're about to write to the sheet.
    let coverImageURL = '';
    if (bookData.coverBase64) {
      coverImageURL = uploadBookCover_(newBookId, bookData.coverBase64);
    }

    // ── Append the book row — all 13 columns ──────────────────────────────────
    // Col: A           B                    C                    D
    //      BookID      Title                Author               Genre
    //      E           F                    G                    H
    //      Pages       AddedBy              AddedDate            LastModifiedDate
    //      I           J                    K                    L          M
    //      LastModBy   CoverURL             ISBN13               PubDate    Blurb
    sheet.appendRow([
      newBookId,
      bookData.title.trim(),
      bookData.author.trim(),
      (bookData.genre          || '').trim(),
      Number(bookData.pages)   || 0,
      currentMemberId,
      dateFormatted,
      dateTimeFormatted,
      currentMemberId,
      coverImageURL,
      (bookData.isbn13         || '').trim(),
      (bookData.publishedDate  || '').trim(),
      (bookData.blurb          || '').trim()
    ]);

    // ── Log the book-added activity ───────────────────────────────────────────
    // skipLock=true — this execution already holds the Script lock.
    let newActivity = null;
    try {
      const timestamp = buildArkaTimestamp_(bookAddedTzOffset);
      const rawLogged = logActivityBatch(
        currentMemberId,
        [{ typeId: 'ARKA_ACTTYP_BOOKADDED', val: 1, desc: newBookId }],
        1, '', bookData.activityPointsMap || {},
        ss,                // pass ss — avoids a second openById inside logActivityBatch
        true,              // skipLock — caller already holds the lock
        bookAddedTzOffset  // member's local timezone for ActivityLogDB timestamp
      );
      newActivity = rawLogged.length > 0 ? {
        activityID        : rawLogged[0].activityID,
        activityTypeID    : rawLogged[0].activityTypeID,
        activityCPAwarded : rawLogged[0].activityCPAwarded,
        activityDate      : timestamp,
        activityMemberID  : currentMemberId,
        activityDesc      : newBookId,
        activitySource    : 'ArkaClubApp ' + APP_VERSION
      } : null;
    } catch (activityLogError) {
      // Non-fatal: book row already written. MasterEngine recalculates nightly.
      console.error('addBookToLibrary: activity log failed (non-fatal):', activityLogError);
    }

    return { status: 'success', bookId: newBookId, newActivity: newActivity };

  } finally {
    lock.releaseLock();
  }
}


/**
 * PRIVATE HELPER: Uploads a book cover image to Drive and returns the thumbnail URL.
 * Reuses the same pattern as profile pic and badge image uploads.
 *
 * @param {string} bookId     - ARKA_BOOK_X (used as filename prefix)
 * @param {string} base64Data - Base64 data URI from frontend canvas (image/jpeg)
 * @returns {string} Google Drive thumbnail URL or '' on failure
 */
function uploadBookCover_(bookId, base64Data) {
  try {
    const folder   = DriveApp.getFolderById(BOOK_COVERS_FOLDER_ID);
    const fileName = bookId + '_thumb.jpg';
 
    // Delete any existing cover for this book — keeps folder clean
    const existingFiles = folder.getFilesByName(fileName);
    while (existingFiles.hasNext()) existingFiles.next().setTrashed(true);
 
    // Decode base64 (strip data URI prefix if present)
    const rawBase64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
    const blob      = Utilities.newBlob(
      Utilities.base64Decode(rawBase64),
      'image/jpeg',
      fileName
    );
    const newFile = folder.createFile(blob);
 
    // sz=w160 — double the 80px display size for retina screens, still tiny file
    return 'https://drive.google.com/thumbnail?id=' + newFile.getId() + '&sz=w160';
 
  } catch (e) {
    console.error('uploadBookCover_ failed for ' + bookId + ':', e);
    return '';
  }
}

/**
 * 9 Updates or creates a member's reading shelf record for a specific book.
 * Incorporates LockService for concurrency safety and uses a batch queue for activity logging 
 * to minimize database write operations and optimize speed.
 * * @param {Object} shelfData - The payload containing shelf update details from the frontend.
 * @param {string} shelfData.memberId - The ID of the member making the update.
 * @param {string} shelfData.bookId - The ID of the book being updated.
 * @param {string} shelfData.status - The new reading status (e.g., "To Read", "Reading", "Finished").
 * @param {number|string} shelfData.pagesRead - Current pages read by the member.
 * @param {number|string} shelfData.totalBookPages - Total pages in the book.
 * @param {string} shelfData.rating - Star rating given to the book (0-5).
 * @param {string} shelfData.review - Text review written by the member.
 * @param {string} shelfData.isEditMode - Flag indicating if this is a historical edit ("true" or "false").
 * @param {string} shelfData.editRecordId - The exact ShelfRecordID if in edit mode.
 * @param {string} shelfData.manualDateFinished - Manual finish date string from the UI.
 * @returns {Object} A success or error response object to be returned to the frontend.
 */
function updateMemberShelf(shelfData) {
  // Bind all writes to the verified Google OAuth session.
  // The client-supplied memberId must match — this prevents any member
  // from writing shelf records or awarding points on behalf of another.
  const sessionMemberId = getVerifiedMemberId();
  if (!sessionMemberId) return { status: 'error', message: 'Unauthorized session.' };
  if (sessionMemberId !== shelfData.memberId) {
    return { status: 'error', message: 'Permission denied.' };
  }
  const currentMemberId = sessionMemberId;
  const totalBookPages = Number(shelfData.totalBookPages) || 0;
  const isEditMode = shelfData.isEditMode === 'true';
  const targetRecordId = shelfData.editRecordId;
  // 1. ENGAGE THE DATABASE LOCK
  // Prevents concurrent writes from duplicating Shelf IDs or overlapping edits
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return { status: "error", message: "System is currently busy. Please try again." };
  }
  try{
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const shelfSheet = ss.getSheetByName(SHELF_SHEET);
    const now = new Date();
    // Short date (display-only, day-level) — script TZ is fine; timezone shift
    // at midnight is a one-day edge case with no analytical consequence.
    const dateFormatted = Utilities.formatDate(now, Session.getScriptTimeZone(), "dd-MMM-yyyy");
    // Full timestamp — uses the member's local TZ so that shelf lastModifiedOn and
    // any PageLog rows written via appendPageLogRow_ encode the correct local hour
    // for time-of-day analysis. Validated here; passed to logActivityBatch below.
    const clientTzOffset    = (shelfData.clientTzOffset || '').toString().trim();
    const dateTimeFormatted = buildArkaTimestamp_(clientTzOffset);
    
    // ── Future finish-date guard ──────────────────────────────────────────────
    // A finish date ahead of now is never valid. Null it out before any downstream
    // code reads manualDateFinished so both finalDateFinished and isCurrentYearFinish
    // fall through to their existing today-based defaults cleanly.
    if (shelfData.manualDateFinished) {
      const submittedFinishDate = new Date(shelfData.manualDateFinished + 'T12:00:00');
      if (submittedFinishDate > now) {
        shelfData.manualDateFinished = null;
      }
    }

    let finalStatus    = shelfData.status || "To Read";
    let finalPagesRead = Number(shelfData.pagesRead) || 0;
    // Use totalBookPages only as a fallback when the form submitted 0 (field was empty).
    if (finalStatus === "Finished" && finalPagesRead === 0 && totalBookPages > 0) {
      finalPagesRead = totalBookPages;
    }

    // Format the Manual Date from the HTML5 picker (YYYY-MM-DD -> dd-MMM-yyyy)
    let finalDateFinished = "";
    if (finalStatus === "Finished" || finalStatus === "Did Not Finish") {
      if (shelfData.manualDateFinished) {
        // Append T12:00:00 so timezone shifts don't accidentally push it to the day before
        let d = new Date(shelfData.manualDateFinished + "T12:00:00"); 
        finalDateFinished = Utilities.formatDate(d, Session.getScriptTimeZone(), "dd-MMM-yyyy");
      } else {
        finalDateFinished = dateFormatted;
      }
    }

    // ── Finish-year gate ──────────────────────────────────────────────────────
    // Pages are written to PageLogDB (and PAGEREAD activity logged) only when the
    // member finishes a book in the CURRENT YEAR. This prevents backdated offline
    // reads ("I finished this in 2019") from spiking the heatmap, streak, and
    // page-based challenges with large retrospective page counts.
    //
    // manualDateFinished is "YYYY-MM-DD" (from the HTML5 date picker) when the
    // member set an explicit date; absent means they are finishing today.
    // For non-Finished statuses manualDateFinished is never sent, so the ternary
    // falls to now.getFullYear() and isCurrentYearFinish is always true — the gate
    // never blocks pages for Reading, DNF, or To Read saves.
    //
    // Referenced by CASE 1 (safety net), CASE 2, and CASE 3.
    const finishYear          = shelfData.manualDateFinished
      ? parseInt(shelfData.manualDateFinished.split('-')[0], 10)
      : now.getFullYear();
    const isCurrentYearFinish = (finishYear === now.getFullYear());

    const shelfDataRange = shelfSheet.getDataRange().getValues();

    // ── Single PageLogDB read for the whole call ──────────────────────────────
    // PageLog is read once here (inside the lock) and reused by every branch that
    // appends a page-log row, plus passed to syncCountChallengeProgress at the end.
    // This replaces three separate getDataRange() scans — each a full-sheet read
    // amplified by GAS cold start — with one read and in-memory appends.
    // _pageLogSheetRef is captured so the append helper can write without a second
    // getSheetByName lookup. Both are null-safe: if the sheet is missing, the helper
    // and the sync fallback both degrade gracefully.
    const _pageLogSheetRef = ss.getSheetByName(PAGELOG_SHEET);
    const pageLogDataRange = _pageLogSheetRef ? _pageLogSheetRef.getDataRange().getValues() : [];

    /**
     * Appends one PageLogDB row to both the sheet and the in-memory pageLogDataRange
     * so the array stays authoritative for syncCountChallengeProgress without a re-read.
     * The next ARKA_PLOG_N is derived from the current tail of pageLogDataRange, so
     * sequential calls within one invocation produce sequential IDs.
     *
     * @param {number} pagesDelta - Signed page count (negative for corrections).
     * @param {string} sourceTag  - Col F source string.
     * @returns {string|null} The new ARKA_PLOG_N id, or null if the sheet is missing.
     */
    function appendPageLogRow_(pagesDelta, sourceTag) {
      if (!_pageLogSheetRef) return null;
      let nextLogNum = 1;
      if (pageLogDataRange.length > 1) {
        const lastLogId  = pageLogDataRange[pageLogDataRange.length - 1][0].toString();
        const lastLogNum = parseInt(lastLogId.split('_')[2], 10);
        if (!isNaN(lastLogNum)) nextLogNum = lastLogNum + 1;
      }
      const newLogId = 'ARKA_PLOG_' + nextLogNum;
      const newRow = [
        newLogId,           // Col A — LogID
        dateTimeFormatted,  // Col B — Timestamp
        currentMemberId,    // Col C — MemberID
        shelfData.bookId,   // Col D — BookID
        pagesDelta,         // Col E — PagesDelta
        sourceTag           // Col F — Source
      ];
      _pageLogSheetRef.appendRow(newRow);
      pageLogDataRange.push(newRow); // keep in-memory copy authoritative for the sync
      return newLogId;
    }
    let existingRowIndex       = -1;  // 1-based row of the most-recent active shelf record
    let deletedFallbackRowIndex = -1; // 1-based row of the most-recent Deleted record (recycle candidate)
    let shelfRecordId = "";
    let previousStatus = "";
    let previousRating = 0;
    let previousReview = "";
    
    // Locate the exact row we need to interact with
    if (isEditMode && targetRecordId) {
      // Exact Match Search (Editing History)
      for (let i = 1; i < shelfDataRange.length; i++) {
        if (shelfDataRange[i][0] === targetRecordId) {
          existingRowIndex = i + 1;
          shelfRecordId = shelfDataRange[i][0];
          previousStatus = shelfDataRange[i][3];
          previousRating = Number(shelfDataRange[i][4]) || 0;
          previousReview = shelfDataRange[i][5] || "";
          break;
        }
      }
    } else {
      // Standard Search — scans backwards for this member+book.
      // Deleted rows are explicitly skipped so existingRowIndex is only ever set
      // for an active record (To Read / Reading / Finished / DNF).
      // The most-recent Deleted row is tracked separately in deletedFallbackRowIndex
      // so CASE 3 can recycle it without relying on a fragile string comparison.
      for (let i = shelfDataRange.length - 1; i >= 1; i--) {
        if (shelfDataRange[i][1] !== currentMemberId || shelfDataRange[i][2] !== shelfData.bookId) continue;

        const rowStatus = (shelfDataRange[i][3] || '').toString().trim();

        if (rowStatus === 'Deleted') {
          // Track the most-recent Deleted row as a recycle candidate.
          // Keep scanning — there may be an active record earlier in the sheet.
          if (deletedFallbackRowIndex === -1) deletedFallbackRowIndex = i + 1;
          continue;
        }

        // Active record found — use it for normal CASE 1/2 logic
        existingRowIndex = i + 1;
        shelfRecordId    = shelfDataRange[i][0];
        previousStatus   = rowStatus;
        previousRating   = Number(shelfDataRange[i][4]) || 0;
        previousReview   = shelfDataRange[i][5] || '';
        break;
      }
    }

    // ── IDEMPOTENCY GUARD — reject duplicate "Finished" double-submits ────────
    // This was introduced becasue when a user in slow internet finished a book, it added two shelf records.
    // A slow first save can leave the UI unresponsive, prompting a second submit
    // (or a re-fired google.script.run). The lock serializes the two calls, but the
    // second sees the now-Finished record, skips CASE 2, falls to CASE 3, and appends
    // a bogus "re-read" row. Reject any non-edit Finished save when an active Finished
    // record already exists for this member+book and was last modified within the
    // dedupe window. Returns the existing record so the client treats it as success.
    const DUPLICATE_FINISH_WINDOW_MS = 120000; // 2-minute dedupe window
    if (!isEditMode &&
        finalStatus === 'Finished' &&
        existingRowIndex > -1 &&
        previousStatus === 'Finished') {
      const lastFinishRow   = shelfDataRange[existingRowIndex - 1];
      const lastModifiedDate = parseSheetTimestamp_(lastFinishRow[10]); // Col K — lastModifiedOn
      const lastModifiedMs   = lastModifiedDate ? lastModifiedDate.getTime() : NaN;
      if (!isNaN(lastModifiedMs) &&
          (now.getTime() - lastModifiedMs) < DUPLICATE_FINISH_WINDOW_MS) {
        return {
          status: 'success',
          message: 'Already marked Finished. 📚',
          duplicateSuppressed: true,
          newActivities: [],
          newPageLog: null,
          updatedShelf: {
            shelfId       : lastFinishRow[0],
            memberId      : lastFinishRow[1],
            bookId        : lastFinishRow[2],
            status        : lastFinishRow[3],
            rating        : Number(lastFinishRow[4]) || 0,
            review        : lastFinishRow[5] || '',
            dateAdded     : lastFinishRow[6],
            dateUpdated   : lastFinishRow[7],
            dateFinished  : lastFinishRow[8],
            pagesRead     : Number(lastFinishRow[9]) || 0,
            lastModifiedOn: lastFinishRow[10]
          }
        };
      }
    }

    let newActivitiesQueue = [];

    // Declared here (before CASE blocks) so CASE 2 and CASE 3 can assign them
    // inside try blocks without hitting a Temporal Dead Zone (TDZ) ReferenceError.
    // A TDZ violation is a silent catch — the appendRow never fires even though
    // the PAGEREAD activity above it already queued CP. Hoisting the declarations
    // ensures both the PageLogDB write and the return value newPageLog are populated.
    let newPageLogId = null; // ARKA_PLOG_N of the row written; null if no pages gained
    let pageLogDelta = 0;   // Signed page count written to PageLogDB

    /**
     * Helper to map shelf status to corresponding ActivityType ID.
     * @param {string} status - The new reading status.
     * @returns {string} The ActivityType ID.
     */
    function getStatusActivityType(status) {
      if (status === "To Read") return "ARKA_ACTTYP_BOOKTOREAD";
      if (status === "Reading") return "ARKA_ACTTYP_BOOKREADING";
      if (status === "Finished") return "ARKA_ACTTYP_BOOKREAD";
      if (status === "Did Not Finish") return "ARKA_ACTTYP_BOOKDNF";
      return "ARKA_ACTTYP_SHELFUPDATE";
    }

    // --- CASE 1: SURGICAL EDIT OF A PAST RECORD ---
    if (isEditMode && existingRowIndex > -1) {
      let originalDateAdded = shelfDataRange[existingRowIndex - 1][6];
      let originalDateUpdated = shelfDataRange[existingRowIndex - 1][7];
      
      // Write updates directly without changing the original creation dates
      const updatedValues = [[
        finalStatus, shelfData.rating || 0, shelfData.review || "", 
        originalDateAdded, originalDateUpdated, finalDateFinished, finalPagesRead, dateTimeFormatted
      ]];
      shelfSheet.getRange(existingRowIndex, 4, 1, 8).setValues(updatedValues);
      
      // Log rating/review changes if they fixed them
      if (Number(shelfData.rating) > 0 && Number(shelfData.rating) !== previousRating) {
        newActivitiesQueue.push({ typeId: "ARKA_ACTTYP_BOOKRATING", val: 1, desc: shelfRecordId });
      } 
      // Award BOOKREVIEW only when a review is being ADDED for the first time via edit.
      // If previousReview is non-empty the member already earned this activity on the
      // original save — a typo correction or rewording must not create a duplicate log.
      if (shelfData.review && !previousReview) {
        newActivitiesQueue.push({ typeId: "ARKA_ACTTYP_BOOKREVIEW", val: 1, desc: shelfRecordId });
      }

      // ── Audit trail for any rating/review edit ───────────────────────────────
      // The two CP-bearing logs above only fire on a rating change or a FIRST-TIME
      // review, so a reworded existing review (same rating) would otherwise leave
      // no record. Emit a 0-CP, feed-hidden ARKA_ACTTYP_SHELFUPDATE noting exactly
      // which fields changed. The "<shelfId>," prefix matches the Rule 8 desc
      // matrix in MasterEngine; 0 CP means it is never reversed and never inflates.
      const editedRatingChanged = Number(shelfData.rating) !== previousRating;
      const editedReviewChanged = (shelfData.review || "") !== (previousReview || "");
      const editedFieldList = [];
      if (editedRatingChanged) editedFieldList.push("rating");
      if (editedReviewChanged) editedFieldList.push("review");
      if (editedFieldList.length > 0) {
        newActivitiesQueue.push({
          typeId: "ARKA_ACTTYP_SHELFUPDATE",
          val: 1,
          desc: shelfRecordId + ", edited " + editedFieldList.join(" & ")
        });
      }

      // ── Status-transition safety net ─────────────────────────────────────────
      // CASE 1 is designed for surgical edits of already-Finished records (rating,
      // review). The normal path for status transitions is CASE 2 (standard mode).
      // This block catches any caller that reaches CASE 1 with a changed status so
      // BOOKREAD / BOOKDNF / BOOKREADING are never silently dropped.
      // Mirrors CASE 2 / CASE 3 diminishing-returns RE_READ_CP_SCHEDULE for BOOKREAD.
      if (previousStatus !== finalStatus) {
        if (finalStatus === 'Finished') {
          // Count prior Finished records to determine re-read tier.
          // Exclude the record being edited (shelfRecordId) — its status is now
          // being written to Finished but it was not Finished before this call.
          const CASE1_RE_READ_SCHEDULE = [1, 0.75, 0.50, 0.25, 0.10, 0.05];
          let case1PriorFinishedCount = 0;
          for (let i = 1; i < shelfDataRange.length; i++) {
            if (
              shelfDataRange[i][1] === currentMemberId &&
              shelfDataRange[i][2] === shelfData.bookId &&
              shelfDataRange[i][3] === 'Finished'      &&
              shelfDataRange[i][0] !== shelfRecordId
            ) {
              case1PriorFinishedCount++;
            }
          }
          const case1BookReadVal = case1PriorFinishedCount < CASE1_RE_READ_SCHEDULE.length
            ? CASE1_RE_READ_SCHEDULE[case1PriorFinishedCount]
            : 0;
          if (case1BookReadVal > 0) {
            newActivitiesQueue.push({
              typeId: 'ARKA_ACTTYP_BOOKREAD',
              val:    case1BookReadVal,
              desc:   case1PriorFinishedCount > 0
                ? shelfRecordId + ' | Re-read #' + case1PriorFinishedCount
                    + ' (' + Math.round(case1BookReadVal * 100) + '% CP)'
                : shelfRecordId
            });
          }
        } else {
          // BOOKREADING, BOOKDNF, BOOKTOREAD — log the generic status activity.
          newActivitiesQueue.push({
            typeId: getStatusActivityType(finalStatus),
            val:    1,
            desc:   shelfRecordId
          });
        }
      }

      // ── Page-delta safety net ─────────────────────────────────────────────────
      // CASE 1 is the landing path for the SHELF_STALE_READING coach task (opens a
      // Reading shelf in edit mode, tiles locked). Pages can be updated; without this
      // block the shelf pagesRead column is correct but the delta is invisible to
      // heatmap, streak, and page-based challenges (no PageLogDB row written).
      // Note: downward corrections in edit mode are not handled here — no negative
      // PageLogDB entry or CP deduction is written. This is an accepted limitation;
      // downward corrections via the normal CASE 2 path are handled correctly.
      const case1PreviousPagesRead = Number(shelfDataRange[existingRowIndex - 1][9]) || 0;
      const case1PagesGained       = finalPagesRead - case1PreviousPagesRead;
      if (case1PagesGained > 0 && (finalStatus !== 'Finished' || isCurrentYearFinish)) {
        newActivitiesQueue.push({
          typeId: 'ARKA_ACTTYP_PAGEREAD',
          val:    case1PagesGained,
          desc:   '+' + case1PagesGained + ' pages added to ' + shelfRecordId
        });
        try {
          newPageLogId = appendPageLogRow_(case1PagesGained, 'ArkaClubApp ' + APP_VERSION);
          pageLogDelta = case1PagesGained;
        } catch (case1PageLogErr) {
          console.warn('updateMemberShelf CASE 1: PageLogDB write failed (non-fatal):', case1PageLogErr);
        }
      }
    }
    // --- CASE 2: NORMAL PROGRESSION UPDATE (To Read -> Reading -> Finished) ---
    else if (!isEditMode && existingRowIndex > -1 && (previousStatus === "To Read" || previousStatus === "Reading")) {
      let originalDateAdded = shelfDataRange[existingRowIndex - 1][6];
      
      const updatedValues = [[
        finalStatus, shelfData.rating || 0, shelfData.review || "", 
        originalDateAdded, dateFormatted, finalDateFinished, finalPagesRead, dateTimeFormatted
      ]];
      shelfSheet.getRange(existingRowIndex, 4, 1, 8).setValues(updatedValues);
      
      if (finalStatus !== previousStatus) {
        // For Finished, apply the same diminishing-returns re-read schedule as CASE 3.
        // A member who shelved a book as "To Read" previously and now marks it Finished
        // may be completing a re-read — full 300 CP must not be awarded unconditionally.
        if (finalStatus === 'Finished') {
          const RE_READ_CP_SCHEDULE = [1, 0.75, 0.50, 0.25, 0.10, 0.05];
          let priorFinishedCount = 0;
          for (let i = 1; i < shelfDataRange.length; i++) {
            if (
              shelfDataRange[i][1] === currentMemberId &&
              shelfDataRange[i][2] === shelfData.bookId &&
              shelfDataRange[i][3] === 'Finished' &&
              shelfDataRange[i][0] !== shelfRecordId  // exclude the record being updated
            ) {
              priorFinishedCount++;
            }
          }
          const bookReadVal = priorFinishedCount < RE_READ_CP_SCHEDULE.length
            ? RE_READ_CP_SCHEDULE[priorFinishedCount]
            : 0;

          if (bookReadVal > 0) {
            newActivitiesQueue.push({
              typeId: 'ARKA_ACTTYP_BOOKREAD',
              val:    bookReadVal,
              desc:   priorFinishedCount > 0
                ? `${shelfRecordId} | Re-read #${priorFinishedCount} (${Math.round(bookReadVal * 100)}% CP)`
                : shelfRecordId
            });
          }
          // 6th+ re-read: bookReadVal === 0, no BOOKREAD entry queued at all — same as CASE 3
        } else {
          newActivitiesQueue.push({ typeId: getStatusActivityType(finalStatus), val: 1, desc: shelfRecordId });
        }
      }
      
      const previousPagesRead = Number(shelfDataRange[existingRowIndex - 1][9]) || 0;
      const pagesGained       = finalPagesRead - previousPagesRead; // signed: negative = correction

      // val = pagesGained so cpAwarded = pagesGained × pointsPerPage multiplier.
      // Consistent with logReadingProgress which also uses actual delta as val.
      // Year check: for Finished saves, only log pages when the finish date is in the
      // current year. For all other status transitions (Reading, DNF, To Read),
      // isCurrentYearFinish is always true (manualDateFinished is not sent), so the
      // gate never suppresses pages for non-Finished saves.
      if (pagesGained > 0 && (finalStatus !== 'Finished' || isCurrentYearFinish)) {
        // ── PAGEREAD CP — always awarded when pages gained ────────────────
        // No status guard. Page CP (4/page) and status-change CP (BOOKREADING,
        // BOOKREAD etc.) reward different things — both are always correct.
        newActivitiesQueue.push({
          typeId: 'ARKA_ACTTYP_PAGEREAD',
          val:    pagesGained,
          desc:   `+${pagesGained} pages added to ${shelfRecordId}`
        });

        // ── PageLogDB write — always when pages gained ────────────────────
        // Decoupled from status. Heatmap, streak, and challenge sync read
        // exclusively from PageLogDB — a status-change save that also advances
        // pages must still write here or those pages are invisible to analytics.
        // newPageLogId and pageLogDelta are hoisted to function scope so the
        // return statement can include a newPageLog object for the frontend.
        try {
          // Appends to sheet + in-memory pageLogDataRange via the shared helper.
          // newPageLogId / pageLogDelta are hoisted to function scope for the return.
          newPageLogId = appendPageLogRow_(pagesGained, 'ArkaClubApp ' + APP_VERSION + ' [shelf-form]');
          pageLogDelta = pagesGained;
        } catch (pageLogWriteErr) {
          console.warn('updateMemberShelf CASE 2: PageLogDB write failed (non-fatal):', pageLogWriteErr);
        }
      }

      // ── Downward page correction ──────────────────────────────────────────
      // pagesGained < 0 means the user reduced their page position (a correction).
      // Write a negative PageLogDB entry so PAGE_COUNT challenge sync and lifetime
      // stats remain accurate. Queue a negative-val PAGEREAD activity so the CP
      // that was already awarded for those pages is reversed.
      if (pagesGained < 0) {
        try {
          // Negative-delta correction row — appended via the shared helper so the
          // in-memory pageLogDataRange reflects it for the challenge sync below.
          appendPageLogRow_(pagesGained, 'ArkaClubApp ' + APP_VERSION + ' [shelf-form][correction]');
        } catch (correctionLogErr) {
          console.warn('updateMemberShelf CASE 2: correction PageLogDB write failed (non-fatal):', correctionLogErr);
        }

        // Negative val × positive multiplier = negative CP (deduction).
        // Batched with the rest of newActivitiesQueue so it fires in one logActivityBatch call.
        newActivitiesQueue.push({
          typeId: 'ARKA_ACTTYP_PAGEREAD',
          val:    pagesGained,   // negative number, e.g. -50
          desc:   pagesGained + ' pages corrected on ' + shelfRecordId
        });
      }

      if (Number(shelfData.rating) > 0 && Number(shelfData.rating) !== previousRating) {
        newActivitiesQueue.push({ typeId: "ARKA_ACTTYP_BOOKRATING", val: 1, desc: shelfRecordId });
      } 
      if (shelfData.review && shelfData.review !== previousReview) {
        newActivitiesQueue.push({ typeId: "ARKA_ACTTYP_BOOKREVIEW", val: 1, desc: shelfRecordId });
      }
    } 
    // --- CASE 3: BRAND NEW RECORD (Add to Shelf / Read Again) ---
    else {
      // ── Recycle path: re-adding a previously deleted shelf record ──────────
      // The Standard Search found a Deleted row for this member+book, so reuse
      // its ShelfID and overwrite the row in place rather than appending a new one.
      // Stale fields (rating, review, dateFinished, pagesRead) are cleared first
      // so the recycled record starts completely fresh.
      if (deletedFallbackRowIndex > -1) {
        // RECYCLE PATH: overwrite the Deleted row in place — no new row appended.
        // shelfRecordId is set here from the Deleted row (Standard Search skipped it
        // for active logic but tracked its index in deletedFallbackRowIndex).
        shelfRecordId = shelfDataRange[deletedFallbackRowIndex - 1][0];
        shelfSheet.getRange(deletedFallbackRowIndex, 4, 1, 8).setValues([[
          finalStatus,
          shelfData.rating  || 0,
          shelfData.review  || '',
          dateFormatted,       // Col G — dateAdded reset to today
          dateFormatted,       // Col H — dateUpdated
          finalDateFinished,   // Col I — dateFinished
          finalPagesRead,      // Col J — pagesRead
          dateTimeFormatted    // Col K — lastModifiedOn
        ]]);
        // Treat as brand-new for downstream activity logging — no prior rating/review
        previousRating = 0;
        previousReview = '';

      } else {
        // ── Normal new-row path: genuinely new book or deliberate re-read ────
        let newShelfNum = 1;
        if (shelfDataRange.length > 1) {
          let lastIdString = shelfDataRange[shelfDataRange.length - 1][0];
          let lastNum = parseInt(lastIdString.split('_')[2]);
          if (!isNaN(lastNum)) newShelfNum = lastNum + 1;
        }
        shelfRecordId = 'ARKA_SHELF_' + newShelfNum;

        const newRow = [
          shelfRecordId, currentMemberId, shelfData.bookId, finalStatus,
          shelfData.rating || 0, shelfData.review || '', dateFormatted,
          dateFormatted, finalDateFinished, finalPagesRead, dateTimeFormatted
        ];

        shelfSheet.appendRow(newRow);
      }
      
      // S-4: Diminishing returns on re-reads.
      // Count how many prior Finished records exist for this member+book to
      // determine which tier of the re-read schedule applies.
      // Note: the Deleted row (if recycled above) had status 'Deleted' — it does
      // not count toward priorFinishedCount since the loop guards on 'Finished'.
      // Schedule: 1st re-read=75%, 2nd=50%, 3rd=25%, 4th=10%, 5th=5%, 6th+=0%
      // A val of 0 means no BOOKREAD activity is queued at all (saves a log row).
      const RE_READ_CP_SCHEDULE = [1, 0.75, 0.50, 0.25, 0.10, 0.05];  // index = read count (0-based: first read, first re-read, ...)
      let priorFinishedCount = 0;
      for (let i = 1; i < shelfDataRange.length; i++) {
        if (
          shelfDataRange[i][1] === currentMemberId &&
          shelfDataRange[i][2] === shelfData.bookId &&
          shelfDataRange[i][3] === 'Finished'
        ) {
          priorFinishedCount++;
        }
      }
      const bookReadVal = priorFinishedCount < RE_READ_CP_SCHEDULE.length
        ? RE_READ_CP_SCHEDULE[priorFinishedCount]
        : 0;  // 6th re-read and beyond: 0 CP

      if (finalStatus === 'Finished' && bookReadVal === 0) {
        // 6th+ re-read: skip the BOOKREAD log entirely — no points, no noise
      } else {
        newActivitiesQueue.push({
          typeId: getStatusActivityType(finalStatus),
          val:    finalStatus === 'Finished' ? bookReadVal : 1,
          desc:   finalStatus === 'Finished' && priorFinishedCount > 0
                    ? `${shelfRecordId} | Re-read #${priorFinishedCount} (${Math.round(bookReadVal * 100)}% CP)`
                    : shelfRecordId
        });
      }
      
      // When a brand-new shelf record carries pages, treat them identically to a
      // progress log update: queue PAGEREAD CP and write a PageLogDB entry.
      // Previous pages are always 0 for a new record, so finalPagesRead is the delta.
      //
      // For Finished records the year gate applies: log pages only when the finish
      // date is in the current year (isCurrentYearFinish). This lets a member who
      // just finished a book have those pages counted, while blocking retrospective
      // Finished adds ("I read this in 2019") from polluting the heatmap and streak.
      // For all other statuses (Reading, DNF, To Read) finalStatus !== 'Finished'
      // short-circuits to true and pages are always logged — behaviour unchanged.
      if (finalPagesRead > 0 && (finalStatus !== 'Finished' || isCurrentYearFinish)) {
        newActivitiesQueue.push({
          typeId: 'ARKA_ACTTYP_PAGEREAD',
          val   : finalPagesRead,   // delta = all pages, since previous = 0
          desc  : `+${finalPagesRead} pages added to ${shelfRecordId}`
        });

        // Write the PageLogDB entry so heatmap, streak, and challenge sync
        // can see these pages without requiring a MasterEngine run or page reload.
        try {
          // Brand-new record carrying pages — appended via the shared helper.
          // newPageLogId / pageLogDelta hoisted to function scope for the return value.
          newPageLogId = appendPageLogRow_(finalPagesRead, 'ArkaClubApp ' + APP_VERSION);
          pageLogDelta = finalPagesRead;
        } catch (case3PageLogErr) {
          console.warn('updateMemberShelf CASE 3: PageLogDB write failed (non-fatal):', case3PageLogErr);
        }
      }

      if (Number(shelfData.rating) > 0) {
        newActivitiesQueue.push({ typeId: "ARKA_ACTTYP_BOOKRATING", val: 1, desc: shelfRecordId });
      }
      if (shelfData.review) {
        newActivitiesQueue.push({ typeId: "ARKA_ACTTYP_BOOKREVIEW", val: 1, desc: shelfRecordId });
      }
    }

    // EXECUTE BATCH LOGGING
    // Process all accumulated activities in a single database operation
    let finalActivitiesLogged = [];
    if (newActivitiesQueue.length > 0) {
      // ss and skipLock=true passed — avoids a second openById and a redundant
      // nested LockService attempt inside the already-locked execution.
      const rawLogged = logActivityBatch(currentMemberId, newActivitiesQueue, 1, "", shelfData.activityPointsMap || {}, ss, true, clientTzOffset);

      // Sync BOOK_COUNT and PAGE_COUNT challenge progress after any shelf write.
      // Non-fatal — shelf update already succeeded at this point.
      //
      // shelfDataRange (read at the top of this function) predates the row we just
      // wrote, so syncCountChallengeProgress would undercount the just-Finished book
      // if handed the stale array. Patch the in-memory copy to mirror the persisted
      // row first, then pass it in so the sync skips its own redundant MemberShelfDB
      // getDataRange() scan — eliminating one full-sheet read inside the lock.
      //
      // The sync only reads shelf cols [1] memberId, [2] bookId, [3] status,
      // [7] dateUpdated, [8] dateFinished — so the patched row is built from raw
      // in-scope values (dateFormatted / finalDateFinished); the precise return-
      // formatted dates computed later in the function are not needed here.
      // pageLogDataRange is read once at the top of this function and kept in sync
      // by appendPageLogRow_ on every page-log write, so it already reflects any row
      // appended this call. Passing it lets the sync skip its own PageLogDB scan too.
      try {
        const syncShelfRows = shelfDataRange; // same reference — patched in place below
        const patchedShelfRow = [
          shelfRecordId,            // Col A — ShelfID
          currentMemberId,          // Col B — MemberID
          shelfData.bookId,         // Col C — BookID
          finalStatus,              // Col D — Status
          Number(shelfData.rating) || 0, // Col E — Rating
          shelfData.review || '',   // Col F — Review
          dateFormatted,            // Col G — DateAdded (not read by sync; placeholder)
          dateFormatted,            // Col H — DateUpdated
          finalDateFinished,        // Col I — DateFinished
          finalPagesRead,           // Col J — PagesRead
          dateTimeFormatted         // Col K — LastModifiedOn
        ];
        if (existingRowIndex > -1) {
          // CASE 1/2 (and edit): overwrite the existing in-memory row.
          syncShelfRows[existingRowIndex - 1] = patchedShelfRow;
        } else if (deletedFallbackRowIndex > -1) {
          // CASE 3 recycle: overwrite the recycled Deleted row in memory.
          syncShelfRows[deletedFallbackRowIndex - 1] = patchedShelfRow;
        } else {
          // CASE 3 new row: append so the sync sees the brand-new record.
          syncShelfRows.push(patchedShelfRow);
        }
        syncCountChallengeProgress(currentMemberId, ss, syncShelfRows, pageLogDataRange);
      } catch (challengeSyncErr) {
        console.warn('updateMemberShelf: challenge sync failed (non-fatal):', challengeSyncErr);
      }

      // logActivityBatch only returns {activityID, activityTypeID, activityCPAwarded}.
      // buildFeedAggregator needs activityMemberID, activityDate, activityDesc, and
      // activitySource — without them it crashes on .startsWith() for every pushed row.
      // Build the full shape here before the return value reaches the frontend.
      finalActivitiesLogged = rawLogged.map(function(logged, idx) {
        const queueEntry = newActivitiesQueue[idx] || {};
        return {
          activityID:        logged.activityID,
          activityTypeID:    logged.activityTypeID,
          activityCPAwarded: logged.activityCPAwarded,
          activityDate:      dateTimeFormatted,
          activityMemberID:  currentMemberId,
          activityDesc:      queueEntry.desc || '',
          activitySource:    'ArkaClubApp ' + APP_VERSION
        };
      });
    }

    // ── 10 Pages A Day bridge — TEMPORARY, remove when app is retired ────────────
    // Only fires for dual members when syncTo10Pages flag is set and pages genuinely
    // increased. Edit mode is intentionally excluded — editing history must not
    // corrupt the live weekly tracker.
    if (shelfData.syncTo10Pages && !isEditMode && (finalStatus !== 'Finished' || isCurrentYearFinish)) {
      try {
        // CASE 2 (progress update on existing record): recalculate delta from shelf data.
        // CASE 3 (brand new record): previous pages = 0, so delta = finalPagesRead.
        const syncPreviousPages = existingRowIndex > -1
          ? (Number(shelfDataRange[existingRowIndex - 1][9]) || 0)
          : 0;
        const syncPageDelta = finalPagesRead - syncPreviousPages;
        if (syncPageDelta > 0) {
          bridgeTenPagesUpdate_(currentMemberId, syncPageDelta, ''); // no note from shelf modal
        }
      } catch (shelfSyncErr) {
        console.warn('updateMemberShelf: 10 Pages A Day sync failed (non-fatal):', shelfSyncErr);
      }
    }

    // COMPILE UI RESPONSE DATA
    // Find the exact dates to return to the frontend so the UI updates instantly
    let returnDateAdded = dateFormatted, returnDateUpdated = dateFormatted;
    if (existingRowIndex > -1) {
      // Recycled Deleted rows have dateAdded reset to today in the write above.
      // Reading shelfDataRange here would return the stale pre-deletion date —
      // use dateFormatted directly so the frontend gets the correct fresh value.
      let rawAdded = (previousStatus === 'Deleted')
        ? dateFormatted
        : shelfDataRange[existingRowIndex - 1][6];
      let rawUpdated = isEditMode ? shelfDataRange[existingRowIndex - 1][7] : dateFormatted;
      
      // CRITICAL FIX: Convert Date objects to strings so GAS doesn't crash sending them to the frontend
      returnDateAdded = rawAdded instanceof Date ? Utilities.formatDate(rawAdded, Session.getScriptTimeZone(), "dd-MMM-yyyy") : String(rawAdded);
      returnDateUpdated = rawUpdated instanceof Date ? Utilities.formatDate(rawUpdated, Session.getScriptTimeZone(), "dd-MMM-yyyy") : String(rawUpdated);
    }

    // Build the synthetic PageLog record for the frontend so it can update
    // globalPageLogDB immediately — mirrors the same pattern in logReadingProgress().
    const newPageLog = newPageLogId ? {
      logId     : newPageLogId,
      timestamp : dateTimeFormatted,
      memberId  : currentMemberId,
      bookId    : shelfData.bookId,
      pagesDelta: pageLogDelta,
      logSource : 'ArkaClubApp ' + APP_VERSION
    } : null;

    return { 
      status: 'success', 
      message: isEditMode ? 'Past read updated! ✏️' : 'Shelf updated! 📚', 
      newActivities: finalActivitiesLogged,
      newPageLog   : newPageLog,
      updatedShelf: { 
          shelfId: shelfRecordId, memberId: currentMemberId, bookId: shelfData.bookId, 
          status: finalStatus, 
          rating: Number(shelfData.rating) || 0,
          review: shelfData.review || '', 
          pagesRead: finalPagesRead, dateAdded: returnDateAdded, dateUpdated: returnDateUpdated,
          dateFinished: finalDateFinished, lastModifiedOn: dateTimeFormatted
        }
    };
  } catch (error) {
    console.error("Error in updateMemberShelf:", error);
    return { status: "error", message: "An error occurred while updating the shelf." };
  } finally {
    // ALWAYS release the lock so the system doesn't freeze for other users
    lock.releaseLock();
  }
}

/**
 * markCoachTaskComplete()
 *
 * Silently removes a completed coach task from a member's CoachInsights JSON
 * (MemberDB Col S). Called fire-and-forget from the frontend the moment a task
 * is resolved (rating saved, review written, shelf updated, pages logged), so
 * the task does not reappear on the next Me-tab render before the nightly sync.
 *
 * This is Option A from the design: the task is REMOVED from the tasks[] array
 * rather than flagged complete. The condition that generated it is already
 * resolved by the member's action, so MasterEngine will not regenerate it.
 *
 * Designed to be non-blocking and forgiving:
 *   - No meaningful return value (frontend does not wait on it).
 *   - If the member row, Col S, or task is not found, it's a silent no-op.
 *   - LockService guards against concurrent MemberDB writes.
 *
 * @param {string} memberId - ARKA_MEM_X of the acting member.
 * @param {string} taskId   - The taskId to remove (e.g. 'RATE_BOOK_ARKA_SHELF_42').
 * @returns {{status: string}} Minimal status — frontend ignores it.
 */
function markCoachTaskComplete(memberId, taskId) {
  if (!memberId || !taskId) return { status: 'noop' };

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    // Could not get the lock — skip silently. Nightly sync is the backstop.
    console.warn('markCoachTaskComplete: lock unavailable, skipping for ' + memberId);
    return { status: 'busy' };
  }

  try {
    var ss       = SpreadsheetApp.openById(SPREADSHEET_ID);
    var memSheet = ss.getSheetByName(MEMBERS_SHEET);
    if (!memSheet) return { status: 'noop' };

    var memData = memSheet.getDataRange().getValues();

    // Find the member row (Col A = memberId).
    for (var i = 1; i < memData.length; i++) {
      if ((memData[i][0] || '').toString() !== memberId) continue;

      // Col S = index 18.
      var coachRaw = (memData[i][18] || '').toString();
      if (!coachRaw) return { status: 'noop' };

      var payload;
      try {
        payload = JSON.parse(coachRaw);
      } catch (parseErr) {
        return { status: 'noop' }; // malformed — leave it for the nightly sync
      }

      if (!payload.tasks || !payload.tasks.length) return { status: 'noop' };

      var beforeCount = payload.tasks.length;
      payload.tasks = payload.tasks.filter(function(t) { return t.taskId !== taskId; });

      // Only write if something actually changed.
      if (payload.tasks.length !== beforeCount) {
        memSheet.getRange(i + 1, 19).setValue(JSON.stringify(payload)); // Col S = column 19
        console.log('markCoachTaskComplete: removed ' + taskId + ' for ' + memberId);
        return { status: 'success' };
      }
      return { status: 'noop' }; // task already gone
    }

    return { status: 'noop' }; // member not found
  } catch (err) {
    console.error('markCoachTaskComplete failed (non-fatal):', err);
    return { status: 'error' };
  } finally {
    lock.releaseLock();
  }
}

/**
 * saveOnboardingProgress()
 *
 * Merges an onboarding progress update into the `onboarding` sub-object of
 * MemberDB Col S (CoachInsights JSON). Called fire-and-forget from the
 * frontend when a member confirms a self-reported onboarding task or
 * dismisses the onboarding card.
 *
 * Only the `onboarding` key is written — all other Col S fields (tasks,
 * insights, aiAdvice, statSnapshot, etc.) are preserved exactly as stored.
 *
 * If Col S is blank (member has not yet had a MasterEngine nightly run),
 * the function creates a minimal JSON shell {} and writes the onboarding
 * sub-object into it. MasterEngine will populate the remaining insight fields
 * on its next nightly run without disturbing the onboarding key.
 *
 * Design constraints (mirrors markCoachTaskComplete):
 *   - Non-blocking: frontend ignores the return value.
 *   - Forgiving: any parse or write error is a silent no-op; the nightly sync
 *     is the backstop if a write is lost.
 *   - LockService prevents concurrent MemberDB writes to Col S.
 *   - selfReported is a full replacement, not a merge — the frontend owns the
 *     complete authoritative list and sends it on every update.
 *
 * @param {string} memberId         - ARKA_MEMBER_X of the acting member.
 * @param {Object} onboardingUpdate - Partial update object. Supported keys:
 *   @param {string[]} [onboardingUpdate.selfReported] - Complete replacement
 *       array of self-reported task IDs the member has confirmed (e.g.
 *       ['ONBOARD_T03', 'ONBOARD_T04']). Replaces stored array entirely.
 *   @param {boolean}  [onboardingUpdate.dismissed]    - When true, permanently
 *       hides the onboarding card. When false, relaunches it from Help.
 * @returns {{status: string}} 'success' | 'noop' | 'busy' | 'error'
 */
function saveOnboardingProgress(memberId, onboardingUpdate) {
  if (!memberId || !onboardingUpdate) return { status: 'noop' };

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    console.warn('saveOnboardingProgress: lock unavailable, skipping for ' + memberId);
    return { status: 'busy' };
  }

  try {
    var ss       = SpreadsheetApp.openById(SPREADSHEET_ID);
    var memSheet = ss.getSheetByName(MEMBERS_SHEET);
    if (!memSheet) return { status: 'noop' };

    var memData = memSheet.getDataRange().getValues();

    for (var i = 1; i < memData.length; i++) {
      if ((memData[i][0] || '').toString() !== memberId) continue;

      // Col S = index 18. May be blank for new members before first MasterEngine run.
      var coachRaw = (memData[i][18] || '').toString().trim();
      var payload  = {};

      if (coachRaw) {
        try {
          payload = JSON.parse(coachRaw);
        } catch (parseErr) {
          // Malformed cell. Start from an empty shell — MasterEngine will
          // rebuild the insight fields on next nightly run. The onboarding
          // sub-object is the only thing we need to write here.
          payload = {};
        }
      }

      // Merge into the existing onboarding sub-object, falling back to defaults
      // if this is the first write (no prior onboarding key in Col S).
      var existingOnboarding = (payload.onboarding && typeof payload.onboarding === 'object')
                               ? payload.onboarding
                               : {};

      payload.onboarding = {
        dismissed   : (typeof onboardingUpdate.dismissed === 'boolean')
                        ? onboardingUpdate.dismissed
                        : (existingOnboarding.dismissed || false),
        selfReported: Array.isArray(onboardingUpdate.selfReported)
                        ? onboardingUpdate.selfReported
                        : (existingOnboarding.selfReported || []),
        lastUpdated : Utilities.formatDate(
                        new Date(),
                        Session.getScriptTimeZone(),
                        'dd-MM-yyyy HH:mm:ss Z'
                      )
      };

      memSheet.getRange(i + 1, 19).setValue(JSON.stringify(payload)); // Col S = column 19
      console.log(
        'saveOnboardingProgress: saved for ' + memberId
        + ' | dismissed=' + payload.onboarding.dismissed
        + ' | selfReported=' + payload.onboarding.selfReported.length + ' task(s)'
      );
      return { status: 'success' };
    }

    return { status: 'noop' }; // member not found
  } catch (err) {
    console.error('saveOnboardingProgress failed (non-fatal):', err);
    return { status: 'error' };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Soft-deletes a member's shelf record by setting its Status to "Deleted" and
 * logs an ARKA_ACTTYP_SHELFDELETE activity entry as an audit trail.
 *
 * The frontend filters Deleted records out of Wave3 so they are invisible to all
 * UI consumers. The logged activity entry is hidden from the home feed (via
 * HIDDEN_TYPES in buildFeedAggregator) but visible to MasterEngine, which uses
 * it on its next run to generate CP reversal corrections for all direct shelf
 * activities (BOOKTOREAD, BOOKREADING, BOOKREAD, BOOKDNF, BOOKRATING,
 * BOOKREVIEW, SHELFUPDATE, PAGEREAD) that reference this shelfId.
 *
 * @param {{shelfId: string, memberId: string, activityPointsMap: Object}} payload
 * @returns {{status: string, message?: string}}
 */
function deleteShelfRecord(payload) {
  try {
    const sessionMemberId = getVerifiedMemberId();
    if (!sessionMemberId) {
      return { status: 'error', message: 'Session expired. Please refresh.' };
    }
    if (sessionMemberId !== payload.memberId) {
      return { status: 'error', message: 'Unauthorised: you can only delete your own shelf records.' };
    }
    if (!payload.shelfId) {
      return { status: 'error', message: 'Missing shelfId.' };
    }

    const ss         = SpreadsheetApp.openById(SPREADSHEET_ID);
    const shelfSheet = ss.getSheetByName(SHELF_SHEET);
    if (!shelfSheet) return { status: 'error', message: 'Shelf sheet not found.' };

    const shelfData       = shelfSheet.getDataRange().getValues();
    let   targetRowNumber = -1;  // 1-based sheet row number

    for (let i = 1; i < shelfData.length; i++) {
      const rowShelfId  = (shelfData[i][0] || '').toString();
      const rowMemberId = (shelfData[i][1] || '').toString();
      if (rowShelfId === payload.shelfId && rowMemberId === sessionMemberId) {
        targetRowNumber = i + 1;  // convert 0-based array index to 1-based sheet row
        break;
      }
    }

    if (targetRowNumber === -1) {
      return { status: 'error', message: 'Shelf record not found or does not belong to you.' };
    }

    // Write "Deleted" to Col D (Status) — 1-based column 4
    // Set Status=Deleted and simultaneously clear Rating and Review (Col E, F).
    // This prevents stale rating/review values from surfacing in book detail,
    // rating sorts, and leaderboards after the shelf record is soft-deleted.
    shelfSheet.getRange(targetRowNumber, 4, 1, 3).setValues([['Deleted', 0, '']]);

    // ── Log the delete as an audit trail activity ─────────────────────────────
    // CP is 0 (set in ActivityTypeDB for ARKA_ACTTYP_SHELFDELETE).
    // MasterEngine uses this entry to identify which shelf's CP to reverse.
    // activityDesc = shelfId so MasterEngine can look up all related activities.
    logActivityBatch(
      sessionMemberId,
      [{ typeId: 'ARKA_ACTTYP_SHELFDELETE', val: 1, desc: payload.shelfId }],
      1,
      '',
      payload.activityPointsMap || {}
    );

    return { status: 'success' };

  } catch (e) {
    console.error('deleteShelfRecord failed:', e);
    return { status: 'error', message: e.toString() };
  }
}

/**
 * Logs a reading progress update for a book currently on the 'Reading' shelf.
 *
 * What this function does:
 *   1. Validates the request — shelf record must exist, belong to the requesting
 *      member, and have status 'Reading'. Rejects stale frontend state cleanly.
 *   2. Updates pagesRead (Col J), dateUpdated (Col H), and lastModifiedOn (Col K)
 *      on the existing shelf row. Status, rating, review, and dateAdded are
 *      never touched — this is a progress-only write.
 *   3. When pages increased (pageDelta > 0): writes a PageLogDB entry and awards
 *      CP via logActivityBatch.
 *   4. When pages decreased (correction): writes a negative PageLogDB entry and
 *      deducts the previously-awarded CP.
 *   5. Writes a reading note to ReadingNotesDB when noteText is non-empty.
 *   6. Optionally syncs to the 10 Pages A Day external sheet (TEMPORARY bridge).
 *
 * Challenge progress sync (PAGE_COUNT) is intentionally NOT called here.
 * The frontend fires backgroundSyncChallengeProgress() → syncAndFetchEnrollment()
 * asynchronously after every successful save, which handles challenge updates
 * in a separate GAS execution without blocking the user-facing response.
 *
 * Performance notes:
 *   - logActivityBatch receives ss + skipLock=true — avoids a second openById
 *     and a redundant nested LockService attempt.
 *   - PageLog ID is generated via getNextPageLogNumber_() — reads one cell
 *     instead of the full PageLogDB table.
 *
 * @param {Object} progressData
 * @param {string} progressData.memberId            - ARKA_MEMBER_X of the member logging progress.
 * @param {string} progressData.bookId              - ARKA_BOOK_X being read.
 * @param {string} progressData.shelfId             - ARKA_SHELF_X of the active Reading record.
 * @param {number} progressData.newPagesRead        - New cumulative pages read position.
 * @param {string} progressData.activityDescription - Pre-built description string for the activity log.
 * @param {Object} progressData.activityPointsMap   - globalActivityPointsMap from frontend.
 * @param {string} [progressData.noteText]          - Optional reading note text.
 * @param {boolean}[progressData.syncTo10Pages]     - TEMPORARY: sync to 10 Pages A Day sheet.
 * @returns {{ status: string, updatedPagesRead?: number, newActivity?: Object, newPageLog?: Object }}
 */
function logReadingProgress(progressData) {
  // Bind to the verified Google OAuth session before any DB interaction.
  // The ownership check (shelfRow[1] === currentMemberId) is only meaningful
  // when currentMemberId is session-derived, not client-supplied.
  const sessionMemberId = getVerifiedMemberId();
  if (!sessionMemberId) return { status: 'error', message: 'Unauthorized session.' };
  if (sessionMemberId !== progressData.memberId) {
    return { status: 'error', message: 'Permission denied.' };
  }
  const currentMemberId = sessionMemberId;

  // ── Lock: prevents concurrent writes overlapping on the same shelf row ──────
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return { status: 'error', message: 'System is currently busy. Please try again.' };
  }

  try {
    const ss         = SpreadsheetApp.openById(SPREADSHEET_ID);
    const shelfSheet = ss.getSheetByName(SHELF_SHEET);

    const shelfData             = shelfSheet.getDataRange().getValues();
    const now = new Date();

    // Use the client's local timezone offset for the PageLog timestamp so that
    // ISO-week binning on the frontend reflects the day the member experienced.
    // clientTzOffset arrives as e.g. "+0530" or "-0500".
    // Shelf-level dates (dateUpdated, lastModifiedOn) keep the script timezone —
    // they are display-only strings and never used for week binning.
    const clientTzOffset = (function() {
      const raw = (progressData.clientTzOffset || '').trim();
      // Validate format — must be ±HHmm with 4 digits, e.g. "+0530" or "-0500"
      return /^[+-]\d{4}$/.test(raw) ? raw : DEFAULT_TZ_OFFSET_FALLBACK;
    })();

    const dateUpdatedFormatted  = Utilities.formatDate(now, Session.getScriptTimeZone(), 'dd-MMM-yyyy');
    const lastModifiedFormatted = Utilities.formatDate(now, Session.getScriptTimeZone(), 'dd-MM-yyyy HH:mm:ss Z');

    // PageLog-specific timestamp: buildArkaTimestamp_ applies the offset to the UTC
    // instant — correctly encoding the member's local hour for time-of-day analytics.
    const pageLogTimestampFormatted = buildArkaTimestamp_(clientTzOffset);

    // ── Find the exact shelf row ─────────────────────────────────────────────
    let targetRowIndex = -1; // 1-based sheet row

    for (let i = 1; i < shelfData.length; i++) {
      if (shelfData[i][0] === progressData.shelfId) {
        targetRowIndex = i + 1; // Convert 0-based array index to 1-based sheet row
        break;
      }
    }

    if (targetRowIndex === -1) {
      return { status: 'error', message: 'Shelf record not found.' };
    }

    const shelfRow = shelfData[targetRowIndex - 1]; // Back to 0-based for reading

    // ── Ownership check — member can only update their own shelf row ─────────
    if (shelfRow[1] !== currentMemberId) {
      return { status: 'error', message: 'Permission denied.' };
    }

    // ── Status guard — progress logging only valid for active Reading records ─
    // Prevents stale frontend state from writing to a record already moved to
    // Finished or DNF in another session.
    if (shelfRow[3] !== 'Reading') {
      return {
        status : 'error',
        message: 'This book is no longer on your Reading shelf. Please refresh.'
      };
    }

    const newPagesRead = Number(progressData.newPagesRead) || 0;

    // ── Atomic shelf write: dateUpdated (Col H) + dateFinished (Col I, preserved)
    //    + pagesRead (Col J) + lastModifiedOn (Col K) ──────────────────────────
    // Col I (dateFinished) is untouched — read the existing value and write it back
    // unchanged so setValues doesn't clear it with an empty string.
    const existingDateFinished = shelfData[targetRowIndex - 1][8] instanceof Date
      ? Utilities.formatDate(shelfData[targetRowIndex - 1][8], Session.getScriptTimeZone(), 'dd-MMM-yyyy')
      : String(shelfData[targetRowIndex - 1][8] || '');

    shelfSheet.getRange(targetRowIndex, 8, 1, 4).setValues([[
      dateUpdatedFormatted,  // Col H — dateUpdated
      existingDateFinished,  // Col I — dateFinished (preserved, not changed)
      newPagesRead,          // Col J — pagesRead
      lastModifiedFormatted  // Col K — lastModifiedOn
    ]]);

    // pageDelta: positive = forward progress, negative = downward correction.
    // pageDelta (clamped) is used for CP award — corrections earn 0 CP.
    const previousPagesRead = Number(shelfRow[9]) || 0;
    const rawPageDelta      = newPagesRead - previousPagesRead; // signed
    const pageDelta         = Math.max(0, rawPageDelta);       // positive forward progress only

    // pageDelta > 0  → normal forward progress: write PageLogDB row + award CP.
    // rawPageDelta < 0 → downward correction: write negative PageLogDB row + deduct CP.
    // rawPageDelta = 0 → no-op for logging; shelf position update already written above.
    let newActivity        = null;
    let newPlogId          = null;
    const isCorrectionDown = rawPageDelta < 0;

    if (isCorrectionDown) {
      // ── Write corrective (negative) PageLogDB entry ─────────────────────────
      // Ensures syncCountChallengeProgress sums to the correct net page count.
      // getNextPageLogNumber_ reads one cell instead of scanning the full table.
      try {
        const pageLogSheet = ss.getSheetByName(PAGELOG_SHEET);
        if (pageLogSheet) {
          newPlogId = 'ARKA_PLOG_' + getNextPageLogNumber_(pageLogSheet);
          pageLogSheet.appendRow([
            newPlogId,                     // Col A — LogID
            pageLogTimestampFormatted,     // Col B — Timestamp (client's local tz offset)
            currentMemberId,               // Col C — MemberID
            progressData.bookId,           // Col D — BookID
            rawPageDelta,                                                    // Col E — PagesDelta (negative correction)
            'ArkaClubApp ' + APP_VERSION + ' [reading-log][correction]'  // Col F — Source
          ]);
        }
      } catch (correctionLogErr) {
        console.warn('logReadingProgress: correction PageLogDB write failed (non-fatal):', correctionLogErr);
        newPlogId = null;
      }

      // ── Deduct CP for pages being un-read ────────────────────────────────────
      // rawPageDelta is negative, so directCp will be negative (deduction).
      // ss and skipLock=true passed — no second openById or nested lock needed.
      try {
        const deductMultiplier = getActivityMultiplier('ARKA_ACTTYP_PAGEREAD', progressData.activityPointsMap || {}, ss);
        const cpToDeduct       = rawPageDelta * deductMultiplier; // negative × positive = negative
        if (cpToDeduct !== 0) {
          logActivityBatch(
            currentMemberId,
            [{ typeId: 'ARKA_ACTTYP_PAGEREAD', val: rawPageDelta, desc: rawPageDelta + ' pages corrected on ' + progressData.bookId, directCp: cpToDeduct }],
            1, '', progressData.activityPointsMap || {},
            ss,             // reuse open spreadsheet — avoids second openById
            true,           // skipLock — this execution already holds the Script lock
            clientTzOffset  // member's local timezone for ActivityLogDB timestamp
          );
        }
      } catch (deductErr) {
        console.warn('logReadingProgress: CP deduction for correction failed (non-fatal):', deductErr);
      }
      // Note: syncCountChallengeProgress is intentionally omitted here.
      // The frontend fires backgroundSyncChallengeProgress() asynchronously
      // after receiving the success response, which handles challenge sync
      // via syncAndFetchEnrollment() without blocking the user.
    }

    if (pageDelta > 0) {
      // ── Write to PageLogDB ────────────────────────────────────────────────────
      // getNextPageLogNumber_ reads one cell — avoids a full getDataRange() scan.
      try {
        const pageLogSheet = ss.getSheetByName(PAGELOG_SHEET);
        if (pageLogSheet) {
          newPlogId = 'ARKA_PLOG_' + getNextPageLogNumber_(pageLogSheet);
          pageLogSheet.appendRow([
            newPlogId,                     // Col A — LogID
            pageLogTimestampFormatted,     // Col B — Timestamp (client's local tz offset)
            currentMemberId,               // Col C — MemberID
            progressData.bookId,           // Col D — BookID
            pageDelta,                                             // Col E — PagesDelta
            'ArkaClubApp ' + APP_VERSION + ' [reading-log]'  // Col F — Source
          ]);
        }
      } catch (pageLogWriteErr) {
        // Non-fatal — activity log and note writer are unaffected
        console.warn('logReadingProgress: PageLogDB write failed (non-fatal):', pageLogWriteErr);
        newPlogId = null;
      }

      // ── Log activity (CP award) ───────────────────────────────────────────────
      // ss and skipLock=true passed — no second openById or nested lock needed.
      const loggedActivities = logActivityBatch(
        currentMemberId,
        [{ typeId: 'ARKA_ACTTYP_PAGEREAD', val: pageDelta, desc: progressData.activityDescription }],
        1, '', progressData.activityPointsMap || {},
        ss,             // reuse open spreadsheet — avoids second openById
        true,           // skipLock — this execution already holds the Script lock
        clientTzOffset  // member's local timezone for ActivityLogDB timestamp
      );

      // Build a complete activity object matching the shape renderHomeFeed expects.
      // logActivityBatch only returns {activityID, activityTypeID, activityCPAwarded} —
      // the missing fields would crash the feed renderer if the partial object were pushed.
      const loggedActivity = loggedActivities.length > 0 ? loggedActivities[0] : null;
      newActivity = loggedActivity ? {
        activityID       : loggedActivity.activityID,
        activityTypeID   : loggedActivity.activityTypeID,
        activityCPAwarded: loggedActivity.activityCPAwarded,
        activityDate     : lastModifiedFormatted,
        activityMemberID : currentMemberId,
        activityDesc     : progressData.activityDescription,
        activitySource   : 'ArkaClubApp ' + APP_VERSION
      } : null;
      // Note: syncCountChallengeProgress intentionally omitted — see correction block comment.
    }

    // ── Write reading note to ReadingNotesDB (non-fatal) ─────────────────────
    // Runs regardless of pageDelta — a member can add a note without advancing pages.
    const noteText = (progressData.noteText || '').trim();
    if (noteText) {
      try {
        appendReadingNote_(ss, currentMemberId, newPlogId || '', noteText, 'ProgressLog');
      } catch (noteWriteErr) {
        console.warn('logReadingProgress: ReadingNotesDB write failed (non-fatal):', noteWriteErr);
      }
    }

    // ── 10 Pages A Day bridge (non-fatal) — TEMPORARY ────────────────────────
    if (progressData.syncTo10Pages && pageDelta > 0) {
      try {
        bridgeTenPagesUpdate_(currentMemberId, pageDelta, noteText);
      } catch (bridgeErr) {
        console.warn('logReadingProgress: 10 Pages bridge failed (non-fatal):', bridgeErr);
      }
    }

    // ── Build synthetic PageLog record for the frontend ───────────────────────
    // The frontend pushes this into globalPageLogDB so renderHeatmap() updates
    // the pages-this-year stat pill immediately without requiring a reload.
    // newPlogId is null when no log was written (zero-change update).
    const newPageLog = newPlogId ? {
      logId     : newPlogId,
      timestamp : pageLogTimestampFormatted, // client's local tz offset — matches PageLogDB
      memberId  : currentMemberId,
      bookId    : progressData.bookId,
      pagesDelta: rawPageDelta,          // signed: negative for downward corrections
      logSource : 'ArkaClubApp ' + APP_VERSION
    } : null;

    return {
      status          : 'success',
      updatedPagesRead: newPagesRead,
      newActivity     : newActivity,
      newPageLog      : newPageLog
    };

  } catch (error) {
    console.error('logReadingProgress error:', error);
    return { status: 'error', message: 'An error occurred. Please try again.' };
  } finally {
    lock.releaseLock();
  }
}


/**
 * Updates an existing book record in the Arka Library.
 *
 * Cover handling:
 *   - coverBase64 provided → upload new image, overwrite existing
 *   - coverBase64 absent   → keep existing coverImageURL unchanged
 *
 * @param {Object} bookData
 * @param {string} bookData.bookId         - ARKA_BOOK_X to update
 * @param {string} bookData.title
 * @param {string} bookData.author
 * @param {string} bookData.genre
 * @param {number} bookData.pages
 * @param {string} [bookData.coverBase64]  - New cover image (optional — omit to keep existing)
 * @param {string} [bookData.isbn13]
 * @param {string} [bookData.publishedDate]
 * @param {string} [bookData.blurb]
 * @param {Object} bookData.activityPointsMap
 * @returns {{ status: string, newActivity?: Object, coverImageURL?: string, message?: string }}
 */
function updateLibraryBook(bookData) {
  const currentMemberId = getVerifiedMemberId();
  if (!currentMemberId) return { status: 'error', message: 'Unauthorized session.' };
 
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(LIBRARY_SHEET);
  const data  = sheet.getDataRange().getValues();
 
  // ── Find the row to update ─────────────────────────────────────────────────
  let rowIndex = -1;
  for (let i = 1; i < data.length; i++) {
    if (data[i][0].toString() === bookData.bookId.toString()) {
      rowIndex = i;
      break;
    }
  }
  if (rowIndex === -1) return { status: 'error', message: 'Book not found.' };
 
  const bookUpdateTzOffset = (bookData.clientTzOffset || '').toString().trim();
  const dateTimeFormatted  = buildArkaTimestamp_(bookUpdateTzOffset);
 
  // ── Cover: upload new if provided, otherwise keep existing ─────────────────
  let coverImageURL = data[rowIndex][9] || ''; // Col J — existing URL
  if (bookData.coverBase64) {
    const uploaded = uploadBookCover_(bookData.bookId, bookData.coverBase64);
    if (uploaded) coverImageURL = uploaded; // Only overwrite on successful upload
  }
 
  // ── Batch update columns B–M + H (LastModifiedDate) + I (LastModifiedBy) ───
  // Sheet row = rowIndex + 1 (1-based), starting at Col B (col 2)
  // Columns B C D E | H I J K L M
  // We update B–E (core) and H–M (metadata + new fields) in two ranges
 
  // Cols B–E: Title, Author, Genre, Pages
  sheet.getRange(rowIndex + 1, 2, 1, 4).setValues([[
    bookData.title.trim(),
    bookData.author.trim(),
    (bookData.genre || '').trim(),
    Number(bookData.pages) || 0
  ]]);
 
  // Cols H–M: LastModifiedDate, LastModifiedBy, CoverURL, ISBN13, PubDate, Blurb
  sheet.getRange(rowIndex + 1, 8, 1, 6).setValues([[
    dateTimeFormatted,
    currentMemberId,
    coverImageURL,
    (bookData.isbn13        || '').trim(),
    (bookData.publishedDate || '').trim(),
    (bookData.blurb         || '').trim()
  ]]);
 
  // ── Log activity ───────────────────────────────────────────────────────────
  let newActivity = null;
  try {
    const rawLogged  = logActivityBatch(
      currentMemberId,
      [{ typeId: 'ARKA_ACTTYP_BOOKUPDATE', val: 1, desc: bookData.bookId }],
      1, '', bookData.activityPointsMap || {},
      null,               // ss — open internally
      false,              // skipLock — no caller-held lock
      bookUpdateTzOffset  // member's local timezone for ActivityLogDB timestamp
    );
    newActivity = rawLogged.length > 0 ? {
      activityID       : rawLogged[0].activityID,
      activityTypeID   : rawLogged[0].activityTypeID,
      activityCPAwarded: rawLogged[0].activityCPAwarded,
      activityDate     : buildArkaTimestamp_(bookUpdateTzOffset),
      activityMemberID : currentMemberId,
      activityDesc     : bookData.bookId,
      activitySource   : 'ArkaClubApp ' + APP_VERSION
    } : null;
  } catch(e) {}

  // ── Sync PAGE_COUNT challenge progress (non-fatal) ─────────────────────────
  // Updating a book's page count can affect PAGE_COUNT challenge totals if the
  // member's page logs reference this book. Re-sync to keep challenge progress current.
  try {
    syncCountChallengeProgress(currentMemberId, ss);
  } catch (challengeSyncErr) {
    console.warn('updateLibraryBook: challenge sync failed (non-fatal):', challengeSyncErr);
  }

  return {
    status       : 'success',
    coverImageURL,
    newActivity
  };
}

// ── Shared helper: build sheetMap from one getSheets() call ──────────────────
// Private to this file — not exported. Each wave function calls this once.
function buildSheetMap_(ss) {
  const map = new Map();
  ss.getSheets().forEach(function(sheet) {
    map.set(sheet.getName(), sheet);
  });
  return map;
}

/**
 * WAVE 1 — Core member data, level rules, and recent club-wide page logs.
 *
 * Returns:
 *   MemberDB          → Me tab profile, points, level bar, membersMap
 *   ClubPointLevelDB  → level thresholds for the level progress bar
 *   PageLogDB (slice) → last 90 days, all members — feeds Weekly Pulse card,
 *                       report weekly/monthly pages, and mood-match strategies.
 *                       Personal features (heatmap, streak, badge progress) use
 *                       globalMyPageLogDB loaded in Wave 3 instead.
 *
 * @returns {{ status, membersDB, memberLevelsDB, pageLogDB }}
 */
function getWave1Data() {
  // Approval gate — only approved members may read club data.
  if (!getVerifiedMemberId()) return { status: 'unauthorized' };
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    // ── 1. Level Rules (cached — changes rarely) ─────────────────────────────
    const levelList = getCachedDb(CACHE_KEYS.clublevels)
      || (function() {
        const fresh = buildClubLevelList_(ss);
        setCachedDb(CACHE_KEYS.clublevels, fresh);
        return fresh;
      })();

    // ── 2. Members — always fresh (points change on every action) ────────────
    const membersList = buildMembersList_(ss);

    // ── 3. PageLogDB — last 90 days, all members ─────────────────────────────
    // 90 days covers: current week + prior week (Pulse card), current month +
    // prior month (monthly report MoM comparison), and challenge progress from
    // any challenge started in the last 3 months.
    // Personal all-time data (heatmap, streak, Over the Years, badge progress)
    // is served by getWave3Data() via getMyPageLogs() instead.
    const pageLogSheet   = ss.getSheetByName(PAGELOG_SHEET);
    const recentPageLogs = [];

    if (pageLogSheet) {
      const cutoffDate    = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 90);
      const cutoffMs      = cutoffDate.getTime();

      const totalRows     = pageLogSheet.getLastRow();
      if (totalRows > 1) {
        // Read from the bottom up — PageLogDB is append-only so recent rows
        // are always at the end. Read at most PAGE_LOG_GLOBAL_SCAN_LIMIT rows
        // to avoid a full-table scan even if the 90-day window is narrow.
        const startRow  = Math.max(2, totalRows - PAGE_LOG_GLOBAL_SCAN_LIMIT + 1);
        const rowCount  = totalRows - startRow + 1;
        const data      = pageLogSheet.getRange(startRow, 1, rowCount, 6).getValues();

        for (let i = 0; i < data.length; i++) {
          if (!data[i][0]) continue;

          // Parse timestamp — PageLogDB uses Arka Z-format: dd-MM-yyyy HH:mm:ss Z
          const rawTs   = data[i][1];
          const tsStr   = parseSheetTimestamp_(rawTs).getTime();

          // Only include rows within the 90-day window
          if (tsStr < cutoffMs) continue;

          recentPageLogs.push({
            logId      : data[i][0].toString(),
            timestamp  : rawTs instanceof Date
              ? Utilities.formatDate(rawTs, Session.getScriptTimeZone(), 'dd-MM-yyyy HH:mm:ss Z')
              : rawTs.toString(),
            memberId   : data[i][2].toString(),
            bookId     : data[i][3].toString(),
            pagesDelta : Number(data[i][4]) || 0,
            logSource  : data[i][5].toString()
          });
        }
      }
    }

    return {
      status        : 'success',
      membersDB     : membersList,
      memberLevelsDB: levelList,
      pageLogDB     : recentPageLogs
    };

  } catch (e) {
    console.error('getWave1Data failed:', e);
    return { status: 'error', message: e.toString() };
  }
}
 
 
/**
 * WAVE 2 — Activity feed + challenges.
 *
 * Returns:
 *   ActivityLogDB        → home feed bubbles
 *   ChallengeDB          → My Challenges card
 *   ChallengeEnrollmentDB→ My Challenges card progress
 *   AnnouncementDB       → home feed banner
 *
 * Target: fires immediately after Wave 1 handler completes.
 */
function getWave2Data() {
  if (!getVerifiedMemberId()) return { status: 'unauthorized' };
  try {

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    // ── 1. Activity Log — always fresh, never cached ──────────────────────────
    // Changes on every user action so caching would serve stale feed data
    const actLogSheet     = ss.getSheetByName(ACTIVITYLOG_SHEET);
    const activityLogList = [];
    if (actLogSheet) {
      const totalRows = actLogSheet.getLastRow();
      const startRow  = Math.max(2, totalRows - ACTIVITY_LOG_FETCH_LIMIT + 1);  // ACTIVITY_LOG_FETCH_LIMIT defined at file top
      const rowCount  = totalRows - startRow + 1;
      if (rowCount > 0) {
        const data = actLogSheet.getRange(startRow, 1, rowCount, 7).getValues();
        for (let i = 0; i < data.length; i++) {
          if (!data[i][0]) continue;
          activityLogList.push({
            activityID        : data[i][0],
            activityTypeID    : data[i][1],
            activityDate      : data[i][2],
            activityMemberID  : data[i][3],
            activityDesc      : data[i][4] || '',
            activitySource    : data[i][5] || '',
            activityCPAwarded : Number(data[i][6]) || 0
          });
        }
      }
    }
 
    // ── 2. Challenges ────────────────────────────────────────────────────────
    const challengesDBList = getCachedDb(CACHE_KEYS.challenges)
      || (function() {
        const fresh = fetchChallenges(ss);
        setCachedDb(CACHE_KEYS.challenges, fresh);
        return fresh;
      })();
 
    // ── 3. Enrollments ───────────────────────────────────────────────────────
    const challengeEnrollmentsDBList = getCachedDb(CACHE_KEYS.enrollments)
      || (function() {
        const fresh = fetchChallengeEnrollments(ss);
        setCachedDb(CACHE_KEYS.enrollments, fresh);
        return fresh;
      })();
 
    // ── 4. Announcements ─────────────────────────────────────────────────────
    const announcementsDBList = getCachedDb(CACHE_KEYS.announcements)
      || (function() {
        const fresh = fetchActiveAnnouncements(ss);
        setCachedDb(CACHE_KEYS.announcements, fresh);
        return fresh;
      })();

    // ── 5. Persona Profiles ───────────────────────────────────────────────────
    // Small table (~1 row per member), written nightly by ArkaPersonaPass.
    // Loaded here rather than W3 so the personality strip and full panel are
    // available as soon as W2 completes — no dependency on shelves or badges.
    // Evolution timeline also reads globalActivityLogDB (loaded above), so both
    // sources arrive in the same wave with no cross-wave dependency.
    const personaProfileList = buildPersonaProfileDBList_(ss);

    return {
      status                 : 'success',
      activityLogDB          : activityLogList,
      challengesDB           : challengesDBList,
      challengeEnrollmentsDB : challengeEnrollmentsDBList,
      announcementsDB        : announcementsDBList,
      personaProfileDB       : personaProfileList
    };
 
  } catch (e) {
    console.error('getWave2Data failed:', e);
    return { status: 'error', message: e.toString() };
  }
}
 
 
/**
 * WAVE 3 — Library, shelves, badges.
 *
 * Returns:
 *   ArkaLibraryDB → book covers, titles, authors
 *   MemberShelfDB → shelf carousel, booksThisYear stat pill update
 *   BadgeDB       → badge gallery
 *   BadgeAwardDB  → badge strip, earned badges
 *
 * Target: fires immediately after Wave 2 handler completes.
 */
function getWave3Data() {
  if (!getVerifiedMemberId()) return { status: 'unauthorized' };
  try {
    // Temporary — add at the top of getWave3Data()
    const t3start = Date.now();

    const ss       = SpreadsheetApp.openById(SPREADSHEET_ID);

    // ── 1. Library ───────────────────────────────────────────────────────────
    const libSheet    = ss.getSheetByName('ArkaLibraryDB');
    const libraryList = [];
    if (libSheet) {
      const data = libSheet.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        if (!data[i][0]) continue;
        const rawDate = data[i][6];
        libraryList.push({
          id               : data[i][0],
          title            : data[i][1],
          author           : data[i][2],
          genre            : data[i][3] || 'Uncategorized',
          pages            : data[i][4] || 0,
          addedByRaw       : data[i][5],
          addedDate        : rawDate instanceof Date
            ? Utilities.formatDate(rawDate, Session.getScriptTimeZone(), 'dd-MMM-yyyy')
            : String(rawDate),
          lastModifiedDate : data[i][7],
          lastModifiedBy   : data[i][8],
          coverImageURL    : data[i][9]  || '',
          isbn13           : data[i][10] || '',
          publishedDate    : data[i][11] || '',
          blurb            : data[i][12] || ''
        });
      }
    }
    console.log('LibraryDB read: ' + (Date.now() - t3start) + 'ms, rows: ' + libraryList.length);
 
    // ── 2. Shelves (11 cols) ─────────────────────────────────────────────────
    const shelfSheet  = ss.getSheetByName(SHELF_SHEET);
    const shelvesList = [];
    if (shelfSheet) {
      const lastRow = shelfSheet.getLastRow();
      if (lastRow > 1) {
        const data = shelfSheet.getRange(1, 1, lastRow, 11).getValues();
        for (let i = 1; i < data.length; i++) {
          if (!data[i][0]) continue;
          const r1 = data[i][6], r2 = data[i][7], r3 = data[i][8];
          const fmt = function(v) {
            return v instanceof Date
              ? Utilities.formatDate(v, Session.getScriptTimeZone(), 'dd-MMM-yyyy')
              : String(v || '');
          };
          shelvesList.push({
            shelfId       : data[i][0],
            memberId      : data[i][1],
            bookId        : data[i][2],
            status        : data[i][3],
            rating        : Number(data[i][4]) || 0,
            review        : data[i][5] || '',
            pagesRead     : data[i][9] || 0,
            dateAdded     : fmt(r1),
            dateUpdated   : fmt(r2),
            dateFinished  : fmt(r3),
            lastModifiedOn: data[i][10]
          });
        }
      }
    }
    console.log('ShelfDB read: '   + (Date.now() - t3start) + 'ms, rows: ' + shelvesList.length);
 
    // ── 3. Badges ────────────────────────────────────────────────────────────

    const badgesDBList = getCachedDb(CACHE_KEYS.badges)
      || (function() {
        const fresh = buildBadgesDBList_(ss);
        setCachedDb(CACHE_KEYS.badges, fresh);
        return fresh;
      })();
    console.log('BadgeDB read: '   + (Date.now() - t3start) + 'ms, rows: ' + badgesDBList.length);
 
    // ── 4. Badge Awards ──────────────────────────────────────────────────────
    const badgeAwardsDBList = getCachedDb(CACHE_KEYS.badgeAwards)
      || (function() {
        const fresh = buildBadgeAwardsDBList_(ss);
        setCachedDb(CACHE_KEYS.badgeAwards, fresh);
        return fresh;
      })();
    console.log('BadgeAwardDB: '   + (Date.now() - t3start) + 'ms, rows: ' + badgeAwardsDBList.length);
    
    return {
      status       : 'success',
      booksDB      : libraryList,
      shelvesDB    : shelvesList,
      badgesDB     : badgesDBList,
      badgeAwardsDB: badgeAwardsDBList
    };
 
  } catch (e) {
    console.error('getWave3Data failed:', e);
    return { status: 'error', message: e.toString() };
  }
}

/**
 * Returns all PageLogDB rows belonging to the currently authenticated member.
 *
 * Called in Wave 3 (alongside getWave3Data) so personal features — heatmap,
 * streak, "Over the Years" chart, badge progress, challenge PAGE_COUNT sync —
 * have the member's complete history without carrying it in the club-wide
 * Wave 1 payload.
 *
 * Security: reads session via getVerifiedMemberId() — only the logged-in
 * member's own rows are returned regardless of any client-supplied value.
 *
 * @returns {{ status: string, myPageLogs: Array }}
 */
function getMyPageLogs() {
  const currentMemberId = getVerifiedMemberId();
  if (!currentMemberId) return { status: 'error', message: 'Unauthorized session.' };

  try {
    const ss           = SpreadsheetApp.openById(SPREADSHEET_ID);
    const pageLogSheet = ss.getSheetByName(PAGELOG_SHEET);
    const myLogs       = [];

    if (pageLogSheet) {
      const totalRows = pageLogSheet.getLastRow();
      if (totalRows > 1) {
        // Read all 6 columns — Col C (index 2) is memberId, used as the filter.
        const data = pageLogSheet.getRange(1, 1, totalRows, 6).getValues();
        for (let i = 1; i < data.length; i++) {
          if (!data[i][0]) continue;
          if (data[i][2].toString() !== currentMemberId) continue;

          const rawTs = data[i][1];
          myLogs.push({
            logId      : data[i][0].toString(),
            timestamp  : rawTs instanceof Date
              ? Utilities.formatDate(rawTs, Session.getScriptTimeZone(), 'dd-MM-yyyy HH:mm:ss Z')
              : rawTs.toString(),
            memberId   : currentMemberId,
            bookId     : data[i][3].toString(),
            pagesDelta : Number(data[i][4]) || 0,
            logSource  : data[i][5].toString()
          });
        }
      }
    }

    return { status: 'success', myPageLogs: myLogs };

  } catch (e) {
    console.error('getMyPageLogs failed:', e);
    return { status: 'error', message: e.toString() };
  }
}

/**
 * getReadingTogetherData
 *
 * Returns page-log history for all members currently reading a specific book,
 * plus the shelf record for each (for currentPage and dateAdded context).
 * Only members with status = 'Reading' for this bookId are included.
 *
 * Called on demand when the Reading Together view is opened — keeps this
 * heavyweight data out of the normal wave load cycle.
 *
 * PageLogDB columns (1-based):
 *   Col A (0): logId      Col B (1): timestamp  Col C (2): memberId
 *   Col D (3): bookId     Col E (4): pagesDelta  Col F (5): logSource
 *
 * @param  {string} bookId - ArkaBook ID, e.g. 'ARKA_BOOK_001'
 * @returns {{
 *   status: string,
 *   coReaders: Array<{memberId, displayName, initials, currentPage, dateAdded}>,
 *   pageLogs: Array<{memberId, timestamp, pagesDelta}>
 * }}
 */
function getReadingTogetherData(bookId) {
  const currentMemberId = getVerifiedMemberId();
  if (!currentMemberId) return { status: 'error', message: 'Unauthorized session.' };
  if (!bookId)          return { status: 'error', message: 'bookId is required.' };

  try {
    const ss           = SpreadsheetApp.openById(SPREADSHEET_ID);
    // SHELF_SHEET = 'MemberShelfDB' — the correct constant for the shelf sheet.
    const shelvesSheet = ss.getSheetByName(SHELF_SHEET);
    const membersSheet = ss.getSheetByName(MEMBERS_SHEET);
    const pageLogSheet = ss.getSheetByName(PAGELOG_SHEET);

    if (!shelvesSheet || !membersSheet || !pageLogSheet) {
      return { status: 'error', message: 'Required sheet not found.' };
    }

    // ── Step 1: Collect member IDs currently Reading this book ─────────────
    const coReaderIds = new Set();
    const shelvesData = shelvesSheet.getDataRange().getValues();

    // MemberShelfDB column indices (0-based) — see Arka_Database_Definitions_v5.md
    // Col A(0)=shelfId  Col B(1)=memberId  Col C(2)=bookId  Col D(3)=status
    // Col E(4)=rating   Col F(5)=review    Col G(6)=dateAdded
    // Col H(7)=dateUpdated  Col I(8)=dateFinished  Col J(9)=pagesRead
    const SH_COL_MEMBER_ID    = 1;  // Col B
    const SH_COL_BOOK_ID      = 2;  // Col C
    const SH_COL_STATUS       = 3;  // Col D
    const SH_COL_CURRENT_PAGE = 9;  // Col J — pagesRead (not rating at Col E)
    const SH_COL_DATE_ADDED   = 6;  // Col G

    /** @type {Map<string, {currentPage: number, dateAdded: string}>} */
    const shelfDataByMember = new Map();

    for (let i = 1; i < shelvesData.length; i++) {
      const row = shelvesData[i];
      if (!row[SH_COL_BOOK_ID]) continue;
      if (row[SH_COL_BOOK_ID].toString() !== bookId) continue;
      if (row[SH_COL_STATUS].toString() !== 'Reading') continue;

      const mid = row[SH_COL_MEMBER_ID].toString();
      coReaderIds.add(mid);

      const rawDateAdded = row[SH_COL_DATE_ADDED];
      shelfDataByMember.set(mid, {
        currentPage : Number(row[SH_COL_CURRENT_PAGE]) || 0,
        dateAdded   : rawDateAdded instanceof Date
          ? Utilities.formatDate(rawDateAdded, Session.getScriptTimeZone(), 'dd-MM-yyyy HH:mm:ss Z')
          : rawDateAdded.toString()
      });
    }

    if (coReaderIds.size === 0) {
      return { status: 'success', coReaders: [], pageLogs: [] };
    }

    // ── Step 2: Resolve display names + initials from MemberDB ─────────────
    const membersData = membersSheet.getDataRange().getValues();
    // MemberDB: Col A(0)=memberId  Col B(1)=emails  Col C(2)=?  Col D(3)=displayName
    const MEM_COL_MEMBER_ID    = 0;  // Col A
    const MEM_COL_DISPLAY_NAME = 3;  // Col D — not Col B which is the emails column

    /** @type {Array<{memberId, displayName, initials, currentPage, dateAdded}>} */
    const coReaders = [];

    for (let i = 1; i < membersData.length; i++) {
      const mid = membersData[i][MEM_COL_MEMBER_ID].toString();
      if (!coReaderIds.has(mid)) continue;

      const displayName = membersData[i][MEM_COL_DISPLAY_NAME].toString().trim();
      const nameParts   = displayName.split(' ').filter(Boolean);
      // Two initials: first letter of first name + first letter of last name (if exists)
      const initials = nameParts.length >= 2
        ? (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase()
        : displayName.substring(0, 2).toUpperCase();

      const shelf = shelfDataByMember.get(mid) || { currentPage: 0, dateAdded: '' };
      coReaders.push({
        memberId    : mid,
        displayName : displayName,
        initials    : initials,
        currentPage : shelf.currentPage,
        dateAdded   : shelf.dateAdded,
        isCurrentUser: mid === currentMemberId
      });
    }

    // Sort: current user first, then alphabetically by display name
    coReaders.sort(function(a, b) {
      if (a.isCurrentUser) return -1;
      if (b.isCurrentUser) return  1;
      return a.displayName.localeCompare(b.displayName);
    });

    // ── Step 3: Fetch page logs for all co-readers for this book ───────────
    const pageLogData = pageLogSheet.getDataRange().getValues();
    /** @type {Array<{memberId, timestamp, pagesDelta}>} */
    const pageLogs = [];

    for (let i = 1; i < pageLogData.length; i++) {
      const row = pageLogData[i];
      if (!row[0]) continue; // skip blank rows

      const logMemberId = row[2].toString();
      if (!coReaderIds.has(logMemberId)) continue;

      const logBookId = row[3].toString();
      if (logBookId !== bookId) continue;

      const delta = Number(row[4]) || 0;
      if (delta === 0) continue; // skip zero-delta correction markers

      const rawTs = row[1];
      pageLogs.push({
        memberId   : logMemberId,
        timestamp  : rawTs instanceof Date
          ? Utilities.formatDate(rawTs, Session.getScriptTimeZone(), 'dd-MM-yyyy HH:mm:ss Z')
          : rawTs.toString(),
        pagesDelta : delta
      });
    }

    return { status: 'success', coReaders: coReaders, pageLogs: pageLogs };

  } catch (e) {
    console.error('getReadingTogetherData failed:', e);
    return { status: 'error', message: e.toString() };
  }
}

/**
 * Computes lifetime-page milestone crossings for a given calendar month.
 *
 * Called on demand when an admin generates a monthly report — reads the full
 * PageLogDB directly from the sheet so the frontend never needs to carry
 * all-time all-member page history in memory.
 *
 * Logic: for each member, sum all their page logs before the month start.
 * If that running total was below a threshold but their lifetime total (from
 * MemberDB Col P) is at or above it, the crossing happened during this month.
 *
 * @param {number} year  - 4-digit year, e.g. 2026
 * @param {number} month - 1-based month, e.g. 5 for May
 * @returns {{ status: string, milestones: Array<{memberName, text, color}> }}
 */
function getReportMilestones(year, month) {
  const currentMemberId = getVerifiedMemberId();
  if (!currentMemberId || !ADMIN_MEMBER_IDS_BACKEND.includes(currentMemberId)) {
    return { status: 'error', message: 'Admin access required.' };
  }

  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    // Month boundaries
    const monthStart    = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const monthStartMs  = monthStart.getTime();

    const MILESTONE_THRESHOLDS = [1000, 5000, 10000, 25000, 50000, 100000];
    const milestones            = [];

    // Build member lifetime-pages map from MemberDB (Col P = index 15)
    const memberSheet = ss.getSheetByName(MEMBERS_SHEET);
    const memberData  = memberSheet.getDataRange().getValues();
    const lifetimeMap = {}; // memberId → lifetime pages
    const nameMap     = {}; // memberId → displayName
    for (let i = 1; i < memberData.length; i++) {
      const mid = (memberData[i][0] || '').toString();
      if (!mid) continue;
      lifetimeMap[mid] = Number(memberData[i][15]) || 0; // Col P — TotalPages
      nameMap[mid]     = (memberData[i][3] || mid).toString();  // Col D — DisplayName
    }

    // Build per-member pages logged BEFORE this month from full PageLogDB
    const pageLogSheet = ss.getSheetByName(PAGELOG_SHEET);
    if (!pageLogSheet) return { status: 'success', milestones: [] };

    const pageData        = pageLogSheet.getDataRange().getValues();
    const pagesBeforeMap  = {}; // memberId → pages before monthStart

    for (let i = 1; i < pageData.length; i++) {
      if (!pageData[i][0]) continue;
      const mid    = (pageData[i][2] || '').toString();
      const pages  = Number(pageData[i][4]) || 0;
      if (pages <= 0) continue;

      // Parse timestamp — use the same Arka Z-format parser used by MasterEngine
      const rawTs  = pageData[i][1];
      const tsMs   = parseSheetTimestamp_(rawTs).getTime();

      if (isNaN(tsMs) || tsMs >= monthStartMs) continue; // only rows before month start

      pagesBeforeMap[mid] = (pagesBeforeMap[mid] || 0) + pages;
    }

    // Detect crossings: was below threshold before month, at/above threshold lifetime
    Object.keys(lifetimeMap).forEach(function(mid) {
      const lifetime    = lifetimeMap[mid];
      const before      = pagesBeforeMap[mid] || 0;
      MILESTONE_THRESHOLDS.forEach(function(threshold) {
        if (lifetime >= threshold && before < threshold) {
          milestones.push({
            memberName: nameMap[mid] || mid,
            text      : 'Crossed ' + threshold.toLocaleString() + ' lifetime pages!',
            color     : '#1D9E75'
          });
        }
      });
    });

    return { status: 'success', milestones: milestones };

  } catch (e) {
    console.error('getReportMilestones failed:', e);
    return { status: 'error', message: e.toString() };
  }
}

/**
 * getReportsData()
 *
 * Returns all DB arrays needed by the standalone ArkaReports.html web app.
 * This is a single-call equivalent of Wave 1 + Wave 2 (activity) + Wave 3
 * (shelves + badge awards) + events + book posts, scoped for admin use.
 *
 * Guard: only callable by a member listed in ADMIN_MEMBER_IDS_BACKEND.
 * Returns status:'admin_required' (not 'error') so the frontend can show
 * the access-denied panel rather than the generic error panel.
 *
 * Data returned:
 *   membersDB     {Array}  All MemberDB records — same shape as Wave 1
 *   pageLogDB     {Array}  Last 90 days, all members — same shape as Wave 1
 *   activityLogDB {Array}  Recent ActivityLogDB rows — same shape as Wave 2
 *   shelvesDB     {Array}  All MemberShelfDB rows — same shape as Wave 3
 *   badgesDB      {Array}  All BadgeDB rows — same shape as Wave 3
 *   badgeAwardsDB {Array}  All BadgeAwardDB rows — same shape as Wave 3
 *   bookPostsDB   {Array}  All Active BookPostDB rows across all books
 *   eventsDB      {Array}  All EventDB rows — same shape as getEventsData()
 *   booksDB       {Array}  All ArkaLibraryDB rows — same shape as Wave 3
 *
 * @returns {Object} { status, membersDB, pageLogDB, activityLogDB, shelvesDB,
 *                     badgesDB, badgeAwardsDB, bookPostsDB, eventsDB, booksDB }
 */
function getReportsData() {
  // ── Admin guard ─────────────────────────────────────────────────────────────
  const currentMemberId = getVerifiedMemberId();
  if (!currentMemberId || !ADMIN_MEMBER_IDS_BACKEND.includes(currentMemberId)) {
    return { status: 'admin_required', message: 'Admin access required.' };
  }

  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    // ── 1. MembersDB ─────────────────────────────────────────────────────────
    // Reuse the same helper used by Wave 1. Members are always read fresh
    // since points and stats change on every member action.
    const membersDB = buildMembersList_(ss);

    // ── 2. PageLogDB — 90-day club-wide slice ────────────────────────────────
    // 90 days covers: current week + prior week (weekly pulse MoM delta),
    // current month + prior month (monthly report MoM comparison).
    const pageLogDB    = [];
    const pageLogSheet = ss.getSheetByName(PAGELOG_SHEET);

    if (pageLogSheet) {
      const rptCutoffDate = new Date();
      rptCutoffDate.setDate(rptCutoffDate.getDate() - 90);
      const rptCutoffMs   = rptCutoffDate.getTime();

      const totalRows = pageLogSheet.getLastRow();
      if (totalRows > 1) {
        // Scan from the bottom — PageLogDB is append-only so recent rows are last.
        // PAGE_LOG_GLOBAL_SCAN_LIMIT is the same cap used by Wave 1.
        const startRow = Math.max(2, totalRows - PAGE_LOG_GLOBAL_SCAN_LIMIT + 1);
        const rowCount = totalRows - startRow + 1;
        const data     = pageLogSheet.getRange(startRow, 1, rowCount, 6).getValues();

        for (let i = 0; i < data.length; i++) {
          if (!data[i][0]) continue;

          const rawTs = data[i][1];
          const tsMs  = parseSheetTimestamp_(rawTs).getTime();
          if (isNaN(tsMs) || tsMs < rptCutoffMs) continue;

          pageLogDB.push({
            logId      : data[i][0].toString(),
            timestamp  : rawTs instanceof Date
              ? Utilities.formatDate(rawTs, Session.getScriptTimeZone(), 'dd-MM-yyyy HH:mm:ss Z')
              : rawTs.toString(),
            memberId   : data[i][2].toString(),
            bookId     : data[i][3].toString(),
            pagesDelta : Number(data[i][4]) || 0,
            logSource  : data[i][5].toString()
          });
        }
      }
    }

    // ── 3. ActivityLogDB ─────────────────────────────────────────────────────
    // Same logic as Wave 2: read the most recent ACTIVITY_LOG_FETCH_LIMIT rows.
    // The reports engine uses this for AP-by-category breakdown and badge counts.
    const activityLogDB  = [];
    const actLogSheet    = ss.getSheetByName(ACTIVITYLOG_SHEET);

    if (actLogSheet) {
      const totalActRows = actLogSheet.getLastRow();
      const actStartRow  = Math.max(2, totalActRows - ACTIVITY_LOG_FETCH_LIMIT + 1);
      const actRowCount  = totalActRows - actStartRow + 1;
      if (actRowCount > 0) {
        const data = actLogSheet.getRange(actStartRow, 1, actRowCount, 7).getValues();
        for (let i = 0; i < data.length; i++) {
          if (!data[i][0]) continue;
          activityLogDB.push({
            activityID        : data[i][0],
            activityTypeID    : data[i][1],
            activityDate      : data[i][2],
            activityMemberID  : data[i][3],
            activityDesc      : data[i][4] || '',
            activitySource    : data[i][5] || '',
            activityCPAwarded : Number(data[i][6]) || 0
          });
        }
      }
    }

    // ── 4. ShelvesDB ─────────────────────────────────────────────────────────
    // Full table — used to find books finished within the report period.
    // Reuse the cache when available (same cache key as Wave 3).
    // Note: shelves cache is invalidated on shelf mutations in the main app.
    const shelvesDB  = [];
    const shelfSheet = ss.getSheetByName(SHELF_SHEET);

    if (shelfSheet) {
      const lastRow = shelfSheet.getLastRow();
      if (lastRow > 1) {
        const data    = shelfSheet.getRange(1, 1, lastRow, 11).getValues();
        const fmtDate = function(v) {
          return v instanceof Date
            ? Utilities.formatDate(v, Session.getScriptTimeZone(), 'dd-MMM-yyyy')
            : String(v || '');
        };
        for (let i = 1; i < data.length; i++) {
          if (!data[i][0]) continue;
          shelvesDB.push({
            shelfId       : data[i][0],
            memberId      : data[i][1],
            bookId        : data[i][2],
            status        : data[i][3],
            rating        : Number(data[i][4]) || 0,
            review        : data[i][5] || '',
            pagesRead     : data[i][9] || 0,
            dateAdded     : fmtDate(data[i][6]),
            dateUpdated   : fmtDate(data[i][7]),
            dateFinished  : fmtDate(data[i][8]),
            lastModifiedOn: data[i][10]
          });
        }
      }
    }

    // ── 5. BadgesDB ──────────────────────────────────────────────────────────
    // Definition records — used to look up badge names/icons when rendering
    // the badge-awards section of the weekly slide.
    const badgesDB = getCachedDb(CACHE_KEYS.badges)
      || (function() {
        const fresh = buildBadgesDBList_(ss);
        setCachedDb(CACHE_KEYS.badges, fresh);
        return fresh;
      })();

    // ── 6. BadgeAwardsDB ─────────────────────────────────────────────────────
    // Award records — used to count badges granted in the report period.
    const badgeAwardsDB = getCachedDb(CACHE_KEYS.badgeAwards)
      || (function() {
        const fresh = buildBadgeAwardsDBList_(ss);
        setCachedDb(CACHE_KEYS.badgeAwards, fresh);
        return fresh;
      })();

    // ── 7. BookPostsDB — all active posts, all books ─────────────────────────
    // In the main app, globalBookPostsDB is populated lazily per-book when a
    // user opens the Reading Room. Here we read the full table once so the
    // weekly report can surface book-post activity across any book.
    //
    // Field mapping note: the reports engine accesses post.reviewText (or
    // post.postBody) for the snippet preview. We expose the content column
    // under reviewText so the engine finds it without any logic change.
    const bookPostsDB  = [];
    const postSheet    = ss.getSheetByName(BOOK_POST_SHEET);

    if (postSheet) {
      const postData = postSheet.getDataRange().getValues();
      for (let i = 1; i < postData.length; i++) {
        if (!postData[i][0]) continue;
        if ((postData[i][6] || '').toString() !== 'Active') continue; // Status col G

        const rawPostTs = postData[i][3]; // Col D — timestamp
        bookPostsDB.push({
          postId     : postData[i][0].toString(),
          bookId     : postData[i][1].toString(),
          memberId   : postData[i][2].toString(),
          timestamp  : rawPostTs instanceof Date
            ? Utilities.formatDate(rawPostTs, Session.getScriptTimeZone(), 'dd-MM-yyyy HH:mm:ss Z')
            : rawPostTs.toString(),
          postType   : postData[i][4].toString(),
          reviewText : postData[i][5].toString(), // mapped from 'content' → reviewText for reports engine
          status     : postData[i][6].toString(),
          likeCount  : Number(postData[i][7]) || 0
        });
      }
    }

    // ── 8. EventsDB ──────────────────────────────────────────────────────────
    // Event records — used by the monthly report's events section.
    // Reuse the same row-mapping as getEventsData() for shape consistency.
    const eventsDB  = [];
    const eventSheet = ss.getSheetByName(EVENT_SHEET);

    if (eventSheet) {
      const eData = eventSheet.getDataRange().getValues();
      for (let i = 1; i < eData.length; i++) {
        if (!eData[i][0]) continue;

        const rawStart     = eData[i][5];
        const rawEnd       = eData[i][7];
        const rawCreatedOn = eData[i][14];

        eventsDB.push({
          eventId      : eData[i][0].toString(),
          eventType    : eData[i][1].toString(),
          title        : eData[i][2].toString(),
          description  : eData[i][3].toString(),
          hostMemberId : eData[i][4].toString(),
          startDate    : rawStart instanceof Date
            ? Utilities.formatDate(rawStart, Session.getScriptTimeZone(), 'dd-MMM-yyyy')
            : String(rawStart || ''),
          startTime    : eData[i][6] instanceof Date
            ? Utilities.formatDate(eData[i][6], 'UTC', 'HH:mm')
            : String(eData[i][6] || ''),
          endDate      : rawEnd instanceof Date
            ? Utilities.formatDate(rawEnd, Session.getScriptTimeZone(), 'dd-MMM-yyyy')
            : String(rawEnd || ''),
          endTime      : eData[i][8] instanceof Date
            ? Utilities.formatDate(eData[i][8], 'UTC', 'HH:mm')
            : String(eData[i][8] || ''),
          meetingLink  : eData[i][9].toString(),
          assetsJson   : eData[i][10].toString(),
          status       : eData[i][11].toString(),
          isPinned     : eData[i][12].toString().toUpperCase() === 'TRUE',
          createdBy    : eData[i][13].toString(),
          createdOn    : rawCreatedOn instanceof Date
            ? Utilities.formatDate(rawCreatedOn, Session.getScriptTimeZone(), 'dd-MM-yyyy HH:mm:ss Z')
            : String(rawCreatedOn || ''),
          eventTimezone : eData[i][15] ? eData[i][15].toString() : 'IST'
        });
      }
    }

    // ── 9. BooksDB (ArkaLibraryDB) ────────────────────────────────────────────
    // Book records — needed to resolve bookId → title/genre/author on shelf rows.
    const libSheet  = ss.getSheetByName('ArkaLibraryDB');
    const booksDB   = [];

    if (libSheet) {
      const libData = libSheet.getDataRange().getValues();
      for (let i = 1; i < libData.length; i++) {
        if (!libData[i][0]) continue;
        const rawAddedDate = libData[i][6];
        booksDB.push({
          id               : libData[i][0],
          title            : libData[i][1],
          author           : libData[i][2],
          genre            : libData[i][3] || 'Uncategorized',
          pages            : libData[i][4] || 0,
          addedByRaw       : libData[i][5],
          addedDate        : rawAddedDate instanceof Date
            ? Utilities.formatDate(rawAddedDate, Session.getScriptTimeZone(), 'dd-MMM-yyyy')
            : String(rawAddedDate || ''),
          lastModifiedDate : libData[i][7],
          lastModifiedBy   : libData[i][8],
          coverImageURL    : libData[i][9]  || '',
          isbn13           : libData[i][10] || '',
          publishedDate    : libData[i][11] || '',
          blurb            : libData[i][12] || ''
        });
      }
    }

    return {
      status       : 'success',
      membersDB,
      pageLogDB,
      activityLogDB,
      shelvesDB,
      badgesDB,
      badgeAwardsDB,
      bookPostsDB,
      eventsDB,
      booksDB
    };

  } catch (e) {
    console.error('getReportsData failed:', e);
    return { status: 'error', message: e.toString() };
  }
}

/**
 * ADMIN ONLY: Big-gulp data fetch for ArkaAdminControlPanel.
 *
 * Returns all data needed by the admin panel in a single round-trip:
 *   - Full member list (with lastAccessedTs for client-side activity filtering)
 *   - Full badge catalogue
 *   - Full badge award ledger
 *   - Per-version load timing stats (pre-aggregated, not raw rows)
 *
 * Security: gated by isAdminMember(). Non-admins receive { status:'admin_required' }.
 *
 * @returns {{
 *   status: string,
 *   currentAdminId: string,
 *   pendingCount: number,
 *   memberList: Object[],
 *   badgeList: Object[],
 *   badgeAwardList: Object[],
 *   timingStats: Object[]
 * }}
 */
function getAdminPanelData() {
  const currentMemberId = getVerifiedMemberId();
  if (!currentMemberId)                return { status: 'error',         message: 'Unauthorized session.' };
  if (!isAdminMember(currentMemberId)) return { status: 'admin_required', message: 'Admin access required.' };

  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    // ── 1. Member list ───────────────────────────────────────────────
    const memberSheet = ss.getSheetByName(MEMBERS_SHEET);
    const memberRows  = memberSheet.getDataRange().getValues();
    const memberList  = [];

    for (let i = 1; i < memberRows.length; i++) {
      if (!memberRows[i][0]) continue; // Skip blank rows

      const rawJoinDate     = memberRows[i][4];   // Col E
      const rawLastAccessed = memberRows[i][12];  // Col M

      const joinDateStr = rawJoinDate instanceof Date
        ? Utilities.formatDate(rawJoinDate, Session.getScriptTimeZone(), 'dd-MMM-yyyy')
        : String(rawJoinDate || '');

      const lastAccessedStr = rawLastAccessed instanceof Date
        ? Utilities.formatDate(rawLastAccessed, Session.getScriptTimeZone(), 'dd-MMM-yyyy HH:mm')
        : String(rawLastAccessed || '');

      // lastAccessedTs: unix ms timestamp — lets the HTML do 30-day
      // activity filtering with Date.now() without any date parsing.
      // Col M is stored as a formatted string 'dd-MM-yyyy HH:mm:ss Z' by
      // Utilities.formatDate(), so instanceof Date is always false. We parse
      // it manually by reordering to MM/dd/yyyy which Date() can handle.
      const lastAccessedTs = (function() {
        if (rawLastAccessed instanceof Date) return rawLastAccessed.getTime();
        if (!rawLastAccessed) return 0;
        var s = rawLastAccessed.toString().trim();
        if (!s) return 0;
        var converted = s.replace(/^(\d{2})-(\d{2})-(\d{4})/, '$2/$1/$3');
        var d = new Date(converted);
        return isNaN(d.getTime()) ? 0 : d.getTime();
      })();

      memberList.push({
        memberId       : memberRows[i][0].toString(),
        email          : (memberRows[i][1] || '').toString().split(',')[0].trim(),
        fullName       : (memberRows[i][2] || '').toString().trim(),
        displayName    : (memberRows[i][3] || '').toString().trim(),
        joinDate       : joinDateStr,
        country        : (memberRows[i][5] || '').toString().trim(),
        lastAccessed   : lastAccessedStr,   // formatted string for display
        lastAccessedTs : lastAccessedTs,    // unix ms for JS comparisons
        totalCp        : _parseColOStats_(memberRows[i][14]).allTime.arkaPoints, // Col O Stats JSON
        totalPages     : _parseColOStats_(memberRows[i][14]).allTime.pages,
        totalBooks     : _parseColOStats_(memberRows[i][14]).allTime.books,
        approvalStatus : (memberRows[i][MEMBER_APPROVAL_COL_INDEX] || '').toString().trim()
      });
    }

    // ── 2. Badge catalogue ───────────────────────────────────────────
    const badgeSheet = ss.getSheetByName(BADGE_DB_SHEET);
    const badgeRows  = badgeSheet.getDataRange().getValues();
    const badgeList  = [];

    for (let i = 1; i < badgeRows.length; i++) {
      if (!badgeRows[i][0]) continue;
      badgeList.push({
        badgeId      : badgeRows[i][0].toString(),
        caption      : (badgeRows[i][1] || '').toString().trim(),  // Col B: Caption
        description  : (badgeRows[i][2] || '').toString().trim(),  // Col C: Description
        imgUrl       : (badgeRows[i][3] || '').toString().trim(),  // Col D: ImgUrl
        badgePoints  : Number(badgeRows[i][4]) || 0,               // Col E: BadgePoints
        badgeCategory: (badgeRows[i][5] || '').toString().trim(),  // Col F: BadgeCategory
        badgeTier    : Number(badgeRows[i][6]) || 0,               // Col G: BadgeTier
        badgeMeta    : (badgeRows[i][7] || '').toString().trim()   // Col H: BadgeMeta
      });
    }

    // ── 3. Badge award ledger ────────────────────────────────────────
    const awardSheet  = ss.getSheetByName(BADGE_AWARD_DB_SHEET);
    const awardRows   = awardSheet.getDataRange().getValues();
    const badgeAwardList = [];

    for (let i = 1; i < awardRows.length; i++) {
      if (!awardRows[i][0]) continue;

      const rawAwardDate = awardRows[i][4]; // Col E: AwardedDate
      const awardDateStr = rawAwardDate instanceof Date
        ? Utilities.formatDate(rawAwardDate, Session.getScriptTimeZone(), 'dd-MMM-yyyy')
        : String(rawAwardDate || '');

      badgeAwardList.push({
        awardId    : awardRows[i][0].toString(),
        badgeId    : awardRows[i][1].toString(),
        memberId   : awardRows[i][2].toString(),
        awardedBy  : awardRows[i][3].toString(),
        awardedDate: awardDateStr,
        status     : (awardRows[i][5] || 'Active').toString(),
        notes      : (awardRows[i][6] || '').toString()
      });
    }

    // ── 4. App load timing stats (aggregated, not raw rows) ──────────
    const timingSheet = ss.getSheetByName('AppLoadTimingDB');
    const timingStats = _computeAdminTimingStats_(timingSheet);

    // ── 5. Pre-computed pending count (drives the nav bubble) ─────────
    const pendingCount = memberList.filter(function (m) {
      return m.approvalStatus === APPROVAL_STATUS.PENDING;
    }).length;

    return {
      status         : 'success',
      currentAdminId : currentMemberId,
      pendingCount   : pendingCount,
      memberList     : memberList,
      badgeList      : badgeList,
      badgeAwardList : badgeAwardList,
      timingStats    : timingStats
    };

  } catch (err) {
    console.error('getAdminPanelData failed:', err);
    return {
      status : 'error',
      message: 'Failed to load admin data: ' + (err && err.message ? err.message : String(err))
    };
  }
}

/**
 * PRIVATE HELPER: Reads AppLoadTimingDB and returns two separate trend arrays.
 *
 * AppVersion column format: '{baseVer}_{waveLabel}', e.g.:
 *   'v122_ALL'  — end-to-end total load time
 *   'v122_init' — initializeUser() overhead before waves fire
 *   'v122_w1'   — Wave 1 GAS call + render
 *   'v122_w3b'  — Wave 3b (myPageLogs), etc.
 *
 * Returns:
 *   totalTrend     — one stat object per base version, from _ALL rows only.
 *                    Sorted ASC (oldest → newest) for chart rendering.
 *   waveTrend      — one entry per base version with per-wave avgBigGulpMs.
 *                    BigGulpMs = elapsed from T0 to that wave's GAS response.
 *                    Sorted ASC. Wave entry is null when that wave didn't exist
 *                    in a version (useful for Chart.js spanGaps rendering).
 *   allWaveLabels  — ordered unique wave labels present in the data
 *                    (e.g. ['init','w1','w2','w3','w3b','w4','w5']).
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet|null} timingSheet
 * @returns {{ totalTrend: Object[], waveTrend: Object[], allWaveLabels: string[] }}
 */
function _computeAdminTimingStats_(timingSheet) {
  const EMPTY = { totalTrend: [], waveTrend: [], allWaveLabels: [] };
  if (!timingSheet) return EMPTY;

  const rows = timingSheet.getDataRange().getValues();
  if (rows.length < 2) return EMPTY;

  /**
   * Parses version number from a base version string, handling decimals.
   * 'v122' → 122, 'v38.5' → 38.5, 'v110' → 110
   * Using parseFloat so v38.5 correctly sorts before v110.
   */
  function parseVerNum(baseVer) {
    return parseFloat((baseVer || '').replace(/^[vV]/, '')) || 0;
  }

  /**
   * Returns a sort order integer for a wave label.
   * 'init' = 0, 'w1' = 1, 'w2' = 2, 'w3' = 3, 'w3b' = 3.5, 'w4' = 4 …
   */
  function waveOrder(label) {
    if (label === 'init') return 0;
    const m = (label || '').match(/^w(\d+)([a-z]*)$/i);
    if (m) return parseInt(m[1], 10) + (m[2] ? 0.5 : 0);
    return 999;
  }

  // Buckets for _ALL rows  →  { baseVer: { bigGulpArr, renderArr, totalArr } }
  const totalBuckets = {};
  // Buckets for wave rows  →  { baseVer: { waveLabel: [bigGulpMs, …] } }
  const waveBuckets  = {};
  // Track every unique wave label seen across all versions
  const waveLabelsSet = new Set();

  for (let i = 1; i < rows.length; i++) {
    if (!rows[i][0]) continue; // skip blank rows

    const rawVersion = (rows[i][2] || '').toString().trim();
    const underIdx   = rawVersion.indexOf('_');

    // Split 'v122_w3b' → baseVer='v122', waveLabel='w3b'
    // Rows without an underscore (legacy) are treated as _ALL
    const baseVer   = underIdx >= 0 ? rawVersion.substring(0, underIdx) : rawVersion;
    const waveLabel = underIdx >= 0 ? rawVersion.substring(underIdx + 1) : 'ALL';

    if (!baseVer) continue;

    const bigGulpMs = Number(rows[i][3]) || 0;
    const renderMs  = Number(rows[i][4]) || 0;
    const totalMs   = Number(rows[i][5]) || 0;

    if (waveLabel === 'ALL') {
      // ── Total load time ───────────────────────────────────────────
      if (!totalBuckets[baseVer]) {
        totalBuckets[baseVer] = { bigGulpArr: [], renderArr: [], totalArr: [] };
      }
      if (bigGulpMs > 0) totalBuckets[baseVer].bigGulpArr.push(bigGulpMs);
      if (renderMs  > 0) totalBuckets[baseVer].renderArr.push(renderMs);
      if (totalMs   > 0) totalBuckets[baseVer].totalArr.push(totalMs);
    } else {
      // ── Individual wave ───────────────────────────────────────────
      waveLabelsSet.add(waveLabel);
      if (!waveBuckets[baseVer])             waveBuckets[baseVer] = {};
      if (!waveBuckets[baseVer][waveLabel])  waveBuckets[baseVer][waveLabel] = [];
      // BigGulpMs for a wave = elapsed from T0 to that wave's GAS response —
      // the most useful measure of per-wave server cost
      if (bigGulpMs > 0) waveBuckets[baseVer][waveLabel].push(bigGulpMs);
    }
  }

  // ── Helper: compute stats for one numeric array ─────────────────────────
  function arrAvg(arr) {
    return arr.length ? Math.round(arr.reduce(function(s, v) { return s + v; }, 0) / arr.length) : 0;
  }

  // ── Total trend (one entry per base version, _ALL rows only) ───────────
  const totalTrend = Object.keys(totalBuckets).map(function(baseVer) {
    const bg  = totalBuckets[baseVer].bigGulpArr;
    const rn  = totalBuckets[baseVer].renderArr;
    const tot = totalBuckets[baseVer].totalArr;
    return {
      version      : baseVer,
      sampleCount  : tot.length,
      avgBigGulpMs : arrAvg(bg),
      avgRenderMs  : arrAvg(rn),
      avgTotalMs   : arrAvg(tot),
      minTotalMs   : tot.length ? Math.round(Math.min.apply(null, tot)) : 0,
      maxTotalMs   : tot.length ? Math.round(Math.max.apply(null, tot)) : 0,
      p50TotalMs   : _computeAdminPercentile_(tot, 50),
      p90TotalMs   : _computeAdminPercentile_(tot, 90)
    };
  }).sort(function(a, b) { return parseVerNum(a.version) - parseVerNum(b.version); }); // ASC

  // ── All wave labels in natural order ────────────────────────────────────
  const allWaveLabels = Array.from(waveLabelsSet).sort(function(a, b) {
    return waveOrder(a) - waveOrder(b);
  });

  // ── Wave trend (one entry per base version, null for absent waves) ──────
  const waveTrend = Object.keys(waveBuckets).map(function(baseVer) {
    const waves = {};
    allWaveLabels.forEach(function(wl) {
      const arr = (waveBuckets[baseVer] || {})[wl] || [];
      // null means this wave didn't exist yet in this version —
      // Chart.js will render a gap with spanGaps:false
      waves[wl] = arr.length ? { sampleCount: arr.length, avgBigGulpMs: arrAvg(arr) } : null;
    });
    return { version: baseVer, waves: waves };
  }).sort(function(a, b) { return parseVerNum(a.version) - parseVerNum(b.version); }); // ASC

  return { totalTrend: totalTrend, waveTrend: waveTrend, allWaveLabels: allWaveLabels };
}

/**
 * PRIVATE HELPER: Nearest-rank percentile of a numeric array.
 * Returns 0 for empty arrays. Result is rounded to the nearest integer ms.
 *
 * @param {number[]} arr - Positive numeric values (zeros already excluded by caller)
 * @param {number}   p   - Percentile 0–100
 * @returns {number}
 */
function _computeAdminPercentile_(arr, p) {
  if (!arr || arr.length === 0) return 0;
  const sorted = arr.slice().sort(function (a, b) { return a - b; });
  const idx    = Math.max(0, Math.ceil((p / 100) * sorted.length) - 1);
  return Math.round(sorted[idx]);
}

 
 
/**
 * WAVE 4 — Activity type point values.
 *
 * Reads ActivityTypeDB (Col A: TypeID, Col B: ActivityClubPoints) and
 * returns the data needed to build globalActivityPointsMap on the frontend.
 *
 * CACHE BEHAVIOUR:
 *   Hit  → returns cached array instantly, no sheet read (~1ms)
 *   Miss → reads sheet via buildActivityTypeList_(), writes to cache,
 *           returns fresh data
 *
 * Cache is invalidated by invalidateCacheKey(CACHE_KEYS.activityTypes)
 * which should be called from any function that modifies ActivityTypeDB
 * (currently only done via direct spreadsheet edits — no app UI for this).
 *
 * Falls back gracefully: if Wave 4 hasn't completed when a write operation
 * fires, getActivityMultiplier() reads ActivityTypeDB directly from the
 * sheet as a safety net.
 *
 * @returns {{
 *   status:         string,
 *   activityTypeDB: Array<{ activityTypeID: string, activityClubPoints: number }>
 * }}
 */
function getWave4Data() {
  if (!getVerifiedMemberId()) return { status: 'unauthorized' };
  try {
    // ── Cache check — no sheet read needed on hit ────────────────────────────
    const cachedActivityTypes = getCachedDb(CACHE_KEYS.activityTypes);
    if (cachedActivityTypes) {
      return {
        status        : 'success',
        activityTypeDB: cachedActivityTypes
      };
    }
 
    // ── Cache miss — read from sheet ─────────────────────────────────────────
    const ss       = SpreadsheetApp.openById(SPREADSHEET_ID);
 
    // Delegate the actual sheet read to the private helper.
    // buildActivityTypeList_ reads only 2 columns (A + B) — TypeID and Points.
    const activityTypeList = buildActivityTypeList_(ss);
 
    // Store in cache for subsequent loads — TTL is CACHE_TTL (21600s / 6 hours)
    setCachedDb(CACHE_KEYS.activityTypes, activityTypeList);
 

    return {
      status        : 'success',
      activityTypeDB: activityTypeList
    };
 
  } catch (e) {
    console.error('getWave4Data failed:', e);
    return { status: 'error', message: e.toString() };
  }
}

/**
 * HALL OF FAME — Single-pass data fetch for all five HOF sections.
 *
 * Opens the spreadsheet once and builds every dataset the Hall of Fame page
 * needs in a single pass over BadgeDB, BadgeAwardDB, and MemberDB.
 *
 * Datasets returned:
 *   annualAwardWinners — YEARLY badges, sorted year desc then badge name asc.
 *   categoryLeaders    — Highest-tier Active holder per badge category.
 *                        GENRE_EXPLORER is aggregated: best tier across all genres.
 *   badgeRoster        — All Active holders per category, tier desc then
 *                        earliest-earner-first within ties.
 *   rarityBoard        — Up to HOF_RARITY_BOARD_LIMIT badges with ≥1 holder,
 *                        sorted holder-count asc. YEARLY and SPECIAL excluded.
 *   specialBadges      — SPECIAL category Active awards, most recent first.
 *
 * Fired as Wave 5 concurrently with Waves 1–4. The HOF view renders a loading
 * skeleton until this wave arrives.
 *
 * @returns {{
 *   status:             string,
 *   annualAwardWinners: Object[],
 *   categoryLeaders:    Object[],
 *   badgeRoster:        Object.<string, Object[]>,
 *   rarityBoard:        Object[],
 *   specialBadges:      Object[]
 * }}
 */
function getHallOfFameData() {
  if (!getVerifiedMemberId()) return { status: 'unauthorized' };
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    // ── 1. Member lookup + Club Pulse + Club Records accumulators ────────────
    // getDataRange() already fetches all MemberDB columns so no extra read is
    // needed. Col O (idx 14) = AP, Col P (idx 15) = pages, Col Q (idx 16) = books.
    const memberSheet = ss.getSheetByName(MEMBERS_SHEET);
    const memberRows  = memberSheet ? memberSheet.getDataRange().getValues() : [];

    /** @type {Map<string, string>} memberId → displayName */
    const memberNameMap = new Map();

    // Club Pulse: page and AP sums from MemberDB; book count computed live from
    // MemberShelfDB in step 9a to avoid stale nightly-sync values.
    let hofClubTotalPages = 0;
    let hofClubTotalAP    = 0;

    /**
     * @typedef {{ holderId: string, holderName: string, value: number }} HofRecordHolder
     * Tracks the single member with the highest value for one stat category.
     */
    /** @type {HofRecordHolder|null} */
    let hofMaxPagesHolder = null;
    /** @type {HofRecordHolder|null} */
    let hofMaxBooksHolder = null;
    /** @type {HofRecordHolder|null} */
    let hofMaxApHolder    = null;

    for (let i = 1; i < memberRows.length; i++) {
      const memberId    = (memberRows[i][0] || '').toString().trim();
      const displayName = (memberRows[i][3] || memberRows[i][2] || '').toString().trim();
      if (!memberId) continue;

      memberNameMap.set(memberId, displayName);

      // Stat columns — Col O is now a Stats JSON blob; extract allTime.arkaPoints
      // for the Club Pulse AP total and the record-holder check.
      const memberAP    = _parseColOStats_(memberRows[i][14]).allTime.arkaPoints;  // Col O Stats JSON
      const memberPages = _parseColOStats_(memberRows[i][14]).allTime.pages;  // Col O Stats JSON
      const memberBooks = _parseColOStats_(memberRows[i][14]).allTime.books;  // Col O Stats JSON
                                                            // hofMaxBooksHolder (Club Records),
                                                            // not accumulated for Club Pulse
                                                            // (computed live from ShelvesDB instead)

      // Accumulate club-wide totals for Club Pulse
      hofClubTotalPages += memberPages;
      hofClubTotalAP    += memberAP;
      // hofClubTotalBooks intentionally omitted — stale nightly MasterEngine value replaced
      // by live hofShelfFinishedCount from MemberShelfDB in step 9a

      // Track record holders — update if this member exceeds the current max
      if (!hofMaxPagesHolder || memberPages > hofMaxPagesHolder.value) {
        hofMaxPagesHolder = { holderId: memberId, holderName: displayName, value: memberPages };
      }
      if (!hofMaxBooksHolder || memberBooks > hofMaxBooksHolder.value) {
        hofMaxBooksHolder = { holderId: memberId, holderName: displayName, value: memberBooks };
      }
      if (!hofMaxApHolder || memberAP > hofMaxApHolder.value) {
        hofMaxApHolder = { holderId: memberId, holderName: displayName, value: memberAP };
      }
    }

    // ── 2. Badge definition lookup: badgeId → metadata ──────────────────────
    // Column mapping mirrors buildBadgesDBList_():
    //   idx 0=BadgeID  1=Caption(name)  2=Description  3=ImgUrl
    //   idx 4=Points   5=Category       6=Tier          7=Meta
    const badgeSheet = ss.getSheetByName(BADGE_DB_SHEET);
    const badgeRows  = badgeSheet
      ? badgeSheet.getRange(1, 1, badgeSheet.getLastRow(), 8).getValues()
      : [];
    /**
     * @type {Map<string, {
     *   badgeName:     string,
     *   badgePoints:   number,
     *   badgeCategory: string,
     *   badgeTier:     number,
     *   badgeMeta:     string
     * }>}
     */
    const badgeDefMap = new Map();
    for (let i = 1; i < badgeRows.length; i++) {
      const badgeId = (badgeRows[i][0] || '').toString().trim();
      if (!badgeId) continue;
      badgeDefMap.set(badgeId, {
        badgeName     : (badgeRows[i][1] || '').toString().trim(),  // Col B: Caption
        badgePoints   : Number(badgeRows[i][4]) || 0,               // Col E
        badgeCategory : (badgeRows[i][5] || '').toString().trim(),  // Col F
        badgeTier     : Number(badgeRows[i][6]) || 0,               // Col G
        badgeMeta     : (badgeRows[i][7] || '').toString().trim()   // Col H
      });
    }

    // ── 3. Single pass over all Active badge awards ──────────────────────────
    const awardSheet = ss.getSheetByName(BADGE_AWARD_DB_SHEET);
    const awardRows  = awardSheet ? awardSheet.getDataRange().getValues() : [];

    // Working accumulators
    const yearlyAwards  = [];   // YEARLY awards for annualAwardWinners
    const specialAwards = [];   // SPECIAL awards for specialBadges

    /**
     * Category leaders tracker.
     * Structure: Map<category, Map<subKey, awardRecord>>
     * subKey for GENRE_EXPLORER = genre string from badgeMeta (one leader per genre)
     * subKey for all other categories = the category string itself (one leader total)
     * On each award, we keep only the highest-tier record; ties break on earliest date.
     * @type {Map<string, Map<string, Object>>}
     */
    const leaderMap = new Map();

    /**
     * Full roster accumulator.
     * Structure: Map<category, awardRecord[]>
     * YEARLY and SPECIAL excluded — they have dedicated sections.
     * @type {Map<string, Object[]>}
     */
    const rosterMap = new Map();

    /**
     * Rarity counter.
     * Structure: Map<badgeId, Set<memberId>>
     * Counts unique holders per badge for the rarity board.
     * @type {Map<string, Set<string>>}
     */
    const rarityCounter = new Map();

    for (let i = 1; i < awardRows.length; i++) {
      const awardId    = (awardRows[i][0] || '').toString().trim();
      const badgeId    = (awardRows[i][1] || '').toString().trim();
      const memberId   = (awardRows[i][2] || '').toString().trim();
      const rawAwardedDate = awardRows[i][4];
      const awardedDate    = rawAwardedDate instanceof Date
        ? Utilities.formatDate(rawAwardedDate, Session.getScriptTimeZone(), 'dd-MMM-yyyy')
        : (rawAwardedDate || '').toString().trim();
      const status     = (awardRows[i][5] || '').toString().trim();
      const notes      = (awardRows[i][6] || '').toString().trim();

      if (!awardId || status !== 'Active') continue;

      const def = badgeDefMap.get(badgeId);
      if (!def) continue;

      const displayName = memberNameMap.get(memberId) || memberId;

      /** @type {Object} Shared award record shape used across all sections */
      const awardRecord = {
        awardId          : awardId,
        badgeId          : badgeId,
        badgeName        : def.badgeName,
        badgeCategory    : def.badgeCategory,
        badgeTier        : def.badgeTier,
        badgePoints      : def.badgePoints,
        badgeMeta        : def.badgeMeta,
        memberId         : memberId,
        memberDisplayName: displayName,
        awardedDate      : awardedDate,
        notes            : notes
      };

      // ── Route YEARLY awards into their own section ─────────────────────
      if (def.badgeCategory === 'YEARLY') {
        // badgeMeta format: "YYYY|TYPE_CODE" e.g. "2025|CRITIC_OF_YEAR"
        const metaParts      = def.badgeMeta.split('|');
        awardRecord.year     = parseInt(metaParts[0]) || 0;
        awardRecord.awardCode = metaParts[1] || '';
        yearlyAwards.push(awardRecord);
        continue; // YEARLY does not feed rarity or roster
      }

      // ── Route SPECIAL awards into their own section ────────────────────
      if (def.badgeCategory === 'SPECIAL') {
        specialAwards.push(awardRecord);
        continue; // SPECIAL does not feed rarity or roster
      }

      // ── Update category leaders ────────────────────────────────────────
      // For GENRE_EXPLORER: one leader slot per genre (subKey = badgeMeta genre name)
      // For all others    : one leader slot per category (subKey = category string)
      const leaderSubKey = (def.badgeCategory === 'GENRE_EXPLORER')
        ? def.badgeMeta
        : def.badgeCategory;

      if (!leaderMap.has(def.badgeCategory)) leaderMap.set(def.badgeCategory, new Map());
      const catSlots  = leaderMap.get(def.badgeCategory);
      const incumbent = catSlots.get(leaderSubKey);

      const isNewLeader = !incumbent
        || def.badgeTier > incumbent.badgeTier
        || (def.badgeTier === incumbent.badgeTier
            && parseArkaDateForSort_(awardedDate) < parseArkaDateForSort_(incumbent.awardedDate));

      if (isNewLeader) catSlots.set(leaderSubKey, awardRecord);

      // ── Accumulate full roster ─────────────────────────────────────────
      if (!rosterMap.has(def.badgeCategory)) rosterMap.set(def.badgeCategory, []);
      rosterMap.get(def.badgeCategory).push(awardRecord);

      // ── Count holders per badge for rarity board ───────────────────────
      if (!rarityCounter.has(badgeId)) rarityCounter.set(badgeId, new Set());
      rarityCounter.get(badgeId).add(memberId);
    }

    // ── 4. Post-process: Annual Award Winners ────────────────────────────────
    yearlyAwards.sort(function(a, b) {
      if (b.year !== a.year) return b.year - a.year;         // newest year first
      return a.badgeName.localeCompare(b.badgeName);          // alpha within year
    });

    // ── 5. Post-process: Category Leaders ────────────────────────────────────
    // Flatten leaderMap into an ordered array. GENRE_EXPLORER aggregates to
    // a single best-tier record across all its per-genre slots.
    const HOF_CATEGORY_DISPLAY_ORDER = [
      'PAGE_MILESTONE', 'BOOK_MILESTONE', 'STREAK_MILESTONE', 'PLOGGER',
      'REVIEW_MILESTONE', 'FAT_READ', 'GENRE_EXPLORER', 'GENRE_COLLECTOR',
      'ANNIVERSARY', 'SOCIAL_BUTTERFLY', 'LIBRARIAN'
    ];

    const categoryLeaders = HOF_CATEGORY_DISPLAY_ORDER.map(function(category) {
      const catSlots = leaderMap.get(category);
      if (!catSlots || catSlots.size === 0) return { category: category, leader: null };

      if (category !== 'GENRE_EXPLORER') {
        return { category: category, leader: catSlots.get(category) || null };
      }

      // GENRE_EXPLORER: pick the single highest-tier record across all genre slots
      let topRecord = null;
      catSlots.forEach(function(record) {
        if (!topRecord) { topRecord = record; return; }
        const isBetter = record.badgeTier > topRecord.badgeTier
          || (record.badgeTier === topRecord.badgeTier
              && parseArkaDateForSort_(record.awardedDate)
                 < parseArkaDateForSort_(topRecord.awardedDate));
        if (isBetter) topRecord = record;
      });
      return { category: category, leader: topRecord };
    });

    // ── 6. Post-process: Badge Roster ────────────────────────────────────────
    // Sort each category's list: tier desc, then earliest-earner first on ties.
    const badgeRoster = {};
    rosterMap.forEach(function(awards, category) {
      awards.sort(function(a, b) {
        if (b.badgeTier !== a.badgeTier) return b.badgeTier - a.badgeTier;
        return parseArkaDateForSort_(a.awardedDate) - parseArkaDateForSort_(b.awardedDate);
      });
      badgeRoster[category] = awards;
    });

    // ── 7. Post-process: Rarity Board ────────────────────────────────────────
    // Include only badges with ≥1 holder. Exclude YEARLY and SPECIAL.
    // Sort holder-count asc; break ties by tier desc (higher achievements first).
    const HOF_RARITY_BOARD_LIMIT = 10;
    const rarityBoard = [];
    rarityCounter.forEach(function(memberSet, badgeId) {
      const def = badgeDefMap.get(badgeId);
      if (!def) return;
      if (def.badgeCategory === 'YEARLY' || def.badgeCategory === 'SPECIAL') return;
      rarityBoard.push({
        badgeId      : badgeId,
        badgeName    : def.badgeName,
        badgeCategory: def.badgeCategory,
        badgeTier    : def.badgeTier,
        holderCount  : memberSet.size
      });
    });
    rarityBoard.sort(function(a, b) {
      if (a.holderCount !== b.holderCount) return a.holderCount - b.holderCount;
      return b.badgeTier - a.badgeTier; // tie: higher tier shown first
    });

    // ── 8. Post-process: Special Badges ──────────────────────────────────────
    specialAwards.sort(function(a, b) {
      return parseArkaDateForSort_(b.awardedDate) - parseArkaDateForSort_(a.awardedDate);
    });

    // ── 9. Club Pulse + Club Records ─────────────────────────────────────────

    // ── 9a. Heaviest Single Book — join MemberShelfDB + ArkaLibraryDB ─────
    // Finds the highest-page-count book any member has marked as Finished.
    // Uses only the columns needed: bookId + pages from Library, memberId +
    // bookId + status from Shelf. getDataRange() is safe here — both tables
    // are small (hundreds of rows).

    /** @type {Map<string, {title: string, pages: number}>} bookId → book info */
    const hofBookPagesMap = new Map();
    const libSheet  = ss.getSheetByName(LIBRARY_SHEET);
    const libRows   = libSheet ? libSheet.getDataRange().getValues() : [];
    for (let i = 1; i < libRows.length; i++) {
      const bookId    = (libRows[i][0] || '').toString().trim();  // Col A
      const bookTitle = (libRows[i][1] || '').toString().trim();  // Col B
      const bookPages = Number(libRows[i][4]) || 0;               // Col E
      if (bookId && bookPages > 0) {
        hofBookPagesMap.set(bookId, { title: bookTitle, pages: bookPages });
      }
    }

    /** @type {{holderId: string, holderName: string, pages: number, bookTitle: string}|null} */
    let hofHeaviestBookHolder  = null;
    let hofShelfFinishedCount  = 0;   // live total: every member's Finished record counts once
    const shelfSheet  = ss.getSheetByName(SHELF_SHEET);
    const shelfRows   = shelfSheet ? shelfSheet.getDataRange().getValues() : [];
    for (let i = 1; i < shelfRows.length; i++) {
      const shelfMemberId = (shelfRows[i][1] || '').toString().trim();  // Col B
      const shelfBookId   = (shelfRows[i][2] || '').toString().trim();  // Col C
      const shelfStatus   = (shelfRows[i][3] || '').toString().trim();  // Col D
      if (shelfStatus !== 'Finished') continue;

      hofShelfFinishedCount++; // count every Finished record — cross-member, no dedup

      const bookInfo = hofBookPagesMap.get(shelfBookId);
      if (!bookInfo || bookInfo.pages === 0) continue;

      if (!hofHeaviestBookHolder || bookInfo.pages > hofHeaviestBookHolder.pages) {
        const holderName = memberNameMap.get(shelfMemberId) || shelfMemberId;
        hofHeaviestBookHolder = {
          holderId  : shelfMemberId,
          holderName: holderName,
          pages     : bookInfo.pages,
          bookTitle : bookInfo.title
        };
      }
    }

    // Club Pulse — raw totals; frontend handles display formatting
    const clubPulse = {
      totalPages : Math.round(hofClubTotalPages),
      totalBooks : hofShelfFinishedCount,  // live from MemberShelfDB — each member's Finished counts once
      totalAP    : Math.round(hofClubTotalAP)
    };

    // Pull STREAK_MILESTONE and GENRE_COLLECTOR leaders from the already-built
    // leaderMap — they are the all-time record holders for those categories.
    const streakSlots          = leaderMap.get('STREAK_MILESTONE');
    const hofStreakLeader      = streakSlots
      ? (streakSlots.get('STREAK_MILESTONE') || null) : null;

    const genreCollectorSlots    = leaderMap.get('GENRE_COLLECTOR');
    const hofGenreCollectorLeader = genreCollectorSlots
      ? (genreCollectorSlots.get('GENRE_COLLECTOR') || null) : null;

    /**
     * Club Records: up to 5 absolute superlatives.
     * Only push records where a genuine holder with a value > 0 exists.
     * valueDisplay is pre-formatted so the frontend renders it without logic.
     *
     * @type {Array<{
     *   icon: string, label: string, valueDisplay: string,
     *   holderName: string, holderId: string
     * }>}
     */
    const clubRecords = [];

    if (hofMaxPagesHolder && hofMaxPagesHolder.value > 0) {
      clubRecords.push({
        icon        : '📖',
        label       : 'Most Pages Read',
        valueDisplay: formatHofNumber_(hofMaxPagesHolder.value) + ' pages',
        holderName  : hofMaxPagesHolder.holderName,
        holderId    : hofMaxPagesHolder.holderId
      });
    }
    if (hofMaxBooksHolder && hofMaxBooksHolder.value > 0) {
      clubRecords.push({
        icon        : '📚',
        label       : 'Most Books Finished',
        valueDisplay: formatHofNumber_(hofMaxBooksHolder.value) + ' books',
        holderName  : hofMaxBooksHolder.holderName,
        holderId    : hofMaxBooksHolder.holderId
      });
    }
    if (hofMaxApHolder && hofMaxApHolder.value > 0) {
      clubRecords.push({
        icon        : '☀',
        label       : 'Highest AP Earned',
        valueDisplay: formatHofNumber_(hofMaxApHolder.value) + ' Arka Points',
        holderName  : hofMaxApHolder.holderName,
        holderId    : hofMaxApHolder.holderId
      });
    }
    if (hofStreakLeader) {
      clubRecords.push({
        icon        : '🔥',
        label       : 'Longest Reading Streak',
        valueDisplay: hofStreakLeader.badgeName,
        holderName  : hofStreakLeader.memberDisplayName,
        holderId    : hofStreakLeader.memberId
      });
    }
    if (hofGenreCollectorLeader) {
      clubRecords.push({
        icon        : '🎭',
        label       : 'Most Genres Explored',
        valueDisplay: hofGenreCollectorLeader.badgeName,
        holderName  : hofGenreCollectorLeader.memberDisplayName,
        holderId    : hofGenreCollectorLeader.memberId
      });
    }

    // 6th record: Heaviest Single Book — only pushed when a Finished shelf
    // record with a valid page count was found in the join above.
    if (hofHeaviestBookHolder && hofHeaviestBookHolder.pages > 0) {
      var heavyDisplay = formatHofNumber_(hofHeaviestBookHolder.pages) + ' pages';
      if (hofHeaviestBookHolder.bookTitle) {
        heavyDisplay += ' \u00b7 ' + hofHeaviestBookHolder.bookTitle;
      }
      clubRecords.push({
        icon        : '🧱',
        label       : 'Heaviest Single Book',
        valueDisplay: heavyDisplay,
        holderName  : hofHeaviestBookHolder.holderName,
        holderId    : hofHeaviestBookHolder.holderId
      });
    }

    return {
      status             : 'success',
      annualAwardWinners : yearlyAwards,
      categoryLeaders    : categoryLeaders,
      badgeRoster        : badgeRoster,
      rarityBoard        : rarityBoard.slice(0, HOF_RARITY_BOARD_LIMIT),
      specialBadges      : specialAwards,
      clubPulse          : clubPulse,    // Phase 3: hero Club Pulse band
      clubRecords        : clubRecords   // Phase 3: Club Records section
    };

  } catch (err) {
    console.error('getHallOfFameData failed:', err);
    return { status: 'error', message: err.toString() };
  }
}


/**
 * PRIVATE HELPER — Converts a dd-MMM-yyyy date string to epoch milliseconds
 * for use in numeric sort comparisons (a - b).
 *
 * Self-contained — no dependency on MasterEngine. Handles native Date objects
 * (returned by GAS when Sheets auto-parses a date cell) and the dd-MMM-yyyy
 * string format written by all Arka write functions via Utilities.formatDate().
 * Returns 0 on null or unrecognised input so unknown dates sort before all
 * real dates without throwing.
 *
 * @param  {string|Date} dateVal - e.g. '15-Jan-2026' or a native Date object.
 * @returns {number} Epoch milliseconds, or 0 on failure.
 */
function parseArkaDateForSort_(dateVal) {
  if (!dateVal) return 0;
  if (dateVal instanceof Date) return dateVal.getTime();

  var MONTH_INDEX = {
    Jan:0, Feb:1, Mar:2, Apr:3, May:4,  Jun:5,
    Jul:6, Aug:7, Sep:8, Oct:9, Nov:10, Dec:11
  };
  var parts = dateVal.toString().match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (!parts) return 0;
  var month = MONTH_INDEX[parts[2]];
  if (month === undefined) return 0;
  return new Date(parseInt(parts[3], 10), month, parseInt(parts[1], 10)).getTime();
}

/**
 * PRIVATE HELPER — Formats an integer with comma thousand-separators.
 * Used by getHallOfFameData() to produce human-readable value strings
 * for Club Records (e.g., 52480 → "52,480").
 *
 * @param  {number} n - The number to format.
 * @returns {string} Comma-formatted integer string.
 */
function formatHofNumber_(n) {
  return Math.round(Number(n) || 0)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Generates a Goodreads-compatible CSV export for a curated list of shelf records.
 *
 * Called by the admin-only Export panel in the Me tab. The frontend builds the curated
 * list (date-filtered + shelf-filtered + manual overrides) and sends the final set of
 * shelfIds. The backend validates membership, joins with ArkaLibraryDB, and builds the CSV.
 * No date filtering is performed server-side — the frontend owns that logic entirely.
 *
 * CSV format mirrors Goodreads' own export: separate ISBN / ISBN13 columns, ISBN13 values
 * pre-formatted with ="..." text-force notation so spreadsheet apps treat them as text.
 *
 * @param {string} requestingMemberId - The memberId of the admin making the request.
 * @param {string} shelfIdsJson       - JSON array of shelfId strings to export,
 *                                      e.g. '["ARKA_SHELF_1","ARKA_SHELF_5"]'.
 * @returns {string} CSV content as a raw string, or "ERROR: <message>" on failure.
 */
function generateGoodreadsExportCsv(requestingMemberId, shelfIdsJson) {

  // ── 1. Admin guard ────────────────────────────────────────────────────────
  var ADMIN_IDS_BACKEND = ['ARKA_MEMBER_1']; // Keep in sync with ADMIN_MEMBER_IDS in HTML
  if (!ADMIN_IDS_BACKEND.includes(requestingMemberId)) {
    return 'ERROR: Unauthorised — admin access required.';
  }

  // ── 2. Parse the curated shelf ID list ────────────────────────────────────
  var requestedShelfIds;
  try {
    requestedShelfIds = JSON.parse(shelfIdsJson);
    if (!Array.isArray(requestedShelfIds) || requestedShelfIds.length === 0) {
      return 'ERROR: No shelf records selected for export.';
    }
  } catch (e) {
    return 'ERROR: Invalid shelf ID list.';
  }
  var requestedShelfIdSet = new Set(requestedShelfIds);

  // ── 3. Build ArkaLibraryDB lookup map keyed by bookId ────────────────────
  var ss           = SpreadsheetApp.openById(SPREADSHEET_ID);
  var librarySheet = ss.getSheetByName(LIBRARY_SHEET);
  var libraryData  = librarySheet.getRange(1, 1, librarySheet.getLastRow(), 13).getValues();

  /** @type {Object.<string, Object>} bookId → book metadata */
  var libraryMap = {};
  for (var li = 1; li < libraryData.length; li++) {
    var lRow = libraryData[li];
    if (!lRow[0]) continue;

    // Pre-format isbn13 in Goodreads' ="..." text-force notation.
    // Mirrors GR's own CSV export format so their importer recognises the field,
    // and prevents spreadsheet apps from converting 13-digit numbers to scientific notation.
    // csvCell_('=""9780385545068""') → "=""9780385545068""" in the raw CSV file.
    var rawIsbn13 = String(lRow[10] || '').trim();
    libraryMap[lRow[0]] = {
      title         : lRow[1]  || '',
      author        : lRow[2]  || '',
      pages         : lRow[4]  || '',
      isbn13        : rawIsbn13 ? ('=""' + rawIsbn13 + '""') : '',
      publishedDate : lRow[11] || ''
    };
  }

  // ── 4. Scan MemberShelfDB for the requested records ───────────────────────
  /**
   * Maps Arka shelf statuses to Goodreads exclusive shelf names.
   * GR supports "did-not-finish" as a native default shelf (April 2026).
   * @type {Object.<string, string>}
   */
  var GR_SHELF_STATUS_MAP = {
    'Finished'       : 'read',
    'Reading'        : 'currently-reading',
    'To Read'        : 'to-read',
    'Did Not Finish' : 'did-not-finish'
  };

  var shelfSheet = ss.getSheetByName(SHELF_SHEET);
  var shelfData  = shelfSheet.getRange(1, 1, shelfSheet.getLastRow(), 11).getValues();

  /** @type {Array.<Object>} Rows that passed all checks, ready for CSV writing. */
  var exportRows = [];

  for (var si = 1; si < shelfData.length; si++) {
    var sRow    = shelfData[si];
    if (!sRow[0]) continue;

    var shelfId = sRow[0];
    if (!requestedShelfIdSet.has(shelfId)) continue;

    // Security: every requested record must belong to the requesting member.
    // Prevents a malicious caller from exfiltrating other members' shelf data.
    if (sRow[1] !== requestingMemberId) continue;

    var shelfBookId = sRow[2];
    var bookMeta    = libraryMap[shelfBookId];
    if (!bookMeta) continue; // Orphaned shelf record — book not in library

    var dateFinishedTs  = parseArkaDateForSort_(sRow[8]); // Col I — dateFinished
    var dateAddedTs     = parseArkaDateForSort_(sRow[6]); // Col G — dateAdded
    var dateReadForCsv  = dateFinishedTs ? formatDateForGoodreads_(dateFinishedTs) : '';
    var dateAddedForCsv = dateAddedTs    ? formatDateForGoodreads_(dateAddedTs)    : '';

    exportRows.push({
      title         : bookMeta.title,
      author        : bookMeta.author,
      isbn13        : bookMeta.isbn13,  // already pre-formatted as ="..." by libraryMap build
      grShelf       : GR_SHELF_STATUS_MAP[sRow[3]] || 'to-read',
      myRating      : Number(sRow[4]) || 0,               // Col E — 0 = unrated
      myReview      : (sRow[5] || '').replace(/"/g, '""').replace(/\n/g, ' '), // Col F — CSV-escaped
      dateRead      : dateReadForCsv,
      dateAdded     : dateAddedForCsv,
      numberOfPages : bookMeta.pages        || '',
      yearPublished : bookMeta.publishedDate || ''
    });
  }

  if (exportRows.length === 0) {
    return 'ERROR: No qualifying books found. The selected books may not exist in the library.';
  }

  // ── 5. Build CSV string ───────────────────────────────────────────────────
  /**
   * Wraps a value in double-quotes for CSV safety.
   * Inner double-quotes must be pre-escaped by callers (review field uses this).
   * @param {string|number} val
   * @returns {string}
   */
  function csvCell_(val) {
    return '"' + String(val === null || val === undefined ? '' : val) + '"';
  }

  // Column order mirrors Goodreads' own CSV export format.
  // ISBN (10-digit) is left blank — Arka stores ISBN-13 only.
  // ISBN13 uses the ="..." text-force notation (already applied in libraryMap build above).
  // Bookshelves carries the exclusive shelf value (read/currently-reading/to-read/did-not-finish).
  var CSV_HEADERS = [
    'Title', 'Author', 'ISBN', 'ISBN13', 'My Rating', 'Average Rating',
    'Publisher', 'Binding', 'Year Published', 'Original Publication Year',
    'Date Read', 'Date Added', 'Bookshelves', 'My Review'
  ];

  var csvLines = [CSV_HEADERS.join(',')];

  exportRows.forEach(function(row) {
    csvLines.push([
      csvCell_(row.title),
      csvCell_(row.author),
      csvCell_(''),                                       // ISBN (10-digit) — not stored in Arka
      csvCell_(row.isbn13),                               // ISBN13 — ="..." pre-formatted
      csvCell_(row.myRating === 0 ? '' : row.myRating),  // blank for unrated (GR ignores 0)
      csvCell_(''),                                       // Average Rating — GR ignores on import
      csvCell_(''),                                       // Publisher — not in ArkaLibraryDB
      csvCell_(''),                                       // Binding  — not in ArkaLibraryDB
      csvCell_(row.yearPublished),
      csvCell_(''),                                       // Original Publication Year
      csvCell_(row.dateRead),
      csvCell_(row.dateAdded),
      csvCell_(row.grShelf),                              // Bookshelves = exclusive shelf slot
      csvCell_(row.myReview)
    ].join(','));
  });

  return csvLines.join('\n');
}


/**
 * PRIVATE HELPER — Converts a Unix ms timestamp to the yyyy/mm/dd format
 * expected by Goodreads CSV import.
 *
 * @param  {number} ts - Unix ms timestamp (from parseArkaDateForSort_).
 * @returns {string} Date string in "yyyy/mm/dd" format.
 */
function formatDateForGoodreads_(ts) {
  if (!ts) return '';
  var d   = new Date(ts);
  var yr  = d.getFullYear();
  var mo  = String(d.getMonth() + 1).padStart(2, '0');
  var day = String(d.getDate()).padStart(2, '0');
  return yr + '-' + mo + '-' + day;
}


// Return latest APP Version as string
function getAppVersion() { return APP_VERSION; }

/**
 * Returns all rows from QuotesDB so the frontend can maintain a
 * Fisher-Yates shuffle queue — guaranteeing all quotes are shown
 * before any repeat occurs.
 *
 * Each row is: { quote: string, book: string, author: string }
 * Returns an empty array on any error so the caller degrades gracefully.
 *
 * @returns {Array<{quote:string, book:string, author:string}>}
 */
function getAllQuotes() {
  try {
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('QuotesDB');
    if (!sheet) return [];

    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return []; // Header-only or empty sheet

    // Slice off the header row and map to typed objects
    return data.slice(1).map(function(row) {
      return {
        quote  : (row[0] || '').toString().trim(),  // Col A — Quote text
        book   : (row[1] || '').toString().trim(),  // Col B — Book title
        author : (row[2] || '').toString().trim()   // Col C — Author name
      };
    }).filter(function(q) { return q.quote.length > 0; }); // Drop blank rows

  } catch (e) {
    console.warn('getAllQuotes: failed to load QuotesDB:', e);
    return [];
  }
}

/**
 * 13. Lightweight Activity Fetcher (For Multiplayer Sync)
 * When a user hits "Sync" on the Home Feed, it only fetches this small piece of data 
 * instead of the whole database to save time and processing power.
 */
function getLatestActivityLog() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName("ActivityLogDB");
  const SYNC_FETCH_LIMIT = 200; // Sync only needs recent entries
  
  const totalRows = sheet.getLastRow();
  if (totalRows < 2) return [];
  
  const startRow = Math.max(2, totalRows - SYNC_FETCH_LIMIT + 1);
  const rowCount = totalRows - startRow + 1;
  const data = sheet.getRange(startRow, 1, rowCount, 7).getValues();
  
  let logList = [];
  for (let i = 0; i < data.length; i++) {
    if (data[i][0]) {
      logList.push({
        activityID:        data[i][0],
        activityTypeID:    data[i][1],
        activityDate:      data[i][2],
        activityMemberID:  data[i][3],
        activityDesc:      data[i][4] || "",
        activitySource:    data[i][5] || "",
        activityCPAwarded: Number(data[i][6]) || 0
      });
    }
  }
  return logList;
}

/**
 * PRIVATE HELPER: Validates the active session and returns the Member ID.
 * Uses CacheService so the sheet is only scanned once per 6-minute window,
 * not on every individual write operation within a session.
 * @returns {string|null} The ARKA_MEMBER_ID or null if not found.
 */
function getVerifiedMemberId() {
  const email = Session.getActiveUser().getEmail().toLowerCase();

  // 1. Cache check — only APPROVED members are ever written here, so a cache
  //    hit is itself proof of approval and needs no sheet read. Non-approved
  //    callers always fall through to a fresh scan, keeping status changes
  //    effectively immediate for them.
  const cache = CacheService.getUserCache();
  const CACHE_KEY = "verified_member_id_" + email.replace(/[^a-z0-9]/g, "_");
  const cachedId = cache.get(CACHE_KEY);

  if (cachedId) {
    return cachedId; // Cache hit — known-approved member
  }

  // 2. Cache miss — full scan once.
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(MEMBERS_SHEET);
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    const storedEmails = data[i][1].toString().toLowerCase().split(',');
    if (storedEmails.map(e => e.trim()).includes(email)) {

      // ── Approval gate ──────────────────────────────────────────────────────
      // Col T must be exactly 'Approved'. Pending / Rejected / blank are denied,
      // even though the caller is a valid authenticated Google user.
      const approvalState = (data[i][MEMBER_APPROVAL_COL_INDEX] || '').toString().trim();
      if (approvalState !== APPROVAL_STATUS.APPROVED) {
        return null;
      }

      const memberId = data[i][0];
      cache.put(CACHE_KEY, memberId, 360); // 6-min TTL; only approved IDs cached
      return memberId;
    }
  }
  return null;
}

/**
 * PRIVATE HELPER: Normalizes a title for duplicate checking.
 * Strips punctuation and leading articles (The, A, An).
 */
function normalizeTitleInternal(title) {
  if (!title) return "";
  return title.toString().toLowerCase()
    .replace(/[^\w\s]/g, '')        // Strip punctuation
    .replace(/^(the|a|an)\s+/g, '') // Strip leading articles
    .replace(/\s+/g, ' ')           // Condense spaces
    .trim();
}

/**
 * Validates the session, writes the feedback row to FeedbackDB, optionally
 * uploads a screenshot to Drive, and logs ARKA_ACTTYP_FEEDBACK activity.
 *
 * FeedbackDB columns written:
 *   A: Timestamp | B: MemberID | C: MemberName | D: AppVersion
 *   E: Category  | F: Section  | G: Description | H: Status
 *   I: ScreenshotURL (empty string when no screenshot provided)
 *
 * Screenshot upload follows the same Drive blob pattern as profile pics and
 * badge images: base64 → Utilities.base64Decode → Blob → folder.createFile →
 * thumbnail URL. Each submission gets a unique filename so no prior screenshot
 * is ever overwritten.
 *
 * @param  {Object}  data
 * @param  {string}  data.memberId           - ARKA_MEMBER_X (display only; session ID used for auth)
 * @param  {string}  data.memberName         - Display name for FeedbackDB record
 * @param  {string}  data.category           - 'Bug' | 'Feature' | 'Question' | 'Praise'
 * @param  {string}  data.section            - App area selected from the dropdown
 * @param  {string}  data.description        - Free-text body (min 5 chars, validated client-side)
 * @param  {Object}  data.activityPointsMap  - { activityTypeID: cpValue } for AP award
 * @param  {string}  [data.clientTzOffset]   - Client timezone offset string for timestamp
 * @param  {string}  [data.screenshotBase64] - Optional base64 data-URI of attached screenshot
 * @returns {{ status: string, newActivity?: Object, message?: string }}
 */
function saveUserFeedback(data) {
  // Verify session before any write. All DB records and point awards use the
  // session-verified ID so the feedback author is always the authenticated user.
  const verifiedMemberId = getVerifiedMemberId();
  if (!verifiedMemberId) return { status: 'error', message: 'Unauthorized session.' };

  try {
    const ss            = SpreadsheetApp.openById(SPREADSHEET_ID);
    const feedbackSheet = ss.getSheetByName(FEEDBACK_SHEET);

    // Build timestamp using the member's local timezone so FeedbackDB records
    // reflect the actual hour the feedback was submitted.
    const feedbackTzOffset = (data.clientTzOffset || '').toString().trim();
    const timestamp        = buildArkaTimestamp_(feedbackTzOffset);

    // ── Optional screenshot upload ─────────────────────────────────────────
    // Follows the identical blob pattern used by profile pics and badge images.
    // Unique filename per submission prevents collisions between multiple
    // feedbacks from the same member.
    let screenshotUrl = '';
    if (data.screenshotBase64) {
      try {
        const folder         = DriveApp.getFolderById(FEEDBACK_IMAGES_FOLDER_ID);
        // Strip the data:image/...;base64, header before decoding
        const rawBase64      = data.screenshotBase64.indexOf(',') !== -1
                                 ? data.screenshotBase64.split(',')[1]
                                 : data.screenshotBase64;
        // Build a unique filename: {memberId}_{epochMs}_feedback.jpg
        const epochMs        = Date.now();
        const screenshotName = verifiedMemberId + '_' + epochMs + '_feedback.jpg';
        const blob           = Utilities.newBlob(
                                 Utilities.base64Decode(rawBase64),
                                 'image/jpeg',
                                 screenshotName
                               );
        const uploadedFile   = folder.createFile(blob);
        // Standard thumbnail URL — same sz parameter used across the app
        screenshotUrl = 'https://drive.google.com/thumbnail?id=' + uploadedFile.getId() + '&sz=w800';
      } catch (imgErr) {
        // Non-fatal: screenshot upload failure should not block feedback submission
        console.warn('saveUserFeedback: screenshot upload failed — ' + imgErr.message);
      }
    }

    // ── Write feedback row (9 columns) ────────────────────────────────────
    feedbackSheet.appendRow([
      timestamp,                              // Col A: Timestamp
      verifiedMemberId,                       // Col B: MemberID
      data.memberName,                        // Col C: MemberName
      'ArkaClubApp ' + APP_VERSION,           // Col D: AppVersion
      data.category,                          // Col E: Category
      data.section,                           // Col F: Section
      data.description,                       // Col G: Description
      'Open',                                 // Col H: Status
      screenshotUrl                           // Col I: ScreenshotURL (empty string if none)
    ]);

    // ── Activity point award ───────────────────────────────────────────────
    let newActivity = null;
    try {
      newActivity = logActivityBatch(
        verifiedMemberId,
        [{ typeId: 'ARKA_ACTTYP_FEEDBACK', val: 1, desc: `${data.category} in ${data.section}` }],
        1, '', data.activityPointsMap || {},
        null,             // ss — open internally
        false,            // skipLock — no caller-held lock
        feedbackTzOffset
      )[0] || null;
    } catch (actErr) {
      console.error('saveUserFeedback: activity log failed but feedback was saved — ' + actErr.message);
    }

    return { status: 'success', newActivity: newActivity };

  } catch (e) {
    console.error('saveUserFeedback error: ' + e.toString());
    return { status: 'error', message: e.toString() };
  }
}

/**
 * logShareProgress()
 *
 * Writes a single ARKA_ACTTYP_SHAREPROGRESS entry to ActivityLogDB when a
 * member shares their reading stats card via WhatsApp. Called fire-and-forget
 * from _executeWAShare_() in the client once the share is initiated.
 *
 * Idempotency note: multiple calls are possible if the member shares several
 * times. Each share legitimately earns its first-time CP via the multiplier map
 * (MasterEngine applies CP rules), so repeated calls are intentional.
 *
 * @param  {string} memberId          - ARKA_MEMBER_X of the sharing member.
 * @param  {Object} activityPointsMap - { activityTypeID: cpValue } from ActivityTypeDB.
 * @returns {{ status: string, newActivity?: Object }}
 */
function logShareProgress(memberId, activityPointsMap, clientTzOffset) {
  if (!memberId) return { status: 'error', message: 'Missing memberId' };

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    console.warn('logShareProgress: lock unavailable for ' + memberId);
    return { status: 'busy' };
  }

  try {
    var ss       = SpreadsheetApp.openById(SPREADSHEET_ID);
    var actSheet = ss.getSheetByName('ActivityLogDB');
    if (!actSheet) return { status: 'error', message: 'ActivityLogDB sheet not found' };

    var actData = actSheet.getDataRange().getValues();

    // Derive next sequential activity ID from the last row
    var lastId  = (actData.length > 1 ? actData[actData.length - 1][0] : '').toString();
    var lastNum = parseInt((lastId.split('_')[2] || '0'), 10);
    if (isNaN(lastNum)) lastNum = 0;
    var newActId = 'ARKA_ACT_' + (lastNum + 1);

    // CP value from the live ActivityTypeDB multiplier map sent by the client.
    // Falls back to 0 if SHAREPROGRESS is not yet in ActivityTypeDB.
    var cp = (activityPointsMap && activityPointsMap['ARKA_ACTTYP_SHAREPROGRESS'])
              ? Number(activityPointsMap['ARKA_ACTTYP_SHAREPROGRESS'])
              : 0;

    var actDate = buildArkaTimestamp_(clientTzOffset);

    actSheet.appendRow([
      newActId,
      'ARKA_ACTTYP_SHAREPROGRESS',
      actDate,
      memberId,
      'Reading stats shared via WhatsApp',
      'ArkaClubApp',
      cp
    ]);

    console.log('logShareProgress: logged ' + newActId + ' for ' + memberId + ' (' + cp + ' CP)');

    return {
      status     : 'success',
      newActivity: {
        activityID       : newActId,
        activityTypeID   : 'ARKA_ACTTYP_SHAREPROGRESS',
        activityCPAwarded: cp
      }
    };
  } catch (err) {
    console.error('logShareProgress failed:', err);
    return { status: 'error', message: err.toString() };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Fetches all Active posts for a specific book, sorted newest first.
 * @param {string} bookId - The ARKA_BOOK_X to fetch posts for.
 * @returns {Array} Array of post objects.
 */
function getBookPosts(bookId) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(BOOK_POST_SHEET);
  if (!sheet) return [];

  const data = sheet.getDataRange().getValues();
  let posts = [];

  for (let i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    if (data[i][1].toString() !== bookId) continue;
    if (data[i][6].toString() !== "Active") continue;

    posts.push({
      postId:    data[i][0].toString(),
      bookId:    data[i][1].toString(),
      memberId:  data[i][2].toString(),
      timestamp: data[i][3].toString(),
      postType:  data[i][4].toString(),
      content:   data[i][5].toString(),
      status:    data[i][6].toString(),
      likeCount: Number(data[i][7]) || 0
    });
  }

  // Rows are appended in order — reversing gives newest first without sorting
  posts.reverse();
  return posts;
}

/**
 * Saves a new post to BookPostDB.
 * @param {Object} postData - {bookId, postType, content}
 * @returns {Object} {status, newPost}
 */
function saveBookPost(postData) {
  // ── Auth + validation before the lock — no point holding the lock for rejections ──
  const currentMemberId = getVerifiedMemberId();
  if (!currentMemberId) return { status: "error", message: "Unauthorized." };

  const content = (postData.content || "").trim();
  // 20-character minimum requires a complete thought — prevents placeholder
  // or acknowledgement posts that add noise to book discussion threads.
  if (!content || content.length < 20) {
    return { status: "error", message: "Post content must be at least 20 characters." };
  }

  // ── Lock: prevents duplicate ARKA_BOOKPOST_X IDs under rapid/concurrent submits ──
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(8000)) {
    return { status: "error", message: "System is currently busy. Please try again." };
  }
  try {

  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(BOOK_POST_SHEET);
  if (!sheet) return { status: "error", message: "BookPostDB sheet not found." };

  // Single-cell ID read — avoids a full getDataRange() scan that duplicates IDs under load.
  const lastPostRow = sheet.getLastRow();
  let newNum = 1;
  if (lastPostRow >= 2) {
    const lastId  = sheet.getRange(lastPostRow, 1).getValue().toString();
    const lastNum = parseInt(lastId.split('_')[2], 10);
    if (!isNaN(lastNum)) newNum = lastNum + 1;
  }
  const postId = "ARKA_BOOKPOST_" + newNum;
  const postTzOffset = (postData.clientTzOffset || '').toString().trim();
  const timestamp    = buildArkaTimestamp_(postTzOffset);

  // Whitelist postType against known values — prevents arbitrary strings from
  // being stored in BookPostDB and rendering unexpectedly in the feed renderer.
  const VALID_POST_TYPES = ['General Note', 'Quote I Loved', 'Fan Cast'];
  const safePostType = VALID_POST_TYPES.includes(postData.postType)
    ? postData.postType
    : 'General Note';

  sheet.appendRow([
    postId,
    postData.bookId,
    currentMemberId,
    timestamp,
    safePostType,
    content,
    "Active",
    0
  ]);

  let newActivity = null;
  try {
    // desc format: "postId|bookId" — allows feed renderer to resolve the book
    // directly from booksMap without needing globalBookPostsDB to be loaded.
    // Legacy rows with desc = postId only are handled by fallback in the renderer.
    newActivity = logActivityBatch(
      currentMemberId,
      [{ typeId: 'ARKA_ACTTYP_BOOKPOST', val: 1, desc: postId + '|' + postData.bookId }],
      1, '', postData.activityPointsMap || {},
      ss,    // reuse already-open spreadsheet — avoids a redundant openById
      true,  // skipLock — outer saveBookPost already holds the script lock
      postTzOffset
    )[0] || null;
  } catch(e) {}

  return {
      status: "success",
      newActivity: newActivity,
      newPost: {
        postId:    postId,
        bookId:    postData.bookId,
        memberId:  currentMemberId,
        timestamp: timestamp,
        postType:  safePostType,
        content:   content,
        status:    "Active",
        likeCount: 0
      }
    };

  } finally {
    lock.releaseLock();
  }
}

/**
 * Increments the LikeCount for a specific post by 1.
 * Session-verified — only registered members can like.
 * Fire-and-forget — frontend does not wait for this response.
 *
 * @param {string} postId - The ARKA_BOOKPOST_X to like.
 */
function incrementPostLike(postId) {
  // Security gate: only registered Arka members may like posts.
  // Unregistered Google users calling this directly are rejected silently.
  const currentMemberId = getVerifiedMemberId();
  if (!currentMemberId) return; // Silent reject — fire-and-forget callers ignore return value

  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('BookPostDB');
  if (!sheet) return;

  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0].toString() !== postId.toString()) continue;
    // Do not allow liking deleted posts
    if (data[i][6].toString() === 'Deleted') return;
    // Prevent self-likes — post author cannot like their own post.
    // data[i][2] is Col C of BookPostDB: the MemberID of the post author.
    if (data[i][2].toString() === currentMemberId) return;
    const currentLikes = Number(data[i][7]) || 0;
    sheet.getRange(i + 1, 8).setValue(currentLikes + 1);
    return;
  }
}

/**
 * Edits the content of an existing book post.
 * Only the original author can edit their own post.
 * @param {Object} postData - {postId, newContent}
 */
function editBookPost(postData) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(BOOK_POST_SHEET);
  if (!sheet) return { status: "error", message: "BookPostDB not found." };

  const currentMemberId = getVerifiedMemberId();
  if (!currentMemberId) return { status: "error", message: "Unauthorized." };

  const newContent = (postData.newContent || "").trim();
  // Enforce the same 20-character floor as saveBookPost() — prevents a member
  // from posting a valid 20-char post then editing it down to a stub.
  if (!newContent || newContent.length < 20) {
    return { status: "error", message: "Post content must be at least 20 characters." };
  }

  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0].toString() !== postData.postId.toString()) continue;

    // Security check — only the author can edit
    if (data[i][2].toString() !== currentMemberId) {
      return { status: "error", message: "You can only edit your own posts." };
    }

    sheet.getRange(i + 1, 6).setValue(newContent); // Col F: Content
    return { status: "success", updatedContent: newContent };
  }

  return { status: "error", message: "Post not found." };
}

/**
 * Soft-deletes a book post by setting its Status to "Deleted".
 * Only the original author can delete their own post.
 * @param {string} postId - The ARKA_BOOKPOST_X to delete.
 */
function deleteBookPost(postId) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(BOOK_POST_SHEET);
  if (!sheet) return { status: "error", message: "BookPostDB not found." };

  const currentMemberId = getVerifiedMemberId();
  if (!currentMemberId) return { status: "error", message: "Unauthorized." };

  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0].toString() !== postId.toString()) continue;

    if (data[i][2].toString() !== currentMemberId) {
      return { status: "error", message: "You can only delete your own posts." };
    }

    sheet.getRange(i + 1, 7).setValue("Deleted"); // Col G: Status
    return { status: "success" };
  }

  return { status: "error", message: "Post not found." };
}

/**
 * ADMIN ONLY: Soft-deletes any book post by postId, bypassing the ownership
 * check that the member-facing deleteBookPost() enforces. Sets status col G
 * to "Deleted". Only callable by members in ADMIN_MEMBER_IDS_BACKEND.
 */
function adminDeleteBookPost(postId) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(BOOK_POST_SHEET);
  if (!sheet) return { status: 'error', message: 'BookPostDB not found.' };

  const currentMemberId = getVerifiedMemberId();
  if (!currentMemberId || !isAdminMember(currentMemberId)) {
    return { status: 'error', message: 'Admin access required.' };
  }

  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0].toString() !== postId.toString()) continue;
    sheet.getRange(i + 1, 7).setValue('Deleted');
    return { status: 'success' };
  }

  return { status: 'error', message: 'Post not found.' };
}

/**
 * Helper: Gets the next sequential activity ID by reading only the last row's ID cell.
 * Saves reading the entire ActivityLogDB just to find the highest number.
 * @param {Sheet} logSheet - The ActivityLogDB sheet object.
 * @returns {number} The next activity number to use.
 */
function getNextActivityNumber(logSheet) {
  const lastRow = logSheet.getLastRow();
  if (lastRow < 2) return 1; // Sheet is empty (only header)
  
  // Read just the single ID cell from the last row — not the whole table
  const lastIdString = logSheet.getRange(lastRow, 1).getValue().toString();
  const lastNum = parseInt(lastIdString.split('_')[2]);
  return isNaN(lastNum) ? 1 : lastNum + 1;
}

/**
 * PRIVATE HELPER: Returns the next sequential PageLog ID number.
 * Reads only the last row's Col A — avoids a full getDataRange() scan
 * that would load every PageLog row just to extract one ID.
 * Same single-cell-read pattern as getNextActivityNumber().
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} pageLogSheet - The PageLogDB sheet object.
 * @returns {number} The next available sequential number for ARKA_PLOG_X.
 */
function getNextPageLogNumber_(pageLogSheet) {
  const lastRow = pageLogSheet.getLastRow();
  if (lastRow < 2) return 1; // Sheet is empty (header only)
  const lastIdString = pageLogSheet.getRange(lastRow, 1).getValue().toString();
  const lastNum      = parseInt(lastIdString.split('_')[2]);
  return isNaN(lastNum) ? 1 : lastNum + 1;
}

/**
 * PRIVATE HELPER: Returns the cp multiplier for a given activity type.
 *
 * Uses the client-provided map when available — no sheet read needed.
 * Falls back to a live ActivityTypeDB read for internal callers (e.g.
 * registerNewMember) that have no frontend context to pass a map.
 *
 * NOTE: ActivityClubPoints is now in Col B (index 1), moved from Col E (index 4).
 *
 * @param {string} activityTypeID   - e.g. 'ARKA_ACTTYP_BOOKREAD'
 * @param {Object} clientPointsMap  - globalActivityPointsMap from frontend
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss - Used only on fallback
 * @returns {number} The points multiplier value
 */
function getActivityMultiplier(activityTypeID, clientPointsMap, ss) {
  // Fast path — use the pre-built map sent from the frontend
  if (clientPointsMap && clientPointsMap[activityTypeID] !== undefined) {
    return Number(clientPointsMap[activityTypeID]) || 0;
  }
 
  // Fallback — read directly from sheet (internal callers with no client map)
  // ActivityClubPoints is now Col B (index 1)
  const actTypSheet = ss.getSheetByName('ActivityTypeDB');
  const typeData = actTypSheet.getRange(1,1,actTypSheet.getLastRow(),2).getValues();
  for (let i = 1; i < typeData.length; i++) {
    if (typeData[i][0] === activityTypeID) {
      return Number(typeData[i][1]) || 0;  // Col B (was Col E / index 4)
    }
  }
  return 0;
}

/**
 * PRIVATE HELPER: Checks whether a given member ID has admin privileges.
 * Used as a security gate before every badge write operation.
 *
 * @param   {string}  memberId - The ARKA_MEMBER_X to check
 * @returns {boolean}
 */
function isAdminMember(memberId) {
  return ADMIN_MEMBER_IDS_BACKEND.includes(memberId);
}

/**
 * ADMIN ONLY: Returns every member whose Col T is Pending, newest first, for
 * the Member Approvals modal.
 *
 * @returns {Object} { status:'success', members:[{id,displayName,email,joinDate}] }
 *                    | { status:'error'|'admin_required', message }
 */
function getPendingMembers() {
  const currentMemberId = getVerifiedMemberId();
  console.log(currentMemberId);
  if (!currentMemberId)                return { status: 'error', message: 'Unauthorized session.' };
  if (!isAdminMember(currentMemberId)) return { status: 'admin_required', message: 'Admin access required.' };
  try {
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(MEMBERS_SHEET);
    const data  = sheet.getDataRange().getValues();
    const pending = [];

    for (let i = 1; i < data.length; i++) {
      const approval = (data[i][MEMBER_APPROVAL_COL_INDEX] || '').toString().trim();
      if (approval === APPROVAL_STATUS.PENDING) {
        pending.push({
          id          : data[i][0],
          displayName : data[i][3],
          email       : (data[i][1] || '').toString().split(',')[0].trim(),
          joinDate    : (function() {
            // Col E: "dd-MMM-yyyy" — parseSheetTimestamp_ handles both native Date
            // objects (Sheets auto-parsed) and string form safely.
            var jd = parseSheetTimestamp_(data[i][4]);
            return !isNaN(jd.getTime())
              ? Utilities.formatDate(jd, Session.getScriptTimeZone(), 'dd-MMM-yyyy')
              : 'Unknown';
          })()
        });
      }
    }

    // Newest first — IDs are sequential, so sort by numeric suffix descending.
    pending.sort(function(a, b) {
      return (parseInt(b.id.split('_')[2], 10) || 0) - (parseInt(a.id.split('_')[2], 10) || 0);
    });
    console.log(pending);
    return { status: 'success', members: pending };
  } catch (err) {
    console.error('getPendingMembers failed:', err);
    return { status: 'error', message: 'Could not load pending members: ' + (err && err.message ? err.message : err) };
  }
}

/**
 * ADMIN ONLY: Sets a member's Col T to Approved or Rejected. Rejected rows are
 * KEPT (status flipped, not deleted) so the sequential ARKA_MEMBER_X pattern is
 * never broken. On approval, emails the member (non-fatal).
 *
 * Caveat: a Rejected member may retain access for up to the 6-min cache TTL,
 * because their session cache lives in their own UserCache which this admin
 * call cannot clear. Approval is effectively immediate (non-approved members
 * are never cached).
 *
 * @param {string} memberId  - ARKA_MEMBER_X to update.
 * @param {string} newStatus - 'Approved' or 'Rejected'.
 * @returns {Object} { status:'success', memberId, newStatus } | { status:'error'|'admin_required', message }
 */
function setMemberApprovalStatus(memberId, newStatus) {
  const currentMemberId = getVerifiedMemberId();
  if (!currentMemberId)                return { status: 'error', message: 'Unauthorized session.' };
  if (!isAdminMember(currentMemberId)) return { status: 'admin_required', message: 'Admin access required.' };

  if (newStatus !== APPROVAL_STATUS.APPROVED && newStatus !== APPROVAL_STATUS.REJECTED) {
    return { status: 'error', message: 'Invalid approval status.' };
  }
  if (!memberId) return { status: 'error', message: 'Missing member ID.' };

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return { status: 'error', message: 'System is currently busy. Please try again.' };
  }

  try {
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(MEMBERS_SHEET);
    const data  = sheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] !== memberId) continue;
      sheet.getRange(i + 1, MEMBER_APPROVAL_COL_NUMBER).setValue(newStatus);

      // On approval, send a personal welcome notice via AnnouncementDB.
      // This is in-app only (no email scope required). Non-fatal — any failure
      // here must never block the approval write above.
      if (newStatus === APPROVAL_STATUS.APPROVED) {
        const approvedDisplayName = (data[i][3] || '').toString().trim(); // Col D — DisplayName
        sendMemberWelcomeNotice_(memberId, approvedDisplayName);
      }

      // NOTE: member welcome email intentionally NOT sent here — delegated to the
      // separate BackEndEngine project to avoid the "send email as you" scope.
      return { status: 'success', memberId: memberId, newStatus: newStatus };
    }
    return { status: 'error', message: 'Member not found.' };
  } finally {
    lock.releaseLock();
  }
}


/**
 * PUBLIC: Clears the badge/level celebration fields in MemberDB Col N for the
 * calling member. Only clears `badges` and `newLevel` — preserves `personaShiftSeen`
 * so the persona card stays dismissed even after a badge/level card dismiss.
 *
 * Design:
 *   - memberId resolved from the session — never accepted from the caller.
 *   - Read-modify-write: removes badges/newLevel, keeps personaShiftSeen.
 *   - Blanks the cell only when nothing remains (no personaShiftSeen to preserve).
 *
 * @returns {Object} { status: 'success' } | { status: 'error', message }
 */
function clearMemberCelebration() {
  const memberId = getVerifiedMemberId();
  if (!memberId) return { status: 'error', message: 'Unauthorized session.' };

  try {
    const ss          = SpreadsheetApp.openById(SPREADSHEET_ID);
    const memberSheet = ss.getSheetByName(MEMBERS_SHEET);
    const data        = memberSheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (data[i][0].toString() !== memberId) continue;

      // Read-modify-write: preserve personaShiftSeen while clearing badge/level fields.
      const raw = (data[i][MEMBER_CELEBRATION_COL_INDEX] || '').toString().trim();
      let existing = {};
      try { if (raw) existing = JSON.parse(raw); } catch (e) { existing = {}; }

      const personaShiftSeen   = existing.personaShiftSeen   || null;
      const personaShiftSeenAt = Number(existing.personaShiftSeenAt) || 0;

      // Only preserve the persona seen marker if it was stamped within the same
      // 7-day window that renderPersonaCelebrationCard_() uses to surface the card.
      // An older marker is useless (the card wouldn't show anyway) so we drop it,
      // letting the cell go blank and keeping Col N tidy.
      const PERSONA_CELEB_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
      const seenIsStillFresh = personaShiftSeen &&
                               personaShiftSeenAt > 0 &&
                               (Date.now() - personaShiftSeenAt) < PERSONA_CELEB_WINDOW_MS;

      let newValue;
      if (seenIsStillFresh) {
        // Keep only the persona seen marker — drop badges and newLevel.
        newValue = JSON.stringify({ personaShiftSeen, personaShiftSeenAt });
      } else {
        // Nothing to preserve (no marker, or marker is stale) — blank the cell.
        newValue = '';
      }

      memberSheet.getRange(i + 1, MEMBER_CELEBRATION_COL_NUMBER).setValue(newValue);
      return { status: 'success' };
    }

    return { status: 'error', message: 'Member record not found.' };
  } catch (err) {
    console.error('clearMemberCelebration: ' + err.toString());
    return { status: 'error', message: 'Server error clearing celebration.' };
  }
}
 
 
/**
 * PUBLIC: Records the most-recently-seen persona shift activity ID into MemberDB
 * Col N so the persona celebration card does not re-surface after dismiss.
 *
 * Design:
 *   - memberId resolved from session — never accepted from the caller.
 *   - Reads the existing Col N JSON, merges personaShiftSeen, writes back.
 *     This preserves any coexisting badge/level fields in the same cell.
 *   - Idempotent: calling with the same activityId twice is safe.
 *   - Fire-and-forget from the frontend — failure means the card may reappear
 *     on the next session, which is acceptable.
 *
 * @param {string} seenActivityId - ARKA_ACT_X of the most recent PERSONAUPDATE
 *                                  the member has dismissed.
 * @returns {Object} { status: 'success' } | { status: 'error', message }
 */
function setPersonaCelebrationSeen(seenActivityId) {
  const memberId = getVerifiedMemberId();
  if (!memberId) return { status: 'error', message: 'Unauthorized session.' };

  if (!seenActivityId || typeof seenActivityId !== 'string') {
    return { status: 'error', message: 'Invalid activityId.' };
  }

  try {
    const ss          = SpreadsheetApp.openById(SPREADSHEET_ID);
    const memberSheet = ss.getSheetByName(MEMBERS_SHEET);
    const data        = memberSheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (data[i][0].toString() !== memberId) continue;

      // Read-modify-write: preserve any existing badges/newLevel alongside personaShiftSeen.
      const raw    = (data[i][MEMBER_CELEBRATION_COL_INDEX] || '').toString().trim();
      let existing = {};
      try { if (raw) existing = JSON.parse(raw); } catch (e) { existing = {}; }

      existing.personaShiftSeen   = seenActivityId;
      existing.personaShiftSeenAt = Date.now(); // epoch ms — used by clearMemberCelebration to expire stale markers

      memberSheet
        .getRange(i + 1, MEMBER_CELEBRATION_COL_NUMBER)
        .setValue(JSON.stringify(existing));

      return { status: 'success' };
    }

    return { status: 'error', message: 'Member record not found.' };
  } catch (err) {
    console.error('setPersonaCelebrationSeen: ' + err.toString());
    return { status: 'error', message: 'Server error saving persona seen state.' };
  }
}


/**
 * Appends "| SeenByMember" to the activityDesc (Col E) of the given ActivityLog
 * row, provided the row belongs to the calling member. Called fire-and-forget
 * from the frontend when a celebration card is dismissed.
 *
 * @param {string} activityId - e.g. "ARKA_ACT_1990"
 * @returns {{ status: string }}
 */
function markActivitySeen(activityId) {
  const memberId = getVerifiedMemberId();
  if (!memberId) return { status: 'error', message: 'Unauthorized session.' };

  if (!activityId || typeof activityId !== 'string') {
    return { status: 'error', message: 'Invalid activityId.' };
  }

  try {
    const ss       = SpreadsheetApp.openById(SPREADSHEET_ID);
    const logSheet = ss.getSheetByName(ACTIVITYLOG_SHEET);
    const data     = logSheet.getDataRange().getValues();

    // Col indices (0-based): A=activityId, C=date, D=memberId, E=activityDesc
    for (let i = 1; i < data.length; i++) {
      if (data[i][0].toString() !== activityId) continue;
      // Security: only the owning member may mark their own activity.
      if (data[i][3].toString() !== memberId)   return { status: 'error', message: 'Forbidden.' };

      const currentDesc = (data[i][4] || '').toString();
      if (currentDesc.indexOf('| SeenByMember') !== -1) {
        return { status: 'success' }; // already tagged — idempotent
      }

      logSheet.getRange(i + 1, 5).setValue(currentDesc + ' | SeenByMember');
      return { status: 'success' };
    }

    return { status: 'error', message: 'Activity not found.' };
  } catch (err) {
    console.error('markActivitySeen: ' + err.toString());
    return { status: 'error', message: 'Server error.' };
  }
}


/**
 * ADMIN ONLY: Creates a new badge entry in BadgeDB and uploads the badge image
 * to the dedicated badge images Google Drive folder.
 *
 * @param   {Object} badgeData
 * @param   {string} badgeData.caption      - Short display name for the badge
 * @param   {string} badgeData.description  - Full description of what this badge represents
 * @param   {string} badgeData.imageBase64  - Base64 data URI (image/jpeg) from the frontend canvas
 * @returns {Object} { status, newBadge } | { status: 'error', message }
 */
function addNewBadge(badgeData) {
  const currentMemberId = getVerifiedMemberId();
  if (!currentMemberId)              return { status: 'error', message: 'Unauthorized session.' };
  if (!isAdminMember(currentMemberId)) return { status: 'error', message: 'Admin access required.' };
 
  if (!badgeData.caption || !badgeData.caption.trim()) {
    return { status: 'error', message: 'Badge caption cannot be empty.' };
  }
  if (!badgeData.imageBase64) {
    return { status: 'error', message: 'Badge image is required.' };
  }
 
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(BADGE_DB_SHEET);
  const data  = sheet.getDataRange().getValues();
 
  // Generate sequential ARKA_BADGE_X ID from the last row
  let newNum = 1;
  if (data.length > 1) {
    const lastId  = data[data.length - 1][0].toString();
    const lastNum = parseInt(lastId.split('_')[2]);
    if (!isNaN(lastNum)) newNum = lastNum + 1;
  }
  const badgeId = 'ARKA_BADGE_' + newNum;
 
  // Upload badge image to Drive — replace any previous file with the same name
  const folder   = DriveApp.getFolderById(BADGE_IMAGES_FOLDER_ID);
  const fileName = badgeId + '_badge.jpg';
 
  const existingFiles = folder.getFilesByName(fileName);
  while (existingFiles.hasNext()) existingFiles.next().setTrashed(true);
 
  const rawBase64 = badgeData.imageBase64.split(',')[1];
  const blob      = Utilities.newBlob(Utilities.base64Decode(rawBase64), 'image/jpeg', fileName);
  const newFile   = folder.createFile(blob);
 
  // Store at w400 — frontend swaps the sz parameter for smaller sizes at render time
  const badgeImgUrl = 'https://drive.google.com/thumbnail?id=' + newFile.getId() + '&sz=w400';
 
  const badgePoints   = Number(badgeData.badgePoints) || 0;
  const badgeCategory = (badgeData.badgeCategory || 'SPECIAL').toString().trim();
  const badgeTier     = Number(badgeData.badgeTier) || 0;
  const badgeMeta     = (badgeData.badgeMeta || '').toString().trim();

  invalidateCacheKey(CACHE_KEYS.badges);
  sheet.appendRow([
    badgeId,
    badgeData.caption.trim(),
    badgeData.description.trim(),
    badgeImgUrl,
    badgePoints,
    badgeCategory,  // Col F
    badgeTier,      // Col G
    badgeMeta       // Col H
  ]);

  return {
    status: 'success',
    newBadge: {
      id           : badgeId,
      caption      : badgeData.caption.trim(),
      description  : badgeData.description.trim(),
      imgUrl       : badgeImgUrl,
      badgePoints  : badgePoints,
      badgeCategory: badgeCategory,
      badgeTier    : badgeTier,
      badgeMeta    : badgeMeta
    }
  };
}

/**
 * ADMIN ONLY: Replaces the image for an existing badge in BadgeDB.
 * Trashes the old Drive file (extracted from the stored ImgUrl), uploads the
 * new image under the same filename convention ({badgeId}_badge.jpg), and
 * updates the ImgUrl cell in BadgeDB in-place.
 *
 * @param {string} badgeId      - ARKA_BADGE_X of the badge to update.
 * @param {string} imageBase64  - Base64 data URI (image/jpeg) from the frontend canvas.
 * @returns {{status: string, imgUrl?: string, message?: string}}
 */
function updateBadgeImage(badgeId, imageBase64) {
  try {
    const currentMemberId = getVerifiedMemberId();
    if (!currentMemberId) return { status: 'error', message: 'Session expired. Please reload.' };
    if (!isAdminMember(currentMemberId)) return { status: 'error', message: 'Admin access required.' };
    if (!badgeId)     return { status: 'error', message: 'Badge ID is required.' };
    if (!imageBase64) return { status: 'error', message: 'Image data is required.' };

    const ss         = SpreadsheetApp.openById(SPREADSHEET_ID);
    const badgeSheet = ss.getSheetByName(BADGE_DB_SHEET);
    const badgeData  = badgeSheet.getDataRange().getValues();

    // ── Locate the badge row (Col A = BadgeID) ────────────────────────────
    let targetRowIndex = -1;
    let existingImgUrl = '';
    for (let i = 1; i < badgeData.length; i++) {
      if ((badgeData[i][0] || '').toString() === badgeId) {
        targetRowIndex = i + 1; // Sheets rows are 1-indexed; data array is 0-indexed
        existingImgUrl = (badgeData[i][3] || '').toString(); // Col D = ImgUrl
        break;
      }
    }

    if (targetRowIndex === -1) {
      return { status: 'error', message: 'Badge not found in BadgeDB: ' + badgeId };
    }

    // ── Old file cleanup skipped: getFileById() scope not available ───────
    // The old file remains in Drive but is superseded by the new upload.
    // The BadgeDB ImgUrl is overwritten below so the old file is never served.
    const folder           = DriveApp.getFolderById(BADGE_IMAGES_FOLDER_ID);
    const expectedFileName = badgeId + '_badge.jpg';

    // ── Decode and upload the new image ───────────────────────────────────
    const base64Part = imageBase64.indexOf(',') !== -1
      ? imageBase64.split(',')[1]
      : imageBase64; // Handle case where data URI prefix is absent

    const blob    = Utilities.newBlob(
      Utilities.base64Decode(base64Part), 'image/jpeg', expectedFileName
    );
    const newFile = folder.createFile(blob);

    const newImgUrl = 'https://drive.google.com/thumbnail?id=' + newFile.getId() + '&sz=w400';

    // ── Update ImgUrl in BadgeDB Col D ────────────────────────────────────
    badgeSheet.getRange(targetRowIndex, 4).setValue(newImgUrl);

    // ── Bust badge cache so the next Big Gulp picks up the new URL ────────
    invalidateCacheKey(CACHE_KEYS.badges);

    return { status: 'success', imgUrl: newImgUrl };

  } catch (err) {
    // Surface the real error message in the frontend toast
    Logger.log('updateBadgeImage ERROR: ' + err.toString());
    return { status: 'error', message: 'Update failed: ' + err.message };
  }
}
 
/**
 * ADMIN ONLY: Awards a badge to a specific member.
 * Writes a new row to BadgeAwardDB and updates the MemberDB Col N badge cache.
 * Prevents awarding the same badge to the same member twice (if already Active).
 *
 * @param   {Object} awardData
 * @param   {string} awardData.badgeId  - ARKA_BADGE_X to award
 * @param   {string} awardData.memberId - ARKA_MEMBER_X receiving the badge
 * @param   {string} [awardData.notes]  - Optional admin note
 * @returns {Object} { status, newAward } | { status: 'error', message }
 */
function awardBadgeToMember(awardData) {
  const currentMemberId = getVerifiedMemberId();
  if (!currentMemberId)              return { status: 'error', message: 'Unauthorized session.' };
  if (!isAdminMember(currentMemberId)) return { status: 'error', message: 'Admin access required.' };
  if (!awardData.badgeId || !awardData.memberId) {
    return { status: 'error', message: 'Badge ID and Member ID are both required.' };
  }
 
  const ss         = SpreadsheetApp.openById(SPREADSHEET_ID);
  const awardSheet = ss.getSheetByName(BADGE_AWARD_DB_SHEET);
  const existingAwards = awardSheet.getDataRange().getValues();
 
  // Duplicate guard — prevent awarding the same active badge to the same member twice
  for (let i = 1; i < existingAwards.length; i++) {
    if (existingAwards[i][1] === awardData.badgeId &&
        existingAwards[i][2] === awardData.memberId &&
        existingAwards[i][5] === 'Active') {
      return { status: 'error', message: 'This member already holds this badge.' };
    }
  }
 
  // Generate sequential ARKA_AWARD_X ID
  let newNum = 1;
  if (existingAwards.length > 1) {
    const lastId  = existingAwards[existingAwards.length - 1][0].toString();
    const lastNum = parseInt(lastId.split('_')[2]);
    if (!isNaN(lastNum)) newNum = lastNum + 1;
  }
  const awardId      = 'ARKA_AWARD_' + newNum;
  const dateFormatted = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd-MMM-yyyy');
  
  invalidateCacheKey(CACHE_KEYS.badgeAwards);
  awardSheet.appendRow([
    awardId,
    awardData.badgeId,
    awardData.memberId,
    currentMemberId,       // Col D: who awarded it
    dateFormatted,         // Col E: award date
    'Active',              // Col F: status
    awardData.notes || ''  // Col G: optional admin note
  ]);
 
  // Look up how many points this badge is worth from BadgeDB col E
  // activityValue = badgePoints, multiplier in ActivityTypeDB = 1,
  // so cpAwarded = badgePoints exactly — same pattern as page reads.
  const badgeSheetForPoints = ss.getSheetByName(BADGE_DB_SHEET);
  const badgeRows = badgeSheetForPoints.getDataRange().getValues();
  let badgePointsForActivity = 0;
  for (let i = 1; i < badgeRows.length; i++) {
    if (badgeRows[i][0].toString() === awardData.badgeId) {
      badgePointsForActivity = Number(badgeRows[i][4]) || 0; // Col E: badgePoints
      break;
    }
  }
 
  // Log the badge award activity — description holds the AwardID for traceability
  try {
    logActivityBatch(
      awardData.memberId,
      [{ typeId: 'ARKA_ACTTYP_BADGEAWARD', val: badgePointsForActivity, desc: awardId }]
    );
  } catch(e) {
    console.error('Badge activity log failed but award was saved: ' + e.toString());
  }

  return {
    status: 'success',
    newAward: {
      awardId:     awardId,
      badgeId:     awardData.badgeId,
      memberId:    awardData.memberId,
      awardedBy:   currentMemberId,
      awardedDate: dateFormatted,
      status:      'Active',
      notes:       awardData.notes || ''
    }
  };
}
 
 
/**
 * ADMIN ONLY: Revokes an existing badge award by setting its status to 'Revoked'.
 *
 * @param   {string} awardId - ARKA_AWARD_X to revoke
 * @returns {Object} { status } | { status: 'error', message }
 */
function revokeBadgeAward(awardId) {
  const currentMemberId = getVerifiedMemberId();
  if (!currentMemberId)              return { status: 'error', message: 'Unauthorized session.' };
  if (!isAdminMember(currentMemberId)) return { status: 'error', message: 'Admin access required.' };
 
  const ss         = SpreadsheetApp.openById(SPREADSHEET_ID);
  const awardSheet = ss.getSheetByName(BADGE_AWARD_DB_SHEET);
  const data       = awardSheet.getDataRange().getValues();
 
  for (let i = 1; i < data.length; i++) {
    if (data[i][0].toString() !== awardId.toString()) continue;
    invalidateCacheKey(CACHE_KEYS.badgeAwards);
    awardSheet.getRange(i + 1, 6).setValue('Revoked');

    // Look up badge points to reverse — same lookup as awardBadgeToMember
    const badgeSheetForPoints = ss.getSheetByName(BADGE_DB_SHEET);
    const badgeRows = badgeSheetForPoints.getDataRange().getValues();
    let badgePointsToReverse = 0;
    for (let j = 1; j < badgeRows.length; j++) {
      if (badgeRows[j][0].toString() === data[i][1].toString()) {
        badgePointsToReverse = Number(badgeRows[j][4]) || 0;
        break;
      }
    }

    // activityValue = badgePoints, multiplier in ActivityTypeDB = -1
    // so cpAwarded = badgePoints × -1 = deduction
    try {
      logActivityBatch(
        data[i][2],
        [{ typeId: 'ARKA_ACTTYP_BADGEREVOKE', val: badgePointsToReverse, desc: awardId }]
      );
    } catch(e) {
      console.error('Revoke activity log failed but revocation was saved: ' + e.toString());
    }

    return { status: 'success' };
  }
 
  return { status: 'error', message: 'Award record not found.' };
}

// ============================================================================
// PRIVATE HELPER
// ============================================================================
 
/**
 * @typedef {Object} AnnouncementRecord
 * @property {string}  announcementId - Unique ID: ARKA_ANN_X         (Col A)
 * @property {string}  title          - Short headline                 (Col B)
 * @property {string}  body           - Full announcement text         (Col C)
 * @property {boolean} isPinned       - TRUE pins to home feed         (Col D)
 * @property {string}  expiryDate     - dd-MMM-yyyy or "" = no expiry (Col E)
 * @property {string}  status         - "Active" | "Archived"         (Col F)
 * @property {string}  createdBy      - ARKA_MEMBER_X                 (Col G)
 * @property {string}  createdOn      - dd-MM-yyyy HH:mm:ss Z         (Col H)
 */
 
/**
 * ADMIN ONLY: Returns all announcement rows (Active + Archived) for the admin
 * panel list view. Unlike fetchActiveAnnouncements(), this includes archived
 * rows so admins can see history and re-manage the feed.
 * @returns {{ status: string, announcements?: AnnouncementRecord[], message?: string }}
 */
function getAdminAnnouncementsData() {
  const currentMemberId = getVerifiedMemberId();
  if (!currentMemberId || !isAdminMember(currentMemberId)) {
    return { status: 'admin_required', message: 'Admin access required.' };
  }

  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(ANNOUNCEMENT_SHEET);
  if (!sheet) return { status: 'error', message: 'AnnouncementDB sheet not found.' };

  const data          = sheet.getDataRange().getValues();
  const announcements = [];

  for (let i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    announcements.push({
      announcementId  : data[i][0].toString(),
      title           : data[i][1].toString(),
      body            : data[i][2].toString(),
      isPinned        : data[i][3] === true || data[i][3] === 'TRUE',
      expiryDate      : data[i][4] ? data[i][4].toString() : '',
      status          : data[i][5] ? data[i][5].toString() : 'Active',
      createdBy       : data[i][6] ? data[i][6].toString() : '',
      createdOn       : data[i][7] ? data[i][7].toString() : '',
      targetMemberIds : data[i][8] ? data[i][8].toString() : '',
      dismissedBy     : data[i][9] ? data[i][9].toString() : '',
      announcementType: data[i][10] ? data[i][10].toString().trim() : 'CLUB_NOTICE'
    });
  }

  return { status: 'success', announcements: announcements };
}

/**
 * PRIVATE HELPER: Reads all non-Archived announcements from AnnouncementDB.
 * Reuses the already-open spreadsheet instance passed in from getAppMasterData()
 * to avoid opening a second connection — keeps the Big Gulp fast.
 *
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss - Open spreadsheet instance
 * @returns {AnnouncementRecord[]} Array of active announcement objects
 */
function fetchActiveAnnouncements(ss) {
  const sheet = ss.getSheetByName(ANNOUNCEMENT_SHEET);
  if (!sheet) return []; // Sheet not yet created — fail silently
 
  const data          = sheet.getDataRange().getValues();
  const announcements = [];
 
  for (let i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;                               // Skip empty rows
    if (data[i][5].toString() === 'Archived') continue;      // Archived = hidden
 
    // Normalise Date objects to strings for consistent frontend handling
    const rawExpiry    = data[i][4];
    const expiryStr    = rawExpiry instanceof Date
      ? Utilities.formatDate(rawExpiry, Session.getScriptTimeZone(), 'dd-MMM-yyyy')
      : String(rawExpiry || '');
 
    const rawCreatedOn = data[i][7];
    const createdOnStr = rawCreatedOn instanceof Date
      ? Utilities.formatDate(rawCreatedOn, Session.getScriptTimeZone(), 'dd-MM-yyyy HH:mm:ss Z')
      : String(rawCreatedOn || '');
 
    announcements.push({
      announcementId  : data[i][0].toString(),
      title           : data[i][1].toString(),
      body            : data[i][2].toString(),
      isPinned        : data[i][3].toString().toUpperCase() === 'TRUE',
      expiryDate      : expiryStr,
      status          : data[i][5].toString(),
      createdBy       : data[i][6].toString(),
      createdOn       : createdOnStr,
      targetMemberIds  : data[i][8] ? data[i][8].toString() : '',
      dismissedBy      : data[i][9] ? data[i][9].toString() : '',
      // Col K — AnnouncementType: WHATS_NEW | CLUB_NOTICE (blank treated as CLUB_NOTICE)
      announcementType : data[i][10] ? data[i][10].toString().trim() : 'CLUB_NOTICE'
    });
  }
 
  return announcements;
}

/**
 * Permanently dismisses an announcement for the current member by appending
 * their MemberID to the DismissedBy column (Col J) of that announcement row.
 * No-op for pinned announcements — they cannot be dismissed.
 *
 * @param {string} announcementId - ARKA_ANN_X to dismiss
 * @returns {{ status: string }}
 */
function dismissAnnouncementPermanently(announcementId) {
  const currentMemberId = getVerifiedMemberId();
  if (!currentMemberId) return { status: 'error', message: 'Unauthorized.' };

  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(ANNOUNCEMENT_SHEET);
  if (!sheet) return { status: 'error', message: 'AnnouncementDB not found.' };

  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0].toString() !== announcementId) continue;

    // Never dismiss pinned announcements
    if (data[i][3].toString().toUpperCase() === 'TRUE') {
      return { status: 'error', message: 'Pinned announcements cannot be dismissed.' };
    }

    // Build updated DismissedBy — append member if not already present
    const existing    = data[i][9] ? data[i][9].toString() : '';
    const dismissedIds = existing
      ? existing.split(',').map(function(s) { return s.trim(); })
      : [];

    if (dismissedIds.includes(currentMemberId)) {
      return { status: 'success' }; // Already dismissed — idempotent
    }

    dismissedIds.push(currentMemberId);
    sheet.getRange(i + 1, 10).setValue(dismissedIds.join(','));
    // Invalidate cache so the next session serves fresh data with the updated DismissedBy.
    invalidateCacheKey(CACHE_KEYS.announcements);
    return { status: 'success' };
  }

  return { status: 'error', message: 'Announcement not found.' };
}

/**
 * PRIVATE HELPER: Reads all non-Archived challenges from ChallengeDB.
 * Reuses the already-open spreadsheet instance from getAppMasterData().
 *
 * Column mapping (0-indexed):
 *   A=0  challengeId       B=1  challengeType     C=2  title
 *   D=3  description       E=4  startDate         F=5  endDate
 *   G=6  goalValue         H=7  goalUnit          I=8  goalConfigJson
 *   J=9  status            K=10 competitionMode  L=11 seriesTag
 *   M=12 isPinned          N=13 createdBy         O=14 createdOn
 *   P=15 enrollPoints      Q=16 finishPoints      R=17 winPoints
 *
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
 * @returns {ChallengeRecord[]}
 */

/**
 * Parses Col K of ChallengeDB into a competitionMode string.
 * Accepts legacy TRUE/FALSE values (back-compat) and the new enum strings.
 */
function parseCompetitionMode_(val) {
  const s = (val || '').toString().trim().toUpperCase();
  if (s === 'TRUE')  return 'INDIVIDUAL';
  if (s === 'FALSE') return 'NONE';
  if (['NONE', 'INDIVIDUAL', 'SHARED', 'TEAM'].includes(s)) return s;
  return 'NONE';
}

function fetchChallenges(ss) {
  const sheet = ss.getSheetByName(CHALLENGE_SHEET);
  if (!sheet) return [];
 
  const data       = sheet.getDataRange().getValues();
  const challenges = [];
 
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[0]) continue;
    if (row[9].toString() === 'Archived') continue;
 
    const rawStartDate = row[4];
    const rawEndDate   = row[5];
    const rawCreatedOn = row[14];
 
    const startDateStr = rawStartDate instanceof Date
      ? Utilities.formatDate(rawStartDate, Session.getScriptTimeZone(), 'dd-MMM-yyyy')
      : String(rawStartDate || '');
 
    const endDateStr = rawEndDate instanceof Date
      ? Utilities.formatDate(rawEndDate, Session.getScriptTimeZone(), 'dd-MMM-yyyy')
      : String(rawEndDate || '');
 
    const createdOnStr = rawCreatedOn instanceof Date
      ? Utilities.formatDate(rawCreatedOn, Session.getScriptTimeZone(), 'dd-MM-yyyy HH:mm:ss Z')
      : String(rawCreatedOn || '');
 
    challenges.push({
      challengeId    : row[0].toString(),
      challengeType  : row[1].toString(),
      title          : row[2].toString(),
      description    : row[3].toString(),
      startDate      : startDateStr,
      endDate        : endDateStr,
      goalValue      : Number(row[6]) || 0,
      goalUnit       : row[7].toString(),
      goalConfigJson : row[8].toString(),
      status         : row[9].toString(),
      competitionMode: parseCompetitionMode_(row[10]),
      seriesTag      : row[11] ? row[11].toString() : '',
      isPinned       : row[12].toString().toUpperCase() === 'TRUE',
      createdBy      : row[13].toString(),
      createdOn      : createdOnStr,
      // ── NEW: per-challenge points ────────────────────────────────────────
      enrollPoints   : Number(row[15]) || 0,  // Col P
      finishPoints   : Number(row[16]) || 0,  // Col Q
      winPoints      : Number(row[17]) || 0   // Col R
    });
  }
 
  return challenges;
}

/**
 * PRIVATE HELPER: Reads ClubPointLevelDB and returns an array of level rule objects.
 *
 * Used by getWave1Data() to build globalMemberLevelsDB.
 * Accepts ss directly — Wave 1 only reads 3 sheets total so buildSheetMap_()
 * is not worth calling just for this one lookup.
 *
 * Column mapping (0-indexed):
 *   A=0  levelNum       — sequential rank (1, 2, 3...)
 *   B=1  maxClubPoints  — XP ceiling for this level
 *   C=2  levelName      — display title e.g. "Bookworm"
 *
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
 *   Open spreadsheet instance from SpreadsheetApp.openById()
 *
 * @returns {Array<{
 *   levelNum:      number,
 *   maxClubPoints: number,
 *   levelName:     string
 * }>} Sorted array of level rules. Empty array if sheet not found.
 */
function buildClubLevelList_(ss) {
  const sheet     = ss.getSheetByName('ClubPointLevelDB');
  const levelList = [];

  if (!sheet) {
    console.warn('buildClubLevelList_: ClubPointLevelDB sheet not found.');
    return levelList;
  }

  // Read only 3 columns — all that ClubPointLevelDB contains
  const data = sheet.getRange(1, 1, sheet.getLastRow(), 3).getValues();

  for (let i = 1; i < data.length; i++) {
    // Skip blank rows — Col A (levelNum) must be present
    if (data[i][0] === '' || data[i][0] === null) continue;

    levelList.push({
      levelNum      : parseInt(data[i][0]) || 0,   // Col A
      maxClubPoints : parseInt(data[i][1]) || 0,   // Col B
      levelName     : data[i][2] || 'Reader'       // Col C
    });
  }

  return levelList;
}

/**
 * _parseColOStats_(raw)
 * Parses a MemberDB Col O cell value into the canonical Stats shape used
 * throughout the app. Mirrors _parseStatsJson_() in MasterEngine; kept as a
 * separate function because MasterEngine and ArkaClubAppCode are separate GAS
 * projects and cannot share code directly.
 *
 * Handles three states so no sheet migration is required:
 *   1. Blank / null  → zeroed Stats skeleton (new member, not yet synced).
 *   2. Plain number  → legacy Col O integer (TotalClubPoints pre-Phase-0);
 *                      wraps it in allTime.arkaPoints, all other keys zero.
 *   3. JSON string   → parses and returns; missing sub-keys back-filled to 0.
 *
 * Never throws. A malformed JSON cell is logged and replaced with a skeleton
 * rather than breaking Wave 1 for all members.
 *
 * @param  {*} raw  - Raw cell value from MemberDB Col O (index 14).
 * @returns {Object} Stats object with shape:
 *   {
 *     allTime: { arkaPoints, pages, books, reviews, ratings, genres,
 *                libraryAdded, badges, ploggerWeeks, longestStreak },
 *     "<year>": { same keys }  // one key per year MasterEngine has synced
 *   }
 */
function _parseColOStats_(raw) {
  const EMPTY_STAT_BLOCK = {
    arkaPoints   : 0,
    pages        : 0,
    books        : 0,
    reviews      : 0,
    ratings      : 0,
    genres       : 0,
    libraryAdded : 0,
    badges       : 0,
    ploggerWeeks : 0,
    longestStreak: 0
  };

  // ── Blank / missing cell ─────────────────────────────────────────────────
  if (raw === null || raw === undefined || raw === '') {
    return { allTime: Object.assign({}, EMPTY_STAT_BLOCK) };
  }

  // ── Legacy integer path ──────────────────────────────────────────────────
  // Col O previously held a plain integer (TotalClubPoints). Any cell that is
  // a number, or a string that does not begin with '{', is treated as legacy.
  const rawStr = raw.toString().trim();
  if (typeof raw === 'number' || rawStr.charAt(0) !== '{') {
    const skeleton = { allTime: Object.assign({}, EMPTY_STAT_BLOCK) };
    skeleton.allTime.arkaPoints = Number(raw) || 0;
    return skeleton;
  }

  // ── JSON path ────────────────────────────────────────────────────────────
  try {
    const parsed = JSON.parse(rawStr);

    // Ensure allTime always exists and contains every required sub-key.
    // Year keys (e.g. "2026") are left exactly as stored — forward-compatible.
    if (!parsed.allTime || typeof parsed.allTime !== 'object') {
      parsed.allTime = Object.assign({}, EMPTY_STAT_BLOCK);
    } else {
      Object.keys(EMPTY_STAT_BLOCK).forEach(k => {
        if (parsed.allTime[k] === undefined) parsed.allTime[k] = 0;
      });
    }
    return parsed;

  } catch (e) {
    console.warn('_parseColOStats_: failed to parse Col O JSON — resetting to skeleton. Raw: ' + rawStr);
    return { allTime: Object.assign({}, EMPTY_STAT_BLOCK) };
  }
}

/**
 * PRIVATE HELPER: Reads MemberDB and returns an array of member objects.
 *
 * Used by getWave1Data() to build globalMembersDB.
 * Accepts ss directly — same pattern as buildClubLevelList_().
 *
 * Column mapping (0-indexed):
 *   A=0   id (ARKA_MEMBER_X)
 *   B=1   email
 *   C=2   fullName
 *   D=3   displayName
 *   E=4   joinDate
 *   F=5   country
 *   G=6   bio
 *   H=7   langs
 *   I=8   linkedin
 *   J=9   goodreads
 *   K=10  genres
 *   L=11  goal
 *   O=14  Stats JSON (allTime + year keys — see _parseColOStats_)
 *   P=15  pages
 *   Q=16  books
 *   R=17  imageURL
 *
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
 *   Open spreadsheet instance from SpreadsheetApp.openById()
 *
 * @returns {Array<{
 *   id: string, email: string, fullName: string, displayName: string,
 *   country: string, clubPoints: number, pages: number, books: number,
 *   stats: Object, joinDate: string, bio: string, goal: string, genres: string,
 *   langs: string, linkedin: string, goodreads: string, imageURL: string
 * }>} Array of member objects. Empty array if sheet not found.
 *   clubPoints — backward-compat alias for stats.allTime.arkaPoints.
 *   stats      — full Stats JSON: { allTime: {...}, "2026": {...}, ... }
 */
function buildMembersList_(ss) {
  const sheet       = ss.getSheetByName(MEMBERS_SHEET);
  const membersList = [];

  if (!sheet) {
    console.warn('buildMembersList_: ' + MEMBERS_SHEET + ' sheet not found.');
    return membersList;
  }

  // Full getDataRange() — MemberDB is small (one row per member)
  // and we need cols spread across A–R (18 cols) so getDataRange is fine
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    // Skip blank rows — Col A (id) must be present
    if (!data[i][0]) continue;

    // Parse Col O Stats JSON once per row. _parseColOStats_ transparently
    // handles legacy integer cells (pre-Phase-0 rows) so no data migration needed.
    const _colOStats = _parseColOStats_(data[i][14]);

    membersList.push({
      id          : data[i][0],
      email       : data[i][1]  || 'emailnotset@email.com',
      fullName    : data[i][2],
      displayName : data[i][3],
      country     : data[i][5]  || '',
      // Backward-compat: clubPoints is derived from allTime.arkaPoints so all
      // existing JS references to member.clubPoints work without any change.
      clubPoints  : _colOStats.allTime.arkaPoints,   // Col O Stats JSON → allTime.arkaPoints
      pages       : _colOStats.allTime.pages,        //// Col O Stats JSON → allTime.pages   
      books       : _colOStats.allTime.books,         // Col O Stats JSON → allTime.books   
      // Full Stats object — consumed by year rankings (Phase 3). Includes allTime
      // and one key per year MasterEngine has synced (e.g. "2026").
      stats       : _colOStats,
      joinDate    : (function() {
          // Col E: "dd-MMM-yyyy" — parseSheetTimestamp_ handles both native Date
          // objects (Sheets auto-parsed) and string form safely.
          var jd = parseSheetTimestamp_(data[i][4]);
          return !isNaN(jd.getTime())
            ? Utilities.formatDate(jd, Session.getScriptTimeZone(), 'dd-MMM-yyyy')
            : 'Unknown';
        })(),
      bio      : data[i][6]  || 'No bio added yet.',
      goal     : data[i][11] || 'None set.',
      genres   : sanitiseGenreField_(data[i][10]),
      langs    : data[i][7]  || 'Unknown',
      linkedin : data[i][8]  || '',
      goodreads: data[i][9]  || '',
      imageURL      : data[i][17] || '',         // Col R
      // Col U — EmailOptOut. Strict === true so blank cells (pre-feature members)
      // default to false (opted in). Written by updateEmailOptOut() when the
      // member toggles the preference in Edit Profile.
      emailOptOut   : data[i][20] === true,       // Col U
      coachInsights : data[i][18] ? (function() {
          // Col S: JSON string written nightly by MasterEngine insight pass.
          // Parse defensively — a malformed cell must never break Wave 1.
          try { return JSON.parse(data[i][18]); } catch(e) { return null; }
        })() : null,
      lastAccessed : (function() {
          // Col M: "dd-MM-yyyy HH:mm:ss Z" — new Date() returns NaN for this format
          // in GAS V8. parseSheetTimestamp_ reorders it to ISO 8601 before parsing.
          var la = parseSheetTimestamp_(data[i][12]);
          return !isNaN(la.getTime())
            ? Utilities.formatDate(la, Session.getScriptTimeZone(), 'dd-MM-yyyy HH:mm:ss Z')
            : '';
        })(),
      celebration : (function() {
          // Col N: JSON celebration payload written by MasterEngine.
          // Shape: { badges: string[], newLevel: string }
          // Blank/empty = nothing pending. Parse defensively — a malformed cell
          // must never break Wave 1. Returns null when nothing is pending.
          var raw = (data[i][MEMBER_CELEBRATION_COL_INDEX] || '').toString().trim();
          if (!raw) return null;
          try {
            var parsed = JSON.parse(raw);
            var hasBadges      = Array.isArray(parsed.badges) && parsed.badges.length > 0;
            var hasLevel       = typeof parsed.newLevel === 'string' && parsed.newLevel.trim() !== '';
            // personaShiftSeen is written by setPersonaCelebrationSeen() on persona card
            // dismiss — keep the object alive so the frontend can read this field even
            // when no badge/level celebration is pending.
            var hasPersonaSeen = typeof parsed.personaShiftSeen === 'string' && parsed.personaShiftSeen !== '';
            return (hasBadges || hasLevel || hasPersonaSeen) ? parsed : null;
          } catch (e) {
            return null; // Malformed cell — treat as no pending celebration
          }
        })()
    });
  }

  return membersList;
}

/**
 * PRIVATE HELPER: Reads BadgeDB and returns an array of badge objects.
 *
 * Column mapping (0-indexed):
 *   A=0  id              B=1  caption       C=2  description
 *   D=3  imgUrl          E=4  badgePoints   F=5  badgeCategory
 *   G=6  badgeTier       H=7  badgeMeta
 *
 * badgeCategory — gallery grouping and MasterEngine routing key.
 *   e.g. PAGE_MILESTONE, GENRE_EXPLORER, YEARLY, ANNIVERSARY, SPECIAL.
 * badgeTier — integer ordering within a replacing series (1 = lowest tier).
 *   0 for non-tiered badges (one-off specials, yearly awards).
 * badgeMeta — auxiliary context string:
 *   GENRE_EXPLORER → canonical genre name e.g. "Fantasy"
 *   YEARLY         → "YYYY|TYPE_CODE" e.g. "2025|CRITIC_OF_YEAR"
 *   all others     → empty string
 *
 * @param  {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
 * @returns {Array<{id, caption, description, imgUrl, badgePoints,
 *                  badgeCategory, badgeTier, badgeMeta}>}
 */
function buildBadgesDBList_(ss) {
  const sheet        = ss.getSheetByName(BADGE_DB_SHEET) || null;
  const badgesDBList = [];

  if (!sheet) {
    console.warn('buildBadgesDBList_: ' + BADGE_DB_SHEET + ' not found.');
    return badgesDBList;
  }

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return badgesDBList; // empty or header-only

  // Read all 8 columns in a single range call
  const data = sheet.getRange(1, 1, lastRow, 8).getValues();

  for (let i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    badgesDBList.push({
      id           : data[i][0].toString(),
      caption      : data[i][1].toString(),
      description  : data[i][2].toString(),
      imgUrl       : data[i][3].toString(),
      badgePoints  : Number(data[i][4]) || 0,                    // Col E
      badgeCategory: data[i][5] ? data[i][5].toString() : '',    // Col F
      badgeTier    : Number(data[i][6]) || 0,                    // Col G
      badgeMeta    : data[i][7] ? data[i][7].toString() : ''     // Col H
    });
  }

  return badgesDBList;
}


/**
 * PRIVATE HELPER: Reads BadgeAwardDB and returns an array of award objects.
 *
 * All records returned — frontend filters to Active status as needed.
 *
 * Column mapping (0-indexed):
 *   A=0  awardId      B=1  badgeId      C=2  memberId
 *   D=3  awardedBy    E=4  awardedDate  F=5  status    G=6  notes
 *
 * @param {Map<string, GoogleAppsScript.Spreadsheet.Sheet>} sheetMap
 * @returns {Array<{awardId, badgeId, memberId, awardedBy, awardedDate, status, notes}>}
 */
function buildBadgeAwardsDBList_(ss) {
  const sheet             = ss.getSheetByName(BADGE_AWARD_DB_SHEET) || null;
  const badgeAwardsDBList = [];

  if (!sheet) {
    console.warn('buildBadgeAwardsDBList_: ' + BADGE_AWARD_DB_SHEET + ' not found.');
    return badgeAwardsDBList;
  }

  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;

    const rawDate = data[i][4];
    badgeAwardsDBList.push({
      awardId    : data[i][0].toString(),
      badgeId    : data[i][1].toString(),
      memberId   : data[i][2].toString(),
      awardedBy  : data[i][3].toString(),
      awardedDate: rawDate instanceof Date
        ? Utilities.formatDate(rawDate, Session.getScriptTimeZone(), 'dd-MMM-yyyy')
        : String(rawDate || ''),
      status: data[i][5].toString(),
      notes : data[i][6] ? data[i][6].toString() : ''
    });
  }

  return badgeAwardsDBList;
}

/**
 * buildPersonaProfileDBList_()
 *
 * Reads PersonaProfileDB into a flat array of persona profile objects.
 * JSON fields (axisVerdicts, insights, blindSpot, raritySummary) are shipped
 * as raw strings and parsed lazily client-side on first render to keep W3 fast.
 * Suppressed rows are included — the frontend hides them on other members'
 * profiles but the current user always sees their own.
 *
 * @param {Spreadsheet} ss
 * @returns {Array<Object>}
 */
function buildPersonaProfileDBList_(ss) {
  const sheet = ss.getSheetByName('PersonaProfileDB');
  const list  = [];
  if (!sheet) return list;
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return list;
  const data = sheet.getRange(1, 1, lastRow, 12).getValues();
  for (let i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    list.push({
      memberId        : data[i][0].toString().trim(),   // Col A
      archetypeKey    : data[i][1].toString().trim(),   // Col B
      archetypeName   : data[i][2].toString().trim(),   // Col C
      archetypeEmoji  : data[i][3].toString().trim(),   // Col D
      archetypeTagline: data[i][4].toString().trim(),   // Col E
      axisVerdicts    : data[i][5].toString().trim(),   // Col F — JSON string
      insights        : data[i][6].toString().trim(),   // Col G — JSON string
      blindSpot       : data[i][7].toString().trim(),   // Col H — JSON string or blank
      raritySummary   : data[i][8].toString().trim(),   // Col I — JSON string
      computedDate    : data[i][9].toString().trim(),   // Col J
      engineVersion   : data[i][10].toString().trim(),  // Col K
      status          : data[i][11].toString().trim()   // Col L
    });
  }
  return list;
}

/**
 * updatePersonaVisibility()
 *
 * Updates PersonaProfileDB Col L (Status) for the authenticated member to
 * 'Active' (visible to others) or 'Suppressed' (own-profile only). Called
 * immediately when the user flips the privacy toggle in Edit Profile — not
 * bundled with saveProfileEdit() since it writes a different table.
 *
 * @param {boolean} isVisible - true → 'Active', false → 'Suppressed'
 * @returns {{ status: string, newStatus?: string, message?: string }}
 */
function updatePersonaVisibility(isVisible) {
  const memberId = getVerifiedMemberId();
  if (!memberId) return { status: 'unauthorized' };
  try {
    const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName('PersonaProfileDB');
    if (!sheet) return { status: 'error', message: 'PersonaProfileDB not found.' };

    const data      = sheet.getDataRange().getValues();
    const newStatus = isVisible ? 'Active' : 'Suppressed';

    for (let i = 1; i < data.length; i++) {
      if ((data[i][0] || '').toString().trim() === memberId) {
        sheet.getRange(i + 1, 12).setValue(newStatus); // Col L = index 12 (1-based)
        console.log('updatePersonaVisibility: ' + memberId + ' → ' + newStatus);
        return { status: 'success', newStatus: newStatus };
      }
    }
    // No row found — member's PersonaPass hasn't run yet. Safe to ignore:
    // the default is visible, and the next PersonaPass will create the row as Active.
    return { status: 'success', newStatus: newStatus, note: 'No existing row — default applies.' };
  } catch (e) {
    console.error('updatePersonaVisibility failed:', e);
    return { status: 'error', message: e.toString() };
  }
}

/**
 * PRIVATE HELPER: Reads ActivityTypeDB and returns an array of activity type objects.
 *
 * NOTE: ActivityClubPoints is in Col B (index 1) following the Col B migration.
 * If your sheet still has it in Col E (index 4), update the index below.
 *
 * Column mapping after Col B migration (0-indexed):
 *   A=0  activityTypeID (ARKA_ACTTYP_X)
 *   B=1  activityClubPoints  ← MOVED from Col E
 *   C=2  activityType (human-readable name)
 *   D=3  activityDesc
 *   E=4  activityIntroDate
 *
 * Only 2 columns are read (A + B) — the frontend only needs TypeID and Points.
 * The human-readable name and description are unused at runtime.
 *
 *@param ss --> Sheet object
 * @returns {Array<{
 *   activityTypeID:     string,
 *   activityClubPoints: number
 * }>} Array of activity type objects. Empty array if sheet not found.
 */
function buildActivityTypeList_(ss) {
  const sheet            = ss.getSheetByName('ActivityTypeDB') || null;
  const activityTypeList = [];
 
  if (!sheet) {
    console.warn('buildActivityTypeList_: ActivityTypeDB not found in sheetMap.');
    return activityTypeList;
  }
 
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return activityTypeList; // Header only — no data rows
 
  // Read only 2 columns (A + B) — TypeID and Points
  // This is the minimum needed and avoids shipping unused columns
  const data = sheet.getRange(1, 1, lastRow, 2).getValues();
 
  for (let i = 1; i < data.length; i++) {
    // Skip blank rows — Col A (activityTypeID) must be present
    if (!data[i][0]) continue;
 
    activityTypeList.push({
      activityTypeID    : data[i][0],           // Col A — TypeID
      activityClubPoints: Number(data[i][1]) || 0  // Col B — Points
    });
  }
 
  return activityTypeList;
}
 
 
/**
 * PRIVATE HELPER: Reads all ChallengeEnrollmentDB rows.
 * All rows are returned — the frontend filters to the current user's enrollments
 * for the Me tab, and uses the full set for Club leaderboard views.
 *
 * Column mapping (0-indexed):
 *   A=0  enrollmentId          B=1  challengeId         C=2  memberId
 *   D=3  enrolledOn            E=4  enrollmentStatus    F=5  currentProgressValue
 *   G=6  progressStateJson     H=7  lastProgressUpdate  I=8  completedOn
 *
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss - Open spreadsheet instance
 * @returns {ChallengeEnrollmentRecord[]} Array of all enrollment objects
 */
function fetchChallengeEnrollments(ss) {
  const sheet = ss.getSheetByName(CHALLENGE_ENROLLMENT_SHEET);
  if (!sheet) return []; // Sheet not yet created — fail silently on first deploy
 
  const data        = sheet.getDataRange().getValues();
  const enrollments = [];
 
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[0]) continue; // Skip blank rows
 
    // Normalise Date objects → strings
    const rawEnrolledOn          = row[3];
    const rawLastProgressUpdate  = row[7];
    const rawCompletedOn         = row[8];
 
    const enrolledOnStr = rawEnrolledOn instanceof Date
      ? Utilities.formatDate(rawEnrolledOn, Session.getScriptTimeZone(), 'dd-MM-yyyy HH:mm:ss Z')
      : String(rawEnrolledOn || '');
 
    const lastProgressUpdateStr = rawLastProgressUpdate instanceof Date
      ? Utilities.formatDate(rawLastProgressUpdate, Session.getScriptTimeZone(), 'dd-MM-yyyy HH:mm:ss Z')
      : String(rawLastProgressUpdate || '');
 
    const completedOnStr = rawCompletedOn instanceof Date
      ? Utilities.formatDate(rawCompletedOn, Session.getScriptTimeZone(), 'dd-MM-yyyy HH:mm:ss Z')
      : String(rawCompletedOn || '');
 
    enrollments.push({
      enrollmentId          : row[0].toString(),
      challengeId           : row[1].toString(),
      memberId              : row[2].toString(),
      enrolledOn            : enrolledOnStr,
      enrollmentStatus      : row[4].toString(),  // Active | Winner | Finisher | Dropped
      currentProgressValue  : Number(row[5]) || 0,
      progressStateJson     : row[6].toString(),  // Raw JSON string — frontend parses on demand
      lastProgressUpdate    : lastProgressUpdateStr,
      completedOn           : completedOnStr
    });
  }
 
  return enrollments;
}

/**
 * ADMIN ONLY: Creates a new challenge or updates an existing one.
 *
 * @param {Object}  data
 * @param {string}  [data.challengeId]
 * @param {string}  data.challengeType
 * @param {string}  data.title
 * @param {string}  [data.description]
 * @param {string}  data.startDate         - dd-MMM-yyyy
 * @param {string}  [data.endDate]
 * @param {number}  data.goalValue
 * @param {string}  data.goalUnit
 * @param {string}  data.goalConfigJson
 * @param {string}  data.status
 * @param {string}  data.competitionMode  - NONE | INDIVIDUAL | SHARED | TEAM
 * @param {string}  [data.seriesTag]
 * @param {boolean} data.isPinned
 * @param {number}  data.enrollPoints      - ☀️ for enrolling
 * @param {number}  data.finishPoints      - ☀️ for finishing
 * @param {number}  data.winPoints         - ☀️ for winning (0 for personal challenges)
 * @returns {{ status: string, challenge?: ChallengeRecord, message?: string }}
 */
function saveChallenge(data) {
 
  const currentMemberId = getVerifiedMemberId();
  if (!currentMemberId)              return { status: 'error', message: 'Unauthorized session.' };
  if (!isAdminMember(currentMemberId)) return { status: 'error', message: 'Admin access required.' };
 
  const title         = (data.title         || '').trim();
  const challengeType = (data.challengeType || '').trim();
  const startDate     = (data.startDate     || '').trim();
 
  if (!title)         return { status: 'error', message: 'Challenge title cannot be empty.'  };
  if (!challengeType) return { status: 'error', message: 'Challenge type is required.'        };
  if (!startDate)     return { status: 'error', message: 'Start date is required.'            };
 
  const validTypes = [
    'HABIT_STREAK', 'BINGO_GRID', 'BUDDY_READ',
    'COUNTRY_SPREAD', 'ALPHABET', 'BOOK_COUNT', 'PAGE_COUNT', '10PAGESADAY', 'BOOK_HUNT'
  ];
  if (!validTypes.includes(challengeType)) {
    return { status: 'error', message: 'Invalid challenge type: ' + challengeType };
  }
 
  const goalConfigJsonStr = (data.goalConfigJson || '{}').trim();
  try { JSON.parse(goalConfigJsonStr); } catch (e) {
    return { status: 'error', message: 'goalConfigJson is not valid JSON.' };
  }
 
  const ss             = SpreadsheetApp.openById(SPREADSHEET_ID);
  const challengeSheet = ss.getSheetByName(CHALLENGE_SHEET);
  if (!challengeSheet) return { status: 'error', message: 'ChallengeDB sheet not found.' };
 
  const timestamp     = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd-MM-yyyy HH:mm:ss Z');
  const status        = (data.status    || 'Active').trim();
  const isPinned      = data.isPinned      === true || data.isPinned      === 'TRUE';
  const competitionMode = parseCompetitionMode_(data.competitionMode);
  const seriesTag     = (data.seriesTag  || '').trim();
  const endDate       = (data.endDate    || '').trim();
  const goalValue     = Number(data.goalValue)    || 0;
  const goalUnit      = (data.goalUnit   || '').trim();
  const description   = (data.description || '').trim();
  const enrollPoints  = Number(data.enrollPoints)  || 0;   // Col P
  const finishPoints  = Number(data.finishPoints)  || 0;   // Col Q
  const winPoints     = Number(data.winPoints)     || 0;   // Col R
 
  // ── UPDATE path ─────────────────────────────────────────────────────────
  if (data.challengeId) {
    // Acquire a script lock to prevent concurrent admin edits from clobbering each other.
    // This is especially important if ADMIN_MEMBER_IDS_BACKEND ever has more than one entry.
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(8000)) {
      return { status: 'error', message: 'System is currently busy. Please try again in a moment.' };
    }
    try {
      const sheetData = challengeSheet.getDataRange().getValues();
      let targetRow   = -1;
  
      for (let i = 1; i < sheetData.length; i++) {
        if (sheetData[i][0].toString() === data.challengeId.toString()) {
          targetRow = i + 1;
          break;
        }
      }
      if (targetRow === -1) return { status: 'error', message: 'Challenge not found.' };
  
      const originalCreatedBy = sheetData[targetRow - 1][13].toString();
      const originalCreatedOn = sheetData[targetRow - 1][14].toString();
  
      // Write all 18 columns A–R in one call
      challengeSheet.getRange(targetRow, 1, 1, 18).setValues([[
        data.challengeId, challengeType, title,     description, startDate,
        endDate,          goalValue,     goalUnit,  goalConfigJsonStr,
        status,           competitionMode, seriesTag, isPinned,
        originalCreatedBy, originalCreatedOn,
        enrollPoints,     finishPoints,  winPoints
      ]]);

      const updatedChallenge = {
        challengeId: data.challengeId, challengeType, title, description,
        startDate, endDate, goalValue, goalUnit, goalConfigJson: goalConfigJsonStr,
        status, competitionMode, seriesTag, isPinned,
        createdBy: originalCreatedBy, createdOn: originalCreatedOn,
        enrollPoints, finishPoints, winPoints
      };
      invalidateCacheKey(CACHE_KEYS.challenges);
      return { status: 'success', challenge: updatedChallenge, isUpdate: true };
    } finally {
      lock.releaseLock();
    }
  }
 
  // ── CREATE path ──────────────────────────────────────────────────────────
  // Lock guards the ID generation + append sequence against concurrent admin creates.
  const createLock = LockService.getScriptLock();
  if (!createLock.tryLock(8000)) {
    return { status: 'error', message: 'System is currently busy. Please try again in a moment.' };
  }
  try {
    const existingData = challengeSheet.getDataRange().getValues();
    let newNum = 1;
    if (existingData.length > 1) {
      const lastId  = existingData[existingData.length - 1][0].toString();
      const lastNum = parseInt(lastId.split('_')[2]);
      if (!isNaN(lastNum)) newNum = lastNum + 1;
    }
    const challengeId = 'ARKA_CHAL_' + newNum;
  
    // 18 columns A–R
    const newRow = [
      challengeId,    challengeType,  title,     description,   startDate,
      endDate,        goalValue,      goalUnit,  goalConfigJsonStr,
      status,         competitionMode, seriesTag, isPinned,
      currentMemberId, timestamp,
      enrollPoints,   finishPoints,   winPoints
    ];

    challengeSheet.appendRow(newRow);

    const newChallenge = {
      challengeId, challengeType, title, description,
      startDate, endDate, goalValue, goalUnit, goalConfigJson: goalConfigJsonStr,
      status, competitionMode, seriesTag, isPinned,
      createdBy: currentMemberId, createdOn: timestamp,
      enrollPoints, finishPoints, winPoints
    };

    invalidateCacheKey(CACHE_KEYS.challenges);
    return { status: 'success', challenge: newChallenge, isUpdate: false };
  } finally {
    createLock.releaseLock();
  }
}

/**
 * Enrols the current user in a challenge.
 * Awards enrollPoints from ChallengeDB via the new ARKA_ACTTYP_CHALLENGE_ENROLL type.
 *
 * @param {Object}  data
 * @param {string}  data.challengeId
 * @param {number}  [data.personalGoal]
 * @param {Object}  [data.activityPointsMap]
 * @returns {{ status: string, enrollment?: ChallengeEnrollmentRecord, message?: string }}
 */
function enrollInChallenge(data) {
 
  const currentMemberId = getVerifiedMemberId();
  if (!currentMemberId) return { status: 'error', message: 'Unauthorized session.' };
  if (!data.challengeId) return { status: 'error', message: 'Challenge ID is required.' };
 
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
 
  // ── Fetch and validate challenge ─────────────────────────────────────────
  const challengeSheet = ss.getSheetByName(CHALLENGE_SHEET);
  if (!challengeSheet) return { status: 'error', message: 'ChallengeDB sheet not found.' };
 
  const challengeRows = challengeSheet.getDataRange().getValues();
  let targetChallenge = null;
 
  for (let i = 1; i < challengeRows.length; i++) {
    if (challengeRows[i][0].toString() === data.challengeId.toString()) {
      targetChallenge = {
        challengeId    : challengeRows[i][0].toString(),
        challengeType  : challengeRows[i][1].toString(),
        goalValue      : Number(challengeRows[i][6]) || 0,
        goalUnit       : challengeRows[i][7].toString(),
        goalConfigJson : challengeRows[i][8].toString(),
        status         : challengeRows[i][9].toString(),
        enrollPoints   : Number(challengeRows[i][15]) || 0  // Col P
      };
      break;
    }
  }
 
  if (!targetChallenge) return { status: 'error', message: 'Challenge not found.' };
  if (targetChallenge.status !== 'Active') {
    return { status: 'error', message: 'This challenge is not currently active.' };
  }
 
  // ── Duplicate check ───────────────────────────────────────────────────────
  const enrollmentSheet = ss.getSheetByName(CHALLENGE_ENROLLMENT_SHEET);
  if (!enrollmentSheet) return { status: 'error', message: 'ChallengeEnrollmentDB sheet not found.' };
 
  const enrollmentRows = enrollmentSheet.getDataRange().getValues();
  for (let i = 1; i < enrollmentRows.length; i++) {
    if (enrollmentRows[i][1].toString() !== data.challengeId.toString()) continue;
    if (enrollmentRows[i][2].toString() !== currentMemberId) continue;
    if (enrollmentRows[i][4].toString() === 'Dropped') continue;
    return { status: 'error', message: 'You are already enrolled in this challenge.' };
  }
 
  // ── Lock: guards ID generation + append against concurrent enrollments ────
  // Without this, two members enrolling simultaneously can read the same last
  // row number and generate identical ARKA_ENRL_X IDs.
  const enrollLock = LockService.getScriptLock();
  if (!enrollLock.tryLock(8000)) {
    return { status: 'error', message: 'System is currently busy. Please try again.' };
  }

  try {
  // ── Re-read enrollment sheet inside the lock window ───────────────────────
  // The rows read earlier for the duplicate check may be stale by now.
  // A fresh read guarantees the ID we generate is truly the next available one.
  const freshEnrollRows = enrollmentSheet.getDataRange().getValues();
  let   newNum = 1;
  if (freshEnrollRows.length > 1) {
    const lastId  = freshEnrollRows[freshEnrollRows.length - 1][0].toString();
    const lastNum = parseInt(lastId.split('_')[2]);
    if (!isNaN(lastNum)) newNum = lastNum + 1;
  }
  const enrollmentId = 'ARKA_ENRL_' + newNum;
  const enrollTzOffset = (data.clientTzOffset || '').toString().trim();
  const timestamp      = buildArkaTimestamp_(enrollTzOffset);
 
  // ── Build initial progressStateJson ──────────────────────────────────────
  let config = {};
  try { config = JSON.parse(targetChallenge.goalConfigJson || '{}'); } catch (e) {}
 
  const initialProgressState = buildInitialProgressState(
    targetChallenge.challengeType,
    config,
    targetChallenge.goalValue,
    Number(data.personalGoal) || 0
  );
 
  const newRow = [
    enrollmentId, data.challengeId, currentMemberId, timestamp,
    'Active', 0, JSON.stringify(initialProgressState), timestamp, ''
  ];
  invalidateCacheKey(CACHE_KEYS.enrollments);
  enrollmentSheet.appendRow(newRow);
 
  // ── Log ENROLL activity with per-challenge points via directCp ─────────
  if (targetChallenge.enrollPoints > 0) {
    try {
      logActivityBatch(currentMemberId, [{
        typeId  : 'ARKA_ACTTYP_CHALLENGE_ENROLL',
        val     : 1,
        desc    : enrollmentId,
        directCp: targetChallenge.enrollPoints   // ← bypasses multiplier calculation
      }], 1, '', data.activityPointsMap || {},
      null,         // ss — open internally
      false,        // skipLock — no caller-held lock
      enrollTzOffset
      );
    } catch (e) {
      console.error('Enrolment activity log failed (non-fatal):', e);
    }
  }
 
  const newEnrollment = {
    enrollmentId, challengeId: data.challengeId,
    memberId: currentMemberId, enrolledOn: timestamp,
    enrollmentStatus: 'Active', currentProgressValue: 0,
    progressStateJson: JSON.stringify(initialProgressState),
    lastProgressUpdate: timestamp, completedOn: ''
  };
  
  return { status: 'success', enrollment: newEnrollment };
  } finally {
    enrollLock.releaseLock();
  }
}

/**
 * Lightweight fetcher for ChallengeEnrollmentDB.
 * Called lazily when the Challenges view is opened — NOT in the Big Gulp.
 * Returns all rows so the frontend can rebuild counts and myEnrollmentsMap.
 *
 * @returns {ChallengeEnrollmentRecord[]}
 */
function getLatestChallengeEnrollments() {
  try {
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID)
                                .getSheetByName(CHALLENGE_ENROLLMENT_SHEET);
    if (!sheet) return [];
 
    const data        = sheet.getDataRange().getValues();
    const enrollments = [];
 
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row[0]) continue;
 
      const rawEnrolledOn         = row[3];
      const rawLastProgressUpdate = row[7];
      const rawCompletedOn        = row[8];
 
      const toStr = function(v) {
        return v instanceof Date
          ? Utilities.formatDate(v, Session.getScriptTimeZone(), 'dd-MM-yyyy HH:mm:ss Z')
          : String(v || '');
      };
 
      enrollments.push({
        enrollmentId         : row[0].toString(),
        challengeId          : row[1].toString(),
        memberId             : row[2].toString(),
        enrolledOn           : toStr(rawEnrolledOn),
        enrollmentStatus     : row[4].toString(),
        currentProgressValue : Number(row[5]) || 0,
        progressStateJson    : row[6].toString(),
        lastProgressUpdate   : toStr(rawLastProgressUpdate),
        completedOn          : toStr(rawCompletedOn)
      });
    }
 
    return enrollments;
  } catch (e) {
    console.error('getLatestChallengeEnrollments failed:', e);
    return [];
  }
}
 
 
/**
 * PRIVATE HELPER: Builds the correct initial progressStateJson object
 * for each challenge type.
 *
 * @param {string} challengeType  - e.g. 'HABIT_STREAK'
 * @param {Object} config         - Parsed goalConfigJson from ChallengeDB
 * @param {number} goalValue      - The challenge's primary goalValue
 * @param {number} personalGoal   - Member's own target (BOOK_COUNT / PAGE_COUNT only)
 * @returns {Object} The initial progress state object (to be JSON.stringified)
 */
function buildInitialProgressState(challengeType, config, goalValue, personalGoal) {
 
  if (challengeType === 'HABIT_STREAK') {
    return {
      currentStreak   : 0,
      longestStreak   : 0,
      totalDaysLogged : 0,
      totalPagesLogged: 0,
      lastLogDate     : '',
      missedDates     : [],
      streakHistory   : []
    };
  }
 
  if (challengeType === 'BINGO_GRID') {
    return {
      cellsCompleted  : [],
      booksLinked     : {},
      genreTagged     : {},
      linesCompleted  : [],
      hasBingo        : false
    };
  }
 
  if (challengeType === 'BUDDY_READ') {
    return {
      pagesRead              : 0,
      shelfRecordId          : '',
      currentShelfStatus     : 'To Read',
      finishedBeforeDeadline : null
    };
  }
 
  if (challengeType === 'COUNTRY_SPREAD') {
    return {
      countriesVisited  : {},
      totalCountries    : 0,
      continentProgress : {
        Africa    : 0,
        Americas  : 0,
        Asia      : 0,
        Europe    : 0,
        Oceania   : 0,
        MiddleEast: 0
      }
    };
  }
 
  if (challengeType === 'ALPHABET') {
    // Build the full letterMap — all 26 letters set to null (unclaimed)
    const allLetters = (config.allLetters || 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''));
    const letterMap  = {};
    allLetters.forEach(function(letter) { letterMap[letter] = null; });
 
    return {
      letterMap                : letterMap,
      lettersCompleted         : 0,
      optionalLettersCompleted : 0
    };
  }
 
  if (challengeType === 'BOOK_COUNT') {
    // Use personalGoal if provided and allowPersonalGoal is true, else use challenge default
    const effectiveGoal = (config.allowPersonalGoal && personalGoal > 0)
      ? personalGoal
      : (config.defaultGoal || goalValue || 24);
 
    return {
      personalGoal     : effectiveGoal,
      booksRead        : [],
      totalBooks       : 0,
      pacingProjection : 0,
      monthlyBreakdown : {}
    };
  }
 
  if (challengeType === 'PAGE_COUNT') {
    const effectiveGoal = (config.allowPersonalGoal && personalGoal > 0)
      ? personalGoal
      : (config.defaultGoal || goalValue || 5000);
 
    return {
      personalGoal       : effectiveGoal,
      totalPages         : 0,
      monthlyBreakdown   : {},
      weeklyBreakdown    : {},
      pacingProjection   : 0,
      aheadBehindTarget  : ''
    };
  }
 
  if (challengeType === '10PAGESADAY') {
    const year      = config.year      || new Date().getFullYear();
    const dailyGoal = config.dailyGoal || 10;
    return {
      year           : year,
      dailyGoal      : dailyGoal,
      yearlyGoal     : dailyGoal * 365,
      totalPages     : 0,
      monthlyBreakdown: {},
      avgPagesPerDay : 0,
      isFinisher     : false
    };
  }

  if (challengeType === 'BOOK_HUNT') {
    return {
      claims        : {},   // { clueId: { shelfId, bookTitle, claimedOn, status } }
      completedCount: 0,
      isFinisher    : false,
      finishedOn    : ''
    };
  }

  // Fallback for unknown types
  return {};
}
 
 
/**
 * Drops the current user from a challenge.
 *
 * Sets enrollmentStatus to 'Dropped'. The row is preserved for audit purposes.
 * A member who has Dropped may re-enrol — enrollInChallenge() skips Dropped rows
 * in its duplicate check.
 *
 * @param {string} challengeId - ARKA_CHAL_X to drop from
 * @returns {{ status: string, message?: string }}
 */
function dropFromChallenge(challengeId) {
 
  const currentMemberId = getVerifiedMemberId();
  if (!currentMemberId) return { status: 'error', message: 'Unauthorized session.' };
 
  if (!challengeId) return { status: 'error', message: 'Challenge ID is required.' };
 
  const ss              = SpreadsheetApp.openById(SPREADSHEET_ID);
  const enrollmentSheet = ss.getSheetByName(CHALLENGE_ENROLLMENT_SHEET);
  if (!enrollmentSheet) return { status: 'error', message: 'ChallengeEnrollmentDB sheet not found.' };
 
  const enrollmentRows = enrollmentSheet.getDataRange().getValues();
 
  for (let i = 1; i < enrollmentRows.length; i++) {
    if (enrollmentRows[i][1].toString() !== challengeId.toString()) continue;
    if (enrollmentRows[i][2].toString() !== currentMemberId) continue;
    if (enrollmentRows[i][4].toString() === 'Dropped') continue; // Already dropped
 
    invalidateCacheKey(CACHE_KEYS.enrollments);
    enrollmentSheet.getRange(i + 1, 5).setValue('Dropped'); // Col E = enrollmentStatus
    return { status: 'success' };
  }
 
  return { status: 'error', message: 'Active enrollment not found.' };
}

/**
 * Saves updated challenge progress for the current user.
 *
 * Handles all challenge types. The frontend sends the full updated
 * progressStateJson and the engine:
 *   1. Writes the updated state to ChallengeEnrollmentDB
 *   2. Runs completion detection for the challenge type
 *   3. If newly Finished or Won, updates enrollmentStatus and logs points
 *
 * Column write positions (1-based for getRange):
 *   E=5  enrollmentStatus     F=6  currentProgressValue
 *   G=7  progressStateJson    H=8  lastProgressUpdate   I=9  completedOn
 *
 * @param {Object}  data
 * @param {string}  data.enrollmentId        - ARKA_ENRL_X to update
 * @param {number}  data.currentProgressValue - Updated integer progress metric
 * @param {string}  data.progressStateJson    - Full updated state as JSON string
 * @param {Object}  [data.activityPointsMap]  - Client-side points map
 * @returns {{ status: string, updatedEnrollment?: Object, message?: string }}
 */
function saveChallengeProgress(data) {
 
  // ── Auth ─────────────────────────────────────────────────────────────────
  const currentMemberId = getVerifiedMemberId();
  if (!currentMemberId) return { status: 'error', message: 'Unauthorized session.' };
 
  if (!data.enrollmentId)       return { status: 'error', message: 'Enrollment ID is required.' };
  if (!data.progressStateJson)  return { status: 'error', message: 'Progress state is required.' };
 
  // Validate JSON
  try { JSON.parse(data.progressStateJson); } catch (e) {
    return { status: 'error', message: 'progressStateJson is not valid JSON.' };
  }
 
  const ss              = SpreadsheetApp.openById(SPREADSHEET_ID);
  const enrollmentSheet = ss.getSheetByName(CHALLENGE_ENROLLMENT_SHEET);
  if (!enrollmentSheet) return { status: 'error', message: 'ChallengeEnrollmentDB not found.' };
 
  const enrollmentRows = enrollmentSheet.getDataRange().getValues();
  let   targetRowIndex = -1;
  let   existingRow    = null;
 
  for (let i = 1; i < enrollmentRows.length; i++) {
    if (enrollmentRows[i][0].toString() !== data.enrollmentId.toString()) continue;
    // Security: verify the row belongs to the calling member
    if (enrollmentRows[i][2].toString() !== currentMemberId) {
      return { status: 'error', message: 'You can only update your own progress.' };
    }
    targetRowIndex = i + 1; // 1-based for getRange
    existingRow    = enrollmentRows[i];
    break;
  }
 
  if (targetRowIndex === -1) return { status: 'error', message: 'Enrollment not found.' };
 
  const challengeId       = existingRow[1].toString();
  const currentStatus     = existingRow[4].toString();
 
  // Don't update progress on already-completed or dropped enrollments
  if (currentStatus === 'Dropped') {
    return { status: 'error', message: 'Cannot update progress on a dropped enrollment.' };
  }
 
  // ── Fetch challenge for completion rules ─────────────────────────────────
  const challengeSheet = ss.getSheetByName(CHALLENGE_SHEET);
  if (!challengeSheet) return { status: 'error', message: 'ChallengeDB not found.' };
 
  const challengeRows = challengeSheet.getDataRange().getValues();
  let   challenge     = null;
 
  for (let i = 1; i < challengeRows.length; i++) {
    if (challengeRows[i][0].toString() !== challengeId) continue;
    challenge = {
      challengeType  : challengeRows[i][1].toString(),
      goalValue      : Number(challengeRows[i][6]) || 0,
      goalConfigJson : challengeRows[i][8].toString(),
      competitionMode: parseCompetitionMode_(challengeRows[i][10]),
      finishPoints   : Number(challengeRows[i][16]) || 0,  // Col Q
      winPoints      : Number(challengeRows[i][17]) || 0   // Col R
    };
    break;
  }
 
  if (!challenge) return { status: 'error', message: 'Challenge not found.' };
 
  // ── Run completion detection ──────────────────────────────────────────────
  let config = {};
  try { config = JSON.parse(challenge.goalConfigJson || '{}'); } catch (e) {}
 
  const newProgressValue = Number(data.currentProgressValue) || 0;
  const completionResult = detectChallengeCompletion(
    challenge.challengeType,
    config,
    challenge.goalValue,
    data.progressStateJson,
    currentStatus
  );
 
  // completionResult: { newStatus: 'Active'|'Finisher'|'Winner', isNewCompletion: bool }
  const newStatus      = completionResult.newStatus;
  const isNewFinish    = completionResult.isNewCompletion && newStatus === 'Finisher';
  const isNewWin       = completionResult.isNewCompletion && newStatus === 'Winner';
  const timestamp      = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd-MM-yyyy HH:mm:ss Z');
  const completedOnVal = (isNewFinish || isNewWin) ? timestamp : existingRow[8].toString();
 
  // ── Write updated row columns E–I in one range call ──────────────────────
  invalidateCacheKey(CACHE_KEYS.enrollments);
  enrollmentSheet.getRange(targetRowIndex, 5, 1, 5).setValues([[
    newStatus,              // E — enrollmentStatus
    newProgressValue,       // F — currentProgressValue
    data.progressStateJson, // G — progressStateJson
    timestamp,              // H — lastProgressUpdate
    completedOnVal          // I — completedOn
  ]]);
 
  // ── Log finish / win activity with per-challenge points ──────────────────
  if (isNewFinish && challenge.finishPoints > 0) {
    try {
      logActivityBatch(currentMemberId, [{
        typeId  : 'ARKA_ACTTYP_CHALLENGE_FINISH',
        val     : 1,
        desc    : data.enrollmentId,
        directCp: challenge.finishPoints
      }], 1, '', data.activityPointsMap || {});
    } catch (e) { console.error('Finish activity log failed (non-fatal):', e); }
  }
 
  if (isNewWin && challenge.winPoints > 0) {
    try {
      logActivityBatch(currentMemberId, [{
        typeId  : 'ARKA_ACTTYP_CHALLENGE_WIN',
        val     : 1,
        desc    : data.enrollmentId,
        directCp: challenge.winPoints
      }], 1, '', data.activityPointsMap || {});
    } catch (e) { console.error('Win activity log failed (non-fatal):', e); }
  }
 
  const updatedEnrollment = {
    enrollmentId         : data.enrollmentId,
    challengeId          : challengeId,
    memberId             : currentMemberId,
    enrolledOn           : existingRow[3].toString(),
    enrollmentStatus     : newStatus,
    currentProgressValue : newProgressValue,
    progressStateJson    : data.progressStateJson,
    lastProgressUpdate   : timestamp,
    completedOn          : completedOnVal
  };
 
  return {
    status            : 'success',
    updatedEnrollment : updatedEnrollment,
    isNewFinish       : isNewFinish,
    isNewWin          : isNewWin
  };
}

/**
 * Recalculates and syncs progress for all active BOOK_COUNT and PAGE_COUNT
 * challenge enrollments belonging to a given member.
 *
 * Uses ABSOLUTE recalculation from source data — counts finished books from
 * MemberShelfDB and sums pages from PageLogDB since the challenge startDate.
 * Never uses deltas so drift is impossible.
 *
 * Called automatically after:
 *   - A book is marked 'Finished' in updateMemberShelf()
 *   - Pages are logged to PageLogDB
 *
 * @param {string} memberId - ARKA_MEMBER_X whose enrollments to sync
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss - Open spreadsheet instance
 */
function syncCountChallengeProgress(memberId, ss, preReadShelfRows = null, preReadPageLogRows = null) {
  try {
    const enrollmentSheet = ss.getSheetByName(CHALLENGE_ENROLLMENT_SHEET);
    const challengeSheet  = ss.getSheetByName(CHALLENGE_SHEET);
    if (!enrollmentSheet || !challengeSheet) return;
 
    const enrollmentRows = enrollmentSheet.getDataRange().getValues();
    const challengeRows  = challengeSheet.getDataRange().getValues();
 
    // Build a quick challenge lookup: challengeId → challenge object
    const challengeLookup = {};
    for (let i = 1; i < challengeRows.length; i++) {
      const row = challengeRows[i];
      if (!row[0]) continue;
      challengeLookup[row[0].toString()] = {
        challengeId   : row[0].toString(),
        challengeType : row[1].toString(),
        goalValue     : Number(row[6]) || 0,
        goalConfigJson: row[8].toString(),
        startDate     : row[4] instanceof Date
          ? Utilities.formatDate(row[4], Session.getScriptTimeZone(), 'dd-MMM-yyyy')
          : String(row[4] || ''),
        endDate       : row[5] instanceof Date                                        // ← ADDED: Col F
          ? Utilities.formatDate(row[5], Session.getScriptTimeZone(), 'dd-MMM-yyyy')
          : String(row[5] || ''),
        finishPoints  : Number(row[16]) || 0,  // Col Q
        winPoints     : Number(row[17]) || 0   // Col R
      };
    }
 
    // Find active BOOK_COUNT and PAGE_COUNT enrollments for this member
    const countTypes = new Set(['BOOK_COUNT', 'PAGE_COUNT']);
    let   rowsToSync = [];
 
    for (let i = 1; i < enrollmentRows.length; i++) {
      const row = enrollmentRows[i];
      if (!row[0]) continue;
      if (row[2].toString() !== memberId) continue;
      if (row[4].toString() === 'Dropped' || row[4].toString() === 'Winner') continue;
 
      const challenge = challengeLookup[row[1].toString()];
      if (!challenge || !countTypes.has(challenge.challengeType)) continue;
 
      rowsToSync.push({ rowIndex: i + 1, enrollmentRow: row, challenge: challenge });
    }
 
    if (rowsToSync.length === 0) return; // Nothing to sync
 
    // Read source data once for all enrollments.
    // Callers already holding fresh in-memory copies (e.g. updateMemberShelf, which
    // reads both sheets inside the same lock) pass them in to avoid two redundant
    // full-sheet getDataRange() scans — the dominant cost on a cold GAS instance.
    // When a pre-read array is absent (internal callers without one), fall back to
    // reading the sheet directly so behaviour is unchanged.
    let shelfRows = preReadShelfRows;
    if (!shelfRows) {
      const shelfSheet = ss.getSheetByName(SHELF_SHEET);
      shelfRows = shelfSheet ? shelfSheet.getDataRange().getValues() : [];
    }
    let pageLogRows = preReadPageLogRows;
    if (!pageLogRows) {
      const pageLogSheet = ss.getSheetByName(PAGELOG_SHEET);
      pageLogRows = pageLogSheet ? pageLogSheet.getDataRange().getValues() : [];
    }
 
    const rsvpTzOffset = (data.clientTzOffset || '').toString().trim();
  const timestamp    = buildArkaTimestamp_(rsvpTzOffset);
 
    rowsToSync.forEach(function(item) {
      const challenge   = item.challenge;
      const enrollment  = item.enrollmentRow;
      const currentStatus = enrollment[4].toString();
 
      let config = {};
      try { config = JSON.parse(challenge.goalConfigJson || '{}'); } catch (e) {}
 
      // Parse start date to a comparable number (ms since epoch)
      const startDateMs = parseChallengeStartDate(challenge.startDate);
      const endDateMs = challenge.endDate
         ? parseChallengeStartDate(challenge.endDate) + (24 * 60 * 60 * 1000) // inclusive: add 1 day
         : Infinity;
 
      let newProgressValue = 0;
      let updatedState     = {};
      try { updatedState = JSON.parse(enrollment[6].toString() || '{}'); } catch (e) {}
 
      // ── BOOK_COUNT: count Finished books since challenge start ─────────────
      if (challenge.challengeType === 'BOOK_COUNT') {
        const booksRead    = [];
        const monthlyBreakdown = {};
 
        for (let j = 1; j < shelfRows.length; j++) {
          const sRow = shelfRows[j];
          if (!sRow[0]) continue;
          if (sRow[1].toString() !== memberId) continue;      // wrong member
          if (sRow[3].toString() !== 'Finished') continue;    // not finished
 
          // Use dateFinished (Col I) if available, else dateUpdated (Col H).
          // parseSheetTimestamp_ handles both native Date objects and "dd-MMM-yyyy" strings —
          // parse once here and reuse the Date object to avoid repeated unsafe new Date() calls.
          const finishedDate = parseSheetTimestamp_(sRow[8] || sRow[7]);
          const finishedMs   = finishedDate.getTime();

          if (isNaN(finishedMs) || finishedMs < startDateMs || finishedMs > endDateMs) continue;

          const bookId     = sRow[2].toString();
          const finishedOn = Utilities.formatDate(
            finishedDate, Session.getScriptTimeZone(), 'dd-MMM-yyyy'
          );

          // Get book title from globalBooksDB equivalent — just store bookId
          booksRead.push({ bookId: bookId, title: '', finishedOn: finishedOn });

          // Monthly breakdown key: 'Jan', 'Feb', etc.
          const monthKey = ['Jan','Feb','Mar','Apr','May','Jun',
                            'Jul','Aug','Sep','Oct','Nov','Dec'][finishedDate.getMonth()] || '?';
          monthlyBreakdown[monthKey] = (monthlyBreakdown[monthKey] || 0) + 1;
        }
 
        newProgressValue = booksRead.length;
        const personalGoal = updatedState.personalGoal || config.defaultGoal || challenge.goalValue || 24;
 
        // Calculate pacing projection
        const pacingProjection = calculatePacingProjection(
          newProgressValue, challenge.startDate, new Date()
        );
 
        updatedState = {
          personalGoal     : personalGoal,
          booksRead        : booksRead,
          totalBooks       : newProgressValue,
          pacingProjection : pacingProjection,
          monthlyBreakdown : monthlyBreakdown
        };
      }
 
      // ── PAGE_COUNT: sum all page logs since challenge start ────────────────
      if (challenge.challengeType === 'PAGE_COUNT') {
        let   totalPages       = 0;
        const monthlyBreakdown = {};
        const weeklyBreakdown  = {};
 
        for (let j = 1; j < pageLogRows.length; j++) {
          const pRow = pageLogRows[j];
          if (!pRow[0]) continue;
          if (pRow[2].toString() !== memberId) continue;

          // parseSheetTimestamp_ handles the "dd-MM-yyyy HH:mm:ss Z" format that
          // new Date() rejects in GAS V8 — parse once and reuse for all date operations.
          const logDate = parseSheetTimestamp_(pRow[1]);
          const logMs   = logDate.getTime();

          if (isNaN(logMs) || logMs < startDateMs || logMs > endDateMs) continue;

          const pages = Number(pRow[4]) || 0;
          if (pages <= 0) continue;

          totalPages += pages;

          const monthKey = ['Jan','Feb','Mar','Apr','May','Jun',
                            'Jul','Aug','Sep','Oct','Nov','Dec'][logDate.getMonth()] || '?';
          monthlyBreakdown[monthKey] = (monthlyBreakdown[monthKey] || 0) + pages;

          const weekNum = getISOWeekNumber(logDate);
          const weekKey = 'W' + String(weekNum).padStart(2, '0');
          weeklyBreakdown[weekKey] = (weeklyBreakdown[weekKey] || 0) + pages;
        }
 
        newProgressValue = totalPages;
        const personalGoal = updatedState.personalGoal || config.defaultGoal || challenge.goalValue || 5000;
        const pacingProjection = calculatePacingProjection(
          newProgressValue, challenge.startDate, new Date()
        );
 
        const aheadBehind = buildAheadBehindLabel(
          newProgressValue, personalGoal, challenge.startDate, new Date()
        );
 
        updatedState = {
          personalGoal      : personalGoal,
          totalPages        : totalPages,
          monthlyBreakdown  : monthlyBreakdown,
          weeklyBreakdown   : weeklyBreakdown,
          pacingProjection  : pacingProjection,
          aheadBehindTarget : aheadBehind
        };
      }
 
      // ── Run completion detection ────────────────────────────────────────────
      const completionResult = detectChallengeCompletion(
        challenge.challengeType,
        config,
        challenge.goalValue,
        JSON.stringify(updatedState),
        currentStatus
      );
      const newStatus         = completionResult.newStatus;
      const isNewFinish       = completionResult.isNewCompletion && newStatus === 'Finisher';
      const completedOnVal    = isNewFinish ? timestamp : enrollment[8].toString();
 
      // ── Write updated row columns E–I ─────────────────────────────────────
      enrollmentSheet.getRange(item.rowIndex, 5, 1, 5).setValues([[
        newStatus,
        newProgressValue,
        JSON.stringify(updatedState),
        timestamp,
        completedOnVal
      ]]);
 
      // ── Log finish activity if newly completed ──────────────────────────────
      if (isNewFinish && challenge.finishPoints > 0) {
        try {
          // Pass ss to avoid a second SpreadsheetApp.openById() inside logActivityBatch.
          // skipLock is intentionally omitted (defaults to false) — syncCountChallengeProgress
          // is also called from syncAndFetchEnrollment which holds no Script lock.
          logActivityBatch(
            memberId,
            [{ typeId: 'ARKA_ACTTYP_CHALLENGE_FINISH', val: 1, desc: enrollment[0].toString(), directCp: challenge.finishPoints }],
            1, '', {},
            ss   // reuse the spreadsheet instance passed in by the caller
          );
        } catch (e) {
          console.error('Count challenge finish log failed (non-fatal):', e);
        }
      }
    });
 
  } catch (e) {
    // Never let challenge sync crash the calling function
    console.error('syncCountChallengeProgress failed (non-fatal):', e);
  }
}

// ============================================================================
// PRIVATE HELPERS for syncCountChallengeProgress
// ============================================================================
 
/**
 * Parses a dd-MMM-yyyy challenge startDate string to milliseconds.
 * Returns 0 (epoch) if parsing fails — meaning all records qualify.
 * @param {string} dateStr - e.g. '01-Jan-2026'
 * @returns {number}
 */
function parseChallengeStartDate(dateStr) {
  if (!dateStr) return 0;
  try {
    // dd-MMM-yyyy → JS Date
    const parts = dateStr.split('-');
    if (parts.length !== 3) return 0;
    const months = { Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,
                     Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11 };
    const d = new Date(
      parseInt(parts[2]),
      months[parts[1]] !== undefined ? months[parts[1]] : 0,
      parseInt(parts[0])
    );
    return isNaN(d.getTime()) ? 0 : d.getTime();
  } catch (e) {
    return 0;
  }
}
 
/**
 * Projects year-end total based on current pace.
 * @param {number} currentTotal - Pages or books so far
 * @param {string} startDateStr - Challenge start date dd-MMM-yyyy
 * @param {Date}   now          - Current date
 * @returns {number} Projected year-end total (rounded)
 */
function calculatePacingProjection(currentTotal, startDateStr, now) {
  const startMs  = parseChallengeStartDate(startDateStr);
  const elapsedDays = Math.max(1, (now.getTime() - startMs) / (1000 * 60 * 60 * 24));
  const yearEnd  = new Date(now.getFullYear(), 11, 31);
  const totalDays = Math.max(1, (yearEnd.getTime() - startMs) / (1000 * 60 * 60 * 24));
  return Math.round((currentTotal / elapsedDays) * totalDays);
}
 
/**
 * Returns a human-readable ahead/behind label for PAGE_COUNT.
 * @param {number} currentTotal
 * @param {number} personalGoal
 * @param {string} startDateStr
 * @param {Date}   now
 * @returns {string} e.g. '+340 pages ahead of pace' or '120 pages behind pace'
 */
function buildAheadBehindLabel(currentTotal, personalGoal, startDateStr, now) {
  const startMs     = parseChallengeStartDate(startDateStr);
  const yearEnd     = new Date(now.getFullYear(), 11, 31);
  const totalDays   = Math.max(1, (yearEnd.getTime() - startMs) / (1000 * 60 * 60 * 24));
  const elapsedDays = Math.max(1, (now.getTime() - startMs) / (1000 * 60 * 60 * 24));
  const expectedByNow = Math.round(personalGoal * (elapsedDays / totalDays));
  const diff = currentTotal - expectedByNow;
  if (diff === 0) return 'exactly on pace';
  return (diff > 0 ? '+' : '') + diff.toLocaleString() + ' pages ' + (diff > 0 ? 'ahead of' : 'behind') + ' pace';
}
 
/**
 * Returns the ISO week number (1–53) for a given Date.
 * Matches the getISOWeekNumber() function already used on the frontend.
 * @param {Date} date
 * @returns {number}
 */
function getISOWeekNumber(date) {
  const d    = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day  = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}


/**
 * PRIVATE HELPER — Safely parses any date value read from a Google Sheet cell
 * into a JavaScript Date object.
 *
 * Google Sheets' getDataRange().getValues() returns cell values in one of two forms:
 *   1. A native Date object  — when Sheets auto-parsed the cell (e.g. date-formatted cells).
 *   2. A raw string          — when Sheets could not auto-parse (e.g. the Arka Z-Format
 *                              "dd-MM-yyyy HH:mm:ss Z" which is non-standard).
 *
 * GAS V8's new Date() engine rejects non-ISO strings like "04-04-2026 14:30:00 +0530"
 * and returns Invalid Date (NaN), causing silent filter failures throughout the app.
 * This helper normalises both cases into a reliable Date object.
 *
 * Supported formats:
 *   - Native Date object            → returned as-is (no cost)
 *   - Arka Z-Format:   "dd-MM-yyyy HH:mm:ss +NNNN"  → reordered to ISO 8601
 *   - Arka Short-Date: "dd-MMM-yyyy"                 → parsed via month-name map
 *   - ISO and other natively parseable strings       → passed to new Date() as fallback
 *
 * This function mirrors the frontend's parseGoogleDate() logic, ensuring the
 * backend and frontend interpret sheet dates identically.
 *
 * @param  {Date|string|*} raw - Raw cell value from a getValues() call.
 * @returns {Date} A valid Date on success, or new Date(NaN) on parse failure.
 *                 Callers should guard with isNaN(result.getTime()).
 */
function parseSheetTimestamp_(raw) {
  // ── Case 1: Already a native Date (Sheets auto-parsed the cell) ───────────
  if (!raw) return new Date(NaN);
  if (raw instanceof Date) return raw;

  const str = raw.toString().trim();

  // ── Case 2: Arka Z-Format — "dd-MM-yyyy HH:mm:ss +NNNN" ─────────────────
  // GAS V8 rejects this format. Reorder to ISO 8601 so it parses correctly.
  // Regex captures: day, month, year, hour, minute, second, timezone offset.
  const zMatch = str.match(/^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})\s+([\+\-]\d{4})$/);
  if (zMatch) {
    // Reorder: yyyy-MM-ddTHH:mm:ss+NNNN (valid ISO 8601 with timezone)
    const isoStr = zMatch[3] + '-' + zMatch[2] + '-' + zMatch[1] +
                   'T' + zMatch[4] + ':' + zMatch[5] + ':' + zMatch[6] + zMatch[7];
    return new Date(isoStr);
  }

  // ── Case 3: Arka Short-Date — "dd-MMM-yyyy" e.g. "15-Mar-2026" ────────────
  // Construct Date explicitly via month map — avoids locale-dependent parsing.
  const SHORT_MONTH_MAP = {
    Jan:0, Feb:1, Mar:2, Apr:3, May:4,  Jun:5,
    Jul:6, Aug:7, Sep:8, Oct:9, Nov:10, Dec:11
  };
  const shortMatch = str.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (shortMatch) {
    const month = SHORT_MONTH_MAP[shortMatch[2]];
    if (month !== undefined) {
      return new Date(parseInt(shortMatch[3], 10), month, parseInt(shortMatch[1], 10));
    }
  }

  // ── Case 4: ISO or other natively parseable strings ───────────────────────
  return new Date(str);
}


/**
 * PRIVATE HELPER: Detects whether the updated progress state triggers
 * a Finisher or Winner transition for the given challenge type.
 *
 * Only promotes status — never demotes (Winner stays Winner).
 *
 * @param {string} challengeType
 * @param {Object} config          - Parsed goalConfigJson
 * @param {number} goalValue       - Primary goal number from ChallengeDB
 * @param {string} progressJsonStr - Updated progressStateJson string
 * @param {string} currentStatus   - Existing enrollmentStatus
 * @returns {{ newStatus: string, isNewCompletion: boolean }}
 */
function detectChallengeCompletion(challengeType, config, goalValue, progressJsonStr, currentStatus) {
 
  // Already at terminal state — never demote
  if (currentStatus === 'Winner') return { newStatus: 'Winner', isNewCompletion: false };
 
  let state = {};
  try { state = JSON.parse(progressJsonStr); } catch (e) {
    return { newStatus: currentStatus, isNewCompletion: false };
  }
 
  let newStatus        = currentStatus;
  let isNewCompletion  = false;
 
  // ── HABIT_STREAK ─────────────────────────────────────────────────────────
  // Win: reached 365 consecutive days. Finish: reached goalValue days total logged.
  if (challengeType === 'HABIT_STREAK') {
    const totalLogged   = state.totalDaysLogged  || 0;
    const currentStreak = state.currentStreak    || 0;
 
    if (currentStatus !== 'Winner' && currentStreak >= 365) {
      newStatus       = 'Winner';
      isNewCompletion = true;
    } else if (currentStatus === 'Active' && totalLogged >= goalValue) {
      newStatus       = 'Finisher';
      isNewCompletion = true;
    }
  }
 
  // ── BINGO_GRID ────────────────────────────────────────────────────────────
  // Finisher: linesCompleted.length >= 1 (ANY_LINE) or half cells done (HALF_CELLS)
  // Winner: ALL_CELLS completed OR ANY_LINE if that's the win condition
  if (challengeType === 'BINGO_GRID') {
    const cellsDone     = (state.cellsCompleted || []).length;
    const linesCount    = (state.linesCompleted || []).length;
    const winCond       = config.winCondition       || 'ALL_CELLS';
    const finishCond    = config.finisherCondition  || 'ANY_LINE';
    const gridSize      = config.gridSize           || 3;
    const totalCells    = gridSize * gridSize;
 
    const isWinner  = winCond === 'ALL_CELLS'
      ? cellsDone >= totalCells
      : linesCount >= 1;
 
    const isFinisher = finishCond === 'ANY_LINE'
      ? linesCount >= 1
      : cellsDone >= Math.floor(totalCells / 2);
 
    if (currentStatus !== 'Winner' && isWinner) {
      newStatus = 'Winner'; isNewCompletion = true;
    } else if (currentStatus === 'Active' && isFinisher) {
      newStatus = 'Finisher'; isNewCompletion = true;
    }
  }
 
  // ── BUDDY_READ ────────────────────────────────────────────────────────────
  // Finish only: read all pages. Win concept not applicable (winPoints = 0).
  if (challengeType === 'BUDDY_READ') {
    if (currentStatus === 'Active' && (state.pagesRead || 0) >= goalValue && goalValue > 0) {
      newStatus = 'Finisher'; isNewCompletion = true;
    }
  }
 
  // ── COUNTRY_SPREAD ────────────────────────────────────────────────────────
  // Finisher: reached goalValue countries. Winner: same goalValue (no separate bar).
  if (challengeType === 'COUNTRY_SPREAD') {
    const visited = state.totalCountries || 0;
    if (currentStatus !== 'Winner' && visited >= goalValue) {
      newStatus = 'Winner'; isNewCompletion = true;
    }
  }
 
  // ── ALPHABET ─────────────────────────────────────────────────────────────
  // Finish: completed all required letters (goalValue = 26 minus optional count).
  // Win: completed ALL 26 including optional.
  if (challengeType === 'ALPHABET') {
    const required  = state.lettersCompleted         || 0;
    const optional  = state.optionalLettersCompleted || 0;
 
    if (currentStatus !== 'Winner' && (required + optional) >= 26) {
      newStatus = 'Winner'; isNewCompletion = true;
    } else if (currentStatus === 'Active' && required >= goalValue) {
      newStatus = 'Finisher'; isNewCompletion = true;
    }
  }
 
  // ── BOOK_COUNT ────────────────────────────────────────────────────────────
  // Finisher only (winPoints = 0 for personal challenges).
  if (challengeType === 'BOOK_COUNT') {
    const goal  = state.personalGoal || goalValue || 1;
    const total = state.totalBooks   || 0;
    if (currentStatus === 'Active' && total >= goal) {
      newStatus = 'Finisher'; isNewCompletion = true;
    }
  }
 
  // ── PAGE_COUNT ────────────────────────────────────────────────────────────
  // Finisher only.
  if (challengeType === 'PAGE_COUNT') {
    const goal  = state.personalGoal || goalValue || 1;
    const total = state.totalPages   || 0;
    if (currentStatus === 'Active' && total >= goal) {
      newStatus = 'Finisher'; isNewCompletion = true;
    }
  }
 
  return { newStatus, isNewCompletion };
}

/**
 * On-demand sync + fetch for a single enrollment.
 * Runs syncCountChallengeProgress() for the current user then returns the
 * updated enrollment row so the frontend can refresh its local state.
 *
 * Only needed for BOOK_COUNT and PAGE_COUNT — other types update via
 * saveChallengeProgress() which is always called explicitly by the frontend.
 *
 * @param {string} challengeId - ARKA_CHAL_X to sync and fetch
 * @returns {{ status: string, enrollment?: ChallengeEnrollmentRecord }}
 */
function syncAndFetchEnrollment(challengeId) {
  const currentMemberId = getVerifiedMemberId();
  if (!currentMemberId) return { status: 'error', message: 'Unauthorized.' };
  if (!challengeId)     return { status: 'error', message: 'Challenge ID required.' };
 
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
 
  // Run the sync — this updates the row in ChallengeEnrollmentDB
  syncCountChallengeProgress(currentMemberId, ss);
  // Invalidate cache so the next Wave 2 fetch serves fresh enrollment data.
  invalidateCacheKey(CACHE_KEYS.enrollments);
 
  // Now fetch the updated row and return it
  const enrollmentSheet = ss.getSheetByName(CHALLENGE_ENROLLMENT_SHEET);
  if (!enrollmentSheet) return { status: 'error', message: 'ChallengeEnrollmentDB not found.' };
 
  const rows = enrollmentSheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row[1].toString() !== challengeId) continue;
    if (row[2].toString() !== currentMemberId) continue;
    if (row[4].toString() === 'Dropped') continue;
 
    const toStr = function(v) {
      return v instanceof Date
        ? Utilities.formatDate(v, Session.getScriptTimeZone(), 'dd-MM-yyyy HH:mm:ss Z')
        : String(v || '');
    };
 
    return {
      status: 'success',
      enrollment: {
        enrollmentId         : row[0].toString(),
        challengeId          : row[1].toString(),
        memberId             : row[2].toString(),
        enrolledOn           : toStr(row[3]),
        enrollmentStatus     : row[4].toString(),
        currentProgressValue : Number(row[5]) || 0,
        progressStateJson    : row[6].toString(),
        lastProgressUpdate   : toStr(row[7]),
        completedOn          : toStr(row[8])
      }
    };
  }
 
  return { status: 'error', message: 'Enrollment not found.' };
}

 
 
/**
 * ADMIN ONLY: Archives a challenge (soft-delete).
 * Sets status to 'Archived' — hidden from all member views.
 * Existing enrollments are preserved in ChallengeEnrollmentDB.
 *
 * @param {string} challengeId - ARKA_CHAL_X to archive
 * @returns {{ status: string, message?: string }}
 */
function archiveChallenge(challengeId) {
  const currentMemberId = getVerifiedMemberId();
  if (!currentMemberId)              return { status: 'error', message: 'Unauthorized session.' };
  if (!isAdminMember(currentMemberId)) return { status: 'error', message: 'Admin access required.' };
 
  if (!challengeId) return { status: 'error', message: 'Challenge ID is required.' };
 
  const ss             = SpreadsheetApp.openById(SPREADSHEET_ID);
  const challengeSheet = ss.getSheetByName(CHALLENGE_SHEET);
  if (!challengeSheet) return { status: 'error', message: 'ChallengeDB sheet not found.' };
 
  const sheetData = challengeSheet.getDataRange().getValues();
  for (let i = 1; i < sheetData.length; i++) {
    if (sheetData[i][0].toString() !== challengeId.toString()) continue;
    challengeSheet.getRange(i + 1, 10).setValue('Archived'); // Col J = status
    invalidateCacheKey(CACHE_KEYS.challenges);
    return { status: 'success' };
  }
 
  return { status: 'error', message: 'Challenge not found.' };
}
 
// ============================================================================
// PUBLIC FUNCTIONS
// ============================================================================
 
/**
 * ADMIN ONLY: Creates a new announcement or updates an existing one.
 *
 * Pass `data.announcementId` to update an existing row; omit it (or null)
 * to create a brand-new announcement.
 *
 * Security gate: verified session + admin check on both paths.
 *
 * @param {Object}  data
 * @param {string}  [data.announcementId]  - ARKA_ANN_X to update, or omit to create
 * @param {string}  data.title             - Required headline (non-empty)
 * @param {string}  data.body              - Required body text (non-empty)
 * @param {boolean} data.isPinned          - true → pin to home feed (ignored for WHATS_NEW)
 * @param {string}  [data.expiryDate]      - Optional dd-MMM-yyyy; WHATS_NEW defaults to +30 days
 * @param {string}  [data.targetMemberIds] - Comma-separated ARKA_MEMBER_X; blank = club-wide
 * @param {string}  [data.announcementType] - 'WHATS_NEW' | 'CLUB_NOTICE' (default: CLUB_NOTICE)
 * @returns {{ status: string, announcement?: AnnouncementRecord, message?: string }}
 */
function saveAnnouncement(data) {
  // ── Auth gates ────────────────────────────────────────────────────────────
  const currentMemberId = getVerifiedMemberId();
  if (!currentMemberId)                return { status: 'error', message: 'Unauthorized session.' };
  if (!isAdminMember(currentMemberId)) return { status: 'error', message: 'Admin access required.' };

  // ── Input validation ──────────────────────────────────────────────────────
  const title = (data.title || '').trim();
  const body  = (data.body  || '').trim();
  if (!title) return { status: 'error', message: 'Title cannot be empty.' };
  if (!body)  return { status: 'error', message: 'Announcement body cannot be empty.' };

  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(ANNOUNCEMENT_SHEET);
  if (!sheet) return { status: 'error', message: 'AnnouncementDB sheet not found. Please create it first.' };

  // ── Type normalisation ────────────────────────────────────────────────────
  // WHATS_NEW entries are club-wide by design and cannot be pinned.
  // If no expiry is provided for a WHATS_NEW entry, default to 30 days from today
  // so the strip self-clears without manual admin maintenance.
  const announcementType = (data.announcementType === 'WHATS_NEW') ? 'WHATS_NEW' : 'CLUB_NOTICE';
  const isWhatsNew       = (announcementType === 'WHATS_NEW');

  const isPinned = isWhatsNew ? false : (data.isPinned === true || data.isPinned === 'TRUE');

  // Resolve expiry: explicit value wins; WHATS_NEW defaults to +30 days; others blank = no expiry
  let expiryDate = (data.expiryDate || '').trim();
  if (!expiryDate && isWhatsNew) {
    const defaultExpiry = new Date();
    defaultExpiry.setDate(defaultExpiry.getDate() + 30);
    expiryDate = Utilities.formatDate(defaultExpiry, Session.getScriptTimeZone(), 'dd-MMM-yyyy');
  }

  const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd-MM-yyyy HH:mm:ss Z');
 
  // ── UPDATE path ───────────────────────────────────────────────────────────
  if (data.announcementId) {
    const rows = sheet.getDataRange().getValues();
 
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0].toString() !== data.announcementId.toString()) continue;
 
      // Update editable columns B–E: Title, Body, isPinned, expiryDate.
      // Preserve Col F (status), Col G (createdBy), Col H (createdOn) — never changed on edit.
      invalidateCacheKey(CACHE_KEYS.announcements);
      sheet.getRange(i + 1, 2, 1, 4).setValues([[
        title,       // Col B — Title
        body,        // Col C — Body
        isPinned,    // Col D — isPinned
        expiryDate   // Col E — expiryDate
      ]]);

      return {
        status: 'success',
        announcement: {
          announcementId   : data.announcementId,
          title,
          body,
          isPinned,
          expiryDate,
          status           : rows[i][5].toString(),
          createdBy        : rows[i][6].toString(),
          createdOn        : rows[i][7].toString(),
          targetMemberIds  : rows[i][8] ? rows[i][8].toString() : '',
          dismissedBy      : rows[i][9] ? rows[i][9].toString() : '',
          // Col K — read back from sheet (type is immutable after creation)
          announcementType : rows[i][10] ? rows[i][10].toString().trim() : 'CLUB_NOTICE'
        }
      };
    }
    return { status: 'error', message: 'Announcement not found.' };
  }
 
  // ── CREATE path ───────────────────────────────────────────────────────────
  // Generate sequential ARKA_ANN_X ID from the last occupied row
  const sheetData = sheet.getDataRange().getValues();
  let newNum = 1;
  if (sheetData.length > 1) {
    const lastId  = sheetData[sheetData.length - 1][0].toString();
    const lastNum = parseInt(lastId.split('_')[2]);
    if (!isNaN(lastNum)) newNum = lastNum + 1;
  }
  const announcementId = 'ARKA_ANN_' + newNum;
  invalidateCacheKey(CACHE_KEYS.announcements);
  sheet.appendRow([
    announcementId,          // Col A — AnnouncementID
    title,                   // Col B — Title
    body,                    // Col C — Body
    isPinned,                // Col D — IsPinned
    expiryDate,              // Col E — ExpiryDate
    'Active',                // Col F — Status
    currentMemberId,         // Col G — CreatedBy
    timestamp,               // Col H — CreatedOn
    data.targetMemberIds || '', // Col I — TargetMemberIds (blank = club-wide)
    '',                      // Col J — DismissedBy (blank on create)
    announcementType         // Col K — AnnouncementType: WHATS_NEW | CLUB_NOTICE
  ]);

  // Fire the activity log entry for all club-wide posts (both CLUB_NOTICE and WHATS_NEW).
  // Targeted personal announcements (targetMemberIds set) remain silent — they are
  // system-generated notifications, not admin broadcast posts.
  if (!data.targetMemberIds) {
    try { logActivityBatch(currentMemberId, [{ typeId: 'ARKA_ACTTYP_ANNOUNCEMENTPOSTED', val: 1, desc: announcementId }]); } catch(e) {}
  }

  return {
    status: 'success',
    announcement: {
      announcementId,
      title,
      body,
      isPinned,
      expiryDate,
      status          : 'Active',
      createdBy       : currentMemberId,
      createdOn       : timestamp,
      targetMemberIds : data.targetMemberIds || '',
      dismissedBy     : '',
      announcementType
    }
  };
}
 
 
/**
 * ADMIN ONLY: Soft-deletes an announcement by setting its status to "Archived".
 * The row is preserved in the sheet for audit purposes; it will be excluded from
 * all frontend reads automatically (fetchActiveAnnouncements filters it out).
 *
 * @param {string} announcementId - ARKA_ANN_X to archive
 * @returns {{ status: string, message?: string }}
 */
function archiveAnnouncement(announcementId) {
  const currentMemberId = getVerifiedMemberId();
  if (!currentMemberId)                return { status: 'error', message: 'Unauthorized session.' };
  if (!isAdminMember(currentMemberId)) return { status: 'error', message: 'Admin access required.' };
 
  if (!announcementId) return { status: 'error', message: 'Announcement ID is required.' };
 
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(ANNOUNCEMENT_SHEET);
  if (!sheet) return { status: 'error', message: 'AnnouncementDB sheet not found.' };
 
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0].toString() !== announcementId.toString()) continue;
    const todayStr = Utilities.formatDate(
      new Date(), Session.getScriptTimeZone(), 'dd-MMM-yyyy'
    );
    invalidateCacheKey(CACHE_KEYS.announcements);
    sheet.getRange(i + 1, 4).setValue(false);      // Col D = isPinned — force unpin
    sheet.getRange(i + 1, 5).setValue(todayStr);   // Col E = expiryDate — expire today
    sheet.getRange(i + 1, 6).setValue('Archived'); // Col F = status
    return { status: 'success' };
  }
 
  return { status: 'error', message: 'Announcement not found.' };
}
 
 
/**
 * ADMIN ONLY: Pins or unpins an announcement.
 * Pinned announcements always appear at the top of the Home feed regardless of
 * date, and cannot be dismissed by members.
 *
 * @param {string}  announcementId - ARKA_ANN_X to update
 * @param {boolean} pinState       - true to pin, false to unpin
 * @returns {{ status: string, message?: string }}
 */
function setAnnouncementPin(announcementId, pinState) {
  const currentMemberId = getVerifiedMemberId();
  if (!currentMemberId)                return { status: 'error', message: 'Unauthorized session.' };
  if (!isAdminMember(currentMemberId)) return { status: 'error', message: 'Admin access required.' };
 
  if (!announcementId) return { status: 'error', message: 'Announcement ID is required.' };
 
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(ANNOUNCEMENT_SHEET);
  if (!sheet) return { status: 'error', message: 'AnnouncementDB sheet not found.' };
 
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0].toString() !== announcementId.toString()) continue;
    sheet.getRange(i + 1, 4).setValue(pinState === true); // Col D = isPinned (boolean)
    invalidateCacheKey(CACHE_KEYS.announcements);
    return { status: 'success' };
  }
 
  return { status: 'error', message: 'Announcement not found.' };
}

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================
 
/**
 * @typedef {Object} EventRecord
 * @property {string}  eventId        - Unique ID: ARKA_EVENT_X              (Col A)
 * @property {string}  eventType      - Meeting-Virtual | Meeting-F2F |       (Col B)
 *                                      BookBuddyRead | Social | Other
 * @property {string}  title          - Display name of the event             (Col C)
 * @property {string}  description    - Full event details                    (Col D)
 * @property {string}  hostMemberId   - ARKA_MEMBER_X or "" if no host       (Col E)
 * @property {string}  startDate      - dd-MMM-yyyy                          (Col F)
 * @property {string}  startTime      - HH:mm (24hr)                         (Col G)
 * @property {string}  endDate        - dd-MMM-yyyy                          (Col H)
 * @property {string}  endTime        - HH:mm (24hr)                         (Col I)
 * @property {string}  meetingLink    - URL or ""                             (Col J)
 * @property {string}  assetsJson     - JSON string array of asset objects    (Col K)
 * @property {string}  status         - Active | Cancelled | Completed        (Col L)
 * @property {boolean} isPinned       - Pinned to top of events list          (Col M)
 * @property {string}  createdBy      - ARKA_MEMBER_X                        (Col N)
 * @property {string}  createdOn      - dd-MM-yyyy HH:mm:ss Z                (Col O)
 */
 
/**
 * @typedef {Object} EventRSVPRecord
 * @property {string} rsvpId               - Unique ID: ARKA_RSVP_X         (Col A)
 * @property {string} eventId              - ARKA_EVENT_X                   (Col B)
 * @property {string} memberId             - ARKA_MEMBER_X                  (Col C)
 * @property {string} rsvpStatus           - Invited | Yes | No | Maybe     (Col D)
 * @property {string} rsvpDate             - dd-MM-yyyy HH:mm:ss Z          (Col E)
 * @property {string} attendanceConfirmed  - Yes | No | "" (blank=pending)  (Col F)
 * @property {string} confirmedBy          - ARKA_MEMBER_X or ""            (Col G)
 * @property {string} confirmedOn          - timestamp or ""                (Col H)
 * @property {string} addedBy              - ARKA_MEMBER_X who created row  (Col I)
 */
 
/**
 * @typedef {Object} EventAsset
 * @property {string} assetId    - ARKA_EVTASSET_X
 * @property {string} type       - Photo | PDF | PPT | Document | Other
 * @property {string} title      - Display name shown in the app
 * @property {string} driveLink  - Google Drive viewer URL (open in new window)
 * @property {string} uploadedBy - ARKA_MEMBER_X
 * @property {string} uploadedOn - dd-MM-yyyy HH:mm:ss Z
 */
 
 
// ============================================================================
// STEP 5a — PRIVATE HELPERS
// ============================================================================
 
/**
 * PRIVATE HELPER: Checks whether a member has management rights over a specific event.
 * Management rights = can edit details, add participants, confirm attendance, add assets.
 * Three-way check: Admin OR the designated host OR the original creator.
 *
 * IMPORTANT: Always call with a verified memberId from getVerifiedMemberId().
 * The frontend has the same function for UI gating — the backend is the true security gate.
 *
 * @param {string} memberId         - Verified ARKA_MEMBER_X
 * @param {Object} event            - Must contain hostMemberId and createdBy
 * @param {string} event.hostMemberId
 * @param {string} event.createdBy
 * @returns {boolean}
 */
function canManageEvent(memberId, event) {
  return isAdminMember(memberId)
    || (event.hostMemberId && memberId === event.hostMemberId)
    || (event.createdBy    && memberId === event.createdBy);
}
 
/**
 * PRIVATE HELPER: Reads a single event row from EventDB by eventId.
 * Used internally to verify permissions before writes.
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} eventSheet - Open EventDB sheet
 * @param {string} eventId - ARKA_EVENT_X to find
 * @returns {{rowIndex: number, event: Object}|null}
 *   rowIndex is 1-based (matches getRange row). Returns null if not found.
 */
function getEventRowById(eventSheet, eventId) {
  const data = eventSheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0].toString() !== eventId.toString()) continue;
    return {
      rowIndex: i + 1, // 1-based for getRange
      event: {
        eventId      : data[i][0].toString(),
        eventType    : data[i][1].toString(),
        title        : data[i][2].toString(),
        description  : data[i][3].toString(),
        hostMemberId : data[i][4].toString(),
        startDate    : data[i][5].toString(),
        startTime    : data[i][6].toString(),
        endDate      : data[i][7].toString(),
        endTime      : data[i][8].toString(),
        meetingLink  : data[i][9].toString(),
        assetsJson   : data[i][10].toString(),
        status       : data[i][11].toString(),
        isPinned     : data[i][12].toString().toUpperCase() === 'TRUE',
        createdBy    : data[i][13].toString(),
        createdOn    : data[i][14].toString()
      }
    };
  }
  return null;
}
 
/**
 * PRIVATE HELPER: Generates the next sequential asset ID within an existing assetsJson string.
 * Format: ARKA_EVTASSET_X where X is one higher than the highest existing ID in the array.
 *
 * @param {EventAsset[]} existingAssets - Already-parsed assets array
 * @returns {string} New asset ID, e.g. "ARKA_EVTASSET_3"
 */
function getNextAssetId(existingAssets) {
  if (!existingAssets || existingAssets.length === 0) return 'ARKA_EVTASSET_1';
  const nums = existingAssets.map(function(a) {
    const n = parseInt((a.assetId || '').split('_')[2]);
    return isNaN(n) ? 0 : n;
  });
  return 'ARKA_EVTASSET_' + (Math.max.apply(null, nums) + 1);
}
 
 
// ============================================================================
// STEP 5b — LAZY LOADER (called on-demand, NOT in Big Gulp)
// ============================================================================
 
/**
 * Lazy-loads all events and their RSVPs in a single backend call.
 * Called by the frontend when the user first opens Events & Announcements view.
 * NOT included in getAppMasterData() — keeps startup cost at zero.
 *
 * Returns ALL events (Upcoming + Past) so the frontend can filter by status/date.
 * Returns ALL RSVPs so the frontend can resolve attendee lists client-side.
 *
 * @returns {{ status: string, eventsDB: EventRecord[], rsvpsDB: EventRSVPRecord[] }}
 */
function getEventsData() {
  if (!getVerifiedMemberId()) return { status: 'unauthorized' };
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
 
    // ── Read EventDB ────────────────────────────────────────────────────────
    const eventSheet = ss.getSheetByName(EVENT_SHEET);
    const eventsList = [];
 
    if (eventSheet) {
      const eData = eventSheet.getDataRange().getValues();
      for (let i = 1; i < eData.length; i++) {
        if (!eData[i][0]) continue;
 
        // Normalise Date objects to strings
        const rawStartDate = eData[i][5];
        const rawEndDate   = eData[i][7];
        const rawCreatedOn = eData[i][14];
 
        eventsList.push({
          eventId      : eData[i][0].toString(),
          eventType    : eData[i][1].toString(),
          title        : eData[i][2].toString(),
          description  : eData[i][3].toString(),
          hostMemberId : eData[i][4].toString(),
          startDate    : rawStartDate instanceof Date
            ? Utilities.formatDate(rawStartDate, Session.getScriptTimeZone(), 'dd-MMM-yyyy')
            : String(rawStartDate || ''),
          startTime : eData[i][6] instanceof Date
            ? Utilities.formatDate(eData[i][6], 'UTC', 'HH:mm')
            : String(eData[i][6] || ''),
          endDate      : rawEndDate instanceof Date
            ? Utilities.formatDate(rawEndDate, Session.getScriptTimeZone(), 'dd-MMM-yyyy')
            : String(rawEndDate || ''),
          endTime   : eData[i][8] instanceof Date
            ? Utilities.formatDate(eData[i][8], 'UTC', 'HH:mm')
            : String(eData[i][8] || ''),
          meetingLink  : eData[i][9].toString(),
          assetsJson   : eData[i][10].toString(),
          status       : eData[i][11].toString(),
          isPinned     : eData[i][12].toString().toUpperCase() === 'TRUE',
          createdBy    : eData[i][13].toString(),
          createdOn    : rawCreatedOn instanceof Date
            ? Utilities.formatDate(rawCreatedOn, Session.getScriptTimeZone(), 'dd-MM-yyyy HH:mm:ss Z')
            : String(rawCreatedOn || ''),
          eventTimezone : eData[i][15] ? eData[i][15].toString() : 'IST'
        });
      }
    }
 
    // ── Read EventRSVPDB ────────────────────────────────────────────────────
    const rsvpSheet = ss.getSheetByName(EVENT_RSVP_SHEET);
    const rsvpsList = [];
 
    if (rsvpSheet) {
      const rData = rsvpSheet.getDataRange().getValues();
      for (let i = 1; i < rData.length; i++) {
        if (!rData[i][0]) continue;
 
        const rawRsvpDate     = rData[i][4];
        const rawConfirmedOn  = rData[i][7];
 
        rsvpsList.push({
          rsvpId              : rData[i][0].toString(),
          eventId             : rData[i][1].toString(),
          memberId            : rData[i][2].toString(),
          rsvpStatus          : rData[i][3].toString(),
          rsvpDate            : rawRsvpDate instanceof Date
            ? Utilities.formatDate(rawRsvpDate, Session.getScriptTimeZone(), 'dd-MM-yyyy HH:mm:ss Z')
            : String(rawRsvpDate || ''),
          attendanceConfirmed : rData[i][5].toString(),
          confirmedBy         : rData[i][6].toString(),
          confirmedOn         : rawConfirmedOn instanceof Date
            ? Utilities.formatDate(rawConfirmedOn, Session.getScriptTimeZone(), 'dd-MM-yyyy HH:mm:ss Z')
            : String(rawConfirmedOn || ''),
          addedBy             : rData[i][8].toString()
        });
      }
    }
 
    return { status: 'success', eventsDB: eventsList, rsvpsDB: rsvpsList };
 
  } catch (e) {
    console.error('getEventsData error:', e);
    return { status: 'error', message: e.toString(), eventsDB: [], rsvpsDB: [] };
  }
}
 
 
// ============================================================================
// STEP 5c — CREATE / EDIT / STATUS
// ============================================================================
 
/**
 * Creates a new event or updates an existing one.
 *
 * PERMISSION RULES:
 *   Create — Admin can create any event type.
 *             Members can create: BookBuddyRead, Social, Other.
 *             Meeting-Virtual and Meeting-F2F are admin-only.
 *   Update — Admin OR host OR original creator (canManageEvent).
 *
 * Pass data.eventId to update; omit (or null) to create.
 *
 * @param {Object}  data
 * @param {string}  [data.eventId]      - ARKA_EVENT_X to update; omit to create
 * @param {string}  data.eventType      - Meeting-Virtual | Meeting-F2F | BookBuddyRead | Social | Other
 * @param {string}  data.title          - Required
 * @param {string}  [data.description]  - Optional details
 * @param {string}  [data.hostMemberId] - Optional ARKA_MEMBER_X host
 * @param {string}  data.startDate      - dd-MMM-yyyy
 * @param {string}  [data.startTime]    - HH:mm
 * @param {string}  [data.endDate]      - dd-MMM-yyyy
 * @param {string}  [data.endTime]      - HH:mm
 * @param {string}  [data.meetingLink]  - URL
 * @param {boolean} [data.isPinned]     - Admin-only; ignored for non-admins on create
 * @returns {{ status: string, event?: EventRecord, message?: string }}
 */
function saveEvent(data) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const currentMemberId = getVerifiedMemberId();
  if (!currentMemberId) return { status: 'error', message: 'Unauthorized session.' };
 
  // ── Validate type permission (CREATE only) ────────────────────────────────
  // On edit, the type dropdown is disabled for non-admins so the original type
  // is always preserved. We only need to enforce admin-only types on creation.
  const adminOnlyTypes = ['Meeting-Virtual', 'Meeting-F2F'];
  if (!data.eventId && adminOnlyTypes.includes(data.eventType) && !isAdminMember(currentMemberId)) {
    return { status: 'error', message: 'Only admins can create Meeting events.' };
  }
 
  // ── Validate required fields ──────────────────────────────────────────────
  const title = (data.title || '').trim();
  if (!title)          return { status: 'error', message: 'Event title cannot be empty.' };
  if (!data.eventType) return { status: 'error', message: 'Event type is required.' };
  if (!data.startDate) return { status: 'error', message: 'Start date is required.' };
 
  const ss         = SpreadsheetApp.openById(SPREADSHEET_ID);
  const eventSheet = ss.getSheetByName(EVENT_SHEET);
  if (!eventSheet) return { status: 'error', message: 'EventDB sheet not found. Please create it first.' };
 
  const timestamp  = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd-MM-yyyy HH:mm:ss Z');
  const isPinned   = isAdminMember(currentMemberId) ? (data.isPinned === true || data.isPinned === 'TRUE') : false;
 
  // ── UPDATE path ───────────────────────────────────────────────────────────
  if (data.eventId) {
    const found = getEventRowById(eventSheet, data.eventId);
    if (!found) return { status: 'error', message: 'Event not found.' };
 
    if (!canManageEvent(currentMemberId, found.event)) {
      return { status: 'error', message: 'You do not have permission to edit this event.' };
    }
 
    // Update editable columns B–J, M (type, title, desc, host, dates, times, link, isPinned)
    // Preserve assetsJson (Col K), status (Col L), createdBy (Col N), createdOn (Col O)
    eventSheet.getRange(found.rowIndex, 2, 1, 9).setValues([[
      data.eventType,
      title,
      (data.description  || '').trim(),
      (data.hostMemberId || '').trim(),
      (data.startDate    || '').trim(),
      (data.startTime    || '').trim(),
      (data.endDate      || '').trim(),
      (data.endTime      || '').trim(),
      (data.meetingLink  || '').trim()
    ]]);
    // Enforce plain-text format on time cells so Sheets never re-interprets
    // them as Date objects (which would re-introduce the UTC offset bug).
    eventSheet.getRange(found.rowIndex, 7).setNumberFormat('@STRING@'); // Col G: startTime
    eventSheet.getRange(found.rowIndex, 9).setNumberFormat('@STRING@'); // Col I: endTime
    eventSheet.getRange(found.rowIndex, 16).setValue((data.eventTimezone || 'IST').trim());
    // Update isPinned (Col M = column 13)
    eventSheet.getRange(found.rowIndex, 13).setValue(isPinned);
 
    const updatedEvent = Object.assign({}, found.event, {
      eventType    : data.eventType,
      title,
      description  : (data.description  || '').trim(),
      hostMemberId : (data.hostMemberId || '').trim(),
      startDate    : (data.startDate    || '').trim(),
      startTime    : (data.startTime    || '').trim(),
      endDate      : (data.endDate      || '').trim(),
      endTime      : (data.endTime      || '').trim(),
      meetingLink  : (data.meetingLink  || '').trim(),
      isPinned      : isPinned,
      createdBy     : found.event.createdBy,    // preserved — never changes
      createdOn     : found.event.createdOn,    // preserved — never changes
      eventTimezone : (data.eventTimezone || 'IST').trim()
    });

    // ── Notify RSVPed members that something changed ──────────────────────
    // Flat notice on every save — no field-level diffing. Fires for all edits
    // including host, description, and timezone changes that the old diff missed.
    // Excludes the editor themselves (they know what they changed).
    const rsvpMemberIds = getEventRsvpMemberIds_(ss, data.eventId)
      .filter(function(id) { return id !== currentMemberId; });

    if (rsvpMemberIds.length > 0) {
      sendEventNotificationAnnouncement_(
        ss,
        '📅 Event Updated: ' + title,
        '"' + title + '" has been updated. Open Events & Announcements to see the latest details.',
        rsvpMemberIds
      );
    }

    return { status: 'success', event: updatedEvent };
  }
 
  // ── CREATE path ───────────────────────────────────────────────────────────
  const sheetData  = eventSheet.getDataRange().getValues();
  let newNum = 1;
  if (sheetData.length > 1) {
    const lastId  = sheetData[sheetData.length - 1][0].toString();
    const lastNum = parseInt(lastId.split('_')[2]);
    if (!isNaN(lastNum)) newNum = lastNum + 1;
  }
  const eventId = 'ARKA_EVENT_' + newNum;

  // Determine the target row index BEFORE writing.
  // Setting '@STRING@' format on time cells BEFORE the write prevents Google Sheets
  // from auto-parsing "14:00" as a time fraction (a decimal < 1) during the write.
  // appendRow cannot guarantee this ordering, so we use getLastRow()+1 + setValues instead.
  const newRowIndex = eventSheet.getLastRow() + 1;
  eventSheet.getRange(newRowIndex, 7).setNumberFormat('@STRING@'); // Col G: startTime — must precede write
  eventSheet.getRange(newRowIndex, 9).setNumberFormat('@STRING@'); // Col I: endTime   — must precede write

  eventSheet.getRange(newRowIndex, 1, 1, 16).setValues([[
    eventId,                              // Col A
    data.eventType,                       // Col B
    title,                                // Col C
    (data.description  || '').trim(),     // Col D
    (data.hostMemberId || '').trim(),     // Col E
    (data.startDate    || '').trim(),     // Col F
    (data.startTime    || '').trim(),     // Col G — plain text, format locked above
    (data.endDate      || '').trim(),     // Col H
    (data.endTime      || '').trim(),     // Col I — plain text, format locked above
    (data.meetingLink  || '').trim(),     // Col J
    '[]',                                 // Col K — empty assets JSON array
    'Active',                             // Col L — status
    isPinned,                             // Col M
    currentMemberId,                      // Col N — createdBy
    timestamp,                            // Col O — createdOn
    (data.eventTimezone || 'IST').trim()  // Col P — timezone
  ]]);
  try { logActivityBatch(currentMemberId, [{ typeId: 'ARKA_ACTTYP_EVENTCREATED', val: 1, desc: eventId }]); } catch(e) {}

  // Auto-add the host as a Yes RSVP so their attendance can be confirmed post-event.
  // The host is always added regardless of whether they are also the creator —
  // the previous creator-exclusion guard prevented host attendance from ever being
  // confirmed when the host created their own event.
  var hostId = (data.hostMemberId || '').trim();
  if (hostId) {
    try {
      var rsvpSheet = ss.getSheetByName(EVENT_RSVP_SHEET);
      if (rsvpSheet) {
        var rsvpData = rsvpSheet.getDataRange().getValues();

        // Guard: skip if the host already has an RSVP row for this event
        // (can happen on event edit/re-save flows).
        var hostAlreadyHasRsvp = false;
        for (var ri = 1; ri < rsvpData.length; ri++) {
          if (rsvpData[ri][1].toString() === eventId &&
              rsvpData[ri][2].toString() === hostId) {
            hostAlreadyHasRsvp = true;
            break;
          }
        }

        if (!hostAlreadyHasRsvp) {
          // Max-scan for next ID — avoids the same race condition as saveEventRsvp()
          var newRsvpNum = 1;
          for (var rj = 1; rj < rsvpData.length; rj++) {
            var hostIdStr  = (rsvpData[rj][0] || '').toString();
            var hostParsed = parseInt(hostIdStr.split('_')[2], 10);
            if (!isNaN(hostParsed) && hostParsed >= newRsvpNum) newRsvpNum = hostParsed + 1;
          }
          rsvpSheet.appendRow([
            'ARKA_RSVP_' + newRsvpNum, // Col A: rsvpId
            eventId,                   // Col B: eventId
            hostId,                    // Col C: memberId
            'Yes',                     // Col D: rsvpStatus — host attends by default
            timestamp,                 // Col E: rsvpDate
            '',                        // Col F: attendanceConfirmed (blank until admin confirms)
            '',                        // Col G: confirmedBy
            '',                        // Col H: confirmedOn
            currentMemberId            // Col I: addedBy (creator seeded this row)
          ]);
        }
      }
    } catch(hostRsvpErr) {
      console.warn('saveEvent: host auto-RSVP failed (non-fatal): ' + hostRsvpErr);
    }
  }
 
  const newEvent = {
    eventId,
    eventType    : data.eventType,
    title,
    description  : (data.description  || '').trim(),
    hostMemberId : (data.hostMemberId || '').trim(),
    startDate    : (data.startDate    || '').trim(),
    startTime    : (data.startTime    || '').trim(),
    endDate      : (data.endDate      || '').trim(),
    endTime      : (data.endTime      || '').trim(),
    meetingLink  : (data.meetingLink  || '').trim(),
    assetsJson   : '[]',
    status       : 'Active',
    isPinned,
    createdBy    : currentMemberId,
    createdOn    : timestamp,
    eventTimezone : (data.eventTimezone || 'IST').trim()
  };
 
  return { status: 'success', event: newEvent };
}
 
 
/**
 * PRIVATE HELPER — Returns an array of unique member IDs who have any RSVP row
 * (Invited, Yes, No, Maybe) for the given event. Used to target notifications.
 *
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
 * @param {string} eventId - ARKA_EVENT_X
 * @returns {string[]} Array of ARKA_MEMBER_X strings, deduplicated
 */
function getEventRsvpMemberIds_(ss, eventId) {
  const rsvpSheet = ss.getSheetByName(EVENT_RSVP_SHEET);
  if (!rsvpSheet) return [];

  const rows      = rsvpSheet.getDataRange().getValues();
  const memberIds = new Set();

  for (let i = 1; i < rows.length; i++) {
    if (!rows[i][0]) continue;
    if (rows[i][1].toString() !== eventId) continue;
    const memberId = rows[i][2].toString().trim();
    if (memberId) memberIds.add(memberId);
  }

  return Array.from(memberIds);
}

/**
 * PRIVATE HELPER — Sends a targeted personal announcement to a list of members.
 * Non-fatal — failures are swallowed so the caller's primary write is never blocked.
 *
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
 * @param {string}   title          - Short announcement headline
 * @param {string}   body           - Full announcement text
 * @param {string[]} targetMemberIds - Array of ARKA_MEMBER_X to notify
 */
function sendEventNotificationAnnouncement_(ss, title, body, targetMemberIds) {
  if (!targetMemberIds || targetMemberIds.length === 0) return;

  try {
    // Send one announcement per member so each gets a personal dismissable card.
    // Bulk comma-separated targetMemberIds would show the card to all of them but
    // a dismiss by one would not dismiss for others — per-member is cleaner.
    targetMemberIds.forEach(function(memberId) {
      saveAnnouncement({
        title           : title,
        body            : body,
        isPinned        : false,
        expiryDate      : '',
        targetMemberIds : memberId
      });
    });
  } catch (err) {
    console.warn('sendEventNotificationAnnouncement_: failed (non-fatal):', err);
  }
}

/**
 * PRIVATE HELPER — Writes a one-time personal welcome Club Notice to a newly
 * approved member. Called from setMemberApprovalStatus() on Approved transition.
 *
 * Non-fatal: any failure is swallowed so the approval write is never blocked.
 * The notice is targeted (targetMemberIds = memberId) so only the recipient
 * sees it in their Notices tab and Home feed banner.
 *
 * No expiry is set — the member can dismiss it at their own pace.
 *
 * @param {string} newMemberId   - ARKA_MEMBER_X of the newly approved member.
 * @param {string} displayName   - Member's chosen display name, used in greeting.
 */
function sendMemberWelcomeNotice_(newMemberId, displayName) {
  if (!newMemberId) return;

  const firstName = (displayName || 'there').split(' ')[0]; // Friendly first-name fallback

  const welcomeTitle = '👋 Welcome to Arka Readers Club, ' + firstName + '!';
  const welcomeBody  =
    'Your account is now active — we\'re so glad you\'re here! 🎉\n\n' +
    'A few things to get you started:\n\n' +
    '📚 Add your first book — head to the Library tab and search for something you\'re reading or have recently finished.\n\n' +
    '🚀 Check your Onboarding card — it\'s at the top of your Me tab. It walks you through the app chapter by chapter and awards a badge for every chapter you complete.\n\n' +
    '👥 Say hello — drop a message in the WhatsApp group and let the club know what you\'re reading!\n\n' +
    '📖 Log your pages daily — even 10 pages a day earns you Club Points and keeps your reading streak alive.\n\n' +
    'If you ever get stuck, tap the 🧭More menu → Help Centre — there\'s an article for everything.\n\n' +
    'Happy reading! 🌟\n— The Arka Team';

  try {
    saveAnnouncement({
      title           : welcomeTitle,
      body            : welcomeBody,
      isPinned        : false,
      expiryDate      : '',            // No expiry — member dismisses when ready
      targetMemberIds : newMemberId,   // Private to this member only
      announcementType: 'CLUB_NOTICE'  // Routes to Notices tab, not What's New strip
    });
    console.log('sendMemberWelcomeNotice_: welcome notice sent to ' + newMemberId);
  } catch (err) {
    console.warn('sendMemberWelcomeNotice_: failed (non-fatal):', err.toString());
  }
}

/**
 * Updates the status of an event to Cancelled or Completed.
 * Only event managers (admin / host / creator) may do this.
 *
 * @param {string} eventId - ARKA_EVENT_X
 * @param {string} newStatus - 'Cancelled' | 'Completed'
 * @returns {{ status: string, message?: string }}
 */
function updateEventStatus(eventId, newStatus) {
  const currentMemberId = getVerifiedMemberId();
  if (!currentMemberId) return { status: 'error', message: 'Unauthorized session.' };
 
  const validStatuses = ['Cancelled', 'Completed', 'Active'];
  if (!validStatuses.includes(newStatus)) {
    return { status: 'error', message: 'Invalid status value.' };
  }
 
  const ss         = SpreadsheetApp.openById(SPREADSHEET_ID);
  const eventSheet = ss.getSheetByName(EVENT_SHEET);
  if (!eventSheet) return { status: 'error', message: 'EventDB sheet not found.' };
 
  const found = getEventRowById(eventSheet, eventId);
  if (!found) return { status: 'error', message: 'Event not found.' };
 
  if (!canManageEvent(currentMemberId, found.event)) {
    return { status: 'error', message: 'You do not have permission to change this event\'s status.' };
  }
 
  eventSheet.getRange(found.rowIndex, 12).setValue(newStatus); // Col L = status
  // A closed event has no reason to stay pinned — clear it automatically.
  if (newStatus === 'Completed' || newStatus === 'Cancelled') {
    eventSheet.getRange(found.rowIndex, 13).setValue(false);   // Col M = isPinned
  }
  if (newStatus === 'Cancelled') {
    try { logActivityBatch(currentMemberId, [{ typeId: 'ARKA_ACTTYP_EVENTCANCELLED', val: 1, desc: eventId }]); } catch(e) {}

    // Notify all RSVPed / invited members that the event has been cancelled.
    // Excludes the manager performing the cancellation — they already know.
    const rsvpMemberIds = getEventRsvpMemberIds_(ss, eventId)
      .filter(function(id) { return id !== currentMemberId; });

    sendEventNotificationAnnouncement_(
      ss,
      '❌ Event Cancelled: ' + found.event.title,
      'Unfortunately "' + found.event.title + '" has been cancelled. Apologies for the inconvenience.',
      rsvpMemberIds
    );
  }
  return { status: 'success' };
}
 
 
// ============================================================================
// STEP 5d — RSVP & PARTICIPANTS
// ============================================================================
 
/**
 * Handles both member self-RSVP and manager-added participants.
 *
 * SELF-RSVP: Any member can RSVP Yes/No/Maybe on any Active event.
 *   - If no existing row for this member+event, creates one.
 *   - If row exists with status Invited, updates it to the chosen status.
 *   - If row exists with Yes/No/Maybe, updates it.
 *
 * MANAGER-ADD: Admin/host/creator can add a member with status 'Invited'.
 *   - Creates a row for the target member with rsvpStatus = 'Invited'.
 *   - Auto-creates a targeted personal announcement notifying the invitee.
 *   - Fails silently on the announcement if AnnouncementDB is unavailable.
 *   - Will not duplicate: if member already has any row for this event, returns error.
 *
 * @param {Object} data
 * @param {string} data.eventId     - ARKA_EVENT_X
 * @param {string} data.memberId    - Target ARKA_MEMBER_X (self or admin-added)
 * @param {string} data.rsvpStatus  - 'Yes' | 'No' | 'Maybe' | 'Invited'
 * @returns {{ status: string, rsvp?: EventRSVPRecord, announcement?: Object, message?: string }}
 */
function saveEventRSVP(data) {
  const currentMemberId = getVerifiedMemberId();
  if (!currentMemberId) return { status: 'error', message: 'Unauthorized session.' };
 
  const validStatuses = ['Yes', 'No', 'Maybe', 'Invited'];
  if (!validStatuses.includes(data.rsvpStatus)) {
    return { status: 'error', message: 'Invalid RSVP status.' };
  }
 
  const isAddingParticipant = data.rsvpStatus === 'Invited';
 
  // Permission: adding a participant requires management rights
  if (isAddingParticipant) {
    const ss         = SpreadsheetApp.openById(SPREADSHEET_ID);
    const eventSheet = ss.getSheetByName(EVENT_SHEET);
    if (!eventSheet) return { status: 'error', message: 'EventDB sheet not found.' };
 
    const found = getEventRowById(eventSheet, data.eventId);
    if (!found) return { status: 'error', message: 'Event not found.' };
 
    if (!canManageEvent(currentMemberId, found.event)) {
      return { status: 'error', message: 'Only admins, the host, or the event creator can add participants.' };
    }
  } else {
    // Self-RSVP: target member must be the caller
    if (data.memberId !== currentMemberId) {
      return { status: 'error', message: 'You can only update your own RSVP.' };
    }
  }
 
  // ── Lock: makes the existing-row check + new-row ID generation atomic.
  // Without this, two concurrent RSVPs read the same last ID and both write
  // ARKA_RSVP_N, producing a duplicate row. The full-table max scan below is
  // still safer than last-row-only, but is only race-free when held inside a lock.
  const rsvpLock = LockService.getScriptLock();
  if (!rsvpLock.tryLock(8000)) {
    return { status: 'error', message: 'System is currently busy. Please try again.' };
  }
  try {

  const ss        = SpreadsheetApp.openById(SPREADSHEET_ID);
  const rsvpSheet = ss.getSheetByName(EVENT_RSVP_SHEET);
  if (!rsvpSheet) return { status: 'error', message: 'EventRSVPDB sheet not found.' };

  // Use member's local timezone for all timestamps — mirrors pattern in logReadingProgress.
  const rsvpTzOffset = (data.clientTzOffset || '').toString().trim();
  const timestamp    = buildArkaTimestamp_(rsvpTzOffset);
  const rsvpData     = rsvpSheet.getDataRange().getValues();
 
  // ── Check for existing row ────────────────────────────────────────────────
  for (let i = 1; i < rsvpData.length; i++) {
    if (rsvpData[i][1].toString() !== data.eventId.toString()) continue;
    if (rsvpData[i][2].toString() !== data.memberId.toString()) continue;
 
    // Row exists
    if (isAddingParticipant) {
      return { status: 'error', message: 'This member already has an RSVP for this event.' };
    }
 
    // Update existing row — only touch rsvpStatus (Col D) and rsvpDate (Col E)
    rsvpSheet.getRange(i + 1, 4, 1, 2).setValues([[data.rsvpStatus, timestamp]]);

    // Log with the existing rsvpId so the home feed resolves to current status.
    // Only log Yes/Maybe — 'No' entries are filtered out of the feed by design.
    const existingRsvpId = rsvpData[i][0].toString();
    if (data.rsvpStatus === 'Yes' || data.rsvpStatus === 'Maybe') {
      try { logActivityBatch(data.memberId, [{ typeId: 'ARKA_ACTTYP_EVENTRSVP', val: 1, desc: existingRsvpId }], 1, '', data.activityPointsMap || {}, ss, false, rsvpTzOffset); } catch(e) {}
    }
 
    return {
      status: 'success',
      rsvp: {
        rsvpId              : existingRsvpId,
        eventId             : data.eventId,
        memberId            : data.memberId,
        rsvpStatus          : data.rsvpStatus,
        rsvpDate            : timestamp,
        attendanceConfirmed : rsvpData[i][5].toString(),
        confirmedBy         : rsvpData[i][6].toString(),
        confirmedOn         : rsvpData[i][7].toString(),
        addedBy             : rsvpData[i][8].toString()
      }
    };
  }
 
  // ── Create new RSVP row ───────────────────────────────────────────────────
  // Scan ALL rows for the max numeric suffix — reading only the last row is a
  // race condition when two GAS calls execute concurrently (both read the same
  // last row before either write lands) and produce identical RSVP IDs.
  let newNum = 1;
  for (let ri = 1; ri < rsvpData.length; ri++) {
    const idStr  = (rsvpData[ri][0] || '').toString();
    const parsed = parseInt(idStr.split('_')[2], 10);
    if (!isNaN(parsed) && parsed >= newNum) newNum = parsed + 1;
  }
  const rsvpId = 'ARKA_RSVP_' + newNum;
 
  rsvpSheet.appendRow([
    rsvpId,            // Col A
    data.eventId,      // Col B
    data.memberId,     // Col C
    data.rsvpStatus,   // Col D
    timestamp,         // Col E — rsvpDate
    '',                // Col F — attendanceConfirmed (blank until post-event)
    '',                // Col G — confirmedBy
    '',                // Col H — confirmedOn
    currentMemberId    // Col I — addedBy (who created this row)
  ]);

  // Store rsvpId (not eventId) so renderHomeFeed() can look up the live RSVP record,
  // get the current status (correct verb), and filter out 'No' RSVPs dynamically.
  if (data.rsvpStatus === 'Yes' || data.rsvpStatus === 'Maybe') {
    try { logActivityBatch(data.memberId, [{ typeId: 'ARKA_ACTTYP_EVENTRSVP', val: 1, desc: rsvpId }], 1, '', data.activityPointsMap || {}, ss, false, rsvpTzOffset); } catch(e) {}
  }
 
  const newRsvp = {
    rsvpId,
    eventId             : data.eventId,
    memberId            : data.memberId,
    rsvpStatus          : data.rsvpStatus,
    rsvpDate            : timestamp,
    attendanceConfirmed : '',
    confirmedBy         : '',
    confirmedOn         : '',
    addedBy             : currentMemberId
  };
 
  // ── Auto-notification for Invited participants (Idea B) ───────────────────
  let createdAnnouncement = null;
  if (isAddingParticipant) {
    try {
      // Fetch the event title for the announcement body
      const eventSheet = ss.getSheetByName(EVENT_SHEET);
      const evtFound   = getEventRowById(eventSheet, data.eventId);
      const eventTitle = evtFound ? evtFound.event.title : 'an upcoming event';
 
      const annResult = saveAnnouncement({
        title          : '📅 You\'ve been invited to an event',
        body           : 'You\'ve been added to "' + eventTitle + '". Open Events & Announcements to RSVP.',
        isPinned       : false,
        expiryDate     : '',
        targetMemberIds : data.memberId  // Single member — still valid as comma-separated with one entry
      });
 
      if (annResult.status === 'success') createdAnnouncement = annResult.announcement;
    } catch (annErr) {
      // Announcement failure should never block the RSVP write
      console.error('Auto-invite announcement failed (non-fatal):', annErr);
    }
  }
 
  return { status: 'success', rsvp: newRsvp, announcement: createdAnnouncement };
  } finally {
    rsvpLock.releaseLock();
  }
}
 
 
/**
 * Confirms or removes attendance confirmation for a participant post-event.
 * Only event managers (admin / host / creator) can confirm attendance.
 *
 * @param {Object} data
 * @param {string} data.rsvpId              - ARKA_RSVP_X to update
 * @param {string} data.eventId             - ARKA_EVENT_X (used for permission check)
 * @param {string} data.attendanceConfirmed - 'Yes' | 'No' | '' (blank to reset)
 * @returns {{ status: string, message?: string }}
 */
function confirmEventAttendance(data) {
  const currentMemberId = getVerifiedMemberId();
  if (!currentMemberId) return { status: 'error', message: 'Unauthorized session.' };
 
  const ss         = SpreadsheetApp.openById(SPREADSHEET_ID);
  const eventSheet = ss.getSheetByName(EVENT_SHEET);
  if (!eventSheet) return { status: 'error', message: 'EventDB sheet not found.' };
 
  const found = getEventRowById(eventSheet, data.eventId);
  if (!found) return { status: 'error', message: 'Event not found.' };
 
  if (!canManageEvent(currentMemberId, found.event)) {
    return { status: 'error', message: 'Only admins, the host, or the creator can confirm attendance.' };
  }
 
  const rsvpSheet = ss.getSheetByName(EVENT_RSVP_SHEET);
  if (!rsvpSheet) return { status: 'error', message: 'EventRSVPDB sheet not found.' };
 
  const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd-MM-yyyy HH:mm:ss Z');
  const rsvpRows  = rsvpSheet.getDataRange().getValues();
 
  // ── Locate the target RSVP row ────────────────────────────────────────────
  // When memberId is provided (current frontend always sends it), use rsvpId +
  // memberId for an exact match. Legacy fallback (no memberId): prefer the
  // unconfirmed row when duplicate rsvpIds exist due to a historical race condition.
  let targetRowIndex = -1;
  for (let i = 1; i < rsvpRows.length; i++) {
    if (rsvpRows[i][0].toString() !== data.rsvpId.toString()) continue;

    if (data.memberId) {
      // Exact match path — new frontend always supplies memberId
      if (rsvpRows[i][2].toString() === data.memberId.toString()) {
        targetRowIndex = i;
        break;
      }
    } else {
      // Legacy path — rsvpId only; prefer unconfirmed when duplicates exist
      if (targetRowIndex === -1) targetRowIndex = i;
      if (rsvpRows[i][5].toString() !== 'Yes') {
        targetRowIndex = i;
        break;
      }
    }
  }

  if (targetRowIndex === -1) return { status: 'error', message: 'RSVP record not found.' };

  // ── Write attendance confirmation columns (F = confirmed, G = by, H = on) ─
  rsvpSheet.getRange(targetRowIndex + 1, 6, 1, 3).setValues([[
    data.attendanceConfirmed || '',
    data.attendanceConfirmed ? currentMemberId : '',
    data.attendanceConfirmed ? timestamp       : ''
  ]]);

  if (data.attendanceConfirmed === 'Yes') {
    const attendeeMemberId    = rsvpRows[targetRowIndex][2].toString();
    const wasAlreadyConfirmed = rsvpRows[targetRowIndex][5].toString() === 'Yes';

    // Guard: only log activity on a genuinely new confirmation — not a re-confirm.
    // Host earns EVENTHOSTED (hosting CP); all others earn EVENTATTENDED (attending CP).
    if (!wasAlreadyConfirmed) {
      const isHost   = found.event.hostMemberId === attendeeMemberId;
      const cpByType = isHost
        ? { 'Meeting-Virtual': 600, 'Meeting-F2F': 800, 'BookBuddyRead': 100, 'Social': 100, 'Other': 50 }
        : { 'Meeting-Virtual': 300, 'Meeting-F2F': 500, 'BookBuddyRead': 50,  'Social': 50,  'Other': 10 };
      const actType  = isHost ? 'ARKA_ACTTYP_EVENTHOSTED' : 'ARKA_ACTTYP_EVENTATTENDED';
      const directCp = cpByType[found.event.eventType] || 5;

      try {
        logActivityBatch(attendeeMemberId, [{
          typeId   : actType,
          val      : 1,
          desc     : data.eventId,
          directCp : directCp
        }], 1, '', {});
      } catch(e) {}
    }
  }
  return { status: 'success' };
}
 
 
// ============================================================================
// STEP 5e — ASSETS
// ============================================================================
 
/**
 * Uploads a file to the Event Assets Drive folder and appends the asset
 * metadata to the event's assetsJson column.
 *
 * Only event managers (admin / host / creator) can add assets.
 * Accepts any file type; Drive's built-in viewer handles rendering.
 * The stored driveLink opens the file in a new browser window via Drive viewer.
 *
 * @param {Object} data
 * @param {string} data.eventId      - ARKA_EVENT_X to attach the asset to
 * @param {string} data.assetTitle   - Display name shown in the app
 * @param {string} data.assetType    - Photo | PDF | PPT | Document | Other
 * @param {string} data.fileBase64   - Data URI: "data:mime/type;base64,..."
 * @param {string} data.fileName     - Original filename including extension
 * @param {string} data.mimeType     - MIME type, e.g. "image/jpeg", "application/pdf"
 * @returns {{ status: string, asset?: EventAsset, updatedAssetsJson?: string, message?: string }}
 */
function uploadEventAsset(data) {
  const currentMemberId = getVerifiedMemberId();
  if (!currentMemberId) return { status: 'error', message: 'Unauthorized session.' };
 
  const ss         = SpreadsheetApp.openById(SPREADSHEET_ID);
  const eventSheet = ss.getSheetByName(EVENT_SHEET);
  if (!eventSheet) return { status: 'error', message: 'EventDB sheet not found.' };
 
  const found = getEventRowById(eventSheet, data.eventId);
  if (!found) return { status: 'error', message: 'Event not found.' };
 
  if (!canManageEvent(currentMemberId, found.event)) {
    return { status: 'error', message: 'You do not have permission to add assets to this event.' };
  }
 
  if (!data.fileBase64) return { status: 'error', message: 'No file data received.' };
  if (!data.fileName)   return { status: 'error', message: 'File name is required.' };
 
  // ── Upload to Drive ───────────────────────────────────────────────────────
  const folder    = DriveApp.getFolderById(EVENT_ASSETS_FOLDER_ID);
  const rawBase64 = data.fileBase64.includes(',') ? data.fileBase64.split(',')[1] : data.fileBase64;
  const mimeType  = data.mimeType || 'application/octet-stream';
 
  // Build filename from display title — strip special chars, replace spaces with underscores.
  // Append a short timestamp suffix to guarantee no two uploads ever collide in Drive,
  // even if the admin uploads two assets with the same title for the same event.
  const rawTitle      = (data.assetTitle || data.fileName || 'asset').trim();
  const safeTitle     = rawTitle
    .replace(/[^a-zA-Z0-9 _-]/g, '')   // strip special chars, keep spaces/hyphens/underscores
    .replace(/\s+/g, '_')               // spaces → underscores
    .replace(/_+/g, '_')                // collapse multiple underscores
    .substring(0, 60);                  // cap length so Drive path stays readable
  const uniqueSuffix  = new Date().getTime().toString().slice(-6); // last 6 digits of epoch ms
  const fileExtension = data.fileName.includes('.') ? '.' + data.fileName.split('.').pop() : '';
  const safeFileName  = data.eventId + '_' + safeTitle + '_' + uniqueSuffix + fileExtension;
  const blob          = Utilities.newBlob(Utilities.base64Decode(rawBase64), mimeType, safeFileName);
  const uploadedFile  = folder.createFile(blob);
 
  // Drive viewer URL — opens in new window without downloading
  const driveLink = 'https://drive.google.com/file/d/' + uploadedFile.getId() + '/view';
 
  // ── Append to assetsJson ──────────────────────────────────────────────────
  const timestamp     = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd-MM-yyyy HH:mm:ss Z');
  let existingAssets  = [];
 
  try {
    const raw = found.event.assetsJson.trim();
    if (raw && raw !== '[]') existingAssets = JSON.parse(raw);
  } catch (e) {
    existingAssets = []; // Corrupt JSON — start fresh, don't block upload
  }
 
  const newAsset = {
    assetId    : getNextAssetId(existingAssets),
    type       : data.assetType  || 'Other',
    title      : (data.assetTitle || data.fileName).trim(),
    driveLink,
    uploadedBy : currentMemberId,
    uploadedOn : timestamp
  };
 
  existingAssets.push(newAsset);
  const updatedAssetsJson = JSON.stringify(existingAssets);
 
  // Write back to Col K (column 11)
  eventSheet.getRange(found.rowIndex, 11).setValue(updatedAssetsJson);
 
  return { status: 'success', asset: newAsset, updatedAssetsJson };
}
 
 
/**
 * Removes a single asset from an event's assetsJson by its assetId.
 * The Drive file is NOT deleted — it remains in the folder for safety.
 * Only event managers can remove assets.
 *
 * @param {Object} data
 * @param {string} data.eventId  - ARKA_EVENT_X
 * @param {string} data.assetId  - ARKA_EVTASSET_X to remove
 * @returns {{ status: string, updatedAssetsJson?: string, message?: string }}
 */
function removeEventAsset(data) {
  const currentMemberId = getVerifiedMemberId();
  if (!currentMemberId) return { status: 'error', message: 'Unauthorized session.' };
 
  const ss         = SpreadsheetApp.openById(SPREADSHEET_ID);
  const eventSheet = ss.getSheetByName(EVENT_SHEET);
  if (!eventSheet) return { status: 'error', message: 'EventDB sheet not found.' };
 
  const found = getEventRowById(eventSheet, data.eventId);
  if (!found) return { status: 'error', message: 'Event not found.' };
 
  if (!canManageEvent(currentMemberId, found.event)) {
    return { status: 'error', message: 'You do not have permission to remove assets from this event.' };
  }

  let assets = [];
  try {
    assets = JSON.parse(found.event.assetsJson || '[]');
  } catch (e) {
    return { status: 'error', message: 'Could not parse assets data.' };
  }
 
  const filtered          = assets.filter(function(a) { return a.assetId !== data.assetId; });
  const updatedAssetsJson = JSON.stringify(filtered);

  // ── Delete the Drive file ─────────────────────────────────────────────────
  // Extract the file ID from the stored Drive viewer URL:
  // format is https://drive.google.com/file/d/FILE_ID/view
  if (data.driveLink) {
    try {
      const fileIdMatch = data.driveLink.match(/\/d\/([a-zA-Z0-9_-]+)/);
      if (fileIdMatch && fileIdMatch[1]) {
        DriveApp.getFileById(fileIdMatch[1]).setTrashed(true);
      }
    } catch (driveErr) {
      // Log but don't block — the JSON record is removed regardless.
      // This handles cases where the file was already manually deleted from Drive.
      console.warn('Could not delete Drive file (may already be gone):', driveErr);
    }
  }

  eventSheet.getRange(found.rowIndex, 11).setValue(updatedAssetsJson);

  return { status: 'success', updatedAssetsJson };
}

/**
 * Silently records a single app load timing row to AppLoadTimingDB.
 *
 * Called fire-and-forget from the frontend — no success/failure handler.
 * Never throws; all errors are swallowed so a timing failure cannot
 * surface as a visible error to the user.
 *
 * Schema (AppLoadTimingDB):
 *   A  MemberID    - ARKA_MEMBER_X (or 'UNKNOWN' if session unresolvable)
 *   B  Timestamp   - dd-MM-yyyy HH:mm:ss Z
 *   C  AppVersion  - e.g. 'v37'
 *   D  BigGulpMs   - ms from T0 to Big Gulp success handler firing
 *   E  RenderMs    - ms from Big Gulp done to first render complete
 *   F  TotalMs     - ms from T0 to first render complete (D + E)
 *
 * @param {Object} data
 * @param {string} data.appVersion  - APP_VERSION constant from frontend
 * @param {number} data.bigGulpMs   - Network + GAS execution time
 * @param {number} data.renderMs    - Client-side render time
 * @param {number} data.totalMs     - Total perceived load time
 */
function logAppLoadTime(data) {
  try {
    // Resolve member silently — uses cached value so no extra sheet read
    const memberId  = getVerifiedMemberId() || 'UNKNOWN';
    const timestamp = Utilities.formatDate(
      new Date(), Session.getScriptTimeZone(), 'dd-MM-yyyy HH:mm:ss Z'
    );
 
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID)
                                .getSheetByName('AppLoadTimingDB');
 
    // If sheet doesn't exist yet, fail silently — don't crash the app
    if (!sheet) {
      console.warn('AppLoadTimingDB sheet not found — skipping timing log.');
      return;
    }
 
    sheet.appendRow([
      memberId,
      timestamp,
      data.appVersion || '',
      Number(data.bigGulpMs) || 0,
      Number(data.renderMs)  || 0,
      Number(data.totalMs)   || 0
    ]);
 
  } catch (e) {
    // Swallow everything — timing failure must never affect the user
    console.error('logAppLoadTime failed (non-fatal):', e);
  }
}

/**
 * logEmailClick()
 *
 * Logs an ARKA_ACTTYP_EMAIL_CLICK activity when a member opens the app via an
 * email deep-link. Called fire-and-forget from the frontend immediately after
 * the member is verified as Approved — zero UI impact, non-fatal if it fails.
 *
 * The trackingToken (ARKA_ET_XXXXXXXX) is stored as the ActivityLogDB description
 * so MasterEngine's _syncEmailQueue_() can match it back to EmailQueueDB and
 * back-fill the ClickedAt column during the next nightly run.
 *
 * Security: member is resolved from the active Google OAuth session via
 * getVerifiedMemberId() — the frontend does not pass a memberId parameter,
 * preventing any member from logging a click on behalf of another.
 *
 * CP: 0 — defined in ActivityTypeDB. Click tracking is a system signal,
 * not a rewarded user action.
 *
 * @param {string} trackingToken - ARKA_ET_XXXXXXXX token from the email deep-link
 * @returns {{ status: string }} Success or error status (frontend ignores return value)
 */
function logEmailClick(trackingToken) {
  // Resolve member from session — never trust the frontend to supply a memberId.
  const memberId = getVerifiedMemberId();
  if (!memberId) return { status: 'error', message: 'Unauthorized session.' };

  // Validate token format — only ARKA_ET_ prefix + alphanumeric chars accepted.
  // Guards against arbitrary strings being written to ActivityLogDB descriptions.
  const cleanToken = (trackingToken || '').toString().trim();
  if (!/^ARKA_ET_[A-Z0-9]+$/i.test(cleanToken)) {
    console.warn('logEmailClick: invalid or missing tracking token — skipping.');
    return { status: 'skipped', message: 'Invalid token format.' };
  }

  try {
    logActivityBatch(
      memberId,
      [{ typeId: 'ARKA_ACTTYP_EMAIL_CLICK', val: 1, desc: cleanToken }],
      1,     // activityValue (ignored for 0-CP types but required by signature)
      '',    // description (passed inside the batch object above)
      {},    // clientPointsMap (not needed — CP is 0)
      null,  // ss (logActivityBatch opens its own instance)
      false  // skipLock (this call has no outer lock)
    );
    console.log('logEmailClick: logged click for ' + memberId + ' token=' + cleanToken);
    return { status: 'success' };
  } catch (err) {
    // Non-fatal — click tracking failure must never surface to the user.
    console.error('logEmailClick failed (non-fatal):', err);
    return { status: 'error', message: err.message };
  }
}

/**
 * updateEmailOptOut()
 *
 * Writes the member's email notification preference to MemberDB Col U (EmailOptOut).
 * Called fire-and-forget from handleEmailOptOutToggle() in the Edit Profile panel.
 *
 * Storage convention: Col U stores the OPT-OUT flag (TRUE = no emails).
 * The frontend passes wantsEmails (the toggle's natural "on = good" orientation)
 * and this function inverts it before writing — callers never need to think about
 * the stored polarity.
 *
 * Security: member is resolved from the active Google OAuth session via
 * getVerifiedMemberId() — the frontend does not supply a memberId.
 *
 * @param {boolean} wantsEmails - true = member wants emails (write FALSE to Col U)
 *                                false = member opted out (write TRUE to Col U)
 * @returns {{ status: string, emailOptOut: boolean }}
 */
function updateEmailOptOut(wantsEmails) {
  const memberId = getVerifiedMemberId();
  if (!memberId) return { status: 'error', message: 'Unauthorized session.' };

  try {
    const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(MEMBERS_SHEET);
    const data  = sheet.getDataRange().getValues();

    // MemberDB Col U = index 20 (0-based), column 21 (1-based)
    const EMAIL_OPT_OUT_COL_INDEX  = 20; // Col U
    const EMAIL_OPT_OUT_COL_1BASED = 21; // for getRange()

    for (let i = 1; i < data.length; i++) {
      if ((data[i][0] || '').toString() !== memberId) continue;

      // Invert: wantsEmails=true → store false (not opted out)
      //         wantsEmails=false → store true (opted out)
      const optOutValue = !wantsEmails;
      sheet.getRange(i + 1, EMAIL_OPT_OUT_COL_1BASED).setValue(optOutValue);

      console.log('updateEmailOptOut: ' + memberId + ' → emailOptOut=' + optOutValue);
      return { status: 'success', emailOptOut: optOutValue };
    }

    return { status: 'error', message: 'Member row not found.' };

  } catch (err) {
    console.error('updateEmailOptOut failed:', err);
    return { status: 'error', message: err.message };
  }
}

/**
 * Keeps the GAS execution environment warm by touching the spreadsheet
 * every 10 minutes via a time-based trigger.
 *
 * A cold GAS instance costs 2,000–4,000ms of spin-up time before
 * executing a single line. A warm instance responds in ~200ms.
 * This function does the minimum work needed to keep the instance alive.
 *
 * HOW TO SET THE TRIGGER:
 *   1. Open Apps Script editor
 *   2. Click ⏱ Triggers (left sidebar alarm icon)
 *   3. Click + Add Trigger (bottom right)
 *   4. Function: keepWarm
 *   5. Event source: Time-driven
 *   6. Type: Minutes timer
 *   7. Interval: Every 10 minutes
 *   8. Save
 */
function keepWarm() {
  try {
    // Open the spreadsheet and read one cell — minimum viable work
    // to keep the V8 runtime and Sheets API connection alive
    SpreadsheetApp.openById(SPREADSHEET_ID)
                  .getSheetByName(MEMBERS_SHEET)
                  .getRange(1, 1)
                  .getValue();
  } catch (e) {
    // Swallow everything — a keepWarm failure should never alert anyone
  }
}

// ============================================================================
// CACHE HELPERS — Per-DB keys
// ArkaClubAppCode.gs
// ============================================================================

/**
 * Cache key registry — single source of truth for all cache key names.
 * Bump the version suffix when the schema for that DB changes.
 */
const CACHE_KEYS = {
  challenges   : 'arka_cache_challenges_v1',
  enrollments  : 'arka_cache_enrollments_v1',
  announcements: 'arka_cache_announcements_v1',
  activityTypes: 'arka_cache_activitytypes_v1',
  badges       : 'arka_cache_badges_v1',
  badgeAwards  : 'arka_cache_badgeawards_v1',
  clublevels   : 'arka_cache_clublevel_v1'
};

// Max TTL GAS allows — safe because invalidation clears on every write
const CACHE_TTL = 21600; // 6 hours


/**
 * Reads one DB from cache.
 * Returns parsed array on hit, null on miss or error.
 *
 * @param {string} key - One of the CACHE_KEYS values
 * @returns {Array|null}
 */
// Sheet used as a cross-project dirty-flag channel (written by MasterEngine).
const APP_CONFIG_SHEET = 'AppConfigData';
const BADGE_DIRTY_ROW  = 2; // row in AppConfigData that holds badge_awards_dirty flag

function getCachedDb(key) {
  try {
    // For badge awards: check the shared dirty flag written by MasterEngine.
    // MasterEngine runs in a separate GAS project so its CacheService namespace
    // is isolated — the flag cell is the only shared channel between projects.
    if (key === CACHE_KEYS.badgeAwards) {
      const configSheet = SpreadsheetApp.openById(SPREADSHEET_ID)
                            .getSheetByName(APP_CONFIG_SHEET);
      if (configSheet) {
        const flagVal = configSheet.getRange(BADGE_DIRTY_ROW, 2).getValue();
        if (flagVal === true) {
          configSheet.getRange(BADGE_DIRTY_ROW, 2).setValue(false);
          CacheService.getScriptCache().remove(key);
          console.log('Cache BYPASSED (badge dirty flag): ' + key);
          return null;
        }
      }
    }
    const cached = CacheService.getScriptCache().get(key);
    if (!cached) return null;
    console.log('Cache HIT: ' + key);
    return JSON.parse(cached);
  } catch(e) {
    console.warn('Cache read failed for ' + key + ':', e);
    return null;
  }
}


/**
 * Writes one DB array to cache.
 * Silently skips if payload exceeds 95KB (safe margin under 100KB limit).
 *
 * @param {string} key  - One of the CACHE_KEYS values
 * @param {Array}  data - The array to cache
 */
function setCachedDb(key, data) {
  try {
    const json = JSON.stringify(data);
    if (json.length > 95000) {
      console.warn('Cache SKIP (too large): ' + key +
        ' (' + Math.round(json.length / 1024) + 'KB)');
      return;
    }
    CacheService.getScriptCache().put(key, json, CACHE_TTL);
    console.log('Cache SET: ' + key +
      ' (' + Math.round(json.length / 1024) + 'KB)');
  } catch(e) {
    console.warn('Cache write failed for ' + key + ':', e);
  }
}


/**
 * Invalidates one specific cache key.
 * Call from write functions that modify the corresponding DB.
 *
 * @param {string} key - One of the CACHE_KEYS values
 */
function invalidateCacheKey(key) {
  try {
    CacheService.getScriptCache().remove(key);
    console.log('Cache INVALIDATED: ' + key);
  } catch(e) {}
}


/**
 * Invalidates ALL cached DBs — use when doing bulk admin operations
 * or when unsure which DBs were affected.
 */
function invalidateAllCaches() {
  try {
    CacheService.getScriptCache().removeAll(Object.values(CACHE_KEYS));
    console.log('All caches invalidated.');
  } catch(e) {}
}


// ═════════════════════════════════════════════════════════════════════════════
// QUICK LOG — Unlinked page logger
// Entry point: Quick Page Log card on the Me tab.
// Writes: PageLogDB + ActivityLogDB (always) + ReadingNotesDB (if note non-empty)
//         + 10 Pages A Day sheet bridge (if syncTo10Pages && dual member).
//
// TEMPORARY elements: bridgeTenPagesUpdate_(), getTenPagesNote() — deprecated
// when the 10 Pages A Day app is retired. Core writes (PageLogDB, ActivityLogDB,
// ReadingNotesDB) remain permanently.
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Logs an unlinked page reading session from the Quick Log modal.
 *
 * Payload fields:
 *   memberId         {string}  — Frontend-provided member ID (used for feed shape only).
 *                                Actual write uses session-verified ID.
 *   pages            {number}  — Pages read. Must be > 0.
 *   materialType     {string}  — e.g. "Academic", "News / Journalism", "". Written to
 *                                PageLogDB Col D. Empty string is valid (unspecified).
 *   noteText         {string}  — Freeform diary entry. Empty string = no note written.
 *   syncTo10Pages    {boolean} — If true, fire the 10 Pages A Day bridge.
 *   activityPointsMap {Object} — Client-side multiplier map for getActivityMultiplier().
 *
 * @param {Object} payload
 * @returns {Object} { status, newActivity } | { status: 'error', message }
 */
function logUnlinkedPages(payload) {
  // ── Session auth — use verified ID, not client-supplied memberId ──────────
  const currentMemberId = getVerifiedMemberId();
  if (!currentMemberId) {
    return { status: 'error', message: 'Unauthorized session.' };
  }

  // ── Input validation ──────────────────────────────────────────────────────
  const pages        = parseInt(payload.pages) || 0;
  const materialType = (payload.materialType || '').trim();
  const noteText     = (payload.noteText     || '').trim();
  const syncTo10     = !!payload.syncTo10Pages;

  if (pages <= 0) {
    return { status: 'error', message: 'Page count must be greater than zero.' };
  }

  // ── Lock: prevents duplicate ARKA_PLOG_X IDs under concurrent double-taps ──
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(8000)) {
    return { status: 'error', message: 'System is currently busy. Please try again.' };
  }
  try {

    // Use the member's local timezone for PageLogDB timestamps so ISO-week heatmap
    // binning reflects the day they experienced the read — mirrors logReadingProgress.
    const clientTzOffset = /^[+-]\d{4}$/.test((payload.clientTzOffset || '').trim())
      ? payload.clientTzOffset.trim()
      : '+0000';
    const ss        = SpreadsheetApp.openById(SPREADSHEET_ID);
    const timestamp = buildArkaTimestamp_(clientTzOffset);

    // ── 1. Write to PageLogDB ─────────────────────────────────────────────────
    // Col D carries materialType string for unlinked logs (blank when unspecified).
    // The ARKA_BOOK_X prefix distinguishes book IDs from material type strings —
    // any reader of Col D checks startsWith('ARKA_BOOK_') to know which it is.
    let newPlogId = null;
    try {
      const pageLogSheet = ss.getSheetByName(PAGELOG_SHEET);
      if (pageLogSheet) {
        // getNextPageLogNumber_ reads one cell instead of scanning the full table —
        // eliminates the race-prone full getDataRange() that duplicates IDs under load.
        newPlogId = 'ARKA_PLOG_' + getNextPageLogNumber_(pageLogSheet);
        pageLogSheet.appendRow([
          newPlogId,                    // Col A — LogID
          timestamp,                    // Col B — Timestamp (client local TZ)
          currentMemberId,              // Col C — MemberID
          materialType,                 // Col D — MaterialType (blank when unspecified)
          pages,                        // Col E — PagesDelta
          'ArkaClubApp ' + APP_VERSION  // Col F — Source
        ]);
      }
    } catch (pageLogErr) {
      console.error('logUnlinkedPages: PageLogDB write failed:', pageLogErr);
      return { status: 'error', message: 'Failed to log pages. Please try again.' };
    }

    // ── 2. Log activity (CP award) via logActivityBatch ───────────────────────
    // activityDescription mirrors the format used by logReadingProgress for consistency.
    const activityDesc = '+' + pages + ' unlinked pages logged'
      + (materialType ? ' (' + materialType + ')' : '');

    const loggedActivities = logActivityBatch(
      currentMemberId,
      [{
        typeId: 'ARKA_ACTTYP_PAGEREAD',
        val:    pages,
        desc:   activityDesc
      }],
      1,
      '',
      payload.activityPointsMap || {},
      ss,           // reuse already-open spreadsheet — avoids a redundant openById
      true,         // skipLock — outer logUnlinkedPages already holds the script lock
      clientTzOffset
    );

    // Build the full activity object the frontend needs to update its local state.
    const loggedActivity = loggedActivities.length > 0 ? loggedActivities[0] : null;
    const newActivity = loggedActivity ? {
      activityID:        loggedActivity.activityID,
      activityTypeID:    loggedActivity.activityTypeID,
      activityCPAwarded: loggedActivity.activityCPAwarded,
      activityDate:      timestamp,
      activityMemberID:  currentMemberId,
      activityDesc:      activityDesc,
      activitySource:    'ArkaClubApp ' + APP_VERSION
    } : null;

    // ── 3. Write reading note to ReadingNotesDB (non-fatal) ───────────────────
    if (noteText) {
      try {
        appendReadingNote_(ss, currentMemberId, newPlogId || '', noteText, 'QuickLog');
      } catch (noteErr) {
        console.warn('logUnlinkedPages: ReadingNotesDB write failed (non-fatal):', noteErr);
      }
    }

    // ── 4. 10 Pages A Day bridge (non-fatal) — TEMPORARY ─────────────────────
    // Fires the cumulative Sunday update + note write-back in the 10 Pages sheet.
    // No CP or PageLogDB write inside the bridge — Arka already handled both above.
    if (syncTo10) {
      try {
        bridgeTenPagesUpdate_(currentMemberId, pages, noteText);
      } catch (bridgeErr) {
        console.warn('logUnlinkedPages: 10 Pages bridge failed (non-fatal):', bridgeErr);
      }
    }

    // ── 5. Sync challenge progress (non-fatal) ────────────────────────────────
    try {
      syncCountChallengeProgress(currentMemberId, ss);
    } catch (challengeSyncErr) {
      console.warn('logUnlinkedPages: challenge sync failed (non-fatal):', challengeSyncErr);
    }

    return { status: 'success', newActivity: newActivity };

  } finally {
    lock.releaseLock();
  }
}


/**
 * Fetches the current reading note for a member from the 10 Pages A Day sheet.
 * Called by the Quick Log and Progress Log modals when the member presses
 * "Load 10 Pages Note".
 *
 * Resolution order: DisplayName (MemberDB Col D) → FullName (MemberDB Col C).
 * Returns empty string if the member is not found in the 10 Pages sheet.
 *
 * TEMPORARY — deprecated when the 10 Pages A Day app is retired.
 *
 * @param {string} memberId - ARKA_MEMBER_X of the requesting member.
 * @returns {string} The note text, or empty string.
 */
function getTenPagesNote(memberId) {
  // Auth: verify the session belongs to the requesting member.
  const sessionMemberId = getVerifiedMemberId();
  if (!sessionMemberId || sessionMemberId !== memberId) return '';

  try {
    // Resolve name via the explicit dual-member map — O(1), no sheet read needed.
    // Members not in this map are Arka-only and silently return empty string.
    const memberName = TEN_PAGES_MEMBER_MAP[sessionMemberId] || '';
    if (!memberName) return '';

    // Look up name in row 3 of the 10 Pages sheet (names start at Col C = column 3)
    const tenPagesSs    = SpreadsheetApp.openById(TEN_PAGES_SPREADSHEET_ID);
    const tenPagesSheet = tenPagesSs.getSheetByName(TEN_PAGES_SHEET_NAME);
    if (!tenPagesSheet) return '';

    const lastCol  = tenPagesSheet.getLastColumn();
    if (lastCol < 3) return '';

    const namesRow = tenPagesSheet.getRange(3, 3, 1, lastCol - 2).getValues()[0];
    // Case-insensitive match to be forgiving of minor capitalisation differences
    const colOffset = namesRow.findIndex(function(n) {
      return n.toString().trim().toLowerCase() === memberName.toLowerCase();
    });
    if (colOffset === -1) return ''; // Member not enrolled in 10 Pages

    const memberCol = colOffset + 3; // Convert 0-based namesRow index to 1-based sheet col
    const note      = tenPagesSheet.getRange(1, memberCol).getValue();
    return (note || '').toString();

  } catch (err) {
    console.warn('getTenPagesNote failed:', err);
    return '';
  }
}


/**
 * PRIVATE HELPER — Appends a single row to ReadingNotesDB.
 *
 * Guards: does nothing if noteText is empty after trim. This is the single
 * enforcement point — all callers rely on this guard rather than checking
 * themselves (though double-guarding at the call site is also fine).
 *
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss  - Open Arka spreadsheet.
 * @param {string} memberId  - ARKA_MEMBER_X of the note author.
 * @param {string} plogId    - ARKA_PLOG_X of the associated page log, or '' if none.
 * @param {string} noteText  - The diary entry text.
 * @param {string} source    - 'QuickLog' | 'ProgressLog'
 */
function appendReadingNote_(ss, memberId, plogId, noteText, source) {
  const trimmedNote = (noteText || '').trim();
  if (!trimmedNote) return; // Nothing to write

  const notesSheet = ss.getSheetByName(READING_NOTES_SHEET);
  if (!notesSheet) {
    console.warn('appendReadingNote_: ReadingNotesDB sheet not found.');
    return;
  }

  // Generate next NoteID by reading the last row's ID
  const lastRow    = notesSheet.getLastRow();
  let   newNoteNum = 1;
  if (lastRow > 1) {
    const lastNoteId  = notesSheet.getRange(lastRow, 1).getValue().toString();
    const lastNoteNum = parseInt(lastNoteId.split('_')[2]);
    if (!isNaN(lastNoteNum)) newNoteNum = lastNoteNum + 1;
  }

  const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd-MM-yyyy HH:mm:ss Z');

  notesSheet.appendRow([
    'ARKA_NOTE_' + newNoteNum, // Col A — NoteID
    timestamp,                 // Col B — Timestamp
    memberId,                  // Col C — MemberID
    plogId,                    // Col D — PlogID (blank for standalone future entries)
    trimmedNote,               // Col E — NoteText
    source                     // Col F — Source
  ]);
}


/**
 * PRIVATE HELPER — Writes a page delta and optional note to the 10 Pages A Day sheet.
 * Called by logUnlinkedPages() and logReadingProgress() when syncTo10Pages is true.
 *
 * Logic:
 *   1. Resolves the member's name via MemberDB DisplayName → FullName fallback.
 *   2. Finds the next upcoming Sunday row in 10aDay_Input_2026 Col A.
 *   3. Reads the member's current cumulative value for that Sunday (base).
 *   4. Writes base + pageDelta to the cell — purely additive, no regression check
 *      since we are always increasing by a positive delta.
 *   5. If noteText is non-empty, overwrites row 1 of the member's column.
 *
 * Does NOT call logActivityToDB — the caller (Arka) has already awarded CP
 * and written to PageLogDB. Calling it here would double-count both.
 *
 * TEMPORARY — deprecated when the 10 Pages A Day app is retired.
 *
 * @param {string} memberId  - ARKA_MEMBER_X of the member.
 * @param {number} pageDelta - Positive integer — pages to add to the cumulative total.
 * @param {string} noteText  - If non-empty, written to row 1 of the member's column.
 */
function bridgeTenPagesUpdate_(memberId, pageDelta, noteText) {
  if (!pageDelta || pageDelta <= 0) return;

  // ── 1. Resolve member name via explicit dual-member map ───────────────────
  // Members not in TEN_PAGES_NAME_MAP_ are Arka-only — skip silently.
  const memberName = TEN_PAGES_MEMBER_MAP[memberId] || '';
  if (!memberName) {
    console.log('bridgeTenPagesUpdate_: ' + memberId + ' not in 10 Pages map. Skipping.');
    return;
  }

  // ── 2. Open 10 Pages sheet and locate member column ───────────────────────
  const tenPagesSs    = SpreadsheetApp.openById(TEN_PAGES_SPREADSHEET_ID);
  const tenPagesSheet = tenPagesSs.getSheetByName(TEN_PAGES_SHEET_NAME);
  if (!tenPagesSheet) {
    console.warn('bridgeTenPagesUpdate_: 10 Pages sheet not found.');
    return;
  }

  const lastCol = tenPagesSheet.getLastColumn();
  if (lastCol < 3) return;

  const namesRow  = tenPagesSheet.getRange(3, 3, 1, lastCol - 2).getValues()[0];
  const colOffset = namesRow.findIndex(function(n) {
    return n.toString().trim().toLowerCase() === memberName.toLowerCase();
  });
  if (colOffset === -1) {
    // Member is not enrolled in the 10 Pages challenge — silently skip.
    console.log('bridgeTenPagesUpdate_: "' + memberName + '" not found in 10 Pages sheet. Skipping.');
    return;
  }
  const memberCol = colOffset + 3; // 1-based sheet column

  // ── 3. Find the next upcoming Sunday row ──────────────────────────────────
  // Matches the same getSundayRange() logic used by the 10 Pages app.
  const now        = new Date();
  const daysToSun  = (7 - now.getDay()) % 7; // 0 if today is Sunday
  const nextSunday = new Date(now);
  nextSunday.setDate(now.getDate() + daysToSun);
  nextSunday.setHours(0, 0, 0, 0);

  const lastRow    = tenPagesSheet.getLastRow();
  if (lastRow < 4) return; // No data rows

  const dateValues = tenPagesSheet.getRange(4, 1, lastRow - 3).getValues();
  let   targetRowIndex = -1; // 0-based within dateValues

  for (let i = 0; i < dateValues.length; i++) {
    const rowDate = new Date(dateValues[i][0]);
    rowDate.setHours(0, 0, 0, 0);
    if (rowDate.getTime() === nextSunday.getTime()) {
      targetRowIndex = i;
      break;
    }
  }

  if (targetRowIndex === -1) {
    console.warn('bridgeTenPagesUpdate_: Target Sunday row not found in 10 Pages sheet.');
    return;
  }

  // ── 4. Read current cumulative value and add pageDelta ────────────────────
  // Walk backwards from targetRowIndex to find the most recent non-empty value
  // (base), matching updateSheet()'s own base-finding logic.
  const pageValues = tenPagesSheet.getRange(4, memberCol, lastRow - 3).getValues();
  let   baseValue  = 0;

  for (let i = targetRowIndex; i >= 0; i--) {
    const val = parseFloat(pageValues[i][0]);
    if (!isNaN(val) && pageValues[i][0] !== '') {
      baseValue = val;
      break;
    }
  }

  const newCumulativeValue = baseValue + pageDelta;
  // Write to the target Sunday row (sheet row = targetRowIndex + 4)
  tenPagesSheet.getRange(targetRowIndex + 4, memberCol).setValue(newCumulativeValue);

  // ── 5. Write note to row 1 of member column (if provided) ────────────────
  const trimmedNote = (noteText || '').trim();
  if (trimmedNote) {
    tenPagesSheet.getRange(1, memberCol).setValue(trimmedNote);
  }

  console.log('bridgeTenPagesUpdate_: wrote ' + newCumulativeValue
    + ' to Sunday row for "' + memberName + '".');
}

/**
 * PRIVATE HELPER: Normalises a raw genre cell value from MemberDB Col K.
 * Returns an empty string for blank cells and legacy sentinel strings
 * ("None", "None listed.", "none listed" etc.) so the frontend never
 * renders a literal "None" chip or label on any member profile.
 *
 * @param  {*}      rawValue - Raw spreadsheet cell value (may be string, number, or empty)
 * @returns {string} Sanitised genre string, or "" if none
 */
function sanitiseGenreField_(rawValue) {
  const trimmed = String(rawValue || '').trim();
  const NONE_SENTINEL = /^none( listed\.?)?$/i;
  return NONE_SENTINEL.test(trimmed) ? '' : trimmed;
}


// ============================================================================
// ADMIN — BULK APPROVE
// ============================================================================

/**
 * Approves multiple Pending members in a single GAS call.
 * Acquires the script lock once and processes all rows in a single sheet scan.
 * Sends a welcome notice for each newly approved member (non-fatal on failure).
 *
 * @param {string[]} memberIds - Array of ARKA_MEMBER_X IDs to approve
 * @returns {{ status: string, approvedIds: string[], count: number }}
 */
function bulkApproveMembers(memberIds) {
  const currentMemberId = getVerifiedMemberId();
  if (!currentMemberId || !isAdminMember(currentMemberId)) {
    return { status: 'admin_required', message: 'Admin access required.' };
  }
  if (!Array.isArray(memberIds) || memberIds.length === 0) {
    return { status: 'error', message: 'No member IDs provided.' };
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    return { status: 'error', message: 'System is busy. Please try again in a moment.' };
  }

  try {
    const sheet   = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(MEMBERS_SHEET);
    const data    = sheet.getDataRange().getValues();
    const idSet   = new Set(memberIds.map(String));
    const approved = [];

    for (let i = 1; i < data.length; i++) {
      const rowId = data[i][0].toString();
      if (!idSet.has(rowId)) continue;
      if ((data[i][MEMBER_APPROVAL_COL_INDEX] || '').toString().trim() !== APPROVAL_STATUS.PENDING) continue;
      sheet.getRange(i + 1, MEMBER_APPROVAL_COL_NUMBER).setValue(APPROVAL_STATUS.APPROVED);
      const displayName = (data[i][3] || '').toString().trim();
      try { sendMemberWelcomeNotice_(rowId, displayName); } catch (e) { /* non-fatal */ }
      approved.push(rowId);
    }

    return { status: 'success', approvedIds: approved, count: approved.length };
  } finally {
    lock.releaseLock();
  }
}


// ============================================================================
// ADMIN — EMAIL QUEUE MONITOR
// ============================================================================

/**
 * Returns the 300 most recent EmailQueueDB rows from the BackEndEngine spreadsheet.
 * Read-only viewer for admins. Column map (0-based):
 *   A=QueueID, B=MemberID, D=DisplayName, E=EmailType, G=ScheduledDate,
 *   H=Status, I=SentAt, K=ClickedAt, M=CreatedAt
 *
 * @returns {{ status: string, queue: Object[] }}
 */
function getAdminEmailQueueData() {
  const currentMemberId = getVerifiedMemberId();
  if (!currentMemberId || !isAdminMember(currentMemberId)) {
    return { status: 'admin_required', message: 'Admin access required.' };
  }

  try {
    const backendSs  = SpreadsheetApp.openById(EMAIL_BACKEND_SPREADSHEET_ID);
    const queueSheet = backendSs.getSheetByName('EmailQueueDB');
    if (!queueSheet) return { status: 'error', message: 'EmailQueueDB sheet not found.' };

    const data = queueSheet.getDataRange().getValues();
    const rows = [];
    // Read newest rows first (skip header row 0)
    const start = Math.max(1, data.length - 300);
    for (let i = data.length - 1; i >= start; i--) {
      if (!data[i][0]) continue;
      rows.push({
        queueId      : data[i][0].toString(),
        memberId     : data[i][1].toString(),
        displayName  : data[i][3].toString(),
        emailType    : data[i][4].toString(),
        scheduledDate: data[i][6] ? data[i][6].toString() : '',
        status       : data[i][7] ? data[i][7].toString() : '',
        sentAt       : data[i][8] ? data[i][8].toString() : '',
        clickedAt    : data[i][10] ? data[i][10].toString() : '',
        createdAt    : data[i][12] ? data[i][12].toString() : ''
      });
    }

    return { status: 'success', queue: rows };
  } catch (e) {
    console.error('getAdminEmailQueueData error:', e);
    return { status: 'error', message: e.toString() };
  }
}

/**
 * Marks a PENDING EmailQueueDB entry as SUPPRESSED so ArkaEmailPass skips it.
 * Only PENDING entries can be suppressed — SENT/FAILED rows are immutable here.
 *
 * @param {string} queueId - ARKA_EMAILQ_X
 * @returns {{ status: string }}
 */
function adminSuppressEmailEntry(queueId) {
  const currentMemberId = getVerifiedMemberId();
  if (!currentMemberId || !isAdminMember(currentMemberId)) {
    return { status: 'admin_required', message: 'Admin access required.' };
  }

  try {
    const backendSs  = SpreadsheetApp.openById(EMAIL_BACKEND_SPREADSHEET_ID);
    const queueSheet = backendSs.getSheetByName('EmailQueueDB');
    if (!queueSheet) return { status: 'error', message: 'EmailQueueDB sheet not found.' };

    const data = queueSheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0].toString() !== queueId.toString()) continue;
      if ((data[i][7] || '').toString() !== 'PENDING') {
        return { status: 'error', message: 'Only PENDING entries can be suppressed.' };
      }
      queueSheet.getRange(i + 1, 8).setValue('SUPPRESSED'); // Col H — Status
      return { status: 'success' };
    }
    return { status: 'error', message: 'Queue entry not found.' };
  } catch (e) {
    console.error('adminSuppressEmailEntry error:', e);
    return { status: 'error', message: e.toString() };
  }
}

/**
 * ADMIN ONLY: Returns full ChallengeDB list with live enrollment counts.
 *
 * Enrollment count = rows in ChallengeEnrollmentDB for the challenge where
 * enrollmentStatus is NOT 'Dropped' (i.e. Active + Finisher + Winner).
 *
 * @returns {{ status: string, challengeList?: Array }}
 */
function getAdminChallengesData() {
  const currentMemberId = getVerifiedMemberId();
  if (!currentMemberId)                return { status: 'error', message: 'Unauthorized session.' };
  if (!isAdminMember(currentMemberId)) return { status: 'error', message: 'Admin access required.' };

  try {
    const ss             = SpreadsheetApp.openById(SPREADSHEET_ID);
    const challengeSheet = ss.getSheetByName(CHALLENGE_SHEET);
    if (!challengeSheet) return { status: 'error', message: 'ChallengeDB sheet not found.' };

    // Build enrollment counts per challengeId (exclude Dropped)
    const enrollCounts = {};
    const enrollSheet  = ss.getSheetByName(CHALLENGE_ENROLLMENT_SHEET);
    if (enrollSheet) {
      const enrollRows = enrollSheet.getDataRange().getValues();
      for (let i = 1; i < enrollRows.length; i++) {
        const cid    = (enrollRows[i][1] || '').toString().trim(); // Col B: ChallengeID
        const status = (enrollRows[i][4] || '').toString().trim(); // Col E: EnrollmentStatus
        if (cid && status !== 'Dropped') {
          enrollCounts[cid] = (enrollCounts[cid] || 0) + 1;
        }
      }
    }

    const challengeRows = challengeSheet.getDataRange().getValues();
    const challengeList = [];

    for (let i = 1; i < challengeRows.length; i++) {
      const r = challengeRows[i];
      if (!r[0]) continue;
      const cid = r[0].toString().trim();

      const rawStart = r[4];
      const rawEnd   = r[5];
      const startDate = rawStart instanceof Date
        ? Utilities.formatDate(rawStart, Session.getScriptTimeZone(), 'dd-MMM-yyyy')
        : (rawStart || '').toString().trim();
      const endDate = rawEnd instanceof Date
        ? Utilities.formatDate(rawEnd, Session.getScriptTimeZone(), 'dd-MMM-yyyy')
        : (rawEnd || '').toString().trim();

      challengeList.push({
        challengeId   : cid,
        challengeType : (r[1] || '').toString().trim(),
        title         : (r[2] || '').toString().trim(),
        description   : (r[3] || '').toString().trim(),
        startDate,
        endDate,
        goalValue     : Number(r[6]) || 0,
        goalUnit      : (r[7] || '').toString().trim(),
        goalConfigJson: (r[8] || '{}').toString().trim(),
        status        : (r[9] || 'Active').toString().trim(),
        competitionMode: parseCompetitionMode_(r[10]),
        seriesTag     : (r[11] || '').toString().trim(),
        isPinned      : r[12] === true || r[12] === 'TRUE',
        createdBy     : (r[13] || '').toString().trim(),
        createdOn     : (r[14] || '').toString().trim(),
        enrollPoints  : Number(r[15]) || 0,
        finishPoints  : Number(r[16]) || 0,
        winPoints     : Number(r[17]) || 0,
        enrolledCount : enrollCounts[cid] || 0
      });
    }

    return { status: 'success', challengeList: challengeList };

  } catch (err) {
    console.error('getAdminChallengesData error:', err);
    return { status: 'error', message: 'Failed to load challenges: ' + (err.message || String(err)) };
  }
}

/**
 * ADMIN ONLY: Awards year-end badges for a 10PAGESADAY challenge.
 *
 * Badge tiers (badge IDs stored in goalConfigJson):
 *   challengerBadge — every enrolled member (participation)
 *   finisherBadge   — members whose avg pages/day >= dailyGoal for the challenge year
 *   winnerBadge     — the single member with the highest total pages that year
 *
 * Page data source: PageLogDB, filtered to the challenge year.
 * Already-held active badges are skipped silently.
 *
 * @param  {string} challengeId — e.g. 'ARKA_CHAL_42'
 * @returns {Object} { status, challengerCount, finisherCount, winnerCount } | { status:'error', message }
 */
function award10PagesADayBadges(challengeId) {
  const currentMemberId = getVerifiedMemberId();
  if (!currentMemberId)               return { status: 'error', message: 'Unauthorized session.' };
  if (!isAdminMember(currentMemberId)) return { status: 'error', message: 'Admin access required.' };
  if (!challengeId)                    return { status: 'error', message: 'challengeId is required.' };

  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    // ── 1. Load challenge config ───────────────────────────────────────────
    const chalSheet = ss.getSheetByName(CHALLENGE_SHEET);
    if (!chalSheet) return { status: 'error', message: 'ChallengeDB sheet not found.' };
    const chalRows = chalSheet.getDataRange().getValues();
    let chalRow = null;
    for (let i = 1; i < chalRows.length; i++) {
      if ((chalRows[i][0] || '').toString().trim() === challengeId) { chalRow = chalRows[i]; break; }
    }
    if (!chalRow) return { status: 'error', message: 'Challenge not found: ' + challengeId };
    if ((chalRow[1] || '').toString().trim() !== '10PAGESADAY') {
      return { status: 'error', message: 'Challenge is not of type 10PAGESADAY.' };
    }

    let config = {};
    try { config = JSON.parse((chalRow[8] || '{}').toString()); } catch(e) {}
    const year         = config.year         || new Date().getFullYear();
    const dailyGoal    = config.dailyGoal    || 10;
    const yearlyGoal   = dailyGoal * 365;
    const challengerBadge = (config.challengerBadge || '').trim();
    const finisherBadge   = (config.finisherBadge   || '').trim();
    const winnerBadge     = (config.winnerBadge     || '').trim();

    // ── 2. Get enrolled members ────────────────────────────────────────────
    const enrollSheet = ss.getSheetByName(CHALLENGE_ENROLLMENT_SHEET);
    if (!enrollSheet) return { status: 'error', message: 'ChallengeEnrollmentDB not found.' };
    const enrollRows = enrollSheet.getDataRange().getValues();
    const enrolledMemberIds = [];
    for (let i = 1; i < enrollRows.length; i++) {
      const r = enrollRows[i];
      if ((r[1] || '').toString().trim() === challengeId &&
          (r[4] || '').toString().trim() !== 'Dropped') {
        const mid = (r[2] || '').toString().trim();
        if (mid) enrolledMemberIds.push(mid);
      }
    }
    if (!enrolledMemberIds.length) return { status: 'error', message: 'No enrolled members found for this challenge.' };

    // ── 3. Sum pages from PageLogDB for the challenge year ─────────────────
    const pageLogSheet = ss.getSheetByName(PAGELOG_SHEET || 'PageLogDB');
    const pagesByMember = {}; // memberId → total pages
    if (pageLogSheet) {
      const pageRows = pageLogSheet.getDataRange().getValues();
      // Cols: A=LogID, B=Timestamp, C=MemberID, D=BookID, E=PageDelta, F=Source
      for (let i = 1; i < pageRows.length; i++) {
        const r = pageRows[i];
        const ts = r[1];
        if (!ts) continue;
        const rowYear = (ts instanceof Date) ? ts.getFullYear() : new Date(ts).getFullYear();
        if (rowYear !== year) continue;
        const mid   = (r[2] || '').toString().trim();
        const delta = Number(r[4]) || 0;
        if (!mid || delta <= 0) continue;
        pagesByMember[mid] = (pagesByMember[mid] || 0) + delta;
      }
    }

    // ── 4. Compute avg pages/day (using 365 days for the year) ────────────
    const daysInYear = ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0) ? 366 : 365;

    // ── 5. Load existing awards to skip duplicates ─────────────────────────
    const awardSheet = ss.getSheetByName(BADGE_AWARD_DB_SHEET);
    if (!awardSheet) return { status: 'error', message: 'BadgeAwardDB sheet not found.' };
    const existingAwards = awardSheet.getDataRange().getValues();
    function alreadyHolds(mid, bid) {
      for (let i = 1; i < existingAwards.length; i++) {
        if ((existingAwards[i][1] || '').toString() === bid &&
            (existingAwards[i][2] || '').toString() === mid &&
            (existingAwards[i][5] || '').toString() === 'Active') return true;
      }
      return false;
    }

    // Award ID sequencing helper
    function getNextAwardId() {
      const allIds = awardSheet.getRange('A:A').getValues();
      let last = 0;
      for (let i = allIds.length - 1; i >= 0; i--) {
        const v = (allIds[i][0] || '').toString();
        if (v.startsWith('ARKA_AWARD_')) {
          const n = parseInt(v.split('_')[2]);
          if (!isNaN(n) && n > last) last = n;
          break;
        }
      }
      return last + 1;
    }

    let nextIdNum = getNextAwardId();
    const dateFormatted = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd-MMM-yyyy');
    const noteBase = year + ' 10 Pages a Day Challenge · awarded by admin';

    function writeAward(memberId, badgeId, note) {
      const awardId = 'ARKA_AWARD_' + nextIdNum++;
      awardSheet.appendRow([awardId, badgeId, memberId, currentMemberId, dateFormatted, 'Active', note]);
      try {
        logActivityBatch(memberId, [{ typeId: 'ARKA_ACTTYP_BADGEAWARD', val: 0, desc: awardId }]);
      } catch(e) { console.warn('logActivityBatch failed for ' + memberId + ': ' + e); }
      return awardId;
    }

    // ── 6. Award Challenger badge to all enrolled ──────────────────────────
    let challengerCount = 0;
    if (challengerBadge) {
      enrolledMemberIds.forEach(function(mid) {
        if (!alreadyHolds(mid, challengerBadge)) {
          writeAward(mid, challengerBadge, noteBase + ' · Challenger');
          challengerCount++;
        }
      });
    }

    // ── 7. Award Finisher badge to members meeting avg goal ────────────────
    let finisherCount = 0;
    if (finisherBadge) {
      enrolledMemberIds.forEach(function(mid) {
        const total = pagesByMember[mid] || 0;
        const avg   = total / daysInYear;
        if (avg >= dailyGoal && !alreadyHolds(mid, finisherBadge)) {
          writeAward(mid, finisherBadge, noteBase + ' · Finisher (' + Math.round(avg) + ' pg/day)');
          finisherCount++;
        }
      });
    }

    // ── 8. Award Winner badge to top member ───────────────────────────────
    let winnerCount = 0;
    if (winnerBadge && enrolledMemberIds.length) {
      let topMid = '', topPages = -1;
      enrolledMemberIds.forEach(function(mid) {
        const p = pagesByMember[mid] || 0;
        if (p > topPages) { topPages = p; topMid = mid; }
      });
      if (topMid && topPages > 0 && !alreadyHolds(topMid, winnerBadge)) {
        writeAward(topMid, winnerBadge, noteBase + ' · Page Turner (' + topPages + ' pages)');
        winnerCount++;
      }
    }

    invalidateCacheKey(CACHE_KEYS.badgeAwards);
    return { status: 'success', challengerCount: challengerCount, finisherCount: finisherCount, winnerCount: winnerCount };

  } catch (err) {
    console.error('award10PagesADayBadges error:', err);
    return { status: 'error', message: 'Failed to award badges: ' + (err.message || String(err)) };
  }
}
