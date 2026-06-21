/**
 * ARKA PERSONA PASS    v1.0.0
 * Full version history: VERSIONS.md
 *
 * NOTE: File header is a carry-over from an earlier copy — functions below are
 * the correct PersonaPass implementation (6-axis reading DNA, ArkaPersonaProfileDB write).
 * ARKA PERSONA PASS — Standalone Reading Personality Engine
 *
 * Responsibility: compute each active member's Reading Personality — their
 * spectrum-axis verdicts, synthesized archetype, "things you didn't know"
 * insights, a blind-spot, and club-wide rarity — then upsert one row per
 * member into PersonaProfileDB. When a member's verdict on any axis changes
 * (including first-time resolution from a gated/forming state), it logs one
 * ARKA_ACTTYP_PERSONAUPDATE activity per changed axis. Those activity rows are
 * the sole history source for the "How You've Changed" timeline.
 *
 * Separation of concerns
 * ──────────────────────
 *   MasterEngine    →  stats, badges, CP ledger, insight chips, tasks
 *   ArkaAIPass      →  Gemini AI advice (rate-limited, chained)
 *   ArkaPersonaPass →  Reading Personality computation (this file)
 *
 * Why a separate chained pass (not inside MasterEngine)
 * ─────────────────────────────────────────────────────
 * The persona computation needs the three heaviest reads in the system in one
 * place — the FULL PageLogDB, MemberShelfDB, and ArkaLibraryDB — to derive
 * time-of-day rhythm, session shape, finish/DNF behaviour, era and length.
 * Doing that for the whole club inside MasterEngine's existing 6-minute budget
 * risks a timeout. So, exactly like ArkaAIPass, this runs as its own daily
 * trigger ~7 min after midnight, processes members in cursor-tracked batches,
 * and chains itself if it nears the GAS wall. Unlike ArkaAIPass it makes NO
 * external API calls, so there is no rate-limit sleep — batching here is sized
 * purely by per-member compute, and batches can be large.
 *
 * Execution model (identical shape to ArkaAIPass)
 * ───────────────────────────────────────────────
 *   1. Daily trigger fires runArkaPersonaPass() at ~00:07.
 *   2. It checks the ARKAPERSONAPASS_READY flag (set by MasterEngine on
 *      successful completion) so it never reads a half-written club state.
 *   3. It reads a member cursor from PropertiesService.
 *   4. On the FIRST batch of the night it loads the three source sheets ONCE,
 *      pre-indexes them per member, and caches the heavy indexes plus the
 *      club-wide rarity tallies in PropertiesService so chained batches do not
 *      re-read or re-tally. (Indexes are compact per-member aggregates, not raw
 *      rows, so they fit comfortably in Script Properties.)
 *   5. Each batch computes personalities for up to PERSONA_MEMBERS_PER_RUN
 *      members and writes their PersonaProfileDB rows + any PERSONAUPDATE logs.
 *   6. If members remain, it saves the cursor and schedules the next run.
 *   7. When all are processed it clears state and triggers and finishes.
 *
 * Staleness gate
 * ──────────────
 * Each member's source data is fingerprinted (page-log count + last-log ms +
 * finished-book count). If tonight's fingerprint equals the one stored on the
 * member's PersonaProfileDB row, nothing material changed — the row is left
 * untouched and no PERSONAUPDATE is logged. This skips the bulk of the club on
 * a typical night.
 *
 * Trigger setup (one-time manual step)
 * ─────────────────────────────────────
 * Run installArkaPersonaPassTrigger() once from the Apps Script editor.
 *
 * Kill switch
 * ───────────
 * Set Script Property  PERSONA_PASS_ENABLED = 'false'  to disable without
 * touching code. runArkaPersonaPass() exits immediately if set.
 *
 * Silent deploy
 * ─────────────
 * ARKA_ACTTYP_PERSONAUPDATE must be present in HIDDEN_TYPES (buildFeedAggregator)
 * and in VARIABLE_POINT_TYPES (MasterEngine Rule 5) before enabling this pass —
 * see the Database Definitions surgical update accompanying this file.
 */

// ── Constants ──────────────────────────────────────────────────────────────

/** Google Spreadsheet that backs the Arka Club app. Must match MasterEngine. */
const PERSONA_SPREADSHEET_ID = '1qXsAAO_9aIEJuTTQ1ziX9s5plvm6WHaVI_zaKcSXF-4';

/** Sheet names. */
const PERSONA_MEMBERS_SHEET   = 'MemberDB';
const PERSONA_PROFILE_SHEET   = 'PersonaProfileDB';
const PERSONA_PAGELOG_SHEET   = 'PageLogDB';
const PERSONA_SHELF_SHEET     = 'MemberShelfDB';
const PERSONA_LIBRARY_SHEET   = 'ArkaLibraryDB';
const PERSONA_ACTIVITY_SHEET  = 'ActivityLogDB';

/** Engine version stamp — bump to force-recompute all rows after a logic change. */
const PERSONA_ENGINE_VERSION = 'PersonaEngine v1';

/** Activity type for persona shifts. CP always 0. Must be in HIDDEN_TYPES + VARIABLE_POINT_TYPES. */
const PERSONA_ACTIVITY_TYPE_ID = 'ARKA_ACTTYP_PERSONAUPDATE';

/** Source sentinel written into ActivityLogDB Col F for persona shift rows. */
const PERSONA_ACTIVITY_SOURCE = 'MasterSync Engine';

/**
 * Members processed per trigger run. No API calls here, so this is bounded by
 * compute + sheet-write time, not a rate limit. 120 is conservative for ~50
 * members but keeps headroom if the club grows 10×.
 */
const PERSONA_MEMBERS_PER_RUN = 120;

/** Minutes between chained runs. Short — no external dependency to wait on. */
const PERSONA_CHAIN_DELAY_MINUTES = 2;

/**
 * Activity gate: members whose most recent page log is older than this many
 * days are skipped — their existing PersonaProfileDB row (if any) is preserved.
 * Matches the AI pass / MasterEngine 7-day convention.
 */
const PERSONA_INACTIVE_DAYS_THRESHOLD = 7;

/** Minimum data gates per axis. Below these, an axis renders as "forming". */
const PERSONA_MIN_SESSIONS_FOR_RHYTHM   = 20; // Rhythm, Appetite, Cadence
const PERSONA_MIN_FINISHED_FOR_TASTE    = 5;  // Persistence, Era, Scale, Breadth

/** PropertiesService keys. */
const PERSONA_READY_FLAG_KEY = 'ARKAPERSONAPASS_READY';
const PERSONA_CURSOR_KEY     = 'PERSONA_MEMBER_CURSOR';
const PERSONA_INDEX_KEY      = 'PERSONA_SOURCE_INDEX';   // cached per-member aggregates (JSON)
const PERSONA_RARITY_KEY     = 'PERSONA_RARITY_TALLY';   // cached club-wide tallies (JSON)

/** Function name used when scheduling the chain trigger — must match exactly. */
const PERSONA_FUNCTION_NAME = 'runArkaPersonaPass';

/** PersonaProfileDB column count (A–L = 12). Used for row assembly. */
const PERSONA_PROFILE_COL_COUNT = 12;


// ── Entry point ────────────────────────────────────────────────────────────

/**
 * runArkaPersonaPass()
 *
 * Main entry point, called by the daily trigger and by chain triggers.
 * Processes one batch of members, then either chains itself or finalises.
 */
function runArkaPersonaPass() {
  var props = PropertiesService.getScriptProperties();

  // ── Kill switch ─────────────────────────────────────────────────────────
  if (props.getProperty('PERSONA_PASS_ENABLED') === 'false') {
    console.log('PersonaPass: PERSONA_PASS_ENABLED=false — exiting.');
    _personaCleanup_(props);
    return;
  }

  // ── Readiness gate — MasterEngine must have completed first ───────────────
  if (props.getProperty(PERSONA_READY_FLAG_KEY) !== 'true') {
    console.warn('PersonaPass: ARKAPERSONAPASS_READY not set — MasterEngine may not have finished. Will retry next scheduled run.');
    return;
  }

  var ss = SpreadsheetApp.openById(PERSONA_SPREADSHEET_ID);

  var memberSheet = ss.getSheetByName(PERSONA_MEMBERS_SHEET);
  if (!memberSheet) {
    console.error('PersonaPass: MemberDB not found.');
    _personaCleanup_(props);
    return;
  }

  var memberData    = memberSheet.getDataRange().getValues();
  var totalDataRows = memberData.length - 1; // row 0 = header
  if (totalDataRows <= 0) {
    console.log('PersonaPass: MemberDB empty — nothing to do.');
    _personaCleanup_(props);
    return;
  }

  // ── Cursor ────────────────────────────────────────────────────────────────
  var cursor = parseInt(props.getProperty(PERSONA_CURSOR_KEY) || '1', 10);
  if (isNaN(cursor) || cursor < 1) cursor = 1;
  var isFirstBatch = (cursor === 1);

  // ── Source indexes + rarity tally ────────────────────────────────────────
  // On the first batch only, build the heavy per-member aggregates and the
  // club-wide rarity tallies, then cache them so chained batches skip the read.
  var sourceIndex; // { memberId: { sessions, lastLogMs, finished:[...], ... } }
  var rarityTally; // { totalResolved, archetypes:{key:count}, axes:{axis:{side:count}} }

  if (isFirstBatch) {
    sourceIndex = _personaBuildSourceIndex_(ss);
    // Pass totalDataRows so rarity shows "X / 32" (real club size), not "X / 37"
    // (sourceIndex size, which can exceed MemberDB if historical member IDs linger
    // in PageLogDB or ShelfDB after a member leaves).
    rarityTally = _personaBuildRarityTally_(sourceIndex, totalDataRows);
    // Cache for chained batches. These are compact aggregates, not raw rows.
    props.setProperty(PERSONA_INDEX_KEY,  JSON.stringify(sourceIndex));
    props.setProperty(PERSONA_RARITY_KEY, JSON.stringify(rarityTally));
  } else {
    try {
      sourceIndex = JSON.parse(props.getProperty(PERSONA_INDEX_KEY)  || '{}');
      rarityTally = JSON.parse(props.getProperty(PERSONA_RARITY_KEY) || '{}');
    } catch (parseErr) {
      // Cache lost mid-chain (rare) — rebuild from scratch.
      console.warn('PersonaPass: cached index lost — rebuilding.');
      sourceIndex = _personaBuildSourceIndex_(ss);
      rarityTally = _personaBuildRarityTally_(sourceIndex);
    }
  }

  // ── Load PersonaProfileDB into a memberId → {rowIndex, parsed} map ─────────
  var profileSheet = ss.getSheetByName(PERSONA_PROFILE_SHEET);
  if (!profileSheet) {
    console.error('PersonaPass: PersonaProfileDB not found — create the sheet first.');
    _personaCleanup_(props);
    return;
  }
  var profileData    = profileSheet.getDataRange().getValues();
  var profileByMember = {}; // memberId → { rowIndex(1-based), prevVerdicts, prevArchKey, prevFingerprint }
  for (var pr = 1; pr < profileData.length; pr++) {
    var pid = (profileData[pr][0] || '').toString().trim();
    if (!pid) continue;
    var prevVerdicts = {};
    try {
      var vArr = JSON.parse((profileData[pr][5] || '[]').toString()); // Col F
      vArr.forEach(function(v) { prevVerdicts[v.axis] = v; });
    } catch (e) { /* malformed — treat as no prior verdicts */ }
    profileByMember[pid] = {
      rowIndex       : pr + 1,
      prevVerdicts   : prevVerdicts,
      prevArchKey    : (profileData[pr][1] || '').toString(),  // Col B
      prevArchName   : (profileData[pr][2] || '').toString(),  // Col C
      prevFingerprint: _personaExtractFingerprint_(profileData[pr])
    };
  }

  // ── Process batch ───────────────────────────────────────────────────────
  var nowMs            = Date.now();
  var endRow           = Math.min(cursor + PERSONA_MEMBERS_PER_RUN - 1, totalDataRows);
  var rowsToWrite      = []; // { rowIndex(1-based) | null for append, values[] }
  var rowsToAppend     = []; // values[] for brand-new members
  var activityRows     = []; // PERSONAUPDATE rows queued for one batched write
  var processed = 0, skippedInactive = 0, skippedNoData = 0, skippedStale = 0, changed = 0;

  for (var ri = cursor; ri <= endRow; ri++) {
    var memberId    = (memberData[ri][0] || '').toString().trim();
    if (!memberId) continue;
    var displayName = (memberData[ri][3] || '').toString().trim();
    processed++;

    var agg      = sourceIndex[memberId];
    // Resolve existing row BEFORE the activity gate — the gate needs it to
    // distinguish "never computed" (must run) from "already has a row" (can skip).
    var existing = profileByMember[memberId] || null;

    // No-data guard — member exists in MemberDB but has zero rows in both
    // PageLogDB and ShelfDB. Nothing to compute; skip silently until they
    // start using the app. Distinct from inactive (has data, just old).
    if (!agg) {
      skippedNoData++;
      continue;
    }

    // Activity gate — only skip inactive members who ALREADY have a computed row.
    // First-time computation always runs regardless of threshold: shelf-derived
    // axes (Breadth, Scale, Era) are valid from historical data even if the member
    // hasn't logged pages recently. On subsequent nightly passes, stale rows for
    // inactive members are correctly preserved unchanged.
    var lastLogMs    = (agg && agg.lastLogMs) || 0;
    var daysSinceLog = lastLogMs > 0 ? (nowMs - lastLogMs) / 86400000 : 99999;
    if (existing && daysSinceLog > PERSONA_INACTIVE_DAYS_THRESHOLD) {
      skippedInactive++;
      continue;
    }

    // Staleness gate — fingerprint unchanged → skip.
    var fingerprint = _personaBuildFingerprint_(agg);
    if (existing && existing.prevFingerprint && existing.prevFingerprint === fingerprint) {
      skippedStale++;
      continue;
    }

    // ── Compute this member's personality ────────────────────────────────
    var personality = _personaComputeForMember_(agg, rarityTally);
    // personality = { verdicts:[...], archetypeKey, archetypeName, archetypeEmoji,
    //                 archetypeTagline, insights:[...], blindSpot|null, rarity:{...} }

    // ── Diff against previous verdicts → queue PERSONAUPDATE rows ─────────
    var prevVerdicts = existing ? existing.prevVerdicts : {};
    var prevArchName = existing ? existing.prevArchName : '';
    personality.verdicts.forEach(function(v) {
      if (v.gated) return; // forming axes never log a shift
      var prev = prevVerdicts[v.axis];
      var prevSide = (prev && !prev.gated) ? prev.side : '(forming)';
      if (prevSide !== v.side) {
        activityRows.push(_personaBuildActivityRow_(
          memberId, v.axis, prevSide, v.side, prevArchName, personality.archetypeName, fingerprint
        ));
      }
    });
    if (activityRows.length) changed++;

    // ── Assemble the PersonaProfileDB row ────────────────────────────────
    var rowValues = _personaAssembleRow_(memberId, personality, fingerprint);
    if (existing) {
      rowsToWrite.push({ rowIndex: existing.rowIndex, values: rowValues });
    } else {
      rowsToAppend.push(rowValues);
    }
  }

  // ── Write PersonaProfileDB rows ───────────────────────────────────────────
  // In-place updates first (one row range each), then a single append block.
  rowsToWrite.forEach(function(w) {
    profileSheet.getRange(w.rowIndex, 1, 1, PERSONA_PROFILE_COL_COUNT).setValues([w.values]);
  });
  if (rowsToAppend.length > 0) {
    var firstAppendRow = profileSheet.getLastRow() + 1;
    profileSheet.getRange(firstAppendRow, 1, rowsToAppend.length, PERSONA_PROFILE_COL_COUNT)
                .setValues(rowsToAppend);
  }

  // ── Write PERSONAUPDATE activity rows (locked, sequential IDs) ─────────────
  if (activityRows.length > 0) {
    _personaAppendActivityRows_(ss, activityRows);
  }

  console.log(
    'PersonaPass batch — cursor ' + cursor + '→' + (endRow + 1) +
    ', processed ' + processed +
    ', updated ' + (rowsToWrite.length + rowsToAppend.length) +
    ', shifts logged ' + activityRows.length +
    ', stale skips ' + skippedStale +
    ', inactive skips ' + skippedInactive +
    ', no-data skips ' + skippedNoData
  );

  // ── Chain or finalise ─────────────────────────────────────────────────────
  var nextCursor = endRow + 1;
  if (nextCursor > totalDataRows) {
    console.log('PersonaPass: all members processed. Done for tonight.');
    _personaCleanup_(props);
  } else {
    props.setProperty(PERSONA_CURSOR_KEY, nextCursor.toString());
    _personaScheduleNextRun_();
    console.log('PersonaPass: chaining — next batch at cursor ' + nextCursor + ' in ' + PERSONA_CHAIN_DELAY_MINUTES + ' min.');
  }
}


// ── Source indexing ──────────────────────────────────────────────────────────

/**
 * _personaBuildSourceIndex_()
 *
 * Single-pass read of PageLogDB, MemberShelfDB and ArkaLibraryDB into a compact
 * per-member aggregate. This is the only place the heavy sheets are read; the
 * result is cached in PropertiesService for chained batches.
 *
 * Returns: { memberId: {
 *   sessions, lastLogMs, hourBuckets:{morning,midday,evening,night},
 *   sessionPages:[...], logDayMsSorted:[...],
 *   finishedCount, dnfCount, startedCount,
 *   finishedPages:[...], finishedPubYears:[...], finishedGenres:{genre:count},
 *   biggestDay:{ms,pages}, longestBook:{title,pages}
 * } }
 *
 * @param {Spreadsheet} ss
 * @returns {Object}
 * @private
 */
function _personaBuildSourceIndex_(ss) {
  var index = {};

  function ensure(memberId) {
    if (!index[memberId]) {
      index[memberId] = {
        sessions: 0, liveSessions: 0, lastLogMs: 0,
        hourBuckets: { morning: 0, midday: 0, evening: 0, night: 0 },
        sessionPages: [], logDaysSet: {},
        finishedCount: 0, dnfCount: 0, startedCount: 0, toReadCount: 0,
        finishedPages: [], finishedPubYears: [], finishedGenres: {},
        biggestDay: { ms: 0, pages: 0 }, longestBook: { title: '', pages: 0 }
      };
    }
    return index[memberId];
  }

  // ── Library lookup: BookID → { pages, pubYear, genres:[...] } ──────────────
  var libData  = ss.getSheetByName(PERSONA_LIBRARY_SHEET).getDataRange().getValues();
  var bookInfo = {};
  for (var lr = 1; lr < libData.length; lr++) {
    var bid = (libData[lr][0] || '').toString().trim(); // Col A BookID
    if (!bid) continue;
    bookInfo[bid] = {
      title  : (libData[lr][1] || '').toString(),                 // Col B Title
      genres : _personaCanonicalGenres_((libData[lr][3] || '')),  // Col D Genre
      pages  : Number(libData[lr][4]) || 0,                       // Col E Pages
      pubYear: _personaExtractYear_(libData[lr][11])              // Col L PublishedDate
    };
  }

  // ── PageLogDB: rhythm, appetite, cadence, biggest day ──────────────────────
  var plData = ss.getSheetByName(PERSONA_PAGELOG_SHEET).getDataRange().getValues();
  var perMemberPerDayPages = {}; // memberId → { dayKey: pages } for biggest-day
  for (var p = 1; p < plData.length; p++) {
    var pMember = (plData[p][2] || '').toString().trim(); // Col C MemberID
    if (!pMember) continue;
    var delta = Number(plData[p][4]) || 0;                // Col E PagesDelta
    if (delta <= 0) continue;                             // correction entry
    var ms = _personaParseDate_(plData[p][1]);            // Col B Timestamp
    if (isNaN(ms)) continue;

    var m = ensure(pMember);

    // A weekly bulk row (Sunday historical import) is a whole week of reading
    // collapsed into one midnight-stamped row. It carries no real time-of-day,
    // its page delta is not a single session, and its even weekly spacing would
    // fake a perfect Cadence metronome. So it must NOT feed any behavioural
    // session metric (Rhythm / Appetite / Cadence / biggest-day). It DOES still
    // count toward recency (activity gate) and the change fingerprint, and its
    // pages remain captured by MasterEngine's TotalPages elsewhere.
    var isImport = (plData[p][3] || '').toString().trim() === 'HISTORICAL_IMPORT'; // Col D BookID

    m.sessions++;                            // total rows — fingerprint only
    if (ms > m.lastLogMs) m.lastLogMs = ms;  // recency includes imports
    if (isImport) continue;                  // skip every session-pattern metric below

    // ── Live-app session only from here ───────────────────────────────────
    m.liveSessions++;
    m.sessionPages.push(delta);

    // Hour bucket (member-local offset is embedded in the timestamp string).
    var hour = _personaExtractHour_(plData[p][1]);
    if (hour >= 5 && hour < 12)       m.hourBuckets.morning++;
    else if (hour >= 12 && hour < 17) m.hourBuckets.midday++;
    else if (hour >= 17 && hour < 21) m.hourBuckets.evening++;
    else                              m.hourBuckets.night++; // 21:00–04:59

    // Cadence: record the calendar day (UTC-day key is fine for gap variance).
    var dayKey = Math.floor(ms / 86400000);
    m.logDaysSet[dayKey] = true;

    // Biggest single day (sum deltas per member per day).
    if (!perMemberPerDayPages[pMember]) perMemberPerDayPages[pMember] = {};
    perMemberPerDayPages[pMember][dayKey] = (perMemberPerDayPages[pMember][dayKey] || 0) + delta;
  }
  // Resolve biggest day from the per-day sums.
  Object.keys(perMemberPerDayPages).forEach(function(mid) {
    var days = perMemberPerDayPages[mid];
    Object.keys(days).forEach(function(dk) {
      if (days[dk] > index[mid].biggestDay.pages) {
        index[mid].biggestDay = { ms: Number(dk) * 86400000, pages: days[dk] };
      }
    });
  });

  // ── MemberShelfDB: persistence, era, scale, breadth, longest book ──────────
  var shData = ss.getSheetByName(PERSONA_SHELF_SHEET).getDataRange().getValues();
  for (var s = 1; s < shData.length; s++) {
    var sMember = (shData[s][1] || '').toString().trim();  // Col B MemberID
    if (!sMember) continue;
    var status  = (shData[s][3] || '').toString().trim();  // Col D Status
    if (status === 'Deleted') continue;
    var bookId  = (shData[s][2] || '').toString().trim();  // Col C BookID
    var m = ensure(sMember);

    if (status === 'Reading' || status === 'Finished' || status === 'Did Not Finish') {
      m.startedCount++;
    }
    if (status === 'Did Not Finish') m.dnfCount++;
    if (status === 'To Read') m.toReadCount++;
    if (status === 'Finished') {
      m.finishedCount++;
      var info = bookInfo[bookId];
      if (info) {
        if (info.pages > 0) {
          m.finishedPages.push(info.pages);
          if (info.pages > m.longestBook.pages) {
            m.longestBook = { title: info.title, pages: info.pages };
          }
        }
        if (info.pubYear) m.finishedPubYears.push(info.pubYear);
        info.genres.forEach(function(g) {
          m.finishedGenres[g] = (m.finishedGenres[g] || 0) + 1;
        });
      }
    }
  }

  // Convert logDaysSet maps to sorted arrays for cadence variance.
  Object.keys(index).forEach(function(mid) {
    var days = Object.keys(index[mid].logDaysSet).map(Number).sort(function(a, b) { return a - b; });
    index[mid].logDaysSorted = days;
    delete index[mid].logDaysSet; // drop the map; keep the cache compact
  });

  return index;
}

/**
 * _personaBuildRarityTally_()
 *
 * Computes club-wide counts of resolved archetypes and per-axis sides so each
 * member's row can carry "3 of 47 share this type" / "1 of 6 Night Owls".
 * Runs a lightweight dry computation of each member's verdicts WITHOUT rarity
 * (rarity is the only field that needs the tally, so we compute verdicts here
 * with a null tally and tally the results).
 *
 * @param {Object} sourceIndex
 * @returns {Object} { totalMembers, archetypes:{key:count}, axes:{axis:{side:count}} }
 * @private
 */
function _personaBuildRarityTally_(sourceIndex, totalClubMembers) {
  // totalClubMembers = real MemberDB row count, passed in from runArkaPersonaPass()
  // where totalDataRows is already computed. Falls back to sourceIndex size only
  // when called without the parameter (e.g. from dryRunArkaPersonaPass).
  var tally = {
    totalMembers: totalClubMembers || Object.keys(sourceIndex).length,
    archetypes: {},
    axes: {}
  };
  Object.keys(sourceIndex).forEach(function(memberId) {
    var p = _personaComputeForMember_(sourceIndex[memberId], null); // null = skip rarity
    // totalMembers is now fixed — do NOT increment it here
    if (p.archetypeKey) {
      tally.archetypes[p.archetypeKey] = (tally.archetypes[p.archetypeKey] || 0) + 1;
    }
    p.verdicts.forEach(function(v) {
      if (v.gated) return;
      if (!tally.axes[v.axis]) tally.axes[v.axis] = {};
      tally.axes[v.axis][v.side] = (tally.axes[v.axis][v.side] || 0) + 1;
    });
  });
  return tally;
}


// ── Personality computation ───────────────────────────────────────────────

/**
 * _personaComputeForMember_()
 *
 * Pure function: given one member's aggregate and (optionally) the club rarity
 * tally, produce the full personality object. Passing rarity=null skips the
 * rarity fields — used by the dry pass in _personaBuildRarityTally_().
 *
 * @param {Object} agg     - per-member aggregate from _personaBuildSourceIndex_
 * @param {Object|null} rarity - club rarity tally, or null to skip rarity
 * @returns {Object} personality
 * @private
 */
function _personaComputeForMember_(agg, rarity) {
  var verdicts = [];

  // Behavioural axes (Rhythm / Appetite / Cadence) gate on LIVE-app sessions
  // only — weekly bulk imports carry no usable time/session signal. The shelf-
  // derived axes (Persistence / Era / Scale / Breadth) are unaffected: they read
  // MemberShelfDB + Library, which the import populates correctly.
  var hasLiveData  = agg.liveSessions >= PERSONA_MIN_SESSIONS_FOR_RHYTHM;
  var hasTasteData = agg.finishedCount >= PERSONA_MIN_FINISHED_FOR_TASTE;

  // ── AXIS: Rhythm — Early Bird ←→ Night Owl ───────────────────────────────
  // position 0 = fully Early Bird, 100 = fully Night Owl.
  if (hasLiveData) {
    var b = agg.hourBuckets;
    var live       = agg.liveSessions; // denominator excludes imported bulk rows
    var dayShare   = (b.morning + b.midday) / live;
    var nightShare = (b.evening + b.night) / live;
    var rhythmPos  = Math.round(nightShare * 100);
    var nightPct   = Math.round((b.night / live) * 100);
    verdicts.push({
      axis: 'Rhythm',
      side: nightShare >= dayShare ? 'Night Owl' : 'Early Bird',
      badgeID: nightShare >= dayShare ? 'ARKA_BADGE_PERSONA_NIGHTOWL' : 'ARKA_BADGE_PERSONA_EARLYBIRD',
      position: rhythmPos,
      gated: false,
      note: nightShare >= dayShare
        ? nightPct + '% of your sessions happen after dark.'
        : Math.round((b.morning / live) * 100) + '% of your sessions are before noon.'
    });
  } else {
    verdicts.push(_personaGatedVerdict_('Rhythm', agg.liveSessions, PERSONA_MIN_SESSIONS_FOR_RHYTHM, 'live sessions'));
  }

  // ── AXIS: Appetite — The Nibbler ←→ The Devourer ─────────────────────────
  if (hasLiveData) {
    var medianSession = _personaMedian_(agg.sessionPages);
    var appetitePos   = Math.max(0, Math.min(100, Math.round((medianSession / 50) * 100)));
    verdicts.push({
      axis: 'Appetite',
      side: medianSession >= 20 ? 'The Devourer' : 'The Nibbler',
      badgeID: medianSession >= 20 ? 'ARKA_BADGE_PERSONA_DEVOURER' : 'ARKA_BADGE_PERSONA_NIBBLER',
      position: appetitePos,
      gated: false,
      note: 'A typical session is ' + Math.round(medianSession) + ' pages.'
    });
  } else {
    verdicts.push(_personaGatedVerdict_('Appetite', agg.sessions, PERSONA_MIN_SESSIONS_FOR_RHYTHM, 'sessions'));
  }

  // ── AXIS: Cadence — The Binger ←→ The Metronome ──────────────────────────
  // High gap-variance = Binger (left, pos low); low variance = Metronome (right).
  if (agg.logDaysSorted && agg.logDaysSorted.length >= 5) {
    var gaps = [];
    for (var g = 1; g < agg.logDaysSorted.length; g++) {
      gaps.push(agg.logDaysSorted[g] - agg.logDaysSorted[g - 1]);
    }
    var cv = _personaCoeffOfVariation_(gaps); // 0 = perfectly even
    var cadencePos = Math.max(0, Math.min(100, Math.round((1 - Math.min(cv, 1)) * 100)));
    verdicts.push({
      axis: 'Cadence',
      side: cv >= 0.6 ? 'The Binger' : 'The Metronome',
      badgeID: cv >= 0.6 ? 'ARKA_BADGE_PERSONA_BINGER' : 'ARKA_BADGE_PERSONA_METRONOME',
      position: cadencePos,
      gated: false,
      note: cv >= 0.6 ? 'You read in waves — quiet spells, then bursts.'
                      : 'You read with remarkably even rhythm.'
    });
  } else {
    verdicts.push(_personaGatedVerdict_('Cadence', (agg.logDaysSorted || []).length, 5, 'reading days'));
  }

  // ── AXIS: Era — Trendsetter ←→ Time Traveler ─────────────────────────────
  if (hasTasteData && agg.finishedPubYears.length >= 3) {
    var medianYear = _personaMedian_(agg.finishedPubYears);
    var nowYear    = new Date().getFullYear();
    // Older median → Time Traveler (right, pos high). 1950 anchors "fully old".
    var ageSpan    = Math.max(0, Math.min(1, (nowYear - medianYear) / (nowYear - 1950)));
    var eraPos     = Math.round(ageSpan * 100);
    var isOld      = (nowYear - medianYear) >= 25;
    verdicts.push({
      axis: 'Era',
      side: isOld ? 'Time Traveler' : 'Trendsetter',
      badgeID: isOld ? 'ARKA_BADGE_PERSONA_TIMETRAVELER' : 'ARKA_BADGE_PERSONA_TRENDSETTER',
      position: eraPos,
      gated: false,
      note: 'Your reading spirit-decade is the ' + (Math.floor(medianYear / 10) * 10) + 's.'
    });
  } else {
    verdicts.push(_personaGatedVerdict_('Era', agg.finishedPubYears.length, 3, 'dated finishes'));
  }

  // ── AXIS: Scale — Novella Lover ←→ Doorstop Lover ────────────────────────
  if (hasTasteData && agg.finishedPages.length >= 3) {
    var avgPages  = _personaMean_(agg.finishedPages);
    var scalePos  = Math.max(0, Math.min(100, Math.round((avgPages / 700) * 100)));
    verdicts.push({
      axis: 'Scale',
      side: avgPages >= 450 ? 'Doorstop Lover' : 'Novella Lover',
      badgeID: avgPages >= 450 ? 'ARKA_BADGE_PERSONA_DOORSTOP' : 'ARKA_BADGE_PERSONA_NOVELLA',
      position: scalePos,
      gated: false,
      note: 'Your finished books average ' + Math.round(avgPages) + ' pages.'
    });
  } else {
    verdicts.push(_personaGatedVerdict_('Scale', agg.finishedPages.length, 3, 'finished books with page counts'));
  }

  // ── AXIS: Breadth — Devoted Specialist ←→ Genre Nomad ────────────────────
  if (hasTasteData) {
    var genreKeys   = Object.keys(agg.finishedGenres);
    var distinct    = genreKeys.length;
    var breadthPos  = Math.max(0, Math.min(100, Math.round((distinct / 8) * 100)));
    verdicts.push({
      axis: 'Breadth',
      side: distinct >= 5 ? 'Genre Nomad' : 'Devoted Specialist',
      badgeID: distinct >= 5 ? 'ARKA_BADGE_PERSONA_NOMAD' : 'ARKA_BADGE_PERSONA_SPECIALIST',
      position: breadthPos,
      gated: false,
      note: distinct >= 5 ? 'You roam across ' + distinct + ' genres.'
                          : 'You stay close to ' + distinct + ' favoured ' + (distinct === 1 ? 'genre' : 'genres') + '.'
    });
  } else {
    verdicts.push(_personaGatedVerdict_('Breadth', agg.finishedCount, PERSONA_MIN_FINISHED_FOR_TASTE, 'finished books'));
  }

  // ── Synthesize the archetype from the strongest resolved axes ─────────────
  var archetype = _personaResolveArchetype_(verdicts);

  // ── Insights — "things you didn't know" ───────────────────────────────────
  var insights = _personaBuildInsights_(agg, verdicts);
  var blindSpot = _personaBuildBlindSpot_(agg, verdicts);

  // ── Rarity (skipped when rarity tally not supplied) ───────────────────────
  var rarityOut = {};
  if (rarity && rarity.totalMembers) {
    if (archetype.key && rarity.archetypes[archetype.key]) {
      rarityOut.archetypeShare = rarity.archetypes[archetype.key] + '/' + rarity.totalMembers;
    }
    rarityOut.axisRarities = {};
    verdicts.forEach(function(v) {
      if (v.gated) return;
      var axisTally = rarity.axes[v.axis];
      if (axisTally && axisTally[v.side]) {
        rarityOut.axisRarities[v.axis] = axisTally[v.side] + '/' + rarity.totalMembers;
      }
    });
  }

  return {
    verdicts        : verdicts,
    archetypeKey    : archetype.key,
    archetypeName   : archetype.name,
    archetypeEmoji  : archetype.emoji,
    archetypeTagline: archetype.tagline,
    insights        : insights,
    blindSpot       : blindSpot,
    rarity          : rarityOut
  };
}

/**
 * _personaResolveArchetype_()
 *
 * Maps a member's resolved verdicts to a named headline archetype. v1 uses a
 * small priority lookup over the most "characterful" axis combinations, with a
 * graceful templated fallback so every member with ≥2 resolved axes gets a name.
 *
 * To extend: add entries to ARCH_TABLE (most specific first). Each entry lists
 * required {axis:side} pairs; the first fully-matched entry wins.
 *
 * @param {Array} verdicts
 * @returns {Object} { key, name, emoji, tagline }
 * @private
 */
function _personaResolveArchetype_(verdicts) {
  // Build a quick { axis: side } map of resolved (non-gated) verdicts.
  var side = {};
  var resolvedCount = 0;
  verdicts.forEach(function(v) {
    if (!v.gated) { side[v.axis] = v.side; resolvedCount++; }
  });

  // Too little to name a type yet.
  if (resolvedCount < 2) {
    return { key: '', name: '', emoji: '📖', tagline: '' };
  }

  // Most-specific-first lookup table. Each requires ALL listed pairs to match.
  var ARCH_TABLE = [
    {
      need: { Rhythm: 'Night Owl', Appetite: 'The Devourer', Era: 'Time Traveler' },
      key: 'ARKA_PERSONA_ARCH_MIDNIGHTSCHOLAR', name: 'The Midnight Scholar', emoji: '🌙',
      tagline: 'You read deep, late, and to the last page — a quiet devourer of long, old books while the world sleeps.'
    },
    {
      need: { Rhythm: 'Early Bird', Appetite: 'The Devourer' },
      key: 'ARKA_PERSONA_ARCH_DAWNDEVOURER', name: 'The Dawn Devourer', emoji: '🌅',
      tagline: 'You meet the morning with a book already open — and you do not put it down lightly.'
    },
    {
      need: { Appetite: 'The Nibbler', Cadence: 'The Metronome' },
      key: 'ARKA_PERSONA_ARCH_STEADYSIPPER', name: 'The Steady Sipper', emoji: '☕',
      tagline: 'A few pages, every day, like clockwork. Small and certain wins the race.'
    },
    {
      need: { Breadth: 'Genre Nomad', Scale: 'Novella Lover' },
      key: 'ARKA_PERSONA_ARCH_WANDERER', name: 'The Wanderer', emoji: '🧭',
      tagline: 'You roam widely and travel light — many genres, rarely a heavy tome.'
    },
    {
      need: { Era: 'Trendsetter', Cadence: 'The Binger' },
      key: 'ARKA_PERSONA_ARCH_TRENDCHASER', name: 'The Trend Chaser', emoji: '✨',
      tagline: 'You devour what is new in great bursts — first to the page, every time.'
    },
    {
      need: { Scale: 'Doorstop Lover', Breadth: 'Devoted Specialist' },
      key: 'ARKA_PERSONA_ARCH_MOUNTAINEER', name: 'The Mountaineer', emoji: '🏔️',
      tagline: 'You go deep on heavy books in the genres you love. The summit is the point.'
    }
  ];

  for (var i = 0; i < ARCH_TABLE.length; i++) {
    var entry = ARCH_TABLE[i];
    var allMatch = Object.keys(entry.need).every(function(axis) {
      return side[axis] === entry.need[axis];
    });
    if (allMatch) {
      return { key: entry.key, name: entry.name, emoji: entry.emoji, tagline: entry.tagline };
    }
  }

  // Templated fallback — name from the two highest-signal resolved axes.
  return _personaTemplateArchetype_(side);
}

/**
 * _personaTemplateArchetype_()
 *
 * Builds a "The {Trait} {Trait}" style name when no fixed archetype matches.
 * Keeps every multi-axis member named without an exhaustive combination table.
 *
 * @param {Object} side - { axis: side }
 * @returns {Object} { key, name, emoji, tagline }
 * @private
 */
function _personaTemplateArchetype_(side) {
  // Priority order of axes for naming, most evocative first.
  var ORDER = ['Rhythm', 'Appetite', 'Era', 'Scale', 'Breadth', 'Cadence'];
  var SHORT = {
    'Night Owl': 'Nocturnal', 'Early Bird': 'Dawn', 'The Devourer': 'Voracious',
    'The Nibbler': 'Patient', 'Time Traveler': 'Classic', 'Trendsetter': 'Modern',
    'Doorstop Lover': 'Epic', 'Novella Lover': 'Concise',
    'Genre Nomad': 'Roaming', 'Devoted Specialist': 'Focused',
    'The Binger': 'Burst', 'The Metronome': 'Steady'
  };
  var picked = [];
  for (var i = 0; i < ORDER.length && picked.length < 2; i++) {
    if (side[ORDER[i]]) picked.push(SHORT[side[ORDER[i]]] || side[ORDER[i]]);
  }
  var name = 'The ' + picked.join(' ') + ' Reader';
  return {
    key    : 'ARKA_PERSONA_ARCH_TEMPLATE_' + picked.join('').toUpperCase(),
    name   : name,
    emoji  : '📚',
    tagline: 'Your reading style is its own blend — ' + picked.join(' and ').toLowerCase() + '.'
  };
}

/**
 * _personaBuildInsights_()
 *
 * Assembles the "things you didn't know" cards from the aggregate.
 * Each card: { kind, glyph, stat, caption, accent }.
 *
 * @param {Object} agg
 * @param {Array}  verdicts
 * @returns {Array}
 * @private
 */
function _personaBuildInsights_(agg, verdicts) {
  var out = [];

  if (agg.biggestDay.pages > 0) {
    out.push({
      kind: 'biggestDay', glyph: '📈', accent: 'gold',
      stat: agg.biggestDay.pages + ' pages in one day',
      caption: 'Your biggest reading day ever — ' +
               Utilities.formatDate(new Date(agg.biggestDay.ms), Session.getScriptTimeZone(), 'd MMM yyyy') + '.'
    });
  }
  if (agg.longestBook.pages > 0) {
    out.push({
      kind: 'longestBook', glyph: '📕', accent: 'purple',
      stat: agg.longestBook.pages + ' pages · longest conquered',
      caption: agg.longestBook.title + ' — your heaviest finish to date.'
    });
  }
  // Era spirit-decade as an insight too (only if Era resolved).
  var eraV = verdicts.filter(function(v) { return v.axis === 'Era' && !v.gated; })[0];
  if (eraV) {
    out.push({ kind: 'era', glyph: '🏛️', accent: 'purple', stat: eraV.note, caption: 'A quiet signature in what you choose to finish.' });
  }

  return out;
}

/**
 * _personaBuildBlindSpot_()
 *
 * Picks the single most surprising computed fact for the dark highlight card.
 * Returns null if nothing notable stands out.
 *
 * @param {Object} agg
 * @param {Array}  verdicts
 * @returns {Object|null} { eyebrow, text }
 * @private
 */
function _personaBuildBlindSpot_(agg, verdicts) {
  // Strong night-reading skew is the most "didn't-know" insight when present.
  if (agg.sessions >= PERSONA_MIN_SESSIONS_FOR_RHYTHM) {
    var nightPct = agg.hourBuckets.night / agg.sessions;
    if (nightPct >= 0.5) {
      return {
        eyebrow: 'YOUR BLIND SPOT',
        text: 'More than half your reading happens after dark — and you probably never counted.'
      };
    }
  }
  // Otherwise, a never-abandoned reader.
  if (agg.finishedCount >= PERSONA_MIN_FINISHED_FOR_TASTE && agg.dnfCount === 0) {
    return {
      eyebrow: 'YOUR BLIND SPOT',
      text: 'You have never once abandoned a book. Every story you start, you see through to the end.'
    };
  }
  return null;
}


// ── Row assembly + activity logging ─────────────────────────────────────────

/**
 * _personaAssembleRow_()
 *
 * Builds the 12-cell PersonaProfileDB row (A–L) for a member.
 *
 * @param {string} memberId
 * @param {Object} personality
 * @param {string} fingerprint
 * @returns {Array} 12-element row
 * @private
 */
function _personaAssembleRow_(memberId, personality, fingerprint) {
  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd-MMM-yyyy');
  // Embed the fingerprint inside RaritySummary's wrapper object so the
  // staleness check can recover it next night without a dedicated column.
  var rarityWithFingerprint = {
    fingerprint   : fingerprint,
    archetypeShare: personality.rarity.archetypeShare || null,
    axisRarities  : personality.rarity.axisRarities   || {}
  };
  return [
    memberId,                                       // A MemberID
    personality.archetypeKey,                       // B ArchetypeKey
    personality.archetypeName,                      // C ArchetypeName
    personality.archetypeEmoji,                     // D ArchetypeEmoji
    personality.archetypeTagline,                   // E ArchetypeTagline
    JSON.stringify(personality.verdicts),           // F AxisVerdicts
    JSON.stringify(personality.insights),           // G Insights
    personality.blindSpot ? JSON.stringify(personality.blindSpot) : '', // H BlindSpot
    JSON.stringify(rarityWithFingerprint),          // I RaritySummary (+fingerprint)
    today,                                          // J ComputedDate
    PERSONA_ENGINE_VERSION,                         // K EngineVersion
    'Active'                                         // L Status
  ];
}

/**
 * _personaExtractFingerprint_()
 *
 * Reads the stored fingerprint back out of a PersonaProfileDB row's Col I.
 *
 * @param {Array} profileRow - a row from PersonaProfileDB getValues()
 * @returns {string|null}
 * @private
 */
function _personaExtractFingerprint_(profileRow) {
  try {
    var parsed = JSON.parse((profileRow[8] || '{}').toString()); // Col I
    return parsed.fingerprint || null;
  } catch (e) { return null; }
}

/**
 * _personaBuildFingerprint_()
 *
 * Lightweight string fingerprint of the source fields that change a member's
 * personality. Match = nothing material changed = skip recompute + no shift log.
 *
 * @param {Object} agg
 * @returns {string}
 * @private
 */
function _personaBuildFingerprint_(agg) {
  if (!agg) return 'EMPTY';
  return [
    agg.sessions,
    agg.lastLogMs,
    agg.finishedCount,
    agg.dnfCount
  ].join('::');
}

/**
 * _personaBuildActivityRow_()
 *
 * Builds one ARKA_ACTTYP_PERSONAUPDATE row value object (ID assigned later,
 * inside the locked append). Description format matches the Definitions doc:
 *   Axis: <axisName> | <oldSide> → <newSide> | Archetype: <oldArch> → <newArch>
 *   (On member dismiss: " | SeenByMember" appended by markActivitySeen in ArkaMainAppCode.gs)
 *
 * @returns {Object} { type, date, memberId, desc, source, cp }
 * @private
 */
function _personaBuildActivityRow_(memberId, axis, oldSide, newSide, oldArch, newArch, fingerprint) {
  var desc = 'Axis: ' + axis + ' | ' + oldSide + ' → ' + newSide +
             ' | Archetype: ' + (oldArch || '—') + ' → ' + (newArch || '—');
  return {
    type    : PERSONA_ACTIVITY_TYPE_ID,
    date    : Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd-MM-yyyy HH:mm:ss Z'),
    memberId: memberId,
    desc    : desc,
    source  : PERSONA_ACTIVITY_SOURCE,
    cp      : 0
  };
}

/**
 * _personaAppendActivityRows_()
 *
 * Appends queued PERSONAUPDATE rows to ActivityLogDB under a script lock,
 * assigning sequential ARKA_ACT_X IDs via the lastRow+1 pattern. CP is always 0.
 *
 * @param {Spreadsheet} ss
 * @param {Array} rows - from _personaBuildActivityRow_
 * @private
 */
function _personaAppendActivityRows_(ss, rows) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (lockErr) {
    console.error('PersonaPass: could not acquire lock for activity log — shifts NOT logged this batch. ' + lockErr);
    return;
  }
  try {
    var sheet   = ss.getSheetByName(PERSONA_ACTIVITY_SHEET);
    var lastRow = sheet.getLastRow();
    // Derive the next numeric suffix from the last ActivityID (Col A).
    var lastId  = (sheet.getRange(lastRow, 1).getValue() || '').toString();
    var lastNum = parseInt((lastId.match(/(\d+)\s*$/) || [])[1], 10);
    if (isNaN(lastNum)) lastNum = lastRow; // fallback
    var block = rows.map(function(r, i) {
      return [
        'ARKA_ACT_' + (lastNum + 1 + i), // A ActivityID
        r.type,                          // B ActivityTypeID
        r.date,                          // C ActivityDate
        r.memberId,                      // D MemberID
        r.desc,                          // E Description
        r.source,                        // F Source
        r.cp                             // G CPAwarded
      ];
    });
    sheet.getRange(lastRow + 1, 1, block.length, 7).setValues(block);
  } finally {
    lock.releaseLock();
  }
}


// ── Small numeric + parsing helpers ─────────────────────────────────────────

/** Median of a numeric array (0 if empty). @private */
function _personaMedian_(arr) {
  if (!arr || !arr.length) return 0;
  var s = arr.slice().sort(function(a, b) { return a - b; });
  var mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Arithmetic mean of a numeric array (0 if empty). @private */
function _personaMean_(arr) {
  if (!arr || !arr.length) return 0;
  return arr.reduce(function(a, b) { return a + b; }, 0) / arr.length;
}

/** Coefficient of variation (stddev / mean) of a numeric array. @private */
function _personaCoeffOfVariation_(arr) {
  if (!arr || arr.length < 2) return 0;
  var mean = _personaMean_(arr);
  if (mean === 0) return 0;
  var variance = arr.reduce(function(a, x) { return a + (x - mean) * (x - mean); }, 0) / arr.length;
  return Math.sqrt(variance) / mean;
}

/**
 * _personaGatedVerdict_()
 *
 * Builds a "still forming" verdict object for an axis below its data gate,
 * including a progress note for the nudge UI.
 * @private
 */
function _personaGatedVerdict_(axis, have, need, unitLabel) {
  return {
    axis: axis, side: 'Forming', badgeID: '', position: 50, gated: true,
    note: 'Keep reading — ' + Math.max(0, need - have) + ' more ' + unitLabel +
          ' to reveal this trait (' + Math.min(have, need) + ' of ' + need + ').'
  };
}

/**
 * _personaCanonicalGenres_()
 *
 * Splits a free-text genre cell into an array using the canonical 13-genre set.
 * Free-text tags that match (case-insensitive) a canonical genre are kept;
 * unknowns are dropped so Breadth counts canonical genres only — NOT the
 * Genre-Collector free-text behaviour, which must stay distinct.
 *
 * @param {string} raw - Col D genre string
 * @returns {Array<string>}
 * @private
 */
function _personaCanonicalGenres_(raw) {
  var CANON = ['Fiction','Fantasy','Sci-Fi','Crime & Suspense','Non-Fiction','Self-Help',
               'Philosophy','Psychology','Classics','Religious','Horror','Business','Poetry'];
  var lowerCanon = CANON.map(function(g) { return g.toLowerCase(); });
  var found = {};
  (raw || '').toString().split(',').forEach(function(tag) {
    var t = tag.trim().toLowerCase();
    var idx = lowerCanon.indexOf(t);
    if (idx >= 0) found[CANON[idx]] = true;
  });
  return Object.keys(found);
}

/**
 * _personaExtractYear_()
 *
 * Extracts a 4-digit year from a PublishedDate cell (year, or date string).
 * Returns 0 if none found.
 * @private
 */
function _personaExtractYear_(raw) {
  if (!raw) return 0;
  var m = raw.toString().match(/(\d{4})/);
  return m ? parseInt(m[1], 10) : 0;
}

/**
 * _personaExtractHour_()
 *
 * Extracts the local hour (0–23) from an Arka Z-Format timestamp string
 * (dd-MM-yyyy HH:mm:ss +NNNN). The HH is the member-local hour as written,
 * which is exactly what Rhythm needs — do NOT convert to script tz.
 * Returns -1 if unparseable (caller buckets it as night, harmless).
 * @private
 */
function _personaExtractHour_(raw) {
  if (!raw) return -1;
  var m = raw.toString().match(/\d{2}-\d{2}-\d{4}\s+(\d{2}):/);
  return m ? parseInt(m[1], 10) : -1;
}

/**
 * _personaParseDate_()
 *
 * Parses Arka date strings to ms. Mirrors _aiPassParseDate_ for consistency.
 * Handles Z-Format, Short-Date (dd-MMM-yyyy), ISO, and Date objects.
 * Returns NaN for unparseable input — callers guard.
 * @private
 */
function _personaParseDate_(raw) {
  if (!raw) return NaN;
  if (raw instanceof Date) return raw.getTime();
  var str = raw.toString().trim();
  var z = str.match(/(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})\s+([\+\-]\d{4})/);
  if (z) {
    return new Date(z[3] + '-' + z[2] + '-' + z[1] + 'T' + z[4] + ':' + z[5] + ':' + z[6] + z[7]).getTime();
  }
  var sd = str.match(/(\d{2})-([a-zA-Z]{3})-(\d{4})/);
  if (sd) return new Date(str.replace(/-/g, ' ')).getTime();
  return new Date(str).getTime();
}


// ── Trigger management (mirrors ArkaAIPass) ──────────────────────────────────

/**
 * installArkaPersonaPassTrigger()
 *
 * One-time setup. Run manually once from the Apps Script editor. Installs a
 * daily trigger at 00:07 (before ArkaAIPass at 00:10 — persona compute is fast
 * and has no external dependency, so it can lead). Chain triggers are managed
 * dynamically by the script. Do not install duplicates.
 */
function installArkaPersonaPassTrigger() {
  _personaRemoveAllTriggers_();
  ScriptApp.newTrigger(PERSONA_FUNCTION_NAME)
    .timeBased().atHour(0).nearMinute(7).everyDays(1).create();
  console.log('PersonaPass: daily trigger installed at 00:07.');
}

/** Schedules the next chained run. @private */
function _personaScheduleNextRun_() {
  // Remove stale chain triggers for this function, then add a fresh one.
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === PERSONA_FUNCTION_NAME) {
      try { ScriptApp.deleteTrigger(t); } catch (e) {}
    }
  });
  var nextRunAt = new Date(Date.now() + PERSONA_CHAIN_DELAY_MINUTES * 60 * 1000);
  ScriptApp.newTrigger(PERSONA_FUNCTION_NAME).timeBased().at(nextRunAt).create();
}

/** Removes ALL triggers for this function. @private */
function _personaRemoveAllTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === PERSONA_FUNCTION_NAME) {
      try { ScriptApp.deleteTrigger(t); } catch (e) {}
    }
  });
}

/**
 * _personaCleanup_()
 *
 * Clears cursor, ready flag, and cached indexes; removes chain triggers and
 * reinstalls the daily trigger. Called when all members are processed or abort.
 * @private
 */
function _personaCleanup_(props) {
  props.deleteProperty(PERSONA_CURSOR_KEY);
  props.deleteProperty(PERSONA_READY_FLAG_KEY);
  props.deleteProperty(PERSONA_INDEX_KEY);
  props.deleteProperty(PERSONA_RARITY_KEY);
  _personaRemoveAllTriggers_();
  ScriptApp.newTrigger(PERSONA_FUNCTION_NAME)
    .timeBased().atHour(0).nearMinute(7).everyDays(1).create();
}


// ── Manual run helpers (admin use only) ──────────────────────────────────────

/**
 * resetArkaPersonaPassState()
 *
 * Clears all PropertiesService keys and removes all chain triggers. Use to
 * abort a stuck run or reset before a test. Run from the editor.
 */
function resetArkaPersonaPassState() {
  var props = PropertiesService.getScriptProperties();
  props.deleteProperty(PERSONA_CURSOR_KEY);
  props.deleteProperty(PERSONA_READY_FLAG_KEY);
  props.deleteProperty(PERSONA_INDEX_KEY);
  props.deleteProperty(PERSONA_RARITY_KEY);
  _personaRemoveAllTriggers_();
  console.log('PersonaPass: state reset. Run installArkaPersonaPassTrigger() to reinstall the daily trigger.');
}

/**
 * forceRunArkaPersonaPassNow()
 *
 * Forces an immediate full run regardless of the ready flag. Sets the flag and
 * cursor=1, then calls runArkaPersonaPass(). For testing / manual backfill.
 */
function forceRunArkaPersonaPassNow() {
  var props = PropertiesService.getScriptProperties();
  props.setProperty(PERSONA_READY_FLAG_KEY, 'true');
  props.setProperty(PERSONA_CURSOR_KEY, '1');
  console.log('PersonaPass: forcing immediate run...');
  runArkaPersonaPass();
}



// TEMP — verify the source index builds and looks sane. Read-only.
function _personaTest_inspectIndex() {
  var ss = SpreadsheetApp.openById(PERSONA_SPREADSHEET_ID);
  var index = _personaBuildSourceIndex_(ss);
  var ids = Object.keys(index);
  console.log('Members indexed: ' + ids.length);
  // Dump the 3 most active members so you can eyeball the aggregates.
  ids.sort(function(a,b){ return index[b].sessions - index[a].sessions; })
     .slice(0,3).forEach(function(id){
       var m = index[id];
       console.log(id + ' | sessions=' + m.sessions +
         ' | hours=' + JSON.stringify(m.hourBuckets) +
         ' | finished=' + m.finishedCount + ' dnf=' + m.dnfCount +
         ' | medianSession=' + _personaMedian_(m.sessionPages) +
         ' | biggestDay=' + JSON.stringify(m.biggestDay) +
         ' | longest=' + JSON.stringify(m.longestBook));
     });
}

// TEMP — verify one member's full computed personality. Read-only.
function _personaTest_computeOne() {
  var ss = SpreadsheetApp.openById(PERSONA_SPREADSHEET_ID);
  var index = _personaBuildSourceIndex_(ss);
  var rarity = _personaBuildRarityTally_(index);
  var YOUR_ID = 'ARKA_MEMBER_1';   // ← put your own member ID here
  console.log(JSON.stringify(_personaComputeForMember_(index[YOUR_ID], rarity), null, 2));
}

/**
 * dryRunArkaPersonaPass()
 *
 * READ-ONLY diagnostic. Computes every member's personality in memory and logs
 * a distribution summary — WITHOUT writing PersonaProfileDB rows or logging any
 * PERSONAUPDATE activity. Use this to judge whether the v1 thresholds split the
 * club sensibly before committing rows, and to re-check after tuning any cut-point.
 *
 * What it reports:
 *   - Club size, and how many members clear the live-data / taste gates.
 *   - Per-axis: how many land on each side vs how many are still "forming".
 *   - Archetype histogram (which named types resolved, and the templated tail).
 *   - The most/least common archetype, and the count with no archetype yet.
 *
 * Safe to run anytime. Does NOT touch triggers, properties, or sheets.
 */
function dryRunArkaPersonaPass() {
  var ss    = SpreadsheetApp.openById(PERSONA_SPREADSHEET_ID);
  var index = _personaBuildSourceIndex_(ss);
  var rarity = _personaBuildRarityTally_(index);

  var memberIds = Object.keys(index);
  var clubSize  = memberIds.length;

  // ── Tallies ────────────────────────────────────────────────────────────
  var axisSides   = {}; // axis → { side: count, ... , _forming: count }
  var archCounts  = {}; // archetypeName → count
  var noArchetype = 0;
  var gateLive    = 0;  // members clearing the live-session gate
  var gateTaste   = 0;  // members clearing the finished-books gate
  var resolvedAxisCounts = []; // per-member count of non-gated axes (for avg)

  memberIds.forEach(function(id) {
    var agg = index[id];
    if (agg.liveSessions  >= PERSONA_MIN_SESSIONS_FOR_RHYTHM) gateLive++;
    if (agg.finishedCount >= PERSONA_MIN_FINISHED_FOR_TASTE)  gateTaste++;

    var p = _personaComputeForMember_(agg, rarity);

    // Archetype histogram.
    if (p.archetypeName) {
      archCounts[p.archetypeName] = (archCounts[p.archetypeName] || 0) + 1;
    } else {
      noArchetype++;
    }

    // Per-axis side distribution.
    var resolvedThisMember = 0;
    p.verdicts.forEach(function(v) {
      if (!axisSides[v.axis]) axisSides[v.axis] = { _forming: 0 };
      if (v.gated) {
        axisSides[v.axis]._forming++;
      } else {
        axisSides[v.axis][v.side] = (axisSides[v.axis][v.side] || 0) + 1;
        resolvedThisMember++;
      }
    });
    resolvedAxisCounts.push(resolvedThisMember);
  });

  // ── Print: header ────────────────────────────────────────────────────────
  console.log('════════ PERSONA DRY RUN — ' + PERSONA_ENGINE_VERSION + ' ════════');
  console.log('Club members indexed : ' + clubSize);
  console.log('Clear live-data gate (≥' + PERSONA_MIN_SESSIONS_FOR_RHYTHM + ' live sessions) : ' +
              gateLive + ' / ' + clubSize);
  console.log('Clear taste gate (≥' + PERSONA_MIN_FINISHED_FOR_TASTE + ' finished books)    : ' +
              gateTaste + ' / ' + clubSize);
  var avgResolved = resolvedAxisCounts.length
    ? (resolvedAxisCounts.reduce(function(a, b) { return a + b; }, 0) / resolvedAxisCounts.length)
    : 0;
  console.log('Avg resolved axes per member : ' + avgResolved.toFixed(1));

  // ── Print: per-axis distribution ──────────────────────────────────────────
  console.log('──────── AXIS DISTRIBUTION ────────');
  Object.keys(axisSides).sort().forEach(function(axis) {
    var sides = axisSides[axis];
    var parts = [];
    Object.keys(sides).forEach(function(side) {
      if (side === '_forming') return;
      parts.push(side + '=' + sides[side]);
    });
    parts.push('forming=' + sides._forming);
    console.log(_personaPad_(axis, 14) + ' | ' + parts.join('  '));
  });

  // ── Print: archetype histogram (descending) ────────────────────────────────
  console.log('──────── ARCHETYPES ────────');
  var archSorted = Object.keys(archCounts).sort(function(a, b) {
    return archCounts[b] - archCounts[a];
  });
  archSorted.forEach(function(name) {
    console.log(_personaPad_(name, 28) + ' ' + archCounts[name]);
  });
  console.log(_personaPad_('(no archetype yet)', 28) + ' ' + noArchetype);

  if (archSorted.length) {
    console.log('Most common  : ' + archSorted[0] + ' (' + archCounts[archSorted[0]] + ')');
    console.log('Rarest named : ' + archSorted[archSorted.length - 1] +
                ' (' + archCounts[archSorted[archSorted.length - 1]] + ')');
  }
  console.log('Distinct archetypes resolved : ' + archSorted.length);
  console.log('═══════════════════════════════════════════');
}

/** Right-pads a string to width for aligned log columns. @private */
function _personaPad_(str, width) {
  str = (str || '').toString();
  while (str.length < width) str += ' ';
  return str;
}
