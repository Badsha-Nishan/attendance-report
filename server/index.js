const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const initSqlJs = require("sql.js");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = 3001;

// Time.Net database location
const DB_PATH =
  process.env.DB_PATH || "C:\\Program Files (x86)\\ZKBio Time.Net\\TimeNet.db";

let SQL;
let manualDBBuffer = null;
let manualDBName = "";

function getDatabase() {
  if (manualDBBuffer) {
    return new SQL.Database(manualDBBuffer);
  }

  if (!fs.existsSync(DB_PATH)) {
    throw new Error("Database not found");
  }

  return new SQL.Database(fs.readFileSync(DB_PATH));
}

function getDatabaseStatus() {
  if (manualDBBuffer) {
    return {
      connected: true,
      mode: "manual",
      databasePath: manualDBName,
      message: "Manual database loaded",
    };
  }

  const exists = fs.existsSync(DB_PATH);

  return {
    connected: exists,
    mode: exists ? "auto" : "none",
    databasePath: exists ? DB_PATH : "",
    expectedPath: DB_PATH,
    message: exists
      ? "Automatic database detected"
      : "Database not found. Please select it manually.",
  };
}

(async () => {
  SQL = await initSqlJs();

  // --------------------------------------------------
  // DATABASE STATUS
  // --------------------------------------------------

  app.get("/api/database/status", (req, res) => {
    res.json(getDatabaseStatus());
  });

  // --------------------------------------------------
  // MANUAL DATABASE UPLOAD
  // --------------------------------------------------

  app.post(
    "/api/database/upload",
    express.raw({
      type: "application/octet-stream",
      limit: "100mb",
    }),
    (req, res) => {
      try {
        if (!req.body || !Buffer.isBuffer(req.body) || !req.body.length) {
          return res.status(400).json({
            error: "Please select a valid database file.",
          });
        }

        // Validate that the uploaded file is a readable SQLite database.
        const testDb = new SQL.Database(req.body);

        try {
          const result = testDb.exec(`
            SELECT name
            FROM sqlite_master
            WHERE type = 'table'
              AND name = 'hr_employee'
          `);

          if (!result.length || !result[0].values.length) {
            return res.status(400).json({
              error: "This is not a valid Time.Net database.",
            });
          }
        } finally {
          testDb.close();
        }

        manualDBBuffer = Buffer.from(req.body);
        manualDBName = decodeURIComponent(
          req.headers["x-database-name"] || "Selected database"
        );

        res.json({
          ok: true,
          ...getDatabaseStatus(),
        });
      } catch (err) {
        res.status(400).json({
          error: "Could not open this database file.",
          detail: err.message,
        });
      }
    }
  );

  // --------------------------------------------------
  // USE AUTOMATIC DATABASE
  // --------------------------------------------------

  app.post("/api/database/auto", (req, res) => {
    manualDBBuffer = null;
    manualDBName = "";

    const status = getDatabaseStatus();

    res.json({
      ok: true,
      ...status,
    });
  });

  // --------------------------------------------------
  // HEALTH CHECK
  // --------------------------------------------------

  app.get("/api/health", (req, res) => {
    res.json({
      ok: true,
      ...getDatabaseStatus(),
    });
  });

  // --------------------------------------------------
  // GET EMPLOYEES
  // --------------------------------------------------

  app.get("/api/employees", (req, res) => {
    let db;

    try {
      db = getDatabase();

      const result = db.exec(`
        SELECT
          emp_pin AS employeeId,
          trim(
            coalesce(emp_firstname, '') || ' ' ||
            coalesce(emp_lastname, '')
          ) AS employeeName
        FROM hr_employee
        ORDER BY emp_pin
      `);

      const employees = result.length
        ? result[0].values.map((row) => ({
            employeeId: String(row[0]),
            employeeName: row[1],
          }))
        : [];

      res.json({ employees });
    } catch (err) {
      res.status(404).json({
        error:
          err.message === "Database not found"
            ? "Database not found. Please select it manually."
            : err.message,
      });
    } finally {
      if (db) db.close();
    }
  });

  // --------------------------------------------------
  // MONTHLY / DATE RANGE REPORT
  // --------------------------------------------------

  app.get("/api/reports/monthly", (req, res) => {
    const month = String(req.query.month || "").trim();
    const fromDay = Number(req.query.fromDay || 1);
    const toDay = Number(req.query.toDay || 31);
    const employeeId = String(req.query.employeeId || "").trim();

    if (!/^[0-9]{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return res.status(400).json({
        error: "Invalid month. Expected YYYY-MM",
      });
    }

    if (
      !Number.isInteger(fromDay) ||
      !Number.isInteger(toDay) ||
      fromDay < 1 ||
      toDay < 1 ||
      fromDay > 31 ||
      toDay > 31 ||
      fromDay > toDay
    ) {
      return res.status(400).json({
        error: "Invalid date range.",
      });
    }

    if (!employeeId) {
      return res.status(400).json({
        error: "Please select an employee.",
      });
    }

    let db;

    try {
      db = getDatabase();

      const [year, mon] = month.split("-").map(Number);
      const daysInMonth = new Date(year, mon, 0).getDate();

      if (fromDay > daysInMonth || toDay > daysInMonth) {
        return res.status(400).json({
          error: `Selected month has only ${daysInMonth} days.`,
        });
      }

      const start = `${month}-${String(fromDay).padStart(2, "0")}`;
      const end = `${month}-${String(toDay + 1).padStart(2, "0")}`;

      let employeeWhere = "";
      const params = [start, end];

      if (employeeId !== "all") {
        employeeWhere = `
          AND CAST(e.emp_pin AS TEXT) = ?
        `;
        params.push(employeeId);
      }

      const stmt = db.prepare(`
        WITH RECURSIVE calendar(day) AS (
          SELECT date(?)

          UNION ALL

          SELECT date(day, '+1 day')
          FROM calendar
          WHERE day < date(?, '-1 day')
        ),

        employee_days AS (
          SELECT
            e.id AS employeeDbId,
            e.emp_pin AS employeeId,
            trim(
              coalesce(e.emp_firstname, '') || ' ' ||
              coalesce(e.emp_lastname, '')
            ) AS employeeName,
            coalesce(p.posi_name, '') AS position
          FROM hr_employee e
          LEFT JOIN hr_position p
            ON p.id = e.position_id
          WHERE 1 = 1
          ${employeeWhere}
        )

        SELECT
          ed.employeeId AS employeeId,
          ed.employeeName AS employeeName,
          ed.position AS position,
          calendar.day AS date,

          CASE
            WHEN strftime('%w', calendar.day) = '5'
              AND (d.checkin IS NOT NULL OR d.checkout IS NOT NULL)
            THEN 'Worked on Friday'

            WHEN strftime('%w', calendar.day) = '6'
              AND (d.checkin IS NOT NULL OR d.checkout IS NOT NULL)
            THEN 'Worked on Saturday'

            WHEN strftime('%w', calendar.day) = '5'
            THEN 'Friday'

            WHEN strftime('%w', calendar.day) = '6'
            THEN 'Saturday'

            ELSE coalesce(t.timetable_name, '')
          END AS timetable,

          d.checkin AS inTime,

          CASE
            WHEN d.checkin IS NOT NULL
              AND (
                d.checkout IS NULL
                OR trim(CAST(d.checkout AS TEXT)) = ''
              )
            THEN (
              SELECT MAX(rp.punch_time)
              FROM att_punches rp
              WHERE rp.employee_id = ed.employeeDbId
                AND date(rp.punch_time) = calendar.day
                AND time(rp.punch_time) > time(d.checkin)
            )
            ELSE d.checkout
          END AS outTime

        FROM calendar
        CROSS JOIN employee_days ed

        LEFT JOIN att_day_details d
          ON d.employee_id = ed.employeeDbId
          AND date(d.att_date) = calendar.day

        LEFT JOIN att_timetable t
          ON t.id = d.timetable_id

        ORDER BY
          calendar.day,
          ed.employeeId,
          d.sortindex
      `);

      stmt.bind(params);

      const rows = [];

      while (stmt.step()) {
        rows.push(stmt.getAsObject());
      }

      stmt.free();

      res.json({
        month,
        fromDay,
        toDay,
        employeeId,
        rows,
      });
    } catch (err) {
      console.error(err);

      res.status(500).json({
        error:
          err.message === "Database not found"
            ? "Database not found. Please select it manually."
            : "Could not read attendance tables. Check that this is the correct Time.Net database.",
        detail: err.message,
      });
    } finally {
      if (db) db.close();
    }
  });

  // --------------------------------------------------
  // START SERVER
  // --------------------------------------------------

  app.listen(PORT, () => {
    console.log(`API running: http://localhost:${PORT}`);
    console.log(`Auto database path: ${DB_PATH}`);
  });
})().catch((err) => {
  console.error("Failed to initialize SQLite:", err);
  process.exit(1);
});
