# Attendance Report (starter)

Small local report app for the Time.Net SQLite backup. It reads calculated attendance from `att_day_details` and joins employee, position, and timetable data.

## Requirements
- Node.js LTS installed
- A copy of the Time.Net SQLite database (never point this app at the live DB for the first test)

## Setup
1. Extract this folder.
2. Open a terminal in this folder and run:
   `npm install`
3. Copy your database backup to `server/DB.db` (or set `DB_PATH` to its path).
4. Run:
   `npm run dev`
5. Open the URL printed by Vite (usually http://localhost:5173).

The app reads the database only. It does not update Time.Net data.

## Workflow
In Time.Net: Get Transaction -> Calculate -> then open this app and generate/print the report.

The app uses the selected month and prints the requested columns. Rows without calculated in/out times are still shown as blank, because the source may contain incomplete attendance records.

## Notes
- The database schema was checked against the supplied backup.
- The app currently reports all employees with calculated day-detail rows for the selected month. Employee selection/filtering can be added if the office requires exactly a specific 30-person list.
- Verify the printed output against Time.Net before submitting.
