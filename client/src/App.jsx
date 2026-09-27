import { useEffect, useRef, useState } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

const today = new Date();

function formatMonth(date) {
  if (!date) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");

  return `${year}-${month}`;
}

function timeOnly(value) {
  if (!value) return "";

  const match = String(value).match(/[0-9]{2}:[0-9]{2}/);

  return match ? match[0] : String(value);
}

export default function App() {
  // --------------------------------------------------
  // REPORT DATE STATE
  // --------------------------------------------------

  const [fromDate, setFromDate] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1)
  );

  const [toDate, setToDate] = useState(today);

  const [month, setMonth] = useState(formatMonth(today));

  // --------------------------------------------------
  // OTHER STATE
  // --------------------------------------------------

  const [employeeId, setEmployeeId] = useState("");
  const [employees, setEmployees] = useState([]);
  const [rows, setRows] = useState([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [loadedMonth, setLoadedMonth] = useState("");
  const [loadedFromDay, setLoadedFromDay] = useState("");
  const [loadedToDay, setLoadedToDay] = useState("");

  const [dbStatus, setDbStatus] = useState(null);
  const [dbLoading, setDbLoading] = useState(true);

  const fileInputRef = useRef(null);

  // --------------------------------------------------
  // DATABASE STATUS
  // --------------------------------------------------

  async function loadDatabaseStatus() {
    setDbLoading(true);

    try {
      const response = await fetch("/api/database/status");
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not check database");
      }

      setDbStatus(data);

      if (data.connected) {
        await loadEmployees();
      } else {
        setEmployees([]);
        setEmployeeId("");
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setDbLoading(false);
    }
  }

  // --------------------------------------------------
  // LOAD EMPLOYEES
  // --------------------------------------------------

  async function loadEmployees() {
    const response = await fetch("/api/employees");
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Could not load employees");
    }

    setEmployees(data.employees || []);
    setEmployeeId("");
    setRows([]);
    setLoadedMonth("");
    setLoadedFromDay("");
    setLoadedToDay("");
  }

  useEffect(() => {
    loadDatabaseStatus();
  }, []);

  // --------------------------------------------------
  // FROM DATE CHANGE
  // --------------------------------------------------

  function handleFromDateChange(date) {
    if (!date) return;

    setFromDate(date);

    // Automatically update report month
    setMonth(formatMonth(date));

    // If To Date is before From Date,
    // automatically move To Date to From Date.
    if (!toDate || date > toDate) {
      setToDate(date);
    }

    // Clear old report
    setRows([]);
    setLoadedMonth("");
    setLoadedFromDay("");
    setLoadedToDay("");
    setError("");
  }

  // --------------------------------------------------
  // TO DATE CHANGE
  // --------------------------------------------------

  function handleToDateChange(date) {
    if (!date) return;

    // Safety check
    if (fromDate && date < fromDate) {
      setToDate(fromDate);
      return;
    }

    setToDate(date);

    // Clear old report
    setRows([]);
    setLoadedMonth("");
    setLoadedFromDay("");
    setLoadedToDay("");
    setError("");
  }

  // --------------------------------------------------
  // MANUAL DATABASE SELECT
  // --------------------------------------------------

  async function handleDatabaseSelect(event) {
    const file = event.target.files?.[0];

    // Allow selecting the same file again later.
    event.target.value = "";

    if (!file) return;

    setDbLoading(true);
    setError("");
    setRows([]);

    try {
      const response = await fetch("/api/database/upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "X-Database-Name": encodeURIComponent(file.name),
        },
        body: await file.arrayBuffer(),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not load database");
      }

      setDbStatus(data);

      await loadEmployees();
    } catch (e) {
      setError(e.message);
    } finally {
      setDbLoading(false);
    }
  }

  // --------------------------------------------------
  // SWITCH BACK TO AUTO DATABASE
  // --------------------------------------------------

  async function useAutoDatabase() {
    setDbLoading(true);
    setError("");
    setRows([]);

    try {
      const response = await fetch("/api/database/auto", {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not switch database");
      }

      setDbStatus(data);

      if (data.connected) {
        await loadEmployees();
      } else {
        setEmployees([]);
        setEmployeeId("");
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setDbLoading(false);
    }
  }

  // --------------------------------------------------
  // GENERATE REPORT
  // --------------------------------------------------

  async function generate() {
    if (!dbStatus?.connected) {
      setError("Please connect a database first.");
      return;
    }

    if (!fromDate || !toDate) {
      setError("Please select the date range.");
      return;
    }

    if (!employeeId) {
      setError("Please select an employee or All Employees.");
      return;
    }

    if (fromDate > toDate) {
      setError("From Date cannot be after To Date.");
      return;
    }

    // Make sure both dates are in the same month.
    const fromMonth = formatMonth(fromDate);
    const toMonth = formatMonth(toDate);

    if (fromMonth !== toMonth) {
      setError("Please select dates from the same month.");
      return;
    }

    const start = fromDate.getDate();
    const end = toDate.getDate();

    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({
        month: fromMonth,
        fromDay: String(start),
        toDay: String(end),
        employeeId,
      });

      const response = await fetch(`/api/reports/monthly?${params.toString()}`);

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Report generation failed");
      }

      setRows(data.rows || []);

      setLoadedMonth(fromMonth);
      setLoadedFromDay(String(start));
      setLoadedToDay(String(end));

      // Keep month state synchronized
      setMonth(fromMonth);
    } catch (e) {
      setError(e.message);

      setRows([]);
      setLoadedMonth("");
      setLoadedFromDay("");
      setLoadedToDay("");
    } finally {
      setLoading(false);
    }
  }

  // --------------------------------------------------
  // PRINT
  // --------------------------------------------------

  function printReport() {
    if (!rows.length) return;

    window.print();
  }

  // --------------------------------------------------
  // SELECTED EMPLOYEE
  // --------------------------------------------------

  const selectedEmployee = employees.find(
    (employee) => employee.employeeId === employeeId
  );

  // --------------------------------------------------
  // REPORT TITLE
  // --------------------------------------------------

  let reportDescription = "Select report options";

  if (loadedMonth) {
    if (employeeId === "all") {
      reportDescription = `${loadedMonth} · ${loadedFromDay}-${loadedToDay} · All Employees`;
    } else {
      reportDescription = `${loadedMonth} · ${loadedFromDay}-${loadedToDay} · ${
        selectedEmployee?.employeeName || ""
      }`;
    }
  }

  // --------------------------------------------------
  // RENDER
  // --------------------------------------------------

  return (
    <main className="app">
      <header className="topbar">
        <div>
          <div className="eyebrow">TIMENET · LOCAL REPORT</div>

          <h1>Attendance Report</h1>

          <p>Generate attendance report by date range and employee.</p>
        </div>

        <div className="status">
          <span />
          Local database report
        </div>
      </header>
      {/* DATABASE CONNECTION */}
      <section className="panel database-panel">
        <div className="database-info">
          <strong>Database Connection</strong>

          <p>
            {dbLoading
              ? "Checking database..."
              : dbStatus?.connected
              ? dbStatus.message
              : "Database not found. Select a database manually."}
          </p>

          {dbStatus?.connected && (
            <small>
              {dbStatus.mode === "auto"
                ? `Auto detected: ${dbStatus.databasePath}`
                : `Manual file: ${dbStatus.databasePath}`}
            </small>
          )}

          {!dbStatus?.connected && dbStatus?.expectedPath && (
            <small>Expected: {dbStatus.expectedPath}</small>
          )}
        </div>
        <div className="database-actions">
          <input
            ref={fileInputRef}
            type="file"
            accept=".db,.sqlite,.sqlite3"
            hidden
            onChange={handleDatabaseSelect}
          />
          <button
            type="button"
            className="secondary"
            onClick={() => fileInputRef.current?.click()}
            disabled={dbLoading}
          >
            Browse Database
          </button>{" "}
          {dbStatus?.mode === "manual" && (
            <button
              type="button"
              className="secondary"
              onClick={useAutoDatabase}
              disabled={dbLoading}
            >
              {" "}
              Use Auto Database{" "}
            </button>
          )}{" "}
        </div>{" "}
      </section>{" "}
      {/* REPORT CONTROLS */}{" "}
      <section className="panel controls">
        {" "}
        <label>Select Date</label>{" "}
        <div className="date-range">
          {" "}
          {/* FROM DATE */}{" "}
          <label>
            {" "}
            From Date{" "}
            <DatePicker
              selected={fromDate}
              onChange={handleFromDateChange}
              selectsStart
              startDate={fromDate}
              endDate={toDate}
              maxDate={toDate}
              dateFormat="dd/MM/yyyy"
              showMonthDropdown
              showYearDropdown
              dropdownMode="select"
              placeholderText="Select start date"
              className="date-input"
              isClearable={false}
            />{" "}
          </label>{" "}
          {/* TO DATE */}{" "}
          <label>
            {" "}
            To Date{" "}
            <DatePicker
              selected={toDate}
              onChange={handleToDateChange}
              selectsEnd
              startDate={fromDate}
              endDate={toDate}
              minDate={fromDate}
              dateFormat="dd/MM/yyyy"
              showMonthDropdown
              showYearDropdown
              dropdownMode="select"
              placeholderText="Select end date"
              className="date-input"
              isClearable={false}
            />{" "}
          </label>{" "}
        </div>{" "}
        {/* EMPLOYEE */} <label htmlFor="employee">Employee</label>{" "}
        <select
          id="employee"
          value={employeeId}
          onChange={(e) => setEmployeeId(e.target.value)}
          disabled={!dbStatus?.connected || dbLoading}
        >
          {" "}
          <option value="">Select employee</option>{" "}
          <option value="all">All Employees</option>{" "}
          {employees.map((employee) => (
            <option key={employee.employeeId} value={employee.employeeId}>
              {" "}
              {employee.employeeId} - {employee.employeeName}{" "}
            </option>
          ))}{" "}
        </select>{" "}
        {/* GENERATE */}{" "}
        <button
          onClick={generate}
          disabled={
            loading ||
            dbLoading ||
            !dbStatus?.connected ||
            !fromDate ||
            !toDate ||
            !employeeId
          }
        >
          {" "}
          {loading ? "Generating…" : "Generate Report"}{" "}
        </button>{" "}
        {/* PRINT */}{" "}
        <button
          className="secondary"
          onClick={printReport}
          disabled={!rows.length}
        >
          {" "}
          Print Report{" "}
        </button>{" "}
      </section>{" "}
      {/* ERROR */} {error && <div className="error">{error}</div>}{" "}
      {/* REPORT */}{" "}
      <section className="report">
        {" "}
        <h1 className="company">Padma Group of Companies</h1>{" "}
        <div className="report-heading">
          {" "}
          <div>
            {" "}
            <h2>Attendance Report</h2>{" "}
            <p>
              {" "}
              {loadedMonth
                ? reportDescription
                : "Select report options and click Generate Report"}{" "}
            </p>{" "}
          </div>{" "}
          <div className="count">{rows.length} records</div>{" "}
        </div>{" "}
        <div className="table-wrap">
          {" "}
          <table>
            {" "}
            <thead>
              {" "}
              <tr>
                {" "}
                <th>Employee ID</th> <th>Name</th> <th>Position</th>{" "}
                <th>Date</th> <th>Timetable</th> <th>In Time</th>{" "}
                <th>Out Time</th>{" "}
              </tr>{" "}
            </thead>{" "}
            <tbody>
              {" "}
              {rows.map((row, i) => (
                <tr key={`${row.employeeId}-${row.date}-${i}`}>
                  {" "}
                  <td>{row.employeeId}</td> <td>{row.employeeName}</td>{" "}
                  <td>{row.position}</td> <td>{row.date}</td>{" "}
                  <td>{row.timetable}</td> <td>{timeOnly(row.inTime)}</td>{" "}
                  <td>{timeOnly(row.outTime)}</td>{" "}
                </tr>
              ))}{" "}
              {!rows.length && (
                <tr>
                  {" "}
                  <td colSpan="7" className="empty">
                    {" "}
                    No report data yet. Select date range and employee, then
                    click Generate Report.{" "}
                  </td>{" "}
                </tr>
              )}{" "}
            </tbody>{" "}
          </table>{" "}
        </div>{" "}
      </section>{" "}
      <footer>
        {" "}
        Data is read from the Time.Net SQLite database. This app does not modify
        the database.{" "}
      </footer>{" "}
    </main>
  );
}
