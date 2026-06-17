/**
 * ARKA EMAIL PASS — Standalone Outbound Email Engine
 *
 * Responsibility: send personalised re-engagement and behavioural emails to Arka
 * members by reading PENDING rows from EmailQueueDB (BackEndEngine spreadsheet),
 * sending via MailApp, updating each row's status, and appending a permanent
 * record to EmailSentLogDB.
 *
 * Why a separate file (not inside MasterEngine)?
 * ──────────────────────────────────────────────
 * MailApp requires the owner's explicit "Send email as you" OAuth consent.
 * That scope must NEVER exist in the member-facing app project. This file and
 * MasterEngine live together in the owner-run BackEndEngine project only.
 * The member app stays scoped to Sheets/Drive/profile/HtmlService forever.
 *
 * Separation of concerns
 * ──────────────────────
 *   MasterEngine    →  stats, badges, CP, insights, tasks; writes EmailQueueDB
 *   ArkaAIPass      →  Gemini AI advice (rate-limited, chained)
 *   ArkaPersonaPass →  Reading Personality computation
 *   ArkaEmailPass   →  Sends queued emails, updates status, logs permanently (this file)
 *
 * Data flow
 * ─────────
 * This script reads from the BackEndEngine spreadsheet ONLY (EmailQueueDB,
 * EmailSentLogDB, BackEndConfigDB). All member data needed to compose emails
 * was pre-baked by MasterEngine into PayloadJSON at queue-write time. ArkaEmailPass
 * makes zero reads from the main Arka spreadsheet — clean isolation boundary.
 *
 * Execution model
 * ───────────────
 *   1. Daily trigger fires runArkaEmailPass() at 00:30 (after all other passes).
 *   2. Checks ARKAEMAILPASS_READY flag set by MasterEngine's _syncEmailQueue_().
 *   3. Loads BackEndConfigDB for kill switch and sender name.
 *   4. Loads all PENDING rows from EmailQueueDB.
 *   5. For each PENDING row: compose subject + HTML body from PayloadJSON, send
 *      via MailApp, mark SENT (or FAILED), append permanent row to EmailSentLogDB.
 *   6. 300ms courtesy sleep between sends (not a hard API rate limit — purely
 *      prevents rapid-fire SMTP bursts that can trigger Google spam filters).
 *   7. No chaining needed: even 50 emails at 300ms sleep = ~15 seconds total.
 *
 * Click tracking (requires companion doGet change in ArkaClubAppCode)
 * ─────────────────────────────────────────────────────────────────────
 * Every email contains a deep-link: {APP_BASE_URL}?eid={TrackingToken}
 * In ArkaClubAppCode doGet(e): read e.parameter.eid, inject as JS global
 * `window.ARKA_EMAIL_TRACKING_TOKEN`, then on app init call
 * logEmailClick(trackingToken) → logs ARKA_ACTTYP_EMAIL_CLICK to ActivityLogDB.
 * MasterEngine back-fills ClickedAt in EmailQueueDB nightly via _syncEmailQueue_().
 * NOTE: Add ARKA_ACTTYP_EMAIL_CLICK to ActivityTypeDB with CP = 0.
 *
 * Opt-out flow (requires companion MemberDB Col U + frontend settings change)
 * ────────────────────────────────────────────────────────────────────────────
 * Email footer links to: {APP_BASE_URL}?optout=true
 * Member opens app, a settings toggle sets MemberDB Col U (EmailOptOut) = true.
 * MasterEngine respects this in _syncEmailQueue_() — opted-out members never
 * receive a PENDING queue row.
 *
 * Kill switch
 * ───────────
 * Set Script Property EMAILPASS_ENABLED = 'false' OR set BackEndConfigDB row
 * EMAILPASS_ENABLED = false to halt all sends without touching code.
 *
 * Trigger setup (one-time manual step)
 * ─────────────────────────────────────
 * Run installArkaEmailPassTrigger() once from the Apps Script editor.
 * Installs a daily time-based trigger at 00:30. Do not add more triggers manually.
 */

// ── Constants ──────────────────────────────────────────────────────────────

/** BackEndEngine spreadsheet — EmailQueueDB, EmailSentLogDB, BackEndConfigDB. */
const EMAILPASS_BACKEND_SPREADSHEET_ID = '1s5h8T6PGPTOBs_RKJNRJjRCZm8igWJzmniLRoW7BFJA';

// ── BackEndEngine sheet names ──────────────────────────────────────────────
const EMAILPASS_QUEUE_SHEET    = 'EmailQueueDB';
const EMAILPASS_SENT_LOG_SHEET = 'EmailSentLogDB';
const EMAILPASS_CONFIG_SHEET   = 'BackEndConfigDB';

// ── EmailQueueDB column indices (0-based) — must match _syncEmailQueue_() ──
const EMAILPASS_Q_COL_QUEUE_ID       = 0;  // A — ARKA_EMAILQ_X
const EMAILPASS_Q_COL_MEMBER_ID      = 1;  // B — ARKA_MEMBER_X
const EMAILPASS_Q_COL_EMAIL_ADDR     = 2;  // C — recipient email
const EMAILPASS_Q_COL_DISPLAY_NAME   = 3;  // D — member display name
const EMAILPASS_Q_COL_EMAIL_TYPE     = 4;  // E — REENGAGEMENT_7D, STREAK_RISK, etc.
const EMAILPASS_Q_COL_PAYLOAD_JSON   = 5;  // F — pre-baked personalisation data
const EMAILPASS_Q_COL_SCHEDULED_DATE = 6;  // G — dd-MMM-yyyy
const EMAILPASS_Q_COL_STATUS         = 7;  // H — PENDING / SENT / FAILED / SUPPRESSED
const EMAILPASS_Q_COL_SENT_AT        = 8;  // I — written here after send
const EMAILPASS_Q_COL_TRACKING_TOKEN = 9;  // J — ARKA_ET_XXXXXXXX
const EMAILPASS_Q_COL_CLICKED_AT     = 10; // K — back-filled by MasterEngine nightly
const EMAILPASS_Q_COL_CAMPAIGN_ID    = 11; // L — analytics identifier
const EMAILPASS_Q_COL_CREATED_AT     = 12; // M — when MasterEngine wrote this row

// ── EmailSentLogDB column indices (0-based) ────────────────────────────────
const EMAILPASS_LOG_COL_LOG_ID         = 0;  // A — ARKA_EMAILLOG_X
const EMAILPASS_LOG_COL_QUEUE_ID       = 1;  // B — FK → EmailQueueDB
const EMAILPASS_LOG_COL_MEMBER_ID      = 2;  // C
const EMAILPASS_LOG_COL_EMAIL_ADDR     = 3;  // D
const EMAILPASS_LOG_COL_EMAIL_TYPE     = 4;  // E
const EMAILPASS_LOG_COL_SUBJECT        = 5;  // F — actual subject line sent
const EMAILPASS_LOG_COL_SENT_AT        = 6;  // G
const EMAILPASS_LOG_COL_STATUS         = 7;  // H — SENT / FAILED
const EMAILPASS_LOG_COL_ERROR_MSG      = 8;  // I — error detail if FAILED
const EMAILPASS_LOG_COL_TRACKING_TOKEN = 9;  // J
const EMAILPASS_LOG_COL_CLICKED_AT     = 10; // K — back-filled by MasterEngine

// ── Email queue status values ──────────────────────────────────────────────
const EMAILPASS_STATUS_PENDING    = 'PENDING';
const EMAILPASS_STATUS_SENT       = 'SENT';
const EMAILPASS_STATUS_FAILED     = 'FAILED';
const EMAILPASS_STATUS_SUPPRESSED = 'SUPPRESSED';

/** PropertiesService key written by MasterEngine when the queue is ready. */
const EMAILPASS_READY_FLAG = 'ARKAEMAILPASS_READY';

/** Function name registered with ScriptApp — must match exactly. */
const EMAILPASS_TRIGGER_FUNCTION = 'runArkaEmailPass';

/**
 * Courtesy sleep between MailApp sends (ms).
 * Not an API rate limit — prevents rapid-fire SMTP bursts that can trigger
 * Google spam classification on the sending account.
 */
const EMAILPASS_INTER_SEND_SLEEP_MS = 300;

/**
 * Deployed web app base URL for email deep-links and opt-out links.
 * Replace with the actual GAS web app deployment URL.
 * Format: https://script.google.com/macros/s/{DEPLOYMENT_ID}/exec
 */
const EMAILPASS_APP_BASE_URL = 'https://script.google.com/macros/s/AKfycbyyBFZZmwp4Enc9Ksw284HRCymaCCLvI5OJPceZqeP2kOAITTD4IyirKmfjwm8NbMTd/exec';


// ── Entry point ────────────────────────────────────────────────────────────

/**
 * runArkaEmailPass()
 *
 * Main entry point called by the daily time-based trigger at 00:30.
 * Checks the ARKAEMAILPASS_READY flag, loads PENDING queue rows, composes
 * and sends each email, then updates queue status and writes permanent logs.
 *
 * Kill switch and readiness gate are both checked BEFORE the try-finally block
 * so the ARKAEMAILPASS_READY flag is only cleared when actual processing runs.
 * An early exit via either kill switch leaves the flag untouched — a subsequent
 * manual run will not be incorrectly blocked.
 */
function runArkaEmailPass() {
  var props = PropertiesService.getScriptProperties();

  // ── Kill switch 1: Script Property (fastest possible exit) ───────────────
  // Set Script Property EMAILPASS_ENABLED = 'false' for an instant hard stop
  // that requires no spreadsheet read. Exits BEFORE the try-finally block so
  // the ARKAEMAILPASS_READY flag is NOT cleared — safe to re-enable and retry.
  var killSwitchProp = props.getProperty('EMAILPASS_ENABLED');
  if (killSwitchProp === 'false') {
    console.log('runArkaEmailPass: EMAILPASS_ENABLED=false (Script Property) — exiting. Flag preserved.');
    return;
  }

  // ── Readiness gate ────────────────────────────────────────────────────────
  // MasterEngine sets ARKAEMAILPASS_READY after _syncEmailQueue_() completes.
  // Exits BEFORE try-finally — flag is not cleared on a gate failure so a
  // late-running MasterEngine can still be followed by a manual retry.
  var isReady = props.getProperty(EMAILPASS_READY_FLAG);
  if (isReady !== 'true') {
    console.warn('runArkaEmailPass: ARKAEMAILPASS_READY flag not set — MasterEngine may not have completed. Flag preserved for retry.');
    return;
  }

  // ── Load config and Kill switch 2: BackEndConfigDB ────────────────────────
  // Both config load and the spreadsheet kill switch are resolved HERE, outside
  // the try-finally, so an early exit on EMAILPASS_ENABLED=false (ConfigDB) also
  // leaves the ARKAEMAILPASS_READY flag untouched.
  var backendSs   = SpreadsheetApp.openById(EMAILPASS_BACKEND_SPREADSHEET_ID);
  var emailConfig = _loadEmailConfig_(backendSs);

  if (emailConfig['EMAILPASS_ENABLED'] === false || emailConfig['EMAILPASS_ENABLED'] === 'false') {
    console.log('runArkaEmailPass: EMAILPASS_ENABLED=false (BackEndConfigDB) — exiting. Flag preserved.');
    return;
  }

  var senderName = (emailConfig['EMAIL_SENDER_NAME'] || 'Arka Readers Club').toString();

  // ── From here on: processing is committed, flag WILL be cleared on exit ───
  // The try-finally boundary marks the point of no return. Any exit below —
  // success, error, or crash — clears ARKAEMAILPASS_READY so a stale queue
  // from tonight is never accidentally re-processed tomorrow night.
  console.log('runArkaEmailPass: starting email send pass.');

  try {
    // ── Load PENDING rows from EmailQueueDB ────────────────────────────────
    var queueSheet = backendSs.getSheetByName(EMAILPASS_QUEUE_SHEET);
    if (!queueSheet) {
      console.warn('runArkaEmailPass: EmailQueueDB sheet not found.');
      return;
    }
    var queueData = queueSheet.getDataRange().getValues();

    // ── Resolve next EmailSentLogDB ID before the send loop ───────────────
    var sentLogSheet = backendSs.getSheetByName(EMAILPASS_SENT_LOG_SHEET);
    var nextLogIdNum = 1;
    var sentLogRows  = []; // rows to batch-append to EmailSentLogDB after the loop
    if (sentLogSheet) {
      var existingLogData = sentLogSheet.getDataRange().getValues();
      for (var sli = 1; sli < existingLogData.length; sli++) {
        var slId = parseInt(
          (existingLogData[sli][EMAILPASS_LOG_COL_LOG_ID] || '').toString().replace('ARKA_EMAILLOG_', ''),
          10
        );
        if (!isNaN(slId) && slId >= nextLogIdNum) nextLogIdNum = slId + 1;
      }
    }

    // ── Process each PENDING row ───────────────────────────────────────────
    _processEmailQueue_(queueSheet, queueData, senderName, sentLogRows, nextLogIdNum);

    // ── Batch-append permanent records to EmailSentLogDB ──────────────────
    if (sentLogRows.length > 0 && sentLogSheet) {
      var logAppendRow = sentLogSheet.getLastRow() + 1;
      sentLogSheet
        .getRange(logAppendRow, 1, sentLogRows.length, sentLogRows[0].length)
        .setValues(sentLogRows);
      console.log('runArkaEmailPass: appended ' + sentLogRows.length + ' rows to EmailSentLogDB.');
    }

  } catch (runErr) {
    console.error('runArkaEmailPass: unexpected error:', runErr.message, runErr.stack);

  } finally {
    // Clear the ready flag unconditionally once processing has been attempted.
    // This prevents a stale tonight-queue from being re-sent on a manual retry
    // tomorrow. Flag is only re-set by MasterEngine's next nightly run.
    try {
      props.setProperty(EMAILPASS_READY_FLAG, 'false');
      console.log('runArkaEmailPass: ARKAEMAILPASS_READY cleared — run complete.');
    } catch (flagErr) { /* non-fatal */ }
  }
}


// ── Config loader ──────────────────────────────────────────────────────────

/**
 * _loadEmailConfig_()
 *
 * Reads BackEndConfigDB from the BackEndEngine spreadsheet and returns a
 * key → value map. Missing keys return undefined (callers use || defaults).
 *
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} backendSs
 * @returns {Object} Config key → config value map
 * @private
 */
function _loadEmailConfig_(backendSs) {
  var configSheet = backendSs.getSheetByName(EMAILPASS_CONFIG_SHEET);
  var configMap   = {};
  if (!configSheet) return configMap;
  var configData = configSheet.getDataRange().getValues();
  // Row 1 = header; data from row 2 onward
  for (var ci = 1; ci < configData.length; ci++) {
    var cfgKey = (configData[ci][0] || '').toString().trim();
    if (cfgKey) configMap[cfgKey] = configData[ci][1];
  }
  return configMap;
}


// ── Main processing loop ───────────────────────────────────────────────────

/**
 * _processEmailQueue_()
 *
 * Iterates PENDING rows in EmailQueueDB, composes each email, sends via MailApp,
 * updates the row status in-place, and pushes a permanent log row to sentLogRows.
 *
 * Queue rows are updated one-at-a-time (not batched) because a mid-loop crash
 * should leave already-sent rows marked SENT — preventing double-sends on a retry.
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} queueSheet - EmailQueueDB sheet
 * @param {Array[]} queueData - Full sheet data including header row
 * @param {string} senderName - Display name for the From field
 * @param {Array[]} sentLogRows - Mutable array; push-append permanent log rows here
 * @param {number} nextLogIdNum - Starting counter for EmailSentLogDB IDs
 * @private
 */
function _processEmailQueue_(queueSheet, queueData, senderName, sentLogRows, nextLogIdNum) {
  var NOW = new Date();
  var logIdCounter = nextLogIdNum;

  for (var qi = 1; qi < queueData.length; qi++) {
    var qRow    = queueData[qi];
    var qStatus = (qRow[EMAILPASS_Q_COL_STATUS] || '').toString();
    if (qStatus !== EMAILPASS_STATUS_PENDING) continue;

    var queueId      = (qRow[EMAILPASS_Q_COL_QUEUE_ID]      || '').toString();
    var memberId     = (qRow[EMAILPASS_Q_COL_MEMBER_ID]      || '').toString();
    var emailAddr    = (qRow[EMAILPASS_Q_COL_EMAIL_ADDR]     || '').toString().trim();
    var displayName  = (qRow[EMAILPASS_Q_COL_DISPLAY_NAME]   || '').toString();
    var emailType    = (qRow[EMAILPASS_Q_COL_EMAIL_TYPE]     || '').toString();
    var trackingToken= (qRow[EMAILPASS_Q_COL_TRACKING_TOKEN] || '').toString();

    // Skip rows with missing critical fields
    if (!emailAddr || !emailType || !queueId) {
      console.warn('_processEmailQueue_: skipping row ' + (qi + 1) + ' — missing required fields.');
      continue;
    }

    // Parse payload JSON written by MasterEngine
    var payload = {};
    try {
      payload = JSON.parse((qRow[EMAILPASS_Q_COL_PAYLOAD_JSON] || '{}').toString());
    } catch (payloadErr) {
      console.warn('_processEmailQueue_: malformed PayloadJSON on row ' + (qi + 1) + ' — skipping.');
      continue;
    }

    // Compose email content from type + payload
    var emailContent = _composeEmail_(emailType, payload, displayName, trackingToken);
    if (!emailContent) {
      console.warn('_processEmailQueue_: unknown emailType "' + emailType + '" on row ' + (qi + 1) + ' — suppressing.');
      queueSheet.getRange(qi + 1, EMAILPASS_Q_COL_STATUS + 1).setValue(EMAILPASS_STATUS_SUPPRESSED);
      continue;
    }

    // ── Send via MailApp ──────────────────────────────────────────────────────
    var sendStatus   = EMAILPASS_STATUS_SENT;
    var sentAtStr    = '';
    var errorMessage = '';

    try {
      MailApp.sendEmail({
        to      : emailAddr,
        subject : emailContent.subject,
        body    : emailContent.plainText,   // fallback for non-HTML clients
        htmlBody: emailContent.htmlBody,
        name    : senderName
      });
      sentAtStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd-MM-yyyy HH:mm:ss Z');
      console.log('runArkaEmailPass: SENT ' + emailType + ' to ' + memberId + ' (' + emailAddr + ')');
    } catch (sendErr) {
      sendStatus   = EMAILPASS_STATUS_FAILED;
      errorMessage = sendErr.message || 'Unknown send error';
      console.error('runArkaEmailPass: FAILED ' + emailType + ' to ' + memberId + ': ' + errorMessage);
    }

    // ── Update queue row status in-place (prevents double-sends on retry) ────
    queueSheet.getRange(qi + 1, EMAILPASS_Q_COL_STATUS  + 1).setValue(sendStatus);
    queueSheet.getRange(qi + 1, EMAILPASS_Q_COL_SENT_AT + 1).setValue(sentAtStr);

    // ── Append permanent record to EmailSentLogDB (via batch array) ───────────
    var logId = 'ARKA_EMAILLOG_' + logIdCounter;
    logIdCounter++;
    sentLogRows.push([
      logId,                // A — LogID
      queueId,              // B — QueueID
      memberId,             // C — MemberID
      emailAddr,            // D — EmailAddress
      emailType,            // E — EmailType
      emailContent.subject, // F — Subject (actual line sent)
      sentAtStr,            // G — SentAt
      sendStatus,           // H — Status (SENT / FAILED)
      errorMessage,         // I — ErrorMessage (blank if SENT)
      trackingToken,        // J — TrackingToken
      ''                    // K — ClickedAt (back-filled nightly by MasterEngine)
    ]);

    // Courtesy sleep between sends
    if (qi < queueData.length - 1) Utilities.sleep(EMAILPASS_INTER_SEND_SLEEP_MS);
  }
}


// ── Email composition dispatcher ───────────────────────────────────────────

/**
 * _composeEmail_()
 *
 * Dispatches to the correct email builder based on emailType.
 * Returns { subject, plainText, htmlBody } or null for unknown types.
 *
 * @param {string} emailType    - One of the EMAIL_TYPE constants
 * @param {Object} payload      - Pre-baked personalisation data from PayloadJSON
 * @param {string} displayName  - Member's display name
 * @param {string} trackingToken- Unique token for click-through tracking
 * @returns {{ subject: string, plainText: string, htmlBody: string }|null}
 * @private
 */
function _composeEmail_(emailType, payload, displayName, trackingToken) {
  switch (emailType) {
    case 'REENGAGEMENT_7D':
    case 'REENGAGEMENT_14D':
    case 'REENGAGEMENT_30D':
      return _buildReengagementEmail_(emailType, payload, displayName, trackingToken);
    case 'STREAK_RISK':
      return _buildStreakRiskEmail_(payload, displayName, trackingToken);
    case 'CHALLENGE_DEADLINE':
      return _buildChallengeDeadlineEmail_(payload, displayName, trackingToken);
    case 'FINISH_NUDGE':
      return _buildFinishNudgeEmail_(payload, displayName, trackingToken);
    default:
      return null;
  }
}


// ── Email builders ─────────────────────────────────────────────────────────

/**
 * _buildReengagementEmail_()
 *
 * Builds the re-engagement email for members who haven't logged pages in 7, 14,
 * or 30+ days. Tone escalates gently across the three tiers:
 *   7D  — warm & curious     ("your bookmarks miss you")
 *   14D — personal & caring  ("it's been two weeks")
 *   30D — low-pressure       ("no pressure, we're here whenever you're ready")
 *
 * @param {string} emailType
 * @param {Object} payload
 * @param {string} displayName
 * @param {string} trackingToken
 * @returns {{ subject: string, plainText: string, htmlBody: string }}
 * @private
 */
function _buildReengagementEmail_(emailType, payload, displayName, trackingToken) {
  var firstName     = displayName.split(' ')[0]; // friendly first-name form
  var archetype     = payload.archetype   || '';
  var currentBook   = payload.currentBookTitle || '';
  var daysAway      = payload.daysSinceLastLog || 0;
  var highlights    = payload.clubHighlights   || [];
  var appUrl        = _buildDeepLink_(trackingToken);

  // ── Subject line by tier ──────────────────────────────────────────────────
  var subject;
  if (emailType === 'REENGAGEMENT_7D') {
    subject = 'Your bookmarks miss you, ' + firstName + ' 📚';
  } else if (emailType === 'REENGAGEMENT_14D') {
    subject = 'We\'ve been thinking about you, ' + firstName + ' 📖';
  } else {
    subject = 'The club is here whenever you\'re ready, ' + firstName + ' 🌟';
  }

  // ── Opening paragraph by tier ─────────────────────────────────────────────
  var opening;
  if (emailType === 'REENGAGEMENT_7D') {
    opening = 'It\'s been ' + daysAway + ' days since you last logged a reading session. Your reading streak is quiet, but not forgotten.';
  } else if (emailType === 'REENGAGEMENT_14D') {
    opening = 'Two weeks have passed since you last opened a book with the club. Life gets busy — we get it. But we\'d love to see you back.';
  } else {
    opening = 'It\'s been a while. No pressure at all — reading is personal, and the club will be here whenever you\'re ready to come back. We just wanted you to know you\'re missed.';
  }

  // ── Book context ──────────────────────────────────────────────────────────
  var bookLine = currentBook
    ? '<p style="color:#2c3e50;font-size:15px;line-height:1.6;margin:0 0 16px;">You left off in the middle of <strong>' + currentBook + '</strong>. It\'s still waiting for you.</p>'
    : '';

  // ── Archetype context ─────────────────────────────────────────────────────
  var archetypeLine = archetype
    ? '<p style="color:#5b6b6e;font-size:14px;line-height:1.6;margin:0 0 20px;font-style:italic;">' + archetype + ' — that\'s you. And that reader hasn\'t gone anywhere.</p>'
    : '';

  // ── Club social proof ─────────────────────────────────────────────────────
  var highlightHtml = '';
  if (highlights.length > 0) {
    var names = highlights.map(function(h) { return '<strong>' + h.memberDisplayName + '</strong>'; });
    var nameStr = names.length === 1 ? names[0]
                : names.length === 2 ? names[0] + ' and ' + names[1]
                : names[0] + ', ' + names[1] + ' and ' + names[2];
    highlightHtml = '<div style="background:#f8f9fa;border-left:3px solid #A984BA;padding:12px 16px;margin:0 0 20px;border-radius:0 6px 6px 0;">'
      + '<p style="color:#5b6b6e;font-size:13px;margin:0;">📚 This week in the club: ' + nameStr + ' finished a book. The club keeps reading.</p>'
      + '</div>';
  }

  // ── Assemble HTML body ────────────────────────────────────────────────────
  var bodyContent =
    '<p style="color:#2c3e50;font-size:18px;font-weight:600;margin:0 0 12px;">Hey ' + firstName + ',</p>'
    + '<p style="color:#2c3e50;font-size:15px;line-height:1.6;margin:0 0 16px;">' + opening + '</p>'
    + bookLine
    + archetypeLine
    + highlightHtml
    + _buildCtaButton_('Jump Back In →', appUrl)
    + '<p style="color:#5b6b6e;font-size:13px;line-height:1.6;margin:20px 0 0;">No pressure. Even one page counts.</p>';

  var plainText = 'Hey ' + firstName + ',\n\n' + opening + '\n\n'
    + (currentBook ? 'You left off in the middle of "' + currentBook + '". It\'s still waiting.\n\n' : '')
    + (highlights.length > 0 ? 'The club keeps reading. Jump back in:\n' : '')
    + appUrl + '\n\nArka Readers Club';

  return {
    subject  : subject,
    plainText: plainText,
    htmlBody : _buildEmailWrapper_(bodyContent, trackingToken)
  };
}


/**
 * _buildStreakRiskEmail_()
 *
 * Fires when a member with an active reading streak hasn't logged in 5+ days.
 * Tone: urgent but supportive — the streak is precious, one log saves it.
 *
 * @param {Object} payload
 * @param {string} displayName
 * @param {string} trackingToken
 * @returns {{ subject: string, plainText: string, htmlBody: string }}
 * @private
 */
function _buildStreakRiskEmail_(payload, displayName, trackingToken) {
  var firstName   = displayName.split(' ')[0];
  var weekCount   = payload.recentWeekCount || 0;
  var daysAway    = payload.daysSinceLastLog || 0;
  var currentBook = payload.currentBookTitle || '';
  var appUrl      = _buildDeepLink_(trackingToken);

  var subject = 'Your ' + weekCount + '-week reading streak is at risk, ' + firstName + ' ⚡';

  var bodyContent =
    '<p style="color:#2c3e50;font-size:18px;font-weight:600;margin:0 0 12px;">Hey ' + firstName + ',</p>'
    + '<p style="color:#2c3e50;font-size:15px;line-height:1.6;margin:0 0 16px;">You\'ve been logging reading sessions for <strong>' + weekCount + ' consecutive weeks</strong>. That\'s a streak worth protecting.</p>'
    + '<p style="color:#2c3e50;font-size:15px;line-height:1.6;margin:0 0 16px;">But you haven\'t logged in ' + daysAway + ' days — and the clock is ticking. Log just a few pages today to keep the chain alive.</p>'
    + (currentBook
        ? '<div style="background:#f8f9fa;border-left:3px solid #A984BA;padding:12px 16px;margin:0 0 20px;border-radius:0 6px 6px 0;"><p style="color:#5b6b6e;font-size:13px;margin:0;">📖 Pick up where you left off: <strong>' + currentBook + '</strong></p></div>'
        : '')
    + _buildCtaButton_('Log Reading Now →', appUrl)
    + '<p style="color:#5b6b6e;font-size:13px;margin:20px 0 0;">Even 5 minutes counts. Keep going.</p>';

  var plainText = 'Hey ' + firstName + ',\n\nYou\'ve been reading for ' + weekCount + ' consecutive weeks. Log some pages today to keep your streak alive.\n\n'
    + appUrl + '\n\nArka Readers Club';

  return {
    subject  : subject,
    plainText: plainText,
    htmlBody : _buildEmailWrapper_(bodyContent, trackingToken)
  };
}


/**
 * _buildChallengeDeadlineEmail_()
 *
 * Fires when an active challenge closes in ≤ N days and the member hasn't
 * met their goal. Tone: energising, specific about what's left to do.
 *
 * @param {Object} payload
 * @param {string} displayName
 * @param {string} trackingToken
 * @returns {{ subject: string, plainText: string, htmlBody: string }}
 * @private
 */
function _buildChallengeDeadlineEmail_(payload, displayName, trackingToken) {
  var firstName      = displayName.split(' ')[0];
  var challengeTitle = payload.challengeTitle    || 'your challenge';
  var daysLeft       = payload.challengeDaysLeft || 1;
  var current        = payload.challengeCurrent  || 0;
  var goal           = payload.challengeGoal     || 0;
  var remaining      = Math.max(0, goal - current);
  var isBooks        = payload.challengeType === 'BOOK_COUNT';
  var unitLabel      = isBooks
    ? (remaining === 1 ? 'book' : 'books')
    : (remaining === 1 ? 'page' : 'pages');
  var dayWord        = daysLeft === 1 ? 'day' : 'days';
  var appUrl         = _buildDeepLink_(trackingToken);

  var subject = daysLeft + ' ' + dayWord + ' left on your challenge, ' + firstName + ' ⏱️';

  var bodyContent =
    '<p style="color:#2c3e50;font-size:18px;font-weight:600;margin:0 0 12px;">Hey ' + firstName + ',</p>'
    + '<p style="color:#2c3e50;font-size:15px;line-height:1.6;margin:0 0 16px;">Your challenge <strong>"' + challengeTitle + '"</strong> closes in <strong>' + daysLeft + ' ' + dayWord + '</strong>.</p>'
    + '<div style="background:#f8f9fa;border:1px solid #ecf0f1;border-radius:8px;padding:16px;margin:0 0 20px;text-align:center;">'
    + '<p style="color:#5b6b6e;font-size:13px;margin:0 0 4px;">Progress</p>'
    + '<p style="color:#2c3e50;font-size:26px;font-weight:700;margin:0;">' + current + ' / ' + goal + '</p>'
    + '<p style="color:#A984BA;font-size:14px;font-weight:600;margin:4px 0 0;">' + remaining + ' ' + unitLabel + ' to go</p>'
    + '</div>'
    + '<p style="color:#2c3e50;font-size:15px;line-height:1.6;margin:0 0 20px;">You\'ve come this far. ' + remaining + ' more ' + unitLabel + ' and you finish this challenge.</p>'
    + _buildCtaButton_('Check My Progress →', appUrl);

  var plainText = 'Hey ' + firstName + ',\n\n"' + challengeTitle + '" closes in ' + daysLeft + ' ' + dayWord + '.\nYou\'re at ' + current + '/' + goal + ' — just ' + remaining + ' ' + unitLabel + ' to go.\n\n'
    + appUrl + '\n\nArka Readers Club';

  return {
    subject  : subject,
    plainText: plainText,
    htmlBody : _buildEmailWrapper_(bodyContent, trackingToken)
  };
}


/**
 * _buildFinishNudgeEmail_()
 *
 * Fires when a member is ≤ N pages from finishing a book and hasn't logged
 * in 4+ days. Tone: excited, almost celebratory — the finish line is right there.
 *
 * @param {Object} payload
 * @param {string} displayName
 * @param {string} trackingToken
 * @returns {{ subject: string, plainText: string, htmlBody: string }}
 * @private
 */
function _buildFinishNudgeEmail_(payload, displayName, trackingToken) {
  var firstName  = displayName.split(' ')[0];
  var bookTitle  = payload.finishBookTitle  || 'your book';
  var bookAuthor = payload.finishBookAuthor || '';
  var pagesLeft  = payload.finishPagesLeft  || 0;
  var appUrl     = _buildDeepLink_(trackingToken);

  var pageWord = pagesLeft === 1 ? 'page' : 'pages';
  var subject  = 'You\'re so close, ' + firstName + '! Only ' + pagesLeft + ' ' + pageWord + ' left 🏁';

  var authorLine = bookAuthor
    ? '<p style="color:#5b6b6e;font-size:13px;margin:4px 0 0;">by ' + bookAuthor + '</p>'
    : '';

  var bodyContent =
    '<p style="color:#2c3e50;font-size:18px;font-weight:600;margin:0 0 12px;">Hey ' + firstName + ',</p>'
    + '<p style="color:#2c3e50;font-size:15px;line-height:1.6;margin:0 0 16px;">You\'re just <strong>' + pagesLeft + ' ' + pageWord + '</strong> from finishing a book. The finish line is right there.</p>'
    + '<div style="background:#f8f9fa;border:1px solid #ecf0f1;border-radius:8px;padding:16px;margin:0 0 20px;">'
    + '<p style="color:#2c3e50;font-size:15px;font-weight:600;margin:0;">' + bookTitle + '</p>'
    + authorLine
    + '<p style="color:#A984BA;font-size:13px;font-weight:600;margin:8px 0 0;">📄 ' + pagesLeft + ' ' + pageWord + ' remaining</p>'
    + '</div>'
    + '<p style="color:#2c3e50;font-size:15px;line-height:1.6;margin:0 0 20px;">Sit down for even 20 minutes tonight. You could finish it.</p>'
    + _buildCtaButton_('Log & Finish →', appUrl);

  var plainText = 'Hey ' + firstName + ',\n\nYou\'re just ' + pagesLeft + ' ' + pageWord + ' from finishing "' + bookTitle + '". Log some reading tonight and cross the finish line.\n\n'
    + appUrl + '\n\nArka Readers Club';

  return {
    subject  : subject,
    plainText: plainText,
    htmlBody : _buildEmailWrapper_(bodyContent, trackingToken)
  };
}


// ── Shared HTML helpers ────────────────────────────────────────────────────

/**
 * _buildEmailWrapper_()
 *
 * Wraps body content HTML in the full Arka email chrome: branded header,
 * content area, and footer with opt-out link.
 * Uses table layout for maximum email client compatibility.
 * Colours match Arka design tokens (inline — CSS variables don't work in email).
 *
 * @param {string} bodyContentHtml - The email-specific content HTML
 * @param {string} trackingToken   - Used to build the opt-out URL
 * @returns {string} Complete HTML email string
 * @private
 */
function _buildEmailWrapper_(bodyContentHtml, trackingToken) {
  var optOutUrl = EMAILPASS_APP_BASE_URL + '?optout=true';

  return '<!DOCTYPE html>'
    + '<html lang="en"><head><meta charset="UTF-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1.0">'
    + '<title>Arka Readers Club</title></head>'
    + '<body style="margin:0;padding:0;background:#f4f7f6;font-family:\'Segoe UI\',Arial,sans-serif;">'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7f6;">'
    + '<tr><td align="center" style="padding:24px 16px;">'

    // ── Outer card ──────────────────────────────────────────────────────────
    + '<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.07);">'

    // ── Brand header ─────────────────────────────────────────────────────────
    // Three-column table layout keeps the text optically centred while the logo
    // sits flush left. The right spacer cell mirrors the logo cell width exactly.
    // Table used instead of flexbox for maximum email client compatibility.
    + '<tr><td style="background:#A984BA;padding:16px 24px;">'
    + '<table width="100%" cellpadding="0" cellspacing="0">'
    + '<tr>'
    // Left cell — logo (60px fixed width, mirrors right spacer)
    + '<td width="60" style="vertical-align:middle;">'
    + '<img src="https://lh3.googleusercontent.com/u/0/d/1O-PceFvQ9rAXZDzzSxSd-5VfA7lWqdp4"'
    + ' alt="Arka Logo" width="44" height="44"'
    + ' style="border-radius:50%;display:block;border:2px solid rgba(255,255,255,0.35);">'
    + '</td>'
    // Centre cell — ARKA wordmark + tagline
    + '<td style="text-align:center;vertical-align:middle;">'
    + '<div style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:2px;font-family:Georgia,serif;">ARKA</div>'
    + '<div style="color:rgba(255,255,255,0.82);font-size:11px;letter-spacing:1.5px;margin-top:3px;text-transform:uppercase;">Readers Club</div>'
    + '</td>'
    // Right spacer — same width as left logo cell to keep wordmark centred
    + '<td width="60"></td>'
    + '</tr>'
    + '</table>'
    + '</td></tr>'

    // ── Body content ─────────────────────────────────────────────────────────
    + '<tr><td style="padding:32px 32px 24px;">'
    + bodyContentHtml
    + '</td></tr>'

    // ── Footer ───────────────────────────────────────────────────────────────
    + '<tr><td style="background:#f8f9fa;padding:18px 32px;text-align:center;border-top:1px solid #ecf0f1;">'
    + '<p style="color:#5b6b6e;font-size:12px;margin:0;line-height:1.6;">'
    + 'You\'re receiving this as a member of Arka Readers Club.<br>'
    + '<a href="' + optOutUrl + '" style="color:#A984BA;text-decoration:none;">Unsubscribe from email notifications</a>'
    + '</p>'
    + '</td></tr>'

    + '</table>'
    + '</td></tr></table>'
    + '</body></html>';
}


/**
 * _buildCtaButton_()
 *
 * Renders a table-based CTA button that renders correctly across all major
 * email clients (including Outlook, which ignores <a> padding without tables).
 *
 * @param {string} label - Button text
 * @param {string} url   - Button href
 * @returns {string} HTML string
 * @private
 */
function _buildCtaButton_(label, url) {
  return '<table cellpadding="0" cellspacing="0" style="margin:0 0 8px;">'
    + '<tr><td style="background:#A984BA;border-radius:8px;text-align:center;padding:0;">'
    + '<a href="' + url + '" style="display:inline-block;padding:13px 28px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;font-family:\'Segoe UI\',Arial,sans-serif;">'
    + label
    + '</a></td></tr></table>';
}


/**
 * _buildDeepLink_()
 *
 * Constructs the app deep-link URL with tracking token embedded.
 * doGet(e) in ArkaClubAppCode reads e.parameter.eid and injects it as
 * window.ARKA_EMAIL_TRACKING_TOKEN for the click-tracking flow.
 *
 * @param {string} trackingToken - ARKA_ET_XXXXXXXX format token
 * @returns {string} Full URL string
 * @private
 */
function _buildDeepLink_(trackingToken) {
  return EMAILPASS_APP_BASE_URL + '?eid=' + encodeURIComponent(trackingToken);
}


// ── Trigger management ─────────────────────────────────────────────────────

/**
 * installArkaEmailPassTrigger()
 *
 * One-time setup. Run manually from the Apps Script editor once.
 * Installs a daily time-based trigger at 11:30
 *
 * Do NOT call this more than once — it removes existing triggers first to
 * prevent duplicate runs.
 */
function installArkaEmailPassTrigger() {
  // Remove any pre-existing triggers for this function to prevent duplicates
  var allTriggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < allTriggers.length; i++) {
    if (allTriggers[i].getHandlerFunction() === EMAILPASS_TRIGGER_FUNCTION) {
      ScriptApp.deleteTrigger(allTriggers[i]);
      console.log('installArkaEmailPassTrigger: removed existing trigger.');
    }
  }

  // Install daily trigger at 11:30
  ScriptApp.newTrigger(EMAILPASS_TRIGGER_FUNCTION)
    .timeBased()
    .atHour(11)
    .nearMinute(30)
    .everyDays(1)
    .create();

  console.log('installArkaEmailPassTrigger: daily trigger installed at 11:30.');
}
