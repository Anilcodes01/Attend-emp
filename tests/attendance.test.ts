import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { businessDate, csvCell, duration, status, validDate } from '../lib/shared.ts';
test('business date rolls at Kolkata midnight', () => { assert.equal(businessDate(new Date('2026-10-02T18:29:59Z')), '2026-10-02'); assert.equal(businessDate(new Date('2026-10-02T18:30:00Z')), '2026-10-03'); });
test('rejects impossible dates', () => { assert.equal(validDate('2026-02-30'), false); assert.equal(validDate('2024-02-29'), true); });
test('status and duration use stored timestamps', () => { const row = { id: 'a', employee_id: 'b', work_date: '2026-10-02', checked_in_at: '2026-10-02T04:00:00Z', checked_out_at: null as string | null, late: false }; assert.equal(status(), 'Not checked in'); assert.equal(status(row), 'In office'); assert.equal(duration(row), '—'); row.checked_out_at = '2026-10-02T12:35:59Z'; assert.equal(status(row), 'Checked out'); assert.equal(duration(row), '8h 35m'); });
test('CSV escapes quotes and protects formulas', () => { assert.equal(csvCell('A,"B"'), '"A,""B"""'); for (const value of ['=1+1', ' +1', '@SUM(A1)', '-2', '\t=1']) assert.ok(csvCell(value).startsWith('"\'')); });
test('migration keeps writes serialized and broadcast empty', () => { const sql = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8'); assert.match(sql, /for update/i); assert.match(sql, /unique\(employee_id, work_date\)/); assert.match(sql, /realtime.send\('\{\}'::jsonb, 'changed', channel, false\)/); assert.equal((sql.match(/enable row level security/g) || []).length, 4); assert.match(sql, /from public, anon, authenticated/); });
