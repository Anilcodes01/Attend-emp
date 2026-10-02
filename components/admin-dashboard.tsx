"use client";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";
import {
  businessDate,
  csvCell,
  duration,
  Snapshot,
  status,
  time,
} from "@/lib/shared";
export default function AdminDashboard() {
  const [key, setKey] = useState("");
  const [draftKey, setDraftKey] = useState("");
  const [date, setDate] = useState(businessDate);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [connection, setConnection] = useState("Disconnected");
  const [updated, setUpdated] = useState("");
  const [tab, setTab] = useState("attendance");
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("");
  const [filter, setFilter] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [resetId, setResetId] = useState("");
  const [newPin, setNewPin] = useState("");
  const refresh = useRef<() => void>(() => {});
  const mutation = useRef(false);
  useEffect(() => {
    if (!key) return;
    let alive = true,
      fetching = false,
      pending = false;
    let controller: AbortController | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function load() {
      if (!alive) return;
      if (fetching) {
        pending = true;
        return;
      }
      fetching = true;
      controller = new AbortController();
      setBusy(true);
      try {
        const response = await fetch(`/api/admin?date=${date}`, {
          headers: { Authorization: `Bearer ${key}` },
          cache: "no-store",
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok) {
          if (response.status === 401 && alive) {
            setKey("");
            setSnapshot(null);
          }
          throw new Error(data.error);
        }
        if (alive) {
          setSnapshot(data);
          setError("");
          setUpdated(new Date().toISOString());
        }
      } catch (e) {
        if (alive)
          setError(
            e instanceof Error
              ? e.message
              : "Connection failed. Try refreshing.",
          );
      } finally {
        fetching = false;
        if (alive) {
          setBusy(false);
          if (pending) {
            pending = false;
            timer = setTimeout(() => void load(), 300);
          }
        }
      }
    }
    function request() {
      if (!alive) return;
      if (fetching) {
        pending = true;
        return;
      }
      clearTimeout(timer);
      timer = setTimeout(() => void load(), 300);
    }
    refresh.current = request;
    const visible = () => {
      if (document.visibilityState === "visible") {
        if (date === initialToday) setDate(businessDate());
        request();
      }
    };
    const initialToday = businessDate();
    const online = () => request();
    const offline = () => setConnection("Disconnected");
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    void load();
    return () => {
      alive = false;
      controller?.abort();
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, [key, date]);
  useEffect(() => {
    if (!key || !snapshot?.topic) return;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
      publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !publishable) return;
    let alive = true;
    const client = createClient(url, publishable, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const channel = client
      .channel(snapshot.topic, { config: { private: false } })
      .on("broadcast", { event: "changed" }, () => refresh.current())
      .subscribe((state) => {
        if (!alive) return;
        setConnection(
          state === "SUBSCRIBED"
            ? "Connected"
            : state === "CHANNEL_ERROR" ||
                state === "TIMED_OUT" ||
                state === "CLOSED"
              ? "Disconnected"
              : "Connecting",
        );
        if (state === "SUBSCRIBED") refresh.current();
      });
    return () => {
      alive = false;
      void client.removeChannel(channel);
      void client.realtime.disconnect();
    };
  }, [key, snapshot?.topic]);
  useEffect(() => {
    if (!key) return;
    const today = businessDate();
    if (date !== today) return;
    const midnight = Date.parse(`${today}T00:00:00+05:30`) + 86400000;
    const timer = setTimeout(
      () => setDate(businessDate()),
      Math.max(100, midnight - Date.now() + 50),
    );
    return () => clearTimeout(timer);
  }, [date, key]);
  async function save(payload: Record<string, unknown>, method: string) {
    if (mutation.current) return false;
    mutation.current = true;
    setSaving(true);
    setNotice("");
    try {
      const response = await fetch("/api/admin", {
        method,
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setNotice("Employee updated successfully.");
      refresh.current();
      return true;
    } catch (e) {
      setNotice(
        e instanceof Error ? e.message : "Connection failed. Please try again.",
      );
      return false;
    } finally {
      setSaving(false);
      mutation.current = false;
    }
  }
  function lock() {
    setKey("");
    setDraftKey("");
    setSnapshot(null);
    setUpdated("");
    setConnection("Disconnected");
    setNotice("");
    setResetId("");
    setNewPin("");
  }
  const employees = snapshot?.employees || [];
  const records = new Map(
    snapshot?.attendance.map((row) => [row.employee_id, row]),
  );
  const active = employees.filter((e) => e.active);
  const rows = employees.filter(
    (e) =>
      (tab === "directory" || e.active || records.has(e.id)) &&
      `${e.full_name} ${e.employee_code}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (!department || e.department === department) &&
      (!filter || status(records.get(e.id)) === filter),
  );
  function exportCsv() {
    const values = [
      [
        "Name",
        "Employee ID",
        "Department",
        "Status",
        "Check in (IST)",
        "Check out (IST)",
        "Completed duration",
        "Late",
        "Date",
      ],
      ...rows.map((e) => {
        const a = records.get(e.id);
        return [
          e.full_name,
          e.employee_code,
          e.department,
          status(a),
          time(a?.checked_in_at),
          time(a?.checked_out_at),
          duration(a),
          a?.late ? "Yes" : "No",
          date,
        ];
      }),
    ];
    const blob = new Blob(
      ["\ufeff" + values.map((row) => row.map(csvCell).join(",")).join("\r\n")],
      { type: "text/csv;charset=utf-8" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendance-${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  if (!key)
    return (
      <main className="kiosk-page">
        <header>
          <Link href="/" className="brand">
            <span className="brand-mark">a</span> attend
          </Link>
          <Link href="/check-in">Employee kiosk ↗</Link>
        </header>
        <section className="kiosk">
          <div className="eyebrow">YOUR TEAM, IN VIEW</div>
          <h1>Welcome back.</h1>
          <p className="muted">
            Enter your admin access code to open the dashboard.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setKey(draftKey);
              setDraftKey("");
            }}
          >
            <label>
              Admin access code
              <input
                type="password"
                required
                autoComplete="off"
                value={draftKey}
                onChange={(e) => setDraftKey(e.target.value)}
              />
            </label>
            <button>Open dashboard →</button>
          </form>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <footer>
            Access stays in this browser tab until you lock or reload.
          </footer>
        </section>
      </main>
    );
  return (
    <div className="admin-shell">
      <aside>
        <Link href="/" className="brand">
          <span className="brand-mark">a</span> attend
        </Link>
        <div className="workspace-label">WORKSPACE</div>
        <button
          className={tab === "attendance" ? "nav active" : "nav"}
          onClick={() => {
            setTab("attendance");
            setFilter("");
          }}
        >
          ▦ &nbsp; Attendance
        </button>
        <button
          className={tab === "directory" ? "nav active" : "nav"}
          onClick={() => {
            setTab("directory");
            setFilter("");
          }}
        >
          ♧ &nbsp; Employee directory
        </button>
        <div className="sidebar-bottom">
          <Link href="/check-in">Open employee kiosk ↗</Link>
          <p>Asia/Kolkata · IST</p>
          <button className="secondary" onClick={lock}>
            Lock dashboard
          </button>
        </div>
      </aside>
      <main className="dashboard">
        <header className="dashboard-header">
          <div>
            <div className="eyebrow">
              WORKPLACE /{" "}
              {tab === "attendance" ? "DAILY OVERVIEW" : "YOUR PEOPLE"}
            </div>
            <h1>
              {tab === "attendance"
                ? "Attendance overview"
                : "Employee directory"}
            </h1>
            <p className="muted">
              {tab === "attendance"
                ? "A clear picture of your team’s day."
                : "Good teams start with good people."}
            </p>
          </div>
          <label className="date-input">
            Business date
            <input
              type="date"
              required
              value={date}
              onChange={(e) => {
                if (e.target.value) {
                  setSnapshot(null);
                  setDate(e.target.value);
                }
              }}
            />
          </label>
        </header>
        <div className="sync-row">
          <span
            className={
              connection === "Connected" ? "connection connected" : "connection"
            }
          >
            ● {connection}
          </span>
          <span>
            {busy
              ? "Updating…"
              : updated
                ? `Last updated ${time(updated)}`
                : "Waiting for first update"}
          </span>
          <button
            className="text-button"
            onClick={() => refresh.current()}
            disabled={busy}
          >
            ↻ Refresh
          </button>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <section className="stats">
          {[
            ["Active employees", active.length, "Registered and ready"],
            [
              "In office",
              active.filter(
                (e) => records.get(e.id) && !records.get(e.id)?.checked_out_at,
              ).length,
              "Currently checked in",
            ],
            [
              "Not checked in",
              active.filter((e) => !records.has(e.id)).length,
              "For the selected day",
            ],
            [
              "Late arrivals",
              (snapshot?.attendance || []).filter((a) => a.late).length,
              "After 9:45 AM IST",
            ],
          ].map(([label, number, description], i) => (
            <article key={label}>
              <span className="stat-icon">{["♧", "↗", "◷", "◴"][i]}</span>
              <p>{label}</p>
              <strong>{number}</strong>
              <small>{description}</small>
            </article>
          ))}
        </section>
        {tab === "directory" && (
          <section className="panel registration">
            <h2>Register an employee</h2>
            <p className="muted">
              Assign a unique ID and a private attendance PIN.
            </p>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const payload = Object.fromEntries(new FormData(form));
                if (await save(payload, "POST")) form.reset();
              }}
            >
              <div className="form-grid">
                {[
                  ["full_name", "Full name", "text"],
                  ["employee_code", "Employee ID", "text"],
                  ["department", "Department", "text"],
                  ["role", "Job title", "text"],
                  ["email", "Email (optional)", "email"],
                  ["pin", "Six-digit PIN", "password"],
                ].map(([name, label, type]) => (
                  <label key={name}>
                    {label}
                    <input
                      name={name}
                      type={type}
                      required={name !== "email"}
                      maxLength={
                        name === "pin"
                          ? 6
                          : name === "email"
                            ? 254
                            : name === "employee_code"
                              ? 40
                              : 120
                      }
                      pattern={name === "pin" ? "[0-9]{6}" : undefined}
                      inputMode={name === "pin" ? "numeric" : undefined}
                      autoComplete="off"
                    />
                  </label>
                ))}
              </div>
              <button disabled={saving}>
                {saving ? "Saving…" : "+ Register employee"}
              </button>
            </form>
          </section>
        )}
        {notice && (
          <p role="status" className="notice">
            {notice}
          </p>
        )}
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>
                {tab === "attendance" ? "Daily attendance" : "Your employees"}
              </h2>
              <p className="muted">
                {rows.length} employees · {date}
              </p>
            </div>
            {tab === "attendance" && (
              <button
                className="secondary"
                disabled={!snapshot}
                onClick={exportCsv}
              >
                ↓ Export CSV
              </button>
            )}
          </div>
          <div className="filters">
            <input
              aria-label="Search employees"
              placeholder="⌕  Search name or employee ID"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              aria-label="Department"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
            >
              <option value="">All departments</option>
              {[...new Set(employees.map((e) => e.department))]
                .sort()
                .map((d) => (
                  <option key={d}>{d}</option>
                ))}
            </select>
            {tab === "attendance" && (
              <select
                aria-label="Attendance status"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="">All statuses</option>
                {["Not checked in", "In office", "Checked out"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            )}
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Department</th>
                  <th>Status</th>
                  {tab === "attendance" ? (
                    <>
                      <th>Check in</th>
                      <th>Check out</th>
                      <th>Working time</th>
                      <th>Arrival</th>
                    </>
                  ) : (
                    <>
                      <th>Job title</th>
                      <th>Email</th>
                      <th>Actions</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => {
                  const row = records.get(e.id);
                  return (
                    <tr key={e.id}>
                      <td>
                        <div className="person">
                          <span className="avatar">
                            {e.full_name
                              .split(" ")
                              .map((n) => n[0])
                              .slice(0, 2)
                              .join("")}
                          </span>
                          <div>
                            <strong>{e.full_name}</strong>
                            <small>
                              {e.employee_code}
                              {!e.active && tab === "attendance"
                                ? " · Inactive"
                                : ""}
                            </small>
                          </div>
                        </div>
                      </td>
                      <td>{e.department}</td>
                      <td>
                        <span
                          className={`badge ${tab === "directory" ? (e.active ? "green" : "gray") : row ? (row.checked_out_at ? "blue" : "green") : "gray"}`}
                        >
                          {tab === "directory"
                            ? e.active
                              ? "Active"
                              : "Inactive"
                            : status(row)}
                        </span>
                      </td>
                      {tab === "attendance" ? (
                        <>
                          <td>{time(row?.checked_in_at)}</td>
                          <td>{time(row?.checked_out_at)}</td>
                          <td>{duration(row)}</td>
                          <td>
                            {row?.late ? (
                              <span className="badge amber">Late</span>
                            ) : row ? (
                              "On time"
                            ) : (
                              "—"
                            )}
                          </td>
                        </>
                      ) : (
                        <>
                          <td>{e.role}</td>
                          <td>{e.email || "—"}</td>
                          <td>
                            <div className="row-actions">
                              <button
                                className="text-button"
                                disabled={saving}
                                onClick={() => {
                                  setResetId(e.id);
                                  setNewPin("");
                                }}
                              >
                                Reset PIN
                              </button>
                              <button
                                className="text-button"
                                disabled={saving}
                                onClick={() =>
                                  void save(
                                    {
                                      id: e.id,
                                      action: "set_active",
                                      active: !e.active,
                                    },
                                    "PATCH",
                                  )
                                }
                              >
                                {e.active ? "Deactivate" : "Reactivate"}
                              </button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!rows.length && (
            <div className="empty">
              {busy
                ? "Loading your team…"
                : snapshot
                  ? "No employees match this view."
                  : "Your attendance data will appear after a successful connection."}
            </div>
          )}
        </section>
        <footer>
          Shift 9:30 AM · 15-minute grace · Completed durations exclude ongoing
          attendance.
        </footer>
      </main>
      {resetId && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-title"
          >
            <h2 id="reset-title">Reset attendance PIN</h2>
            <p className="muted">
              Set a new six-digit PIN. The existing PIN cannot be viewed.
            </p>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (
                  await save(
                    { id: resetId, action: "reset_pin", pin: newPin },
                    "PATCH",
                  )
                ) {
                  setResetId("");
                  setNewPin("");
                }
              }}
            >
              <label>
                New PIN
                <input
                  autoFocus
                  required
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
                />
              </label>
              <div className="two-buttons">
                <button disabled={saving}>Save PIN</button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    setResetId("");
                    setNewPin("");
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
