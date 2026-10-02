export const TIMEZONE = 'Asia/Kolkata';
export type Employee = { id: string; employee_code: string; full_name: string; email: string | null; department: string; role: string; active: boolean; created_at: string };
export type Attendance = { id: string; employee_id: string; work_date: string; checked_in_at: string; checked_out_at: string | null; late: boolean };
export type Snapshot = { employees: Employee[]; attendance: Attendance[]; topic: string; date: string };
export function businessDate(now = new Date()) { return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now); }
export function validDate(value: string) { return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value; }
export function time(value?: string | null) { return value ? new Intl.DateTimeFormat('en-IN', { timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '—'; }
export function duration(row?: Attendance) { if (!row?.checked_out_at) return '—'; const minutes = Math.floor((Date.parse(row.checked_out_at) - Date.parse(row.checked_in_at)) / 60000); return `${Math.floor(minutes / 60)}h ${minutes % 60}m`; }
export function status(row?: Attendance) { return !row ? 'Not checked in' : row.checked_out_at ? 'Checked out' : 'In office'; }
export function csvCell(value: unknown) { let text = String(value ?? ''); if (/^[\s]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text; return '"' + text.replaceAll('"', '""') + '"'; }
