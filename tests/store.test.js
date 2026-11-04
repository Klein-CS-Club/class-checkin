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

test('late, absent and end times are checked', () => {
  const ok = { startTime: '08:00', lateMinutes: 5 };
  assert.equal(store.bellProblem({ ...ok, absentMinutes: null }), '');
  assert.equal(store.bellProblem({ ...ok, absentMinutes: 15, endTime: '08:50' }), '');
  assert.match(store.bellProblem({ ...ok, lateMinutes: 61 }), /0 to 60/);
  assert.match(store.bellProblem({ ...ok, absentMinutes: 5 }), /more than Late after/);
  assert.match(store.bellProblem({ ...ok, absentMinutes: 2.5 }), /whole number/);
  assert.match(store.bellProblem({ ...ok, endTime: '07:59' }), /end time must be after/);
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

// ---------- Restroom ----------
test('the first minutes allow a request but not a trip, and open exactly on time', () => {
  clock('08:09');
  assert.match(store.departureEligibility(classId, day, ann), /Trips open at 8:10/);
  assert.equal(store.requestRestroom(classId, day, ann).kind, 'waiting');
  clock('08:10');
  assert.equal(store.departureEligibility(classId, day, ann), '');
});

test('nobody leaves before class starts', () => {
  clock('07:55');
  assert.match(store.departureEligibility(classId, day, ann), /Class starts at 8:00/);
});

// ---------- The 10:10 rule: no trips in the first or last minutes of class ----------
test('with an end time, trips close in the last minutes of class', () => {
  store.updateClass(classId, { endTime: '08:50' });
  clock('08:39');
  assert.equal(store.departureEligibility(classId, day, ann), '');
  clock('08:40');
  assert.match(store.departureEligibility(classId, day, ann), /last 10 minutes of class \(after 8:40/);
  clock('08:50');
  assert.match(store.departureEligibility(classId, day, ann), /Class is over/);
});

test('nobody joins the waitlist once trips have closed for the day', () => {
  store.updateClass(classId, { endTime: '08:50' });
  clock('08:45');
  assert.equal(store.requestRestroom(classId, day, ann).kind, 'error');
  assert.equal(store.restroomSummary(classId, day).queue.length, 0);
});

test('a student who is out can come back after trips close, and an override can still send one out', () => {
  store.updateClass(classId, { endTime: '08:50' });
  clock('08:30');
  store.markOut(classId, day, ann);
  clock('08:45');
  assert.equal(store.markReturned(classId, day, ann).kind, 'returned');
  assert.equal(store.markOut(classId, day, bob, 'emergency').kind, 'out');
});

test('a class with no end time has no last-minutes block', () => {
  clock('08:59');
  assert.equal(store.departureEligibility(classId, day, ann), '');
});

test('one day can have its own end time', () => {
  store.updateClass(classId, { endTime: '08:50' });
  store.setDaySchedule(classId, day, { startTime: '08:00', endTime: '09:30', lateMinutes: 5, absentMinutes: null });
  clock('08:45');
  assert.equal(store.departureEligibility(classId, day, ann), '');
});

test('with a free slot, a request sends the student out right away', () => {
  clock('08:20');
  assert.equal(store.requestRestroom(classId, day, ann).kind, 'out');
  assert.equal(store.restroomSummary(classId, day).active.length, 1);
});

test('the waitlist is first come first served and respects capacity', () => {
  clock('08:05');
  store.requestRestroom(classId, day, bob);
  store.requestRestroom(classId, day, ann);
  clock('08:10');
  assert.match(store.departureEligibility(classId, day, ann), /ahead/);
  assert.equal(store.markOut(classId, day, bob).kind, 'out');
  assert.match(store.departureEligibility(classId, day, ann), /full/);
  assert.equal(store.markOut(classId, day, ann).kind, 'error');
  clock('08:15');
  store.markReturned(classId, day, bob);
  assert.equal(store.departureEligibility(classId, day, ann), '');
});

test('capacity comes from Settings', () => {
  store.setRestroomRules(2, 0);
  clock('08:01');
  assert.equal(store.requestRestroom(classId, day, ann).kind, 'out');
  assert.equal(store.requestRestroom(classId, day, bob).kind, 'out');
  assert.equal(store.requestRestroom(classId, day, cy).kind, 'waiting');
});

test('a teacher override needs a reason, skips the limits, and keeps the reason', () => {
  clock('08:02');
  assert.equal(store.markOut(classId, day, ann).kind, 'error');
  assert.equal(store.markOut(classId, day, ann, 'asked to go').kind, 'out');
  assert.equal(store.restroomSummary(classId, day).active[0].overrideReason, 'asked to go');
});

test('returns total up trips, students and time out', () => {
  clock('08:10');
  store.markOut(classId, day, ann);
  clock('08:20');
  store.markReturned(classId, day, ann);
  store.markOut(classId, day, ann);
  clock('08:25');
  const sum = store.restroomSummary(classId, day);
  assert.equal(sum.trips.length, 2);
  assert.equal(sum.unique, 1);
  assert.equal(sum.completedMs, 10 * 60000);
  assert.equal(sum.totalMs, 15 * 60000);
  assert.equal(store.markReturned(classId, day, bob).kind, 'error');
});

test('trips can only start on today’s date', () => {
  clock('08:20');
  assert.equal(store.requestRestroom(classId, '2020-01-01', ann).kind, 'error');
});

test('removing a student or a class removes their trips and waitlist spots', () => {
  clock('08:05');
  store.requestRestroom(classId, day, ann);
  clock('08:15');
  store.markOut(classId, day, bob);
  store.removeStudent(classId, ann);
  assert.equal(store.getState().queue.length, 0);
  store.deleteClass(classId);
  assert.equal(store.getState().trips.length, 0);
});

// ---------- Period 7 demo ----------
test('the demo has its own clock, its own records, and resets without touching real classes', () => {
  store.openDemo();
  const demo = store.demoClass();
  clock('08:20'); // the real time when the demo clock is set
  assert.equal(store.setDemoClock(atTime(day, '14:10')), '');
  assert.equal(store.nowFor(demo.id), atTime(day, '14:10'));
  clock('08:21'); // a real minute later, the demo clock has moved a minute too
  assert.equal(store.nowFor(demo.id), atTime(day, '14:11'));
  store.requestRestroom(demo.id, store.todayFor(demo), demo.students[0].id);
  assert.match(store.setDemoClock(atTime(day, '14:00')), /before a trip/);
  store.resetDemo();
  assert.equal(store.getState().trips.length, 0);
  assert.equal(store.getState().classes.length, 2); // the real class and the demo
});

// ---------- Saving ----------
test('a backup brings back trips, finalized days and the restroom rules', () => {
  store.setRestroomRules(3, 7);
  clock('08:20');
  store.requestRestroom(classId, day, ann);
  store.finalizeAttendance(classId, day);
  const text = store.backupText();
  store.resetAll();
  store.restoreBackup(store.readBackup(text));
  assert.equal(store.restroomSummary(classId, day).active.length, 1);
  assert.equal(status(bob), 'absent');
  assert.deepEqual(
    [store.getState().settings.capacity, store.getState().settings.restrictionMinutes], [3, 7]);
});

test('a backup from before start times and trips still restores', () => {
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
  assert.equal(store.getState().trips.length, 0);
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
  assert.deepEqual(
    store.scheduleFor(cls, '2026-11-02'), { startTime: '09:30', endTime: null, lateMinutes: 5, absentMinutes: null });
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
