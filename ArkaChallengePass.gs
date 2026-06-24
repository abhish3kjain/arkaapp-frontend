/**
 * ARKA CHALLENGE PASS    v1.3.0
 * Full version history: VERSIONS.md
 *
 * Standalone nightly pass — computes and persists progressStateJson for all
 * active challenge enrollments across three challenge types:
 *
 *   10PAGESADAY  — habitScore, weeksHit, earlyWeeksHit, maxGap, recoveryRate,
 *                   totalPages, avgPagesPerDay, isQualified, monthlyBreakdown
 *   PAGE_COUNT   — totalPages, pacingProjection, aheadBehindTarget,
 *                   monthlyBreakdown, weeklyBreakdown
 *   BOOK_COUNT   — totalBooks, booksRead[], pacingProjection, monthlyBreakdown
 *
 * Separation of concerns
 * ──────────────────────
 *   MasterEngine      →  stats, badges, CP ledger
 *   ArkaChallengePass →  challenge progressStateJson (this file)
 *   ArkaAIPass        →  Gemini AI narrative
 *   ArkaPersonaPass   →  reading personality
 *
 * Trigger
 * ───────
 * Run installArkaChallengePassTrigger() once from the Apps Script editor to
 * create a daily time-based trigger at 00:12 (12 min after midnight, after
 * MasterEngine has completed).
 *
 * Kill switch
 * ───────────
 * Set Script Property  CHALLENGE_PASS_ENABLED = 'false'  to disable without
 * touching code. runArkaChallengePass() exits immediately if set.
 *
 * Gate
 * ────
 * Checks ARKAENGINE_READY flag written by MasterEngine to ensure we never
 * read a half-written club state. If flag is absent, logs a warning and
 * exits — the next nightly run will pick up from scratch.
 *
 * Empty progressStateJson
 * ───────────────────────
 * If progressStateJson is missing or '{}' the pass bootstraps a fresh
 * zero-state for the enrollment's challenge type, then computes from scratch.
 */

// ── Constants ──────────────────────────────────────────────────────────────

const CHALPASS_SPREADSHEET_ID = '1qXsAAO_9aIEJuTTQ1ziX9s5plvm6WHaVI_zaKcSXF-4';

const CHALPASS_CHALLENGE_SHEET    = 'ChallengeDB';
const CHALPASS_ENROLLMENT_SHEET   = 'ChallengeEnrollmentDB';
const CHALPASS_PAGELOG_SHEET      = 'PageLogDB';
const CHALPASS_ACTIVITYLOG_SHEET  = 'ActivityLogDB';
const CHALPASS_SHELF_SHEET        = 'MemberShelfDB';

const CHALPASS_ENABLED_PROP      = 'CHALLENGE_PASS_ENABLED';

// ChallengeDB column indices (0-based)
const CHAL_COL_ID         = 0;
const CHAL_COL_TYPE       = 1;
const CHAL_COL_TITLE      = 2;
const CHAL_COL_STATUS     = 9;
const CHAL_COL_START      = 4;
const CHAL_COL_END        = 5;
const CHAL_COL_GOAL_VAL   = 6;
const CHAL_COL_GOAL_UNIT  = 7;
const CHAL_COL_GOAL_CFG   = 8;

// ChallengeEnrollmentDB column indices (0-based)
const ENROL_COL_ID        = 0;
const ENROL_COL_CHAL_ID   = 1;
const ENROL_COL_MEMBER_ID = 2;
const ENROL_COL_ENROLLED  = 3;
const ENROL_COL_STATUS    = 4;
const ENROL_COL_PROGRESS  = 5;
const ENROL_COL_STATE     = 6;
const ENROL_COL_UPDATED   = 7;

// PageLogDB column indices (0-based)
const PLOG_COL_ID         = 0;
const PLOG_COL_TIMESTAMP  = 1;
const PLOG_COL_MEMBER_ID  = 2;
const PLOG_COL_BOOK_ID    = 3;
const PLOG_COL_PAGES      = 4;

// ActivityLogDB column indices (0-based)
const ACT_COL_ID          = 0;
const ACT_COL_TYPE        = 1;
const ACT_COL_DATE        = 2;
const ACT_COL_MEMBER_ID   = 3;
const ACT_COL_DESC        = 4;

// MemberShelfDB column indices (0-based)
// Col A(0)=shelfId  Col B(1)=memberId  Col C(2)=bookId  Col D(3)=status
// Col H(7)=dateUpdated  Col I(8)=dateFinished  Col K(10)=lastModifiedOn
const SHELF_COL_SHELF_ID      = 0;
const SHELF_COL_MEMBER_ID     = 1;
const SHELF_COL_BOOK_ID       = 2;
const SHELF_COL_STATUS        = 3;
const SHELF_COL_DATE_UPDATED  = 7;
const SHELF_COL_DATE_FINISHED = 8;

// Supported challenge types processed by this pass
const CHALPASS_TYPES = new Set(['10PAGESADAY', 'PAGE_COUNT', 'BOOK_COUNT']);

// 10PAGESADAY: pages-per-week threshold to count a week as "hit"
const TEN_PPA_DAILY_GOAL      = 10;
const TEN_PPA_WEEKLY_THRESHOLD = 70;  // 7 × 10
const TEN_PPA_EARLY_WEEKS      = 10;  // first N weeks from enrollment = "early" period

// ── Entry point ────────────────────────────────────────────────────────────

/**
 * Function: runArkaChallengePass()
 * Parameters: none
 * Return Type: void
 * Logic Summary: Main entry point called by the daily time-based trigger.
 *   Checks kill switch, then calls _processAllChallengeEnrollments_().
 *   Runs independently — no dependency on MasterEngine completion flag.
 */
function runArkaChallengePass() {
  const props = PropertiesService.getScriptProperties();

  const enabled = props.getProperty(CHALPASS_ENABLED_PROP);
  if (enabled === 'false') {
    console.log('ArkaChallengePass: disabled via kill switch. Exiting.');
    return;
  }

  console.log('ArkaChallengePass: starting at ' + new Date().toISOString());

  try {
    _processAllChallengeEnrollments_();
    console.log('ArkaChallengePass: completed successfully at ' + new Date().toISOString());
  } catch (err) {
    console.error('ArkaChallengePass: FATAL ERROR — ', err.message, err.stack);
  }
}


// ── Core processor ─────────────────────────────────────────────────────────

/**
 * Function: _processAllChallengeEnrollments_()
 * Parameters: none
 * Return Type: void
 * Logic Summary:
 *   1. Loads ChallengeDB, ChallengeEnrollmentDB, PageLogDB, ActivityLogDB once.
 *   2. Pre-indexes page logs by memberId for O(n) per-member lookups.
 *   3. Pre-indexes activity logs for ARKA_ACTTYP_BOOKREAD events by memberId.
 *   4. For each active enrollment in a supported challenge type, dispatches
 *      to the appropriate compute function.
 *   5. Batch-writes all changes to ChallengeEnrollmentDB using setValues().
 *   Uses LockService to prevent concurrent runs.
 */
function _processAllChallengeEnrollments_() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    console.error('ArkaChallengePass: could not acquire script lock. Another run may be active.');
    return;
  }

  try {
    const ss = SpreadsheetApp.openById(CHALPASS_SPREADSHEET_ID);

    const chalSheet    = ss.getSheetByName(CHALPASS_CHALLENGE_SHEET);
    const enrollSheet  = ss.getSheetByName(CHALPASS_ENROLLMENT_SHEET);
    const plogSheet    = ss.getSheetByName(CHALPASS_PAGELOG_SHEET);
    const actSheet     = ss.getSheetByName(CHALPASS_ACTIVITYLOG_SHEET);
    const shelfSheet   = ss.getSheetByName(CHALPASS_SHELF_SHEET);

    if (!chalSheet || !enrollSheet || !plogSheet || !actSheet || !shelfSheet) {
      console.error('ArkaChallengePass: one or more required sheets not found.');
      return;
    }

    const chalData   = chalSheet.getDataRange().getValues();
    const enrollData = enrollSheet.getDataRange().getValues();
    const plogData   = plogSheet.getDataRange().getValues();
    const actData    = actSheet.getDataRange().getValues();
    const shelfData  = shelfSheet.getDataRange().getValues();

    const nowMs   = Date.now();
    const nowDate = new Date(nowMs);
    const tsStr   = _chalpassTimestamp_(nowDate);

    // ── Build challenge lookup: challengeId → challenge object ──────────────
    const challengeById = {};
    for (let ci = 1; ci < chalData.length; ci++) {
      const row = chalData[ci];
      const id  = (row[CHAL_COL_ID] || '').toString();
      if (!id) continue;
      let cfg = {};
      try { cfg = JSON.parse((row[CHAL_COL_GOAL_CFG] || '{}').toString()); } catch (e) {}
      challengeById[id] = {
        challengeId   : id,
        challengeType : (row[CHAL_COL_TYPE]   || '').toString(),
        status        : (row[CHAL_COL_STATUS]  || '').toString(),
        startDate     : row[CHAL_COL_START],
        endDate       : row[CHAL_COL_END],
        goalValue     : Number(row[CHAL_COL_GOAL_VAL]) || 0,
        goalUnit      : (row[CHAL_COL_GOAL_UNIT] || '').toString(),
        goalConfig    : cfg
      };
    }

    // ── Pre-index page logs: memberId → [{dateMs, pages, bookId}] ───────────
    const pageLogsByMember = {};
    for (let pi = 1; pi < plogData.length; pi++) {
      const row   = plogData[pi];
      const mid   = (row[PLOG_COL_MEMBER_ID] || '').toString();
      const pages = Number(row[PLOG_COL_PAGES]) || 0;
      if (!mid || pages <= 0) continue;
      const ts    = _chalpassParseDate_(row[PLOG_COL_TIMESTAMP]);
      if (isNaN(ts.getTime())) continue;
      if (!pageLogsByMember[mid]) pageLogsByMember[mid] = [];
      pageLogsByMember[mid].push({
        dateMs : ts.getTime(),
        pages  : pages,
        bookId : (row[PLOG_COL_BOOK_ID] || '').toString()
      });
    }

    // ── Pre-index shelf records: memberId → [{dateMs, shelfId, bookId}] for Finished, non-Deleted ─
    const bookReadByMember = {};
    for (let si = 1; si < shelfData.length; si++) {
      const row    = shelfData[si];
      const shelfId = (row[SHELF_COL_SHELF_ID] || '').toString();
      if (!shelfId) continue;
      const mid    = (row[SHELF_COL_MEMBER_ID] || '').toString();
      if (!mid) continue;
      const status = (row[SHELF_COL_STATUS] || '').toString();
      if (status !== 'Finished') continue;  // excludes Deleted, Reading, Want-to-Read, DNF
      const ts = _chalpassParseDate_(row[SHELF_COL_DATE_FINISHED] || row[SHELF_COL_DATE_UPDATED]);
      if (isNaN(ts.getTime())) continue;
      const bookId = (row[SHELF_COL_BOOK_ID] || '').toString();
      if (!bookReadByMember[mid]) bookReadByMember[mid] = [];
      bookReadByMember[mid].push({ dateMs: ts.getTime(), shelfId: shelfId, bookId: bookId });
    }

    // ── Collect updates: {rowIndex (1-based), progressValue, stateJson, tsStr} ──
    const updates = []; // {rowIndex, progressValue, stateJson}

    for (let ei = 1; ei < enrollData.length; ei++) {
      const eRow    = enrollData[ei];
      const chalId  = (eRow[ENROL_COL_CHAL_ID]   || '').toString();
      const memberId = (eRow[ENROL_COL_MEMBER_ID] || '').toString();
      const status   = (eRow[ENROL_COL_STATUS]    || '').toString();

      if (!chalId || !memberId) continue;
      if (status === 'Dropped') continue;

      const chal = challengeById[chalId];
      if (!chal || !CHALPASS_TYPES.has(chal.challengeType)) continue;
      if (chal.status !== 'Active') continue;

      const enrolledOnRaw = eRow[ENROL_COL_ENROLLED];
      const enrolledOn    = _chalpassParseDate_(enrolledOnRaw);

      let existingState = {};
      try {
        existingState = JSON.parse((eRow[ENROL_COL_STATE] || '{}').toString());
      } catch (e) { existingState = {}; }

      let result = null;

      if (chal.challengeType === '10PAGESADAY') {
        result = _compute10PagesState_(
          chal, memberId, enrolledOn, pageLogsByMember[memberId] || [], nowDate, existingState
        );
      } else if (chal.challengeType === 'PAGE_COUNT') {
        result = _computePageCountState_(
          chal, memberId, enrolledOn, pageLogsByMember[memberId] || [], nowDate, existingState
        );
      } else if (chal.challengeType === 'BOOK_COUNT') {
        result = _computeBookCountState_(
          chal, memberId, enrolledOn, bookReadByMember[memberId] || [], nowDate, existingState
        );
      }

      if (!result) continue;

      updates.push({
        rowIndex      : ei + 1, // 1-based sheet row (row 1 = header)
        progressValue : result.progressValue,
        stateJson     : JSON.stringify(result.state),
        tsStr         : tsStr
      });
    }

    if (updates.length === 0) {
      console.log('ArkaChallengePass: no active enrollments to update.');
      return;
    }

    // ── Batch write to ChallengeEnrollmentDB ────────────────────────────────
    // Write each enrollment's F (progress), G (stateJson), H (lastUpdated) columns.
    // We do row-by-row setValue calls (not setValues in one block) because the rows
    // are sparse and non-contiguous. For ~80 members this is well within quota.
    for (let ui = 0; ui < updates.length; ui++) {
      const u = updates[ui];
      enrollSheet.getRange(u.rowIndex, ENROL_COL_PROGRESS + 1).setValue(u.progressValue);
      enrollSheet.getRange(u.rowIndex, ENROL_COL_STATE   + 1).setValue(u.stateJson);
      enrollSheet.getRange(u.rowIndex, ENROL_COL_UPDATED + 1).setValue(u.tsStr);
    }

    console.log('ArkaChallengePass: updated ' + updates.length + ' enrollment rows.');

  } finally {
    lock.releaseLock();
  }
}


// ── 10PAGESADAY compute ────────────────────────────────────────────────────

/**
 * Function: _compute10PagesState_()
 * Parameters:
 *   chal        {Object}   - challenge record from ChallengeDB
 *   memberId    {string}   - ARKA_MEMBER_X
 *   enrolledOn  {Date}     - parsed enrollment date
 *   pageLogs    {Array}    - member's page log entries [{dateMs, pages}]
 *   now         {Date}     - current date
 *   existing    {Object}   - current progressStateJson (may be empty)
 * Return Type: {progressValue: number, state: Object} | null
 * Logic Summary:
 *   Computes full habitScore state from scratch each night:
 *
 *   Week definition: enrollment-relative 7-day windows starting at enrolledOn.
 *   Week i (0-indexed): enrolledOn + i*7 days  →  enrolledOn + (i+1)*7 days - 1ms.
 *
 *   weeksHit      = count of elapsed weeks with sumPages >= 70
 *   earlyWeeksHit = weeksHit within the first TEN_PPA_EARLY_WEEKS weeks
 *   maxGap        = longest consecutive stretch of elapsed weeks below threshold
 *   recoveryRate  = single-week gap events / total gap events (1.0 if no gaps)
 *   habitScore    = (weeksHit × 10) + (earlyWeeksHit × 10) + (recoveryRate × 50) - (maxGap × 5)
 *
 *   isQualified   = rolling average (totalPages / daysSinceEnrollment) >= dailyGoal
 *   progressValue = habitScore (used for club leaderboard sort)
 */
function _compute10PagesState_(chal, memberId, enrolledOn, pageLogs, now, existing) {
  const cfg          = chal.goalConfig || {};
  const year         = cfg.year        || now.getFullYear();
  const dailyGoal    = cfg.dailyGoal   || TEN_PPA_DAILY_GOAL;
  const weeklyThresh = dailyGoal * 7;   // 70 by default
  const yearlyGoal   = dailyGoal * 365;

  const nowMs         = now.getTime();
  const enrollMs      = isNaN(enrolledOn.getTime()) ? nowMs : enrolledOn.getTime();
  const MS_PER_DAY    = 86400000;
  const MS_PER_WEEK   = 7 * MS_PER_DAY;

  const daysSinceEnrollment = Math.max(0, Math.floor((nowMs - enrollMs) / MS_PER_DAY));
  const totalWeeksElapsed   = Math.floor(daysSinceEnrollment / 7);

  // ── Build challenge date window ──────────────────────────────────────────
  // Pages only count from enrolledOn onwards (or challenge startDate, whichever is later).
  const chalStartMs  = _chalpassParseDate_(chal.startDate).getTime();
  const chalEndMs    = _chalpassParseDate_(chal.endDate).getTime();
  const windowStartMs = Math.max(enrollMs, isNaN(chalStartMs) ? 0 : chalStartMs);
  const windowEndMs   = isNaN(chalEndMs)  ? nowMs : Math.min(nowMs, chalEndMs);

  // ── Build weekly page buckets (enrollment-relative) ──────────────────────
  // weekPages[i] = total pages logged in week i
  const weekPages = {};
  let totalPages    = 0;
  const monthlyBreakdown = {}; // "YYYY-MM" → pages

  for (let li = 0; li < pageLogs.length; li++) {
    const log = pageLogs[li];
    if (log.dateMs < windowStartMs || log.dateMs > windowEndMs) continue;
    totalPages += log.pages;

    // Enrollment-relative week index
    const weekIdx = Math.floor((log.dateMs - enrollMs) / MS_PER_WEEK);
    if (weekIdx < 0) continue; // logged before enrollment — skip
    weekPages[weekIdx] = (weekPages[weekIdx] || 0) + log.pages;

    // Monthly breakdown
    const d = new Date(log.dateMs);
    const mKey = d.getFullYear() + '-' + _pad2_(d.getMonth() + 1);
    monthlyBreakdown[mKey] = (monthlyBreakdown[mKey] || 0) + log.pages;
  }

  // ── Compute habitScore components ────────────────────────────────────────
  // Only count completed (elapsed) weeks — future weeks are not graded.
  let weeksHit      = 0;
  let earlyWeeksHit = 0;

  // Gap analysis: sequence of T/F per elapsed week
  const weekHitSeq = [];
  for (let w = 0; w < totalWeeksElapsed; w++) {
    const hit = (weekPages[w] || 0) >= weeklyThresh;
    weekHitSeq.push(hit);
    if (hit) {
      weeksHit++;
      if (w < TEN_PPA_EARLY_WEEKS) earlyWeeksHit++;
    }
  }

  // maxGap and recoveryRate from gap run analysis
  let maxGap        = 0;
  let currentGap    = 0;
  let totalGapEvents = 0;   // number of distinct gap runs
  let singleWkGaps   = 0;   // gap runs of exactly 1 week

  for (let w = 0; w < weekHitSeq.length; w++) {
    if (!weekHitSeq[w]) {
      currentGap++;
    } else {
      if (currentGap > 0) {
        totalGapEvents++;
        if (currentGap === 1) singleWkGaps++;
        if (currentGap > maxGap) maxGap = currentGap;
        currentGap = 0;
      }
    }
  }
  // Close any trailing gap
  if (currentGap > 0) {
    totalGapEvents++;
    if (currentGap === 1) singleWkGaps++;
    if (currentGap > maxGap) maxGap = currentGap;
  }

  const recoveryRate = totalGapEvents === 0 ? 1.0 : singleWkGaps / totalGapEvents;

  const habitScore = Math.max(0,
    (weeksHit      * 10) +
    (earlyWeeksHit * 10) +
    Math.round(recoveryRate * 50) -
    (maxGap        * 5)
  );

  const maxAchievableScore = (totalWeeksElapsed * 10) + (Math.min(totalWeeksElapsed, 10) * 10) + 50;
  const habitScoreNorm = totalWeeksElapsed >= 1
    ? Math.min(100, Math.round(habitScore / maxAchievableScore * 100))
    : null;

  const avgPagesPerDay = daysSinceEnrollment > 0
    ? Math.round((totalPages / daysSinceEnrollment) * 10) / 10
    : 0;

  const isQualified = avgPagesPerDay >= dailyGoal;

  return {
    progressValue: habitScore,
    state: {
      year                : year,
      dailyGoal           : dailyGoal,
      yearlyGoal          : yearlyGoal,
      totalPages          : totalPages,
      daysSinceEnrollment : daysSinceEnrollment,
      avgPagesPerDay      : avgPagesPerDay,
      isQualified         : isQualified,
      weeksHit            : weeksHit,
      earlyWeeksHit       : earlyWeeksHit,
      maxGap              : maxGap,
      recoveryRate        : Math.round(recoveryRate * 1000) / 1000,
      habitScore          : habitScore,
      habitScoreNorm      : habitScoreNorm,   // normalized 0–100; null before first complete week
      weeklyPages         : weekPages,        // {weekIndex: pages} — sparse map
      monthlyBreakdown    : monthlyBreakdown,
      lastSyncedOn        : _chalpassTimestamp_(now)
    }
  };
}


// ── PAGE_COUNT compute ─────────────────────────────────────────────────────

/**
 * Function: _computePageCountState_()
 * Parameters:
 *   chal       {Object} - challenge record
 *   memberId   {string}
 *   enrolledOn {Date}
 *   pageLogs   {Array}  - [{dateMs, pages}]
 *   now        {Date}
 *   existing   {Object} - existing progressStateJson
 * Return Type: {progressValue: number, state: Object}
 * Logic Summary: Sums page log entries within the challenge date window,
 *   preserves personalGoal from existing state, computes a pace projection.
 */
function _computePageCountState_(chal, memberId, enrolledOn, pageLogs, now, existing) {
  const chalStartMs  = _chalpassParseDate_(chal.startDate).getTime();
  const chalEndMs    = _chalpassParseDate_(chal.endDate).getTime();
  const nowMs        = now.getTime();
  const windowEndMs  = isNaN(chalEndMs)  ? nowMs : chalEndMs;
  const windowStartMs = isNaN(chalStartMs) ? 0 : chalStartMs;

  const personalGoal = existing.personalGoal || chal.goalValue || 5000;

  let totalPages = 0;
  const monthlyBreakdown = {};
  const weeklyBreakdown  = {};

  for (let li = 0; li < pageLogs.length; li++) {
    const log = pageLogs[li];
    if (log.dateMs < windowStartMs || log.dateMs > windowEndMs) continue;
    totalPages += log.pages;

    const d    = new Date(log.dateMs);
    const mKey = d.getFullYear() + '-' + _pad2_(d.getMonth() + 1);
    monthlyBreakdown[mKey] = (monthlyBreakdown[mKey] || 0) + log.pages;

    const wKey = _isoWeekKey_(d);
    weeklyBreakdown[wKey] = (weeklyBreakdown[wKey] || 0) + log.pages;
  }

  // Pacing projection: extrapolate current rate to challenge end
  const daysElapsed  = Math.max(1, Math.floor((nowMs - windowStartMs) / 86400000));
  const totalDays    = isNaN(chalEndMs)
    ? 365
    : Math.max(1, Math.floor((chalEndMs - windowStartMs) / 86400000));
  const pacingProjection = Math.round((totalPages / daysElapsed) * totalDays);

  const ratio = pacingProjection / personalGoal;
  const aheadBehindTarget = ratio >= 1.05 ? 'ahead' : ratio < 0.9 ? 'behind' : 'on track';

  return {
    progressValue: totalPages,
    state: {
      personalGoal        : personalGoal,
      totalPages          : totalPages,
      monthlyBreakdown    : monthlyBreakdown,
      weeklyBreakdown     : weeklyBreakdown,
      pacingProjection    : pacingProjection,
      aheadBehindTarget   : aheadBehindTarget
    }
  };
}


// ── BOOK_COUNT compute ─────────────────────────────────────────────────────

/**
 * Function: _computeBookCountState_()
 * Parameters:
 *   chal       {Object} - challenge record
 *   memberId   {string}
 *   enrolledOn {Date}
 *   bookReads  {Array}  - [{dateMs, shelfId, bookId}] from MemberShelfDB Finished rows
 *   now        {Date}
 *   existing   {Object} - existing progressStateJson
 * Return Type: {progressValue: number, state: Object}
 * Logic Summary: Counts ARKA_ACTTYP_BOOKREAD events within the challenge
 *   date window. Preserves personalGoal from existing state.
 *   booksRead[] tracks unique finish events for the challenge period.
 */
function _computeBookCountState_(chal, memberId, enrolledOn, bookReads, now, existing) {
  const chalStartMs  = _chalpassParseDate_(chal.startDate).getTime();
  const chalEndMs    = _chalpassParseDate_(chal.endDate).getTime();
  const nowMs        = now.getTime();
  const windowEndMs  = isNaN(chalEndMs)  ? nowMs : chalEndMs;
  const windowStartMs = isNaN(chalStartMs) ? 0 : chalStartMs;

  const personalGoal = existing.personalGoal || chal.goalValue || 24;

  const booksRead = [];
  const monthlyBreakdown = {};

  for (let bi = 0; bi < bookReads.length; bi++) {
    const ev = bookReads[bi];
    if (ev.dateMs < windowStartMs || ev.dateMs > windowEndMs) continue;
    booksRead.push({ shelfId: ev.shelfId, finishedOn: _chalpassFmtDdMmmYyyy_(new Date(ev.dateMs)) });

    const d    = new Date(ev.dateMs);
    const mKey = d.getFullYear() + '-' + _pad2_(d.getMonth() + 1);
    monthlyBreakdown[mKey] = (monthlyBreakdown[mKey] || 0) + 1;
  }

  const totalBooks = booksRead.length;

  const daysElapsed   = Math.max(1, Math.floor((nowMs - windowStartMs) / 86400000));
  const totalDays     = isNaN(chalEndMs)
    ? 365
    : Math.max(1, Math.floor((chalEndMs - windowStartMs) / 86400000));
  const pacingProjection = Math.round((totalBooks / daysElapsed) * totalDays);

  return {
    progressValue: totalBooks,
    state: {
      personalGoal        : personalGoal,
      booksRead           : booksRead,
      totalBooks          : totalBooks,
      pacingProjection    : pacingProjection,
      monthlyBreakdown    : monthlyBreakdown
    }
  };
}


// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Parses Arka timestamp strings and native Date objects into a Date.
 * Handles: "dd-MM-yyyy HH:mm:ss +NNNN", "dd-MMM-yyyy", ISO strings, and Date objects.
 */
function _chalpassParseDate_(raw) {
  if (!raw) return new Date(NaN);
  if (raw instanceof Date) return raw;
  const str = raw.toString().trim();

  // Arka Z-Format: "dd-MM-yyyy HH:mm:ss +NNNN"
  const zMatch = str.match(/^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})\s+([\+\-]\d{4})$/);
  if (zMatch) {
    const iso = zMatch[3] + '-' + zMatch[2] + '-' + zMatch[1] +
                'T' + zMatch[4] + ':' + zMatch[5] + ':' + zMatch[6] + zMatch[7];
    return new Date(iso);
  }

  // Short date: "dd-MMM-yyyy"
  const MONTHS = { Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11 };
  const sMatch = str.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (sMatch && MONTHS[sMatch[2]] !== undefined) {
    return new Date(parseInt(sMatch[3], 10), MONTHS[sMatch[2]], parseInt(sMatch[1], 10));
  }

  return new Date(str);
}

/**
 * Returns an ISO-week string "YYYY-Www" for a given Date.
 */
function _isoWeekKey_(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
  const yearStart = new Date(d.getFullYear(), 0, 4);
  const weekNum   = 1 + Math.round(
    ((d.getTime() - yearStart.getTime()) / 86400000 - 3 + (yearStart.getDay() + 6) % 7) / 7
  );
  return d.getFullYear() + '-W' + (weekNum < 10 ? '0' : '') + weekNum;
}

/** Zero-pads a number to 2 digits. */
function _pad2_(n) {
  return n < 10 ? '0' + n : '' + n;
}

/**
 * Formats a Date as "dd-MMM-yyyy" (e.g. "05-Jan-2026") for booksRead.finishedOn.
 */
function _chalpassFmtDdMmmYyyy_(date) {
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return _pad2_(date.getDate()) + '-' + MONTHS[date.getMonth()] + '-' + date.getFullYear();
}

/**
 * Builds an Arka-format timestamp string "dd-MM-yyyy HH:mm:ss +0000".
 * Uses UTC so the string is timezone-neutral for a server-side script.
 */
function _chalpassTimestamp_(date) {
  const d = date || new Date();
  return _pad2_(d.getUTCDate()) + '-' + _pad2_(d.getUTCMonth() + 1) + '-' + d.getUTCFullYear() +
         ' ' + _pad2_(d.getUTCHours()) + ':' + _pad2_(d.getUTCMinutes()) + ':' + _pad2_(d.getUTCSeconds()) +
         ' +0000';
}


// ── Trigger installation ───────────────────────────────────────────────────

/**
 * Function: installArkaChallengePassTrigger()
 * Parameters: none
 * Return Type: void
 * Logic Summary: Creates a daily time-based trigger at 00:12 (12 min after
 *   midnight) targeting runArkaChallengePass(). Run this once from the
 *   Apps Script editor. Safe to re-run — removes stale triggers first.
 */
function installArkaChallengePassTrigger() {
  // Remove any existing triggers for this function to avoid duplicates
  ScriptApp.getProjectTriggers()
    .filter(function(t) { return t.getHandlerFunction() === 'runArkaChallengePass'; })
    .forEach(function(t) { ScriptApp.deleteTrigger(t); });

  ScriptApp.newTrigger('runArkaChallengePass')
    .timeBased()
    .atHour(0)
    .nearMinute(12)
    .everyDays(1)
    .create();

  console.log('ArkaChallengePass: daily trigger installed at 00:12.');
}
