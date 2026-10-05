/**
 * Core logic for the time-grid generator.
 *
 * All time arithmetic is done in milliseconds to keep comparisons simple and
 * integer-safe across the supported range (up to Number.MAX_SAFE_INTEGER).
 */

/**
 * Normalise a Date or millisecond timestamp into a millisecond number.
 * Accepting both lets callers pass Date objects or epoch values.
 * @param {Date|number} d
 * @returns {number}
 */
export function toMillis(d) {
  if (d instanceof Date) {
    return d.getTime();
  }
  if (typeof d === 'number' && Number.isFinite(d)) {
    return d;
  }
  throw new TypeError('start and end must be Date or number');
}

/**
 * Format a millisecond timestamp as an ISO-8601 UTC string, ending at 'Z'
 * (no fractional seconds). Used for slot identifiers so they are sortable and
 * comparable with === (no float comparisons).
 * @param {number} ms
 * @returns {string}
 */
export function formatSlot(ms) {
  // toISOString gives 'YYYY-MM-DDTHH:mm:ss.sssZ'; slice off '.sss'.
  return new Date(ms).toISOString().slice(0, 19) + 'Z';
}

/**
 * Generate evenly spaced time slots between two datetimes, optionally
 * excluding break windows.
 *
 * Design decisions (stated plainly so behaviour is unambiguous):
 *  - Slots are generated purely from the requested interval; breaks remove
 *    slots but do NOT change the slot timestamps. A slot starting inside a
 *    break is dropped. This keeps spacing regular and predictable.
 *  - A slot's start timestamp must be strictly after 'start' and strictly
 *    before 'end' to appear in the output. This excludes the boundaries
 *    themselves, which represent session edges rather than available slots.
 *  - Break windows are half-open on their start (a slot at exactly the break
 *    start is excluded) and open on their end (a slot at exactly the break
 *    end is kept). In other words a slot is excluded if breakStart <= slot < breakEnd.
 *  - Invalid intervals are checked up front and throw synchronously, so
 *    callers cannot accidentally receive a partial grid.
 *
 * @param {object} opts
 * @param {Date|number} opts.start          inclusive lower bound (excluded from slots)
 * @param {Date|number} opts.end            exclusive upper bound (excluded from slots)
 * @param {number} opts.intervalMinutes    minutes between consecutive slot starts; must be > 0
 * @param {Array<{start: Date|number, end: Date|number}>} [opts.breaks=[]] break windows
 * @returns {Array<{start: number, end: number, isoStart: string, isoEnd: string}>}
 */
export function generateTimeGrid({ start, end, intervalMinutes, breaks = [] }) {
  const startMs = toMillis(start);
  const endMs = toMillis(end);

  if (!Number.isFinite(intervalMinutes) || intervalMinutes <= 0) {
    throw new RangeError('intervalMinutes must be a positive finite number');
  }
  if (endMs <= startMs) {
    throw new RangeError('end must be after start');
  }

  // Duration must be representable as an integer millis count to avoid any
  // float drift across many additions.
  const totalMs = endMs - startMs;
  if (!Number.isSafeInteger(totalMs)) {
    throw new RangeError('start/end span exceeds safe integer millisecond range');
  }

  const intervalMs = Math.round(intervalMinutes * 60 * 1000);
  if (intervalMs <= 0) {
    throw new RangeError('intervalMinutes too small after rounding');
  }

  // Normalise breaks into plain number pairs once, so the hot loop doesn't
  // allocate Date objects per slot.
  /** @type {Array<[number, number]>} */
  const breakPairs = [];
  for (const b of breaks) {
    const bs = toMillis(b.start);
    const be = toMillis(b.end);
    if (be < bs) {
      throw new RangeError('break end must be >= break start');
    }
    breakPairs.push([bs, be]);
  }

  const out = [];
  // Walk by whole-millisecond additions. We rely on integer intervalMs so
  // there is no float accumulation error within the safe-integer range.
  let cursor = startMs + intervalMs;
  while (cursor < endMs) {
    let excluded = false;
    for (let i = 0; i < breakPairs.length; i++) {
      const [bs, be] = breakPairs[i];
      if (cursor >= bs && cursor < be) {
        excluded = true;
        break;
      }
    }
    if (!excluded) {
      const slotEnd = cursor + intervalMs;
      out.push({
        start: cursor,
        end: slotEnd,
        isoStart: formatSlot(cursor),
        isoEnd: formatSlot(slotEnd),
      });
    }
    cursor += intervalMs;
  }

  return out;
}
