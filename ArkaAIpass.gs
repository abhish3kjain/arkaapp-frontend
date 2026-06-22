/**
 * ARKA AI PASS — Standalone Gemini Coach Script    v1.4.0
 * Full version history: VERSIONS.md
 *
 * Responsibility: generate personalised AI reading advice for every active
 * Arka member by calling the Gemini API, then writing the result back into
 * each member's CoachInsights JSON in MemberDB Col S.
 *
 * Separation of concerns
 * ──────────────────────
 * MasterEngine  →  stats, badges, insight chips, tasks  (fast, no API calls)
 * ArkaAIPass    →  Gemini AI advice only                (rate-limited, chained)
 *
 * Execution model
 * ───────────────
 * 1. A time-based trigger fires runArkaAIPass() ~5 min after MasterEngine.
 * 2. runArkaAIPass() checks the ARKAAIPASS_READY flag (set by MasterEngine).
 * 3. It reads a cursor from PropertiesService (AIPASS_MEMBER_CURSOR).
 *    - First run of the night: cursor = 0 (start from member 1).
 *    - Chained run: cursor = last processed member index + 1.
 * 4. It processes up to AIPASS_MEMBERS_PER_RUN members, sleeping
 *    AIPASS_INTER_CALL_SLEEP ms between Gemini calls to respect 15 RPM.
 * 5. Before the 6-minute GAS wall, it saves the cursor and schedules the
 *    next trigger via ScriptApp for AIPASS_CHAIN_DELAY_MINUTES minutes later.
 * 6. When all members are processed, cursor is cleared, the ready flag is
 *    cleared, and no further trigger is scheduled.
 *
 * Staleness gate
 * ──────────────
 * If a member's statSnapshot fingerprint matches the one stored last night,
 * their aiAdvice has not changed — no Gemini call is made and the stored
 * advice is kept as-is. This typically reduces nightly Gemini calls by 50–70%.
 *
 * Trigger setup (one-time manual step)
 * ─────────────────────────────────────
 * Run installArkaAIPassTrigger() once from the Apps Script editor.
 * This installs a daily trigger at 00:10 (10 min after midnight, giving
 * MasterEngine time to complete). The chain trigger is managed dynamically
 * by the script itself — do not install multiple triggers manually.
 *
 * Kill switch
 * ───────────
 * Set Script Property  GEMINI_COACH_ENABLED = 'false'  to disable all AI
 * calls without touching any code. runArkaAIPass() exits immediately if set.
 */

// ── Constants ──────────────────────────────────────────────────────────────

/** Google Spreadsheet that backs the Arka Club app. */
const AIPASS_SPREADSHEET_ID = '1qXsAAO_9aIEJuTTQ1ziX9s5plvm6WHaVI_zaKcSXF-4';

/** MemberDB sheet name — must match MasterEngine constant. */
const AIPASS_MEMBERS_SHEET = 'MemberDB';

/** Gemini model — free tier: 15 RPM, 1000 RPD. */
const AIPASS_GEMINI_MODEL = 'gemini-2.5-flash-lite';

/** Gemini endpoint built from model name. */
const AIPASS_GEMINI_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/' +
  AIPASS_GEMINI_MODEL + ':generateContent';

/** Max output tokens per call (~275 words of advice). */
const AIPASS_MAX_OUTPUT_TOKENS = 400;

/**
 * Members processed per trigger run.
 * At 4200ms sleep between calls: 40 members × 4.2s = 168s ≈ 2.8 min.
 * Well under the 6-minute GAS limit with comfortable headroom for sheet I/O.
 * Increase toward 70 only if sheet reads are consistently fast.
 */
const AIPASS_MEMBERS_PER_RUN = 40;

/**
 * Sleep between Gemini calls in milliseconds.
 * 15 RPM limit = minimum 4000ms. 4200ms gives a safe margin.
 */
const AIPASS_INTER_CALL_SLEEP = 4200;

/**
 * Minutes between chained trigger runs.
 * Set to 3 so the next batch starts before the previous one's output is stale,
 * but late enough that GAS trigger scheduling is reliable.
 */
const AIPASS_CHAIN_DELAY_MINUTES = 3;

/**
 * Activity gate: members whose last page log is older than this many days
 * get no new AI advice. Their stored advice from a prior night is preserved.
 * Extended to 14 days so weekend-only readers (who may log every 7–10 days)
 * do not miss their nightly AI refresh.
 */
const AIPASS_INACTIVE_DAYS_THRESHOLD = 14;

/** PropertiesService key written by MasterEngine on successful completion. */
const AIPASS_READY_FLAG_KEY = 'ARKAAIPASS_READY';

/** PropertiesService key storing the inter-run member cursor (row index). */
const AIPASS_CURSOR_KEY = 'AIPASS_MEMBER_CURSOR';

/** PropertiesService key tracking the total members eligible this run (for logging). */
const AIPASS_TOTAL_KEY = 'AIPASS_TOTAL_ELIGIBLE';

/** Function name used when scheduling the chain trigger — must match exactly. */
const AIPASS_FUNCTION_NAME = 'runArkaAIPass';


// ── Entry point ────────────────────────────────────────────────────────────

/**
 * runArkaAIPass()
 *
 * Main entry point, called by the time-based trigger and by chain triggers.
 * Processes one batch of members, then either chains itself or finalises.
 */
function runArkaAIPass() {
  var props = PropertiesService.getScriptProperties();

  // ── Kill switch — checked first, before any sheet I/O ──────────────────
  var killSwitch = props.getProperty('GEMINI_COACH_ENABLED');
  if (killSwitch === 'false') {
    console.log('ArkaAIPass: GEMINI_COACH_ENABLED=false — exiting.');
    _aiPassCleanup_(props);
    return;
  }

  // ── Readiness gate — MasterEngine must have completed first ────────────
  var isReady = props.getProperty(AIPASS_READY_FLAG_KEY);
  if (isReady !== 'true') {
    console.warn('ArkaAIPass: ARKAAIPASS_READY flag not set — MasterEngine may not have completed yet. Will retry next scheduled run.');
    return;
  }

  // ── API key check ───────────────────────────────────────────────────────
  var apiKey = props.getProperty('GEMINI_API_KEY');
  if (!apiKey) {
    console.error('ArkaAIPass: GEMINI_API_KEY not set in Script Properties — exiting.');
    _aiPassCleanup_(props);
    return;
  }

  // ── Load MemberDB ───────────────────────────────────────────────────────
  var ss      = SpreadsheetApp.openById(AIPASS_SPREADSHEET_ID);
  var memSheet = ss.getSheetByName(AIPASS_MEMBERS_SHEET);
  if (!memSheet) {
    console.error('ArkaAIPass: MemberDB sheet not found.');
    _aiPassCleanup_(props);
    return;
  }

  var memData = memSheet.getDataRange().getValues();
  // Row 0 is the header — data rows start at index 1.
  var totalDataRows = memData.length - 1;

  if (totalDataRows <= 0) {
    console.log('ArkaAIPass: MemberDB is empty — nothing to process.');
    _aiPassCleanup_(props);
    return;
  }

  // ── Read cursor ─────────────────────────────────────────────────────────
  // Cursor is the memData row index (1-based) to start from this run.
  // First run of the night: cursor = 1. Chained run: cursor > 1.
  var cursor = parseInt(props.getProperty(AIPASS_CURSOR_KEY) || '1', 10);
  if (isNaN(cursor) || cursor < 1) cursor = 1;

  // Also load PageLogDB for the activity gate check.
  var pageLogData = ss.getSheetByName('PageLogDB').getDataRange().getValues();

  // Pre-index page logs by memberId → most recent log timestamp ms.
  // O(n) scan done once here rather than per-member inside the loop.
  var lastLogMsPerMember = {};
  for (var pl = 1; pl < pageLogData.length; pl++) {
    var plMemberId = (pageLogData[pl][2] || '').toString();
    if (!plMemberId) continue;
    var plDelta = Number(pageLogData[pl][4]) || 0;
    if (plDelta <= 0) continue;  // Skip negative correction entries
    var plDateStr = (pageLogData[pl][1] || '').toString();
    var plMs = _aiPassParseDate_(plDateStr);
    if (isNaN(plMs)) continue;
    if (!lastLogMsPerMember[plMemberId] || plMs > lastLogMsPerMember[plMemberId]) {
      lastLogMsPerMember[plMemberId] = plMs;
    }
  }

  // ── Process batch ───────────────────────────────────────────────────────
  var nowMs                = Date.now();
  var inactiveCutoffMs     = AIPASS_INACTIVE_DAYS_THRESHOLD * 24 * 60 * 60 * 1000;
  var processedThisRun     = 0;
  var calledGeminiThisRun  = 0;
  var skippedInactive      = 0;
  var skippedFingerprint   = 0;
  var endRow               = Math.min(cursor + AIPASS_MEMBERS_PER_RUN - 1, totalDataRows);

  // Track which rows were actually modified so we write only changed cells.
  var modifiedRows = []; // Array of { rowIndex, newJson }

  for (var ri = cursor; ri <= endRow; ri++) {
    var memberId = (memData[ri][0] || '').toString().trim();
    if (!memberId) continue;

    processedThisRun++;

    // ── Activity gate ─────────────────────────────────────────────────────
    // Skip members who haven't logged any pages recently.
    // Their stored aiAdvice (if any) remains untouched.
    var lastLogMs      = lastLogMsPerMember[memberId] || 0;
    var daysSinceLog   = lastLogMs > 0 ? (nowMs - lastLogMs) / (24 * 60 * 60 * 1000) : 9999;
    if (daysSinceLog > AIPASS_INACTIVE_DAYS_THRESHOLD) {
      skippedInactive++;
      continue;
    }

    // ── Read existing Col S JSON ──────────────────────────────────────────
    var existingColS   = (memData[ri][18] || '').toString();
    var existingParsed = null;
    try {
      if (existingColS) existingParsed = JSON.parse(existingColS);
    } catch (e) { /* malformed — will regenerate */ }

    if (!existingParsed || !existingParsed.statSnapshot) {
      // MasterEngine hasn't written a fresh snapshot for this member yet.
      // This shouldn't happen (MasterEngine runs first) but skip gracefully.
      console.warn('ArkaAIPass: no statSnapshot for ' + memberId + ' — skipping.');
      continue;
    }

    var statSnapshot = existingParsed.statSnapshot;
    var insights     = existingParsed.insights || [];

    // Require at least one insight before calling Gemini.
    // Members with zero insights are very new or have no activity data.
    if (insights.length === 0) continue;

    // ── Staleness fingerprint check ───────────────────────────────────────
    // Build a fingerprint from the fields that materially change the advice.
    // If it matches the stored fingerprint, skip the Gemini call entirely.
    var currentFingerprint = _aiPassBuildFingerprint_(statSnapshot);
    var storedFingerprint  = existingParsed.aiFingerprint || null;
    var storedAdvice       = existingParsed.aiAdvice      || null;

    if (storedFingerprint && storedFingerprint === currentFingerprint && storedAdvice) {
      skippedFingerprint++;
      console.log('ArkaAIPass: fingerprint match for ' + memberId + ' — reusing stored advice.');
      continue; // No write needed — Col S already has fresh advice for this snapshot
    }

    // ── Gemini call ───────────────────────────────────────────────────────
    var displayName = (memData[ri][3] || '').toString().trim();
    var newAdvice   = null;
    try {
      newAdvice = _aiPassCallGemini_(apiKey, displayName, insights, statSnapshot);
      calledGeminiThisRun++;
    } catch (geminiErr) {
      console.warn('ArkaAIPass: Gemini call failed for ' + memberId + ' — ' + geminiErr.toString());
      // Non-fatal: keep existing advice, skip the write for this member
      continue;
    }

    // ── Update the Col S JSON with new advice and fingerprint ─────────────
    existingParsed.aiAdvice      = newAdvice;
    existingParsed.aiFingerprint = currentFingerprint;
    // Update generatedAt to reflect when advice was actually regenerated.
    existingParsed.aiGeneratedAt = Utilities.formatDate(
      new Date(), Session.getScriptTimeZone(), 'dd-MMM-yyyy HH:mm'
    );

    modifiedRows.push({
      rowIndex: ri + 1, // 1-based sheet row (ri is 0-based memData index)
      newJson : JSON.stringify(existingParsed)
    });

    // ── Rate limit sleep — only when a Gemini call was actually made ──────
    // No sleep when the fingerprint matched (no API call was made).
    Utilities.sleep(AIPASS_INTER_CALL_SLEEP);
  }

  // ── Batch write modified rows back to sheet ───────────────────────────
  // Write only rows that changed — avoids touching MasterEngine's work.
  if (modifiedRows.length > 0) {
    modifiedRows.forEach(function(mod) {
      // Col S = column 19 (1-based). Write only the single cell.
      memSheet.getRange(mod.rowIndex, 19).setValue(mod.newJson);
    });
    console.log('ArkaAIPass: wrote ' + modifiedRows.length + ' updated Col S cells.');
  }

  // ── Log run summary ───────────────────────────────────────────────────
  console.log(
    'ArkaAIPass batch complete — ' +
    'cursor: ' + cursor + '→' + (endRow + 1) + ', ' +
    'processed: ' + processedThisRun + ', ' +
    'gemini calls: ' + calledGeminiThisRun + ', ' +
    'fingerprint skips: ' + skippedFingerprint + ', ' +
    'inactive skips: ' + skippedInactive
  );

  // ── Chain or finalise ─────────────────────────────────────────────────
  var nextCursor = endRow + 1;

  if (nextCursor > totalDataRows) {
    // All members processed — clean up and done for tonight.
    console.log('ArkaAIPass: all members processed. Run complete.');
    _aiPassCleanup_(props);
  } else {
    // More members remain — save cursor and schedule the next trigger.
    props.setProperty(AIPASS_CURSOR_KEY, nextCursor.toString());
    _aiPassScheduleNextRun_();
    console.log('ArkaAIPass: chaining — next run starts at cursor ' + nextCursor + ' in ' + AIPASS_CHAIN_DELAY_MINUTES + ' min.');
  }
}


// ── Trigger management ─────────────────────────────────────────────────────

/**
 * installArkaAIPassTrigger()
 *
 * One-time setup. Run manually from the Apps Script editor once.
 * Installs a daily time-based trigger at 00:10 (10 minutes after midnight)
 * so MasterEngine has time to complete before the AI pass starts.
 *
 * Chain triggers are installed/removed dynamically by the script itself —
 * do not call this more than once, and do not install additional triggers
 * manually or you will get duplicate runs.
 */
function installArkaAIPassTrigger() {
  // Remove any pre-existing triggers for this function to prevent duplicates.
  _aiPassRemoveAllTriggers_();

  ScriptApp.newTrigger(AIPASS_FUNCTION_NAME)
    .timeBased()
    .atHour(0)
    .nearMinute(10)
    .everyDays(1)
    .create();

  console.log('ArkaAIPass: daily trigger installed at 00:10.');
}

/**
 * _aiPassScheduleNextRun_()
 *
 * Schedules a one-off trigger to fire in AIPASS_CHAIN_DELAY_MINUTES minutes.
 * Called at the end of each partial run when more members remain.
 * Only one chain trigger is ever active at a time.
 *
 * @private
 */
function _aiPassScheduleNextRun_() {
  // Remove any stale chain triggers before adding a new one.
  // The daily trigger must be preserved — only remove triggers whose handler
  // is runArkaAIPass AND which are not the daily at-hour trigger.
  var allTriggers = ScriptApp.getProjectTriggers();
  allTriggers.forEach(function(t) {
    if (t.getHandlerFunction() === AIPASS_FUNCTION_NAME &&
        t.getEventType() === ScriptApp.EventType.CLOCK &&
        t.getTriggerSource() === ScriptApp.TriggerSource.CLOCK) {
      // Inspect the trigger to decide if it's the daily or a chain trigger.
      // GAS doesn't expose trigger interval directly — we use the fact that
      // chain triggers are always in the near future (< 10 minutes away).
      // Safe heuristic: delete all non-daily triggers for this function and
      // recreate only the chain trigger. The daily trigger is re-installed
      // by installArkaAIPassTrigger() which is only called once.
      try { ScriptApp.deleteTrigger(t); } catch (e) {}
    }
  });

  var nextRunAt = new Date(Date.now() + AIPASS_CHAIN_DELAY_MINUTES * 60 * 1000);
  ScriptApp.newTrigger(AIPASS_FUNCTION_NAME)
    .timeBased()
    .at(nextRunAt)
    .create();
}

/**
 * _aiPassRemoveAllTriggers_()
 *
 * Removes ALL triggers for runArkaAIPass. Used by installArkaAIPassTrigger()
 * and cleanup to ensure a clean slate.
 *
 * @private
 */
function _aiPassRemoveAllTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === AIPASS_FUNCTION_NAME) {
      try { ScriptApp.deleteTrigger(t); } catch (e) {}
    }
  });
}

/**
 * _aiPassCleanup_()
 *
 * Clears the cursor and ready flag from PropertiesService and removes any
 * chain triggers. Called when all members are processed or on abort.
 *
 * Does NOT remove the daily trigger — that must persist for the next night.
 *
 * @param {GoogleAppsScript.Properties.Properties} props
 * @private
 */
function _aiPassCleanup_(props) {
  props.deleteProperty(AIPASS_CURSOR_KEY);
  props.deleteProperty(AIPASS_READY_FLAG_KEY);
  props.deleteProperty(AIPASS_TOTAL_KEY);

  // Remove only chain (one-off) triggers — preserve the daily trigger.
  // Strategy: delete all runArkaAIPass triggers, then reinstall the daily one.
  _aiPassRemoveAllTriggers_();
  ScriptApp.newTrigger(AIPASS_FUNCTION_NAME)
    .timeBased()
    .atHour(0)
    .nearMinute(10)
    .everyDays(1)
    .create();
}


// ── Gemini call ────────────────────────────────────────────────────────────

/**
 * _aiPassCallGemini_()
 *
 * Makes a single Gemini API call using a four-layer coaching brief and returns
 * the advice text. Throws on non-200 responses or unexpected response structure.
 *
 * Prompt layers:
 *   Layer 1 — Reading DNA: archetype + all resolved persona axis verdicts
 *   Layer 2 — Goals & Identity: ReadingGoal, FavGenres, ShortBio
 *   Layer 3 — Current Reading State: pace (with week position), per-book
 *             velocity with pace-ratio flags, recent finishes, streak
 *   Layer 4 — Structured Commitments: active challenge goals + history
 *
 * Gemini is directed to pick ONE coaching angle and anchor every sentence in
 * the member's specific numbers, named books, or persona axes — no generic
 * reading advice is permitted by the prompt rules.
 *
 * @param {string} apiKey       - Gemini API key from Script Properties
 * @param {string} displayName  - Member's display name for warm address
 * @param {Array}  insights     - Computed insight chips from Col S JSON
 * @param {Object} statSnapshot - Enriched stats context object from Col S JSON
 * @returns {string} Advice paragraph text
 * @private
 */
function _aiPassCallGemini_(apiKey, displayName, insights, statSnapshot) {
  var firstName = displayName ? displayName.split(' ')[0] : 'there';

  // ── Layer 1: Reading DNA ────────────────────────────────────────────────
  var dnaLines = [];
  var persona  = statSnapshot.personaDNA;
  if (persona && persona.archetypeName) {
    dnaLines.push(firstName + ' is ' + persona.archetypeName +
      (persona.archetypeTagline ? ' — "' + persona.archetypeTagline + '"' : ''));
    var axes = persona.axes || {};
    Object.keys(axes).forEach(function(axisName) {
      var ax = axes[axisName];
      dnaLines.push('- ' + axisName + ': ' + ax.side +
        (ax.note ? ' (' + ax.note + ')' : ''));
    });
  } else {
    dnaLines.push('Reading personality not yet resolved — use the stats only.');
  }
  var dnaSection = dnaLines.join('\n');

  // ── Layer 2: Goals & Identity ───────────────────────────────────────────
  var goalLines = [];
  if ((statSnapshot.readingGoal || '').trim()) {
    goalLines.push('- Reading goal: "' + statSnapshot.readingGoal.trim() + '"');
  }
  if ((statSnapshot.favGenres || '').trim()) {
    goalLines.push('- Favourite genres: ' + statSnapshot.favGenres.trim());
  }
  if ((statSnapshot.shortBio || '').trim()) {
    goalLines.push('- In their own words: "' + statSnapshot.shortBio.trim() + '"');
  }
  var goalsSection = goalLines.length > 0
    ? goalLines.join('\n')
    : '(none provided — rely on the data only)';

  // ── Layer 3: Current Reading State ─────────────────────────────────────
  var readingLines = [];

  // Week pace — always reference projected value so Gemini knows the week
  // is not yet complete and pagesThisWeek is a partial figure.
  var paceNote = statSnapshot.daysIntoWeek
    ? ' (day ' + statSnapshot.daysIntoWeek + ' of 7 — projected ' +
      statSnapshot.projectedWeeklyPace + '/week vs ' +
      statSnapshot.avg4WeekPagesPerWeek + ' 4-week avg)'
    : ' (vs ' + statSnapshot.avg4WeekPagesPerWeek + ' 4-week avg)';
  readingLines.push('- Week pages so far: ' + statSnapshot.pagesThisWeek + paceNote);

  readingLines.push('- Streak: ' + statSnapshot.currentStreak + ' weeks' +
    (statSnapshot.bestStreak > 0 ? ' · personal best: ' + statSnapshot.bestStreak + ' weeks' : ''));

  var lastLogNote = statSnapshot.daysSinceLastLog + ' day(s) since last log';
  if (statSnapshot.comebackAfterDays) {
    lastLogNote += ' — returning after a ' + statSnapshot.comebackAfterDays + '-day absence';
  }
  readingLines.push('- ' + lastLogNote.charAt(0).toUpperCase() + lastLogNote.slice(1));

  // Daily pace from RSE V1 — pages/day (not pages/session like booksVelocity).
  // Gives Gemini a complementary signal: how consistently the member reads day-to-day.
  var rse = statSnapshot.memberReadingSpeed;
  if (rse && rse.overallAvgPace > 0) {
    var rseLine = '- Daily reading pace: ' + rse.overallAvgPace + ' pages/day (all-time avg)';
    if (rse.recentPace > 0) {
      rseLine += ', ' + rse.recentPace + ' pages/day (last 30 days)';
    }
    if (rse.moodMultiplier !== null && rse.moodMultiplier !== undefined) {
      var moodLabel = rse.moodMultiplier >= 1.3 ? 'reading notably faster than their norm — high momentum phase'
                    : rse.moodMultiplier <= 0.7 ? 'reading notably slower than their norm — low momentum phase'
                    : 'pace broadly in line with their norm';
      rseLine += ' — ' + moodLabel + ' (multiplier: ' + rse.moodMultiplier + 'x)';
    }
    readingLines.push(rseLine);
    if (rse.genrePace && Object.keys(rse.genrePace).length > 0) {
      var genreLines = Object.keys(rse.genrePace).map(function(g) {
        return g + ': ' + rse.genrePace[g].pace + ' pg/day (' + rse.genrePace[g].booksUsed + ' books)';
      }).join(', ');
      readingLines.push('- Genre pace: ' + genreLines);
    }
  }

  // Per-book velocity — the core of the new coaching intelligence.
  // A ← PACE LOW flag tells Gemini this book is a coaching opportunity.
  // Genre note added when RSE V1 has a pace for that genre so Gemini can
  // distinguish book-specific slowness from genre-normal behaviour.
  var booksVelocity = statSnapshot.currentBooksVelocity || [];
  if (booksVelocity.length > 0) {
    booksVelocity.forEach(function(bv) {
      var pagesLeftStr = bv.pagesLeft !== null
        ? bv.pagesLeft + ' pages left'
        : 'page count unknown';
      // Prefer RSE pages/day; fall back to session-based when not available
      var velocityNote;
      if (bv.avgPagesPerDayThisBook !== null && bv.avgPagesPerDayThisBook !== undefined
          && bv.memberOverallAvgPacePerDay) {
        velocityNote = bv.sessionsOnBook + ' session(s) on this book, avg ' +
          bv.avgPagesPerDayThisBook + ' pages/day';
        velocityNote += ' vs their usual ' + Math.round(bv.memberOverallAvgPacePerDay) + ' pages/day overall';
      } else {
        velocityNote = bv.sessionsOnBook + ' session(s) on this book, avg ' +
          bv.avgPagesPerSessionThisBook + ' pages/session';
        if (bv.memberOverallAvgPagesPerSession > 0) {
          velocityNote += ' vs their usual ' + bv.memberOverallAvgPagesPerSession + ' pages/session overall';
        }
      }
      // Annotate with genre pace/day from RSE V1 when available
      var primaryGenre = bv.genre ? bv.genre.split(',')[0].trim() : '';
      var genreRse     = rse && primaryGenre && rse.genrePace && rse.genrePace[primaryGenre];
      if (genreRse) {
        velocityNote += '; their ' + primaryGenre + ' pace is ' + genreRse.pace +
          ' pg/day (' + genreRse.booksUsed + ' books of history)';
      }
      var paceFlag = (bv.paceRatio < 0.6 && bv.sessionsOnBook >= 3)
        ? (genreRse ? ' ← PACE LOW vs overall norm (check if genre-normal for them)' : ' ← PACE NOTABLY LOW vs their norm')
        : '';
      readingLines.push('- Reading: "' + bv.title + '" (' + (bv.genre || 'unknown genre') +
        ', ' + pagesLeftStr + ') — ' + velocityNote + paceFlag);
    });
  } else if ((statSnapshot.currentReadingBooks || []).length > 0) {
    // Fallback for members without velocity data yet
    readingLines.push('- Reading: ' + statSnapshot.currentReadingBooks.join(', '));
  } else {
    readingLines.push('- Not actively reading anything at the moment.');
  }

  if ((statSnapshot.recentFinishedBooks || []).length > 0) {
    var recentStr = statSnapshot.recentFinishedBooks.map(function(b) {
      return '"' + b.title + '"' + (b.genre ? ' (' + b.genre + ')' : '');
    }).join(', ');
    readingLines.push('- Recently finished: ' + recentStr);
  }

  readingLines.push('- Books this year: ' + statSnapshot.booksFinishedThisYear +
    ' / ' + statSnapshot.totalBooksFinished + ' all-time · ' +
    statSnapshot.toReadCount + ' in To Read shelf');

  if (statSnapshot.dnfRate > 0) {
    readingLines.push('- DNF rate: ' + statSnapshot.dnfRate + '% of completed reads abandoned');
  }

  var currentReadingSection = readingLines.join('\n');

  // ── Layer 4b: Closest Badge + Level ────────────────────────────────────
  var progressLines = [];
  if (statSnapshot.nextBestBadge) {
    var nb = statSnapshot.nextBestBadge;
    progressLines.push('- Closest badge: ' + nb.caption + ' (' + nb.category + ') — '
                       + nb.actionText + ' (currently at ' + nb.current + ', needs ' + nb.threshold + ')');
  }
  if (statSnapshot.levelProximity) {
    var lp = statSnapshot.levelProximity;
    progressLines.push('- Next level: ' + lp.nextLevelName + ' — ' + lp.gapToNext + ' CP away'
                       + ' (rate ' + lp.ratingsNeeded + ' books OR write ' + lp.reviewsNeeded + ' review(s))');
  }
  var progressSection = progressLines.length > 0
    ? progressLines.join('\n')
    : '(no close badge or level targets)';

  // ── Layer 4: Structured Commitments ────────────────────────────────────
  var challengeLines = [];
  var ch = statSnapshot.challengeHistory;
  if (ch) {
    var pastTotal = (ch.wonCount || 0) + (ch.finishedCount || 0) + (ch.droppedCount || 0);
    if (pastTotal > 0) {
      challengeLines.push('- Challenge track record: ' + ch.wonCount + ' won, ' +
        ch.finishedCount + ' finished, ' + ch.droppedCount + ' dropped');
    }
    (ch.activeGoals || []).forEach(function(g) {
      var daysNote = g.daysLeft !== null ? g.daysLeft + ' days remaining' : 'no end date';
      var completionFlag = g.pctDone >= 100 ? ' ← GOAL ALREADY EXCEEDED' : '';
      challengeLines.push('- Challenge "' + g.title + '": ' + g.current + '/' + g.goalValue +
                          ' ' + g.goalUnit + ' · ' + g.pctDone + '% done · ' +
                          daysNote + completionFlag);
    });
  }
  var challengesSection = challengeLines.length > 0
    ? challengeLines.join('\n')
    : '(none active)';

  // ── Insight chips already displayed to the member ───────────────────────
  var insightSummary = insights.length > 0
    ? insights.map(function(ins) { return '- ' + ins.label + ': ' + ins.sub; }).join('\n')
    : '(none yet)';

  // ── Assemble the full prompt ────────────────────────────────────────────
  var prompt = [
    'You are a sharp reading analyst at Arka Readers Club. Write a brief personal observation for ' + firstName + '.',
    '',
    'LAYER 1 — READING DNA:',
    dnaSection,
    '',
    'LAYER 2 — STATED GOALS & IDENTITY:',
    goalsSection,
    '',
    'LAYER 3 — CURRENT READING STATE:',
    currentReadingSection,
    '',
    'LAYER 4 — CHALLENGES & COMMITMENTS:',
    challengesSection,
    '',
    'LAYER 4b — CLOSEST BADGE & NEXT LEVEL:',
    progressSection,
    '',
    'WHAT THEY ALREADY SEE IN-APP — do NOT repeat, only build on:',
    insightSummary,
    '',
    'COACHING TASK: Write 2–3 sentences. Choose ONE angle that is most interesting or actionable for this reader right now:',
    '(A) A pattern in their reading behaviour they may not have noticed',
    '(B) A tension between their reading style/DNA and what they are currently doing',
    '(C) A pace or progress observation grounded in their specific numbers',
    '(D) A goal-oriented observation linking challenge progress or yearly pace to concrete action',
    '',
    'STRICT RULES:',
    '- 2–3 sentences only. No padding.',
    '- Do NOT open with the member\'s name.',
    '- Never use hollow openers or hedging starters: "It\'s wonderful", "What a", "Great", "Impressive", "Amazing", "It\'s interesting to see", "It\'s interesting that", "It seems", "It appears", or any praise of the data itself.',
    '- No motivational or sports language: "reignite", "momentum", "push through", "keep the streak alive", "get back on track", "build the habit", "get back into".',
    '- Every sentence must be anchored in their specific numbers, named books, or persona axes — no generic advice.',
    '- If a book shows a notably low pace vs their norm, comment on whether that book and their reading style are a good match.',
    '- Reference the bio or reading goal only when it genuinely adds a coaching insight — skip it if irrelevant.',
    '- Prose only. No bullet points, no headers.'
  ].join('\n');

  var requestBody = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      maxOutputTokens: AIPASS_MAX_OUTPUT_TOKENS,
      temperature    : 0.4,
      topP           : 0.85
    }
  };

  var response = UrlFetchApp.fetch(
    AIPASS_GEMINI_ENDPOINT + '?key=' + apiKey,
    {
      method            : 'post',
      contentType       : 'application/json',
      payload           : JSON.stringify(requestBody),
      muteHttpExceptions: true
    }
  );

  var responseCode = response.getResponseCode();
  var responseText = response.getContentText();

  if (responseCode === 429) {
    throw new Error('Gemini rate limit (429) — will retry for this member on next nightly run.');
  }
  if (responseCode !== 200) {
    throw new Error('Gemini API ' + responseCode + ': ' + responseText.substring(0, 200));
  }

  var parsed = JSON.parse(responseText);

  if (!parsed.candidates        ||
      !parsed.candidates[0]     ||
      !parsed.candidates[0].content ||
      !parsed.candidates[0].content.parts ||
      !parsed.candidates[0].content.parts[0]) {
    throw new Error('Unexpected Gemini response structure: ' + responseText.substring(0, 200));
  }

  return (parsed.candidates[0].content.parts[0].text || '').trim();
}


// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * _aiPassBuildFingerprint_()
 *
 * Builds a lightweight string fingerprint from the statSnapshot fields that
 * materially change the AI advice. If this matches the stored fingerprint,
 * the Gemini call is skipped and existing advice is reused.
 *
 * Fields included:
 *   - pagesThisWeek       — pace signal changes when the member reads more
 *   - currentStreak       — streak changes are high-signal coaching moments
 *   - daysSinceLastLog    — absence and comeback patterns
 *   - booksFinishedThisYear — yearly progress milestones
 *   - currentReadingBooks — book switches change coaching context entirely
 *   - personaArchetype    — persona changes (though rare) alter coaching tone
 *   - challengeProgress   — active challenge progress drives goal-oriented advice
 *
 * @param {Object} statSnapshot
 * @returns {string}
 * @private
 */
function _aiPassBuildFingerprint_(statSnapshot) {
  var personaKey = (statSnapshot.personaDNA && statSnapshot.personaDNA.archetypeName)
    ? statSnapshot.personaDNA.archetypeName
    : 'nopersona';

  var challengeKey = '';
  if (statSnapshot.challengeHistory && statSnapshot.challengeHistory.activeGoals) {
    challengeKey = statSnapshot.challengeHistory.activeGoals.map(function(g) {
      return g.title + ':' + g.current;
    }).join('|');
  }

  return [
    statSnapshot.pagesThisWeek,
    statSnapshot.currentStreak,
    statSnapshot.daysSinceLastLog,
    statSnapshot.booksFinishedThisYear,
    (statSnapshot.currentReadingBooks || []).join('|'),
    personaKey,
    challengeKey
  ].join('::');
}

/**
 * _aiPassParseDate_()
 *
 * Parses Arka date strings to milliseconds. Handles:
 *   - Arka Z-Format:    dd-MM-yyyy HH:mm:ss +NNNN
 *   - Arka Short-Date:  dd-MMM-yyyy
 *   - ISO:              yyyy-MM-dd
 *   - Native Date objects (passed through directly)
 *
 * Returns NaN for unparseable strings — caller must guard.
 *
 * @param {string|Date} raw
 * @returns {number} ms since epoch, or NaN
 * @private
 */
function _aiPassParseDate_(raw) {
  if (!raw) return NaN;
  if (raw instanceof Date) return raw.getTime();
  var str = raw.toString().trim();

  // Arka Z-Format: dd-MM-yyyy HH:mm:ss +NNNN
  var zMatch = str.match(/(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})\s+([\+\-]\d{4})/);
  if (zMatch) {
    var iso = zMatch[3] + '-' + zMatch[2] + '-' + zMatch[1] +
              'T' + zMatch[4] + ':' + zMatch[5] + ':' + zMatch[6] + zMatch[7];
    return new Date(iso).getTime();
  }

  // Arka Short-Date: dd-MMM-yyyy (e.g. 27-May-2026)
  var shortMatch = str.match(/(\d{2})-([a-zA-Z]{3})-(\d{4})/);
  if (shortMatch) {
    return new Date(str.replace(/-/g, ' ')).getTime();
  }

  // Fallback
  return new Date(str).getTime();
}


// ── Manual run helpers (admin use only) ───────────────────────────────────

/**
 * resetArkaAIPassState()
 *
 * Clears all PropertiesService keys and removes all chain triggers.
 * Use this to manually abort a stuck run or reset state before a test.
 * Run from the Apps Script editor — not triggered automatically.
 */
function resetArkaAIPassState() {
  var props = PropertiesService.getScriptProperties();
  props.deleteProperty(AIPASS_CURSOR_KEY);
  props.deleteProperty(AIPASS_READY_FLAG_KEY);
  props.deleteProperty(AIPASS_TOTAL_KEY);
  _aiPassRemoveAllTriggers_();
  console.log('ArkaAIPass: state reset. Run installArkaAIPassTrigger() to reinstall the daily trigger.');
}

/**
 * forceRunArkaAIPassNow()
 *
 * Forces an immediate AI pass run regardless of the ARKAAIPASS_READY flag.
 * Useful for testing or manual backfill runs.
 * Sets the ready flag and cursor to 1, then calls runArkaAIPass().
 */
function forceRunArkaAIPassNow() {
  var props = PropertiesService.getScriptProperties();
  props.setProperty(AIPASS_READY_FLAG_KEY, 'true');
  props.setProperty(AIPASS_CURSOR_KEY, '1');
  console.log('ArkaAIPass: forcing immediate run...');
  runArkaAIPass();
}

// ─────────────────────────────────────────────────────────────────────────────
// DEV UTILITY — Run ArkaAIPass for a single member and write result to Col S.
// Bypasses cursor, activity gate, and fingerprint check so advice always
// regenerates. Use for testing only.
// ─────────────────────────────────────────────────────────────────────────────
function testAIPassForMe_() {
  var TEST_MEMBER_ID = 'ARKA_MEMBER_1'; // ← change if needed

  var props  = PropertiesService.getScriptProperties();
  var apiKey = props.getProperty('GEMINI_API_KEY');
  if (!apiKey) { console.error('GEMINI_API_KEY not set'); return; }

  var ss       = SpreadsheetApp.openById(AIPASS_SPREADSHEET_ID);
  var memSheet = ss.getSheetByName(AIPASS_MEMBERS_SHEET);
  var memData  = memSheet.getDataRange().getValues();

  var targetRow = -1;
  for (var i = 1; i < memData.length; i++) {
    if ((memData[i][0] || '').toString() === TEST_MEMBER_ID) { targetRow = i; break; }
  }
  if (targetRow === -1) { console.error('Member not found: ' + TEST_MEMBER_ID); return; }

  var row         = memData[targetRow];
  var displayName = (row[3]  || '').toString().trim();
  var colSRaw     = (row[18] || '').toString();
  var existingParsed = {};
  try { existingParsed = JSON.parse(colSRaw); } catch(e) {}

  var statSnapshot = existingParsed.statSnapshot;
  if (!statSnapshot) { console.error('No statSnapshot in Col S — run MasterEngine first.'); return; }

  var insights = existingParsed.insights || [];

  console.log('Running AI pass for: ' + displayName + ' (' + TEST_MEMBER_ID + ')');
  console.log('Fingerprint: ' + _aiPassBuildFingerprint_(statSnapshot));

  // Force fresh Gemini call — clear stored fingerprint so staleness check is skipped
  delete existingParsed.aiFingerprint;

  var aiAdvice = _aiPassCallGemini_(apiKey, displayName, insights, statSnapshot);
  if (!aiAdvice) { console.error('Gemini call returned empty — check API key or quota.'); return; }

  existingParsed.aiAdvice      = aiAdvice;
  existingParsed.aiFingerprint = _aiPassBuildFingerprint_(statSnapshot);

  var newColS = JSON.stringify(existingParsed);
  memSheet.getRange(targetRow + 1, 19).setValue(newColS); // Col S = index 18 = column 19

  console.log('Done. aiAdvice written to Col S:');
  console.log(aiAdvice);
}
