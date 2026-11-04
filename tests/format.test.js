import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTime } from '../js/format.js';

test('typed times become HH:mm', () => {
  const cases = {
    '8:00 AM': '08:00',
    '8:05am': '08:05',
    '8': '08:00',
    '08:05': '08:05',
    '805': '08:05',
    '2:30 PM': '14:30',
    '2:30': '14:30', // no am or pm: 1 to 6 are afternoon
    '11': '11:00', // 7 to 11 are morning
    '12': '12:00', // noon
    '12 am': '00:00',
    '12:15 pm': '12:15',
    '14:30': '14:30',
    '1430': '14:30',
    ' 9:05 a.m. ': '09:05',
  };
  for (const [typed, expected] of Object.entries(cases)) assert.equal(parseTime(typed), expected, typed);
});

test('things that are not times are refused', () => {
  for (const typed of ['', 'soon', '8:5', '8:60', '25:00', '13 pm', '0 am', '8:00 xm']) {
    assert.equal(parseTime(typed), null, typed);
  }
});
