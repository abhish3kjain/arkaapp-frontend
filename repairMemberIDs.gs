/**
 * DATA REPAIR SCRIPT: ARKA MEMBER ID SYNC
 *
 * Canonical dual-member map: Arka member ID → 10 Pages A Day display name.
 *
 * ─── HOW TO UPDATE MEMBERSHIP ────────────────────────────────────────────────
 * Do NOT edit this block here. Edit TEN_PAGES_MEMBER_MAP in TenPagesADay_V3.gs,
 * then copy-paste this exact object literal here, into ArkaClubAppCode.gs,
 * and into ArkaClubApp.html. No other manual edits needed.
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
 * Inverted lookup: display name (lowercased) → Arka member ID.
 * Auto-derived from TEN_PAGES_MEMBER_MAP — do NOT edit manually.
 * @type {Object.<string, string>}
 */
const TEN_PAGES_ARKA_ID_BY_NAME_REPAIR_ = Object.fromEntries(
  Object.entries(TEN_PAGES_MEMBER_MAP)
    .map(([arkaId, displayName]) => [displayName.trim().toLowerCase(), arkaId])
);

/**
 * DATA REPAIR SCRIPT: ARKA MEMBER ID SYNC
 *
 * Scans ActivityLogDB (Col D) and PageLogDB (Col C) for raw display-name
 * strings written by the 10 Pages A Day app and replaces them with the
 * canonical ARKA_MEMBER_X identifier.
 *
 * Email-format IDs are resolved via MemberDB lookup (findIdByEmail).
 * Any rawId not matched by either route is left untouched and logged.
 *
 * Run once after deploying the TEN_PAGES_MEMBER_MAP changes to clean up
 * historical rows. Safe to re-run — already-correct IDs are skipped.
 */
function repairMemberIDs() {
  const ss = SpreadsheetApp.openById('1qXsAAO_9aIEJuTTQ1ziX9s5plvm6WHaVI_zaKcSXF-4');

  // Sheet name → 0-based column index of the MemberID field
  const SHEET_MEMBERID_COL = {
    'ActivityLogDB' : 3,  // Col D
    'PageLogDB'     : 2   // Col C
  };

  Object.entries(SHEET_MEMBERID_COL).forEach(([sheetName, memberIdColIndex]) => {
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      Logger.log('repairMemberIDs: sheet not found — ' + sheetName);
      return;
    }

    const data          = sheet.getDataRange().getValues();
    let   logsUpdated   = 0;
    const unmatched     = []; // Track rows we couldn't resolve — for manual review

    // Start at row index 1 to skip the header row
    for (let i = 1; i < data.length; i++) {
      const rawId = data[i][memberIdColIndex].toString().trim();

      // Skip blank cells and IDs already in the canonical format
      if (!rawId || rawId.startsWith('ARKA_MEMBER_')) continue;

      let correctedId = '';

      if (rawId.includes('@')) {
        // Email-format ID — resolve via MemberDB lookup
        correctedId = findIdByEmail(rawId);
      } else {
        // Display-name string — look up in the inverted map (case-insensitive)
        correctedId = TEN_PAGES_ARKA_ID_BY_NAME_REPAIR_[rawId.toLowerCase()] || '';
      }

      if (correctedId && correctedId !== rawId) {
        // +1 converts 0-based col index to 1-based sheet column
        sheet.getRange(i + 1, memberIdColIndex + 1).setValue(correctedId);
        logsUpdated++;
      } else if (!correctedId) {
        unmatched.push({ row: i + 1, rawId: rawId });
      }
    }

    Logger.log('Finished ' + sheetName + ': updated ' + logsUpdated + ' records.');
    if (unmatched.length > 0) {
      Logger.log('  ⚠ Unmatched IDs in ' + sheetName + ' (manual review needed):');
      unmatched.forEach(u => Logger.log('    Row ' + u.row + ': "' + u.rawId + '"'));
    }
  });
}

/**
 * Helper — resolves an Arka member ID from an email address via MemberDB lookup.
 * @param   {string} email - Raw email string found in the log.
 * @returns {string}       ARKA_MEMBER_X if found, empty string otherwise.
 */
function findIdByEmail(email) {
  const ss         = SpreadsheetApp.openById('1qXsAAO_9aIEJuTTQ1ziX9s5plvm6WHaVI_zaKcSXF-4');
  const memberData = ss.getSheetByName('MemberDB').getDataRange().getValues();

  for (let i = 1; i < memberData.length; i++) {
    const storedEmails = memberData[i][1].toString().toLowerCase();
    if (storedEmails.includes(email.toLowerCase())) {
      return memberData[i][0]; // Col A — ARKA_MEMBER_X
    }
  }
  return ''; // Not found
}
