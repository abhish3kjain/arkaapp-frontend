# Claude Instructions — ArkaApp Frontend

## Version Control

When bumping `APP_VERSION` in `ArkaMainAppCode.gs`, always update `VERSION.md` in the same commit:
- Add a new row to the table with the version number, date (YYYY-MM-DD), and a brief summary of what changed.
- The version in `ArkaMainAppCode.gs` is the single source of truth. The HTML display element reads it dynamically from the backend — no separate HTML change is needed.

When bumping the admin panel version (`v3.X` in `AkraAdminControlPanel.html` cache-bust URLs), update both
`arkaadmin_styles.css?v=X` and `arkaadmin_app.js?v=X` in the same commit and add a row to the
`AkraAdminControlPanel` table in `VERSIONS.md`.

---

## Challenge System — Schemas & Design Reference

### ChallengeDB columns (A–R, 0-indexed 0–17)
```
A=challengeId  B=challengeType  C=title  D=description  E=startDate  F=endDate
G=goalValue    H=goalUnit       I=goalConfigJson  J=status  K=competitionMode
L=seriesTag    M=isPinned       N=createdBy       O=createdOn
P=enrollPoints Q=finishPoints   R=winPoints
```

### ChallengeEnrollmentDB columns (A–I, 0-indexed 0–8)
```
A=enrollmentId  B=challengeId  C=memberId  D=enrolledOn  E=enrollmentStatus
F=currentProgressValue  G=progressStateJson  H=lastProgressUpdate  I=completedOn
```

### CompetitionMode enum
`NONE` | `INDIVIDUAL` | `SHARED` | `TEAM`

---

### Per-type goalConfigJson schemas

#### HABIT_STREAK
```json
{
  "minPagesPerDay": 10,
  "streakResetOnMiss": true,
  "countTowardsSource": ["ArkaClubApp"]
}
```
goalValue = minPagesPerDay, goalUnit = "pages"

#### BINGO_GRID
```json
{
  "variant": "BOOK_BINGO | GENRE_BINGO | AUTHOR_BINGO",
  "gridSize": 5,
  "winCondition": "ALL_CELLS | ANY_LINE",
  "finisherCondition": "ANY_LINE | HALF_CELLS",
  "trackingMode": "CANONICAL | NON_CANONICAL",
  "cells": [
    { "clueId": "C1", "position": [0, 0], "prompt": "A book set in another country" }
  ]
}
```
goalValue = totalCells, goalUnit = "cells"

#### BUDDY_READ
```json
{
  "bookTitle": "The Name of the Rose",
  "linkedEventId": "ARKA_EVT_12"
}
```
goalValue = 1, goalUnit = "book"

#### COUNTRY_SPREAD
```json
{
  "qualificationRule": "BOOK_SETTING_OR_AUTHOR | BOOK_SETTING_ONLY | AUTHOR_NATIONALITY_ONLY"
}
```
goalValue = targetCountries, goalUnit = "countries"

#### ALPHABET
```json
{
  "matchRule": "TITLE_FIRST_WORD | TITLE_ANY_WORD | AUTHOR_LASTNAME",
  "skipArticles": true,
  "optionalLetters": ["Q", "X", "Z"]
}
```
goalValue = 26, goalUnit = "letters"

#### BOOK_COUNT
```json
{
  "defaultGoal": 24,
  "allowPersonalGoal": true
}
```
goalValue = defaultGoal, goalUnit = "books"

#### PAGE_COUNT
```json
{
  "defaultGoal": 5000,
  "allowPersonalGoal": true
}
```
goalValue = defaultGoal, goalUnit = "pages"

#### 10PAGESADAY
```json
{
  "year": 2026,
  "dailyGoal": 10,
  "challengerBadge": "ARKA_BADGE_233",
  "finisherBadge": "ARKA_BADGE_234",
  "winnerBadge": "ARKA_BADGE_235"
}
```
goalValue = dailyGoal × 365, goalUnit = "pages"
Badge award triggered manually by admin via `award10PagesADayBadges(challengeId)`.
Page data sourced from PageLogDB (all sources count, including legacy `Data_10PagesADay_*`).

#### BOOK_HUNT
```json
{
  "clues": [
    { "clueId": "C1", "order": 1, "prompt": "A book with a color in the title", "hint": "Think beyond red and blue" },
    { "clueId": "C2", "order": 2, "prompt": "A book set in Asia", "hint": "" }
  ],
  "totalClues": 20,
  "finisherCondition": "N_CLUES",
  "finisherThreshold": 15,
  "winCondition": "MOST_CLUES",
  "allowMultiClaim": false,
  "requireApproval": false
}
```
goalValue = totalClues, goalUnit = "clues"
competitionMode = INDIVIDUAL (leaderboard by clues completed).
One distinct ShelfID per clue per member (same book can be used by different members or for
different clues by the same member is NOT allowed — each member's shelf record can only
satisfy one clue).
Claiming a clue: member links a **currently-reading** book from their shelf.
**Member-side claiming is NOT yet built** — see "Future Work" below.

---

### Per-type progressStateJson schemas

#### HABIT_STREAK
```json
{ "currentStreak": 0, "longestStreak": 0, "totalDaysLogged": 0, "totalPagesLogged": 0,
  "lastLogDate": "", "missedDates": [], "streakHistory": [] }
```

#### BINGO_GRID
```json
{ "cellsCompleted": [], "booksLinked": {}, "genreTagged": {}, "linesCompleted": [], "hasBingo": false }
```

#### BUDDY_READ
```json
{ "pagesRead": 0, "shelfRecordId": "", "currentShelfStatus": "To Read", "finishedBeforeDeadline": null }
```

#### COUNTRY_SPREAD
```json
{ "countriesVisited": {}, "totalCountries": 0,
  "continentProgress": { "Africa":0, "Americas":0, "Asia":0, "Europe":0, "Oceania":0, "MiddleEast":0 } }
```

#### ALPHABET
```json
{ "letterMap": { "A": null, "B": "ARKA_SHELF_X", ... }, "lettersCompleted": 0, "optionalLettersCompleted": 0 }
```

#### BOOK_COUNT
```json
{ "personalGoal": 24, "booksRead": [], "totalBooks": 0, "pacingProjection": 0, "monthlyBreakdown": {} }
```

#### PAGE_COUNT
```json
{ "personalGoal": 5000, "totalPages": 0, "monthlyBreakdown": {}, "weeklyBreakdown": {},
  "pacingProjection": 0, "aheadBehindTarget": "" }
```

#### 10PAGESADAY
```json
{ "year": 2026, "dailyGoal": 10, "yearlyGoal": 3650, "totalPages": 0,
  "monthlyBreakdown": {}, "avgPagesPerDay": 0, "isFinisher": false }
```

#### BOOK_HUNT
```json
{
  "claims": {
    "C1": { "shelfId": "ARKA_SHELF_42", "bookTitle": "The Red House", "claimedOn": "15-Jun-2026", "status": "Claimed" },
    "C5": { "shelfId": "ARKA_SHELF_71", "bookTitle": "Shantaram", "claimedOn": "22-Jun-2026", "status": "Claimed" }
  },
  "completedCount": 2,
  "isFinisher": false,
  "finishedOn": ""
}
```

---

## Future Work (Admin-side complete, member-side pending)

### BOOK_HUNT — Member-side claiming (not yet built)
- **Where:** Challenge detail screen in the main ArkaClubApp (Me tab → Challenges → challenge card)
- **Flow:** Member opens challenge → sees clue grid → taps a clue → picks a book from their
  **currently-reading** shelf entries → confirms claim → progressStateJson updated
- **Validation rules:**
  - Book must have `status = "Reading"` in MemberShelfDB at time of claim
  - Each `shelfId` can only be used for **one clue** per member (`allowMultiClaim: false`)
  - Same `shelfId` may be used by a different member for any clue
  - If `requireApproval = true`, status is set to `"Pending"` until admin approves
- **GAS function to build:** `claimBookHuntClue(enrollmentId, clueId, shelfId)`
- **Admin approval screen** (if requireApproval ever enabled): filter enrollments by
  `status = "Pending"`, show book + clue, approve/reject button

### 10PAGESADAY — Member-side display (not yet built)
- Progress bar on challenge card showing pages logged this year vs yearly goal
- Monthly breakdown view matching the legacy TenPagesADay_v3.html circles UI
- No new logging needed — reads PageLogDB automatically
