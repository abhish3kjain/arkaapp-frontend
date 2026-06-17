/**
 * ARKA MASTER SYNC ENGINE (Standalone Backend)
 * Calculates absolute Club Points, audits for specific point farming rules,
 * issues negative corrections, and batch-updates the MemberDB.
 *
 * Runs every midnight via a time-based trigger.
 *
 * Rule 5 (cpAwarded validation) only scrutinises entries logged AFTER the last
 * MasterSync Engine entry in the ActivityLogDB. Everything before that row was
 * already verified by a prior run, so re-checking it would re-penalise entries
 * that are already correct. The boundary is located by scanning backwards for
 * activitySource === "MasterSync Engine", a string that must never change.
 */

const SPREADSHEET_ID      = '1qXsAAO_9aIEJuTTQ1ziX9s5plvm6WHaVI_zaKcSXF-4';
const MEMBERS_SHEET_NAME  = 'MemberDB';
const MASTERSYNC_SOURCE   = 'MasterSync Engine';  // Never change — used as source sentinel
const MASTERSYNC_AWARDER  = 'MasterEngine';        // AwardedBy value in BadgeAwardDB for auto-awards

// Sheet name constants for badge system
const BADGE_DB_SHEET_NAME        = 'BadgeDB';
const BADGE_AWARD_DB_SHEET_NAME  = 'BadgeAwardDB';
const LIBRARY_SHEET_NAME         = 'ArkaLibraryDB';
const BOOK_POST_SHEET_NAME       = 'BookPostDB';
const QUOTES_SHEET_NAME              = 'QuotesDB';
const CHALLENGE_SHEET_NAME           = 'ChallengeDB';
const CHALLENGE_ENROLLMENT_SHEET_NAME = 'ChallengeEnrollmentDB';

// Target column count for MemberDB after adding Col S (CoachInsights).
// MasterEngine pads every memData row to this width before batch-writing
// so the new column is included without changing the existing setValues call.
const MEMBER_DB_TARGET_COL_COUNT = 21; // A(1) through T(20) — includes ApprovalStatus

// ── BackEndEngine integration ──────────────────────────────────────────────
/**
 * BackEndEngine spreadsheet ID.
 * Houses EmailQueueDB, EmailSentLogDB, and BackEndConfigDB.
 * Kept separate from the main app spreadsheet so email sends and queue state
 * never touch data the member app reads — clean operational boundary.
 */
const EMAIL_BACKEND_SPREADSHEET_ID = '1s5h8T6PGPTOBs_RKJNRJjRCZm8igWJzmniLRoW7BFJA';

/**
 * PropertiesService key set by MasterEngine after _syncEmailQueue_() completes.
 * ArkaEmailPass checks this flag before reading EmailQueueDB so it never
 * processes a partially-written queue from a prior night's stale run.
 */
const EMAILPASS_READY_FLAG_KEY = 'ARKAEMAILPASS_READY';

// ── Script cache utilities ─────────────────────────────────────────────────
// MasterEngine is a standalone GAS project and cannot reference functions
// defined in ArkaClubAppCode. These are the minimal cache constants and
// helpers MasterEngine needs to invalidate the BadgeAwardDB cache after
// each nightly badge write, so the member app gets fresh data on next load.
// Key strings must stay in sync with CACHE_KEYS in ArkaClubAppCode.
const MASTER_CACHE_KEYS = {
  badgeAwards: 'arka_cache_badgeawards_v1'
};

/**
 * Removes one cache key from the script cache.
 * Called after MasterEngine writes new rows to BadgeAwardDB so the member
 * app does not serve stale badge data on the next Wave 3 load.
 * Silently swallows errors — cache invalidation failure is never fatal.
 *
 * @param {string} key - A MASTER_CACHE_KEYS value
 */
function invalidateCacheKey(key) {
  try {
    CacheService.getScriptCache().remove(key);
    console.log('MasterEngine: cache invalidated — ' + key);
  } catch (cacheErr) { /* non-fatal — app will re-fetch from sheet on next load */ }
}

// ── AI Coach pass ──────────────────────────────────────────────────────────
// The Gemini API call is deliberately NOT made from MasterEngine.
// MasterEngine's job is stats + badges only — it must finish in < 6 minutes
// regardless of member count. All Gemini calls are handled by the separate
// ArkaAIPass script which chains its own time-based triggers and respects
// the 15 RPM free-tier limit without blocking this engine.
//
// MasterEngine signals completion by writing ARKAAIPASS_READY = 'true' to
// PropertiesService. ArkaAIPass reads this flag at its scheduled start time.
//
// The only constant kept here is the kill switch — it is read by BOTH scripts
// so setting it false in Script Properties disables AI calls app-wide without
// touching either file.
const GEMINI_COACH_ENABLED = true; // Set false in Script Properties to disable AI pass globally

// ── Badge threshold arrays ─────────────────────────────────────────────────
// Index position (0-based) + 1 === badgeTier in BadgeDB.
// Arrays must stay ascending — the badge pass assumes this.
const BADGE_THRESHOLDS = {
  PAGE_MILESTONE   : [1000, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 750000, 1000000],
  BOOK_MILESTONE   : [10, 25, 50, 100, 200, 500, 750, 1000, 2500, 5000],
  STREAK_MILESTONE : [10, 25, 50, 100, 200, 500, 750, 1000, 2000],
  PLOGGER          : [10, 25, 50, 100, 200, 500, 750, 1000, 2000],
  REVIEW_MILESTONE : [10, 25, 50, 100, 200, 500, 750, 1000, 2000, 5000],
  FAT_READ         : [400, 600, 800, 1000, 1500, 2000, 2500, 3000],
  GENRE_COLLECTOR  : [10, 25, 50, 75, 100, 150, 200, 250, 500, 1000],
  SOCIAL_BUTTERFLY : [3, 5, 10, 25, 50, 100, 250, 500],
  LIBRARIAN        : [5, 10, 25, 50, 100, 250, 500],
  ANNIVERSARY      : [1, 3, 5, 10, 15, 20, 25, 30, 35, 40, 50]
};

// Tier thresholds for Genre Explorer — same for all genres.
// Update this count when adding new canonical genres to GENRE_ALIAS_MAP.
// Current genres: 21 (Fiction, Fantasy, Sci-Fi, Crime & Suspense, Non-Fiction,
//   Self-Help, Philosophy, Psychology, Classics, Religious, Horror, Business,
//   Poetry, Romance, LGBTQ+, Memoir, Young Adult, Politics, Comics, Humor, History)
const GENRE_EXPLORER_THRESHOLDS = [5, 10, 25, 50, 75, 100, 150, 200, 250, 500];

// Minimum activity required before a member can win a yearly award
const YEARLY_MIN_THRESHOLDS = {
  CRITIC_OF_YEAR      : 5,    // minimum reviews written in the award year
  MASTER_RATER        : 10,   // minimum ratings submitted in the award year
  MARATHON_READER     : 4,    // minimum consecutive-week streak within the award year
  BOOK_COLLECTOR      : 5,    // minimum books finished in the award year
  PAGE_TURNER         : 500   // minimum pages read in the award year
};

// ── Canonical genre alias map ──────────────────────────────────────────────
// Maps each canonical badge genre name to lowercase aliases that match
// free-text genre tags in ArkaLibraryDB. Matching is case-insensitive.
// All aliases are pre-lowercased here.
//
// Cross-genre boundary rules (to prevent double-counting):
//   • 'historical fiction'   → Fiction only   (not History)
//   • 'historical romance'   → Romance only   (not History)
//   • 'ya dystopian'         → Young Adult    (adult 'dystopian' alone → Sci-Fi)
//   • 'paranormal romance'   → Romance only   (bare 'paranormal' → Horror)
//   • 'true crime'           → Crime & Suspense (not Non-Fiction)
//   • 'political philosophy' → Philosophy only (not Politics)
//   • 'political biography'  → Politics only  (not Memoir)
//   • 'criminology'          → Non-Fiction    (academic study, not true crime narrative)
//   • 'social sciences' etc  → Non-Fiction    (no separate Social Sciences canonical genre)
//   • 'personal finance'     → Business       ('financial literacy' → Self-Help)
//   • 'anthology'            → Poetry         (typically poetry collections in library context)
const GENRE_ALIAS_MAP = {

  // ── Core Fiction ──────────────────────────────────────────────────────────
  'Fiction'          : ['fiction', 'literary fiction', 'general fiction',
                        'contemporary fiction', "women's fiction",
                        'historical fiction',          // most common missing alias
                        'short stories', 'short story collection', 'novella',
                        'chick lit', 'family saga', 'domestic fiction',
                        'upmarket fiction', 'book club fiction'],

  // ── Genre Fiction ─────────────────────────────────────────────────────────
  'Fantasy'          : ['fantasy', 'epic fantasy', 'urban fantasy', 'dark fantasy',
                        'high fantasy', 'magical realism',
                        'sword and sorcery', 'grimdark', 'grimdark fantasy',
                        'cozy fantasy', 'mythic fiction', 'mythology',
                        'fairy tale', 'fairy tales', 'fairy tale retelling',
                        'fable', 'folk tale'],

  'Sci-Fi'           : ['sci-fi', 'science fiction', 'scifi', 'sf',
                        'speculative fiction', 'hard science fiction',
                        'dystopian', 'dystopia',       // adult only; 'ya dystopian' → Young Adult
                        'cyberpunk', 'steampunk', 'biopunk',
                        'space opera', 'military sci-fi',
                        'post-apocalyptic', 'post apocalyptic',
                        'climate fiction', 'cli-fi'],

  'Crime & Suspense' : ['crime', 'thriller', 'mystery', 'suspense',
                        'detective', 'noir', 'psychological thriller', 'legal thriller',
                        'true crime',                  // nonfiction but badge-binned here
                        'cozy mystery', 'cozy crime',
                        'hard-boiled', 'hardboiled',
                        'police procedural', 'procedural',
                        'espionage', 'spy fiction', 'spy thriller',
                        'whodunit', 'whodunnit', 'heist'],

  'Horror'           : ['horror', 'gothic', 'supernatural fiction', 'gothic fiction',
                        'paranormal', 'paranormal fiction', // bare paranormal; 'paranormal romance' stays in Romance
                        'occult', 'ghost story', 'ghost stories',
                        'supernatural horror', 'folk horror',
                        'cosmic horror', 'lovecraftian',
                        'psychological horror', 'body horror'],

  'Romance'          : ['romance', 'romantic fiction', 'contemporary romance',
                        'historical romance', 'paranormal romance',
                        'romantic comedy', 'romcom', 'love story',
                        'new adult romance', 'sports romance'],

  // ── Non-Fiction umbrella ──────────────────────────────────────────────────
  // Social sciences (sociology, gender studies, anthropology etc.) are binned
  // here rather than a separate canonical genre — they are a sub-category of
  // nonfiction and the club's library volume doesn't yet warrant their own badge.
  'Non-Fiction'      : ['non-fiction', 'nonfiction', 'narrative nonfiction',
                        'general non-fiction', 'popular nonfiction',
                        'popular science',
                        'essays', 'essay collection',
                        'journalism', 'narrative journalism',
                        'investigative journalism', 'reportage',
                        'travel writing', 'travel',
                        'nature writing', 'environment', 'environmental',
                        'science writing', 'science journalism',
                        // Social sciences — binned here per product decision
                        'sociology', 'social science', 'social sciences',
                        'gender studies', 'anthropology', 'cultural studies',
                        "women's studies", 'race studies', 'ethnic studies',
                        'media studies', 'communication studies',
                        'criminology',                 // academic study of crime, not true crime narrative
                        'urban studies', 'public health'],

  'Self-Help'        : ['self-help', 'self help', 'personal development',
                        'personal growth', 'productivity', 'motivation',
                        'wellness', 'mental wellness', 'mindfulness', 'meditation',
                        'habits', 'life coaching', 'coaching',
                        'career development', 'career', 'financial literacy',
                        'stress management', 'communication skills',
                        'relationships', 'parenting'],

  'Philosophy'       : ['philosophy', 'ethics', 'metaphysics',
                        'political philosophy',        // stays here only, not in Politics
                        'stoicism', 'existentialism',
                        'eastern philosophy', 'western philosophy',
                        'continental philosophy', 'analytic philosophy',
                        'moral philosophy', 'ancient philosophy',
                        'epistemology', 'logic', 'phenomenology'],

  'Psychology'       : ['psychology', 'behavioral science', 'cognitive science',
                        'neuroscience', 'social psychology',
                        'psychiatry', 'psychoanalysis', 'therapy',
                        'mental health',               // clinical framing → Psychology; 'mental wellness' → Self-Help
                        'positive psychology', 'developmental psychology',
                        'behavioral psychology', 'educational psychology',
                        'evolutionary psychology'],

  'Business'         : ['business', 'leadership', 'management',
                        'economics', 'finance', 'entrepreneurship', 'strategy',
                        'investing', 'investment', 'investing guide',
                        'marketing', 'sales',
                        'startup', 'startups',
                        'personal finance',            // financial self-improvement → Business; 'financial literacy' → Self-Help
                        'accounting', 'corporate',
                        'human resources', 'operations',
                        'supply chain', 'innovation'],

  // ── Literature & Arts ─────────────────────────────────────────────────────
  'Classics'         : ['classics', 'classic literature', 'literary classics',
                        'classic fiction',
                        'victorian', 'victorian literature', 'victorian fiction',
                        'modernist literature', 'edwardian literature',
                        'ancient literature', 'greek literature', 'roman literature',
                        'renaissance literature', 'enlightenment literature'],

  'Poetry'           : ['poetry', 'poems', 'verse', 'poetic',
                        'spoken word', 'prose poetry', 'lyric poetry',
                        'narrative poetry', 'haiku', 'sonnets',
                        'anthology'],                  // typically poetry anthology in library context

  // ── Identity & Community ─────────────────────────────────────────────────
  'Religious'        : ['religious', 'spirituality', 'religion', 'faith',
                        'theology', 'spiritual',
                        'christianity', 'christian', 'islam', 'islamic',
                        'buddhism', 'buddhist', 'hinduism', 'hindu',
                        'judaism', 'jewish', 'biblical',
                        'devotional', 'inspirational',
                        'new age', 'mysticism'],

  'LGBTQ+'           : ['lgbtq+', 'lgbtq', 'lgbt', 'queer fiction', 'queer',
                        'gay fiction', 'lesbian fiction', 'trans fiction',
                        'queer lit', 'queer literature',
                        'sapphic', 'sapphic fiction',
                        'nonbinary fiction', 'bisexual fiction',
                        'queer romance', 'queer nonfiction',
                        'queer memoir', 'rainbow fiction'],

  // ── Life Writing ─────────────────────────────────────────────────────────
  'Memoir'           : ['memoir', 'memoirs', 'autobiography', 'autobiographies',
                        'autobiographical', 'biographical', 'biography', 'biographies',
                        'personal essay', 'personal essays', 'personal narrative',
                        'life writing', 'literary memoir', 'creative nonfiction memoir',
                        'personal memoir', 'celebrity memoir',
                        'true story', 'personal history', 'narrative memoir'],

  // ── Age Category ─────────────────────────────────────────────────────────
  // 'ya dystopian' captured here; bare 'dystopian' → Sci-Fi above.
  'Young Adult'      : ['young adult', 'ya', 'ya fiction', 'young adult fiction',
                        'ya fantasy', 'ya romance', 'ya thriller', 'ya sci-fi',
                        'ya science fiction', 'ya mystery', 'ya contemporary',
                        'ya dystopian', 'ya historical', 'ya horror',
                        'teen fiction', 'teen lit', 'teenager fiction',
                        'ya literature', 'juvenile fiction',
                        'middle grade', 'coming of age', 'bildungsroman',
                        'new adult'],

  // ── Current Affairs ──────────────────────────────────────────────────────
  // 'political philosophy' deliberately NOT listed here — stays in Philosophy only.
  // 'political biography' listed here; bare 'biography' → Memoir.
  'Politics'         : ['politics', 'political', 'political nonfiction',
                        'political science', 'political history',
                        'political biography', 'political memoir',
                        'government', 'democracy', 'geopolitics',
                        'international relations', 'public policy', 'public affairs',
                        'political theory', 'political analysis', 'policy',
                        'elections', 'diplomacy', 'social policy', 'civil rights',
                        'activism', 'social justice', 'foreign policy'],

  // ── Visual Narrative ─────────────────────────────────────────────────────
  'Comics'           : ['comics', 'comic book', 'comic books',
                        'graphic novel', 'graphic novels',
                        'manga', 'manhwa', 'manhua',
                        'graphic memoir', 'graphic nonfiction',
                        'illustrated novel', 'sequential art',
                        'bande dessinée', 'bande dessinees',
                        'webcomic', 'comic strip',
                        'superhero comics', 'indie comics'],

  // ── Tone ─────────────────────────────────────────────────────────────────
  'Humour'            : ['humor', 'humour', 'comedy', 'comedic fiction',
                        'humorous fiction', 'satire', 'satirical', 'satirical fiction',
                        'parody', 'comic fiction', 'wit', 'funny',
                        'dark comedy', 'absurdist fiction',
                        'absurdist humor', 'absurdist humour', 'absurdism',
                        'humorous nonfiction', 'comedic nonfiction',
                        'light reads', 'cozy humor'],

  // ── Historical Record ─────────────────────────────────────────────────────
  // 'historical fiction' → Fiction. 'historical romance' → Romance.
  // 'political history' → Politics. Only nonfiction historical works here.
  'History'          : ['history', 'historical nonfiction', 'world history',
                        'military history', 'war history',
                        'ancient history', 'medieval history',
                        'modern history', 'contemporary history',
                        'american history', 'us history',
                        'european history', 'british history',
                        'asian history', 'african history',
                        'latin american history', 'social history',
                        'cultural history', 'economic history',
                        'narrative history', 'popular history',
                        'revisionist history', 'art history',
                        'natural history', 'history of science',
                        'oral history', 'local history',
                        'presidential history', 'colonial history']
};

/**
 * Must match the MAX_CP_PER_ACTION ceiling defined in the main app's logActivity.
 * A legitimate entry may equal this value even if the raw ActivityTypeDB multiplier is higher,
 * because the app caps it before writing. We treat capped entries as correct.
 */
const MAX_CP_PER_ACTION = 1000000;

// --- AUDIT CONFIGURATION ---
// Mapped directly to your application's specific ActivityType IDs
const AUDIT_TYPES = {
  META_REVIEW:    "ARKA_ACTTYP_BOOKUPDATE",
  RATING:         "ARKA_ACTTYP_BOOKRATING",
  REVIEW:         "ARKA_ACTTYP_BOOKREVIEW",
  PROFILE_UPDATE: "ARKA_ACTTYP_PROFILEUPDATE",
  FEEDBACK:       "ARKA_ACTTYP_FEEDBACK",        // Rule 6 — one point-earning submission per day
  BOOK_POST:      "ARKA_ACTTYP_BOOKPOST",        // Rule 7 — daily cap on point-earning posts
  SHARE_PROGRESS: "ARKA_ACTTYP_SHAREPROGRESS",   // Rule 9 — one point-earning share per 6-hour window
  STATUS_CHANGES: [
    "ARKA_ACTTYP_BOOKTOREAD", 
    "ARKA_ACTTYP_BOOKDNF", 
    "ARKA_ACTTYP_BOOKREADING", 
    "ARKA_ACTTYP_BOOKREAD"
  ]
};

// Activity types whose cpAwarded is set per-challenge in ChallengeDB,
// not by the ActivityTypeDB multiplier. Rule 5 must skip these types
// to avoid incorrectly flagging legitimate variable-point awards.
// Activity types that Rule 5 must never validate because their cpAwarded
// is legitimately variable at log time and cannot be derived from the
// ActivityTypeDB multiplier alone:
//   - Challenge types: points set per-challenge via ChallengeDB
//   - PAGEREAD: cpAwarded = pageDelta × 4 (variable per session)
//   - EVENTATTENDED / EVENTHOSTED: points injected from event-type map
//   - BADGEAWARD / BADGEREVOKE: points injected from BadgeDB at log time
//   - MILESTONE_*: points injected by MasterEngine tier table
//   - SYS_ACTTYP_PAGEREAD / SYS_ACTTYP_CLUBPOINTS_ADD: admin-set directly
const VARIABLE_POINT_TYPES = new Set([
  'ARKA_ACTTYP_CHALLENGE_ENROLL',
  'ARKA_ACTTYP_CHALLENGE_FINISH',
  'ARKA_ACTTYP_CHALLENGE_WIN',
  'ARKA_ACTTYP_PAGEREAD',
  'ARKA_ACTTYP_EVENTATTENDED',
  'ARKA_ACTTYP_EVENTHOSTED',
  'ARKA_ACTTYP_BADGEAWARD',   // auto-awards use injected badgePoints CP — not ActivityTypeDB multiplier
  'ARKA_ACTTYP_BADGEREVOKE',
  // Legacy types — no longer written by MasterEngine but kept here so Rule 5
  // never re-validates historical entries that had injected CP.
  'ARKA_ACTTYP_MILESTONE_PAGES',
  'ARKA_ACTTYP_MILESTONE_BOOKS',
  'SYS_ACTTYP_BADGEAWARD',    // legacy system auto-award type — retired, kept for audit safety
  'SYS_ACTTYP_PAGEREAD',
  'SYS_ACTTYP_CLUBPOINTS_ADD',
  'ARKA_ACTTYP_PERSONAUPDATE'
]);

// Activity types whose CP MasterEngine reverses when their parent shelf record is deleted.
// PAGEREAD is included because its activityDesc contains the shelfId at the end
// (format: "+N pages added to ARKA_SHELF_X") and the CP was tied to shelf progress.
const SHELF_REVERSIBLE_ACTIVITY_TYPES = new Set([
  'ARKA_ACTTYP_BOOKTOREAD',
  'ARKA_ACTTYP_BOOKREADING',
  'ARKA_ACTTYP_BOOKREAD',
  'ARKA_ACTTYP_BOOKDNF',
  'ARKA_ACTTYP_BOOKRATING',
  'ARKA_ACTTYP_BOOKREVIEW',
  'ARKA_ACTTYP_SHELFUPDATE',
  'ARKA_ACTTYP_PAGEREAD'
]);

// Maximum number of point-earning book discussion posts per member per calendar day.
// Posts beyond this count have their points reversed by Rule 7.
// Adjust this value in ChallengeDB without a code deploy — it is the only constant
// that should need tuning as the community grows.
const MAX_DAILY_BOOK_POSTS = 3;

// PAGE_MILESTONES and BOOK_MILESTONES removed — milestone CP is now awarded via
// the badge system (ARKA_ACTTYP_BADGEAWARD). Historical entries of
// ARKA_ACTTYP_MILESTONE_PAGES and ARKA_ACTTYP_MILESTONE_BOOKS remain in
// ActivityLogDB and are still summed correctly; the badge pass detects them
// via legacyMilestoneSet and awards the badge with 0 CP to avoid double-counting.

/**
 * Determines the appropriate user level based on their total club points.
 * @param {number} points - The user's true calculated points.
 * @param {Array<Object>} levelRules - Array of objects containing maxClubPoints and levelName.
 * @returns {string} The calculated level name (e.g., "Novice", "Master").
 */
function getLevelName(points, levelRules) {
  if (!levelRules || levelRules.length === 0) return "Reader";
  if (points > levelRules[levelRules.length - 1].maxClubPoints) {
    return levelRules[levelRules.length - 1].levelName;
  }
  for (let level of levelRules) {
    if (points <= level.maxClubPoints) return level.levelName;
  }
  return levelRules[0].levelName;
}

/**
 * Finds the row index (1-based, in the raw 2D array) of the LAST entry whose
 * activitySource is "MasterSync Engine". Returns 0 if none found, meaning the
 * engine has never run before and ALL entries are unverified.
 *
 * Scans backwards so it terminates as soon as the most-recent run is found,
 * making it O(1) in the normal steady-state case.
 *
 * @param {Array<Array<any>>} activityData - Full ActivityLogDB 2D array (row 0 = header).
 * @returns {number} Index of the last MasterSync row, or 0 if not found.
 */
function findLastMasterSyncRowIndex(activityData) {
  for (let i = activityData.length - 1; i >= 1; i--) {
    if ((activityData[i][5] || "").toString().trim() === MASTERSYNC_SOURCE) {
      return i;
    }
  }
  return 0; // Engine has never run — treat all entries as unverified
}

/**
 * Parses any Arka date/timestamp string from a Google Sheet cell into a Date.
 *
 * Handles three formats written by the app:
 *   1. Native Date object     — returned as-is (Sheets auto-parsed the cell).
 *   2. Arka Z-Format          — "dd-MM-yyyy HH:mm:ss +NNNN" (ActivityLogDB, PageLogDB,
 *                               EnrollmentDB timestamps). GAS V8 new Date() rejects this
 *                               non-ISO format and returns NaN — so we reorder to ISO 8601.
 *   3. Arka Short-Date        — "dd-MMM-yyyy" (JoinDate, dateFinished, badge awardedDate).
 *                               Constructed explicitly via month map to avoid locale drift.
 *   4. ISO / other            — passed to new Date() as a last-resort fallback.
 *
 * @param  {Date|string|*} raw - Raw cell value from getValues().
 * @returns {Date} Valid Date on success; new Date(NaN) on failure.
 *                 Callers must guard with isNaN(result.getTime()).
 */
function parseArkaDateString_(raw) {
  if (!raw) return new Date(NaN);
  if (raw instanceof Date) return raw; // Sheets auto-parsed the cell — use directly

  var str = raw.toString().trim();

  // ── Format 2: Arka Z-Format — "dd-MM-yyyy HH:mm:ss +NNNN" ───────────────
  // Used in ActivityLogDB (Col C), PageLogDB (Col B), ChallengeEnrollmentDB timestamps.
  // new Date() in GAS V8 rejects this format — reorder to valid ISO 8601.
  var zMatch = str.match(/^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})\s+([\+\-]\d{4})$/);
  if (zMatch) {
    // yyyy-MM-ddTHH:mm:ss+NNNN
    var isoStr = zMatch[3] + '-' + zMatch[2] + '-' + zMatch[1] +
                 'T' + zMatch[4] + ':' + zMatch[5] + ':' + zMatch[6] + zMatch[7];
    return new Date(isoStr);
  }

  // ── Format 3: Arka Short-Date — "dd-MMM-yyyy" e.g. "28-Mar-2026" ─────────
  // Used in MemberDB joinDate (Col E), MemberShelfDB dateFinished, BadgeAwardDB awardedDate.
  var shortMonths = {
    Jan:0, Feb:1, Mar:2, Apr:3, May:4, Jun:5,
    Jul:6, Aug:7, Sep:8, Oct:9, Nov:10, Dec:11
  };
  var shortMatch = str.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (shortMatch) {
    var month = shortMonths[shortMatch[2]];
    if (month !== undefined) {
      return new Date(
        parseInt(shortMatch[3], 10),
        month,
        parseInt(shortMatch[1], 10)
      );
    }
  }

  // ── Format 4: ISO or other natively parseable strings ────────────────────
  return new Date(str);
}

// ============================================================================
// AUDIT ENGINE
// ============================================================================

/**
 * Scans the ActivityLogDB and produces negative correction log rows for:
 *
 *   Rule 1  Book metadata update cooldown (once per book per 30 days)
 *   Rule 2  Duplicate rating or review for the same shelf record
 *   Rule 3  More than one point-earning profile update per day
 *   Rule 4  Multiple reading-status changes for the same book on the same day
 *            (only the last change in the day earns points; earlier ones are reversed)
 *
 * Rules 1–4 still scan the entire history for context (e.g. the 30-day window for
 * Rule 1 must look backwards), but they skip entries that already have a matching
 * correction log to prevent double-penalisation.
 *
 * @param {Array<Array<any>>} activityData      Full ActivityLogDB 2D array.
 * @param {string}            activityDate      Formatted timestamp for new log rows.
 * @param {number}            startingActNum    Next available ARKA_ACT_X integer.
 * @param {Object}            multiplierMap     { activityTypeID: cpValue } from ActivityTypeDB.
 * @param {number}            lastMasterSyncIdx Row index of last MasterSync entry (0 = none).
 * @returns {{ newCorrectionLogs: Array<Array<any>>, nextActNum: number }}
 */
function generateCorrections(activityData, activityDate, startingActNum, multiplierMap, lastMasterSyncIdx) {
  let corrections = [];
  let correctedActIds = new Set(); // IDs already offset by a prior correction log
  let currentActNum = startingActNum;

  // --- Trackers for Rules 1–7 ---
  let metaReviewLastTime = {};  // Rule 1 — { "memberId_bookId": lastValidTimestampMs }
  let shelfActionSeen    = {};  // Rule 2 — { "memberId_shelfId_type": true }
  let dailyProfileSeen   = {};  // Rule 3 — { "memberId_dateString": true }
  let dailyStatusChanges = {};  // Rule 4 — { "memberId_shelfId_dateString": [{actId, points, timeMs}] }
  let dailyFeedbackSeen  = {};  // Rule 6 — { "memberId_dateString": true }
  let dailyPostCount     = {};  // Rule 7 — { "memberId_dateString": count }
  let sixHourShareSeen   = {};  // Rule 9 — { "memberId_dateString_bucket": true }
                                //   bucket = Math.floor(hour / 6) → 0 (00–05), 1 (06–11),
                                //                                    2 (12–17), 3 (18–23)

  // ── Helper: build a correction row ──────────────────────────────────────
  const buildCorrectionRow = (memberId, ptsToReverse, reason, targetActId) => {
    currentActNum++;
    return [
      "ARKA_ACT_" + currentActNum,
      "SYS_ACTTYP_CLUBPOINTS_CORRECTION",
      activityDate,
      memberId,
      `${reason}; ${targetActId}`,
      MASTERSYNC_SOURCE,
      -Math.abs(ptsToReverse)
    ];
  };

  // ── PASS 1: collect already-corrected IDs to prevent double-penalisation ─
  for (let i = 1; i < activityData.length; i++) {
    if (activityData[i][1] === "SYS_ACTTYP_CLUBPOINTS_CORRECTION") {
      let desc = activityData[i][4] || ""; // Assuming LogDescriptionFormat is in Col E
      let matches = desc.match(/ARKA_ACT_\d+/g);
      if (matches) {
        matches.forEach(id => correctedActIds.add(id));
      }
    }
  }

  // ── PRE-PASS: collect deleted shelf IDs from ARKA_ACTTYP_SHELFDELETE entries ─
  // Maps shelfId → memberId for every soft-deleted shelf record.
  // Rule 8 (below) uses this to identify which activities to reverse.
  var deletedShelfOwnerMap = {};  // { shelfId: memberId }
  for (var dsi = 1; dsi < activityData.length; dsi++) {
    if ((activityData[dsi][1] || '').toString() !== 'ARKA_ACTTYP_SHELFDELETE') continue;
    var dsOwnerId = (activityData[dsi][3] || '').toString();
    var dsShelfId = (activityData[dsi][4] || '').toString();
    if (dsOwnerId && dsShelfId) {
      deletedShelfOwnerMap[dsShelfId] = dsOwnerId;
    }
  }

  // ── PASS 2: scan every non-header row for rule violations ─────────────────
  for (let i = 1; i < activityData.length; i++) {
    const actId   = (activityData[i][0] || "").toString();
    const type    = (activityData[i][1] || "").toString();
    const source  = (activityData[i][5] || "").toString().trim();
    const points  = Number(activityData[i][6]) || 0;
    const memberId = (activityData[i][3] || "").toString();
    
    // Skip system-generated rows (MasterSync writes, corrections, update markers)
    if (source === MASTERSYNC_SOURCE) continue;
    // Skip if this activity was already offset by a previous correction
    if (correctedActIds.has(actId)) continue;
    // Skip non-point-awarding logs or system logs
    if (points <= 0 || !memberId) continue; 

    // parseArkaDateString_ handles both the Arka Z-Format ("dd-MM-yyyy HH:mm:ss Z")
    // and short-date ("dd-MMM-yyyy") — new Date() returns NaN for the Z-Format in GAS V8.
    const dateObj = parseArkaDateString_(activityData[i][2]);
    const dateStr = isNaN(dateObj.getTime()) ? 'INVALID_DATE_' + i : dateObj.toDateString();
    const timeMs  = dateObj.getTime();
    const refId   = (activityData[i][4] || "").toString(); // BookID or ShelfRecordID

    // ── Rule 1: Book metadata update — once per book per 30 days ───────────
    if (type === AUDIT_TYPES.META_REVIEW) {
      const key = `${memberId}_${refId}`;
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

      if (
        metaReviewLastTime[key] !== undefined &&
        timeMs - metaReviewLastTime[key] < thirtyDaysMs
      ) {
        corrections.push(buildCorrectionRow(
          memberId, points,
          "Book metadata update within 30-day cooldown window",
          actId
        ));
      } else {
        metaReviewLastTime[key] = timeMs;
      }
    }

    // ── Rule 2: Rating / Review — once per shelf record per action type ─────
    if (type === AUDIT_TYPES.RATING || type === AUDIT_TYPES.REVIEW) {
      const key = `${memberId}_${refId}_${type}`;
      if (shelfActionSeen[key]) {
        corrections.push(buildCorrectionRow(
          memberId, points,
          "Duplicate rating or review for the same shelf record",
          actId
        ));
      } else {
        shelfActionSeen[key] = true;
      }
    }

    // ── Rule 3: Profile update — one point-earning update per day ───────────
    if (type === AUDIT_TYPES.PROFILE_UPDATE) {
      const key = `${memberId}_${dateStr}`;
      if (dailyProfileSeen[key]) {
        corrections.push(buildCorrectionRow(
          memberId, points,
          "Multiple profile updates in one day",
          actId
        ));
      } else {
        dailyProfileSeen[key] = true;
      }
    }

    // ── Rule 6: Feedback — one point-earning submission per calendar day ──────
    // Subsequent feedback submissions on the same day are still saved to
    // FeedbackDB (the team sees all of them) but earn no additional points.
    // This prevents the feedback economy from dwarfing the reading economy
    // when a member legitimately files several reports in a single session.
    if (type === AUDIT_TYPES.FEEDBACK) {
      const feedbackKey = `${memberId}_${dateStr}`;
      if (dailyFeedbackSeen[feedbackKey]) {
        corrections.push(buildCorrectionRow(
          memberId, points,
          "Feedback daily cap: only the first submission per day earns points",
          actId
        ));
      } else {
        dailyFeedbackSeen[feedbackKey] = true;
      }
    }

    // ── Rule 7: Book post — max point-earning posts per member per day ────────
    // Posts beyond MAX_DAILY_BOOK_POSTS are still published and visible in the
    // book discussion thread — only the point award is reversed.
    if (type === AUDIT_TYPES.BOOK_POST) {
      const postKey = `${memberId}_${dateStr}`;
      dailyPostCount[postKey] = (dailyPostCount[postKey] || 0) + 1;
      if (dailyPostCount[postKey] > MAX_DAILY_BOOK_POSTS) {
        corrections.push(buildCorrectionRow(
          memberId, points,
          `Book post daily cap (${MAX_DAILY_BOOK_POSTS}) exceeded`,
          actId
        ));
      }
    }

    // ── Rule 9: Share progress — one point-earning share per 6-hour window ───
    // The 6-hour window prevents share-button spam while still rewarding genuine
    // activity (morning, lunch, evening, night reads). Shares outside the earning
    // window are still logged to ActivityLogDB for onboarding T28 detection —
    // only the point award is reversed. Four buckets per day:
    //   bucket 0 → 00:00–05:59   bucket 1 → 06:00–11:59
    //   bucket 2 → 12:00–17:59   bucket 3 → 18:00–23:59
    if (type === AUDIT_TYPES.SHARE_PROGRESS) {
      var shareHour   = isNaN(timeMs) ? 0 : new Date(timeMs).getHours();
      var shareBucket = Math.floor(shareHour / 6);                       // 0, 1, 2, or 3
      var shareKey    = memberId + '_' + dateStr + '_' + shareBucket;
      if (sixHourShareSeen[shareKey]) {
        corrections.push(buildCorrectionRow(
          memberId, points,
          'Share progress 6-hour cap: only the first share per window earns points',
          actId
        ));
      } else {
        sixHourShareSeen[shareKey] = true;
      }
    }

    // ── Rule 5: cpAwarded validation — only for fixed-multiplier types logged
    //    after the last MasterSync. Entries before lastMasterSyncIdx were already
    //    audited in a prior run; re-checking them would generate duplicate corrections.
    //    Skip types in VARIABLE_POINT_TYPES (variable or injected CP at log time).
    //    Skip types where the multiplierMap value is 0 — those are intentionally
    //    injection-only types that do not use the multiplier at all.
    if (
      i > lastMasterSyncIdx &&
      !VARIABLE_POINT_TYPES.has(type) &&
      multiplierMap[type] !== undefined &&
      multiplierMap[type] !== 0
    ) {
      const expectedCp = multiplierMap[type];
      // Allow a tolerance of 1 CP to absorb any future rounding edge cases
      if (Math.abs(points - expectedCp) > 1) {
        corrections.push(buildCorrectionRow(
          memberId,
          points - expectedCp,   // reverse only the excess above the expected value
          `Rule 5: cpAwarded (${points}) does not match ActivityTypeDB multiplier (${expectedCp}) for ${type}`,
          actId
        ));
      }
    }

    // ── Rule 4 (setup): Reading status changes — collect for post-loop eval ─
    if (AUDIT_TYPES.STATUS_CHANGES.includes(type)) {
      const key = `${memberId}_${refId}_${dateStr}`;
      if (!dailyStatusChanges[key]) dailyStatusChanges[key] = [];
      dailyStatusChanges[key].push({ actId, points, timeMs });
    }

    // ── Rule 8: Shelf deletion — reverse all direct shelf CP ─────────────────
    // Fired when a member has a ARKA_ACTTYP_SHELFDELETE entry (collected in PRE-PASS)
    // and the current activity is a reversible type that references the same shelfId.
    //
    // activityDesc format matrix (all anchored to the shelfId token):
    //   BOOKTOREAD / BOOKREADING / BOOKDNF / BOOKRATING / BOOKREVIEW / BOOKREAD (1st):
    //     desc === shelfId  (exact)
    //   BOOKREAD (re-read):
    //     desc starts with shelfId + " |"
    //   SHELFUPDATE:
    //     desc starts with shelfId + ","
    //   PAGEREAD:
    //     desc ends with " " + shelfId  (format: "+N pages added to ARKA_SHELF_X")
    if (SHELF_REVERSIBLE_ACTIVITY_TYPES.has(type) && points > 0) {
      for (var dsKey in deletedShelfOwnerMap) {
        if (!deletedShelfOwnerMap.hasOwnProperty(dsKey)) continue;
        if (deletedShelfOwnerMap[dsKey] !== memberId) continue;  // wrong member

        const desc = refId;  // refId is Col E (activityDesc) — already extracted above
        const isLinkedToDeletedShelf =
          desc === dsKey               ||
          desc.startsWith(dsKey + ' |') ||
          desc.startsWith(dsKey + ',')  ||
          desc.endsWith(' ' + dsKey);

        if (isLinkedToDeletedShelf) {
          corrections.push(buildCorrectionRow(
            memberId, points,
            'Shelf deleted — reversing CP for ' + type + ' on ' + dsKey,
            actId
          ));
          correctedActIds.add(actId);  // prevent double-correction within this run
          break;  // a single activity can only belong to one shelfId
        }
      }
    }

  }

  // ── PASS 3: Rule 4 evaluation — keep only the last status change per day ──
  for (const key in dailyStatusChanges) {
    const changes = dailyStatusChanges[key];
    if (changes.length <= 1) continue;

    // Sort chronologically: the last change is the one that counts
    changes.sort((a, b) => a.timeMs - b.timeMs);

    // Extract memberId from the composite key (format: memberId_refId_dateStr)
    // memberId is always ARKA_MEMBER_X so splitting on first _ runs of 3 parts
    const memberId = key.split('_').slice(0, 3).join('_');

    // Reverse all but the final change
    for (let j = 0; j < changes.length - 1; j++) {
      corrections.push(buildCorrectionRow(
        memberId, changes[j].points,
        "Multiple reading-status changes for same book on same day — only last counts",
        changes[j].actId
      ));
    }
  }

  return { newCorrectionLogs: corrections, nextActNum: currentActNum };
}

// ============================================================================
// CORE SYNC FUNCTION
// ============================================================================

// ============================================================================
// BADGE SYSTEM HELPERS
// ============================================================================


/**
 * Normalises a GENRE_EXPLORER badge meta string (the genre name stored in
 * BadgeDB Col H) to its canonical form from GENRE_ALIAS_MAP, case-insensitively.
 * Ensures 'romance', 'Romance', 'lgbtq+', and 'LGBTQ+' all resolve to the
 * same canonical key used by resolveCanonicalGenres_() when counting books.
 * Falls back to rawMeta unchanged if no canonical match is found.
 *
 * @param  {string} rawMeta - Raw badgeMeta value from BadgeDB
 * @returns {string} Canonical genre name, or rawMeta unchanged
 */
function normaliseGenreMeta_(rawMeta) {
  var lower = (rawMeta || '').trim().toLowerCase();
  for (var g in GENRE_ALIAS_MAP) {
    if (GENRE_ALIAS_MAP.hasOwnProperty(g) && g.toLowerCase() === lower) return g;
  }
  return rawMeta;
}

/**
 * Builds a two-level runtime lookup map from BadgeDB sheet data.
 * Used by the badge pass to resolve badgeId + badgePoints from category + tier.
 *
 * Non-genre categories:
 *   result[category][tier] = { badgeId, badgePoints }
 *   e.g. result['PAGE_MILESTONE'][3] = { badgeId: 'ARKA_BADGE_3', badgePoints: 1000 }
 *
 * GENRE_EXPLORER (three levels):
 *   result['GENRE_EXPLORER'][genreName][tier] = { badgeId, badgePoints }
 *   e.g. result['GENRE_EXPLORER']['Fantasy'][2] = { badgeId: 'ARKA_BADGE_72', badgePoints: 250 }
 *
 * @param  {Array<Array<any>>} badgeData - Full BadgeDB 2D array (row 0 = header).
 * @returns {Object} Nested lookup map.
 */
function buildBadgeTierMap_(badgeData) {
  var map = {};

  for (var i = 1; i < badgeData.length; i++) {
    if (!badgeData[i][0]) continue;

    var badgeId  = badgeData[i][0].toString();
    var points   = Number(badgeData[i][4]) || 0;      // Col E: badgePoints
    var category = (badgeData[i][5] || '').toString(); // Col F: badgeCategory
    var tier     = Number(badgeData[i][6]) || 0;      // Col G: badgeTier
    var meta     = (badgeData[i][7] || '').toString(); // Col H: badgeMeta

    if (!category) continue;

    if (category === 'GENRE_EXPLORER') {
      // Three-level: GENRE_EXPLORER → genreName → tier.
      // Normalise the genre key so 'romance' and 'Romance' both resolve to
      // 'Romance', matching the canonical form used in resolveCanonicalGenres_().
      var normMeta = normaliseGenreMeta_(meta);
      if (!map['GENRE_EXPLORER'])              map['GENRE_EXPLORER'] = {};
      if (!map['GENRE_EXPLORER'][normMeta])    map['GENRE_EXPLORER'][normMeta] = {};
      map['GENRE_EXPLORER'][normMeta][tier] = { badgeId: badgeId, badgePoints: points, caption: (badgeData[i][1] || '').toString() };
    } else {
      // Two-level: category → tier
      if (!map[category]) map[category] = {};
      map[category][tier] = { badgeId: badgeId, badgePoints: points, caption: (badgeData[i][1] || '').toString() };
    }
  }

  return map;
}


/**
 * Converts an ISO 8601 week string ("YYYY-Www") to an integer epoch-week
 * count, enabling simple arithmetic to test consecutive-week adjacency.
 * Two ISO weeks are consecutive if and only if their epoch-week values
 * differ by exactly 1.
 *
 * @param  {string} isoWeekStr - e.g. "2024-W05"
 * @returns {number} Integer epoch-week count, or -1 on parse error.
 */
function isoWeekToEpochWeeks_(isoWeekStr) {
  var parts = isoWeekStr.split('-W');
  if (parts.length !== 2) return -1;

  var year    = parseInt(parts[0], 10);
  var weekNum = parseInt(parts[1], 10);
  if (isNaN(year) || isNaN(weekNum)) return -1;

  // ISO rule: Jan 4 is always in week 1 of its year
  var jan4      = new Date(year, 0, 4);
  var dayOfWeek = jan4.getDay() || 7;                                      // Sun(0) → 7
  var week1Mon  = new Date(jan4.getTime() - (dayOfWeek - 1) * 86400000);   // Monday of ISO week 1
  var targetMon = new Date(week1Mon.getTime() + (weekNum - 1) * 7 * 86400000);

  return Math.floor(targetMon.getTime() / (7 * 86400000));
}


/**
 * Returns the ISO 8601 week string ("YYYY-Www") for a given Date.
 *
 * @param  {Date} date
 * @returns {string} e.g. "2024-W05"
 */
function getISOWeekString_(date) {
  var d = new Date(date);
  d.setHours(0, 0, 0, 0);
  // Shift to nearest Thursday — ISO week ownership rule
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
  var yearStart = new Date(d.getFullYear(), 0, 4);
  var weekNum   = 1 + Math.round(
    ((d.getTime() - yearStart.getTime()) / 86400000 - 3 + (yearStart.getDay() + 6) % 7) / 7
  );
  return d.getFullYear() + '-W' + (weekNum < 10 ? '0' : '') + weekNum;
}


/**
 * Computes the all-time best consecutive ISO-week reading streak for a member.
 * Only weeks with at least one positive pagesDelta entry count.
 * This is an all-time-best metric — it never decreases, so streak badges
 * are never revoked once earned.
 *
 * @param  {Array<{timestamp: string, pagesDelta: number}>} memberPageLogs
 * @returns {number} Longest consecutive-week streak (0 if no valid logs).
 */
function computeAllTimeBestStreak_(memberPageLogs) {
  var weekSet = {};
  for (var i = 0; i < memberPageLogs.length; i++) {
    if (memberPageLogs[i].pagesDelta > 0) {
      var d = new Date(memberPageLogs[i].timestamp);
      if (!isNaN(d.getTime())) weekSet[getISOWeekString_(d)] = true;
    }
  }

  var weekKeys = Object.keys(weekSet);
  if (weekKeys.length === 0) return 0;

  // Sort ascending by epoch-week value
  weekKeys.sort(function(a, b) {
    return isoWeekToEpochWeeks_(a) - isoWeekToEpochWeeks_(b);
  });

  var bestStreak    = 1;
  var currentStreak = 1;

  for (var j = 1; j < weekKeys.length; j++) {
    var diff = isoWeekToEpochWeeks_(weekKeys[j]) - isoWeekToEpochWeeks_(weekKeys[j - 1]);
    if (diff === 1) {
      currentStreak++;
      if (currentStreak > bestStreak) bestStreak = currentStreak;
    } else {
      currentStreak = 1;
    }
  }

  return bestStreak;
}


/**
 * Counts total unique ISO weeks in which a member logged at least one
 * positive page-read entry. This is the PLogger (cumulative) metric.
 *
 * @param  {Array<{timestamp: string, pagesDelta: number}>} memberPageLogs
 * @returns {number} Total unique weeks logged.
 */
function computeUniqueWeeksLogged_(memberPageLogs) {
  var weekSet = {};
  for (var i = 0; i < memberPageLogs.length; i++) {
    if (memberPageLogs[i].pagesDelta > 0) {
      var d = new Date(memberPageLogs[i].timestamp);
      if (!isNaN(d.getTime())) weekSet[getISOWeekString_(d)] = true;
    }
  }
  return Object.keys(weekSet).length;
}


/**
 * Resolves a free-text genre string from ArkaLibraryDB into canonical
 * genre names using GENRE_ALIAS_MAP. A book may match multiple genres.
 * Matching is case-insensitive.
 *
 * @param  {string} genreString - Raw comma-separated genre string from a book record.
 * @returns {Array<string>} Matched canonical genre names (may be empty).
 */
function resolveCanonicalGenres_(genreString) {
  if (!genreString) return [];

  var rawTags    = genreString.split(',');
  var matchedSet = {};

  for (var t = 0; t < rawTags.length; t++) {
    var tag = rawTags[t].trim().toLowerCase();
    if (!tag) continue;

    for (var canonicalGenre in GENRE_ALIAS_MAP) {
      if (!GENRE_ALIAS_MAP.hasOwnProperty(canonicalGenre)) continue;
      var aliases = GENRE_ALIAS_MAP[canonicalGenre];
      for (var a = 0; a < aliases.length; a++) {
        if (tag === aliases[a]) {
          matchedSet[canonicalGenre] = true;
          break;
        }
      }
    }
  }

  return Object.keys(matchedSet);
}

/**
 * Normalises a single free-text genre tag for Genre Collector counting.
 * If the tag matches any alias in GENRE_ALIAS_MAP it is collapsed to the
 * canonical name (so "sci-fi" and "science fiction" both become "Sci-Fi"
 * and count as one slot). If there is no alias match the tag is kept as-is
 * (lowercased, trimmed) so "historical fiction" counts independently of
 * "fiction".
 *
 * This is intentionally different from resolveCanonicalGenres_() which
 * returns only the 13 canonical names and discards everything else.
 * Genre Collector counts ALL unique genre strings a member has encountered,
 * with synonym deduplication only.
 *
 * @param  {string} rawTag - A single trimmed genre tag from ArkaLibraryDB.
 * @returns {string} Normalised genre string (canonical name or lowercase raw tag).
 */
function resolveGenreForCollector_(rawTag) {
  var lower = rawTag.toLowerCase();
  for (var canonicalGenre in GENRE_ALIAS_MAP) {
    if (!GENRE_ALIAS_MAP.hasOwnProperty(canonicalGenre)) continue;
    var aliases = GENRE_ALIAS_MAP[canonicalGenre];
    for (var a = 0; a < aliases.length; a++) {
      if (lower === aliases[a]) return canonicalGenre; // normalise synonym → canonical
    }
  }
  return lower; // no alias match — keep raw (lowercased) as its own unique slot
}

/**
 * Awards one automatic badge to a member if they do not already hold an
 * Active copy, and the badge exists in the tier map.
 *
 * Mutates in place:
 *   - existingActiveBadgeSet: marks the badge as held to prevent re-award
 *     on the same engine run
 *   - badgeAwardsToPush: appends a new BadgeAwardDB row
 *   - finalActivityLogsToPush: appends a new ARKA_ACTTYP_BADGEAWARD row
 *   - memData[memberRow][13]: updates the Col N badge-ID cache string
 *   - counters.awardNum: incremented by 1
 *   - counters.actNum: incremented by 1
 *
 * @param {string}       memberId
 * @param {string}       badgeId
 * @param {number}       badgePoints         CP to award (0 for migration-legacy recipients)
 * @param {string}       activityDate        Formatted timestamp string for log rows
 * @param {Object}       existingActiveBadgeSet  { "memberId_badgeId": true }
 * @param {Array}        badgeAwardsToPush       Mutable accumulator for BadgeAwardDB rows
 * @param {Array}        finalActivityLogsToPush Mutable accumulator for ActivityLogDB rows
 * @param {Object}       memberRowIndexMap        { memberId: rowIndex } into memData
 * @param {Array<Array>} memData                  Full MemberDB 2D array (mutable)
 * @param {Object}       counters                 { awardNum: number, actNum: number }
 * @returns {number} CP actually awarded (0 or badgePoints) — caller adds to truePoints.
 */
function autoAwardBadge_(memberId, badgeId, badgePoints, badgeCaption, activityDate,
                          existingActiveBadgeSet, badgeAwardsToPush,
                          finalActivityLogsToPush, memberRowIndexMap,
                          memData, counters) {
  var key = memberId + '_' + badgeId;
  if (existingActiveBadgeSet[key]) return 0; // already held — skip silently

  // Mark as held immediately to prevent double-award within the same engine run
  existingActiveBadgeSet[key] = true;

  var thisAwardId = 'ARKA_AWARD_' + counters.awardNum;
  counters.awardNum++;

  // BadgeAwardDB row — 7 columns matching existing schema.
  // Col E uses dd-MMM-yyyy (display date) — the full activityDate timestamp
  // belongs only in ActivityLogDB, not in the badge award record.
  var awardDateFormatted = Utilities.formatDate(
    new Date(), Session.getScriptTimeZone(), 'dd-MMM-yyyy'
  );
  badgeAwardsToPush.push([
    thisAwardId,
    badgeId,
    memberId,
    MASTERSYNC_AWARDER,      // Col D: who awarded
    awardDateFormatted,      // Col E: dd-MMM-yyyy display date
    'Active',                // Col F: status
    badgeCaption || badgeId  // Col G: badge caption — more useful than a generic message
  ]);

  // ActivityLogDB row — ARKA_ACTTYP_BADGEAWARD with injected badgePoints CP
  counters.actNum++;
  finalActivityLogsToPush.push([
    'ARKA_ACT_' + counters.actNum,
    'ARKA_ACTTYP_BADGEAWARD',
    activityDate,
    memberId,
    thisAwardId,       // Col E: description = AwardID for traceability
    MASTERSYNC_SOURCE,
    badgePoints        // Col G: injected CP (may be 0 for legacy-milestone recipients)
  ]);

  // Append badgeId to MemberDB Col N celebration JSON in memory.
  // Col N shape: { badges: string[], newLevel: string }
  // Append-only — existing badge IDs and newLevel are preserved so multiple
  // badges awarded in one engine run accumulate correctly.
  var rowIdx = memberRowIndexMap[memberId];
  if (rowIdx !== undefined) {
    var rawCelebration = (memData[rowIdx][13] || '').toString().trim();
    var celebrationObj = { badges: [], newLevel: '' };
    if (rawCelebration) {
      try { celebrationObj = JSON.parse(rawCelebration); } catch (e) { /* malformed — reset */ }
    }
    if (!Array.isArray(celebrationObj.badges)) celebrationObj.badges = [];
    if (typeof celebrationObj.newLevel !== 'string') celebrationObj.newLevel = '';
    if (celebrationObj.badges.indexOf(badgeId) === -1) {
      celebrationObj.badges.push(badgeId);
    }
    memData[rowIdx][13] = JSON.stringify(celebrationObj);
  }

  return badgePoints; // return CP awarded so caller can accumulate into truePoints
}

/**
 * checkOnboardingBadges_()
 *
 * Checks whether any of the five onboarding chapter badges should be awarded
 * to the given member and calls autoAwardBadge_() for each chapter that is
 * complete but not yet held.
 *
 * Chapter completion is determined server-side using two sources:
 *   1. activityData — the full ActivityLogDB 2-D array (all members, all time).
 *      Filtered to this member's rows in a single O(n) pass before checking
 *      individual tasks.
 *   2. selfReported — the array of manually confirmed task IDs stored in
 *      MemberDB Col S (CoachInsights) under the `onboarding.selfReported` key.
 *      Written by saveOnboardingProgress() when the member taps "Mark as done".
 *
 * Chapter badge IDs are hardcoded — these rows exist in BadgeDB and must
 * never be re-used or reassigned:
 *   ARKA_BADGE_242  First Steps          200 pts
 *   ARKA_BADGE_243  Life with Books      250 pts
 *   ARKA_BADGE_244  Your Reading Life    300 pts
 *   ARKA_BADGE_245  Discover the App     250 pts
 *   ARKA_BADGE_246  Engage with the Club 350 pts
 *
 * ONBOARD_T28 (Share progress to WA group) is auto-detected via
 * ARKA_ACTTYP_SHAREPROGRESS, written by logShareProgress() in ArkaClubAppCode.gs
 * when the member shares via the WhatsApp share sheet or wa.me fallback.
 *
 * @param {string}              memberId               ARKA_MEMBER_X
 * @param {Array<Array<any>>}   activityData           Full ActivityLogDB 2-D array
 * @param {string}              coachInsightsRaw       Raw Col S JSON string for this member
 * @param {Object}              existingActiveBadgeSet { memberId_badgeId: true } dedup map
 * @param {Array<Array<any>>}   badgeAwardsToPush      Accumulator — new BadgeAwardDB rows
 * @param {Array<Array<any>>}   finalActivityLogsToPush Accumulator — new ActivityLogDB rows
 * @param {Object}              memberRowIndexMap      { memberId: rowIndex } for Col N writes
 * @param {Array<Array<any>>}   memData                Full MemberDB 2-D array (in-memory)
 * @param {Object}              counters               { actNum, awardNum } — mutated in place
 * @param {string}              activityDate           Formatted timestamp for log entries
 * @returns {number} Total CP awarded across all onboarding badges this run (0–1350)
 */
function checkOnboardingBadges_(
  memberId,
  memberFlags,      // pre-built flags object from memberOnboardingFlagsMap — replaces activityData
  coachInsightsRaw,
  existingActiveBadgeSet,
  badgeAwardsToPush,
  finalActivityLogsToPush,
  memberRowIndexMap,
  memData,
  counters,
  activityDate
) {
  var totalCpAwarded = 0;

  // ── 1. Parse selfReported task IDs from Col S ────────────────────────────
  // Defensive parse — a malformed or missing Col S is treated as no self-reported tasks.
  var selfReportedSet = {};
  try {
    if (coachInsightsRaw) {
      var coachParsed = JSON.parse(coachInsightsRaw);
      if (coachParsed.onboarding &&
          Array.isArray(coachParsed.onboarding.selfReported)) {
        coachParsed.onboarding.selfReported.forEach(function(id) {
          selfReportedSet[id] = true;
        });
      }
    }
  } catch (parseErr) {
    // Malformed Col S — proceed with empty selfReported; member can re-confirm later
  }

  // ── 2. Scan activityData once for this member's relevant activity types ──
  // activityData column indices (ActivityLogDB schema):
  //   index 1 = activityTypeID
  //   index 3 = memberID (activityMemberID)
  //   index 4 = activityDesc
  // ── 2. Read pre-built flags — O(1) lookup replaces O(activityLog) scan ───
  // memberFlags was built by a single pass in runMasterSync() before the member
  // loop, so this function no longer iterates activityData at all.
  var hasProfileNew       = !!memberFlags.hasProfileNew;
  var hasProfileUpdate    = !!memberFlags.hasProfileUpdate;
  var hasBooksAdd         = !!memberFlags.hasBooksAdd;
  var hasBookToRead       = !!memberFlags.hasBookToRead;
  var hasBookReading      = !!memberFlags.hasBookReading;
  var hasPageReadLinked   = !!memberFlags.hasPageReadLinked;
  var hasPageReadUnlinked = !!memberFlags.hasPageReadUnlinked;
  var hasBookRead         = !!memberFlags.hasBookRead;
  var hasBookRating       = !!memberFlags.hasBookRating;
  var hasBookReview       = !!memberFlags.hasBookReview;
  var hasEventRsvp        = !!memberFlags.hasEventRsvp;
  var hasChallengeEnroll  = !!memberFlags.hasChallengeEnroll;
  var hasEventAttended    = !!memberFlags.hasEventAttended;
  var hasBookPost         = !!memberFlags.hasBookPost;
  var hasShareProgress    = !!memberFlags.hasShareProgress;
  var hasFeedback         = !!memberFlags.hasFeedback;

  // ── 3. Evaluate chapter completion and award badges ──────────────────────
  // Each chapter: all tasks must be satisfied before autoAwardBadge_() is called.
  // autoAwardBadge_() is idempotent — it checks existingActiveBadgeSet first,
  // so calling it for an already-held badge is always a safe no-op.

  // ── Chapter 1: First Steps ───────────────────────────────────────────────
  // T01: join (always true for any member row), T02: profile update,
  // T03–T06: self-reported
  // T01 (Join the App) is unconditionally true for any member row being processed —
  // the engine only runs rows that exist in MemberDB, so presence here IS proof of join.
  // This matches the frontend's treatment: isDone = true for ONBOARD_T01 always.
  // hasProfileNew is intentionally NOT used here because older members may lack a
  // ARKA_ACTTYP_PROFILENEW entry if they registered before that activity type was wired.
  var ch1Complete = hasProfileUpdate                  // T02 — auto
                 && selfReportedSet['ONBOARD_T03']    // Know the App Core — self-reported
                 && selfReportedSet['ONBOARD_T04']    // Find your way around — self-reported
                 && selfReportedSet['ONBOARD_T05']    // Check the home feed — self-reported
                 && selfReportedSet['ONBOARD_T06'];   // Read Our Story — self-reported

  if (ch1Complete) {
    totalCpAwarded += autoAwardBadge_(
      memberId, 'ARKA_BADGE_242', 200, 'First Steps', activityDate,
      existingActiveBadgeSet, badgeAwardsToPush, finalActivityLogsToPush,
      memberRowIndexMap, memData, counters
    );
  }

  // ── Chapter 2: Life with Books ───────────────────────────────────────────
  // T07–T08: self-reported, T09–T11: auto
  // Chapter 2 only awarded once Chapter 1 is also complete (badge 242 already held).
  var ch2Complete = ch1Complete
                 && selfReportedSet['ONBOARD_T07']  // Explore the Library
                 && selfReportedSet['ONBOARD_T08']  // Find a book in the Library
                 && hasBooksAdd                      // T09
                 && hasBookToRead                    // T10
                 && hasBookReading;                  // T11

  if (ch2Complete) {
    totalCpAwarded += autoAwardBadge_(
      memberId, 'ARKA_BADGE_243', 250, 'Life with Books', activityDate,
      existingActiveBadgeSet, badgeAwardsToPush, finalActivityLogsToPush,
      memberRowIndexMap, memData, counters
    );
  }

  // ── Chapter 3: Your Reading Life ─────────────────────────────────────────
  // T12–T16: auto, T17–T18: self-reported
  var ch3Complete = ch2Complete
                 && hasPageReadLinked               // T12
                 && hasPageReadUnlinked             // T13
                 && hasBookRead                     // T14
                 && hasBookRating                   // T15
                 && hasBookReview                   // T16
                 && selfReportedSet['ONBOARD_T17']  // Check out your shelves
                 && selfReportedSet['ONBOARD_T18']; // Find your review on book page

  if (ch3Complete) {
    totalCpAwarded += autoAwardBadge_(
      memberId, 'ARKA_BADGE_244', 300, 'Your Reading Life', activityDate,
      existingActiveBadgeSet, badgeAwardsToPush, finalActivityLogsToPush,
      memberRowIndexMap, memData, counters
    );
  }

  // ── Chapter 4: Discover the App ──────────────────────────────────────────
  // T19–T23: all self-reported
  var ch4Complete = ch3Complete
                 && selfReportedSet['ONBOARD_T19']  // Members tab
                 && selfReportedSet['ONBOARD_T20']  // Club ranking
                 && selfReportedSet['ONBOARD_T21']  // Reading personality
                 && selfReportedSet['ONBOARD_T22']  // Badges
                 && selfReportedSet['ONBOARD_T23']; // Reading journey

  if (ch4Complete) {
    totalCpAwarded += autoAwardBadge_(
      memberId, 'ARKA_BADGE_245', 250, 'Discover the App', activityDate,
      existingActiveBadgeSet, badgeAwardsToPush, finalActivityLogsToPush,
      memberRowIndexMap, memData, counters
    );
  }

  // ── Chapter 5: Engage with the Club ──────────────────────────────────────
  // T24–T29: all auto-detected via ActivityLogDB activity types.
  // T28 (SHAREPROGRESS) is written by logShareProgress() — fully wired.
  var ch5Complete = ch4Complete
                 && hasEventRsvp      // T24
                 && hasChallengeEnroll // T25
                 && hasEventAttended  // T26
                 && hasBookPost       // T27
                 && hasShareProgress  // T28 — auto-detected via ARKA_ACTTYP_SHAREPROGRESS
                 && hasFeedback;      // T29

  if (ch5Complete) {
    totalCpAwarded += autoAwardBadge_(
      memberId, 'ARKA_BADGE_246', 350, 'Engage with the Club', activityDate,
      existingActiveBadgeSet, badgeAwardsToPush, finalActivityLogsToPush,
      memberRowIndexMap, memData, counters
    );
  }

  return totalCpAwarded;
}

/**
 * _parseStatsJson_(raw)
 * Safely parses a MemberDB Col O cell value into the canonical Stats shape.
 *
 * Handles three states so the migration from integer → JSON is seamless on the
 * first post-deployment nightly run:
 *   1. Blank / null       → returns a zeroed Stats skeleton (new members).
 *   2. Plain number       → legacy Col O integer (TotalClubPoints); wraps it
 *                           into allTime.arkaPoints, all other keys zeroed.
 *   3. Valid JSON string  → parsed and returned; forward-compatible because
 *                           unknown year keys are preserved as-is.
 *
 * Never throws — bad JSON is logged and replaced with a zeroed skeleton.
 *
 * @param  {*}      raw  - Raw cell value from memData[i][14].
 * @returns {Object}     Stats object guaranteed to have { allTime: { arkaPoints, pages,
 *                       books, reviews, ratings, genres, libraryAdded, badges,
 *                       ploggerWeeks, longestStreak } }. Year keys are optional.
 */
function _parseStatsJson_(raw) {
  var EMPTY_STAT_BLOCK = {
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

  // ── Blank / missing cell ───────────────────────────────────────────────────
  if (raw === null || raw === undefined || raw === '') {
    return { allTime: Object.assign({}, EMPTY_STAT_BLOCK) };
  }

  // ── Legacy integer path ───────────────────────────────────────────────────
  // Col O previously held a plain club-points integer. If the cell value is a
  // number, or a string that does not begin with '{', treat it as the legacy format.
  var rawStr = raw.toString().trim();
  if (typeof raw === 'number' || rawStr.charAt(0) !== '{') {
    var legacyPts = Number(raw) || 0;
    var legacySkeleton = { allTime: Object.assign({}, EMPTY_STAT_BLOCK) };
    legacySkeleton.allTime.arkaPoints = legacyPts;
    return legacySkeleton;
  }

  // ── JSON path ────────────────────────────────────────────────────────────
  try {
    var parsed = JSON.parse(rawStr);

    // Ensure allTime always exists with every required sub-key. Year keys are
    // left exactly as parsed — forward-compatible with future stat additions.
    if (!parsed.allTime || typeof parsed.allTime !== 'object') {
      parsed.allTime = Object.assign({}, EMPTY_STAT_BLOCK);
    } else {
      // Back-fill any sub-keys that may be missing in older JSON shapes
      var k;
      for (k in EMPTY_STAT_BLOCK) {
        if (EMPTY_STAT_BLOCK.hasOwnProperty(k) && parsed.allTime[k] === undefined) {
          parsed.allTime[k] = 0;
        }
      }
    }
    return parsed;

  } catch (parseErr) {
    console.warn('_parseStatsJson_: failed to parse Col O — resetting to skeleton. Raw value: ' + rawStr);
    return { allTime: Object.assign({}, EMPTY_STAT_BLOCK) };
  }
}


/**
 * _buildYearStatsMap_(year, activityData, shelfData, pageLogData, libraryData,
 *                     badgeAwardData, bookMetaMap)
 *
 * Computes year-specific reading stats for every member from the full data
 * sources MasterEngine already holds in memory during a nightly sync run.
 * Called once before the per-member loop so each stat is computed in a single
 * pass over each source table rather than inside the member loop.
 *
 * Stats computed per member for the target year:
 *   arkaPoints    — CP awarded (from ActivityLogDB, excluding SYS correction rows)
 *   pages         — Total positive page-log delta (from PageLogDB)
 *   books         — Unique Finished shelf records (dateFinished in target year)
 *   reviews       — ARKA_ACTTYP_BOOKREVIEW activities, deduplicated by shelfId
 *   ratings       — ARKA_ACTTYP_BOOKRATING activities, deduplicated by shelfId
 *   genres        — Unique canonical genre names of books finished in target year
 *   libraryAdded  — ArkaLibraryDB rows whose AddedDate falls in target year
 *   badges        — BadgeAwardDB Active rows whose AwardedDate falls in target year
 *   ploggerWeeks  — Distinct ISO weeks with ≥1 positive page-log in target year
 *   longestStreak — Longest consecutive-week reading run within the target year
 *
 * Reviews and ratings use shelfId deduplication (stored in ActivityLogDB.activityDesc)
 * so that re-submitting or editing a review on the same shelf record is never
 * double-counted — this is the only correct approach given the 2000-row window
 * in globalActivityLogDB on the frontend.
 *
 * Genres use resolveCanonicalGenres_() for consistency with the Genre Explorer
 * badge category. "Historical Fiction" and "Fiction" both collapse to "Fiction";
 * a member who reads in 5 canonical genres scores 5, not the raw tag count.
 *
 * @param {number} year          - 4-digit target year (e.g. 2026)
 * @param {Array}  activityData  - Full ActivityLogDB sheet values (all rows)
 * @param {Array}  shelfData     - Full MemberShelfDB sheet values (all rows)
 * @param {Array}  pageLogData   - Full PageLogDB sheet values (all rows)
 * @param {Array}  libraryData   - Full ArkaLibraryDB sheet values (all rows)
 * @param {Array}  badgeAwardData - Full BadgeAwardDB sheet values (all rows)
 * @param {Object} bookMetaMap   - Pre-built { bookId: { pages, genre } } lookup
 * @returns {Object}             memberId → { arkaPoints, pages, books, reviews,
 *                               ratings, genres, libraryAdded, badges,
 *                               ploggerWeeks, longestStreak }
 */
function _buildYearStatsMap_(year, activityData, shelfData, pageLogData,
                              libraryData, badgeAwardData, bookMetaMap) {

  var stats = {};  // memberId → stat object for target year

  /**
   * Initialises a member's stat object if not yet present.
   * @param {string} mid - Member ID
   */
  function _ensureMember_(mid) {
    if (!stats[mid]) {
      stats[mid] = {
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
    }
  }

  // ── 1. ArkaPoints (year) ─────────────────────────────────────────────────
  // Sum CP awarded from ActivityLogDB, filtered to the target year.
  // SYS_ACTTYP_CLUBPOINTS_UPDATE rows are synthetic reconciliation markers
  // (zero CP, just for audit trail) and are explicitly excluded.
  for (var ai = 1; ai < activityData.length; ai++) {
    var aType = (activityData[ai][1] || '').toString();
    if (aType === 'SYS_ACTTYP_CLUBPOINTS_UPDATE') continue;
    var aMid  = (activityData[ai][3] || '').toString();
    if (!aMid) continue;
    var aDate = parseArkaDateString_(activityData[ai][2]);
    if (isNaN(aDate.getTime()) || aDate.getFullYear() !== year) continue;
    var aPts  = Number(activityData[ai][6]) || 0;
    _ensureMember_(aMid);
    stats[aMid].arkaPoints += aPts;
  }

  // ── 2. Reviews + Ratings (year) — deduplicated by shelfId ────────────────
  // ActivityLogDB stores the shelfId in activityDesc (Col E, index 4) for both
  // BOOKREVIEW and BOOKRATING events. Using shelfId as the dedup key ensures a
  // member who edits an existing review is counted once, not twice. This is the
  // only approach that gives correct year counts when ActivityLogDB is large and
  // the frontend's 2000-row window would otherwise undercount.
  var yearReviewedShelves = {};  // memberId → { shelfId: true } for target year
  var yearRatedShelves    = {};  // memberId → { shelfId: true } for target year

  for (var rvi = 1; rvi < activityData.length; rvi++) {
    var rvType  = (activityData[rvi][1] || '').toString();
    var rvMid   = (activityData[rvi][3] || '').toString();
    var rvShelf = (activityData[rvi][4] || '').toString();
    if (!rvMid || !rvShelf) continue;
    var rvDate  = parseArkaDateString_(activityData[rvi][2]);
    if (isNaN(rvDate.getTime()) || rvDate.getFullYear() !== year) continue;

    if (rvType === 'ARKA_ACTTYP_BOOKREVIEW') {
      if (!yearReviewedShelves[rvMid]) yearReviewedShelves[rvMid] = {};
      yearReviewedShelves[rvMid][rvShelf] = true;
    } else if (rvType === 'ARKA_ACTTYP_BOOKRATING') {
      if (!yearRatedShelves[rvMid]) yearRatedShelves[rvMid] = {};
      yearRatedShelves[rvMid][rvShelf] = true;
    }
  }

  // Convert shelf-id sets to counts and write into stats
  var rvMidKey;
  for (rvMidKey in yearReviewedShelves) {
    if (!yearReviewedShelves.hasOwnProperty(rvMidKey)) continue;
    _ensureMember_(rvMidKey);
    stats[rvMidKey].reviews = Object.keys(yearReviewedShelves[rvMidKey]).length;
  }
  for (rvMidKey in yearRatedShelves) {
    if (!yearRatedShelves.hasOwnProperty(rvMidKey)) continue;
    _ensureMember_(rvMidKey);
    stats[rvMidKey].ratings = Object.keys(yearRatedShelves[rvMidKey]).length;
  }

  // ── 3. Books (year) + Genres (year) ─────────────────────────────────────
  // Books: Finished shelf records whose dateFinished (Col I, index 8) falls
  // within the target year. Each qualifying Finished record counts once even
  // if the member re-reads the same book — consistent with the all-time calc.
  // Genres: canonical genre names (via resolveCanonicalGenres_) of those books.
  var yearCanonGenreSets = {};  // memberId → { canonicalGenre: true }

  for (var si = 1; si < shelfData.length; si++) {
    if ((shelfData[si][3] || '').toString() !== 'Finished') continue;
    var sMid    = (shelfData[si][1] || '').toString();
    var sBookId = (shelfData[si][2] || '').toString();
    if (!sMid || !sBookId) continue;
    var sDate   = parseArkaDateString_(shelfData[si][8]);  // Col I: dateFinished
    if (isNaN(sDate.getTime()) || sDate.getFullYear() !== year) continue;

    _ensureMember_(sMid);
    stats[sMid].books++;

    // Accumulate canonical genres for this finished book
    var sMeta = bookMetaMap[sBookId];
    if (sMeta && sMeta.genre) {
      if (!yearCanonGenreSets[sMid]) yearCanonGenreSets[sMid] = {};
      var sCanon = resolveCanonicalGenres_(sMeta.genre);
      for (var sgi = 0; sgi < sCanon.length; sgi++) {
        yearCanonGenreSets[sMid][sCanon[sgi]] = true;
      }
    }
  }

  // Write unique genre counts
  var gMid;
  for (gMid in yearCanonGenreSets) {
    if (!yearCanonGenreSets.hasOwnProperty(gMid)) continue;
    stats[gMid].genres = Object.keys(yearCanonGenreSets[gMid]).length;
  }

  // ── 4. Pages (year) + PLogger weeks (year) + Longest streak (year) ───────
  // All three derive from PageLogDB filtered to the target year.
  // Per-member log arrays are built once and passed to the existing helpers
  // computeUniqueWeeksLogged_() and computeAllTimeBestStreak_() which already
  // handle the ISO-week arithmetic correctly.
  var yearPageLogsByMember = {};  // memberId → [{ timestamp, pagesDelta }]

  for (var pi = 1; pi < pageLogData.length; pi++) {
    var pMid   = (pageLogData[pi][2] || '').toString();
    if (!pMid) continue;
    var pDate  = parseArkaDateString_(pageLogData[pi][1]);
    if (isNaN(pDate.getTime()) || pDate.getFullYear() !== year) continue;
    var pDelta = Number(pageLogData[pi][4]) || 0;

    _ensureMember_(pMid);
    if (pDelta > 0) stats[pMid].pages += pDelta;

    if (!yearPageLogsByMember[pMid]) yearPageLogsByMember[pMid] = [];
    yearPageLogsByMember[pMid].push({
      timestamp  : pDate.toISOString(), // ISO string — safe for new Date() in the helpers
      pagesDelta : pDelta
    });
  }

  // Derive ploggerWeeks and longestStreak from the per-member year log arrays
  var pMidKey;
  for (pMidKey in yearPageLogsByMember) {
    if (!yearPageLogsByMember.hasOwnProperty(pMidKey)) continue;
    _ensureMember_(pMidKey);
    stats[pMidKey].ploggerWeeks    = computeUniqueWeeksLogged_(yearPageLogsByMember[pMidKey]);
    stats[pMidKey].longestStreak   = computeAllTimeBestStreak_(yearPageLogsByMember[pMidKey]);
  }

  // ── 5. Library added (year) ───────────────────────────────────────────────
  // ArkaLibraryDB Col F (index 5) = AddedBy member ID.
  // Col G (index 6) = AddedDate in dd-MMM-yyyy format.
  for (var li = 1; li < libraryData.length; li++) {
    var lMid  = (libraryData[li][5] || '').toString();
    if (!lMid) continue;
    var lDate = parseArkaDateString_(libraryData[li][6]);  // Col G: AddedDate
    if (isNaN(lDate.getTime()) || lDate.getFullYear() !== year) continue;
    _ensureMember_(lMid);
    stats[lMid].libraryAdded++;
  }

  // ── 6. Badges earned (year) ──────────────────────────────────────────────
  // BadgeAwardDB Col C (index 2) = MemberID, Col D (index 3) = AwardedDate,
  // Col F (index 5) = Status. Only Active awards count; Revoked awards are
  // excluded to match the existing badge-strip display rule.
  for (var bai = 1; bai < badgeAwardData.length; bai++) {
    if ((badgeAwardData[bai][5] || '').toString() !== 'Active') continue;
    var baMid  = (badgeAwardData[bai][2] || '').toString();
    if (!baMid) continue;
    var baDate = parseArkaDateString_(badgeAwardData[bai][3]);  // Col D: AwardedDate
    if (isNaN(baDate.getTime()) || baDate.getFullYear() !== year) continue;
    _ensureMember_(baMid);
    stats[baMid].badges++;
  }

  return stats;
}


/**
 * Core execution engine. Locks the database, loads all sheet data, runs the audit,
 * applies corrections, calculates true totals, and batch-writes back to Google Sheets.
 */
function syncAllMemberStats() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    console.error("Database busy. Aborting sync to prevent data collisions.");
    return;
  }

  try {
    // ── Reset downstream readiness gates ──────────────────────────────────────
    // Clear READY flags immediately so ArkaAIPass and ArkaPersonaPass cannot
    // run on stale data from a previous night's cycle while this run is in
    // progress. Flags are re-set to 'true' at the end of a successful run.
    const propsAtStart = PropertiesService.getScriptProperties();
    propsAtStart.setProperty(AIPASS_READY_FLAG_KEY,    'false');
    propsAtStart.setProperty('ARKAPERSONAPASS_READY',  'false');
    propsAtStart.setProperty(EMAILPASS_READY_FLAG_KEY, 'false');
    console.log('syncAllMemberStats: downstream READY flags cleared — AIPass, PersonaPass, and EmailPass gated until this run completes.');

    repairMemberIDs();
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    
    // 1. LOAD ALL DATA INTO MEMORY
    const memSheet     = ss.getSheetByName(MEMBERS_SHEET_NAME);
    const memData      = memSheet.getDataRange().getValues();

    const activityData = ss.getSheetByName('ActivityLogDB').getDataRange().getValues();
    const pageLogData  = ss.getSheetByName('PageLogDB').getDataRange().getValues();
    const shelfData    = ss.getSheetByName('MemberShelfDB').getDataRange().getValues();
    const levelData    = ss.getSheetByName('ClubPointLevelDB').getDataRange().getValues();

    // ── Badge system sheets ────────────────────────────────────────────────
    const badgeSheet      = ss.getSheetByName(BADGE_DB_SHEET_NAME);
    const badgeAwardSheet = ss.getSheetByName(BADGE_AWARD_DB_SHEET_NAME);
    const librarySheet       = ss.getSheetByName(LIBRARY_SHEET_NAME);
    const challengeSheet     = ss.getSheetByName(CHALLENGE_SHEET_NAME);
    const enrollmentSheet    = ss.getSheetByName(CHALLENGE_ENROLLMENT_SHEET_NAME);
    const personaSheet       = ss.getSheetByName('PersonaProfileDB');

    const badgeData      = badgeSheet      ? badgeSheet.getDataRange().getValues()      : [[]];
    // personaData: Col A=MemberID, Col C=ArchetypeName, Col E=ArchetypeTagline, Col F=AxisVerdicts JSON
    const personaData    = personaSheet    ? personaSheet.getDataRange().getValues()    : [[]];
    const badgeAwardData = badgeAwardSheet ? badgeAwardSheet.getDataRange().getValues() : [[]];
    const libraryData    = librarySheet    ? librarySheet.getDataRange().getValues()    : [[]];
    const challengeData  = challengeSheet  ? challengeSheet.getDataRange().getValues()  : [[]];
    const enrollmentData = enrollmentSheet ? enrollmentSheet.getDataRange().getValues() : [[]];
    
    // Build level rules
    const levelRules = [];
    for (let i = 1; i < levelData.length; i++) {
      if (levelData[i][0] !== "") {
        levelRules.push({
          maxClubPoints: Number(levelData[i][1]) || 0,
          levelName:     levelData[i][2] || "Reader"
        });
      }
    }

    // Build multiplier map from ActivityTypeDB for Rule 5
    // ActivityClubPoints is now Col B (index 1), moved from Col E (index 4)
    const actTypeData   = ss.getSheetByName('ActivityTypeDB').getDataRange().getValues();
    const multiplierMap = {};
    for (let i = 1; i < actTypeData.length; i++) {
      if (actTypeData[i][0]) {
        multiplierMap[actTypeData[i][0]] = Number(actTypeData[i][1]) || 0; // Col B
      }
    }

    // Find the last MasterSync row — entries after this index get Rule 5 applied
    const lastMasterSyncIdx = findLastMasterSyncRowIndex(activityData);

    // Determine next activity ID number from the last row of the log
    let newActNum = 1;
    if (activityData.length > 1) {
      const lastId  = (activityData[activityData.length - 1][0] || "").toString();
      const lastNum = parseInt(lastId.split('_')[2]);
      if (!isNaN(lastNum)) newActNum = lastNum;
    }

    const activityDate = Utilities.formatDate(
      new Date(), Session.getScriptTimeZone(), "dd-MM-yyyy HH:mm:ss Z"
    );

    // ── 2. RUN AUDIT AND GENERATE CORRECTIONS ─────────────────────────────
    const { newCorrectionLogs, nextActNum } = generateCorrections(
      activityData,
      activityDate,
      newActNum,
      multiplierMap,
      lastMasterSyncIdx
    );
    newActNum = nextActNum;

    // ── 3. ABSOLUTE CALCULATION ENGINE ────────────────────────────────────
    const calculatedPointsMap = {}; // { memberId: totalPoints }
    const calculatedPagesMap  = {}; // { memberId: totalPages }
    const calculatedBooksMap  = {}; // { memberId: Set<bookId> }

    // A. Sum all awarded points from the full activity log
    for (let i = 1; i < activityData.length; i++) {
      const type     = (activityData[i][1] || "").toString();
      const memberId = (activityData[i][3] || "").toString();
      const points   = Number(activityData[i][6]) || 0;

      // Exclude the internal update-marker type (those rows carry 0 points but be explicit)
      if (memberId && type !== "SYS_ACTTYP_CLUBPOINTS_UPDATE") {
        calculatedPointsMap[memberId] = (calculatedPointsMap[memberId] || 0) + points;
      }
    }

    // Apply the in-memory corrections immediately so the final tally is accurate
    newCorrectionLogs.forEach(row => {
      const memberId = (row[3] || "").toString();
      const pts      = Number(row[6]) || 0; // Already negative
      calculatedPointsMap[memberId] = (calculatedPointsMap[memberId] || 0) + pts;
    });

    // B. Sum total pages from PageLogDB
    for (let i = 1; i < pageLogData.length; i++) {
      const memberId   = (pageLogData[i][2] || "").toString();
      const pagesDelta = Number(pageLogData[i][4]) || 0;
      if (memberId) {
        calculatedPagesMap[memberId] = (calculatedPagesMap[memberId] || 0) + pagesDelta;
      }
    }

    // C. Count unique finished books from MemberShelfDB
    for (let i = 1; i < shelfData.length; i++) {
      const memberId = (shelfData[i][1] || "").toString();
      const bookId   = (shelfData[i][2] || "").toString();
      const status   = (shelfData[i][3] || "").toString();
      if (memberId && status === "Finished") {
        if (!calculatedBooksMap[memberId]) calculatedBooksMap[memberId] = new Set();
        calculatedBooksMap[memberId].add(bookId);
      }
    }

    // ── 4. BADGE SYSTEM PREPARATION ───────────────────────────────────────

    // Runtime tier map — category/tier keys → { badgeId, badgePoints }
    var badgeTierMap = buildBadgeTierMap_(badgeData);

    // Row index map — memberId → row index in memData — for in-memory Col N updates
    var memberRowIndexMap = {};
    for (var mi = 1; mi < memData.length; mi++) {
      var mid = (memData[mi][0] || '').toString();
      if (mid) memberRowIndexMap[mid] = mi;
    }

    // Set of "memberId_badgeId" for every Active award — prevents duplicate awards
    // across engine runs. Also extended within the run as badges are awarded.
    var existingActiveBadgeSet = {};
    var newAwardNum = 1;
    if (badgeAwardData.length > 1) {
      var lastAwardId  = (badgeAwardData[badgeAwardData.length - 1][0] || '').toString();
      var lastAwardNum = parseInt(lastAwardId.split('_')[2], 10);
      if (!isNaN(lastAwardNum)) newAwardNum = lastAwardNum + 1;
    }
    for (var bi = 1; bi < badgeAwardData.length; bi++) {
      if ((badgeAwardData[bi][5] || '').toString() === 'Active') {
        existingActiveBadgeSet[badgeAwardData[bi][2].toString() + '_' + badgeAwardData[bi][1].toString()] = true;
      }
    }

    // Legacy milestone detection — members who already received ARKA_ACTTYP_MILESTONE_PAGES
    // or ARKA_ACTTYP_MILESTONE_BOOKS CP get their badge with 0 CP to avoid double-counting.
    // Key format: "memberId_CATEGORY_threshold" e.g. "ARKA_MEMBER_1_PAGE_MILESTONE_5000"
    var legacyMilestoneSet = {};
    for (var li = 1; li < activityData.length; li++) {
      var legacyType = (activityData[li][1] || '').toString();
      if (legacyType === 'ARKA_ACTTYP_MILESTONE_PAGES' || legacyType === 'ARKA_ACTTYP_MILESTONE_BOOKS') {
        var legacyMid  = (activityData[li][3] || '').toString();
        var legacyCat  = legacyType === 'ARKA_ACTTYP_MILESTONE_PAGES' ? 'PAGE_MILESTONE' : 'BOOK_MILESTONE';
        var legacyThr  = (activityData[li][4] || '').toString(); // stored as threshold.toString()
        legacyMilestoneSet[legacyMid + '_' + legacyCat + '_' + legacyThr] = true;
      }
    }

    // Per-member all-time review counts from ActivityLogDB, deduplicated by shelfId.
    // Mirrors _buildYearStatsMap_ review logic (ARKA_ACTTYP_BOOKREVIEW + shelfId dedup)
    // but with no year filter, so edits/re-submissions on the same shelf never double-count.
    // Using the activity log (not shelf Col F text) ensures consistency with yearly stats.
    var memberReviewShelfSets = {};  // { memberId: { shelfId: true } }
    for (var rsi = 1; rsi < activityData.length; rsi++) {
      var rsType  = (activityData[rsi][1] || '').toString();
      if (rsType !== 'ARKA_ACTTYP_BOOKREVIEW') continue;
      var rsMemberId = (activityData[rsi][3] || '').toString();
      var rsShelfId  = (activityData[rsi][4] || '').toString();
      if (!rsMemberId || !rsShelfId) continue;
      if (!memberReviewShelfSets[rsMemberId]) memberReviewShelfSets[rsMemberId] = {};
      memberReviewShelfSets[rsMemberId][rsShelfId] = true;
    }
    var memberReviewCountMap = {};  // { memberId: unique reviewed shelf count }
    for (var rrMid in memberReviewShelfSets) {
      if (!memberReviewShelfSets.hasOwnProperty(rrMid)) continue;
      memberReviewCountMap[rrMid] = Object.keys(memberReviewShelfSets[rrMid]).length;
    }

    // Per-member event-attendance counts from ActivityLogDB.
    // EVENTATTENDED is only logged by confirmEventAttendance() when attendanceConfirmed
    // === 'Yes' — RSVP_YES alone does NOT count. No shelf equivalent exists for this.
    var memberEventAttendanceMap = {};  // { memberId: count of ARKA_ACTTYP_EVENTATTENDED }
    for (var ai = 1; ai < activityData.length; ai++) {
      var aType     = (activityData[ai][1] || '').toString();
      var aMemberId = (activityData[ai][3] || '').toString();
      if (!aMemberId) continue;
      if (aType === 'ARKA_ACTTYP_EVENTATTENDED') {
        memberEventAttendanceMap[aMemberId] = (memberEventAttendanceMap[aMemberId] || 0) + 1;
      }
    }

    // Per-member page log arrays for streak and PLogger calculations.
    // Timestamps are parsed here with parseArkaDateString_ and stored as ISO strings
    // so that computeAllTimeBestStreak_() and computeUniqueWeeksLogged_() receive
    // reliable input — new Date() in GAS V8 rejects the "dd-MM-yyyy HH:mm:ss Z"
    // format that PageLogDB uses, returning NaN and silently zeroing all streaks.
    // Rows with genuinely unparseable timestamps are skipped here rather than
    // propagating NaN into downstream week-set calculations.
    var memberPageLogsMap = {};
    for (var pi = 1; pi < pageLogData.length; pi++) {
      var plMemberId = (pageLogData[pi][2] || '').toString();
      if (!plMemberId) continue;

      var plParsedDate = parseArkaDateString_(pageLogData[pi][1]);
      if (isNaN(plParsedDate.getTime())) continue; // skip rows with corrupt timestamps

      if (!memberPageLogsMap[plMemberId]) memberPageLogsMap[plMemberId] = [];
      memberPageLogsMap[plMemberId].push({
        timestamp  : plParsedDate.toISOString(), // valid ISO — safe for new Date() downstream
        pagesDelta : Number(pageLogData[pi][4]) || 0
      });
    }

    // Library additions per member — counted from ArkaLibraryDB.AddedBy (Col F, index 5)
    var memberLibraryAdditionsMap = {};
    for (var lbi = 1; lbi < libraryData.length; lbi++) {
      var libAddedBy = (libraryData[lbi][5] || '').toString();
      if (libAddedBy) {
        memberLibraryAdditionsMap[libAddedBy] = (memberLibraryAdditionsMap[libAddedBy] || 0) + 1;
      }
    }

    // All-time ratings per member from ActivityLogDB, deduplicated by shelfId.
    // Mirrors _buildYearStatsMap_ ratings logic (ARKA_ACTTYP_BOOKRATING + shelfId dedup)
    // but with no year filter, so re-ratings on the same shelf never double-count.
    var memberRatingShelfSets = {};  // { memberId: { shelfId: true } }
    for (var rci = 1; rci < activityData.length; rci++) {
      if ((activityData[rci][1] || '').toString() !== 'ARKA_ACTTYP_BOOKRATING') continue;
      var rcMemberId = (activityData[rci][3] || '').toString();
      var rcShelfId  = (activityData[rci][4] || '').toString();
      if (!rcMemberId || !rcShelfId) continue;
      if (!memberRatingShelfSets[rcMemberId]) memberRatingShelfSets[rcMemberId] = {};
      memberRatingShelfSets[rcMemberId][rcShelfId] = true;
    }
    var memberRatingCountMap = {};
    for (var rrRatMid in memberRatingShelfSets) {
      if (!memberRatingShelfSets.hasOwnProperty(rrRatMid)) continue;
      memberRatingCountMap[rrRatMid] = Object.keys(memberRatingShelfSets[rrRatMid]).length;
    }

    // Active badge count per member — counted from BadgeAwardDB before the badge
    // pass runs. One-night lag is acceptable: any badges awarded in THIS run will
    // be reflected in the next nightly Stats JSON, not the current one.
    var activeBadgeCountMap = {};
    for (var abci = 1; abci < badgeAwardData.length; abci++) {
      if ((badgeAwardData[abci][5] || '').toString() !== 'Active') continue;
      var abcMid = (badgeAwardData[abci][2] || '').toString();
      if (!abcMid) continue;
      activeBadgeCountMap[abcMid] = (activeBadgeCountMap[abcMid] || 0) + 1;
    }

     // Book meta lookup: bookId → { pages, genre } from ArkaLibraryDB
    var bookMetaMap = {};
    for (var bmi = 1; bmi < libraryData.length; bmi++) {
      var bmBookId = (libraryData[bmi][0] || '').toString();
      if (bmBookId) {
        bookMetaMap[bmBookId] = {
          pages: Number(libraryData[bmi][4]) || 0,    // Col E: page count
          genre: (libraryData[bmi][3] || '').toString() // Col D: genre string
        };
      }
    }

    // Year-specific stats for all members — single pre-loop build so that the
    // per-member loop can look up results in O(1) rather than scanning tables
    // per member. Uses the same data sources already held in memory.
    var STATS_CURRENT_YEAR = new Date().getFullYear();
    var yearStatsMap = _buildYearStatsMap_(
      STATS_CURRENT_YEAR,
      activityData,
      shelfData,
      pageLogData,
      libraryData,
      badgeAwardData,
      bookMetaMap
    );

   

    // Per-member Fat Read max, canonical genre counts (Explorer), and unique
    // genre collector sets (Collector). Built from Finished shelf records only.
    var memberFatReadMaxMap      = {};  // { memberId: maxPagesOfAnyFinishedBook }
    var memberCanonGenreMap      = {};  // { memberId: { canonicalGenre: bookCount } } — Genre Explorer
    var memberGenreCollectorMap  = {};  // { memberId: Set<normalisedGenreString> }  — Genre Collector

    for (var shi = 1; shi < shelfData.length; shi++) {
      var shMemberId = (shelfData[shi][1] || '').toString();
      var shBookId   = (shelfData[shi][2] || '').toString();
      var shStatus   = (shelfData[shi][3] || '').toString();
      if (shStatus !== 'Finished' || !shMemberId || !shBookId) continue;

      var bookMeta = bookMetaMap[shBookId];
      if (!bookMeta) continue;

      // Fat Read — track the single highest page count across finished books
      if (bookMeta.pages > (memberFatReadMaxMap[shMemberId] || 0)) {
        memberFatReadMaxMap[shMemberId] = bookMeta.pages;
      }

      if (bookMeta.genre) {
        var rawTags = bookMeta.genre.split(',');

        // Genre Explorer — increment count per matching canonical genre only
        if (!memberCanonGenreMap[shMemberId]) memberCanonGenreMap[shMemberId] = {};
        var matchedGenres = resolveCanonicalGenres_(bookMeta.genre);
        for (var gi = 0; gi < matchedGenres.length; gi++) {
          var cg = matchedGenres[gi];
          memberCanonGenreMap[shMemberId][cg] = (memberCanonGenreMap[shMemberId][cg] || 0) + 1;
        }

        // Genre Collector — add every raw lowercased tag to the member's unique set.
        // No synonym collapsing — mirrors the leaderboard logic so all unique raw
        // tags count toward the 1000-tier milestone.
        if (!memberGenreCollectorMap[shMemberId]) memberGenreCollectorMap[shMemberId] = {};
        for (var ti = 0; ti < rawTags.length; ti++) {
          var trimmedTag = rawTags[ti].trim().toLowerCase();
          if (!trimmedTag) continue;
          memberGenreCollectorMap[shMemberId][trimmedTag] = true;
        }
      }
    }

    // Batch accumulator for new BadgeAwardDB rows — written at end with ActivityLogDB
    var badgeAwardsToPush = [];

    // ── 5. FIND DELTAS AND PREPARE BATCH UPDATES ──────────────────────────
    let changesMade = false;
    const finalActivityLogsToPush = [...newCorrectionLogs];

    // ── Pre-build per-member onboarding flags ─────────────────────────────
    // One O(activityLog) pass here replaces the O(members × activityLog) scan
    // that checkOnboardingBadges_() previously ran inside the member loop.
    // Key: memberId string → flags object consumed by checkOnboardingBadges_().
    const memberOnboardingFlagsMap = {};
    for (let oi = 1; oi < activityData.length; oi++) {
      const oMemberId = (activityData[oi][3] || '').toString();
      if (!oMemberId) continue;
      if (!memberOnboardingFlagsMap[oMemberId]) memberOnboardingFlagsMap[oMemberId] = {};
      const oFlags = memberOnboardingFlagsMap[oMemberId];
      const oType  = (activityData[oi][1] || '').toString();
      const oDesc  = (activityData[oi][4] || '').toString();
      switch (oType) {
        case 'ARKA_ACTTYP_PROFILENEW':       oFlags.hasProfileNew       = true; break;
        case 'ARKA_ACTTYP_PROFILEUPDATE':    oFlags.hasProfileUpdate    = true; break;
        case 'ARKA_ACTTYP_BOOKADDED':        oFlags.hasBooksAdd         = true; break;
        case 'ARKA_ACTTYP_BOOKTOREAD':       oFlags.hasBookToRead       = true; break;
        case 'ARKA_ACTTYP_BOOKREADING':      oFlags.hasBookReading      = true; break;
        case 'ARKA_ACTTYP_PAGEREAD':
          if (oDesc.indexOf('unlinked') !== -1) { oFlags.hasPageReadUnlinked = true; }
          else                                  { oFlags.hasPageReadLinked   = true; }
          break;
        case 'ARKA_ACTTYP_BOOKREAD':         oFlags.hasBookRead         = true; break;
        case 'ARKA_ACTTYP_BOOKRATING':       oFlags.hasBookRating       = true; break;
        case 'ARKA_ACTTYP_BOOKREVIEW':       oFlags.hasBookReview       = true; break;
        case 'ARKA_ACTTYP_EVENTRSVP':        oFlags.hasEventRsvp        = true; break;
        case 'ARKA_ACTTYP_CHALLENGE_ENROLL': oFlags.hasChallengeEnroll  = true; break;
        case 'ARKA_ACTTYP_EVENTATTENDED':    oFlags.hasEventAttended    = true; break;
        case 'ARKA_ACTTYP_BOOKPOST':         oFlags.hasBookPost         = true; break;
        case 'ARKA_ACTTYP_SHAREPROGRESS':    oFlags.hasShareProgress    = true; break;
        case 'ARKA_ACTTYP_FEEDBACK':         oFlags.hasFeedback         = true; break;
      }
    }

    for (let i = 1; i < memData.length; i++) {
      const memberId     = (memData[i][0] || "").toString();
      // Col O is now a JSON Stats blob. _parseStatsJson_ handles legacy integers
      // gracefully so the first post-deployment run does not need a data migration.
      var _currentStatsJson = _parseStatsJson_(memData[i][14]);
      const currentPoints   = _currentStatsJson.allTime.arkaPoints;  // was: Number(memData[i][14]) || 0
      const currentPages    = _currentStatsJson.allTime.pages;
      const currentBooks    = _currentStatsJson.allTime.books;

      if (!memberId) continue;

      let truePoints = calculatedPointsMap[memberId] || 0;
      const truePages  = calculatedPagesMap[memberId]  || 0;
      const trueBooks  = calculatedBooksMap[memberId]
        ? calculatedBooksMap[memberId].size
        : 0;

      // ── AUTOMATIC BADGE PASS ────────────────────────────────────────────
      // Checks all badge categories for this member.
      // autoAwardBadge_() is a no-op if the badge is already Active in BadgeAwardDB.
      // counters object bridges the ES5 pass-by-value limitation for newActNum/newAwardNum.
      var counters        = { actNum: newActNum, awardNum: newAwardNum };
      var pendingBadgePoints = 0;
      var memberLogs         = memberPageLogsMap[memberId] || [];

      // ── PAGE_MILESTONE ─────────────────────────────────────────────────
      var pmThresholds = BADGE_THRESHOLDS.PAGE_MILESTONE;
      for (var pmt = 0; pmt < pmThresholds.length; pmt++) {
        if (truePages >= pmThresholds[pmt]) {
          var pmConfig = badgeTierMap['PAGE_MILESTONE'] && badgeTierMap['PAGE_MILESTONE'][pmt + 1];
          if (pmConfig) {
            // Legacy CP guard: if the old milestone type already credited this member,
            // award the badge but with 0 CP so points are not double-counted.
            var pmLegacyKey = memberId + '_PAGE_MILESTONE_' + pmThresholds[pmt].toString();
            var pmCp        = legacyMilestoneSet[pmLegacyKey] ? 0 : pmConfig.badgePoints;
            pendingBadgePoints += autoAwardBadge_(
              memberId, pmConfig.badgeId, pmCp, pmConfig.caption || '', activityDate,
              existingActiveBadgeSet, badgeAwardsToPush, finalActivityLogsToPush,
              memberRowIndexMap, memData, counters
            );
          }
        }
      }

      // ── BOOK_MILESTONE ─────────────────────────────────────────────────
      var bmThresholds = BADGE_THRESHOLDS.BOOK_MILESTONE;
      for (var bmt = 0; bmt < bmThresholds.length; bmt++) {
        if (trueBooks >= bmThresholds[bmt]) {
          var bmConfig = badgeTierMap['BOOK_MILESTONE'] && badgeTierMap['BOOK_MILESTONE'][bmt + 1];
          if (bmConfig) {
            var bmLegacyKey = memberId + '_BOOK_MILESTONE_' + bmThresholds[bmt].toString();
            var bmCp        = legacyMilestoneSet[bmLegacyKey] ? 0 : bmConfig.badgePoints;
            pendingBadgePoints += autoAwardBadge_(
              memberId, bmConfig.badgeId, bmCp, bmConfig.caption || '', activityDate,
              existingActiveBadgeSet, badgeAwardsToPush, finalActivityLogsToPush,
              memberRowIndexMap, memData, counters
            );
          }
        }
      }

      // ── STREAK_MILESTONE (all-time best consecutive weeks) ─────────────
      var bestStreak     = computeAllTimeBestStreak_(memberLogs);
      var smThresholds   = BADGE_THRESHOLDS.STREAK_MILESTONE;
      for (var smt = 0; smt < smThresholds.length; smt++) {
        if (bestStreak >= smThresholds[smt]) {
          var smConfig = badgeTierMap['STREAK_MILESTONE'] && badgeTierMap['STREAK_MILESTONE'][smt + 1];
          if (smConfig) {
            pendingBadgePoints += autoAwardBadge_(
              memberId, smConfig.badgeId, smConfig.badgePoints, smConfig.caption || '', activityDate,
              existingActiveBadgeSet, badgeAwardsToPush, finalActivityLogsToPush,
              memberRowIndexMap, memData, counters
            );
          }
        }
      }

      // ── PLOGGER (total unique weeks logged) ────────────────────────────
      var totalWeeks   = computeUniqueWeeksLogged_(memberLogs);
      var plThresholds = BADGE_THRESHOLDS.PLOGGER;
      for (var plt = 0; plt < plThresholds.length; plt++) {
        if (totalWeeks >= plThresholds[plt]) {
          var plConfig = badgeTierMap['PLOGGER'] && badgeTierMap['PLOGGER'][plt + 1];
          if (plConfig) {
            pendingBadgePoints += autoAwardBadge_(
              memberId, plConfig.badgeId, plConfig.badgePoints, plConfig.caption || '', activityDate,
              existingActiveBadgeSet, badgeAwardsToPush, finalActivityLogsToPush,
              memberRowIndexMap, memData, counters
            );
          }
        }
      }

      // ── REVIEW_MILESTONE ───────────────────────────────────────────────
      var reviewCount  = memberReviewCountMap[memberId] || 0;
      var rmThresholds = BADGE_THRESHOLDS.REVIEW_MILESTONE;
      for (var rmt = 0; rmt < rmThresholds.length; rmt++) {
        if (reviewCount >= rmThresholds[rmt]) {
          var rmConfig = badgeTierMap['REVIEW_MILESTONE'] && badgeTierMap['REVIEW_MILESTONE'][rmt + 1];
          if (rmConfig) {
            pendingBadgePoints += autoAwardBadge_(
              memberId, rmConfig.badgeId, rmConfig.badgePoints, rmConfig.caption || '', activityDate,
              existingActiveBadgeSet, badgeAwardsToPush, finalActivityLogsToPush,
              memberRowIndexMap, memData, counters
            );
          }
        }
      }

      // ── FAT_READ (highest single-book page count among finished books) ──
      var fatReadMax   = memberFatReadMaxMap[memberId] || 0;
      var frThresholds = BADGE_THRESHOLDS.FAT_READ;
      for (var frt = 0; frt < frThresholds.length; frt++) {
        if (fatReadMax >= frThresholds[frt]) {
          var frConfig = badgeTierMap['FAT_READ'] && badgeTierMap['FAT_READ'][frt + 1];
          if (frConfig) {
            pendingBadgePoints += autoAwardBadge_(
              memberId, frConfig.badgeId, frConfig.badgePoints, frConfig.caption || '', activityDate,
              existingActiveBadgeSet, badgeAwardsToPush, finalActivityLogsToPush,
              memberRowIndexMap, memData, counters
            );
          }
        }
      }

      // ── GENRE_EXPLORER (per-genre book counts) ─────────────────────────
      var memberGenres = memberCanonGenreMap[memberId] || {};
      for (var genreName in GENRE_ALIAS_MAP) {
        if (!GENRE_ALIAS_MAP.hasOwnProperty(genreName)) continue;
        var genreBookCount = memberGenres[genreName] || 0;
        if (genreBookCount === 0) continue;
        for (var get = 0; get < GENRE_EXPLORER_THRESHOLDS.length; get++) {
          if (genreBookCount >= GENRE_EXPLORER_THRESHOLDS[get]) {
            var geConfig = badgeTierMap['GENRE_EXPLORER'] &&
                           badgeTierMap['GENRE_EXPLORER'][genreName] &&
                           badgeTierMap['GENRE_EXPLORER'][genreName][get + 1];
            if (geConfig) {
              pendingBadgePoints += autoAwardBadge_(
                memberId, geConfig.badgeId, geConfig.badgePoints, geConfig.caption || '', activityDate,
                existingActiveBadgeSet, badgeAwardsToPush, finalActivityLogsToPush,
                memberRowIndexMap, memData, counters
              );
            }
          }
        }
      }

      // ── GENRE_COLLECTOR (unique normalised genre strings across all finished books)
      // Uses memberGenreCollectorMap — entirely separate from memberCanonGenreMap.
      // Synonyms are collapsed (sci-fi = science fiction) but distinct genres
      // (historical fiction ≠ fiction) each count as their own unique slot.
      var uniqueGenreCount = Object.keys(memberGenreCollectorMap[memberId] || {}).length;
      var gcThresholds     = BADGE_THRESHOLDS.GENRE_COLLECTOR;
      for (var gct = 0; gct < gcThresholds.length; gct++) {
        if (uniqueGenreCount >= gcThresholds[gct]) {
          var gcConfig = badgeTierMap['GENRE_COLLECTOR'] && badgeTierMap['GENRE_COLLECTOR'][gct + 1];
          if (gcConfig) {
            pendingBadgePoints += autoAwardBadge_(
              memberId, gcConfig.badgeId, gcConfig.badgePoints, gcConfig.caption || '', activityDate,
              existingActiveBadgeSet, badgeAwardsToPush, finalActivityLogsToPush,
              memberRowIndexMap, memData, counters
            );
          }
        }
      }

      // ── SOCIAL_BUTTERFLY (events attended) ────────────────────────────
      var eventsAttended = memberEventAttendanceMap[memberId] || 0;
      var sbThresholds   = BADGE_THRESHOLDS.SOCIAL_BUTTERFLY;
      for (var sbt = 0; sbt < sbThresholds.length; sbt++) {
        if (eventsAttended >= sbThresholds[sbt]) {
          var sbConfig = badgeTierMap['SOCIAL_BUTTERFLY'] && badgeTierMap['SOCIAL_BUTTERFLY'][sbt + 1];
          if (sbConfig) {
            pendingBadgePoints += autoAwardBadge_(
              memberId, sbConfig.badgeId, sbConfig.badgePoints, sbConfig.caption || '', activityDate,
              existingActiveBadgeSet, badgeAwardsToPush, finalActivityLogsToPush,
              memberRowIndexMap, memData, counters
            );
          }
        }
      }

      // ── LIBRARIAN (books added to library) ────────────────────────────
      var booksAdded   = memberLibraryAdditionsMap[memberId] || 0;
      var lbThresholds = BADGE_THRESHOLDS.LIBRARIAN;
      for (var lbt = 0; lbt < lbThresholds.length; lbt++) {
        if (booksAdded >= lbThresholds[lbt]) {
          var lbConfig = badgeTierMap['LIBRARIAN'] && badgeTierMap['LIBRARIAN'][lbt + 1];
          if (lbConfig) {
            pendingBadgePoints += autoAwardBadge_(
              memberId, lbConfig.badgeId, lbConfig.badgePoints, lbConfig.caption || '', activityDate,
              existingActiveBadgeSet, badgeAwardsToPush, finalActivityLogsToPush,
              memberRowIndexMap, memData, counters
            );
          }
        }
      }

      // ── ANNIVERSARY ────────────────────────────────────────────────────
      // Awarded only if the member has been active within the past 7 days.
      // JoinDate is in MemberDB Col E (index 4), LastAccessed is Col M (index 12).
      var memberRowIdx  = memberRowIndexMap[memberId];
      // parseArkaDateString_ handles the "dd-MM-yyyy HH:mm:ss Z" format that
      // new Date() rejects in GAS V8, preventing the gate from always returning 9999.
      var lastAccessed  = memberRowIdx !== undefined
        ? parseArkaDateString_(memData[memberRowIdx][12])
        : null;
      var daysSinceAccess = lastAccessed && !isNaN(lastAccessed.getTime())
        ? (new Date() - lastAccessed) / (1000 * 60 * 60 * 24)
        : 9999;

      if (daysSinceAccess <= 7) {
        var joinDateRaw = memberRowIdx !== undefined ? memData[memberRowIdx][4] : null;
        var joinDate    = joinDateRaw ? parseArkaDateString_(joinDateRaw) : null;
        if (joinDate && !isNaN(joinDate.getTime())) {
          var yearsAsMember = (new Date() - joinDate) / (1000 * 60 * 60 * 24 * 365.25);
          var annThresholds = BADGE_THRESHOLDS.ANNIVERSARY;
          for (var ant = 0; ant < annThresholds.length; ant++) {
            if (yearsAsMember >= annThresholds[ant]) {
              var annConfig = badgeTierMap['ANNIVERSARY'] && badgeTierMap['ANNIVERSARY'][ant + 1];
              if (annConfig) {
                pendingBadgePoints += autoAwardBadge_(
                  memberId, annConfig.badgeId, annConfig.badgePoints, annConfig.caption || '', activityDate,
                  existingActiveBadgeSet, badgeAwardsToPush, finalActivityLogsToPush,
                  memberRowIndexMap, memData, counters
                );
              }
            }
          }
        }
      }

      // ── ONBOARDING BADGES ───────────────────────────────────────────────
      // Checks all five onboarding chapter badges for this member.
      // Uses activityData (auto tasks) and Col S selfReported (manual tasks).
      // Sequential completion enforced inside checkOnboardingBadges_() —
      // each chapter gate requires the previous one to be complete.
      pendingBadgePoints += checkOnboardingBadges_(
        memberId,
        memberOnboardingFlagsMap[memberId] || {},  // pre-built flags — replaces activityData scan
        (memData[i][18] || '').toString(),          // Col S — CoachInsights JSON
        existingActiveBadgeSet,
        badgeAwardsToPush,
        finalActivityLogsToPush,
        memberRowIndexMap,
        memData,
        counters,
        activityDate
      );

      // Sync counters back to main variables before the points/level/pages sections below
      newActNum   = counters.actNum;
      newAwardNum = counters.awardNum;

      // Badge CP feeds into the true point total for this sync cycle
      truePoints += pendingBadgePoints;

      // ── Sync club points ───────────────────────────────────────────────
      if (truePoints !== currentPoints) {
        //console.log(`Member ${memberId}: calculatedPoints=${truePoints}, MemberDB shows=${currentPoints}, pages=${truePages}, books=${trueBooks}`);
        const delta = truePoints - currentPoints;
        newActNum++;
        finalActivityLogsToPush.push([
          "ARKA_ACT_" + newActNum,
          "SYS_ACTTYP_CLUBPOINTS_UPDATE",
          activityDate,
          memberId,
          `${delta > 0 ? '+' : ''}${delta} points synced to profile.`,
          MASTERSYNC_SOURCE,
          0
        ]);

        // Level-up check
        const oldLevel = getLevelName(currentPoints, levelRules);
        const newLevel = getLevelName(truePoints, levelRules);
        if (oldLevel !== newLevel) {
          newActNum++;
          finalActivityLogsToPush.push([
            "ARKA_ACT_" + newActNum,
            "ARKA_ACTTYP_MEMBERLEVELUP",
            activityDate,
            memberId,
            `Previous Level: ${oldLevel} | New Level: ${newLevel}`,
            MASTERSYNC_SOURCE,
            0
          ]);

          // Write newLevel into Col N celebration JSON in memory.
          // Replaces any previous unseen level — only the most recent level-up
          // is worth celebrating. Existing celebration.badges are preserved.
          const levelRowIdx = memberRowIndexMap[memberId];
          if (levelRowIdx !== undefined) {
            var rawLevelCelebration = (memData[levelRowIdx][13] || '').toString().trim();
            var levelCelebrationObj = { badges: [], newLevel: '' };
            if (rawLevelCelebration) {
              try { levelCelebrationObj = JSON.parse(rawLevelCelebration); } catch (e) { /* reset */ }
            }
            if (!Array.isArray(levelCelebrationObj.badges)) levelCelebrationObj.badges = [];
            levelCelebrationObj.newLevel = newLevel; // always replace — latest level wins
            memData[levelRowIdx][13] = JSON.stringify(levelCelebrationObj);
          }
        }

        changesMade = true;
        // Col O (Stats JSON) is written at the end of this member iteration —
        // the arkaPoints value is included there rather than as a standalone integer.
      }

      // ── Sync total pages ───────────────────────────────────────────────
      if (truePages !== currentPages) {
        const delta = truePages - currentPages;
        if (delta > 0) {
          newActNum++;
          finalActivityLogsToPush.push([
            "ARKA_ACT_" + newActNum,
            "SYS_ACTTYP_TOTALPAGES_UPDATE",
            activityDate,
            memberId,
            `${delta} pages synced to profile.`,
            MASTERSYNC_SOURCE,
            0
          ]);
        }
        memData[i][15] = truePages;
        changesMade = true;
      }

      // ── Sync total books ───────────────────────────────────────────────
      if (trueBooks !== currentBooks) {
        const delta = trueBooks - currentBooks;
        if (delta > 0) {
          newActNum++;
          finalActivityLogsToPush.push([
            "ARKA_ACT_" + newActNum,
            "SYS_ACTTYP_TOTALBOOKS_UPDATE",
            activityDate,
            memberId,
            `${delta} books synced to profile.`,
            MASTERSYNC_SOURCE,
            0
          ]);
        }
        memData[i][16] = trueBooks;
        changesMade = true;
      }

      // ── Stats JSON (Col O) ─────────────────────────────────────────────────
      // Build the complete Stats blob for this member and write it to Col O.
      // Runs after all per-member badge, points, pages, and books computations
      // so every all-time value is final for this nightly cycle.
      //
      // Key decisions:
      //   allTime.genres  uses canonical genre count (memberCanonGenreMap) — same
      //     definition as the Genre Explorer badge, collapsing synonyms cleanly.
      //   allTime.badges  uses the pre-run activeBadgeCountMap; badges awarded in
      //     THIS run appear in the next nightly Stats JSON (one-night lag, acceptable).
      //   Year key is a dynamic string (e.g. "2026") so no code change is needed
      //     when the calendar year rolls over — MasterEngine naturally writes the new
      //     year key and leaves the previous year key frozen and preserved.
      //   Old year keys in the existing JSON (e.g. "2025") are carried forward
      //     untouched via Object.assign, building up a permanent year-by-year history.
      //
      // The Stats JSON replaces the former plain-integer Col O (TotalClubPoints).
      // Col P (TotalPages) and Col Q (TotalBooks) are still written for backward
      // compatibility and can be retired in a future cleanup pass.
      var _yearKey     = STATS_CURRENT_YEAR.toString();
      var _yearSt      = yearStatsMap[memberId] || {};

      var _allTimeStats = {
        arkaPoints   : truePoints,
        pages        : truePages,
        books        : trueBooks,
        reviews      : reviewCount,                                     // from memberReviewCountMap
        ratings      : memberRatingCountMap[memberId]    || 0,
        genres       : Object.keys(memberCanonGenreMap[memberId] || {}).length,
        libraryAdded : memberLibraryAdditionsMap[memberId] || 0,
        badges       : activeBadgeCountMap[memberId]     || 0,
        ploggerWeeks : totalWeeks,                                      // from computeUniqueWeeksLogged_
        longestStreak: bestStreak                                       // from computeAllTimeBestStreak_
      };

      var _yearStats = {
        arkaPoints   : _yearSt.arkaPoints    || 0,
        pages        : _yearSt.pages         || 0,
        books        : _yearSt.books         || 0,
        reviews      : _yearSt.reviews       || 0,
        ratings      : _yearSt.ratings       || 0,
        genres       : _yearSt.genres        || 0,
        libraryAdded : _yearSt.libraryAdded  || 0,
        badges       : _yearSt.badges        || 0,
        ploggerWeeks : _yearSt.ploggerWeeks  || 0,
        longestStreak: _yearSt.longestStreak || 0
      };

      // Merge into existing JSON to preserve historical year keys.
      // Object.assign copies all keys (including old year keys like "2025") then
      // the two targeted overwrites replace allTime and currentYear only.
      var _existingStats = _parseStatsJson_(memData[i][14]);
      var _newStatsObj   = Object.assign({}, _existingStats);
      _newStatsObj.allTime   = _allTimeStats;
      _newStatsObj[_yearKey] = _yearStats;

      var _newStatsJson = JSON.stringify(_newStatsObj);

      // Only write if the serialised blob has changed — avoids unnecessary
      // dirty bits on cells that haven't moved, keeping batch-write fast.
      if (memData[i][14].toString() !== _newStatsJson) {
        memData[i][14] = _newStatsJson;
        changesMade     = true;
      }
    }

    // ── 5. INSIGHT ENGINE PASS ─────────────────────────────────────────────
    // Runs after the main badge/points pass so all stats in memData are final.
    // Iterates only over active members (same 7-day gate as the badge pass).
    // Writes a JSON insights payload to memData[i][18] (Col S: CoachInsights).
    // Non-fatal per member — a thrown error logs a warning but never aborts the run.
    try {
      // ── Build PersonaProfileDB lookup ──────────────────────────────────────
      // Keyed by memberId → { archetypeName, archetypeTagline, axisVerdicts[] }.
      // Built once here and passed per-member into generateMemberCoachInsights_
      // so the AI coach prompt can include the member's full reading DNA without
      // MasterEngine re-reading PersonaProfileDB for every member.
      // A missing or malformed row produces a null entry — handled gracefully
      // downstream (personaDNA will be null, AI coach falls back to stats only).
      var personaProfileMap = {};
      for (var ppj = 1; ppj < personaData.length; ppj++) {
        var ppMemberId = (personaData[ppj][0] || '').toString();
        if (!ppMemberId) continue;
        var ppAxisVerdicts = [];
        try {
          ppAxisVerdicts = JSON.parse((personaData[ppj][5] || '[]').toString()); // Col F: AxisVerdicts
        } catch (ppJsonErr) { /* malformed JSON — skip verdicts for this member */ }
        personaProfileMap[ppMemberId] = {
          archetypeName    : (personaData[ppj][2] || '').toString(),  // Col C
          archetypeTagline : (personaData[ppj][4] || '').toString(),  // Col E
          axisVerdicts     : ppAxisVerdicts
        };
      }

      // Build a book metadata map: bookId → { title, pages, genre, addedBy, coverImageURL }
      // Used by insight checks that reference book page counts, genres, and metadata gaps.
      // addedBy (Col F, index 5)  — identifies books this member added; only they are
      //                             shown BOOK_MISSING_GENRE / BOOK_MISSING_COVER tasks
      //                             for books they didn't add (avoids assigning tasks for
      //                             other people's books).
      // coverImageURL (Col J, index 9) — blank = BOOK_MISSING_COVER candidate.
      var insightBookMetaMap = {};
      for (var ibm = 1; ibm < libraryData.length; ibm++) {
        var ibmId = (libraryData[ibm][0] || '').toString();
        if (ibmId) {
          insightBookMetaMap[ibmId] = {
            title         : (libraryData[ibm][1] || '').toString(),
            pages         : Number(libraryData[ibm][4]) || 0,
            genre         : (libraryData[ibm][3] || '').toString(),
            addedBy       : (libraryData[ibm][5] || '').toString(),   // Col F — who added this book
            coverImageURL : (libraryData[ibm][9] || '').toString()    // Col J — blank = no cover
          };
        }
      }

      for (var ii = 1; ii < memData.length; ii++) {
        var iMemberId = (memData[ii][0] || '').toString();
        if (!iMemberId) continue;

        // No activity gate for the insight/task pass — unlike the badge pass,
        // insight chips and coach tasks must always reflect current shelf state.
        // A member who hasn't opened the app recently may still have unresolved
        // tasks (unrated books, stale shelf records) that should be waiting for
        // them when they return. The insight pass is pure in-memory computation
        // with no API calls, so running it for all members is negligible cost.

        try {
          // Col D (index 3) is DisplayName — passed to the AI for personalised tone.
          var iDisplayName = (memData[ii][3] || '').toString().trim();
          var insightJson  = generateMemberCoachInsights_(
            iMemberId,
            iDisplayName,
            pageLogData,
            shelfData,
            insightBookMetaMap,
            challengeData,
            enrollmentData,
            badgeAwardData,
            (memData[ii][18] || '').toString(),  // existing Col S JSON — preserves aiAdvice and aiFingerprint
            (memData[ii][10] || '').toString(),  // Col K: FavGenre — member-defined favourite genre tags
            (memData[ii][11] || '').toString(),  // Col L: ReadingGoal — member's stated reading goal (free text)
            (memData[ii][6]  || '').toString(),  // Col G: ShortBio — profile bio (free text)
            personaProfileMap[iMemberId] || null,// PersonaProfileDB row for this member, or null
            badgeTierMap,                        // pre-built { category → { tier → { badgeId, caption } } }
            Number(memData[ii][14]) || 0,        // Col O: TotalClubPoints — current lifetime CP
            levelRules                           // [{ maxClubPoints, levelName }] from ClubPointLevelDB
          );
          // Ensure row is wide enough for Col S (index 18) before writing.
          while (memData[ii].length < MEMBER_DB_TARGET_COL_COUNT) memData[ii].push('');
          memData[ii][18] = insightJson;
          changesMade = true;
          // No sleep here — Gemini calls happen in ArkaAIPass, not MasterEngine.
          // MasterEngine runs at full speed and signals completion via PropertiesService.
        } catch (memberInsightErr) {
          console.warn('Insight engine: skipped member ' + iMemberId + ' — ' + memberInsightErr.toString());
        }
      }
    } catch (insightPassErr) {
      console.error('Insight engine pass failed entirely (non-fatal): ' + insightPassErr.toString());
    }

    // Pad ALL memData rows (including any not processed above) to the target
    // column count so setValues doesn't write ragged rows to the sheet.
    for (var padRow = 1; padRow < memData.length; padRow++) {
      while (memData[padRow].length < MEMBER_DB_TARGET_COL_COUNT) memData[padRow].push('');
    }

    // ── 6. BATCH WRITE BACK TO GOOGLE SHEETS ──────────────────────────────
    if (changesMade || finalActivityLogsToPush.length > 0) {

      if (changesMade) {
        // Start from row 2 to skip the header row — writes only the data portion.
        // Writing from row 1 would risk overwriting the header if memData[0]
        // ever diverges from the live sheet schema (e.g., after a column addition).
        memSheet.getRange(2, 1, memData.length - 1, memData[0].length)
                .setValues(memData.slice(1));
      }

      if (finalActivityLogsToPush.length > 0) {
        const startRow = activityData.length + 1;
        ss.getSheetByName('ActivityLogDB').getRange(
          startRow, 1,
          finalActivityLogsToPush.length,
          finalActivityLogsToPush[0].length
        ).setValues(finalActivityLogsToPush);
      }

      // Write new auto-awarded badge rows to BadgeAwardDB
      if (badgeAwardsToPush.length > 0) {
        const awardStartRow = badgeAwardData.length + 1;
        ss.getSheetByName(BADGE_AWARD_DB_SHEET_NAME).getRange(
          awardStartRow, 1,
          badgeAwardsToPush.length,
          badgeAwardsToPush[0].length
        ).setValues(badgeAwardsToPush);
        invalidateCacheKey(MASTER_CACHE_KEYS.badgeAwards);
        console.log('Badge awards written: ' + badgeAwardsToPush.length + '. BadgeAwardDB cache invalidated.');
      }

      console.log(
        `Sync complete. Changes written to MemberDB: ${changesMade}. ` +
        `New activity log rows: ${finalActivityLogsToPush.length}. ` +
        `Rule 5 boundary was row index ${lastMasterSyncIdx} ` +
        `(${activityData.length - 1 - lastMasterSyncIdx} entries in scope for cpAwarded validation) ` +
        `(0 = first ever run, all entries verified).`
      );

    } else {
      console.log("Database is perfectly in sync. No actions required.");
    }

  } catch (error) {
    console.error("CRITICAL ERROR during sync: " + error.message);
  } finally {
    lock.releaseLock();
  }

  // ── Post-sync: populate QuotesDB from BookPostDB ─────────────────────────
  // Runs AFTER the main lock is released — it has its own internal guard.
  // Non-fatal: a failure here must never surface to the trigger runner.
  try {
    syncQuotesFromBookPosts_();
  } catch (quoteSyncErr) {
    console.error('syncAllMemberStats: quote sync failed (non-fatal):', quoteSyncErr);
  }

  // ── Signal ArkaAIPass that fresh insights are ready ───────────────────────
  // Written last — after the MemberDB batch write and quote sync are both
  // complete — so ArkaAIPass never reads a half-written MemberDB.
  // ArkaAIPass is scheduled at 00:10 and checks this flag before processing.
  try {
    PropertiesService.getScriptProperties().setProperty(AIPASS_READY_FLAG_KEY, 'true');
    console.log('syncAllMemberStats: ARKAAIPASS_READY flag set — ArkaAIPass will run shortly.');
  } catch (flagErr) {
    console.warn('syncAllMemberStats: could not set ARKAAIPASS_READY flag (non-fatal):', flagErr);
  }

  // ── Signal ArkaPersonaPass that the club state is settled ─────────────────
  // Persona compute reads the full PageLog/Shelf/Library; gating it behind this
  // flag guarantees it never reads a half-written MemberDB. Independent of the
  // AI-pass flag so either pass can be disabled without affecting the other.
  try {
    PropertiesService.getScriptProperties().setProperty('ARKAPERSONAPASS_READY', 'true');
    console.log('syncAllMemberStats: ARKAPERSONAPASS_READY flag set — PersonaPass will run shortly.');
  } catch (personaFlagErr) {
    console.warn('syncAllMemberStats: could not set ARKAPERSONAPASS_READY flag (non-fatal):', personaFlagErr);
  }

  // ── Build tonight's email queue ────────────────────────────────────────────
  // Runs after all MemberDB/ActivityLogDB writes are committed and the main
  // lock is released — queue reflects the fully settled club state.
  // Non-fatal: a queue failure must never surface as a trigger crash.
  try {
    _syncEmailQueue_();
  } catch (emailQueueErr) {
    console.error('syncAllMemberStats: _syncEmailQueue_ failed (non-fatal):', emailQueueErr);
  }

  // ── Signal ArkaEmailPass that tonight's queue is ready ────────────────────
  // Set AFTER _syncEmailQueue_() completes so ArkaEmailPass (scheduled 00:30)
  // never reads a partially-written EmailQueueDB. Even if _syncEmailQueue_
  // threw above, we still set the flag — ArkaEmailPass will find 0 PENDING
  // rows and exit cleanly rather than crashing the trigger.
  try {
    PropertiesService.getScriptProperties().setProperty(EMAILPASS_READY_FLAG_KEY, 'true');
    console.log('syncAllMemberStats: ARKAEMAILPASS_READY flag set — ArkaEmailPass will process queue at 11:30.');
  } catch (emailFlagErr) {
    console.warn('syncAllMemberStats: could not set ARKAEMAILPASS_READY flag (non-fatal):', emailFlagErr);
  }
}

// ============================================================================
// QUOTES DB SYNC
// Nightly job that mirrors 'Quote I Loved' posts from BookPostDB into QuotesDB.
//
// QuotesDB column layout:
//   Col A — quote text (the post content)
//   Col B — book title  (resolved from ArkaLibraryDB via bookId)
//   Col C — author name (resolved from ArkaLibraryDB via bookId)
//   Col D — sourcePostId (ARKA_BOOKPOST_X — used for exact matching on deletion;
//                         blank for manually curated rows which are never touched)
//
// Rules:
//   1. Only 'Quote I Loved' posts with status 'Active' are eligible.
//   2. If an eligible post is not yet in QuotesDB (matched by Col D) → append it.
//   3. If a post is in QuotesDB (matched by Col D) but is now 'Deleted' → remove row.
//   4. Rows with a blank Col D are manually curated — never touched by this function.
//   5. Book title and author are resolved once from ArkaLibraryDB; if a bookId is
//      not found (e.g. book was deleted), the post is skipped rather than appending
//      a row with blank metadata.
// ============================================================================

/**
 * PRIVATE — Syncs 'Quote I Loved' posts from BookPostDB into QuotesDB.
 * Appends new active quotes and removes rows whose source post was deleted.
 * Manually curated rows (blank Col D / sourcePostId) are never touched.
 *
 * Called nightly by syncAllMemberStats() after the main lock is released.
 * Can also be triggered manually via the Apps Script editor for backfill.
 */
function syncQuotesFromBookPosts_() {

  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  // ── 1. Load ArkaLibraryDB → bookId lookup map ─────────────────────────────
  var librarySheet = ss.getSheetByName(LIBRARY_SHEET_NAME);
  if (!librarySheet) {
    console.warn('syncQuotesFromBookPosts_: ArkaLibraryDB not found. Skipping.');
    return;
  }
  var libraryData = librarySheet.getDataRange().getValues();

  // Build: bookId (Col A, index 0) → { title: Col B (index 1), author: Col C (index 2) }
  var bookMetaMap = {};
  for (var li = 1; li < libraryData.length; li++) {
    var bookId = (libraryData[li][0] || '').toString().trim();
    if (!bookId) continue;
    bookMetaMap[bookId] = {
      title  : (libraryData[li][1] || '').toString().trim(),
      author : (libraryData[li][2] || '').toString().trim()
    };
  }

  // ── 2. Load BookPostDB — collect all 'Quote I Loved' posts ───────────────
  var postSheet = ss.getSheetByName(BOOK_POST_SHEET_NAME);
  if (!postSheet) {
    console.warn('syncQuotesFromBookPosts_: BookPostDB not found. Skipping.');
    return;
  }
  var postData = postSheet.getDataRange().getValues();

  // Map of postId → { content, bookId, status } for all quote posts.
  // Used both to find new additions and to validate existing QuotesDB rows.
  var quotePostMap = {}; // { postId: { content, bookId, isActive } }

  for (var pi = 1; pi < postData.length; pi++) {
    var postId   = (postData[pi][0] || '').toString().trim();
    var bookId   = (postData[pi][1] || '').toString().trim();
    var postType = (postData[pi][4] || '').toString().trim();
    var content  = (postData[pi][5] || '').toString().trim();
    var status   = (postData[pi][6] || '').toString().trim();

    if (postType !== 'Quote I Loved') continue; // Only quote posts qualify
    if (!postId || !content)          continue; // Skip malformed rows

    quotePostMap[postId] = {
      content  : content,
      bookId   : bookId,
      isActive : status === 'Active'
    };
  }

  // ── 3. Load QuotesDB — build index of existing sourcePostIds ─────────────
  var quotesSheet = ss.getSheetByName(QUOTES_SHEET_NAME);
  if (!quotesSheet) {
    console.warn('syncQuotesFromBookPosts_: QuotesDB not found. Skipping.');
    return;
  }
  var quotesData = quotesSheet.getDataRange().getValues();

  // Map: sourcePostId (Col D, index 3) → 1-based sheet row number.
  // Only rows with a non-blank Col D are tracked — manual rows are invisible to sync.
  var existingPostIdToRow = {}; // { postId: sheetRowNumber }

  for (var qi = 1; qi < quotesData.length; qi++) {
    var sourcePostId = (quotesData[qi][3] || '').toString().trim();
    if (sourcePostId) {
      existingPostIdToRow[sourcePostId] = qi + 1; // 1-based sheet row
    }
  }

  // ── 4. DELETION PASS — remove QuotesDB rows whose source post is Deleted ──
  // Collect rows to delete first, then delete bottom-up to avoid index shifting.
  var rowsToDelete = []; // 1-based sheet row numbers

  for (var postId in existingPostIdToRow) {
    if (!existingPostIdToRow.hasOwnProperty(postId)) continue;
    var post = quotePostMap[postId];

    // If the post no longer exists in BookPostDB OR its status is not Active → delete
    if (!post || !post.isActive) {
      rowsToDelete.push(existingPostIdToRow[postId]);
    }
  }

  // Sort descending so deleting row N does not shift row N-1's index
  rowsToDelete.sort(function(a, b) { return b - a; });
  rowsToDelete.forEach(function(rowNum) {
    quotesSheet.deleteRow(rowNum);
  });

  if (rowsToDelete.length > 0) {
    console.log('syncQuotesFromBookPosts_: deleted ' + rowsToDelete.length + ' stale quote row(s).');
  }

  // Re-read existingPostIdToRow after deletions so the addition pass
  // is working against a fresh state (row numbers have shifted).
  var updatedQuotesData   = quotesSheet.getDataRange().getValues();
  var updatedExistingIds  = {};
  for (var uqi = 1; uqi < updatedQuotesData.length; uqi++) {
    var updatedSourceId = (updatedQuotesData[uqi][3] || '').toString().trim();
    if (updatedSourceId) updatedExistingIds[updatedSourceId] = true;
  }

  // ── 5. ADDITION PASS — append active posts not yet in QuotesDB ───────────
  var rowsToAppend = []; // Array of 4-element arrays: [quoteText, bookTitle, author, sourcePostId]
  var skippedCount = 0;

  for (var addPostId in quotePostMap) {
    if (!quotePostMap.hasOwnProperty(addPostId)) continue;

    var addPost = quotePostMap[addPostId];
    if (!addPost.isActive)             continue; // Deleted posts are never added
    if (updatedExistingIds[addPostId]) continue; // Already in QuotesDB

    // Resolve book metadata — skip if book not found to avoid blank rows
    var bookMeta = bookMetaMap[addPost.bookId];
    if (!bookMeta || !bookMeta.title) {
      console.warn('syncQuotesFromBookPosts_: bookId "' + addPost.bookId
        + '" not found in library for post ' + addPostId + '. Skipping.');
      skippedCount++;
      continue;
    }

    rowsToAppend.push([
      addPost.content, // Col A — quote text
      bookMeta.title,  // Col B — book title
      bookMeta.author, // Col C — author
      addPostId        // Col D — sourcePostId (enables future deletion matching)
    ]);
  }

  // Batch append in a single setValues call for efficiency
  if (rowsToAppend.length > 0) {
    var appendStartRow = quotesSheet.getLastRow() + 1;
    quotesSheet.getRange(appendStartRow, 1, rowsToAppend.length, 4).setValues(rowsToAppend);
    console.log('syncQuotesFromBookPosts_: appended ' + rowsToAppend.length + ' new quote(s).');
  }

  if (skippedCount > 0) {
    console.warn('syncQuotesFromBookPosts_: skipped ' + skippedCount
      + ' quote(s) with missing book metadata.');
  }

  if (rowsToDelete.length === 0 && rowsToAppend.length === 0) {
    console.log('syncQuotesFromBookPosts_: QuotesDB already up to date. No changes made.');
  }
}


// ============================================================================
// EMAIL QUEUE SYNC
// Nightly post-sync job. Evaluates every approved member for email eligibility
// and appends PENDING rows to EmailQueueDB in the BackEndEngine spreadsheet.
// ArkaEmailPass (scheduled 00:30) reads these rows and does the actual sending.
//
// EmailQueueDB column layout (BackEndEngine spreadsheet):
//   Col A  — QueueID        (ARKA_EMAILQ_X)
//   Col B  — MemberID
//   Col C  — EmailAddress   (primary email only, no alternates)
//   Col D  — DisplayName
//   Col E  — EmailType      (STREAK_RISK, CHALLENGE_DEADLINE, FINISH_NUDGE,
//                            REENGAGEMENT_7D, REENGAGEMENT_14D, REENGAGEMENT_30D)
//   Col F  — PayloadJSON    (all data ArkaEmailPass needs — no main-sheet reads required)
//   Col G  — ScheduledDate  (dd-MMM-yyyy)
//   Col H  — Status         (PENDING → SENT / FAILED / SUPPRESSED)
//   Col I  — SentAt         (written by ArkaEmailPass)
//   Col J  — TrackingToken  (ARKA_ET_XXXXXXXX — unique per email)
//   Col K  — ClickedAt      (back-filled nightly by MasterEngine from ActivityLogDB)
//   Col L  — CampaignID     (emailtype_yyyyMMdd — for analytics slicing)
//   Col M  — CreatedAt      (when this row was written)
// ============================================================================

/**
 * _syncEmailQueue_()
 *
 * Evaluates every approved, opted-in Arka member against six email eligibility
 * conditions and appends PENDING rows to EmailQueueDB for ArkaEmailPass to send.
 * At most one email per member per night; priority order enforced below.
 *
 * Priority order (highest → lowest):
 *   1. STREAK_RISK        — active reading streak at risk of breaking
 *   2. CHALLENGE_DEADLINE — active challenge closes in ≤ N days, goal unmet
 *   3. FINISH_NUDGE       — ≤ N pages from finishing a Reading-shelf book
 *   4. REENGAGEMENT_30D   — no page log in 30+ days
 *   5. REENGAGEMENT_14D   — no page log in 14–29 days
 *   6. REENGAGEMENT_7D    — no page log in 7–13 days
 *
 * Frequency cap (default 7 days) prevents back-to-back emails to the same member.
 * Checked against the most recent PENDING or SENT row in EmailQueueDB.
 *
 * Also back-fills ClickedAt on SENT rows where ActivityLogDB contains a matching
 * ARKA_ACTTYP_EMAIL_CLICK entry (written by the member app on link-open).
 *
 * @private
 */
function _syncEmailQueue_() {
  var NOW        = new Date();
  var NOW_MS     = NOW.getTime();
  var MS_PER_DAY = 86400000; // milliseconds per day

  console.log('_syncEmailQueue_: starting.');

  // ── 1. Open spreadsheets ──────────────────────────────────────────────────
  var mainSs    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var backendSs = SpreadsheetApp.openById(EMAIL_BACKEND_SPREADSHEET_ID);

  // ── 2. Load BackEndConfigDB — thresholds and kill switch ─────────────────
  var configSheet = backendSs.getSheetByName('BackEndConfigDB');
  if (!configSheet) {
    console.warn('_syncEmailQueue_: BackEndConfigDB not found — aborting email queue pass.');
    return;
  }
  var configData = configSheet.getDataRange().getValues();
  // Build key → value map from rows (row 1 = header, data from row 2)
  var cfg = {};
  for (var ci = 1; ci < configData.length; ci++) {
    var cfgKey = (configData[ci][0] || '').toString().trim();
    if (cfgKey) cfg[cfgKey] = configData[ci][1];
  }

  // Kill switch: EMAIL_QUEUE_ENABLED = false stops all queue writes tonight.
  if (cfg['EMAIL_QUEUE_ENABLED'] === false || cfg['EMAIL_QUEUE_ENABLED'] === 'false') {
    console.log('_syncEmailQueue_: EMAIL_QUEUE_ENABLED=false — skipping.');
    return;
  }

  // Read thresholds with safe defaults.
  var freqCapDays            = Number(cfg['EMAIL_FREQ_CAP_DAYS'])              || 7;
  var streakEnabled          = cfg['STREAK_RISK_ENABLED']         !== 'false';
  var streakMinWeeks         = Number(cfg['STREAK_RISK_MIN_STREAK_WEEKS'])     || 3;
  var streakMinDays          = Number(cfg['STREAK_RISK_MIN_DAYS_SINCE_LOG'])   || 5;
  var challengeEnabled       = cfg['CHALLENGE_DEADLINE_ENABLED']  !== 'false';
  var challengeMaxDaysLeft   = Number(cfg['CHALLENGE_DEADLINE_MAX_DAYS_LEFT']) || 3;
  var finishEnabled          = cfg['FINISH_NUDGE_ENABLED']        !== 'false';
  var finishMaxPagesLeft     = Number(cfg['FINISH_NUDGE_MAX_PAGES_LEFT'])      || 50;
  var finishMinDays          = Number(cfg['FINISH_NUDGE_MIN_DAYS_SINCE_LOG'])  || 4;
  var reengagement7dEnabled  = cfg['REENGAGEMENT_7D_ENABLED']     !== 'false';
  var reengagement14dEnabled = cfg['REENGAGEMENT_14D_ENABLED']    !== 'false';
  var reengagement30dEnabled = cfg['REENGAGEMENT_30D_ENABLED']    !== 'false';

  // ── 3. Load EmailQueueDB — frequency cap map + next ID counter ───────────
  var queueSheet = backendSs.getSheetByName('EmailQueueDB');
  if (!queueSheet) {
    console.warn('_syncEmailQueue_: EmailQueueDB not found — aborting.');
    return;
  }
  var queueData = queueSheet.getDataRange().getValues();

  // EmailQueueDB column indices (0-based)
  var Q_COL_QUEUE_ID       = 0;  // A
  var Q_COL_MEMBER_ID      = 1;  // B
  var Q_COL_EMAIL_TYPE     = 4;  // E
  var Q_COL_STATUS         = 7;  // H
  var Q_COL_TRACKING_TOKEN = 9;  // J
  var Q_COL_CLICKED_AT     = 10; // K
  var Q_COL_CREATED_AT     = 12; // M

  // Build: memberId → most recent PENDING/SENT queue creation timestamp (ms)
  // FAILED rows are excluded — a failed send should not block a retry next night.
  var lastQueueMsByMember = {};
  var nextQueueIdNum = 1;

  // Also collect tracking tokens of SENT rows that still have a blank ClickedAt,
  // so we can back-fill them from ActivityLogDB below.
  var unclickedSentRows = []; // { rowIndex (1-based), trackingToken }

  for (var qi = 1; qi < queueData.length; qi++) {
    var qRow = queueData[qi];
    if (!qRow[Q_COL_QUEUE_ID]) continue;

    // Track highest queue ID to compute next available number.
    var qIdNum = parseInt((qRow[Q_COL_QUEUE_ID].toString()).replace('ARKA_EMAILQ_', ''), 10);
    if (!isNaN(qIdNum) && qIdNum >= nextQueueIdNum) nextQueueIdNum = qIdNum + 1;

    var qStatus   = (qRow[Q_COL_STATUS]    || '').toString();
    var qMemberId = (qRow[Q_COL_MEMBER_ID] || '').toString();
    var qCreatedRaw = qRow[Q_COL_CREATED_AT];
    var qCreatedMs  = qCreatedRaw instanceof Date
      ? qCreatedRaw.getTime()
      : parseArkaDateString_((qCreatedRaw || '').toString()).getTime();

    if ((qStatus === 'PENDING' || qStatus === 'SENT') && qMemberId && !isNaN(qCreatedMs)) {
      if (!lastQueueMsByMember[qMemberId] || qCreatedMs > lastQueueMsByMember[qMemberId]) {
        lastQueueMsByMember[qMemberId] = qCreatedMs;
      }
    }

    // Collect SENT rows with no ClickedAt for back-fill pass below.
    if (qStatus === 'SENT' && !(qRow[Q_COL_CLICKED_AT])) {
      var qToken = (qRow[Q_COL_TRACKING_TOKEN] || '').toString();
      if (qToken) unclickedSentRows.push({ rowIndex: qi + 1, trackingToken: qToken });
    }
  }

  // ── 4. Load all required data from the main spreadsheet ──────────────────
  var memData       = mainSs.getSheetByName(MEMBERS_SHEET_NAME).getDataRange().getValues();
  var pageLogData   = mainSs.getSheetByName('PageLogDB').getDataRange().getValues();
  var shelfData     = mainSs.getSheetByName('MemberShelfDB').getDataRange().getValues();
  var libraryData   = mainSs.getSheetByName(LIBRARY_SHEET_NAME).getDataRange().getValues();
  var challengeData = mainSs.getSheetByName(CHALLENGE_SHEET_NAME)
    ? mainSs.getSheetByName(CHALLENGE_SHEET_NAME).getDataRange().getValues() : [[]];
  var enrollData    = mainSs.getSheetByName(CHALLENGE_ENROLLMENT_SHEET_NAME)
    ? mainSs.getSheetByName(CHALLENGE_ENROLLMENT_SHEET_NAME).getDataRange().getValues() : [[]];
  var personaSheet  = mainSs.getSheetByName('PersonaProfileDB');
  var personaData   = personaSheet ? personaSheet.getDataRange().getValues() : [[]];
  var activityData  = mainSs.getSheetByName('ActivityLogDB').getDataRange().getValues();

  // ── 5. Build indexes ───────────────────────────────────────────────────────

  // MemberDB column indices (0-based) — must stay in sync with DB schema
  var MEM_COL_ID           = 0;  // A — MemberID
  var MEM_COL_EMAIL        = 1;  // B — Email (primary is first before comma)
  var MEM_COL_DISPLAY_NAME = 3;  // D — DisplayName
  var MEM_COL_LAST_ACCESS  = 12; // M — LastAccessed
  var MEM_COL_APPROVAL     = 19; // T — ApprovalStatus
  var MEM_COL_EMAIL_OPT    = 20; // U — EmailOptOut (col added as part of this feature)

  // ArkaLibraryDB: A=BookID(0), B=Title(1), C=Author(2), E=Pages(4)
  var LIB_COL_BOOK_ID    = 0;
  var LIB_COL_TITLE      = 1;
  var LIB_COL_AUTHOR     = 2;
  var LIB_COL_TOTAL_PAGES = 4;

  // Build library lookup: bookId → { title, author, totalPages }
  var libraryByBookId = {};
  for (var li = 1; li < libraryData.length; li++) {
    var libRow = libraryData[li];
    var libId  = (libRow[LIB_COL_BOOK_ID] || '').toString();
    if (!libId) continue;
    libraryByBookId[libId] = {
      title      : (libRow[LIB_COL_TITLE]       || '').toString(),
      author     : (libRow[LIB_COL_AUTHOR]       || '').toString(),
      totalPages : Number(libRow[LIB_COL_TOTAL_PAGES]) || 0
    };
  }

  // MemberShelfDB: A=ShelfID(0), B=MemberID(1), C=BookID(2), D=Status(3), J=PagesRead(9)
  var SHELF_COL_MEMBER_ID  = 1;
  var SHELF_COL_BOOK_ID    = 2;
  var SHELF_COL_STATUS     = 3;
  var SHELF_COL_PAGES_READ = 9;

  // Build reading shelf index: memberId → [{ bookId, title, author, pagesRead, totalPages, pagesLeft }]
  var readingShelfByMember = {};
  for (var si = 1; si < shelfData.length; si++) {
    var sRow    = shelfData[si];
    var sMid    = (sRow[SHELF_COL_MEMBER_ID] || '').toString();
    var sStatus = (sRow[SHELF_COL_STATUS]    || '').toString();
    if (!sMid || sStatus !== 'Reading') continue;
    var sBookId     = (sRow[SHELF_COL_BOOK_ID]    || '').toString();
    var sPagesRead  = Number(sRow[SHELF_COL_PAGES_READ]) || 0;
    var sLibMeta    = libraryByBookId[sBookId] || { title: '', author: '', totalPages: 0 };
    var sPagesLeft  = sLibMeta.totalPages > 0 ? Math.max(0, sLibMeta.totalPages - sPagesRead) : null;
    if (!readingShelfByMember[sMid]) readingShelfByMember[sMid] = [];
    readingShelfByMember[sMid].push({
      bookId    : sBookId,
      title     : sLibMeta.title,
      author    : sLibMeta.author,
      pagesRead : sPagesRead,
      totalPages: sLibMeta.totalPages,
      pagesLeft : sPagesLeft
    });
  }

  // PageLogDB: A=LogID(0), B=Timestamp(1), C=MemberID(2), E=PagesDelta(4)
  var PLOG_COL_TIMESTAMP = 1;
  var PLOG_COL_MEMBER_ID = 2;
  var PLOG_COL_PAGES     = 4;

  // Build: memberId → sorted array of log timestamps (ms), positive-delta only.
  // Last element = most recent log.
  var logTimestampsByMember = {};
  for (var pi = 1; pi < pageLogData.length; pi++) {
    var pRow  = pageLogData[pi];
    var pMid  = (pRow[PLOG_COL_MEMBER_ID] || '').toString();
    var pDelt = Number(pRow[PLOG_COL_PAGES]) || 0;
    if (!pMid || pDelt <= 0) continue;
    var pTsRaw = pRow[PLOG_COL_TIMESTAMP];
    var pTsMs  = pTsRaw instanceof Date
      ? pTsRaw.getTime()
      : parseArkaDateString_((pTsRaw || '').toString()).getTime();
    if (isNaN(pTsMs)) continue;
    if (!logTimestampsByMember[pMid]) logTimestampsByMember[pMid] = [];
    logTimestampsByMember[pMid].push(pTsMs);
  }
  // Sort ascending so last element = most recent log
  var memberIds_ = Object.keys(logTimestampsByMember);
  for (var mli = 0; mli < memberIds_.length; mli++) {
    logTimestampsByMember[memberIds_[mli]].sort(function(a, b) { return a - b; });
  }

  // PersonaProfileDB: A=MemberID(0), C=ArchetypeName(2)
  var personaByMember = {};
  for (var pp = 1; pp < personaData.length; pp++) {
    var ppMid  = (personaData[pp][0] || '').toString();
    var ppName = (personaData[pp][2] || '').toString();
    if (ppMid && ppName) personaByMember[ppMid] = ppName;
  }

  // ChallengeDB: A=ChalID(0), B=Type(1), C=Title(2), F=EndDate(5), G=GoalValue(6)
  var challengeLookup = {};
  for (var chI = 1; chI < challengeData.length; chI++) {
    var chRow    = challengeData[chI];
    var chId     = (chRow[0] || '').toString();
    if (!chId) continue;
    var chEndRaw = chRow[5];
    var chEndStr = chEndRaw instanceof Date
      ? Utilities.formatDate(chEndRaw, Session.getScriptTimeZone(), 'dd-MMM-yyyy')
      : (chEndRaw || '').toString();
    challengeLookup[chId] = {
      title    : (chRow[2] || '').toString(),
      type     : (chRow[1] || '').toString(),
      endDate  : chEndStr,
      goalValue: Number(chRow[6]) || 0
    };
  }

  // ChallengeEnrollmentDB: A=EnrollID(0), B=ChalID(1), C=MemberID(2), E=Status(4), F=Current(5), G=StateJson(6)
  // Build: memberId → highest-urgency active enrollment with unmet goal
  var urgentEnrollByMember = {};
  var COUNTABLE_CHALLENGE_TYPES = { 'BOOK_COUNT': true, 'PAGE_COUNT': true };
  for (var ei = 1; ei < enrollData.length; ei++) {
    var eRow    = enrollData[ei];
    var eMid    = (eRow[2] || '').toString();
    var eStatus = (eRow[4] || '').toString();
    if (!eMid || eStatus !== 'Active') continue;
    var eChalId = (eRow[1] || '').toString();
    var eChal   = challengeLookup[eChalId];
    if (!eChal || !COUNTABLE_CHALLENGE_TYPES[eChal.type]) continue;
    var eEndMs   = parseArkaDateString_(eChal.endDate).getTime();
    var eDaysLeft = !isNaN(eEndMs) ? Math.round((eEndMs - NOW_MS) / MS_PER_DAY) : 9999;
    if (eDaysLeft < 0 || eDaysLeft > challengeMaxDaysLeft) continue;
    var eCurrent = Number(eRow[5]) || 0;
    var eGoal    = eChal.goalValue;
    try {
      var eState = JSON.parse((eRow[6] || '{}').toString());
      if (eState.personalGoal && Number(eState.personalGoal) > 0) eGoal = Number(eState.personalGoal);
    } catch (eParsErr) { /* keep challenge default goal */ }
    if (eCurrent >= eGoal) continue; // already met goal, no nudge needed
    // Keep lowest daysLeft (most urgent) per member
    if (!urgentEnrollByMember[eMid] || eDaysLeft < urgentEnrollByMember[eMid].daysLeft) {
      urgentEnrollByMember[eMid] = {
        title   : eChal.title,
        type    : eChal.type,
        daysLeft: eDaysLeft,
        current : eCurrent,
        goal    : eGoal
      };
    }
  }

  // ── 6. Build member display name cache for club highlights ────────────────
  var displayNameById = {};
  for (var dn = 1; dn < memData.length; dn++) {
    var dnId   = (memData[dn][MEM_COL_ID]           || '').toString();
    var dnName = (memData[dn][MEM_COL_DISPLAY_NAME] || '').toString();
    if (dnId) displayNameById[dnId] = dnName;
  }

  // Build club highlights: up to 3 unique member names who finished a book
  // in the last 7 days (used in re-engagement email body).
  // ActivityLogDB: A=ActID(0), B=TypeID(1), C=Date(2), D=MemberID(3)
  var ACT_COL_TYPE      = 1;
  var ACT_COL_DATE      = 2;
  var ACT_COL_MEMBER_ID = 3;
  var ACT_COL_DESC      = 4;
  var SEVEN_DAYS_MS     = 7 * MS_PER_DAY;
  var seenHighlightNames = {};
  var clubHighlights     = []; // [{ memberDisplayName: string }]

  // ── 6b. Back-fill ClickedAt for SENT rows via ActivityLogDB ───────────────
  // When a member clicks an email link, the member app logs ARKA_ACTTYP_EMAIL_CLICK
  // with the TrackingToken as the description. We resolve those here nightly.
  var clickTokenToDateMs = {};
  for (var aci = 1; aci < activityData.length; aci++) {
    var acRow  = activityData[aci];
    var acType = (acRow[ACT_COL_TYPE] || '').toString();
    if (acType !== 'ARKA_ACTTYP_EMAIL_CLICK') {
      // While scanning, also collect recent BOOKREAD for club highlights
      if (acType === 'ARKA_ACTTYP_BOOKREAD') {
        var acDateRaw = acRow[ACT_COL_DATE];
        var acDateMs  = acDateRaw instanceof Date
          ? acDateRaw.getTime()
          : parseArkaDateString_((acDateRaw || '').toString()).getTime();
        if (!isNaN(acDateMs) && NOW_MS - acDateMs <= SEVEN_DAYS_MS) {
          var acMid  = (acRow[ACT_COL_MEMBER_ID] || '').toString();
          var acName = displayNameById[acMid] || '';
          if (acName && !seenHighlightNames[acName] && clubHighlights.length < 3) {
            seenHighlightNames[acName] = true;
            clubHighlights.push({ memberDisplayName: acName });
          }
        }
      }
      continue;
    }
    // ARKA_ACTTYP_EMAIL_CLICK row: store token → earliest click date
    var clickToken   = (acRow[ACT_COL_DESC] || '').toString().trim();
    var clickDateRaw = acRow[ACT_COL_DATE];
    var clickDateMs  = clickDateRaw instanceof Date
      ? clickDateRaw.getTime()
      : parseArkaDateString_((clickDateRaw || '').toString()).getTime();
    if (clickToken && !isNaN(clickDateMs)) {
      if (!clickTokenToDateMs[clickToken] || clickDateMs < clickTokenToDateMs[clickToken]) {
        clickTokenToDateMs[clickToken] = clickDateMs; // keep earliest click
      }
    }
  }

  // Write ClickedAt back to EmailQueueDB for any newly resolved clicks
  var clickBackFillUpdates = []; // { rowIndex (1-based), clickedAtStr }
  for (var ubI = 0; ubI < unclickedSentRows.length; ubI++) {
    var ubRow   = unclickedSentRows[ubI];
    var ubClick = clickTokenToDateMs[ubRow.trackingToken];
    if (ubClick) {
      var ubClickStr = Utilities.formatDate(new Date(ubClick), Session.getScriptTimeZone(), 'dd-MM-yyyy HH:mm:ss Z');
      clickBackFillUpdates.push({ rowIndex: ubRow.rowIndex, clickedAtStr: ubClickStr });
    }
  }
  for (var cbI = 0; cbI < clickBackFillUpdates.length; cbI++) {
    queueSheet.getRange(clickBackFillUpdates[cbI].rowIndex, Q_COL_CLICKED_AT + 1)
              .setValue(clickBackFillUpdates[cbI].clickedAtStr);
  }
  if (clickBackFillUpdates.length > 0) {
    console.log('_syncEmailQueue_: back-filled ClickedAt for ' + clickBackFillUpdates.length + ' SENT row(s).');
  }

  // ── 7. Main eligibility loop — one PENDING row per eligible member ────────
  var emailQueueRowsToPush = [];
  var todayStr = Utilities.formatDate(NOW, Session.getScriptTimeZone(), 'dd-MMM-yyyy');

  for (var mi = 1; mi < memData.length; mi++) {
    var mRow        = memData[mi];
    var memberId    = (mRow[MEM_COL_ID]           || '').toString();
    var memberEmail = (mRow[MEM_COL_EMAIL]         || '').toString().split(',')[0].trim();
    var displayName = (mRow[MEM_COL_DISPLAY_NAME] || '').toString();
    var approval    = (mRow[MEM_COL_APPROVAL]     || '').toString();

    // EmailOptOut is Col U (index 20); read safely with fallback for members
    // who pre-date the column addition.
    var emailOptOut = mRow.length > MEM_COL_EMAIL_OPT && mRow[MEM_COL_EMAIL_OPT] === true;

    // ── Gate 1: Approved members with a valid email only ─────────────────────
    if (!memberId || !memberEmail || approval !== 'Approved') continue;

    // ── Gate 2: Respect opt-out preference ───────────────────────────────────
    if (emailOptOut) continue;

    // ── Gate 3: Frequency cap — skip if emailed within freqCapDays ───────────
    var lastQueueMs = lastQueueMsByMember[memberId] || 0;
    if (lastQueueMs > 0 && (NOW_MS - lastQueueMs) < freqCapDays * MS_PER_DAY) continue;

    // ── Compute member-level signals ──────────────────────────────────────────
    var memberLogTimes   = logTimestampsByMember[memberId] || [];
    var lastLogMs        = memberLogTimes.length > 0 ? memberLogTimes[memberLogTimes.length - 1] : 0;
    var daysSinceLastLog = lastLogMs > 0
      ? Math.round((NOW_MS - lastLogMs) / MS_PER_DAY)
      : 9999; // never logged → treat as maximally dormant

    var lastAccessRaw   = mRow[MEM_COL_LAST_ACCESS];
    var lastAccessMs    = lastAccessRaw instanceof Date
      ? lastAccessRaw.getTime()
      : parseArkaDateString_((lastAccessRaw || '').toString()).getTime();
    var daysSinceAccess = !isNaN(lastAccessMs)
      ? Math.round((NOW_MS - lastAccessMs) / MS_PER_DAY)
      : 9999;

    // Streak proxy: count unique ISO weeks logged in the last 28 days.
    // A member with ≥ streakMinWeeks recent active weeks is considered to
    // have an ongoing streak that could be at risk. We don't replicate the
    // full MasterEngine streak algorithm here — this heuristic is accurate
    // enough to fire the email correctly.
    var TWENTY_EIGHT_DAYS_MS = 28 * MS_PER_DAY;
    var recentIsoWeekSet = {};
    for (var rli = 0; rli < memberLogTimes.length; rli++) {
      if (NOW_MS - memberLogTimes[rli] > TWENTY_EIGHT_DAYS_MS) continue;
      // Simple ISO week key: year + week-of-year using GAS date utils
      var logDate   = new Date(memberLogTimes[rli]);
      var jan4      = new Date(logDate.getFullYear(), 0, 4);
      var weekNum   = Math.ceil((((logDate - jan4) / 86400000) + jan4.getDay() + 1) / 7);
      var isoWkKey  = logDate.getFullYear() + '-W' + (weekNum < 10 ? '0' + weekNum : '' + weekNum);
      recentIsoWeekSet[isoWkKey] = true;
    }
    var recentWeekCount = Object.keys(recentIsoWeekSet).length;
    var hasActiveStreak = recentWeekCount >= streakMinWeeks;

    // Reading shelf: find any book close to the finish line
    var memberReadingBooks = readingShelfByMember[memberId] || [];
    var finishNudgeBook    = null;
    for (var rbi = 0; rbi < memberReadingBooks.length; rbi++) {
      var rb = memberReadingBooks[rbi];
      if (rb.pagesLeft !== null && rb.pagesLeft > 0 && rb.pagesLeft <= finishMaxPagesLeft) {
        if (!finishNudgeBook || rb.pagesLeft < finishNudgeBook.pagesLeft) finishNudgeBook = rb;
      }
    }

    // Current book for re-engagement body (first Reading-shelf entry)
    var currentBook  = memberReadingBooks.length > 0 ? memberReadingBooks[0] : null;
    var archetype    = personaByMember[memberId] || '';
    var urgentEnroll = urgentEnrollByMember[memberId] || null;

    // ── Determine email type by priority ─────────────────────────────────────
    var emailType = null;

    if (streakEnabled && hasActiveStreak && daysSinceLastLog >= streakMinDays) {
      emailType = 'STREAK_RISK';
    } else if (challengeEnabled && urgentEnroll !== null) {
      emailType = 'CHALLENGE_DEADLINE';
    } else if (finishEnabled && finishNudgeBook !== null && daysSinceLastLog >= finishMinDays) {
      emailType = 'FINISH_NUDGE';
    } else if (reengagement30dEnabled && daysSinceLastLog >= 30) {
      emailType = 'REENGAGEMENT_30D';
    } else if (reengagement14dEnabled && daysSinceLastLog >= 14) {
      emailType = 'REENGAGEMENT_14D';
    } else if (reengagement7dEnabled && daysSinceLastLog >= 7) {
      emailType = 'REENGAGEMENT_7D';
    }

    if (!emailType) continue; // no eligible condition for this member tonight

    // ── Build PayloadJSON — all data ArkaEmailPass needs for email composition.
    // ArkaEmailPass reads NO main-sheet data; everything must be pre-baked here.
    var emailPayload = {
      displayName      : displayName,
      archetype        : archetype,           // e.g. "The Midnight Scholar"
      daysSinceLastLog : daysSinceLastLog,
      daysSinceAccess  : daysSinceAccess,
      // Current reading context
      currentBookTitle : currentBook ? currentBook.title  : '',
      currentBookAuthor: currentBook ? currentBook.author : '',
      // Streak context
      recentWeekCount  : recentWeekCount,
      // Challenge context
      challengeTitle   : urgentEnroll ? urgentEnroll.title    : '',
      challengeType    : urgentEnroll ? urgentEnroll.type     : '',
      challengeDaysLeft: urgentEnroll ? urgentEnroll.daysLeft : 0,
      challengeCurrent : urgentEnroll ? urgentEnroll.current  : 0,
      challengeGoal    : urgentEnroll ? urgentEnroll.goal     : 0,
      // Finish nudge context
      finishBookTitle  : finishNudgeBook ? finishNudgeBook.title     : '',
      finishBookAuthor : finishNudgeBook ? finishNudgeBook.author    : '',
      finishPagesLeft  : finishNudgeBook ? finishNudgeBook.pagesLeft : 0,
      // Club social proof (for re-engagement body)
      clubHighlights   : clubHighlights   // [{ memberDisplayName }]
    };

    // ── Generate tracking token (unique per email send) ───────────────────────
    // Format: ARKA_ET_ + 8 random alphanumeric chars (~2.8 trillion combinations).
    var trackingToken = 'ARKA_ET_' + Math.random().toString(36).slice(2, 10).toUpperCase();

    // ── CampaignID for analytics slicing in EmailSentLogDB ───────────────────
    var campaignId = emailType.toLowerCase().replace(/_/g, '-') + '_' +
      Utilities.formatDate(NOW, Session.getScriptTimeZone(), 'yyyyMMdd');

    // ── Build queue row ────────────────────────────────────────────────────────
    var queueId = 'ARKA_EMAILQ_' + nextQueueIdNum;
    nextQueueIdNum++;

    emailQueueRowsToPush.push([
      queueId,                          // A — QueueID
      memberId,                         // B — MemberID
      memberEmail,                      // C — EmailAddress (primary only)
      displayName,                      // D — DisplayName
      emailType,                        // E — EmailType
      JSON.stringify(emailPayload),     // F — PayloadJSON
      todayStr,                         // G — ScheduledDate
      'PENDING',                        // H — Status
      '',                               // I — SentAt (written by ArkaEmailPass)
      trackingToken,                    // J — TrackingToken
      '',                               // K — ClickedAt (back-filled nightly)
      campaignId,                       // L — CampaignID
      Utilities.formatDate(NOW, Session.getScriptTimeZone(), 'dd-MM-yyyy HH:mm:ss Z') // M — CreatedAt
    ]);
  }

  // ── 8. Batch append PENDING rows to EmailQueueDB ──────────────────────────
  if (emailQueueRowsToPush.length > 0) {
    var appendRow = queueSheet.getLastRow() + 1;
    queueSheet.getRange(appendRow, 1, emailQueueRowsToPush.length, emailQueueRowsToPush[0].length)
              .setValues(emailQueueRowsToPush);
    console.log('_syncEmailQueue_: appended ' + emailQueueRowsToPush.length + ' PENDING rows to EmailQueueDB.');
  } else {
    console.log('_syncEmailQueue_: no members eligible for an email tonight.');
  }
}

// ============================================================================
// ANNIVERSARY BACKFILL
// One-time admin-triggered function to retroactively award all qualifying
// anniversary badges to existing members based on their JoinDate.
// Idempotent — safe to run multiple times; the existingActiveBadgeSet guard
// in autoAwardBadge_() prevents duplicate awards.
// ============================================================================

/**
 * Awards all qualifying ANNIVERSARY badges to every member who has passed
 * an anniversary threshold, subject to the 7-day activity gate.
 * Run this once after deploying the badge system; thereafter, the nightly
 * syncAllMemberStats() handles new anniversary crossings automatically.
 *
 * TRIGGER: Run manually via Apps Script editor → Run → runAnniversaryBackfill
 */
function runAnniversaryBackfill() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    console.error('runAnniversaryBackfill: DB busy, aborting.');
    return;
  }

  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    const memSheet      = ss.getSheetByName(MEMBERS_SHEET_NAME);
    const memData       = memSheet.getDataRange().getValues();
    const badgeSheet    = ss.getSheetByName(BADGE_DB_SHEET_NAME);
    const badgeAwardSheet = ss.getSheetByName(BADGE_AWARD_DB_SHEET_NAME);

    const badgeData      = badgeSheet      ? badgeSheet.getDataRange().getValues()      : [[]];
    const badgeAwardData = badgeAwardSheet ? badgeAwardSheet.getDataRange().getValues() : [[]];

    // Load ActivityLogDB to determine next activity ID
    const activitySheet = ss.getSheetByName('ActivityLogDB');
    const activityData  = activitySheet.getDataRange().getValues();

    const badgeTierMap = buildBadgeTierMap_(badgeData);

    // Build member row index map for Col N cache updates
    var memberRowIndexMap = {};
    for (var mi = 1; mi < memData.length; mi++) {
      var mid = (memData[mi][0] || '').toString();
      if (mid) memberRowIndexMap[mid] = mi;
    }

    // Build existing active badge set
    var existingActiveBadgeSet = {};
    var newAwardNum = 1;
    if (badgeAwardData.length > 1) {
      var lastId  = (badgeAwardData[badgeAwardData.length - 1][0] || '').toString();
      var lastNum = parseInt(lastId.split('_')[2], 10);
      if (!isNaN(lastNum)) newAwardNum = lastNum + 1;
    }
    for (var bi = 1; bi < badgeAwardData.length; bi++) {
      if ((badgeAwardData[bi][5] || '').toString() === 'Active') {
        existingActiveBadgeSet[badgeAwardData[bi][2].toString() + '_' + badgeAwardData[bi][1].toString()] = true;
      }
    }

    // Determine next activity ID number
    var newActNum = 1;
    if (activityData.length > 1) {
      var lastActId  = (activityData[activityData.length - 1][0] || '').toString();
      var lastActNum = parseInt(lastActId.split('_')[2], 10);
      if (!isNaN(lastActNum)) newActNum = lastActNum + 1;
    }

    const activityDate = Utilities.formatDate(
      new Date(), Session.getScriptTimeZone(), 'dd-MM-yyyy HH:mm:ss Z'
    );

    var badgeAwardsToPush       = [];
    var finalActivityLogsToPush = [];
    var counters = { actNum: newActNum, awardNum: newAwardNum };

    for (var i = 1; i < memData.length; i++) {
      var memberId = (memData[i][0] || '').toString();
      if (!memberId) continue;

      // Activity gate: skip members who haven't logged in within 7 days.
      // parseArkaDateString_ handles the "dd-MM-yyyy HH:mm:ss Z" format that
      // new Date() rejects in GAS V8, preventing the gate from always returning 9999.
      var lastAccessed    = parseArkaDateString_(memData[i][12]); // Col M
      var daysSinceAccess = !isNaN(lastAccessed.getTime())
        ? (new Date() - lastAccessed) / (1000 * 60 * 60 * 24)
        : 9999;
      if (daysSinceAccess > 7) continue;

      var joinDateRaw = memData[i][4]; // Col E: JoinDate
      var joinDate    = joinDateRaw ? parseArkaDateString_(joinDateRaw) : null;
      if (!joinDate || isNaN(joinDate.getTime())) continue;

      var yearsAsMember = (new Date() - joinDate) / (1000 * 60 * 60 * 24 * 365.25);
      var annThresholds = BADGE_THRESHOLDS.ANNIVERSARY;

      for (var ant = 0; ant < annThresholds.length; ant++) {
        if (yearsAsMember >= annThresholds[ant]) {
          var annConfig = badgeTierMap['ANNIVERSARY'] && badgeTierMap['ANNIVERSARY'][ant + 1];
          if (annConfig) {
            autoAwardBadge_(
              memberId, annConfig.badgeId, annConfig.badgePoints, annConfig.caption || '', activityDate,
              existingActiveBadgeSet, badgeAwardsToPush, finalActivityLogsToPush,
              memberRowIndexMap, memData, counters
            );
          }
        }
      }
    }

    // Batch write results
    if (badgeAwardsToPush.length > 0) {
      badgeAwardSheet.getRange(
        badgeAwardData.length + 1, 1,
        badgeAwardsToPush.length, 7
      ).setValues(badgeAwardsToPush);
      invalidateCacheKey(MASTER_CACHE_KEYS.badgeAwards);
    }

    if (finalActivityLogsToPush.length > 0) {
      activitySheet.getRange(
        activityData.length + 1, 1,
        finalActivityLogsToPush.length, 7
      ).setValues(finalActivityLogsToPush);
    }

    // Write updated MemberDB Col N back to sheet
    if (badgeAwardsToPush.length > 0) {
      memSheet.getRange(2, 1, memData.length - 1, memData[0].length).setValues(memData.slice(1));
    }

    console.log('runAnniversaryBackfill complete. Awards written: ' + badgeAwardsToPush.length);

  } catch (e) {
    console.error('runAnniversaryBackfill FAILED: ' + e.message);
  } finally {
    lock.releaseLock();
  }
}


// ============================================================================
// YEAR-END BADGE PASS
// Admin-triggered once per year (Jan 1–7) to award the five yearly badges:
// Critic of the Year, Master Rater, Marathon Reader, Bookworm of the Year,
// Page Master of the Year.
// Ties result in co-awards. Minimum thresholds apply per category.
// Yearly badges for prior years are not awarded by this function — use the
// admin Award Badge flow for retroactive historical year awards.
// ============================================================================

/**
 * Awards the five yearly badges for the given calendar year.
 * Looks up badge IDs from BadgeDB by category='YEARLY' and badgeMeta='YYYY|TYPE_CODE'.
 *
 * @param {number} year - The calendar year to evaluate, e.g. 2025
 *
 * TRIGGER: Run manually via Apps Script editor each January.
 * Example: runYearEndBadgePass(2025)
 */
function runYearEndBadgePass(year) {
  if (!year || isNaN(year)) {
    console.error('runYearEndBadgePass: year parameter is required. Example: runYearEndBadgePass(2025)');
    return;
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    console.error('runYearEndBadgePass: DB busy, aborting.');
    return;
  }

  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    const memSheet        = ss.getSheetByName(MEMBERS_SHEET_NAME);
    const badgeSheet      = ss.getSheetByName(BADGE_DB_SHEET_NAME);
    const badgeAwardSheet = ss.getSheetByName(BADGE_AWARD_DB_SHEET_NAME);
    const activitySheet   = ss.getSheetByName('ActivityLogDB');
    const pageLogSheet    = ss.getSheetByName('PageLogDB');
    const shelfSheet      = ss.getSheetByName('MemberShelfDB');

    const memData        = memSheet.getDataRange().getValues();
    const badgeData      = badgeSheet      ? badgeSheet.getDataRange().getValues()      : [[]];
    const badgeAwardData = badgeAwardSheet ? badgeAwardSheet.getDataRange().getValues() : [[]];
    const activityData   = activitySheet.getDataRange().getValues();
    const pageLogData    = pageLogSheet.getDataRange().getValues();
    const shelfData      = shelfSheet.getDataRange().getValues();

    // ── Build yearly badge lookup: typeCode → { badgeId, badgePoints } ────
    var yearlyBadgeMap = {}; // { 'CRITIC_OF_YEAR': { badgeId, badgePoints }, ... }
    var yearPrefix     = year.toString() + '|';
    for (var bdi = 1; bdi < badgeData.length; bdi++) {
      if ((badgeData[bdi][5] || '').toString() !== 'YEARLY') continue;
      var bMeta = (badgeData[bdi][7] || '').toString();
      if (bMeta.indexOf(yearPrefix) !== 0) continue;
      var typeCode = bMeta.substring(yearPrefix.length);
      yearlyBadgeMap[typeCode] = {
        badgeId    : badgeData[bdi][0].toString(),
        badgePoints: Number(badgeData[bdi][4]) || 0
      };
    }

    if (Object.keys(yearlyBadgeMap).length === 0) {
      console.warn('runYearEndBadgePass: No YEARLY badges found in BadgeDB for year ' + year +
                   '. Add them first via admin → Add Badge.');
      return;
    }

    // ── Collect per-member metrics for the target year ─────────────────
    var memberReviews  = {};  // { memberId: reviewCount }
    var memberRatings  = {};  // { memberId: ratingCount }
    for (var ai = 1; ai < activityData.length; ai++) {
      var aType = (activityData[ai][1] || '').toString();
      var aMid  = (activityData[ai][3] || '').toString();
      if (!aMid) continue;
      // parseArkaDateString_ handles "dd-MM-yyyy HH:mm:ss Z" — new Date() returns NaN for this format.
      var aDate = parseArkaDateString_(activityData[ai][2]);
      if (isNaN(aDate.getTime()) || aDate.getFullYear() !== year) continue;
      if (aType === 'ARKA_ACTTYP_BOOKREVIEW') {
        memberReviews[aMid] = (memberReviews[aMid] || 0) + 1;
      }
      if (aType === 'ARKA_ACTTYP_BOOKRATING') {
        memberRatings[aMid] = (memberRatings[aMid] || 0) + 1;
      }
    }

    // Books finished in the target year — keyed by DateFinished (Col I, index 8)
    var memberBooksFinished = {};  // { memberId: count }
    for (var si = 1; si < shelfData.length; si++) {
      if ((shelfData[si][3] || '').toString() !== 'Finished') continue;
      var sMid          = (shelfData[si][1] || '').toString();
      // parseArkaDateString_ handles both native Date objects and "dd-MMM-yyyy" strings
      // from MemberShelfDB Col I — safer than new Date() across GAS runtime versions.
      var sDateFinished = parseArkaDateString_(shelfData[si][8]); // Col I
      if (!sMid || isNaN(sDateFinished.getTime())) continue;
      if (sDateFinished.getFullYear() !== year) continue;
      memberBooksFinished[sMid] = (memberBooksFinished[sMid] || 0) + 1;
    }

    // Pages read in the target year + per-member page logs for streak calculation
    var memberPages       = {};  // { memberId: totalPages }
    var memberPageLogsMap = {};  // { memberId: [{ timestamp, pagesDelta }] }
    for (var pi = 1; pi < pageLogData.length; pi++) {
      var pMid   = (pageLogData[pi][2] || '').toString();
      // parseArkaDateString_ handles "dd-MM-yyyy HH:mm:ss Z" — new Date() returns NaN for this format,
      // silently excluding all page logs and zeroing year-page totals and streak calculations.
      var pDate  = parseArkaDateString_(pageLogData[pi][1]);
      var pDelta = Number(pageLogData[pi][4]) || 0;
      if (!pMid || isNaN(pDate.getTime())) continue;
      if (!memberPageLogsMap[pMid]) memberPageLogsMap[pMid] = [];
      memberPageLogsMap[pMid].push({ timestamp: pDate.toISOString(), pagesDelta: pDelta });
      if (pDate.getFullYear() !== year) continue;
      if (pDelta > 0) memberPages[pMid] = (memberPages[pMid] || 0) + pDelta;
    }

    // Best streak within the target year only — filter logs to year before computing
    var memberYearStreak = {};  // { memberId: bestStreakWithinYear }
    for (var mKey in memberPageLogsMap) {
      if (!memberPageLogsMap.hasOwnProperty(mKey)) continue;
      var yearLogs = memberPageLogsMap[mKey].filter(function(log) {
        return new Date(log.timestamp).getFullYear() === year;
      });
      memberYearStreak[mKey] = computeAllTimeBestStreak_(yearLogs);
    }

    // ── Find winners (highest value, above minimum threshold, ties co-awarded) ──
    function findWinners_(metricMap, minThreshold) {
      var maxVal   = minThreshold - 1; // start below threshold so default is "no winner"
      var winners  = [];
      for (var k in metricMap) {
        if (!metricMap.hasOwnProperty(k)) continue;
        if (metricMap[k] > maxVal) { maxVal = metricMap[k]; winners = [k]; }
        else if (metricMap[k] === maxVal) { winners.push(k); }
      }
      return maxVal >= minThreshold ? winners : [];
    }

    var winnerMap = {
      CRITIC_OF_YEAR      : findWinners_(memberReviews,      YEARLY_MIN_THRESHOLDS.CRITIC_OF_YEAR),
      MASTER_RATER        : findWinners_(memberRatings,       YEARLY_MIN_THRESHOLDS.MASTER_RATER),
      MARATHON_READER     : findWinners_(memberYearStreak,    YEARLY_MIN_THRESHOLDS.MARATHON_READER),
      BOOK_COLLECTOR      : findWinners_(memberBooksFinished, YEARLY_MIN_THRESHOLDS.BOOK_COLLECTOR),
      PAGE_TURNER         : findWinners_(memberPages,         YEARLY_MIN_THRESHOLDS.PAGE_TURNER)
    };

    // ── Award badges to winners ─────────────────────────────────────────
    // Build state objects
    var memberRowIndexMap = {};
    for (var mri = 1; mri < memData.length; mri++) {
      var rmid = (memData[mri][0] || '').toString();
      if (rmid) memberRowIndexMap[rmid] = mri;
    }

    var existingActiveBadgeSet = {};
    var newAwardNum = 1;
    if (badgeAwardData.length > 1) {
      var lastId  = (badgeAwardData[badgeAwardData.length - 1][0] || '').toString();
      var lastNum = parseInt(lastId.split('_')[2], 10);
      if (!isNaN(lastNum)) newAwardNum = lastNum + 1;
    }
    for (var ebi = 1; ebi < badgeAwardData.length; ebi++) {
      if ((badgeAwardData[ebi][5] || '').toString() === 'Active') {
        existingActiveBadgeSet[badgeAwardData[ebi][2].toString() + '_' + badgeAwardData[ebi][1].toString()] = true;
      }
    }

    var newActNum = 1;
    if (activityData.length > 1) {
      var lastActId  = (activityData[activityData.length - 1][0] || '').toString();
      var lastActNum = parseInt(lastActId.split('_')[2], 10);
      if (!isNaN(lastActNum)) newActNum = lastActNum + 1;
    }

    const activityDate = Utilities.formatDate(
      new Date(), Session.getScriptTimeZone(), 'dd-MM-yyyy HH:mm:ss Z'
    );

    var badgeAwardsToPush       = [];
    var finalActivityLogsToPush = [];
    var counters = { actNum: newActNum, awardNum: newAwardNum };

    for (var typeCode in winnerMap) {
      if (!winnerMap.hasOwnProperty(typeCode)) continue;
      var badge   = yearlyBadgeMap[typeCode];
      if (!badge) {
        console.warn('runYearEndBadgePass: No BadgeDB entry found for type ' + typeCode + ' year ' + year);
        continue;
      }
      var winners = winnerMap[typeCode];
      for (var wi = 0; wi < winners.length; wi++) {
        autoAwardBadge_(
          winners[wi], badge.badgeId, badge.badgePoints, activityDate,
          existingActiveBadgeSet, badgeAwardsToPush, finalActivityLogsToPush,
          memberRowIndexMap, memData, counters
        );
      }
      console.log(typeCode + ' ' + year + ' winners: ' + (winners.length > 0 ? winners.join(', ') : 'none (threshold not met)'));
    }

    // ── Batch write ─────────────────────────────────────────────────────
    if (badgeAwardsToPush.length > 0) {
      badgeAwardSheet.getRange(
        badgeAwardData.length + 1, 1,
        badgeAwardsToPush.length, 7
      ).setValues(badgeAwardsToPush);
      invalidateCacheKey(MASTER_CACHE_KEYS.badgeAwards);
    }

    if (finalActivityLogsToPush.length > 0) {
      activitySheet.getRange(
        activityData.length + 1, 1,
        finalActivityLogsToPush.length, 7
      ).setValues(finalActivityLogsToPush);
    }

    if (badgeAwardsToPush.length > 0) {
      memSheet.getRange(2, 1, memData.length - 1, memData[0].length).setValues(memData.slice(1));

    }

    console.log('runYearEndBadgePass(' + year + ') complete. Awards written: ' + badgeAwardsToPush.length);

  } catch (e) {
    console.error('runYearEndBadgePass FAILED: ' + e.message);
  } finally {
    lock.releaseLock();
  }
}

/**
 * generateMemberCoachInsights_()
 *
 * Computes a prioritised set of reading life insights for one member and
 * returns them as a JSON string for storage in MemberDB Col S (CoachInsights).
 *
 * Insight priority order (first match wins per category):
 *   URGENCY tier  — LONG_ABSENCE, CHALLENGE_DEADLINE
 *   WARNING tier  — PACE_DOWN, DNF_RECENT
 *   POSITIVE tier — PACE_UP, STREAK_NEAR_BEST, BOOK_ALMOST_DONE
 *   NUDGE tier    — BADGE_BOOK_CLOSE, NO_CURRENT_BOOK, GENRE_RUT,
 *                   YEARLY_PACE_BEHIND, YEARLY_PACE_AHEAD
 *
 * Up to 4 insights are stored (one per tier). The frontend renders the
 * highest-priority ones in the Arka Coach section.
 *
 * When GEMINI_COACH_ENABLED is true, also calls callGeminiCoach_() to
 * generate a short personalised AI advice paragraph stored as aiAdvice.
 * The AI call is non-fatal — insight data is always written even if it fails.
 *
 * @param {string}              memberId       - ARKA_MEMBER_X
 * @param {string}              displayName    - Member's display name for AI personalisation
 * @param {Array<Array<any>>}   pageLogData    - Full PageLogDB 2D array
 * @param {Array<Array<any>>}   shelfData      - Full MemberShelfDB 2D array
 * @param {Object}              bookMetaMap    - { bookId: { title, pages, genre } }
 * @param {Array<Array<any>>}   challengeData  - Full ChallengeDB 2D array
 * @param {Array<Array<any>>}   enrollmentData - Full ChallengeEnrollmentDB 2D array
 * @param {Array<Array<any>>}   badgeAwardData - Full BadgeAwardDB 2D array
 * @returns {string} JSON string — { v, generatedAt, insights[], statSnapshot, aiAdvice? }
 */
function generateMemberCoachInsights_(
  memberId,
  displayName,
  pageLogData,
  shelfData,
  bookMetaMap,
  challengeData,
  enrollmentData,
  badgeAwardData,
  existingCoachJson,    // Col S current value — used for aiAdvice staleness check
  memberFavGenres,      // MemberDB Col K — member-defined favourite genre tags (free text)
  memberReadingGoal,    // MemberDB Col L — member's stated reading goal (free text)
  memberShortBio,       // MemberDB Col G — member's profile bio (free text)
  memberPersonaData,    // PersonaProfileDB row: { archetypeName, archetypeTagline, axisVerdicts[] } or null
  badgeTierMap,         // Pre-built badge tier map: { category → { tier → { badgeId, caption } } }
  memberTotalClubPoints,// MemberDB Col O: TotalClubPoints — lifetime CP for level proximity
  levelRules            // ClubPointLevelDB rules: [{ maxClubPoints, levelName }]
) {
  var NOW        = new Date();
  var NOW_MS     = NOW.getTime();
  var MS_PER_DAY = 86400000;

  // ── 1. BUILD MEMBER-SCOPED PAGE LOG ARRAY ─────────────────────────────────
  // Each entry: { timestampMs, pagesDelta, bookId }
  // timestampMs is pre-parsed here using parseArkaDateString_ (GAS-safe).
  // Entries with zero/negative pagesDelta or unparseable timestamps are excluded.
  var memberLogs = [];
  for (var pi = 1; pi < pageLogData.length; pi++) {
    if ((pageLogData[pi][2] || '').toString() !== memberId) continue;
    var pDelta = Number(pageLogData[pi][4]) || 0;
    if (pDelta <= 0) continue;
    var pDate = parseArkaDateString_(pageLogData[pi][1]);
    if (isNaN(pDate.getTime())) continue;
    memberLogs.push({
      timestamp  : pDate.toISOString(),
      timestampMs: pDate.getTime(),
      pagesDelta : pDelta,
      bookId     : (pageLogData[pi][3] || '').toString()
    });
  }

  memberLogs.sort(function(a, b) { return a.timestampMs - b.timestampMs; });

  // Overall average pages per live session — computed once from all of the
  // member's positive-delta logs. Used as the reference baseline in Section 9b
  // (per-book velocity) to determine whether reading pace on a specific book
  // is notably below the member's normal rate.
  var overallAvgPagesPerSession = 0;
  if (memberLogs.length > 0) {
    var totalPagesAllSessions = memberLogs.reduce(function(s, l) { return s + l.pagesDelta; }, 0);
    overallAvgPagesPerSession = Math.round(totalPagesAllSessions / memberLogs.length);
  }

  // ── 2. BUILD MEMBER-SCOPED SHELF ARRAYS ───────────────────────────────────
  var readingShelfRows  = [];
  var finishedShelfRows = [];
  var toReadShelfRows   = [];
  var dnfShelfRows      = [];
  var activeBooksSeen   = {};

  for (var si = shelfData.length - 1; si >= 1; si--) {
    if ((shelfData[si][1] || '').toString() !== memberId) continue;
    var sStatus = (shelfData[si][3] || '').toString();
    if (sStatus === 'Deleted') continue;
    var sBookId = (shelfData[si][2] || '').toString();

    if (sStatus === 'Finished' || sStatus === 'Did Not Finish') {
      var shelfRow = {
        shelfId      : (shelfData[si][0] || '').toString(),  // Col A — CTA routes openShelfModal to this record
        bookId       : sBookId,
        status       : sStatus,
        rating       : Number(shelfData[si][4]) || 0,        // Col E — 0 = unrated → RATE_BOOK task
        review       : (shelfData[si][5] || '').toString(),  // Col F — blank → WRITE_REVIEW task
        pagesRead    : Number(shelfData[si][9]) || 0,        // Col J
        dateFinished : (shelfData[si][8] || '').toString(),  // Col I
        lastModified : (shelfData[si][10] || '').toString()  // Col K
      };
      if (sStatus === 'Finished') finishedShelfRows.push(shelfRow);
      else                        dnfShelfRows.push(shelfRow);
    } else {
      if (activeBooksSeen[sBookId]) continue;
      activeBooksSeen[sBookId] = true;
      var activeRow = {
        shelfId     : (shelfData[si][0] || '').toString(),  // Col A — CTA routes openShelfModal to this record
        bookId      : sBookId,
        status      : sStatus,
        pagesRead   : Number(shelfData[si][9]) || 0,        // Col J
        lastModified: (shelfData[si][10] || '').toString()  // Col K
      };
      if (sStatus === 'Reading')  readingShelfRows.push(activeRow);
      if (sStatus === 'To Read')  toReadShelfRows.push(activeRow);
    }
  }

  // DNF rate: percentage of all completed reads that ended as Did Not Finish.
  // 0 = every book finished; 100 = everything abandoned.
  // Behavioural signal used by the AI coach — a high rate suggests a reader
  // who frequently starts books that are not the right fit.
  var dnfRate = (finishedShelfRows.length + dnfShelfRows.length) > 0
    ? Math.round((dnfShelfRows.length / (finishedShelfRows.length + dnfShelfRows.length)) * 100)
    : 0;

  // ── 3. WEEKLY PAGE TOTALS ─────────────────────────────────────────────────
  var weeklyPages = {};
  for (var wi = 0; wi < memberLogs.length; wi++) {
    var wKey = getISOWeekString_(new Date(memberLogs[wi].timestamp));
    weeklyPages[wKey] = (weeklyPages[wKey] || 0) + memberLogs[wi].pagesDelta;
  }

  var thisWeekKey   = getISOWeekString_(NOW);
  var pagesThisWeek = weeklyPages[thisWeekKey] || 0;

  var weekKeys   = Object.keys(weeklyPages).sort();
  var priorWeeks = weekKeys.filter(function(k) { return k < thisWeekKey; });
  var last4Prior  = priorWeeks.slice(-4);
  var avg4WeekPages = 0;
  if (last4Prior.length > 0) {
    var sum4 = last4Prior.reduce(function(s, k) { return s + weeklyPages[k]; }, 0);
    avg4WeekPages = Math.round(sum4 / last4Prior.length);
  }

  var daysSinceLastLog = memberLogs.length > 0
    ? Math.round((NOW_MS - memberLogs[memberLogs.length - 1].timestampMs) / MS_PER_DAY)
    : 999;

  // ── 3b. WEEK POSITION CONTEXT ─────────────────────────────────────────────
  // ISO day of week: Monday = 1, Sunday = 7.
  // projectedWeeklyPace normalises pagesThisWeek to a full-week equivalent so
  // PACE_DOWN / PACE_UP comparisons against avg4WeekPages are apples-to-apples.
  // The isoWeekDay >= 3 gate in the insight conditions prevents false positives
  // on Monday / Tuesday when only a fraction of the week has elapsed.
  // weeklyPagesTrend (last 8 complete prior weeks) gives the AI coach a sparkline
  // for trend analysis beyond a single 4-week average.
  var isoWeekDay          = ((NOW.getDay() + 6) % 7) + 1; // 1=Mon, 7=Sun
  var projectedWeeklyPace = isoWeekDay > 0
    ? Math.round(pagesThisWeek * (7 / isoWeekDay))
    : pagesThisWeek;
  var last8Prior          = priorWeeks.slice(-8);
  var weeklyPagesTrend    = last8Prior.map(function(k) { return weeklyPages[k] || 0; });

  // ── 4. STREAK ─────────────────────────────────────────────────────────────
  var bestStreak    = computeAllTimeBestStreak_(memberLogs);
  var currentStreak = (function() {
    var reversedPrior = priorWeeks.slice().reverse();

    // Grace period gate (matches frontend computeCurrentStreak_ logic):
    // If the member hasn't logged this week, the streak is still live ONLY if
    // the most recent logged week is the IMMEDIATELY prior ISO week (gap = 1).
    // A gap of 2+ means the streak is already broken — don't count it.
    if (pagesThisWeek === 0) {
      if (!reversedPrior.length) return 0;
      if (isoWeekToEpochWeeks_(thisWeekKey) - isoWeekToEpochWeeks_(reversedPrior[0]) > 1) return 0;
    }

    // Initial count:
    //   pagesThisWeek > 0  → 1 for the current week (it's an active logged week)
    //   pagesThisWeek === 0 → 1 for reversedPrior[0] (grace period: that week is the
    //                         streak anchor; the member can still log before week ends)
    //   No logs at all     → 0
    // Previously this started at 0 when pagesThisWeek===0, counting N−1 gaps for
    // N weeks and returning a streak that was always 1 less than the true value.
    var streak    = (pagesThisWeek > 0 || reversedPrior.length > 0) ? 1 : 0;
    var checkFrom = pagesThisWeek > 0 ? reversedPrior : reversedPrior.slice(1);
    if (!checkFrom.length) return streak;

    for (var ci = 0; ci < checkFrom.length; ci++) {
      var expect = pagesThisWeek > 0
        ? (ci === 0 ? thisWeekKey      : checkFrom[ci - 1])
        : (ci === 0 ? reversedPrior[0] : checkFrom[ci - 1]);
      if (isoWeekToEpochWeeks_(expect) - isoWeekToEpochWeeks_(checkFrom[ci]) === 1) {
        streak++;
      } else {
        break;
      }
    }
    return streak;
  })();

  // ── 4b. COMEBACK CONTEXT ─────────────────────────────────────────────────
  // Detects when a member has just returned after a meaningful absence.
  // comebackAfterDays is non-null only when:
  //   (a) daysSinceLastLog ≤ 1 — they logged very recently (they are "back")
  //   (b) the gap before their last log was ≥ 3 days
  // Because condition (a) requires daysSinceLastLog ≤ 1, this is mutually
  // exclusive with LONG_ABSENCE (daysSinceLastLog ≥ 10) — the two insights
  // can never both fire for the same member on the same night.
  var comebackAfterDays = null;
  if (memberLogs.length >= 2 && daysSinceLastLog <= 1) {
    var mostRecentLogMs = memberLogs[memberLogs.length - 1].timestampMs;
    var priorLogMs      = memberLogs[memberLogs.length - 2].timestampMs;
    var gapBeforeReturn = Math.round((mostRecentLogMs - priorLogMs) / MS_PER_DAY);
    if (gapBeforeReturn >= 3) {
      comebackAfterDays = gapBeforeReturn;
    }
  }

  // ── 5. CURRENT YEAR STATS ─────────────────────────────────────────────────
  var currentYear   = NOW.getFullYear();
  var yearStartMs   = new Date(currentYear, 0, 1).getTime();
  var booksThisYear = finishedShelfRows.filter(function(r) {
    var fd = parseArkaDateString_(r.dateFinished);
    return !isNaN(fd.getTime()) && fd.getTime() >= yearStartMs;
  }).length;

  var dayOfYear     = Math.round((NOW_MS - yearStartMs) / MS_PER_DAY);
  var expectedByNow = Math.round((dayOfYear / 365) * 12);
  var fullYearsData = {};
  finishedShelfRows.forEach(function(r) {
    var fd = parseArkaDateString_(r.dateFinished);
    if (!isNaN(fd.getTime())) {
      var yr = fd.getFullYear();
      if (yr < currentYear) fullYearsData[yr] = (fullYearsData[yr] || 0) + 1;
    }
  });
  var fullYearCounts = Object.values(fullYearsData);
  if (fullYearCounts.length >= 2) {
    var historicalAvg = Math.round(
      fullYearCounts.reduce(function(s, c) { return s + c; }, 0) / fullYearCounts.length
    );
    expectedByNow = Math.round((dayOfYear / 365) * historicalAvg);
  }

  // ── 6. CHALLENGE CONTEXT ──────────────────────────────────────────────────
  // urgentEnrollment: highest-urgency active BOOK_COUNT/PAGE_COUNT challenge
  //   closing within 7 days where the member has not yet met their goal.
  //   Drives the CHALLENGE_DEADLINE urgency insight chip.
  // challengeHistory: full enrollment summary for the AI coach — completion
  //   track record, active goal progress with pace analysis, and type preference.
  var urgentEnrollment = null;
  var challengeHistory = {
    wonCount      : 0,    // past Winner status enrollments
    finishedCount : 0,    // past Finisher status enrollments
    droppedCount  : 0,    // past Dropped status enrollments
    activeGoals   : [],   // active enrollments with progress + pace data
    preferredType : null  // most frequently enrolled challenge type
  };

  if (challengeData.length > 1 && enrollmentData.length > 1) {
    // Build challenge metadata lookup including goalUnit for AI context.
    var challengeLookup = {};
    for (var ci = 1; ci < challengeData.length; ci++) {
      var cId = (challengeData[ci][0] || '').toString();
      if (!cId) continue;
      challengeLookup[cId] = {
        title        : (challengeData[ci][2] || '').toString(),
        challengeType: (challengeData[ci][1] || '').toString(),
        endDate      : (challengeData[ci][5] instanceof Date
          ? Utilities.formatDate(challengeData[ci][5], Session.getScriptTimeZone(), 'dd-MMM-yyyy')
          : (challengeData[ci][5] || '').toString()),
        goalValue    : Number(challengeData[ci][6]) || 0,
        goalUnit     : (challengeData[ci][7] || 'items').toString()  // Col H: books/pages/letters/etc.
      };
    }

    // ── Urgent enrollment detection ────────────────────────────────────────
    var countableTypes = { 'BOOK_COUNT': true, 'PAGE_COUNT': true };
    for (var ei = 1; ei < enrollmentData.length; ei++) {
      if ((enrollmentData[ei][2] || '').toString() !== memberId) continue;
      if ((enrollmentData[ei][4] || '').toString() !== 'Active') continue;
      var eChalId = (enrollmentData[ei][1] || '').toString();
      var eChal   = challengeLookup[eChalId];
      if (!eChal || !countableTypes[eChal.challengeType]) continue;
      var eEndDate  = parseArkaDateString_(eChal.endDate);
      var eDaysLeft = !isNaN(eEndDate.getTime())
        ? Math.round((eEndDate.getTime() - NOW_MS) / MS_PER_DAY)
        : 9999;
      if (eDaysLeft < 0 || eDaysLeft > 7) continue;
      var eCurrent = Number(enrollmentData[ei][5]) || 0;
      // Read the member's personal goal from ProgressStateJson (Col G, index 6).
      // This overrides the ChallengeDB default when the member set their own target.
      var eGoal = eChal.goalValue;
      try {
        var eStateJson = JSON.parse((enrollmentData[ei][6] || '{}').toString());
        if (eStateJson.personalGoal && Number(eStateJson.personalGoal) > 0) {
          eGoal = Number(eStateJson.personalGoal);
        }
      } catch (eStateErr) { /* malformed — keep ChallengeDB default */ }
      if (eCurrent >= eGoal) continue;
      urgentEnrollment = {
        title   : eChal.title,
        daysLeft: eDaysLeft,
        current : eCurrent,
        goal    : eGoal,
        type    : eChal.challengeType
      };
      break;
    }

    // ── Challenge history summary ──────────────────────────────────────────
    // Scans all of this member's enrollment rows to build:
    //   - Completion track record (won/finished/dropped counts)
    //   - Active goal list with current progress and days remaining
    //   - Most common challenge type enrolled in (declared reading aspiration)
    var chalTypeCounts = {};
    for (var chHi = 1; chHi < enrollmentData.length; chHi++) {
      if ((enrollmentData[chHi][2] || '').toString() !== memberId) continue;
      var chHStatus = (enrollmentData[chHi][4] || '').toString();
      var chHChalId = (enrollmentData[chHi][1] || '').toString();
      var chHChal   = challengeLookup[chHChalId];
      if (!chHChal) continue;

      // Tally challenge type across all enrollments regardless of status
      if (chHChal.challengeType) {
        chalTypeCounts[chHChal.challengeType] = (chalTypeCounts[chHChal.challengeType] || 0) + 1;
      }

      if      (chHStatus === 'Winner')   challengeHistory.wonCount++;
      else if (chHStatus === 'Finisher') challengeHistory.finishedCount++;
      else if (chHStatus === 'Dropped')  challengeHistory.droppedCount++;
      else if (chHStatus === 'Active') {
        // Read personal goal from ProgressStateJson (Col G, index 6) first.
        // Falls back to ChallengeDB default when no personalGoal is stored.
        var chHGoal = Number(chHChal.goalValue) || 0;
        try {
          var chHStateJson = JSON.parse((enrollmentData[chHi][6] || '{}').toString());
          if (chHStateJson.personalGoal && Number(chHStateJson.personalGoal) > 0) {
            chHGoal = Number(chHStateJson.personalGoal);
          }
        } catch (chHStateErr) { /* malformed — keep ChallengeDB default */ }
        var chHCurrent  = Number(enrollmentData[chHi][5]) || 0;  // Col F: CurrentProgressValue
        var chHEndDate  = parseArkaDateString_(chHChal.endDate);
        var chHDaysLeft = !isNaN(chHEndDate.getTime())
          ? Math.max(0, Math.round((chHEndDate.getTime() - NOW_MS) / MS_PER_DAY))
          : null;
        challengeHistory.activeGoals.push({
          title    : chHChal.title,
          type     : chHChal.challengeType,
          goalValue: chHGoal,
          goalUnit : chHChal.goalUnit,
          current  : chHCurrent,
          remaining: Math.max(0, chHGoal - chHCurrent),
          daysLeft : chHDaysLeft,
          pctDone  : chHGoal > 0 ? Math.round((chHCurrent / chHGoal) * 100) : 0
        });
      }
    }

    // Determine preferred challenge type (most frequently enrolled)
    var topChalTypeCount = 0;
    Object.keys(chalTypeCounts).forEach(function(ct) {
      if (chalTypeCounts[ct] > topChalTypeCount) {
        topChalTypeCount             = chalTypeCounts[ct];
        challengeHistory.preferredType = ct;
      }
    });
  }

  // ── 7. BADGE MILESTONE PROXIMITY ─────────────────────────────────────────
  var totalBooksFinished = finishedShelfRows.length;
  var nextBookMilestone  = null;
  var booksToNextBadge   = null;
  for (var bmt = 0; bmt < BADGE_THRESHOLDS.BOOK_MILESTONE.length; bmt++) {
    if (BADGE_THRESHOLDS.BOOK_MILESTONE[bmt] > totalBooksFinished) {
      nextBookMilestone = BADGE_THRESHOLDS.BOOK_MILESTONE[bmt];
      booksToNextBadge  = nextBookMilestone - totalBooksFinished;
      break;
    }
  }

  // ── 7b. NEXT BEST BADGE + LEVEL PROXIMITY ─────────────────────────────────
  // Scans six earnable badge categories to find the single closest badge the
  // member can unlock — the one requiring the fewest additional actions.
  // Only surfaces badges within defined proximity thresholds so advice is
  // always achievable in days/weeks, not months.
  // Also computes CP distance to the next club level name for LEVEL_PROXIMITY.

  // Build this member's set of currently-active badge IDs so we can skip
  // tiers the member already holds and avoid false-positive suggestions.
  var memberActiveBadgeSet = {};
  for (var mabI = 1; mabI < badgeAwardData.length; mabI++) {
    if ((badgeAwardData[mabI][2] || '').toString() === memberId
        && (badgeAwardData[mabI][5] || '').toString() === 'Active') {
      memberActiveBadgeSet[(badgeAwardData[mabI][1] || '').toString()] = true;
    }
  }

  // Review count — number of shelf records this member has with a non-empty review.
  // Used for REVIEW_MILESTONE badge proximity. Col F (index 5) = Review field.
  var nbReviewCount = 0;
  for (var nbRcI = 1; nbRcI < shelfData.length; nbRcI++) {
    if ((shelfData[nbRcI][1] || '').toString() === memberId
        && (shelfData[nbRcI][5] || '').toString().trim() !== '') {
      nbReviewCount++;
    }
  }

  // Max single-book page count across all finished books (Fat Read signal).
  var nbFatReadMax = 0;
  finishedShelfRows.forEach(function(nbFr) {
    var nbFrMeta = bookMetaMap[nbFr.bookId];
    if (nbFrMeta && nbFrMeta.pages > nbFatReadMax) nbFatReadMax = nbFrMeta.pages;
  });

  // Total lifetime pages logged (Page Milestone signal).
  var nbTotalPagesLogged = memberLogs.reduce(function(s, l) { return s + l.pagesDelta; }, 0);

  // Total unique ISO weeks with at least one page log (Plogger signal).
  var nbUniqueWeeksLogged = computeUniqueWeeksLogged_(memberLogs);

  // Genre-specific finished book counts for Genre Explorer proximity.
  // Keyed by canonical genre — only genres with ≥ 1 finished book are included.
  var nbGenreBookCounts = {};
  finishedShelfRows.forEach(function(nbGbFr) {
    var nbGbMeta = bookMetaMap[nbGbFr.bookId];
    if (!nbGbMeta || !nbGbMeta.genre) return;
    resolveCanonicalGenres_(nbGbMeta.genre).forEach(function(cg) {
      nbGenreBookCounts[cg] = (nbGenreBookCounts[cg] || 0) + 1;
    });
  });

  // ── Pace signals for daysToUnlock estimation ─────────────────────────────
  // nbPaceAvgPagesPerDay: 4-week rolling average (pages/week) ÷ 7.
  // Reflects current reading tempo rather than a diluted all-time average.
  var nbPaceAvgPagesPerDay = avg4WeekPages > 0 ? avg4WeekPages / 7 : 0;

  // nbPaceAvgBooksPerDay: books finished in the last 12 months ÷ 365.
  // Falls back to all-time rate for members with < 12 months of history.
  var NB_PACE_WINDOW_DAYS   = 365;
  var NB_PACE_WINDOW_MS     = NB_PACE_WINDOW_DAYS * MS_PER_DAY;
  var nbRecentBooksInWindow = 0;
  finishedShelfRows.forEach(function(nbPaceRow) {
    var nbPaceDate = parseArkaDateString_(nbPaceRow.dateFinished);
    if (nbPaceDate && !isNaN(nbPaceDate.getTime())
        && (NOW_MS - nbPaceDate.getTime()) <= NB_PACE_WINDOW_MS) {
      nbRecentBooksInWindow++;
    }
  });
  var nbBooksForRateCalc   = nbRecentBooksInWindow > 0
    ? nbRecentBooksInWindow : totalBooksFinished;
  var nbPaceAvgBooksPerDay = nbBooksForRateCalc > 0
    ? nbBooksForRateCalc / NB_PACE_WINDOW_DAYS : 0;

  // nbPaceAvgReviewsPerDay: total reviews ÷ days since first ever page log.
  // Used for REVIEW_MILESTONE daysToUnlock estimation.
  var nbEarliestLogMs = NOW_MS;
  memberLogs.forEach(function(nbPaceLog) {
    if (nbPaceLog.timestampMs < nbEarliestLogMs) {
      nbEarliestLogMs = nbPaceLog.timestampMs;
    }
  });
  var nbMembershipDays       = Math.max(1, Math.round((NOW_MS - nbEarliestLogMs) / MS_PER_DAY));
  var nbPaceAvgReviewsPerDay = nbReviewCount > 0
    ? nbReviewCount / nbMembershipDays : 0;

  // Candidates further than this many days away are excluded — they are not
  // actionable coaching signals at the member's current pace.
  var NB_MAX_DAYS_TO_UNLOCK = 120;

  // Scan badge categories and collect proximity candidates.
  // Each candidate: { category, gap, threshold, current, badgeId, caption,
  //                   actionText, daysToUnlock }
  // Only the candidate with the shortest daysToUnlock is surfaced (nextBestBadge).
  var nbCandidates = [];

  /**
   * _nbCheckCategory_()
   *
   * Adds a proximity candidate for a simple linear-threshold badge category.
   * A candidate is added only when BOTH the raw-unit pre-filter (maxGap) AND the
   * pace-normalized time estimate (NB_MAX_DAYS_TO_UNLOCK) are satisfied.
   *
   * @param {string}   cat           - Badge category key e.g. 'BOOK_MILESTONE'
   * @param {number[]} thresholds    - Ascending array from BADGE_THRESHOLDS
   * @param {number}   current       - Member's current value for this metric
   * @param {number}   maxGap        - Pre-filter: skip when gap > this raw-unit ceiling
   * @param {string}   actionTemplate - Display text; {N} = gap, {T} = threshold
   * @param {number}   pacePerDay    - Member pace in metric units per calendar day.
   *                                   Pass 0 for time-bound categories (streak/plogger)
   *                                   where daysToUnlock = gap * 7.
   * @param {boolean}  isTimeBound   - True for STREAK_MILESTONE / PLOGGER: each gap
   *                                   unit represents one calendar week that must elapse.
   */
  var _nbCheckCategory_ = function(
    cat, thresholds, current, maxGap, actionTemplate, pacePerDay, isTimeBound
  ) {
    if (!badgeTierMap) return;
    for (var nbTi = 0; nbTi < thresholds.length; nbTi++) {
      if (current < thresholds[nbTi]) {
        var nbGap = thresholds[nbTi] - current;
        if (nbGap > maxGap) return; // raw-unit pre-filter: too many units remaining

        var nbTier   = nbTi + 1;
        var nbConfig = badgeTierMap[cat] && badgeTierMap[cat][nbTier];
        if (!nbConfig) return;
        if (memberActiveBadgeSet[nbConfig.badgeId]) return; // already earned

        // Compute estimated calendar days to unlock at member's current pace.
        // Time-bound categories require one calendar week per gap unit regardless
        // of how many pages the member reads. All others are pace-divided.
        var nbDaysToUnlock;
        if (isTimeBound) {
          nbDaysToUnlock = nbGap * 7; // each gap unit = 1 calendar week to elapse
        } else if (pacePerDay > 0) {
          nbDaysToUnlock = Math.round(nbGap / pacePerDay);
        } else {
          nbDaysToUnlock = 99999; // no pace data yet — deprioritise
        }

        if (nbDaysToUnlock > NB_MAX_DAYS_TO_UNLOCK) return; // beyond actionable horizon

        nbCandidates.push({
          category    : cat,
          gap         : nbGap,
          threshold   : thresholds[nbTi],
          current     : current,
          badgeId     : nbConfig.badgeId,
          caption     : nbConfig.caption,
          actionText  : actionTemplate
            .replace('{N}', nbGap)
            .replace('{T}', thresholds[nbTi]),
          daysToUnlock: nbDaysToUnlock
        });
        return; // only the first threshold above current per category
      }
    }
  };

  // pacePerDay = member's pace in the category's native unit per calendar day.
  // isTimeBound = true where each unit represents a calendar week (not a page/book).
  _nbCheckCategory_('BOOK_MILESTONE',   BADGE_THRESHOLDS.BOOK_MILESTONE,   totalBooksFinished,  25,   'Finish {N} more book(s)',          nbPaceAvgBooksPerDay,   false);
  _nbCheckCategory_('PAGE_MILESTONE',   BADGE_THRESHOLDS.PAGE_MILESTONE,   nbTotalPagesLogged,  5000, 'Read {N} more pages',              nbPaceAvgPagesPerDay,   false);
  _nbCheckCategory_('STREAK_MILESTONE', BADGE_THRESHOLDS.STREAK_MILESTONE, currentStreak,       26,   'Keep your streak for {N} more weeks', 0,                   true);
  _nbCheckCategory_('PLOGGER',          BADGE_THRESHOLDS.PLOGGER,          nbUniqueWeeksLogged, 50,   'Log pages in {N} more weeks',      0,                      true);
  _nbCheckCategory_('REVIEW_MILESTONE', BADGE_THRESHOLDS.REVIEW_MILESTONE, nbReviewCount,       10,   'Write {N} more review(s)',         nbPaceAvgReviewsPerDay, false);

  // FAT_READ: earned by finishing one book whose page count meets the threshold.
  // Unlike cumulative categories, daysToUnlock estimates time to read a full book
  // of `threshold` pages at current pace — not gap divided by pace, because the
  // member must read the entire book, not just the marginal `gap` pages.
  if (badgeTierMap && nbFatReadMax > 0) {
    var frThresholds = BADGE_THRESHOLDS.FAT_READ;
    for (var nbFrTi = 0; nbFrTi < frThresholds.length; nbFrTi++) {
      if (nbFatReadMax < frThresholds[nbFrTi]) {
        var nbFrGap       = frThresholds[nbFrTi] - nbFatReadMax;
        var nbFrThreshold = frThresholds[nbFrTi];
        if (nbFrGap <= 250) { // within 250 pages of the next fat-read threshold
          var nbFrTier         = nbFrTi + 1;
          var nbFrConfig       = badgeTierMap['FAT_READ'] && badgeTierMap['FAT_READ'][nbFrTier];
          var nbFrDaysToUnlock = nbPaceAvgPagesPerDay > 0
            ? Math.round(nbFrThreshold / nbPaceAvgPagesPerDay) : 99999;
          if (nbFrConfig && !memberActiveBadgeSet[nbFrConfig.badgeId]
              && nbFrDaysToUnlock <= NB_MAX_DAYS_TO_UNLOCK) {
            nbCandidates.push({
              category    : 'FAT_READ',
              gap         : nbFrGap,
              threshold   : nbFrThreshold,
              current     : nbFatReadMax,
              badgeId     : nbFrConfig.badgeId,
              caption     : nbFrConfig.caption,
              actionText  : 'Finish a book over ' + nbFrThreshold + ' pages',
              daysToUnlock: nbFrDaysToUnlock
            });
          }
        }
        break;
      }
    }
  }

  // GENRE_EXPLORER: find genres where the member is closest to the next tier.
  // Only genres with ≥ 1 finished book are eligible; unstarted genres are excluded.
  // daysToUnlock uses overall books/day pace as an approximation — genre-specific
  // read rate is often too sparse to be a reliable signal independently.
  if (badgeTierMap && badgeTierMap['GENRE_EXPLORER']) {
    var geThresholds = GENRE_EXPLORER_THRESHOLDS;
    Object.keys(nbGenreBookCounts).forEach(function(cg) {
      var cgCount   = nbGenreBookCounts[cg];
      var geTierMap = badgeTierMap['GENRE_EXPLORER'][cg];
      if (!geTierMap) return; // no badges defined for this canonical genre
      for (var nbGeTi = 0; nbGeTi < geThresholds.length; nbGeTi++) {
        if (cgCount < geThresholds[nbGeTi]) {
          var nbGeGap = geThresholds[nbGeTi] - cgCount;
          if (nbGeGap > 10) break; // raw-unit pre-filter: too many books remaining
          var nbGeTier         = nbGeTi + 1;
          var nbGeConfig       = geTierMap[nbGeTier];
          if (!nbGeConfig || memberActiveBadgeSet[nbGeConfig.badgeId]) break;
          var nbGeDaysToUnlock = nbPaceAvgBooksPerDay > 0
            ? Math.round(nbGeGap / nbPaceAvgBooksPerDay) : 99999;
          if (nbGeDaysToUnlock > NB_MAX_DAYS_TO_UNLOCK) break;
          nbCandidates.push({
            category    : 'GENRE_EXPLORER',
            gap         : nbGeGap,
            threshold   : geThresholds[nbGeTi],
            current     : cgCount,
            badgeId     : nbGeConfig.badgeId,
            caption     : nbGeConfig.caption,
            actionText  : 'Read ' + nbGeGap + ' more ' + cg + ' book' + (nbGeGap === 1 ? '' : 's'),
            genre       : cg,
            daysToUnlock: nbGeDaysToUnlock
          });
          break;
        }
      }
    });
  }

  // Pick the candidate achievable soonest at the member's actual reading pace.
  // Primary sort: daysToUnlock ascending — fewest projected calendar days wins.
  // Tiebreak: category specificity, favouring the most targeted action type.
  var NB_CATEGORY_SPECIFICITY = {
    'GENRE_EXPLORER'  : 1, // most specific — names a genre and book count
    'REVIEW_MILESTONE': 2,
    'BOOK_MILESTONE'  : 3,
    'PAGE_MILESTONE'  : 4,
    'PLOGGER'         : 5,
    'STREAK_MILESTONE': 6,
    'FAT_READ'        : 7  // least specific — depends on book choice
  };
  nbCandidates.sort(function(a, b) {
    var aDays = (a.daysToUnlock !== undefined) ? a.daysToUnlock : 99999;
    var bDays = (b.daysToUnlock !== undefined) ? b.daysToUnlock : 99999;
    if (aDays !== bDays) return aDays - bDays;
    return (NB_CATEGORY_SPECIFICITY[a.category] || 9) - (NB_CATEGORY_SPECIFICITY[b.category] || 9);
  });
  var nextBestBadge = nbCandidates.length > 0 ? nbCandidates[0] : null;

  // Level proximity: distance in CP from next club level threshold.
  // Only fires when the member is within 500 CP of advancing — close enough
  // that a rating or review session could get them there.
  var levelProximity = null;
  if (memberTotalClubPoints > 0 && levelRules && levelRules.length > 0) {
    for (var lpI = 0; lpI < levelRules.length; lpI++) {
      if (memberTotalClubPoints <= levelRules[lpI].maxClubPoints) {
        if (lpI + 1 < levelRules.length) {
          var lpGap      = levelRules[lpI].maxClubPoints - memberTotalClubPoints + 1;
          var lpNextName = levelRules[lpI + 1].levelName;
          if (lpGap <= 500) {
            // Compute cheapest action: ratings (60 CP) or reviews (250 CP)
            var lpRatings = Math.ceil(lpGap / 60);
            var lpReviews = Math.ceil(lpGap / 250);
            levelProximity = {
              gapToNext     : lpGap,
              nextLevelName : lpNextName,
              ratingsNeeded : lpRatings,
              reviewsNeeded : lpReviews
            };
          }
        }
        break;
      }
    }
  }

  // ── 8. GENRE RUT DETECTION ────────────────────────────────────────────────
  var lastFiveFinished = finishedShelfRows.slice(-5);
  var genreRutGenre    = null;
  if (lastFiveFinished.length >= 5) {
    var genreSets = lastFiveFinished.map(function(r) {
      var meta = bookMetaMap[r.bookId];
      return meta ? resolveCanonicalGenres_(meta.genre) : [];
    });
    if (genreSets[0].length > 0) {
      genreSets[0].forEach(function(g) {
        if (genreSets.every(function(gs) { return gs.indexOf(g) !== -1; })) {
          genreRutGenre = g;
        }
      });
    }
  }

  // ── 9. CURRENT BOOKS SUMMARY ──────────────────────────────────────────────
  var currentBooksSummary = readingShelfRows.slice(0, 3).map(function(r) {
    var meta       = bookMetaMap[r.bookId];
    var title      = meta ? meta.title : r.bookId;
    var totalPages = meta ? meta.pages : 0;
    var pagesLeft  = totalPages > 0 ? Math.max(0, totalPages - r.pagesRead) : null;
    return pagesLeft !== null ? (title + ' (' + pagesLeft + ' left)') : title;
  });

  // ── 9b. PER-BOOK VELOCITY (currently-reading books) ──────────────────────
  // For each book on the Reading shelf, compute the member's average
  // pages-per-session specifically for that book by filtering memberLogs on
  // bookId. A paceRatio below 0.6 vs the member's overall average is a coaching
  // signal — they are reading this book at significantly less than their norm,
  // which may indicate low engagement, a genre/scale mismatch, or difficulty.
  // Also computes early vs. late velocity (split by session order) to detect
  // whether engagement is improving or declining within the same book.
  var currentBooksVelocity = [];
  readingShelfRows.forEach(function(sr) {
    var bvSessions = memberLogs.filter(function(l) { return l.bookId === sr.bookId; });
    if (bvSessions.length === 0) return;
    var bvMeta           = bookMetaMap[sr.bookId];
    var bvTotalPages     = bvSessions.reduce(function(s, l) { return s + l.pagesDelta; }, 0);
    var bvAvgPerSession  = Math.round(bvTotalPages / bvSessions.length);
    var bvPaceRatio      = overallAvgPagesPerSession > 0
      ? Math.round((bvAvgPerSession / overallAvgPagesPerSession) * 100) / 100
      : 1;

    // Early vs. late velocity — meaningful only with ≥ 4 sessions
    var bvEarlyAvg = 0;
    var bvLateAvg  = 0;
    if (bvSessions.length >= 4) {
      var bvHalf       = Math.floor(bvSessions.length / 2);
      var bvEarlyTotal = bvSessions.slice(0, bvHalf).reduce(function(s, l) { return s + l.pagesDelta; }, 0);
      var bvLateTotal  = bvSessions.slice(bvHalf).reduce(function(s, l) { return s + l.pagesDelta; }, 0);
      bvEarlyAvg = Math.round(bvEarlyTotal / bvHalf);
      bvLateAvg  = Math.round(bvLateTotal  / (bvSessions.length - bvHalf));
    }

    currentBooksVelocity.push({
      bookId                          : sr.bookId,
      title                           : bvMeta ? bvMeta.title : sr.bookId,
      genre                           : bvMeta ? bvMeta.genre : '',
      totalPages                      : bvMeta ? bvMeta.pages : 0,
      pagesRead                       : sr.pagesRead,
      pagesLeft                       : (bvMeta && bvMeta.pages > 0)
                                        ? Math.max(0, bvMeta.pages - sr.pagesRead)
                                        : null,
      sessionsOnBook                  : bvSessions.length,
      avgPagesPerSessionThisBook      : bvAvgPerSession,
      memberOverallAvgPagesPerSession : overallAvgPagesPerSession,
      paceRatio                       : bvPaceRatio,
      earlyPaceAvg                    : bvEarlyAvg,  // 0 if < 4 sessions on this book
      latePaceAvg                     : bvLateAvg    // 0 if < 4 sessions on this book
    });
  });

  // ── 9c. RECENT FINISHED BOOKS ─────────────────────────────────────────────
  // Last 3 books the member finished, most recent first. Passed to the AI coach
  // so it has context on recent reading choices beyond just "currently reading".
  var recentFinishedBooks = finishedShelfRows.slice(-3).reverse().map(function(rfr) {
    var rfMeta = bookMetaMap[rfr.bookId];
    return {
      title       : rfMeta ? rfMeta.title : rfr.bookId,
      genre       : rfMeta ? rfMeta.genre : '',
      dateFinished: rfr.dateFinished,
      rating      : rfr.rating
    };
  });

  // ── 9d. PERSONA DNA SUMMARY ───────────────────────────────────────────────
  // Builds a compact persona object from the PersonaProfileDB row passed in as
  // memberPersonaData. Only resolved (non-gated) axes are included — gated axes
  // are still forming and would mislead the AI coach with uncertain data.
  // personaDNA is null until PersonaPass has run for this member; ArkaAIPass
  // handles the null case gracefully (falls back to stats-only coaching).
  var personaDNA = null;
  if (memberPersonaData && memberPersonaData.archetypeName) {
    var pdAxes = {};
    (memberPersonaData.axisVerdicts || []).forEach(function(v) {
      if (!v.gated && v.axis && v.side) {
        pdAxes[v.axis] = { side: v.side, note: v.note || '' };
      }
    });
    personaDNA = {
      archetypeName   : memberPersonaData.archetypeName,
      archetypeTagline: memberPersonaData.archetypeTagline || '',
      axes            : pdAxes
    };
  }

  // ── 9e. GENRE PACE MAP ────────────────────────────────────────────────────
  // For each canonical genre the member has finished books in, computes their
  // average pages-per-session by aggregating all page logs for those books.
  // Genres with fewer than 3 total sessions are excluded — not enough signal.
  // Used by GENRE_PACE_MISMATCH to detect when a currently-reading book's genre
  // is one where this member historically reads notably slower than their norm.
  var genrePaceMap = {};  // { canonicalGenre: avgPagesPerSession }
  var genreSessionAccumulator = {};  // { canonicalGenre: { sessions: N, pages: N } }

  finishedShelfRows.forEach(function(gpFr) {
    var gpMeta = bookMetaMap[gpFr.bookId];
    if (!gpMeta || !gpMeta.genre) return;
    var gpBookSessions = memberLogs.filter(function(l) { return l.bookId === gpFr.bookId; });
    if (gpBookSessions.length === 0) return;
    var gpTotalPages = gpBookSessions.reduce(function(s, l) { return s + l.pagesDelta; }, 0);
    var gpCanonical  = resolveCanonicalGenres_(gpMeta.genre);
    gpCanonical.forEach(function(cg) {
      if (!genreSessionAccumulator[cg]) genreSessionAccumulator[cg] = { sessions: 0, pages: 0 };
      genreSessionAccumulator[cg].sessions += gpBookSessions.length;
      genreSessionAccumulator[cg].pages    += gpTotalPages;
    });
  });

  Object.keys(genreSessionAccumulator).forEach(function(cg) {
    var gAcc = genreSessionAccumulator[cg];
    if (gAcc.sessions >= 3) {
      genrePaceMap[cg] = Math.round(gAcc.pages / gAcc.sessions);
    }
  });

  // ── 10. ASSEMBLE PRIORITISED INSIGHTS ─────────────────────────────────────
  var insights = [];

  // ── Pre-insight computed variables ────────────────────────────────────────

  // GOAL_PROGRESS setup: attempt to extract a specific book-count target from
  // the member's free-text ReadingGoal (e.g. "20 books", "Read 25 this year",
  // "12"). Returns null when no plausible number is found, which preserves the
  // existing YEARLY_PACE_BEHIND / YEARLY_PACE_AHEAD behaviour as a fallback.
  var goalBookTarget = null;
  var goalRawText = (memberReadingGoal || '').trim().toLowerCase();
  if (goalRawText && goalRawText !== 'none set.') {
    var goalNumMatch = goalRawText.match(/(\d+)\s*books?/)        ||
                       goalRawText.match(/(?:read|finish|complete)\s+(\d+)/) ||
                       goalRawText.match(/^(\d+)$/);
    if (goalNumMatch) {
      var parsedGoalNum = parseInt(goalNumMatch[1], 10);
      // Sanity range: 1–365 books is a realistic annual target
      if (!isNaN(parsedGoalNum) && parsedGoalNum >= 1 && parsedGoalNum <= 365) {
        goalBookTarget = parsedGoalNum;
      }
    }
  }

  // Year-timing helpers for GOAL_PROGRESS pace maths
  var daysLeftInYear    = Math.max(1, 365 - dayOfYear);
  var monthsLeftInYear  = daysLeftInYear / 30.44;
  var monthsElapsedInYear = Math.max(0.5, dayOfYear / 30.44);

  // SCALE_MISMATCH setup: extract Scale axis side and member's avg book length
  // from personaDNA so we can compare against currently-reading book lengths.
  var scaleSide          = (personaDNA && personaDNA.axes && personaDNA.axes['Scale'])
                           ? personaDNA.axes['Scale'].side
                           : null;
  var scaleNoteText      = (personaDNA && personaDNA.axes && personaDNA.axes['Scale'])
                           ? (personaDNA.axes['Scale'].note || '')
                           : '';
  var scaleAvgPagesMatch = scaleNoteText.match(/average (\d+) pages/);
  var memberAvgBookLength = scaleAvgPagesMatch ? parseInt(scaleAvgPagesMatch[1], 10) : 0;

  // URGENCY tier
  if (daysSinceLastLog >= 10) {
    // Tailor the LONG_ABSENCE message to the member's Cadence axis.
    // Binger: quiet spells are normal — frame the coming burst.
    // Metronome: a gap this long is unusual — note the break in pattern.
    // No cadence data: use the original neutral fallback.
    var cadenceSide = (personaDNA && personaDNA.axes && personaDNA.axes['Cadence'])
      ? personaDNA.axes['Cadence'].side
      : null;
    var absenceLabel, absenceSub;
    if (cadenceSide === 'The Binger') {
      absenceLabel = daysSinceLastLog + ' days since your last session';
      absenceSub   = 'You naturally read in bursts, so quiet spells are part of your pattern — but a burst is overdue. When it comes, make it count.';
    } else if (cadenceSide === 'The Metronome') {
      absenceLabel = daysSinceLastLog + ' days since your last session — longer than usual for you';
      absenceSub   = 'Your reading rhythm is normally steady and consistent. This gap is longer than your typical pattern — even a short session today restores it.';
    } else {
      absenceLabel = 'You haven\'t logged any pages in ' + daysSinceLastLog + ' days';
      absenceSub   = 'Even 10 pages today keeps your reading habit alive. What are you reading?';
    }
    insights.push({
      type : 'LONG_ABSENCE',
      theme: 'amber',
      icon : '📌',
      label: absenceLabel,
      sub  : absenceSub
    });
  } else if (urgentEnrollment) {
    var dayWord   = urgentEnrollment.daysLeft === 1 ? 'day' : 'days';
    var remaining = urgentEnrollment.goal - urgentEnrollment.current;
    insights.push({
      type : 'CHALLENGE_DEADLINE',
      theme: 'amber',
      icon : '⏰',
      label: '"' + urgentEnrollment.title + '" closes in ' + urgentEnrollment.daysLeft + ' ' + dayWord,
      sub  : urgentEnrollment.type === 'BOOK_COUNT'
        ? 'You need ' + remaining + ' more book' + (remaining === 1 ? '' : 's') + ' to complete it.'
        : 'You need ' + remaining + ' more pages to complete it.'
    });
  }

  // COMEBACK: fires when the member has just returned after a meaningful gap.
  // comebackAfterDays is only non-null when daysSinceLastLog ≤ 1, so this
  // never conflicts with LONG_ABSENCE (daysSinceLastLog ≥ 10). Added as an
  // independent push — does not block any WARNING tier insight.
  if (comebackAfterDays !== null) {
    insights.push({
      type : 'COMEBACK',
      theme: 'teal',
      icon : '👋',
      label: 'Good to see you back after ' + comebackAfterDays + ' days',
      sub  : 'Every return keeps the habit alive. Pick up where you left off.'
    });
  }

  // WARNING tier
  // PACE_DOWN now uses projectedWeeklyPace (pagesThisWeek normalised to a
  // full-week equivalent) instead of raw pagesThisWeek. The isoWeekDay >= 3
  // gate prevents the insight from firing on Mon/Tue when barely any of the
  // week has elapsed — the root cause of the false "pace is down" bug.
  if (avg4WeekPages >= 30 && isoWeekDay >= 3
      && projectedWeeklyPace < Math.round(avg4WeekPages * 0.5)
      && daysSinceLastLog < 10) {
    insights.push({
      type : 'PACE_DOWN',
      theme: 'amber',
      icon : '📉',
      label: 'Reading pace is trending down this week',
      sub  : 'On track for around ' + projectedWeeklyPace + ' pages this week vs your ' + avg4WeekPages + '-page average. There\'s still time to pick up the pace.'
    });
  } else if (dnfShelfRows.length >= 2) {
    var lastTwoCompleted = finishedShelfRows.concat(dnfShelfRows)
      .sort(function(a, b) {
        return parseArkaDateString_(a.dateFinished).getTime() -
               parseArkaDateString_(b.dateFinished).getTime();
      }).slice(-2);
    if (lastTwoCompleted.length === 2 &&
        lastTwoCompleted.every(function(r) { return r.status === 'Did Not Finish'; })) {
      insights.push({
        type : 'DNF_RECENT',
        theme: 'amber',
        icon : '🛑',
        label: 'Your last 2 reads were both Did Not Finish',
        sub  : 'A reading slump? Try something shorter or in a genre you love.'
      });
    }
  }

  // BOOK_PACE_SLOWING: fires independently — not part of any else-if chain.
  // Conditions: ≥ 3 sessions on the book (enough signal), the member's overall
  // average is meaningful (≥ 10 pages/session so very new members are excluded),
  // and per-book pace is below 60% of their normal rate. A soft cap of 4 total
  // insights prevents overloading the display.
  if (currentBooksVelocity.length > 0 && insights.length < 4) {
    var slowBook = currentBooksVelocity.find(function(b) {
      return b.sessionsOnBook >= 3
          && b.memberOverallAvgPagesPerSession >= 10
          && b.paceRatio < 0.6;
    });
    if (slowBook) {
      insights.push({
        type : 'BOOK_PACE_SLOWING',
        theme: 'amber',
        icon : '🐢',
        label: 'Your pace on "' + slowBook.title + '" has slowed',
        sub  : 'You\'re averaging ' + slowBook.avgPagesPerSessionThisBook + ' pages/session on this book — about ' +
               Math.round(slowBook.paceRatio * 100) + '% of your usual rate. Worth asking if it\'s still the right read right now.'
      });
    }
  }

  // GENRE_PACE_MISMATCH: fires independently when a currently-reading book's
  // genre is one where this member has a historically lower-than-average pace
  // (< 70% of their overall average, with at least 3 sessions of genre history).
  // A complement to BOOK_PACE_SLOWING — this one names the genre as the root
  // cause rather than the individual book, giving more actionable context.
  if (currentBooksVelocity.length > 0
      && Object.keys(genrePaceMap).length > 0
      && overallAvgPagesPerSession >= 10
      && insights.length < 4) {
    var genreMismatchFound = false;
    for (var gmpI = 0; gmpI < currentBooksVelocity.length && !genreMismatchFound; gmpI++) {
      var gmpBook    = currentBooksVelocity[gmpI];
      var gmpGenres  = resolveCanonicalGenres_(gmpBook.genre || '');
      for (var gmpJ = 0; gmpJ < gmpGenres.length && !genreMismatchFound; gmpJ++) {
        var gmpGenre         = gmpGenres[gmpJ];
        var gmpHistoricPace  = genrePaceMap[gmpGenre];
        if (!gmpHistoricPace) continue;
        var gmpRatio = gmpHistoricPace / overallAvgPagesPerSession;
        if (gmpRatio < 0.7) {
          insights.push({
            type : 'GENRE_PACE_MISMATCH',
            theme: 'amber',
            icon : '📚',
            label: gmpGenre + ' tends to be slower reading for you',
            sub  : 'Historically you average ' + gmpHistoricPace + ' pages/session in ' + gmpGenre +
                   ' vs your usual ' + overallAvgPagesPerSession + '. "' + gmpBook.title +
                   '" may take longer than you\'d expect.'
          });
          genreMismatchFound = true;
        }
      }
    }
  }

  // SCALE_MISMATCH: fires independently when a currently-reading book's length
  // is significantly outside the member's typical read length.
  // Doorstop Lover reading a short book = a pleasant surprise, flag it positively.
  // Novella Lover facing an epic = realistic expectation-setting.
  // Requires a resolved Scale axis and a book with a known page count.
  if (scaleSide && memberAvgBookLength > 0
      && currentBooksVelocity.length > 0
      && insights.length < 4) {
    for (var smI = 0; smI < currentBooksVelocity.length; smI++) {
      var smBook = currentBooksVelocity[smI];
      if (!smBook.totalPages || insights.length >= 4) continue;
      if (scaleSide === 'Doorstop Lover' && smBook.totalPages < 200) {
        insights.push({
          type : 'SCALE_MISMATCH_SHORT',
          theme: 'teal',
          icon : '⚡',
          label: '"' + smBook.title + '" is lighter than your usual read',
          sub  : 'You typically finish books around ' + memberAvgBookLength + ' pages — at ' +
                 smBook.totalPages + ' pages this one will feel quick. A change of pace.'
        });
        break;
      } else if (scaleSide === 'Novella Lover' && smBook.totalPages > 550) {
        insights.push({
          type : 'SCALE_MISMATCH_LONG',
          theme: 'blue',
          icon : '🏔️',
          label: '"' + smBook.title + '" is a long stretch beyond your usual territory',
          sub  : 'Your reads typically average ' + memberAvgBookLength + ' pages — this one is ' +
                 smBook.totalPages + '. Set realistic expectations for how long it\'ll take.'
        });
        break;
      }
    }
  }

  // POSITIVE tier

  // CHALLENGE_EXCEEDED: fires when an active challenge enrollment has already
  // hit or surpassed its goal value. Surface this before pace-based positive
  // insights — completing a commitment you set yourself is the bigger moment.
  if (challengeHistory.activeGoals.length > 0) {
    var exceededGoals = challengeHistory.activeGoals.filter(function(g) {
      return g.pctDone >= 100;
    });
    if (exceededGoals.length > 0 && insights.length < 4) {
      var eg = exceededGoals[0];
      insights.push({
        type : 'CHALLENGE_EXCEEDED',
        theme: 'teal',
        icon : '🎉',
        label: 'You\'ve hit your ' + eg.title + ' target',
        sub  : eg.current + '/' + eg.goalValue + ' ' + eg.goalUnit + ' done'
              + (eg.daysLeft !== null ? ' — with ' + eg.daysLeft + ' days still to go.' : '.')
      });
    }
  }

  // PACE_UP now uses projectedWeeklyPace with the same isoWeekDay >= 3 gate
  // as PACE_DOWN — prevents a large single session on Monday triggering a
  // misleading "strong week" insight when 6 days remain.
  if (avg4WeekPages >= 30 && isoWeekDay >= 3
      && projectedWeeklyPace > Math.round(avg4WeekPages * 1.4)) {
    insights.push({
      type : 'PACE_UP',
      theme: 'teal',
      icon : '🚀',
      label: 'You\'re on track for a strong reading week',
      sub  : 'Projected at ' + projectedWeeklyPace + ' pages for the week — well above your ' + avg4WeekPages + '-page average.'
    });
  } else if (bestStreak > 0 && currentStreak > 0
             && (bestStreak - currentStreak) <= 3
             && (bestStreak - currentStreak) !== 1  // gap of 1 is too trivial — skip to avoid spam
             && currentStreak >= 3) {
    insights.push({
      type : 'STREAK_NEAR_BEST',
      theme: 'teal',
      icon : '🔥',
      label: currentStreak === bestStreak
        ? 'You\'re matching your best streak of ' + bestStreak + ' weeks!'
        : 'Only ' + (bestStreak - currentStreak) + ' weeks from your best streak',
      sub  : 'Current streak: ' + currentStreak + ' weeks. Personal best: ' + bestStreak + ' weeks.'
    });
  } else if (readingShelfRows.length > 0) {
    var almostDoneBook = readingShelfRows.find(function(r) {
      var meta = bookMetaMap[r.bookId];
      if (!meta || !meta.pages) return false;
      return (meta.pages - r.pagesRead) <= 40 && (meta.pages - r.pagesRead) >= 0;
    });
    if (almostDoneBook) {
      var adMeta = bookMetaMap[almostDoneBook.bookId];
      var adLeft = adMeta.pages - almostDoneBook.pagesRead;
      insights.push({
        type : 'BOOK_ALMOST_DONE',
        theme: 'teal',
        icon : '🏁',
        label: 'Only ' + adLeft + ' pages left in "' + adMeta.title + '"',
        sub  : 'You could finish this today. Don\'t forget to rate it!'
      });
    }
  }

  // NUDGE tier
  if (booksToNextBadge !== null && booksToNextBadge <= 3) {
    insights.push({
      type : 'BADGE_BOOK_CLOSE',
      theme: 'purple',
      icon : '🥇',
      label: booksToNextBadge === 1
        ? 'One more book unlocks your next milestone badge'
        : booksToNextBadge + ' books away from your next milestone',
      sub  : 'You\'ve finished ' + totalBooksFinished + ' books. Next milestone: ' + nextBookMilestone + '.'
    });
  } else if (readingShelfRows.length === 0 && toReadShelfRows.length > 0) {
    insights.push({
      type : 'NO_CURRENT_BOOK',
      theme: 'blue',
      icon : '📚',
      label: 'Nothing on your Reading shelf right now',
      sub  : 'You have ' + toReadShelfRows.length + ' book' + (toReadShelfRows.length === 1 ? '' : 's') + ' waiting in To Read. Pick one!'
    });
  } else if (genreRutGenre) {
    insights.push({
      type : 'GENRE_RUT',
      theme: 'blue',
      icon : '🎨',
      label: 'Your last 5 books were all ' + genreRutGenre,
      sub  : 'You clearly love this genre — but there\'s a whole library to explore. Try something different next!'
    });
  }
  // NEXT_BEST_BADGE: the single closest earnable badge across all categories.
  // Gated on daysSinceLastLog < 60 — suggesting badge progress to a member who
  // hasn't logged in months is noise, not coaching. Level proximity is excluded
  // from this gate because rating books requires no active reading.
  if (nextBestBadge !== null && insights.length < 4 && daysSinceLastLog < 60) {
    // Avoid double-surfacing when the existing BADGE_BOOK_CLOSE chip already
    // covers this exact badge (same badgeId) — BADGE_BOOK_CLOSE fires only
    // within 3 books so they rarely overlap, but guard anyway.
    var nbAlreadySurfaced = insights.some(function(ins) {
      return ins.type === 'BADGE_BOOK_CLOSE';
    }) && nextBestBadge.category === 'BOOK_MILESTONE';
    if (!nbAlreadySurfaced) {
      insights.push({
        type : 'NEXT_BEST_BADGE',
        theme: 'purple',
        icon : '🏅',
        label: nextBestBadge.caption + ' badge is within reach',
        sub  : nextBestBadge.actionText + ' to unlock it.'
      });
    }
  }

  // LEVEL_PROXIMITY: member is within 500 CP of their next club level.
  // Gives concrete action options (ratings / reviews) to bridge the gap.
  if (levelProximity !== null && insights.length < 4) {
    var lpActionHint;
    if (levelProximity.ratingsNeeded <= 2) {
      lpActionHint = 'Rate ' + levelProximity.ratingsNeeded + ' book'
                   + (levelProximity.ratingsNeeded === 1 ? '' : 's') + ' to get there.';
    } else if (levelProximity.reviewsNeeded <= 2) {
      lpActionHint = 'Write ' + levelProximity.reviewsNeeded + ' review'
                   + (levelProximity.reviewsNeeded === 1 ? '' : 's') + ' to get there.';
    } else {
      lpActionHint = 'Just ' + levelProximity.gapToNext + ' CP away.';
    }
    insights.push({
      type : 'LEVEL_PROXIMITY',
      theme: 'teal',
      icon : '⭐',
      label: levelProximity.nextLevelName + ' is ' + levelProximity.gapToNext + ' CP away',
      sub  : lpActionHint
    });
  }

  // GOAL_PROGRESS: independent push — fires alongside any badge or rut insight.
  // A member's own stated goal is more personal than badge proximity or genre nudging
  // so it must never be blocked by the NUDGE else-if chain.
  // Respects the insights.length < 4 soft cap so it doesn't crowd the display.
  if (goalBookTarget !== null && insights.length < 4) {
    var goalBooksRemaining  = Math.max(0, goalBookTarget - booksThisYear);
    if (goalBooksRemaining === 0) {
      // Goal already reached — celebrate it
      insights.push({
        type : 'GOAL_REACHED',
        theme: 'teal',
        icon : '🎯',
        label: 'You\'ve hit your ' + goalBookTarget + '-book goal for ' + currentYear + '!',
        sub  : booksThisYear + ' books finished. You set the target yourself — well done.'
      });
    } else {
      // Goal not yet reached — show pace needed vs actual
      var neededPerMonth  = monthsLeftInYear > 0
        ? Math.round((goalBooksRemaining / monthsLeftInYear) * 10) / 10
        : goalBooksRemaining;
      var actualPerMonth  = booksThisYear > 0
        ? Math.round((booksThisYear / monthsElapsedInYear) * 10) / 10
        : 0;
      if (actualPerMonth >= neededPerMonth) {
        insights.push({
          type : 'GOAL_ON_TRACK',
          theme: 'teal',
          icon : '🎯',
          label: 'On track for your ' + goalBookTarget + '-book goal',
          sub  : booksThisYear + ' done, ' + goalBooksRemaining + ' to go. Your current pace gets you there.'
        });
      } else {
        insights.push({
          type : 'GOAL_BEHIND',
          theme: 'blue',
          icon : '🎯',
          label: booksThisYear + ' of your ' + goalBookTarget + '-book goal done',
          sub  : goalBooksRemaining + ' book' + (goalBooksRemaining === 1 ? '' : 's') + ' left in ' +
                 Math.round(monthsLeftInYear) + ' months — about ' + neededPerMonth + '/month needed.'
        });
      }
    }
  }
  if (booksThisYear < expectedByNow - 1 && expectedByNow > 0 && goalBookTarget === null && insights.length < 4) {
    // YEARLY_PACE_BEHIND: fallback only when no specific goal number was found
    insights.push({
      type : 'YEARLY_PACE_BEHIND',
      theme: 'blue',
      icon : '📅',
      label: booksThisYear + ' book' + (booksThisYear === 1 ? '' : 's') + ' finished in ' + currentYear + ' so far',
      sub  : 'You\'re a little behind your usual yearly pace. A short book could help catch up!'
    });
  } else if (booksThisYear >= expectedByNow + 2 && expectedByNow > 0 && goalBookTarget === null && insights.length < 4) {
    // YEARLY_PACE_AHEAD: fallback only when no specific goal number was found
    insights.push({
      type : 'YEARLY_PACE_AHEAD',
      theme: 'teal',
      icon : '📈',
      label: 'You\'re ahead of your reading pace for ' + currentYear,
      sub  : booksThisYear + ' books finished — great progress this year!'
    });
  }

  // ── 10b. COMPUTE COACH TASKS ───────────────────────────────────────────────
  //
  // Tasks are actionable prompts assigned to the member nightly by MasterEngine.
  // They target concrete data-quality gaps: unrated books, missing reviews,
  // stale reading shelf records. Max COACH_TASKS_MAX_COUNT tasks are stored;
  // the frontend renders all of them (no "more" link).
  //
  // Task objects include targetEntityId (shelfId) so the frontend can route
  // directly to openShelfModal(auxiliaryBookId, 'true', shelfId) — no navigation
  // to the book detail view is needed.
  //
  // Resolution: after a successful shelf update the frontend dispatches
  // 'arkaCoachTaskResolved' DOM event. The Coach card listener marks the
  // matching task card as done (green/checked) immediately, and sessionStorage
  // persists the state within the session. By the next nightly sync the
  // underlying condition is resolved so the task is absent from the new JSON.

  /** @const {number} Maximum coach tasks shown per member. */
  var COACH_TASKS_MAX_COUNT = 3;

  /** @const {number} Days without a page log before a Reading shelf record is stale. */
  var STALE_READING_THRESHOLD_DAYS = 30;

  /** @const {number} Days on the To Read shelf, untouched, before it's considered stale. */
  var STALE_TO_READ_THRESHOLD_DAYS = 90;

  /** @const {number} Minimum active streak (weeks) worth protecting with a STREAK_AT_RISK task. */
  var STREAK_AT_RISK_MIN_WEEKS = 2;

  // ── Candidate pool ──────────────────────────────────────────────────────
  // Unlike the old design, we DETECT every qualifying task across all types
  // first (no cap during detection), then run a diversity-aware selector that
  // picks at most ONE task per category. This guarantees variety: a member
  // with many unrated books will still see a review/shelf/streak task rather
  // than three rating cards.
  //
  // Category priority (highest first): MOMENTUM → ENGAGEMENT → HYGIENE →
  // CURATION → SOCIAL. The selector walks categories in this order, taking the
  // single highest-priority candidate from each, until COACH_TASKS_MAX_COUNT
  // slots are filled.
  var taskCandidates = [];

  // ── MOMENTUM tasks — resolve the member's most-recent Reading book ───────
  // Momentum CTAs open the progress log sheet, which requires a specific
  // book+shelf. We use the member's most recently active Reading record. If
  // they have no Reading book, the CTA falls back to opening their shelf.
  var momentumTarget = null;
  if (readingShelfRows.length > 0) {
    // readingShelfRows preserves sheet order; pick the most recently modified.
    var sortedReading = readingShelfRows.slice().sort(function(a, b) {
      var aMs = parseArkaDateString_(a.lastModified).getTime() || 0;
      var bMs = parseArkaDateString_(b.lastModified).getTime() || 0;
      return bMs - aMs;
    });
    momentumTarget = sortedReading[0]; // { shelfId, bookId, ... }
  }

  // ── MOMENTUM: FIRST_LOG_THIS_WEEK ───────────────────────────────────────
  if (pagesThisWeek === 0 && currentStreak < STREAK_AT_RISK_MIN_WEEKS) {
    taskCandidates.push({
      taskId          : 'FIRST_LOG_THIS_WEEK',
      taskType        : 'FIRST_LOG_THIS_WEEK',
      category        : 'MOMENTUM',
      priority        : 2,
      title           : 'Log some reading this week',
      subtitle        : 'A few pages keeps the habit going',
      actionLabel     : 'Log',
      targetEntityType: momentumTarget ? 'pagelog' : 'shelf',
      targetEntityId  : momentumTarget ? momentumTarget.shelfId : '',
      auxiliaryBookId : momentumTarget ? momentumTarget.bookId  : ''
    });
  }

  // ── ENGAGEMENT: RATE_BOOK ───────────────────────────────────────────────
  // Finished shelf record with rating === 0. Most-recently-finished first.
  var unratedFinishedRows = finishedShelfRows
    .filter(function(r) { return r.rating === 0; })
    .sort(function(a, b) {
      var aMs = parseArkaDateString_(a.dateFinished).getTime() || 0;
      var bMs = parseArkaDateString_(b.dateFinished).getTime() || 0;
      return bMs - aMs;
    });
  if (unratedFinishedRows.length > 0) {
    var rbr   = unratedFinishedRows[0];
    var rbMeta = bookMetaMap[rbr.bookId];
    if (rbMeta) {
      var rbFinishedMs = parseArkaDateString_(rbr.dateFinished).getTime() || NOW_MS;
      var rbWeeksAgo   = Math.floor((NOW_MS - rbFinishedMs) / (7 * MS_PER_DAY));
      var rbSubtext    = rbWeeksAgo > 0
        ? 'Finished ' + rbWeeksAgo + ' week' + (rbWeeksAgo === 1 ? '' : 's') + ' ago \xb7 earns 60 AP'
        : 'Just finished \xb7 earns 60 AP';
      taskCandidates.push({
        taskId          : 'RATE_BOOK_' + rbr.shelfId,
        taskType        : 'RATE_BOOK',
        category        : 'ENGAGEMENT',
        priority        : 1,
        title           : 'Rate \u201c' + rbMeta.title + '\u201d',
        subtitle        : rbSubtext,
        actionLabel     : 'Rate',
        targetEntityType: 'shelf',
        targetEntityId  : rbr.shelfId,
        auxiliaryBookId : rbr.bookId
      });
    }
  }

  // ── ENGAGEMENT: WRITE_REVIEW ────────────────────────────────────────────
  // Finished shelf record with blank review. Skipped for any shelf record that
  // already produced a RATE_BOOK candidate (one CTA per book; rating wins).
  var unreviewedFinishedRows = finishedShelfRows
    .filter(function(r) { return r.review.trim() === ''; })
    .sort(function(a, b) {
      var aMs = parseArkaDateString_(a.dateFinished).getTime() || 0;
      var bMs = parseArkaDateString_(b.dateFinished).getTime() || 0;
      return bMs - aMs;
    });
  for (var wri = 0; wri < unreviewedFinishedRows.length; wri++) {
    var wrr = unreviewedFinishedRows[wri];
    var alreadyRateCandidate = taskCandidates.some(function(t) {
      return t.taskType === 'RATE_BOOK' && t.targetEntityId === wrr.shelfId;
    });
    if (alreadyRateCandidate) continue;
    var wrMeta = bookMetaMap[wrr.bookId];
    if (!wrMeta) continue;
    taskCandidates.push({
      taskId          : 'WRITE_REVIEW_' + wrr.shelfId,
      taskType        : 'WRITE_REVIEW',
      category        : 'ENGAGEMENT',
      priority        : 2,
      title           : 'Review \u201c' + wrMeta.title + '\u201d',
      subtitle        : 'No review yet \xb7 earns 250 AP',
      actionLabel     : 'Write',
      targetEntityType: 'shelf',
      targetEntityId  : wrr.shelfId,
      auxiliaryBookId : wrr.bookId
    });
    break; // one ENGAGEMENT-review candidate is enough
  }

  // ── HYGIENE: SHELF_STALE_READING ────────────────────────────────────────
  // Reading status with no page log for >= STALE_READING_THRESHOLD_DAYS.
  for (var sri = 0; sri < readingShelfRows.length; sri++) {
    var srr = readingShelfRows[sri];
    var srLogs = memberLogs.filter(function(l) { return l.bookId === srr.bookId; });
    var srLastMs = srLogs.length > 0
      ? Math.max.apply(null, srLogs.map(function(l) { return l.timestampMs; }))
      : 0;
    var srDays = srLastMs > 0 ? Math.floor((NOW_MS - srLastMs) / MS_PER_DAY) : 999;
    if (srDays < STALE_READING_THRESHOLD_DAYS) continue;
    var srMeta = bookMetaMap[srr.bookId];
    if (!srMeta) continue;
    taskCandidates.push({
      taskId          : 'SHELF_STALE_READING_' + srr.shelfId,
      taskType        : 'SHELF_STALE_READING',
      category        : 'HYGIENE',
      priority        : 1,
      title           : 'Still reading \u201c' + srMeta.title + '\u201d?',
      subtitle        : 'No logs in ' + srDays + ' days',
      actionLabel     : 'Update',
      targetEntityType: 'shelf',
      targetEntityId  : srr.shelfId,
      auxiliaryBookId : srr.bookId
    });
    break; // one stale-reading candidate is enough
  }

  // ── HYGIENE: TO_READ_STALE ──────────────────────────────────────────────
  // Book on the To Read shelf, untouched for >= STALE_TO_READ_THRESHOLD_DAYS.
  // toReadShelfRows uses the activeRow shape: { shelfId, bookId, status, pagesRead, lastModified }.
  for (var tri = 0; tri < toReadShelfRows.length; tri++) {
    var trr = toReadShelfRows[tri];
    var trModMs = parseArkaDateString_(trr.lastModified).getTime() || 0;
    var trDays  = trModMs > 0 ? Math.floor((NOW_MS - trModMs) / MS_PER_DAY) : 0;
    if (trDays < STALE_TO_READ_THRESHOLD_DAYS) continue;
    var trMeta = bookMetaMap[trr.bookId];
    if (!trMeta) continue;
    taskCandidates.push({
      taskId          : 'TO_READ_STALE_' + trr.shelfId,
      taskType        : 'TO_READ_STALE',
      category        : 'HYGIENE',
      priority        : 2,
      title           : 'Start \u201c' + trMeta.title + '\u201d?',
      subtitle        : 'On your To Read list for ' + Math.floor(trDays / 30) + '+ months',
      actionLabel     : 'Update',
      targetEntityType: 'shelf',
      targetEntityId  : trr.shelfId,
      auxiliaryBookId : trr.bookId
    });
    break; // one stale-to-read candidate is enough
  }

  // ── HYGIENE: UNLINKED_HABIT ─────────────────────────────────────────────
  // Fires when the member has been logging pages without a linked book
  // repeatedly in recent days AND has no current Reading shelf book.
  // Intent: nudge them to add a book so progress is tracked properly.
  // Gate: skip entirely if they already have a Reading book — unlinked logs
  // are legitimate in that case (academic material, articles, etc.).
  var UNLINKED_HABIT_WINDOW_DAYS    = 14;  // lookback window
  var UNLINKED_HABIT_MIN_SESSIONS   = 3;   // minimum unlinked sessions to fire
  if (readingShelfRows.length === 0) {
    var unlinkedCutoffMs    = NOW_MS - (UNLINKED_HABIT_WINDOW_DAYS * MS_PER_DAY);
    var recentUnlinkedCount = 0;
    for (var uhI = 0; uhI < memberLogs.length; uhI++) {
      var uhLog = memberLogs[uhI];
      if (uhLog.timestampMs < unlinkedCutoffMs) continue;
      // Unlinked log: bookId is absent, empty, or not an ARKA_BOOK_ reference
      if (!uhLog.bookId || uhLog.bookId.indexOf('ARKA_BOOK_') !== 0) {
        recentUnlinkedCount++;
      }
    }
    if (recentUnlinkedCount >= UNLINKED_HABIT_MIN_SESSIONS) {
      taskCandidates.push({
        taskId          : 'UNLINKED_HABIT',
        taskType        : 'UNLINKED_HABIT',
        category        : 'HYGIENE',
        priority        : 3,  // lower priority than stale-shelf tasks — those are more urgent
        title           : 'Add a book to track your reading',
        subtitle        : recentUnlinkedCount + ' unlinked sessions in the last '
                          + UNLINKED_HABIT_WINDOW_DAYS + ' days',
        actionLabel     : 'Browse Library',
        targetEntityType: 'library',
        targetEntityId  : '',
        auxiliaryBookId : ''
      });
    }
  }

  // ── CURATION: BOOK_MISSING_PAGES ────────────────────────────────────────
  // A book on the member's Finished shelf has pages = 0. Blocks Fat Read badge.
  var pagesFixRows = finishedShelfRows
    .filter(function(r) { var m = bookMetaMap[r.bookId]; return m && m.pages === 0; })
    .sort(function(a, b) {
      var aMs = parseArkaDateString_(a.dateFinished).getTime() || 0;
      var bMs = parseArkaDateString_(b.dateFinished).getTime() || 0;
      return bMs - aMs;
    });
  if (pagesFixRows.length > 0) {
    var pfr2 = pagesFixRows[0];
    var pfMeta2 = bookMetaMap[pfr2.bookId];
    taskCandidates.push({
      taskId          : 'BOOK_MISSING_PAGES_' + pfr2.bookId,
      taskType        : 'BOOK_MISSING_PAGES',
      category        : 'CURATION',
      priority        : 1,
      title           : 'Add page count for \u201c' + pfMeta2.title + '\u201d',
      subtitle        : 'Missing pages blocks the Fat Read badge',
      actionLabel     : 'Fix',
      targetEntityType: 'book',
      targetEntityId  : pfr2.bookId,
      auxiliaryBookId : pfr2.bookId
    });
  }

  // ── CURATION: BOOK_MISSING_GENRE ────────────────────────────────────────
  // A book this member added has a blank/Uncategorized genre.
  var UNCATEGORIZED_GENRE_VALUES = ['', 'uncategorized', 'unknown'];
  var genreFixIds = Object.keys(bookMetaMap).filter(function(bookId) {
    var m = bookMetaMap[bookId];
    return m.addedBy === memberId &&
           UNCATEGORIZED_GENRE_VALUES.indexOf(m.genre.toLowerCase().trim()) !== -1;
  });
  if (genreFixIds.length > 0) {
    var gfId2 = genreFixIds[0];
    var gfMeta2 = bookMetaMap[gfId2];
    taskCandidates.push({
      taskId          : 'BOOK_MISSING_GENRE_' + gfId2,
      taskType        : 'BOOK_MISSING_GENRE',
      category        : 'CURATION',
      priority        : 2,
      title           : 'Tag genre for \u201c' + gfMeta2.title + '\u201d',
      subtitle        : 'You added this book \xb7 genre helps everyone discover it',
      actionLabel     : 'Tag',
      targetEntityType: 'book',
      targetEntityId  : gfId2,
      auxiliaryBookId : gfId2
    });
  }

  // ── CURATION: BOOK_MISSING_COVER ────────────────────────────────────────
  // A book this member added has no cover image URL.
  var coverFixIds = Object.keys(bookMetaMap).filter(function(bookId) {
    var m = bookMetaMap[bookId];
    return m.addedBy === memberId && m.coverImageURL.trim() === '';
  });
  if (coverFixIds.length > 0) {
    var cfId2 = coverFixIds[0];
    var cfMeta2 = bookMetaMap[cfId2];
    taskCandidates.push({
      taskId          : 'BOOK_MISSING_COVER_' + cfId2,
      taskType        : 'BOOK_MISSING_COVER',
      category        : 'CURATION',
      priority        : 3,
      title           : 'Add cover for \u201c' + cfMeta2.title + '\u201d',
      subtitle        : 'You added this book \xb7 a cover makes it easier to find',
      actionLabel     : 'Add',
      targetEntityType: 'book',
      targetEntityId  : cfId2,
      auxiliaryBookId : cfId2
    });
  }

  // ── SOCIAL: JOIN_CHALLENGE ──────────────────────────────────────────────
  // An active challenge exists that the member is not enrolled in.
  // Reuses challengeData/enrollmentData already loaded for the challenge
  // context section above. We look for any active challenge (endDate in the
  // future) the member has no Active enrollment row for.
  (function() {
    if (challengeData.length <= 1) return;
    // Build set of challengeIds the member is actively enrolled in.
    var enrolledChallengeIds = {};
    for (var jci = 1; jci < enrollmentData.length; jci++) {
      if ((enrollmentData[jci][2] || '').toString() !== memberId) continue;
      if ((enrollmentData[jci][4] || '').toString() !== 'Active') continue;
      enrolledChallengeIds[(enrollmentData[jci][1] || '').toString()] = true;
    }
    // Find the first active challenge the member hasn't joined.
    for (var jch = 1; jch < challengeData.length; jch++) {
      var jId = (challengeData[jch][0] || '').toString();
      if (!jId || enrolledChallengeIds[jId]) continue;
      var jEndRaw = challengeData[jch][5];
      var jEndStr = jEndRaw instanceof Date
        ? Utilities.formatDate(jEndRaw, Session.getScriptTimeZone(), 'dd-MMM-yyyy')
        : (jEndRaw || '').toString();
      var jEndMs = parseArkaDateString_(jEndStr).getTime() || 0;
      if (jEndMs <= NOW_MS) continue; // challenge already ended
      var jTitle = (challengeData[jch][2] || '').toString();
      taskCandidates.push({
        taskId          : 'JOIN_CHALLENGE_' + jId,
        taskType        : 'JOIN_CHALLENGE',
        category        : 'SOCIAL',
        priority        : 1,
        title           : 'Join \u201c' + jTitle + '\u201d',
        subtitle        : 'An active challenge is open to join',
        actionLabel     : 'Join',
        targetEntityType: 'challenge',
        targetEntityId  : jId,
        auxiliaryBookId : ''
      });
      break; // one challenge candidate is enough
    }
  })();

  // ── DIVERSITY-AWARE SELECTOR ────────────────────────────────────────────
  // Walk categories in priority order. From each category, take the single
  // highest-priority candidate. Stop once COACH_TASKS_MAX_COUNT slots are full.
  // This guarantees at most one task per category and maximises variety.
  var CATEGORY_ORDER = ['MOMENTUM', 'ENGAGEMENT', 'HYGIENE', 'CURATION', 'SOCIAL'];
  var coachTasks = [];

  CATEGORY_ORDER.forEach(function(cat) {
    if (coachTasks.length >= COACH_TASKS_MAX_COUNT) return;
    var inCategory = taskCandidates
      .filter(function(t) { return t.category === cat; })
      .sort(function(a, b) { return a.priority - b.priority; });
    if (inCategory.length > 0) {
      // Strip the internal `category` field — frontend doesn't need it.
      var chosen = inCategory[0];
      coachTasks.push({
        taskId          : chosen.taskId,
        taskType        : chosen.taskType,
        priority        : chosen.priority,
        title           : chosen.title,
        subtitle        : chosen.subtitle,
        actionLabel     : chosen.actionLabel,
        targetEntityType: chosen.targetEntityType,
        targetEntityId  : chosen.targetEntityId,
        auxiliaryBookId : chosen.auxiliaryBookId
      });
    }
  });

  // ── 11. ASSEMBLE STAT SNAPSHOT (for AI coach pass later) ─────────────────

  var statSnapshot = {
    // ── Pace & streak (existing fields — backward compatible) ──────────────
    pagesThisWeek        : pagesThisWeek,
    avg4WeekPagesPerWeek : avg4WeekPages,
    currentStreak        : currentStreak,
    bestStreak           : bestStreak,
    daysSinceLastLog     : daysSinceLastLog,
    booksFinishedThisYear: booksThisYear,
    totalBooksFinished   : totalBooksFinished,
    nextBookMilestone    : nextBookMilestone,
    booksToNextBadge     : booksToNextBadge,
    currentReadingBooks  : currentBooksSummary,  // kept for backward compat
    toReadCount          : toReadShelfRows.length,

    // ── Week position — fixes AI coach's week-context blindness ───────────
    // daysIntoWeek and projectedWeeklyPace let Gemini understand that
    // pagesThisWeek is a partial-week figure, not a final one.
    daysIntoWeek        : isoWeekDay,
    projectedWeeklyPace : projectedWeeklyPace,
    weeklyPagesTrend    : weeklyPagesTrend,  // last 8 complete prior weeks

    // ── Member profile (Layer 2 of AI coaching brief) ─────────────────────
    readingGoal         : memberReadingGoal || '',
    favGenres           : memberFavGenres   || '',
    shortBio            : memberShortBio    || '',

    // ── Reading DNA (Layer 1 of AI coaching brief) ────────────────────────
    // null until PersonaPass has run for this member
    personaDNA          : personaDNA,

    // ── Per-book intelligence (Layer 3 enrichment) ────────────────────────
    currentBooksVelocity       : currentBooksVelocity,
    recentFinishedBooks        : recentFinishedBooks,
    overallAvgPagesPerSession  : overallAvgPagesPerSession,

    // ── Behavioural signals ───────────────────────────────────────────────
    dnfRate           : dnfRate,            // 0–100 percentage
    comebackAfterDays : comebackAfterDays,  // null or N days

    // ── Challenge commitments (Layer 4 of AI coaching brief) ─────────────
    challengeHistory     : challengeHistory,

    // Genre pace map — avg pages/session per canonical genre across finished books.
    // Passed to AI coach so it can reference genre-specific pace patterns.
    // Only genres with ≥ 3 sessions of history are included.
    genrePaceMap         : genrePaceMap,

    // Next best badge — closest earnable badge across all categories.
    // null when no badge is within proximity thresholds.
    nextBestBadge        : nextBestBadge,

    // Level proximity — CP gap to next club level name.
    // null when > 500 CP away or member has no CP yet.
    levelProximity       : levelProximity,

    // Pace signals exported for buildUpNextStrip_() in the frontend.
    // Exposing them here ensures both places use identical pace data for
    // daysToUnlock ranking, keeping the two "closest badge" surfaces coherent.
    badgePaceAvgPagesPerDay : nbPaceAvgPagesPerDay,
    badgePaceAvgBooksPerDay : nbPaceAvgBooksPerDay
  };

  // ── 12. PRESERVE EXISTING AI ADVICE ───────────────────────────────────────
  // MasterEngine no longer calls Gemini. The AI pass is handled entirely by
  // the separate ArkaAIPass script which runs after this engine completes.
  //
  // We carry forward any existing aiAdvice and aiFingerprint from the stored
  // Col S JSON so the frontend never shows a blank advice card between the
  // MasterEngine write and the ArkaAIPass write later that night.
  var preservedAiAdvice      = null;
  var preservedAiFingerprint = null;
  var preservedOnboarding    = null;
  try {
    var existingRaw = (existingCoachJson || '').toString();
    if (existingRaw) {
      var existingParsed     = JSON.parse(existingRaw);
      preservedAiAdvice      = existingParsed.aiAdvice      || null;
      preservedAiFingerprint = existingParsed.aiFingerprint || null;
      // Preserve the onboarding sub-object written by saveOnboardingProgress().
      // This holds the member's self-reported confirmations and dismissed flag —
      // both are member state, not computed insights, so MasterEngine must never
      // erase them. A null value here means no onboarding writes have occurred
      // yet (new member), which is valid and requires no payload entry.
      preservedOnboarding    = (existingParsed.onboarding &&
                                typeof existingParsed.onboarding === 'object')
                               ? existingParsed.onboarding
                               : null;
    }
  } catch (preserveErr) { /* malformed — start fresh, ArkaAIPass will regenerate */ }

  // ── 13. ASSEMBLE FINAL JSON ───────────────────────────────────────────────
  // aiAdvice and aiFingerprint are intentionally NOT written by MasterEngine.
  // They are written by ArkaAIPass after this JSON is already in place.
  // Carrying them forward here ensures the member always sees their last advice
  // until ArkaAIPass overwrites it with a fresh one.
  var payload = {
    v           : 1,
    generatedAt : Utilities.formatDate(NOW, Session.getScriptTimeZone(), 'dd-MMM-yyyy'),
    insights    : insights,
    tasks       : coachTasks,
    statSnapshot: statSnapshot
  };
  if (preservedAiAdvice) {
    payload.aiAdvice      = preservedAiAdvice;
    payload.aiFingerprint = preservedAiFingerprint || '';
  }

  // Carry forward the onboarding sub-object unchanged. MasterEngine has no
  // role in computing onboarding state — it only preserves what
  // saveOnboardingProgress() wrote. Phase 6 of the onboarding build will
  // add badge-checking logic here once BadgeDB rows are created.
  if (preservedOnboarding) {
    payload.onboarding = preservedOnboarding;
  }

  return JSON.stringify(payload);
}

/**
 * debugBadgePaceSignals()
 *
 * Diagnostic: computes and logs the three pace signals used by the badge
 * proximity engine (nbPaceAvgPagesPerDay, nbPaceAvgBooksPerDay,
 * nbPaceAvgReviewsPerDay) for a single member.
 *
 * Replicates the exact derivation logic in generateMemberCoachInsights_()
 * so the output reflects what the nightly engine will actually use.
 *
 * HOW TO RUN:
 *   1. Set TARGET_MEMBER_ID below.
 *   2. Open Apps Script editor → select this function → click Run.
 *   3. Output appears in the Execution Log.
 */
function debugBadgePaceSignals() {

  // ── CONFIG ─────────────────────────────────────────────────────────────────
  var TARGET_MEMBER_ID = 'ARKA_MEMBER_1'; // ← change to the member you want to test

  // ── LOAD DATA ──────────────────────────────────────────────────────────────
  var ss          = SpreadsheetApp.openById(SPREADSHEET_ID);
  var pageLogData = ss.getSheetByName('PageLogDB').getDataRange().getValues();
  var shelfData   = ss.getSheetByName('MemberShelfDB').getDataRange().getValues();

  var NOW        = new Date();
  var NOW_MS     = NOW.getTime();
  var MS_PER_DAY = 86400000;

  // ── 1. BUILD MEMBER PAGE LOGS (mirrors Section 1 of generateMemberCoachInsights_) ──
  var memberLogs = [];
  for (var pi = 1; pi < pageLogData.length; pi++) {
    if ((pageLogData[pi][2] || '').toString() !== TARGET_MEMBER_ID) continue;
    var pDelta = Number(pageLogData[pi][4]) || 0;
    if (pDelta <= 0) continue;
    var pDate = parseArkaDateString_(pageLogData[pi][1]);
    if (isNaN(pDate.getTime())) continue;
    memberLogs.push({ timestampMs: pDate.getTime(), pagesDelta: pDelta });
  }
  memberLogs.sort(function(a, b) { return a.timestampMs - b.timestampMs; });

  // ── 2. BUILD FINISHED SHELF ROWS (mirrors Section 2) ──────────────────────
  var finishedShelfRows = [];
  for (var si = 1; si < shelfData.length; si++) {
    if ((shelfData[si][1] || '').toString() !== TARGET_MEMBER_ID) continue;
    if ((shelfData[si][3] || '').toString() !== 'Finished') continue;
    finishedShelfRows.push({
      dateFinished: (shelfData[si][8] || '').toString()  // Col I
    });
  }

  // ── 3. REVIEW COUNT (mirrors nbReviewCount in Section 7b) ─────────────────
  var nbReviewCount = 0;
  for (var ri = 1; ri < shelfData.length; ri++) {
    if ((shelfData[ri][1] || '').toString() !== TARGET_MEMBER_ID) continue;
    if ((shelfData[ri][5] || '').toString().trim() !== '') nbReviewCount++;
  }

  // ── 4. AVG 4-WEEK PAGES (mirrors Section 6 rolling average) ───────────────
  var FOUR_WEEKS_MS = 28 * MS_PER_DAY;
  var pagesInLast4Weeks = 0;
  memberLogs.forEach(function(l) {
    if (NOW_MS - l.timestampMs <= FOUR_WEEKS_MS) pagesInLast4Weeks += l.pagesDelta;
  });
  var avg4WeekPages = Math.round(pagesInLast4Weeks / 4); // pages per week

  // ── 5. PACE SIGNALS (mirrors Section 7b pace block) ───────────────────────

  // Pages per day
  var nbPaceAvgPagesPerDay = avg4WeekPages > 0 ? avg4WeekPages / 7 : 0;

  // Books per day — 12-month window, falls back to all-time
  var NB_PACE_WINDOW_DAYS   = 365;
  var NB_PACE_WINDOW_MS     = NB_PACE_WINDOW_DAYS * MS_PER_DAY;
  var nbRecentBooksInWindow = 0;
  finishedShelfRows.forEach(function(row) {
    var d = parseArkaDateString_(row.dateFinished);
    if (d && !isNaN(d.getTime()) && (NOW_MS - d.getTime()) <= NB_PACE_WINDOW_MS) {
      nbRecentBooksInWindow++;
    }
  });
  var nbBooksForRateCalc   = nbRecentBooksInWindow > 0
    ? nbRecentBooksInWindow : finishedShelfRows.length;
  var nbPaceAvgBooksPerDay = nbBooksForRateCalc > 0
    ? nbBooksForRateCalc / NB_PACE_WINDOW_DAYS : 0;

  // Reviews per day — total reviews / membership days
  var nbEarliestLogMs = NOW_MS;
  memberLogs.forEach(function(l) {
    if (l.timestampMs < nbEarliestLogMs) nbEarliestLogMs = l.timestampMs;
  });
  var nbMembershipDays       = Math.max(1, Math.round((NOW_MS - nbEarliestLogMs) / MS_PER_DAY));
  var nbPaceAvgReviewsPerDay = nbReviewCount > 0
    ? nbReviewCount / nbMembershipDays : 0;

  // ── 6. DERIVED HUMAN-READABLE ESTIMATES ───────────────────────────────────
  // How many days at current pace to read N pages / finish N books / write N reviews
  function daysFor(n, ratePerDay) {
    return ratePerDay > 0 ? Math.round(n / ratePerDay) : null;
  }

  // ── 7. CONSOLE OUTPUT ─────────────────────────────────────────────────────
  console.log('═══════════════════════════════════════════════════');
  console.log('  BADGE PACE SIGNAL AUDIT — ' + TARGET_MEMBER_ID);
  console.log('═══════════════════════════════════════════════════');

  console.log('\n── Raw Inputs ──');
  console.log('  Total page log entries       : ' + memberLogs.length);
  console.log('  Pages in last 4 weeks        : ' + pagesInLast4Weeks);
  console.log('  Avg pages/week (4-wk)        : ' + avg4WeekPages);
  console.log('  Total books finished         : ' + finishedShelfRows.length);
  console.log('  Books finished (last 12 mo)  : ' + nbRecentBooksInWindow + (nbRecentBooksInWindow === 0 ? '  ← falling back to all-time' : ''));
  console.log('  Total reviews written        : ' + nbReviewCount);
  console.log('  Membership days (first log)  : ' + nbMembershipDays);

  console.log('\n── Pace Signals (what the engine uses) ──');
  console.log('  nbPaceAvgPagesPerDay   : ' + nbPaceAvgPagesPerDay.toFixed(2)   + ' pages/day');
  console.log('  nbPaceAvgBooksPerDay   : ' + nbPaceAvgBooksPerDay.toFixed(4)   + ' books/day');
  console.log('  nbPaceAvgReviewsPerDay : ' + nbPaceAvgReviewsPerDay.toFixed(4) + ' reviews/day');

  console.log('\n── Sanity Check — Days to unlock N units ──');
  console.log('  1 000 pages  → ' + (daysFor(1000,  nbPaceAvgPagesPerDay)   || 'N/A (no page pace)')  + ' days');
  console.log('  5 000 pages  → ' + (daysFor(5000,  nbPaceAvgPagesPerDay)   || 'N/A')                 + ' days');
  console.log('  1 book       → ' + (daysFor(1,     nbPaceAvgBooksPerDay)   || 'N/A (no book pace)')  + ' days');
  console.log('  5 books      → ' + (daysFor(5,     nbPaceAvgBooksPerDay)   || 'N/A')                 + ' days');
  console.log('  1 review     → ' + (daysFor(1,     nbPaceAvgReviewsPerDay) || 'N/A (no review pace)')+ ' days');
  console.log('  5 reviews    → ' + (daysFor(5,     nbPaceAvgReviewsPerDay) || 'N/A')                 + ' days');
  console.log('  10 wk streak → ' + (10 * 7) + ' days (time-bound, pace irrelevant)');
  console.log('  25 wk plogger→ ' + (25 * 7) + ' days (time-bound, pace irrelevant)');

  console.log('\n═══════════════════════════════════════════════════\n');
}
