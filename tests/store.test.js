// Run with: node --test   (Node 22 or newer; the app itself has no dependencies.)
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// The store reads localStorage when it loads, so a stand-in has to exist before it is imported.
const memoryStorage = (initial = {}) => {
  const data = { ...initial };
  return {
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
  };
};
globalThis.localStorage = memoryStorage();

const store = await import('../js/store.js');
const { atTime, dateKey } = await import('../js/format.js');

const realNow = Date.now;
const day = dateKey(new Date());
const clock = (hm) => { Date.now = () => atTime(day, hm); };

// A class starting at 8:00 with 5 minutes to be on time, and three students.
let classId, ann, bob, cy;
beforeEach(() => {
  store.resetAll();
  classId = store.addClass('Period 1', '08:00', 5);
  store.addStudents(classId, ['Ann Adams', 'Bob Brown', 'Cy Clark']);
  [ann, bob, cy] = store.sortedStudents(store.classById(classId)).map((s) => s.id);
});
afterEach(() => { Date.now = realNow; });

const status = (id) => store.statusFor(store.classById(classId), day, id);

// ---------- Bell schedule and late minutes ----------
test('arriving at the cutoff is present, a minute later is late', () => {
  clock('08:05');
  store.checkIn(classId, ann);
  clock('08:06');
  store.checkIn(classId, bob);
  assert.equal(status(ann), 'present');
  assert.equal(status(bob), 'late');
});

test('minutes late count from the start time, rounded up', () => {
  const cls = store.classById(classId);
  clock('08:05');
  store.checkIn(classId, ann);
  clock('08:07');
  store.checkIn(classId, bob);
  assert.equal(store.minutesLate(cls, day, ann), null);
  assert.equal(store.minutesLate(cls, day, bob), 7);
});

test('a manual status edit clears minutes late', () => {
  clock('08:09');
  store.checkIn(classId, ann);
  store.setOverride(classId, day, ann, 'present');
  assert.equal(store.minutesLate(store.classById(classId), day, ann), null);
});

test('changing one day moves the cutoff for that day only', () => {
  store.setDaySchedule(classId, day, { startTime: '09:00', lateMinutes: 5, absentMinutes: null });
  clock('08:30');
  store.checkIn(classId, ann);
  assert.equal(status(ann), 'present');
  store.setDaySchedule(classId, day, null);
  assert.equal(status(ann), 'late');
});

test('one day can have its own late minutes', () => {
  store.setDaySchedule(classId, day, { startTime: '08:00', lateMinutes: 20, absentMinutes: null });
  clock('08:15');
  store.checkIn(classId, ann);
  assert.equal(status(ann), 'present');
  assert.equal(store.classById(classId).lateMinutes, 5); // the usual number is untouched
});

test('arriving after the absent cutoff counts as absent, and the check-in is kept', () => {
  store.updateClass(classId, { absentMinutes: 15 });
  clock('08:15');
  store.checkIn(classId, ann);
  clock('08:16');
  store.checkIn(classId, bob);
  assert.equal(status(ann), 'late');
  assert.equal(status(bob), 'absent');
  assert.equal(store.minutesLate(store.classById(classId), day, bob), 16);
  assert.ok(store.dayRows(classId, day).find((r) => r.student.id === bob).checkIn);
});

test('with no absent cutoff, a late arrival stays late however late it is', () => {
  clock('11:00');
  store.checkIn(classId, ann);
  assert.equal(status(ann), 'late');
});

test('late and absent minutes are checked', () => {
  assert.equal(store.bellProblem(5, null), '');
  assert.equal(store.bellProblem(5, 15), '');
  assert.match(store.bellProblem(61, null), /0 to 60/);
  assert.match(store.bellProblem(5, 5), /more than Late after/);
  assert.match(store.bellProblem(5, 2.5), /whole number/);
});

// ---------- Finalizing ----------
test('students stay not-yet until finalized, and finalizing can be undone', () => {
  assert.equal(status(ann), 'notyet');
  store.finalizeAttendance(classId, day);
  assert.equal(status(ann), 'absent');
  store.undoFinalize(classId, day);
  assert.equal(status(ann), 'notyet');
});

test('a day that is over counts as absent without finalizing', () => {
  assert.equal(store.statusFor(store.classById(classId), '2020-01-01', ann), 'absent');
});

// ---------- Saving ----------
test('a backup brings back finalized days', () => {
  store.finalizeAttendance(classId, day);
  const text = store.backupText();
  store.resetAll();
  store.restoreBackup(store.readBackup(text));
  assert.equal(status(bob), 'absent');
});

test('a backup from before start times and finalizing still restores', () => {
  const old = JSON.stringify({
    app: 'class-checkin-v1',
    pin: '4321',
    classes: [{ id: 'c', name: 'Old', lateAfter: '09:05', students: [{ id: 's', name: 'Sam Old' }] }],
    checkIns: [],
    overrides: {},
  });
  store.restoreBackup(store.readBackup(old));
  const cls = store.classById('c');
  assert.deepEqual([cls.startTime, cls.lateMinutes, cls.lateAfter], ['09:05', 0, undefined]);
  assert.deepEqual(store.getState().finalized, {});
  assert.equal(store.getState().settings.pin, '4321');
});

test('a backup with start-time-only day changes keeps those days, with the class’s other numbers', () => {
  const earlier = JSON.stringify({
    app: 'class-checkin-v1',
    classes: [{
      id: 'c', name: 'Earlier', startTime: '08:00', lateMinutes: 5, dayStarts: { '2026-11-02': '09:30' },
      students: [{ id: 's', name: 'Sam Earlier' }],
    }],
    checkIns: [],
  });
  store.restoreBackup(store.readBackup(earlier));
  const cls = store.classById('c');
  assert.deepEqual(store.scheduleFor(cls, '2026-11-02'), { startTime: '09:30', lateMinutes: 5, absentMinutes: null });
  assert.equal(cls.dayStarts, undefined);
  assert.equal(cls.absentMinutes, null);
});

test('an old save upgrades on load and keeps a copy of the original', async () => {
  const saved = JSON.stringify({
    classes: [{ id: 'c', name: 'Old', lateAfter: '09:05', students: [{ id: 's', name: 'Sam Old' }] }],
    checkIns: [{ id: 'x', classId: 'c', studentId: 's', date: day, at: atTime(day, '09:07') }],
    overrides: {},
  });
  globalThis.localStorage = memoryStorage({ 'class-checkin-v1': saved });
  const fresh = await import('../js/store.js?old-save'); // a second copy of the module that reads the new storage
  const cls = fresh.classById('c');
  assert.deepEqual([cls.startTime, cls.lateMinutes], ['09:05', 0]);
  assert.equal(fresh.statusFor(cls, day, 's'), 'late');
  assert.equal(globalThis.localStorage.getItem('class-checkin-v1-backup'), saved);
});
