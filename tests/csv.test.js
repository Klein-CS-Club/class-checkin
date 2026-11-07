import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toCsv, RESTROOM_HEADER, restroomRows } from '../js/csv.js';

// Local times on 2026-11-06, so the tests don't depend on the time zone.
const at = (h, m, s = 0) => new Date(2026, 10, 6, h, m, s).getTime();

const cls = {
  id: 'c2',
  name: 'Period 2',
  students: [
    { id: 'a', name: 'Alex River' },
    { id: 's', name: 'Sam Flores' },
    { id: 'r', name: 'Robin Park' },
  ],
};
const trip = (studentId, out, back, overrideReason = null) =>
  ({ id: `t${out}`, sessionId: 'x', classId: 'c2', studentId, departedAt: out, returnedAt: back, overrideReason });

test('restroom rows are one per trip in time order, numbered per student', () => {
  const trips = [
    trip('s', at(9, 20), at(9, 31)),
    trip('a', at(9, 40), at(9, 44)),
    trip('a', at(9, 12), at(9, 17)),
  ];
  const before = JSON.stringify(trips);
  assert.deepEqual(restroomRows(cls, '2026-11-06', trips), [
    ['2026-11-06', 'Period 2', 'Alex River', 1, '9:12 AM', '9:17 AM', 5, ''],
    ['2026-11-06', 'Period 2', 'Sam Flores', 1, '9:20 AM', '9:31 AM', 11, ''],
    ['2026-11-06', 'Period 2', 'Alex River', 2, '9:40 AM', '9:44 AM', 4, ''],
  ]);
  assert.equal(JSON.stringify(trips), before, 'the trips passed in are not reordered');
});

test('minutes out are rounded to the nearest whole minute', () => {
  const rows = restroomRows(cls, '2026-11-06', [
    trip('a', at(9, 0), at(9, 4, 29)),
    trip('s', at(9, 10), at(9, 14, 30)),
  ]);
  assert.deepEqual(rows.map((r) => r[6]), [4, 5]);
});

test('a student still out has empty Back and Minutes out', () => {
  const [row] = restroomRows(cls, '2026-11-06', [trip('r', at(9, 46), null)]);
  assert.deepEqual(row, ['2026-11-06', 'Period 2', 'Robin Park', 1, '9:46 AM', '', '', '']);
});

test('the override reason is kept and a formula-looking reason is guarded', () => {
  const rows = restroomRows(cls, '2026-11-06', [
    trip('s', at(9, 20), at(9, 31), 'Nurse note'),
    trip('a', at(9, 40), at(9, 44), '=HYPERLINK("http://x")'),
  ]);
  assert.equal(rows[0][7], 'Nurse note');
  const lines = toCsv(RESTROOM_HEADER, rows).split('\r\n');
  assert.equal(lines[1], '2026-11-06,Period 2,Sam Flores,1,9:20 AM,9:31 AM,11,Nurse note');
  assert.equal(lines[2], `2026-11-06,Period 2,Alex River,1,9:40 AM,9:44 AM,4,"'=HYPERLINK(""http://x"")"`);
});

test('a removed student shows as Removed student', () => {
  const [row] = restroomRows(cls, '2026-11-06', [trip('gone', at(9, 5), at(9, 8))]);
  assert.equal(row[2], 'Removed student');
});
