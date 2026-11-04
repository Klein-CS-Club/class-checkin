import { todayKey, atTime } from './format.js';
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
    settings: { pin: '1234', sidebarExpanded: true },
    currentClassId: null, // the period picked in the sidebar
    // [{ id, name, startTime: 'HH:mm', lateMinutes, absentMinutes: n | null,
    //    days: { date: { startTime, lateMinutes, absentMinutes } }, students: [{ id, name }] }]
    classes: [],
    checkIns: [],    // [{ id, classId, studentId, date: 'YYYY-MM-DD', at: ms }]
    overrides: {},   // { 'classId|date|studentId': 'present' | 'late' | 'absent' }
    finalized: {},   // { 'classId|date': true } once the teacher has confirmed who is absent
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
    return { ...c, startTime: c.startTime ?? lateAfter ?? '08:00', lateMinutes, absentMinutes, days: c.days ?? fromStarts };
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
export function addClass(name, startTime, lateMinutes, absentMinutes = null) {
  const cls = { id: uid(), name, startTime, lateMinutes, absentMinutes, days: {}, students: [] };
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
    added.push({ id: uid(), name });
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
    overrides: Object.fromEntries(
      Object.entries(state.overrides).filter(([k]) => !(k.startsWith(`${classId}|`) && k.endsWith(`|${studentId}`)))),
  });
}

// ---------- Check-ins ----------
const findCheckIn = (classId, date, studentId) =>
  state.checkIns.find((x) => x.classId === classId && x.date === date && x.studentId === studentId);

// Recorded by student id. A second check-in on the same day saves nothing new.
export function checkIn(classId, studentId) {
  const date = todayKey();
  const existing = findCheckIn(classId, date, studentId);
  if (existing) return { kind: 'already', checkIn: existing };
  const entry = { id: uid(), classId, studentId, date, at: Date.now() };
  commit({ ...state, checkIns: [...state.checkIns, entry] });
  return { kind: 'recorded', checkIn: entry };
}

export function undoCheckIn(id) {
  commit({ ...state, checkIns: state.checkIns.filter((x) => x.id !== id) });
}

export const isCheckedIn = (classId, studentId, date = todayKey()) => !!findCheckIn(classId, date, studentId);

// ---------- Status (derived, never stored) ----------
const overrideKey = (classId, date, studentId) => `${classId}|${date}|${studentId}`;

// One class on one date. Finalizing is kept per session.
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
export const scheduleFor = (cls, date) => cls.days?.[date] ?? {
  startTime: cls.startTime,
  lateMinutes: cls.lateMinutes,
  absentMinutes: cls.absentMinutes ?? null,
};

// A schedule puts that one date on its own numbers; null puts it back on the usual ones.
export function setDaySchedule(classId, date, schedule) {
  const days = { ...classById(classId).days };
  if (schedule) days[date] = schedule;
  else delete days[date];
  updateClass(classId, { days });
}

// Why these can't be a class's late and absent minutes, or '' when they can.
export function bellProblem(lateMinutes, absentMinutes) {
  if (!Number.isInteger(lateMinutes) || lateMinutes < 0 || lateMinutes > 60) return 'Late after must be 0 to 60 whole minutes.';
  if (absentMinutes === null) return '';
  if (!Number.isInteger(absentMinutes) || absentMinutes <= lateMinutes || absentMinutes > 240) {
    return 'Absent after must be a whole number of minutes, more than Late after. Leave it empty to never mark late arrivals absent.';
  }
  return '';
}

// When the class starts, when arrivals turn late, and when (if ever) they count as absent, as timestamps.
export function bellFor(cls, date) {
  const { startTime, lateMinutes, absentMinutes } = scheduleFor(cls, date);
  const startAt = atTime(date, startTime);
  return {
    startAt,
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
  return isFinalized(cls.id, date) || date < todayKey() ? 'absent' : 'notyet';
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

// How many students are here today (present or late, overrides included).
export function hereToday(classId) {
  return dayRows(classId, todayKey()).filter((r) => r.status === 'present' || r.status === 'late').length;
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

// The backup file: classes, rosters, attendance and the PIN, as JSON.
export function backupText() {
  const { classes, checkIns, overrides, finalized, settings } = state;
  return JSON.stringify({ app: KEY, savedAt: new Date().toISOString(), pin: settings.pin, classes, checkIns, overrides, finalized });
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

// Replaces everything with a backup from readBackup. Backups from before start times and finalizing
// existed are fine: the old classes are upgraded and the missing parts start empty.
export function restoreBackup(data) {
  const base = initialState();
  commit({
    ...base,
    settings: { ...state.settings, pin: /^\d{4}$/.test(data.pin) ? data.pin : base.settings.pin },
    classes: upgradeClasses(data.classes),
    checkIns: data.checkIns,
    overrides: data.overrides ?? {},
    finalized: data.finalized ?? {},
  });
}
