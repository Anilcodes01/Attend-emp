# Attend

An internal attendance app built with Next.js App Router, TypeScript, and Supabase. `/admin` manages employees and attendance; `/check-in` is an employee kiosk. The home page links to both.

## Configure

1. Install dependencies with `npm install`.
2. Replace placeholders in `.env.local`. Get the project URL and publishable key from Supabase’s Connect dialog / API settings, and the secret key from API Keys. A legacy service-role key can instead be supplied as `SUPABASE_SERVICE_ROLE_KEY`.
3. Generate an admin code of at least 32 characters, for example with `openssl rand -hex 32`. Set `ADMIN_ACCESS_KEY`. Share this code only with trusted admins: anyone who has it has full access.
4. Run `supabase/schema.sql` once in the Supabase SQL editor on a fresh project. This transactional migration creates tables, permissions, functions, triggers, and a random Broadcast topic. It is not intended to rerun over an existing schema.
5. Ensure public Realtime channels are permitted in project Realtime settings. Database Broadcast uses `realtime.send`; employee and attendance tables do not need Postgres Changes publication. See [Supabase Broadcast documentation](https://supabase.com/docs/guides/realtime/broadcast).
6. When ready, start the development server yourself with `npm run dev`.

`.env.local` and other secret environment files are ignored; `.env.example` contains only placeholders. Existing `.env` files are left untouched. Never put the secret key or admin code in a `NEXT_PUBLIC_` variable. The server fails closed if database configuration or persistent rate-limit protection is unavailable.

## Deployment

Import this repository into Vercel, add the four environment variables from `.env.example` to the intended deployment environments, and deploy. Redeploy after changing environment variables. Set the project’s appropriate region near your database. No Socket.IO server or continuous process is needed.

## Behavior and security

- Business days use Asia/Kolkata. Shift begins 9:30 AM with grace through 9:45 AM; later timestamps are late.
- Database time determines punches. An employee row lock serializes punches, PIN resets, and active-status changes. A unique employee/date constraint prevents duplicate records. Repeated check-in before check-out and repeated check-out return existing timestamps. Check-in after completed check-out is rejected. Status requests also require valid credentials and an active employee.
- PINs use Node scrypt with a random 16-byte salt and a 64-byte output. PINs and hashes are never returned by APIs. Admin credentials stay only in React memory, disappear on reload, and are cleared when locked.
- RLS is enabled on all app tables; anon/authenticated have no table privileges or privileged function execution. Service-role credentials are server only.
- Persistent 15-minute fixed-window limits: 10 invalid admin attempts per IP, 60 kiosk requests per IP, and 20 kiosk attempts per employee code (including successful requests). An IP limit bounds attempts against invented IDs. Expired counters are pruned on each request. On Vercel the trusted `x-vercel-forwarded-for` is preferred; other hosting must supply a trusted proxy IP header or replace the fallback. Do not expose the origin behind a proxy that accepts arbitrary forwarded headers.
- Public Broadcast sends only `{}` with event `changed`. The opaque topic is returned through the admin API, but it is not an authorization boundary. Anyone discovering it may subscribe or forge hints. Hints only schedule protected snapshots and cannot change records. With real admin identities, migrate to private authorized channels.
- Snapshots load initially and after subscription/reconnection. Changes are coalesced; requests do not overlap within a date view. Old date responses are aborted and ignored. Online/visible events recover snapshots, and one midnight timeout advances today. No attendance-fetch interval exists. A disconnected dashboard retains manual Refresh.
- CSV uses quoted cells, escapes quotes, and neutralizes leading spreadsheet formula characters. Historical views include inactive employees with attendance; the directory retains everyone. Deactivation preserves all history.
- Overnight shifts and multiple breaks are outside this version. Checkout after midnight cannot complete yesterday’s record.

## Verification

Run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`. No command starts the development server except `dev` or `start`.

After real credentials and SQL are configured, verify with an admin tab and a kiosk tab:

- Unlock, register an employee, confirm duplicate IDs are rejected, and reset the PIN.
- Check out before checking in; enter wrong credentials; deactivate and try punching.
- Send concurrent duplicate punches and confirm one record and unchanged original timestamps.
- Check in, see the admin update without Refresh, check status, check out, repeat check-out, then reject another check-in.
- Verify late boundary timestamps (09:45:00 is on time; later is late), database dates, and completed duration.
- Change historical dates during pending requests; search/filter/export, including names beginning with formula characters.
- Disconnect/reconnect network, hide/show the tab, reload/lock the dashboard, and test midnight rollover.
- Confirm browser responses contain no PIN hashes or secrets; confirm anon/authenticated cannot read tables or execute app functions.
- Seed more than 1,000 employees/attendance records and verify pagination and CSV counts.

SQL execution, live atomicity/RLS checks, Realtime delivery, browser layout QA, and the two-tab scenarios require the configured Supabase project and a server started at your request. Unit tests cover shared date, status, duration, CSV, and schema security invariants; they do not substitute for live database tests.
