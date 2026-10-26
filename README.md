# Time Grid Generator

Generates an array of evenly spaced time slots between two datetimes at a specified interval, with support for excluding slots that fall inside defined break windows.

## Usage

```js
import { generateTimeGrid, toMillis, formatSlot } from 'time-grid-generator';

const slots = generateTimeGrid({
  start: new Date('2024-01-01T09:00:00Z'),
  end:   new Date('2024-01-01T17:00:00Z'),
  intervalMinutes: 60,
  breaks: [
    { start: new Date('2024-01-01T12:00:00Z'), end: new Date('2024-01-01T13:00:00Z') },
  ],
});

for (const s of slots) {
  console.log(s.isoStart, '->', s.isoEnd);
  // s.start and s.end are numeric epoch milliseconds
}
```

Exports:
- `generateTimeGrid({ start, end, intervalMinutes, breaks? })` — returns an array of `{ start: number, end: number, isoStart: string, isoEnd: string }`.
- `toMillis(Date | number)` — helper used internally to coerce inputs to epoch milliseconds; exported for reuse.
- `formatSlot(ms)` — formats epoch milliseconds as `YYYY-MM-DDTHH:mm:ssZ` (UTC, no fractional seconds).

## Why this exists

The specific problem is scheduling: you have a session window, a fixed cadence, and one or more lunch/coffee breaks, and you need the resulting list of available slots. Doing this ad hoc with `Date` arithmetic tends to drift or mishandle boundaries. This library makes the boundary rules explicit and keeps slot timestamps on a strict grid.

Trade-off: breaks **remove** slots but do **not** shift them. If you remove the 12:00 slot because of a lunch break, the next slot is still at 13:00, not crammed into 11:30. This keeps spacing regular and the grid predictable, at the cost of fewer total slots than a "reflow" approach would yield.

## The awkward edge

Boundaries. The rules, stated once:
- The session `start` and `end` are **excluded** from the slot list. They are edges, not slots.
- A slot is excluded if its start is `>= break.start` and `< break.end`. So a slot exactly at the break start is dropped; a slot exactly at the break end is kept.
- `intervalMinutes` is rounded to the nearest millisecond. Values that round to zero or below throw.
- If `end <= start`, the function throws a `RangeError` rather than returning an empty array, because that is almost always a caller bug.

All arithmetic is integer-millisecond based, so there is no float drift across the safe-integer range.

## Design notes

The window stores values eagerly rather than keeping running aggregates. Running
sums drift with floating point over long streams, and recomputing from a small
buffer is cheap enough that the drift is not worth the speed.

## Performance

The window keeps a bounded buffer, so `push` is constant time and memory does not
grow with the length of the stream. `peak` and `trough` are linear in the window
size, which is the trade that keeps `push` cheap.

## Contributing

Issues and pull requests are welcome. Please keep the dependency list empty —
that constraint is the point of the project, not an oversight.

