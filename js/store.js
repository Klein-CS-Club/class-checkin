import { todayKey, hhmm } from './format.js';
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
    settings: { pin: '1234' },
    classes: [],     // [{ id, name, lateAfter: 'HH:mm', students: [{ id, name }] }]
    checkIns: [],    // [{ id, classId, studentId, date: 'YYYY-MM-DD', at: ms }]
    overrides: {},   // { 'classId|date|studentId': 'present' | 'late' | 'absent' }
    kiosk: null,     // { classId } while the check-in screen is locked on
  };
}

// First run starts with demo classes so there's something to try.
function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved) {
      const base = initialState();
      return { ...base, ...saved, settings: { ...base.settings, ...saved.settings } };
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

export const sortedStudents = (cls) => [...cls.students].sort((a, b) => compareByName(a.name, b.name));

// ---------- Classes and rosters ----------
export function addClass(name, lateAfter) {
  const cls = { id: uid(), name, lateAfter, students: [] };
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

// An override wins. Otherwise a check-in in or before the "late after" minute is present,
// after it is late, and no check-in is absent (or "not yet" until the late time today).
export function statusFor(cls, date, studentId, now = Date.now()) {
  const override = state.overrides[overrideKey(cls.id, date, studentId)];
  if (override) return override;
  const entry = findCheckIn(cls.id, date, studentId);
  if (entry) return hhmm(entry.at) <= cls.lateAfter ? 'present' : 'late';
  const today = todayKey();
  if (date > today || (date === today && hhmm(now) <= cls.lateAfter)) return 'notyet';
  return 'absent';
}

export function dayRows(classId, date) {
  const cls = classById(classId);
  if (!cls) return [];
  return sortedStudents(cls).map((student) => ({
    student,
    checkIn: findCheckIn(classId, date, student.id) ?? null,
    status: statusFor(cls, date, student.id),
    overridden: !!state.overrides[overrideKey(classId, date, student.id)],
  }));
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

// Replaces classes and attendance with the demo set. Keeps the PIN.
export function loadDemo() {
  commit({ ...initialState(), settings: state.settings, ...demoData(uid) });
}

// Empties everything: no classes, no attendance, PIN back to 1234.
export function resetAll() {
  commit(initialState());
}
