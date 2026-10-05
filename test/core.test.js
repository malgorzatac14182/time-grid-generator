import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateTimeGrid, toMillis, formatSlot } from '../src/index.js';

// Fixed reference instants used across tests. Using constants (not wall-clock
// time) keeps the suite deterministic.
const BASE = Date.UTC(2024, 0, 1, 9, 0, 0); // 2024-01-01T09:00:00Z
const HOUR = 60 * 60 * 1000;

function iso(ms) {
  return formatSlot(ms);
}

// Pure helper for readability in expected values.
function add(baseMs, minutes) {
  return baseMs + minutes * 60 * 1000;
}

test('generates evenly spaced slots within the open interval', () => {
  const slots = generateTimeGrid({
    start: BASE,
    end: BASE + 3 * HOUR,
    intervalMinutes: 60,
  });
  // Start boundary excluded, end boundary excluded.
  assert.deepEqual(slots.map((s) => s.isoStart), [
    iso(BASE + 1 * HOUR),
    iso(BASE + 2 * HOUR),
  ]);
});

test('slot objects expose numeric start/end and iso strings', () => {
  const slots = generateTimeGrid({
    start: BASE,
    end: BASE + 2 * HOUR,
    intervalMinutes: 30,
  });
  const s = slots[0];
  assert.equal(s.start, BASE + 30 * 60 * 1000);
  assert.equal(s.end, BASE + 60 * 60 * 1000);
  assert.equal(s.isoStart, '2024-01-01T09:30:00Z');
  assert.equal(s.isoEnd, '2024-01-01T10:00:00Z');
  assert.equal(typeof s.start, 'number');
  assert.equal(typeof s.end, 'number');
});

test('excludes slots whose start falls inside a break window', () => {
  const slots = generateTimeGrid({
    start: BASE,
    end: BASE + 4 * HOUR,
    intervalMinutes: 60,
    breaks: [{ start: BASE + 2 * HOUR, end: BASE + 3 * HOUR }],
  });
  // 10:00 kept, 11:00 inside break dropped, 12:00 kept.
  assert.deepEqual(slots.map((s) => s.isoStart), [
    iso(BASE + 1 * HOUR),
    iso(BASE + 3 * HOUR),
  ]);
});

test('slot at exact break start is excluded; slot at exact break end is kept', () => {
  const slots = generateTimeGrid({
    start: BASE,
    end: BASE + 4 * HOUR,
    intervalMinutes: 60,
    breaks: [{ start: BASE + 2 * HOUR, end: BASE + 3 * HOUR }],
  });
  const starts = slots.map((s) => s.start);
  // 11:00 == break start -> excluded.
  assert.equal(starts.includes(BASE + 2 * HOUR), false);
  // 12:00 == break end -> kept.
  assert.equal(starts.includes(BASE + 3 * HOUR), true);
});

test('multiple break windows are each honoured', () => {
  const slots = generateTimeGrid({
    start: BASE,
    end: BASE + 5 * HOUR,
    intervalMinutes: 60,
    breaks: [
      { start: BASE + 1 * HOUR, end: BASE + 2 * HOUR },
      { start: BASE + 3 * HOUR, end: BASE + 4 * HOUR },
    ],
  });
  // 10:00 dropped (break1), 11:00 kept, 12:00 dropped (break2), 13:00 kept.
  assert.deepEqual(slots.map((s) => s.isoStart), [
    iso(BASE + 2 * HOUR),
    iso(BASE + 4 * HOUR),
  ]);
});

test('returns empty array when interval exceeds duration', () => {
  const slots = generateTimeGrid({
    start: BASE,
    end: BASE + 30 * 60 * 1000, // 30 minutes
    intervalMinutes: 60,
  });
  assert.deepEqual(slots, []);
});

test('accepts Date objects as inputs', () => {
  const slots = generateTimeGrid({
    start: new Date(BASE),
    end: new Date(BASE + 2 * HOUR),
    intervalMinutes: 60,
  });
  assert.equal(slots.length, 1);
  assert.equal(slots[0].start, BASE + HOUR);
});

test('accepts numeric timestamps as inputs', () => {
  const slots = generateTimeGrid({
    start: BASE,
    end: BASE + 2 * HOUR,
    intervalMinutes: 60,
  });
  assert.equal(slots.length, 1);
});

test('throws RangeError when end is not after start', () => {
  assert.throws(
    () => generateTimeGrid({ start: BASE, end: BASE, intervalMinutes: 30 }),
    RangeError,
  );
  assert.throws(
    () => generateTimeGrid({ start: BASE + 1000, end: BASE, intervalMinutes: 30 }),
    RangeError,
  );
});

test('throws RangeError for non-positive interval', () => {
  assert.throws(
    () => generateTimeGrid({ start: BASE, end: BASE + HOUR, intervalMinutes: 0 }),
    RangeError,
  );
  assert.throws(
    () => generateTimeGrid({ start: BASE, end: BASE + HOUR, intervalMinutes: -5 }),
    RangeError,
  );
});

test('throws RangeError when break end precedes break start', () => {
  assert.throws(
    () => generateTimeGrid({
      start: BASE,
      end: BASE + 3 * HOUR,
      intervalMinutes: 60,
      breaks: [{ start: BASE + 2 * HOUR, end: BASE + 1 * HOUR }],
    }),
    RangeError,
  );
});

test('toMillis converts Date and number inputs to epoch milliseconds', () => {
  assert.equal(toMillis(BASE), BASE);
  assert.equal(toMillis(new Date(BASE)), BASE);
});

test('toMillis throws TypeError for invalid input', () => {
  assert.throws(() => toMillis('not a date'), TypeError);
  assert.throws(() => toMillis(NaN), TypeError);
  assert.throws(() => toMillis(Infinity), TypeError);
});

test('formatSlot produces ISO-8601 UTC with Z suffix and no fractional seconds', () => {
  assert.equal(formatSlot(Date.UTC(2024, 0, 1, 9, 30, 0)), '2024-01-01T09:30:00Z');
  assert.equal(formatSlot(Date.UTC(2024, 5, 15, 23, 59, 59)), '2024-06-15T23:59:59Z');
});

test('sub-minute interval still aligns to integer milliseconds', () => {
  // 15-minute interval over 1 hour -> 3 slots after the first at 09:00 boundary
  // (09:00 excluded; 09:15, 09:30, 09:45 included; 10:00 is the end, excluded).
  const slots = generateTimeGrid({
    start: BASE,
    end: BASE + HOUR,
    intervalMinutes: 15,
  });
  assert.deepEqual(slots.map((s) => s.isoStart), [
    iso(BASE + 15 * 60 * 1000),
    iso(BASE + 30 * 60 * 1000),
    iso(BASE + 45 * 60 * 1000),
  ]);
});

test('break window entirely outside the session has no effect', () => {
  const slots = generateTimeGrid({
    start: BASE,
    end: BASE + 3 * HOUR,
    intervalMinutes: 60,
    breaks: [{ start: BASE + 5 * HOUR, end: BASE + 6 * HOUR }],
  });
  assert.equal(slots.length, 2);
});

test('break window inside the session but between slots has no effect', () => {
  // Slots at 10:00 and 11:00; break from 10:30 to 10:45 falls between them.
  const slots = generateTimeGrid({
    start: BASE,
    end: BASE + 3 * HOUR,
    intervalMinutes: 60,
    breaks: [{ start: BASE + 90 * 60 * 1000, end: BASE + 105 * 60 * 1000 }],
  });
  assert.equal(slots.length, 2);
});

test('default breaks is an empty array when omitted', () => {
  const slots = generateTimeGrid({
    start: BASE,
    end: BASE + 2 * HOUR,
    intervalMinutes: 60,
  });
  assert.equal(slots.length, 1);
});

test('slots remain regularly spaced regardless of breaks', () => {
  // Even with a break removing a slot, the remaining slot starts stay on the
  // same grid: 60-minute spacing from BASE.
  const slots = generateTimeGrid({
    start: BASE,
    end: BASE + 4 * HOUR,
    intervalMinutes: 60,
    breaks: [{ start: BASE + 2 * HOUR, end: BASE + 3 * HOUR }],
  });
  for (let i = 0; i < slots.length; i++) {
    assert.equal((slots[i].start - BASE) % HOUR, 0);
  }
});
