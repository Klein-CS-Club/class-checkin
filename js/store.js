import { todayKey, dateKey, atTime, hhmm, time12 } from './format.js';
import { compareByName, sameName, tidyName } from './names.js';
import { demoData } from './seed.js';

const KEY = 'class-checkin-v1';

// crypto.randomUUID needs https, and a tablet on the LAN may load the app over plain http.
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export const STATUSES = {
  present: 'Present',
  late: 'Late',
  absent: 'Absent',
  notyet: 'Not yet',
};

function initialState() {
  return {
    // capacity: students allowed out at once. restrictionMinutes: no restroom trips this long after the start.
    settings: { pin: '1234', sidebarExpanded: true, capacity: 1, restrictionMinutes: 10 },
    currentClassId: null, // the period picked in the sidebar
    // [{ id, name, startTime: 'HH:mm', endTime: 'HH:mm' | null, lateMinutes, absentMinutes: n | null,
    //    days: { date: { startTime, endTime, lateMinutes, absentMinutes } }, students: [{ id, name, addedOn? }] }]
    //    addedOn ('YYYY-MM-DD') is when the student joined the roster; older students don't have one.
    classes: [],
    checkIns: [],    // [{ id, classId, studentId, date: 'YYYY-MM-DD', at: ms }]
    overrides: {},   // { 'classId|date|studentId': 'present' | 'late' | 'absent' }
    finalized: {},   // { 'classId|date': true } once the teacher has confirmed who is absent
    // [{ id, sessionId, classId, studentId, departedAt: ms, returnedAt: ms | null, overrideReason }]
    trips: [],
    // Students waiting for the restroom, first come first served: [{ id, sessionId, classId, studentId, requestedAt: ms }]
    queue: [],
    demoClock: null, // ms; the Period 7 demo's time when it was last set, or null
    demoSetAt: null, // ms; the real time it was set, so the demo clock runs on from there
    kiosk: null,     // { classId } while the check-in screen is locked on
  };
}

// Older saves had a single "late after" time per class. It becomes the start time with no grace
// minutes, so every old check-in keeps the status it had.
function upgradeClasses(classes) {
  return classes.map(({ lateAfter, dayStarts, ...c }) => {
    const lateMinutes = c.lateMinutes ?? 0;
    const absentMinutes = c.absentMinutes ?? null;
    // A day that was changed keeps all of its numbers. The first version only kept a start time.
    const fromStarts = Object.fromEntries(
      Object.entries(dayStarts ?? {}).map(([date, startTime]) => [date, { startTime, lateMinutes, absentMinutes }]));
    return {
      ...c,
      startTime: c.startTime ?? lateAfter ?? '08:00',
      endTime: c.endTime ?? null,
      lateMinutes,
      absentMinutes,
      days: c.days ?? fromStarts,
    };
  });
}

// First run starts with demo classes so there's something to try.
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    const saved = JSON.parse(raw);
    if (saved) {
      // Keep a copy of the old format the first time it's upgraded.
      const old = saved.classes?.some((c) => c.startTime === undefined);
      if (old && !localStorage.getItem(`${KEY}-backup`)) localStorage.setItem(`${KEY}-backup`, raw);
      const base = initialState();
      return {
        ...base,
        ...saved,
        settings: { ...base.settings, ...saved.settings },
        classes: upgradeClasses(saved.classes ?? []),
      };
    }
  } catch { /* storage unavailable or corrupt: start fresh */ }
  return { ...initialState(), ...demoData(uid) };
}

let state = load();
const listeners = new Set();

function commit(next) {
  state = next;
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ }
  listeners.forEach((fn) => fn(state));
}

export const getState = () => state;

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const classById = (id) => state.classes.find((c) => c.id === id);

// The picked period, or the first one if none is picked or it was deleted.
export const currentClass = () => classById(state.currentClassId) ?? state.classes[0] ?? null;

export function selectClass(id) {
  commit({ ...state, currentClassId: id });
}

export const sortedStudents =(cls) => [...cls.students].sort((a, b) => compareByName(a.name, b.name));

// ---------- Classes and rosters ----------
export function addClass(name, startTime, lateMinutes, absentMinutes = null, endTime = null) {
  const cls = { id: uid(), name, startTime, endTime, lateMinutes, absentMinutes, days: {}, students: [] };
  commit({ ...state, classes: [...state.classes, cls] });
  return cls.id;
}

export function updateClass(id, patch) {
  commit({ ...state, classes: state.classes.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
}

export function deleteClass(id) {
  commit({
    ...state,
    classes: state.classes.filter((c) => c.id !== id),
    checkIns: state.checkIns.filter((x) => x.classId !== id),
    overrides: Object.fromEntries(Object.entries(state.overrides).filter(([k]) => !k.startsWith(`${id}|`))),
    finalized: Object.fromEntries(Object.entries(state.finalized).filter(([k]) => !k.startsWith(`${id}|`))),
    trips: state.trips.filter((t) => t.classId !== id),
    queue: state.queue.filter((q) => q.classId !== id),
    kiosk: state.kiosk?.classId === id ? null : state.kiosk,
  });
}

// Adds names that aren't on the roster yet. Returns how many were added.
export function addStudents(classId, names) {
  const cls = classById(classId);
  if (!cls) return 0;
  const added = [];
  for (const raw of names) {
    const name = tidyName(raw);
    if (!name || [...cls.students, ...added].some((s) => sameName(s.name, name))) continue;
    added.push({ id: uid(), name, addedOn: todayFor(cls) });
  }
  if (added.length) updateClass(classId, { students: [...cls.students, ...added] });
  return added.length;
}

export function renameStudent(classId, studentId, name) {
  const cls = classById(classId);
  updateClass(classId, { students: cls.students.map((s) => (s.id === studentId ? { ...s, name } : s)) });
}

// Removes the student and their attendance in this class.
export function removeStudent(classId, studentId) {
  const cls = classById(classId);
  commit({
    ...state,
    classes: state.classes.map((c) => (c.id === classId ? { ...c, students: cls.students.filter((s) => s.id !== studentId) } : c)),
    checkIns: state.checkIns.filter((x) => !(x.classId === classId && x.studentId === studentId)),
    trips: state.trips.filter((t) => t.studentId !== studentId),
    queue: state.queue.filter((q) => q.studentId !== studentId),
    overrides: Object.fromEntries(
      Object.entries(state.overrides).filter(([k]) => !(k.startsWith(`${classId}|`) && k.endsWith(`|${studentId}`)))),
  });
}

// ---------- Check-ins ----------
const findCheckIn = (classId, date, studentId) =>
  state.checkIns.find((x) => x.classId === classId && x.date === date && x.studentId === studentId);

// Recorded by student id. A second check-in on the same day saves nothing new.
export function checkIn(classId, studentId) {
  const at = nowFor(classId);
  const date = dateKey(new Date(at));
  const existing = findCheckIn(classId, date, studentId);
  if (existing) return { kind: 'already', checkIn: existing };
  const entry = { id: uid(), classId, studentId, date, at };
  commit({ ...state, checkIns: [...state.checkIns, entry] });
  return { kind: 'recorded', checkIn: entry };
}

export function undoCheckIn(id) {
  commit({ ...state, checkIns: state.checkIns.filter((x) => x.id !== id) });
}

export const isCheckedIn = (classId, studentId, date = todayKey()) => !!findCheckIn(classId, date, studentId);

// ---------- Status (derived, never stored) ----------
const overrideKey = (classId, date, studentId) => `${classId}|${date}|${studentId}`;

// One class on one date. Finalizing, the restroom queue and trips are all kept per session.
export const sessionId = (classId, date) => `${classId}|${date}`;

export const isFinalized = (classId, date) => !!state.finalized[sessionId(classId, date)];

// Until the teacher finalizes, students who haven't checked in stay "Not yet" instead of
// being marked absent while they might still arrive. Past days count as finalized.
export function finalizeAttendance(classId, date) {
  commit({ ...state, finalized: { ...state.finalized, [sessionId(classId, date)]: true } });
}

export function undoFinalize(classId, date) {
  const finalized = { ...state.finalized };
  delete finalized[sessionId(classId, date)];
  commit({ ...state, finalized });
}

// The numbers a class runs on for one date: its usual ones, unless that date was changed.
// absentMinutes is how long after the start an arrival counts as absent; null means never.
// endTime is when class ends, or null when the class has none (then there is no last-minutes block).
export const scheduleFor = (cls, date) => (cls.days?.[date]
  ? { endTime: null, absentMinutes: null, ...cls.days[date] }
  : { startTime: cls.startTime, endTime: cls.endTime ?? null, lateMinutes: cls.lateMinutes, absentMinutes: cls.absentMinutes ?? null });

// A schedule puts that one date on its own numbers; null puts it back on the usual ones.
export function setDaySchedule(classId, date, schedule) {
  const days = { ...classById(classId).days };
  if (schedule) days[date] = schedule;
  else delete days[date];
  updateClass(classId, { days });
}

// Why these can't be a class's late and absent minutes, or '' when they can.
export function bellProblem({ startTime, endTime = null, lateMinutes, absentMinutes = null }) {
  if (endTime !== null && endTime <= startTime) return 'The end time must be after the start time.';
  if (!Number.isInteger(lateMinutes) || lateMinutes < 0 || lateMinutes > 60) return 'Late after must be 0 to 60 whole minutes.';
  if (absentMinutes === null) return '';
  if (!Number.isInteger(absentMinutes) || absentMinutes <= lateMinutes || absentMinutes > 240) {
    return 'Absent after must be a whole number of minutes, more than Late after. Leave it empty to never mark late arrivals absent.';
  }
  return '';
}

// When the class starts, when arrivals turn late, and when (if ever) they count as absent, as timestamps.
export function bellFor(cls, date) {
  const { startTime, endTime, lateMinutes, absentMinutes } = scheduleFor(cls, date);
  const startAt = atTime(date, startTime);
  return {
    startAt,
    endAt: endTime ? atTime(date, endTime) : null,
    cutoffAt: startAt + lateMinutes * 60000,
    absentAt: absentMinutes == null ? null : startAt + absentMinutes * 60000,
  };
}

// An override wins. Otherwise a check-in at or before the late cutoff is present, after it is late,
// and after the absent cutoff (if the class has one) is absent. With no check-in, the student is
// absent once the day is finalized or over, else "not yet".
export function statusFor(cls, date, studentId) {
  const override = state.overrides[overrideKey(cls.id, date, studentId)];
  if (override) return override;
  const entry = findCheckIn(cls.id, date, studentId);
  if (entry) {
    const { cutoffAt, absentAt } = bellFor(cls, date);
    if (absentAt !== null && entry.at > absentAt) return 'absent';
    return entry.at <= cutoffAt ? 'present' : 'late';
  }
  return isFinalized(cls.id, date) || date < todayFor(cls) ? 'absent' : 'notyet';
}

// Whole minutes after the start time that a late student arrived, rounded up. Null when they
// weren't late or the teacher set the status by hand (that edit says nothing about arrival).
export function minutesLate(cls, date, studentId) {
  if (state.overrides[overrideKey(cls.id, date, studentId)]) return null;
  const entry = findCheckIn(cls.id, date, studentId);
  const { startAt, cutoffAt } = bellFor(cls, date);
  return entry && entry.at > cutoffAt ? Math.ceil((entry.at - startAt) / 60000) : null;
}

export function dayRows(classId, date) {
  const cls = classById(classId);
  if (!cls) return [];
  return sortedStudents(cls).map((student) => ({
    student,
    checkIn: findCheckIn(classId, date, student.id) ?? null,
    status: statusFor(cls, date, student.id),
    minutesLate: minutesLate(cls, date, student.id),
    overridden: !!state.overrides[overrideKey(classId, date, student.id)],
  }));
}

// One student's record in one class, newest first: every day the class has anything saved (a check-in,
// an edit, a finalized day or a restroom trip) up to today, and that student's trips. Read-only.
export function studentHistory(classId, studentId) {
  const cls = classById(classId);
  const student = cls?.students.find((s) => s.id === studentId);
  if (!student) return null;
  const prefix = `${classId}|`;
  const today = todayFor(cls);
  const dates = new Set([
    ...state.checkIns.filter((x) => x.classId === classId).map((x) => x.date),
    ...Object.keys(state.overrides).filter((k) => k.startsWith(prefix)).map((k) => k.split('|')[1]),
    ...Object.keys(state.finalized).filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length)),
    ...state.trips.filter((t) => t.classId === classId).map((t) => t.sessionId.slice(prefix.length)),
  ]);
  // Days before the student joined the roster aren't theirs. Students from older saves have no date: every day.
  const joined = student.addedOn ?? '';
  const days = [...dates].filter((date) => date <= today && date >= joined).sort().reverse().map((date) => ({
    date,
    status: statusFor(cls, date, studentId),
    checkIn: findCheckIn(classId, date, studentId) ?? null,
    minutesLate: minutesLate(cls, date, studentId),
    overridden: !!state.overrides[overrideKey(classId, date, studentId)],
  }));
  const trips = state.trips
    .filter((t) => t.classId === classId && t.studentId === studentId)
    .sort((a, b) => b.departedAt - a.departedAt)
    .map(({ id, sessionId: sid, departedAt, returnedAt, overrideReason }) => ({
      id, date: sid.slice(prefix.length), departedAt, returnedAt, overrideReason: overrideReason ?? '',
    }));
  const counts = { present: 0, late: 0, absent: 0, notyet: 0 };
  for (const d of days) counts[d.status] += 1;
  return { cls, student, days, trips, counts };
}

// How many students are here today (present or late, overrides included).
export function hereToday(classId) {
  return dayRows(classId, todayFor(classById(classId))).filter((r) => r.status === 'present' || r.status === 'late').length;
}

// status null clears the override, so the status goes back to automatic.
export function setOverride(classId, date, studentId, status) {
  const overrides = { ...state.overrides };
  if (status) overrides[overrideKey(classId, date, studentId)] = status;
  else delete overrides[overrideKey(classId, date, studentId)];
  commit({ ...state, overrides });
}

// Marks everyone still absent or not yet arrived as present.
export function markRestPresent(classId, date) {
  const overrides = { ...state.overrides };
  for (const row of dayRows(classId, date)) {
    if (row.status === 'absent' || row.status === 'notyet') overrides[overrideKey(classId, date, row.student.id)] = 'present';
  }
  commit({ ...state, overrides });
}

// ---------- Restroom ----------
// The queue and the trips are kept per session (one class on one date), like finalizing.
// Requests and returns are always allowed. A student can leave once the class has started, the
// opening restriction is over, there's a free slot, and nobody else is waiting ahead of them.
// The teacher can override all of that except the date, with a reason that stays on the trip.

// The time a class goes by. Only the Period 7 demo has its own clock; every other class uses the real one.
// Only the Period 7 demo has its own clock: it starts at the time you set and then keeps running.
// Saved data from before it ran has no set time, so it runs from when the page loaded.
const pageLoadedAt = Date.now();
export const nowFor = (classId) => (classById(classId)?.demo && state.demoClock != null
  ? state.demoClock + (Date.now() - (state.demoSetAt ?? pageLoadedAt))
  : Date.now());
export const todayFor = (cls) => dateKey(new Date(nowFor(cls.id)));

// capacity: students out at once. restrictionMinutes: none may leave this long after the start.
// The demo keeps its own rules so its walkthrough never depends on the Settings values.
export const rulesFor = (cls) => (cls?.demo
  ? { capacity: 1, restrictionMinutes: 10 }
  : { capacity: state.settings.capacity, restrictionMinutes: state.settings.restrictionMinutes });

const result = (kind, message) => ({ kind, message });

// A student who is out right now, whichever day they left.
const openTrip = (studentId) => state.trips.find((t) => t.studentId === studentId && t.returnedAt == null);

export function restroomSummary(classId, date, at = nowFor(classId)) {
  const sid = sessionId(classId, date);
  const trips = state.trips.filter((t) => t.sessionId === sid);
  const queue = state.queue.filter((q) => q.sessionId === sid);
  const active = trips.filter((t) => t.returnedAt == null);
  const completed = trips.filter((t) => t.returnedAt != null);
  const completedMs = completed.reduce((sum, t) => sum + t.returnedAt - t.departedAt, 0);
  const activeMs = active.reduce((sum, t) => sum + Math.max(0, at - t.departedAt), 0);
  return {
    trips, queue, active, completed, completedMs,
    totalMs: completedMs + activeMs, // time out so far, including students who are still out
    unique: new Set(trips.map((t) => t.studentId)).size,
  };
}

// Why this student can't be on a restroom trip for this session at all. Empty when they can.
function sessionProblem(classId, date, studentId) {
  const cls = classById(classId);
  if (!cls?.students.some((s) => s.id === studentId)) return 'That student isn’t on this class roster.';
  if (date !== todayFor(cls)) return 'Restroom trips can only start on today’s date.';
  return '';
}

// The 10:10 rule's second half: no trips in the last minutes of class, or once it is over.
// Empty when the class has no end time or isn't that close to ending.
export function closingProblem(cls, date, at = nowFor(cls.id)) {
  const { endAt } = bellFor(cls, date);
  if (endAt === null) return '';
  if (at >= endAt) return 'Class is over.';
  const { restrictionMinutes } = rulesFor(cls);
  const closesAt = endAt - restrictionMinutes * 60000;
  return restrictionMinutes > 0 && at >= closesAt
    ? `No trips in the last ${restrictionMinutes} minutes of class (after ${time12(closesAt)}).`
    : '';
}

// Why this student can't leave right now. Empty when they can.
export function departureEligibility(classId, date, studentId, at = nowFor(classId)) {
  const problem = sessionProblem(classId, date, studentId);
  if (problem) return problem;
  const cls = classById(classId);
  const { capacity, restrictionMinutes } = rulesFor(cls);
  const { startAt } = bellFor(cls, date);
  if (at < startAt) return `Class starts at ${time12(startAt)}.`;
  const opensAt = startAt + restrictionMinutes * 60000;
  if (at < opensAt) return `Trips open at ${time12(opensAt)}.`;
  const closed = closingProblem(cls, date, at);
  if (closed) return closed;
  const { active, queue } = restroomSummary(classId, date, at);
  if (active.length >= capacity) return 'The restroom is full.';
  if (queue.length && queue[0].studentId !== studentId) return 'Students ahead in the waitlist go first.';
  return '';
}

// Sends the student out if they can go now, otherwise puts them on the waitlist.
export function requestRestroom(classId, date, studentId) {
  const problem = sessionProblem(classId, date, studentId);
  if (problem) return result('error', problem);
  if (openTrip(studentId)) return result('already', 'Already out.');
  const sid = sessionId(classId, date);
  if (state.queue.some((q) => q.sessionId === sid && q.studentId === studentId)) return result('already', 'Already on the waitlist.');
  // Waiting is pointless once trips have closed for the day, so don't take a place in line.
  const closed = closingProblem(classById(classId), date, nowFor(classId));
  if (closed) return result('error', closed);
  const reason = departureEligibility(classId, date, studentId);
  if (!reason) return markOut(classId, date, studentId);
  const entry = { id: uid(), sessionId: sid, classId, studentId, requestedAt: nowFor(classId) };
  commit({ ...state, queue: [...state.queue, entry] });
  return result('waiting', `Added to the waitlist. ${reason}`);
}

// Records a departure and takes the student off the waitlist. A reason makes it a teacher override.
export function markOut(classId, date, studentId, reason = '') {
  const problem = sessionProblem(classId, date, studentId);
  if (problem) return result('error', problem);
  if (openTrip(studentId)) return result('already', 'Already out.');
  const overrideReason = reason.trim();
  const blocked = departureEligibility(classId, date, studentId);
  if (blocked && !overrideReason) return result('error', blocked);
  const sid = sessionId(classId, date);
  const trip = { id: uid(), sessionId: sid, classId, studentId, departedAt: nowFor(classId), returnedAt: null, overrideReason };
  commit({
    ...state,
    trips: [...state.trips, trip],
    queue: state.queue.filter((q) => !(q.sessionId === sid && q.studentId === studentId)),
  });
  return result('out', overrideReason ? 'Out, with a teacher override.' : 'Out.');
}

// Works on any date, so a trip left open on an earlier day can still be closed.
export function markReturned(classId, date, studentId) {
  const trip = restroomSummary(classId, date).active.find((t) => t.studentId === studentId);
  if (!trip) return result('error', 'That student isn’t out for this class and date.');
  const at = nowFor(classId);
  if (at < trip.departedAt) return result('error', 'The return time would be before they left.');
  commit({ ...state, trips: state.trips.map((t) => (t.id === trip.id ? { ...t, returnedAt: at } : t)) });
  return result('returned', 'Back in class.');
}

export function cancelRequest(id) {
  commit({ ...state, queue: state.queue.filter((q) => q.id !== id) });
}

// ---------- Period 7 demo ----------
// A made-up class with its own clock, for trying the restroom rules without waiting for the bell.
const DEMO_NAMES = ['Alex River', 'Jordan Bell', 'Sam Flores', 'Taylor Chen', 'Robin Park', 'Casey Reed'];

export const demoClass = () => state.classes.find((c) => c.demo);

// Adds the demo class if it isn't there and opens it, with the clock at 1:59 PM today.
export function openDemo() {
  const today = todayKey();
  const existing = demoClass();
  if (existing) {
    // Keep the time of day it was left at, but on today's date so it lines up with Attendance.
    const timeOfDay = state.demoClock == null ? '13:59' : hhmm(state.demoClock);
    commit({ ...state, currentClassId: existing.id, demoClock: atTime(today, timeOfDay), demoSetAt: Date.now() });
    return;
  }
  const cls = {
    id: uid(),
    name: 'Period 7 · DEMO',
    demo: true,
    startTime: '14:00',
    endTime: '15:00',
    lateMinutes: 5,
    absentMinutes: null,
    days: {},
    students: DEMO_NAMES.map((name) => ({ id: uid(), name })),
  };
  commit({ ...state, classes: [...state.classes, cls], currentClassId: cls.id, demoClock: atTime(today, '13:59'), demoSetAt: Date.now() });
}

// Returns an error message, or '' once the clock is set. It can't go back before a trip that already happened.
export function setDemoClock(at) {
  const cls = demoClass();
  if (!cls || !Number.isFinite(at)) return 'Pick a time.';
  const latest = Math.max(0, ...state.trips.filter((t) => t.classId === cls.id).map((t) => t.returnedAt ?? t.departedAt));
  if (at < latest) return 'That is before a trip that already happened. Reset the demo to start over.';
  commit({ ...state, demoClock: at, demoSetAt: Date.now() });
  return '';
}

// Removes the demo's attendance and trips and starts it again. Real classes are not touched.
export function resetDemo() {
  const cls = demoClass();
  if (cls) deleteClass(cls.id);
  openDemo();
}

// ---------- Kiosk ----------
export function startKiosk(classId) {
  commit({ ...state, kiosk: { classId } });
}

// Leaving the kiosk needs the teacher's PIN. Returns whether it matched.
export function stopKiosk(pin) {
  if (pin !== state.settings.pin) return false;
  commit({ ...state, kiosk: null });
  return true;
}

// ---------- Settings and data ----------
export function setPin(pin) {
  commit({ ...state, settings: { ...state.settings, pin } });
}

export function setRestroomRules(capacity, restrictionMinutes) {
  commit({ ...state, settings: { ...state.settings, capacity, restrictionMinutes } });
}

export function setSidebarExpanded(sidebarExpanded) {
  commit({ ...state, settings: { ...state.settings, sidebarExpanded } });
}

// Replaces classes and attendance with the demo set. Keeps the PIN.
export function loadDemo() {
  commit({ ...initialState(), settings: state.settings, ...demoData(uid) });
}

// Empties everything: no classes, no attendance, PIN back to 1234.
export function resetAll() {
  commit(initialState());
}

// The backup file: classes, rosters, attendance, restroom trips and the PIN and restroom rules, as JSON.
export function backupText() {
  const { classes, checkIns, overrides, finalized, trips, queue, demoClock, demoSetAt, settings } = state;
  return JSON.stringify({
    app: KEY,
    savedAt: new Date().toISOString(),
    pin: settings.pin,
    capacity: settings.capacity,
    restrictionMinutes: settings.restrictionMinutes,
    classes, checkIns, overrides, finalized, trips, queue, demoClock, demoSetAt,
  });
}

// Reads a backup file's text, or throws if it isn't a backup from this app.
export function readBackup(text) {
  let data;
  try { data = JSON.parse(text); } catch { data = null; }
  if (data?.app !== KEY || !Array.isArray(data.classes) || !Array.isArray(data.checkIns)) {
    throw new Error('That file isn’t a Class Check-in backup.');
  }
  return data;
}

// Replaces everything with a backup from readBackup. Backups from before restroom trips and start
// times existed are fine: the missing parts start empty and the old classes are upgraded.
export function restoreBackup(data) {
  const base = initialState();
  const whole = (n, min, max, fallback) => (Number.isInteger(n) && n >= min && n <= max ? n : fallback);
  commit({
    ...base,
    settings: {
      ...state.settings,
      pin: /^\d{4}$/.test(data.pin) ? data.pin : base.settings.pin,
      capacity: whole(data.capacity, 1, 50, base.settings.capacity),
      restrictionMinutes: whole(data.restrictionMinutes, 0, 120, base.settings.restrictionMinutes),
    },
    classes: upgradeClasses(data.classes),
    checkIns: data.checkIns,
    overrides: data.overrides ?? {},
    finalized: data.finalized ?? {},
    trips: data.trips ?? [],
    queue: data.queue ?? [],
    demoClock: data.demoClock ?? null,
    demoSetAt: data.demoSetAt ?? null,
  });
}
