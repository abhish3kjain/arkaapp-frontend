const SHEET_NAME = "10aDay_Input_2026";
const SPREADSHEET_ID = "1AaGClZVoDcq-YOnd1cUwWWl6ZgEiuTDS5fvalp71_o0"   //Original Excel in personal Gmail

function doGet() {
  return HtmlService.createTemplateFromFile('PageUpdater')
    .evaluate()
    .setTitle("10 A Day Challenge Updater")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Fetches names for the dropdown, ignoring placeholders.
 */
function getInitialData() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  
 
  // SAFETY CHECK: If the sheet is empty, exit gracefully
  if (lastCol < 3 || lastRow < 4) {
    return { names: [], allStats: [], history: [], clubTotal: 0, clubGoal: 0, topMovers: [] };
  }


  // Find which row in Column A matches that date string
  const dateValues = sheet.getRange(4, 1, lastRow - 3).getValues();
 
  // 1. Get Dates (Column A) for history data
  const dates = sheet.getRange(4, 1, lastRow - 3).getValues().map(d => 
    Utilities.formatDate(new Date(d[0]), Session.getScriptTimeZone(), "MMM dd")
  );

  // 2. Get All User Data
  const namesRow = sheet.getRange(3, 3, 1, lastCol - 2).getValues()[0];
  const allData = sheet.getRange(4, 3, lastRow - 3, lastCol - 2).getValues();

  // Find the "Reference Row" (The last row where anyone has a non-zero value) --> For weekly chart
  let refRowIdx = -1;
  for (let r = allData.length - 1; r >= 0; r--) {
    let rowHasData = allData[r].some(val => parseFloat(val) > 0);
    if (rowHasData) {
      refRowIdx = r;
      break;
    }
  }

  // Determine the Comparison Range for Weekly Chart
  let lastSunIdx = -1;
  let prevSunIdx = -1;
  const now = new Date();
  now.setHours(0,0,0,0)

  if (refRowIdx !== -1) {
    let refDate = new Date(dateValues[refRowIdx][0]);
    refDate.setHours(0,0,0,0);

    // If the latest update is for Today or the Coming Sunday
    if (refDate >= now) {
      lastSunIdx = refRowIdx - 1;
      prevSunIdx = refRowIdx - 2;
    } else {
      // If the latest update was some time ago
      lastSunIdx = refRowIdx;
      prevSunIdx = refRowIdx - 1;
    }
  }

  
  let allStats = [];
  let clubTotal = 0;
  let movers = [];
  let historyData = {
    labels: dates,
    datasets: []
  };

  const colors = ['#008a91', '#e74c3c', '#f1c40f', '#2ecc71', '#9b59b6', '#34495e', '#e67e22'];

  namesRow.forEach((name, colIdx) => {

    // Add this safety check: If colIdx is somehow out of bounds of allData, skip
    if (!allData[0] || colIdx >= allData[0].length) return;

    if (name && name.toString().trim() !== "" && !/^Challenger\d+$/i.test(name)) {
      try{
        let userData = [];
        let maxVal = 0;

        for (let rowIdx = 0; rowIdx < allData.length; rowIdx++) {
          let val = parseFloat(allData[rowIdx][colIdx]);
          
          // NEW LOGIC: If value is empty, 0, or not a number, send null
          // This prevents the line from dropping to zero or showing a point.
          if (isNaN(val) || val === 0 || allData[rowIdx][colIdx] === "") {
            userData.push(null); 
          } else {
            userData.push(val);
            if (val > maxVal) maxVal = val;
          }
        }

        // Leaderboard Stats
        allStats.push({ name: name, pages: maxVal });
        clubTotal += maxVal; // Sum up everyone's pages

        // --- TOP MOVER CALCULATION ---
        // Calculate Jump based on our determined Sunday indexes
        if (lastSunIdx >= 0 && prevSunIdx >= 0) {
          let lastWeekRaw = allData[lastSunIdx][colIdx];
          let prevWeekRaw = allData[prevSunIdx][colIdx];

          // STRICT CHECK: Both cells must contain a non-empty, non-zero value
          let hasLastData = lastWeekRaw !== "" && !isNaN(parseFloat(lastWeekRaw)) && parseFloat(lastWeekRaw) > 0;
          let hasPrevData = prevWeekRaw !== "" && !isNaN(parseFloat(prevWeekRaw)) && parseFloat(prevWeekRaw) > 0;

          if (hasLastData && hasPrevData) {
            let jump = parseFloat(lastWeekRaw) - parseFloat(prevWeekRaw);
            if (jump > 0) {
              movers.push({ name: name, jump: jump });
            }
          }
        }
        
        // Chart Dataset
        historyData.datasets.push({
          label: name,
          data: userData,
          borderColor: colors[colIdx % colors.length],
          backgroundColor: colors[colIdx % colors.length],
          tension: 0.3,
          fill: false,
          pointRadius: 3,
          spanGaps: false // This ensures lines don't connect across missing data points
        });
      } catch(err) {
        console.error("Error processing user: " + name, err);
      }
    }
  });

  // Goal = 3650 per participating member
  const filterNames = namesRow.filter(n => n && n !== "");
  const clubGoal = filterNames.length * 3650;

  // Sort movers by jump descending and take top 5
  movers.sort((a, b) => b.jump - a.jump);
  const topMovers = movers.slice(0, 5);

  // Create the range string for the UI
  let rangeStr = "No data yet";
  if (lastSunIdx >= 0 && prevSunIdx >= 0) {
    rangeStr = dates[prevSunIdx] + " - " + dates[lastSunIdx];
  }

  return {
    names: namesRow.filter(n => n && n !== ""),
    allStats: allStats,
    history: historyData,
    clubTotal: clubTotal,
    clubGoal: clubGoal,
    topMovers: topMovers,
    moverRange: rangeStr
  };
}

/**
 * Retrieves a member's current totals, daily pace, and notes.
 */
function getMemberStatus(name) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);
  
  // 1. BIG BATCH PULL: Get all data in one trip to save speed
  const lastRow = sheet.getLastRow();
  if (lastRow < 4) return null;
  
  const fullRange = sheet.getRange(3, 1, lastRow - 2, sheet.getLastColumn()).getValues();
  const namesRow = fullRange[0];
  const colIndex = namesRow.indexOf(name);
  
  if (colIndex === -1) return null;

  let monthlyData = Array(12).fill(0); //contains pages read in each month
  let currentTotal = 0;
  let lastDateRaw = new Date();
  let lastKnownValue = 0; // The "Memory" for gap-filling

  // 2. Loop through the data (starting from index 1 to skip names row)
  for (let i = 1; i < fullRange.length; i++) {
    let SundayDate = new Date(fullRange[i][0]);
    let rawVal = fullRange[i][colIndex];
    
    // Check if the cell is a valid number and not blank
    if (rawVal !== "" && !isNaN(parseFloat(rawVal))) {
      let currentVal = parseFloat(rawVal);
      
      // Calculate growth since the LAST time we saw a number
      let progress = (i === 1) ? 0 : currentVal - lastKnownValue;
      if (progress < 0) progress = 0;

      // PIVOT RULE: Decide which month gets the credit
      let pivotDay = new Date(SundayDate);
      pivotDay.setDate(SundayDate.getDate() - 3);
      
      if (pivotDay.getFullYear() === 2026) {
        monthlyData[pivotDay.getMonth()] += progress;
      }

      // Update our "Memory" and current standing
      lastKnownValue = currentVal;
      currentTotal = currentVal;
      lastDateRaw = SundayDate;
    }
  }

  // 3. Goal Calculation
  let monthlyGoals = [];
  for (let m = 0; m < 12; m++) {
    let days = new Date(2026, m + 1, 0).getDate();
    monthlyGoals.push(days * 10);
  }

  //Logic to find Current MOnth Index
  const now = new Date();
  let targetSunday = new Date(now);
  // If today is Sunday (0), it stays. Otherwise, move to next Sunday.
  targetSunday.setDate(now.getDate() + (7 - now.getDay()) % 7);
  targetSunday.setHours(0,0,0,0);
  // 2. DERIVE ACTIVE MONTH: Use pivot logic on the Target Sunday
  let pivotForUI = new Date(targetSunday);
  pivotForUI.setDate(targetSunday.getDate() - 3);
  const currentMonthIdx = pivotForUI.getMonth(); // This is our source of truth


  return {
    currentTotal: currentTotal,
    monthlyTotal: monthlyData[currentMonthIdx], 
    monthlyGoal: monthlyGoals[currentMonthIdx], 
    monthlyStats: monthlyData, 
    monthlyGoals: monthlyGoals, 
    yearlyGoal: 3650,
    notes: sheet.getRange(1, colIndex + 1).getValue() || "",
    avg: sheet.getRange(2, colIndex + 1).getValue() || 0,
    lastDate: Utilities.formatDate(lastDateRaw, Session.getScriptTimeZone(), "EEE, MMM dd, yyyy"),
    availableDates: getSundayRange(lastDateRaw)
  };
}


/* Old Function
function getMemberStatus(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);

  // 1. BIG BATCH PULL: Get all data in one trip to save speed
  const lastRow = sheet.getLastRow();
  if (lastRow < 4) return null;

  const lastCol = sheet.getLastColumn();
  const namesRow = sheet.getRange(3, 3, 1, lastCol - 2).getValues()[0];
  const colIndex = namesRow.indexOf(name) + 3;
  const lastRow = sheet.getLastRow();

  // 1. Safety: If the sheet is empty
  if (lastRow < 4) return { currentTotal: 0, monthlyTotal: 0, monthlyGoal: 280, monthlyStats: Array(12).fill(0), monthlyGoals: Array(12).fill(280), yearlyGoal: 3650 };

  const dateValues = sheet.getRange(4, 1, lastRow - 3).getValues();
  const pageValues = sheet.getRange(4, colIndex, lastRow - 3).getValues();

  let monthlyData = Array(12).fill(0); 
  let currentTotal = 0;
  let lastDateRaw = new Date();

  // 2. Loop through and calculate progress week-by-week
  for (let i = 0; i < pageValues.length; i++) {
    let val = parseFloat(pageValues[i][0]) || 0;
    let prevVal = (i > 0) ? (parseFloat(pageValues[i-1][0]) || 0) : 0;
    
    // Calculate pages read specifically in THIS Sunday's week
    let weeklyProgress = val - prevVal;
    
    // Safety Guard: Don't allow negative progress (in case of sheet typos)
    if (weeklyProgress < 0) weeklyProgress = 0;

    // Use Pivot Day (Thursday) to decide which month gets the credit
    let SundayDate = new Date(dateValues[i][0]);
    let pivotDay = new Date(SundayDate);
    pivotDay.setDate(SundayDate.getDate() - 3);
    let monthIdx = pivotDay.getMonth(); // 0-11
    
    // Add the weekly progress to that month's bucket
    monthlyData[monthIdx] += weeklyProgress;
    
    // Update the "Live" total standing
    if (val > 0) {
      currentTotal = val;
      lastDateRaw = SundayDate;
    }
  }

  // 3. Build the 12 Monthly Goals
  let monthlyGoals = [];
  for (let m = 0; m < 12; m++) {
    let days = new Date(2026, m + 1, 0).getDate();
    monthlyGoals.push(days * 10);
  }

  // 4. Send back the current month's bucket specifically
  const currentMonthIdx = new Date().getMonth();

  return {
    currentTotal: currentTotal,
    monthlyTotal: monthlyData[currentMonthIdx], // Fetches the specific sum for NOW
    monthlyGoal: monthlyGoals[currentMonthIdx], 
    monthlyStats: monthlyData, 
    monthlyGoals: monthlyGoals, 
    yearlyGoal: 3650,
    notes: sheet.getRange(1, colIndex).getValue() || "",
    avg: sheet.getRange(2, colIndex).getValue() || 0,
    lastDate: Utilities.formatDate(lastDateRaw, Session.getScriptTimeZone(), "EEE, MMM dd, yyyy"),
    availableDates: getSundayRange(lastDateRaw)
  };
}
*old funciton ends here*/
 

/**
 * Helper to generate Sunday dropdown options.
 */
function getSundayRange(startDate) {
  const dates = [];
  const today = new Date();
  const nextSunday = new Date();
  nextSunday.setDate(today.getDate() + (7 - today.getDay()) % 7);
  nextSunday.setHours(0,0,0,0);

  let current = new Date(startDate);
  current.setHours(0,0,0,0);

  while (current <= nextSunday) {
    if (current.getDay() === 0) {
      dates.push({
        display: Utilities.formatDate(current, Session.getScriptTimeZone(), "EEE, MMM dd, yyyy"),
        iso: current.toISOString()
      });
    }
    current.setDate(current.getDate() + 1);
  }
  
  if (dates.length === 0) {
    dates.push({
      display: Utilities.formatDate(nextSunday, Session.getScriptTimeZone(), "EEE, MMM dd, yyyy"),
      iso: nextSunday.toISOString()
    });
  }
  return dates;
}

/**
 * Updates both notes and page counts with strict regression checks.
 */
function updateSheet(name, dateIso, value, isTotal, notes) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);
  const lastCol = sheet.getLastColumn();
  
  const namesRow = sheet.getRange(3, 3, 1, lastCol - 2).getValues()[0];
  const colIndex = namesRow.indexOf(name) + 3;
  
  sheet.getRange(1, colIndex).setValue(notes);

  const targetDate = new Date(dateIso).setHours(0,0,0,0);
  const lastRow = sheet.getLastRow();
  const dateValues = sheet.getRange(4, 1, lastRow - 3).getValues();
  const pageValues = sheet.getRange(4, colIndex, lastRow - 3).getValues();
  
  let targetRowIndex = -1;
  for (let i = 0; i < dateValues.length; i++) {
    if (new Date(dateValues[i][0]).setHours(0,0,0,0) === targetDate) {
      targetRowIndex = i;
      break;
    }
  }
  
  if (targetRowIndex === -1) throw new Error("Target date not found.");
  
  // Get the most recent value BEFORE the target row to calculate "Pages Read"
  let baseValue = 0;
  for (let i = targetRowIndex; i >= 0; i--) {
    let valAtRow = parseFloat(pageValues[i][0]);
    if (!isNaN(valAtRow) && pageValues[i][0] !== "") {
      baseValue = valAtRow;
      break;
    }
  }

  let inputVal = parseFloat(value);
  let finalValue = (isTotal === true || isTotal === "true") ? inputVal : baseValue + inputVal;

  let pagesRead = finalValue - baseValue;   // pages read (delta)

  // Regression Checks
  let maxBefore = 0;
  for (let i = 0; i < targetRowIndex; i++) {
    let val = parseFloat(pageValues[i][0]);
    if (!isNaN(val) && val > maxBefore) maxBefore = val;
  }
  if (finalValue < maxBefore) {
    throw new Error("Regression Error: New total (" + finalValue + ") is less than a previous Sunday (" + maxBefore + ").");
  }

  let minAfter = Infinity;
  for (let i = targetRowIndex + 1; i < pageValues.length; i++) {
    let val = parseFloat(pageValues[i][0]);
    if (!isNaN(val) && pageValues[i][0] !== "") {
      if (val < minAfter) minAfter = val;
    }
  }
  if (minAfter !== Infinity && finalValue > minAfter) {
    throw new Error("Consistency Error: New total is higher than a future entry.");
  }

  sheet.getRange(targetRowIndex + 4, colIndex).setValue(finalValue);

  // --- Activity Log Trigger ---
  try {
    // Ensure we only log if pages were actually read (effort > 0)
    if (pagesRead > 0) {
      logActivityToDB(name, pagesRead, targetDate, notes);
    }
  } catch (e) {
    console.error("Activity Logging Failed: " + e.message);
  }

  // RETURN AN OBJECT INSTEAD OF A STRING
  return { success: true, message: "Successfully updated notes and pages!" };
}

/**
 * Registers new members, injects formula, and initializes with zero.
 */
function registerNewMember(newName) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);
  const lastCol = sheet.getLastColumn();
  let namesRow = [];
  
  if (lastCol >= 3) {
    namesRow = sheet.getRange(3, 3, 1, lastCol - 2).getValues()[0];
  }

  const cleanedName = newName.toString().trim();
  const nameExists = namesRow.some(name => name.toString().trim().toLowerCase() === cleanedName.toLowerCase());

  if (nameExists) throw new Error("This name is already registered!");

  const nextCol = lastCol + 1;
  const colLetter = columnToLetter(nextCol);
  
  // Set Name
  sheet.getRange(3, nextCol).setValue(cleanedName);
  
  // Set Formula in Row 2 (Daily Pace)
  const formula = `=IF(MAX(${colLetter}4:${colLetter})>0, ROUND(MAX(${colLetter}4:${colLetter}) / DATEDIF($A$4, INDEX($A$4:$A, MATCH(MAX(${colLetter}4:${colLetter}), ${colLetter}4:${colLetter}, 0)), "d"), 0), 0)`;
  sheet.getRange(2, nextCol).setFormula(formula);
  
  // Set Initial Zero
  sheet.getRange(4, nextCol).setValue(0);
  
  // Apply Formatting
  if (lastCol >= 3) {
    sheet.getRange(3, lastCol).copyTo(sheet.getRange(3, nextCol), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
  }

  return "Welcome, " + cleanedName + "!";
}

/**
 * Helper to convert column number to letter for formulas.
 */
function columnToLetter(column) {
  let temp, letter = '';
  while (column > 0) {
    temp = (column - 1) % 26;
    letter = String.fromCharCode(temp + 65) + letter;
    column = (column - temp - 1) / 26;
  }
  return letter;
}

/**
 * Logs activity to the central ActivityLogDB and PageLOgDB and Reading NotesDB
 */
function logActivityToDB(memberName, pagesLogged, targetDate, noteText) {
  const ss = SpreadsheetApp.openById("1qXsAAO_9aIEJuTTQ1ziX9s5plvm6WHaVI_zaKcSXF-4");
  const logSheet = ss.getSheetByName("ActivityLogDB");
  const typeSheet = ss.getSheetByName("ActivityTypeDB");
  const pageLogSheet = ss.getSheetByName("PageLogDB");
  
  // 1. Get the Multiplier from ActivityTypeDB
  const typeData = typeSheet.getDataRange().getValues();
  let multiplier = 0;
  const targetTypeID = "ARKA_ACTTYP_PAGEREAD";

  for (let i = 1; i < typeData.length; i++) {
    if (typeData[i][0] === targetTypeID) {
      multiplier = parseFloat(typeData[i][1]); // Column 5 (index 4) is ActivityClubPoints
      break;
    }
  }

  //2 New ID generation logic
  // Helper to find the last ID number in a specific sheet and column
  function getNextIdNum(targetSheet, idPrefix) {
    const colA = targetSheet.getRange("A:A").getValues();
    let lastIdValue = "";
    
    // Scan from the bottom up to find the last non-empty cell in Column A
    for (let i = colA.length - 1; i >= 0; i--) {
      if (colA[i][0] !== "" && colA[i][0] !== null) {
        lastIdValue = colA[i][0].toString();
        break;
      }
    }
    
    // If we only found the header or nothing, start at 1
    if (!lastIdValue || lastIdValue.indexOf('_') === -1) return 1;
    
    // Extract the number and increment
    const parts = lastIdValue.split('_');
    const lastNum = parseInt(parts[parts.length - 1]);
    return isNaN(lastNum) ? 1 : lastNum + 1;
  }

  // 2.1 & 2.2 Generate IDs using the helper
  const newActivityID = "ARKA_ACT_" + getNextIdNum(logSheet, "ARKA_ACT");
  const newPlogID = "ARKA_PLOG_" + getNextIdNum(pageLogSheet, "ARKA_PLOG");

  // 3. Prepare Entry Data
  const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd-MM-yyyy HH:mm:ss Z");
  const cpAwarded = pagesLogged * multiplier;
  const source = "10pagesaDayApp";
  const actDescription = pagesLogged + " pages added to " + Utilities.formatDate(new Date(targetDate), Session.getScriptTimeZone(), "dd-MM-yyyy");
  // 4. Append to ActivityLogDB
  // Columns: ActivityID, ActivityTypeID, ActivityDate, MemberID, Description, ActivitySource, CPAwarded
  logSheet.appendRow([
    newActivityID,
    targetTypeID,
    timestamp,
    memberName,
    actDescription,
    source,
    cpAwarded
  ]);

  //5. Append to PagesLogDB
  //Columns: LogID, Timestamp, MemberID, BookID, PageDelta, Source
  if (pagesLogged > 0) {
    pageLogSheet.appendRow([
      newPlogID,
      timestamp,
      memberName, //Currently using Member Name instead of MemberID
      "",         //Not linked to BOOK
      pagesLogged,
      "Data_10PagesADay_2026"
    ]);
  }

  // 6. Append to ReadingNotesDB (non-fatal) — mirrors the pattern used by
  //    logUnlinkedPages() and logReadingProgress() in ArkaClubAppCode.gs.
  //    MemberID stored as name string for now — same as PageLogDB Col C above.
  //    PlogID links this note to the PageLogDB row just written.
  const trimmedNote = (noteText || '').toString().trim();
  if (trimmedNote) {
    try {
      const notesSheet = ss.getSheetByName("ReadingNotesDB");
      if (notesSheet) {
        const notesLastRow = notesSheet.getLastRow();
        let newNoteNum = 1;
        if (notesLastRow > 1) {
          const lastNoteId  = notesSheet.getRange(notesLastRow, 1).getValue().toString();
          const lastNoteNum = parseInt(lastNoteId.split('_')[2]);
          if (!isNaN(lastNoteNum)) newNoteNum = lastNoteNum + 1;
        }
        notesSheet.appendRow([
          'ARKA_NOTE_' + newNoteNum, // Col A — NoteID
          timestamp,                 // Col B — Timestamp
          memberName,                // Col C — MemberID (name string from 10 Pages app)
          newPlogID,                 // Col D — PlogID (links to PageLogDB row above)
          trimmedNote,               // Col E — NoteText
          '10PagesADay'              // Col F — Source
        ]);
      }
    } catch (noteErr) {
      console.warn('logActivityToDB: ReadingNotesDB write failed (non-fatal):', noteErr);
    }
  }

  return cpAwarded; // Return to show in the UI if needed
}