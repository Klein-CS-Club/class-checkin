import { todayKey, hhmm } from './format.js';
import { compareByName, sameName, tidyName } from './names.js';
import { demoData } from './seed.js';

const KEY = 'class-checkin-v1';
import { validZone, schoolDate, schoolTime, sessionId, sessionSchedule, validateSchedule, validDate } from './session.js';

// crypto.randomUUID needs https, and a tablet on the LAN may load the app over plain http.
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export const STATUSES = {
  present: 'Present',
  late: 'Late',
  absent: 'Absent',
  notyet: 'Not yet checked in',
};

function initialState() {
  return {
    settings: { pin: '1234', sidebarExpanded: true, timezone: '', capacity: 1, restrictionMinutes: 10 },
    version: 2, trips: [], queue: [], finalized: {}, selectedDate: null, demoClock: null,
    currentClassId: null, // the period picked in the sidebar
    classes: [],     // [{ id, name, lateAfter: 'HH:mm', students: [{ id, name }] }]
    checkIns: [],    // [{ id, classId, studentId, date: 'YYYY-MM-DD', at: ms }]
    overrides: {},   // { 'classId|date|studentId': 'present' | 'late' | 'absent' }
    kiosk: null,     // { classId } while the check-in screen is locked on
  };
}

let recoveryRequired = false;

// First run starts with demo classes so there's something to try.
function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved) {
      const base = initialState();
      return migrate({ ...base, ...saved, settings: { ...base.settings, ...saved.settings } });
    }
  } catch { recoveryRequired = true; /* Preserve unreadable storage until an explicit reset. */ }
  return migrate({ ...initialState(), ...demoData(uid) });
}

function migrate(saved) {
  const used = new Set();
  saved.classes.forEach(c => c.students.forEach(s => {
    if (!/^[A-Z0-9-]{3,40}$/.test(s.scanId ?? '') || used.has(s.scanId)) s.scanId = 'S-' + uid().toUpperCase();
    used.add(s.scanId);
  }));
  saved.checkIns = saved.checkIns.map(x => ({...x, sessionId: sessionId(x.classId,x.date)}));
  return {...saved,version:2};
}
let state = load();
let storageError = recoveryRequired ? 'Stored data could not be read. The original storage is preserved; export or recover it before using Erase all in Settings.' : '';
export const getStorageError = () => storageError;
const listeners = new Set();
try {
  if (recoveryRequired) throw Error('Recovery required');
  const original = localStorage.getItem(KEY);
  if (original && JSON.parse(original).version !== 2 && !localStorage.getItem(KEY+'-backup')) localStorage.setItem(KEY+'-backup',original);
  localStorage.setItem(KEY,JSON.stringify(state));
} catch { if (!recoveryRequired) storageError = 'Browser storage is unavailable. Changes may not survive a reload.'; }

function commit(next) {
  state = next;
  try { if (recoveryRequired) throw Error('Recovery required'); localStorage.setItem(KEY, JSON.stringify(state)); storageError = ''; } catch { if (!recoveryRequired) storageError = 'Changes could not be saved. Export your data and free browser storage before reloading.'; }
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
export function addClass(name, lateAfter) {
  const cls = { id: uid(), name, lateAfter, students: [] };
  commit({ ...state, classes: [...state.classes, cls] });
  return cls.id;
}

export function updateClass(id, patch) {
  if (patch.schedule) validateSchedule(patch.schedule);
  commit({ ...state, classes: state.classes.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
}

export function deleteClass(id) {
  commit({
    ...state,
    classes: state.classes.filter((c) => c.id !== id),
    trips: state.trips.filter(t=>t.classId!==id), queue: state.queue.filter(q=>q.classId!==id),
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
    added.push({ id: uid(), name, scanId: 'S-' + uid().toUpperCase() });
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
    trips: state.trips.filter(t=>!(t.classId===classId && t.studentId===studentId)), queue: state.queue.filter(t=>!(t.classId===classId && t.studentId===studentId)),
    overrides: Object.fromEntries(
      Object.entries(state.overrides).filter(([k]) => !(k.startsWith(`${classId}|`) && k.endsWith(`|${studentId}`)))),
  });
}

// ---------- Check-ins ----------
const findCheckIn = (classId, date, studentId) =>
  state.checkIns.find((x) => x.classId === classId && x.date === date && x.studentId === studentId);

// Recorded by student id. A second check-in on the same day saves nothing new.
export function checkIn(classId, studentId, date = selectedDate(), at = nowFor(classId)) {
  const cls = classById(classId);
  if (!cls?.students.some(s=>s.id===studentId)) return {kind:'error',message:'Student is not enrolled in this class.'};
  const zone = zoneFor(cls);
  if (!zone) return {kind:'error',message:'Set the school timezone in Settings first.'};
  if (!sessionSchedule(cls,date,zone)) return {kind:'error',message:'Configure this period’s bell schedule first.'};
  const existing = findCheckIn(classId, date, studentId);
  if (existing) return { kind: 'already', checkIn: existing, message:'Already checked in. Original arrival preserved.' };
  if (schoolDate(at,zone)!==date) return {kind:'error',message:'Historical attendance: use a status-only override; no arrival time will be invented.'};
  const entry = { id: uid(), classId, studentId, date, sessionId:sessionId(classId,date), at };
  commit({ ...state, checkIns: [...state.checkIns, entry] });
  return { kind: 'recorded', checkIn: entry, message:'Arrival recorded.' };
}

export function undoCheckIn(id) {
  commit({ ...state, checkIns: state.checkIns.filter((x) => x.id !== id) });
}

export const isCheckedIn = (classId, studentId, date = selectedDate()) => !!findCheckIn(classId, date, studentId);

// ---------- Status (derived, never stored) ----------
const overrideKey = (classId, date, studentId) => `${classId}|${date}|${studentId}`;

// Manual status overrides win. Unchecked students become absent only after finalization.
export function statusFor(cls, date, studentId) {
  const override = state.overrides[overrideKey(cls.id,date,studentId)];
  if (override) return override;
  const entry = findCheckIn(cls.id,date,studentId);
  if (!entry) return state.finalized[sessionId(cls.id,date)] ? 'absent' : 'notyet';
  const schedule = sessionSchedule(cls,date,zoneFor(cls));
  if (schedule) return entry.at <= schedule.cutoffAt ? 'present' : 'late';
  return (zoneFor(cls) ? schoolTime(entry.at,zoneFor(cls)) : hhmm(entry.at)) <= cls.lateAfter ? 'present' : 'late';
}
export function minutesLate(cls,date,studentId) {
  const entry = findCheckIn(cls.id,date,studentId), schedule=sessionSchedule(cls,date,zoneFor(cls));
  return !entry || !schedule ? null : entry.at <= schedule.cutoffAt ? 0 : Math.ceil((entry.at-schedule.startAt)/60000);
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

// How many students are here today (present or late, overrides included).
export function hereToday(classId) {
  return dayRows(classId, schoolToday(classById(classId))).filter((r) => r.status === 'present' || r.status === 'late').length;
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
  commit({ ...state, currentClassId:classId, selectedDate:schoolToday(classById(classId)), kiosk: { classId } });
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
export function loadDemo() { return ensurePeriod7(); }

// Empties everything: no classes, no attendance, PIN back to 1234.
export function resetAll() {
  recoveryRequired = false;
  commit(initialState());
}

// Session context survives tab changes and reloads. Only the demo uses the frozen clock.
export const zoneFor = cls => cls?.demo ? 'America/Chicago' : (validZone(state.settings.timezone) ? state.settings.timezone : null);
export const nowFor = classId => classById(classId)?.demo && state.demoClock != null ? state.demoClock : Date.now();
export const schoolToday = cls => zoneFor(cls) ? schoolDate(nowFor(cls?.id),zoneFor(cls)) : todayKey();
export const selectedDate = () => state.selectedDate ?? schoolToday(currentClass());
export function selectDate(date) { if (validDate(date)) commit({...state,selectedDate:date}); }
export function saveSettings(patch) {
  if (!validZone(patch.timezone)) throw Error('Enter a valid IANA timezone, such as America/Chicago.');
  if (!Number.isInteger(patch.capacity) || patch.capacity<1 || patch.capacity>50) throw Error('Capacity must be 1–50 students.');
  if (!Number.isInteger(patch.restrictionMinutes) || patch.restrictionMinutes<0 || patch.restrictionMinutes>120) throw Error('Restriction must be 0–120 minutes; use 0 to disable.');
  commit({...state,settings:{...state.settings,...patch}});
}
export function finalizeAttendance(classId,date) { commit({...state,finalized:{...state.finalized,[sessionId(classId,date)]:true}}); }
export function undoFinalize(classId,date) { const finalized={...state.finalized}; delete finalized[sessionId(classId,date)]; commit({...state,finalized}); }
export function currentPeriod() {
  return state.classes.find(c=>!c.demo && (()=>{const at=nowFor(c.id),z=zoneFor(c); if (!z) return false; const s=sessionSchedule(c,schoolDate(at,z),z); return s && at>=s.startAt && at<s.endAt;})());
}
export const rulesFor = cls => cls.demo ? {capacity:1,restrictionMinutes:10,...cls.restroomRules} : state.settings;
export function restroomSummary(classId,date,at=nowFor(classId)) {
  const sid=sessionId(classId,date),trips=state.trips.filter(t=>t.sessionId===sid),queue=state.queue.filter(q=>q.sessionId===sid);
  const active=trips.filter(t=>t.returnedAt==null),completed=trips.filter(t=>t.returnedAt!=null);
  const completedMs=completed.reduce((n,t)=>n+t.returnedAt-t.departedAt,0);
  return {trips,queue,active,completed,unique:new Set(trips.map(t=>t.studentId)).size,completedMs,liveMs:completedMs+active.reduce((n,t)=>n+Math.max(0,at-t.departedAt),0)};
}
export function departureEligibility(classId,date,studentId,at=nowFor(classId)) {
  const cls=classById(classId),zone=zoneFor(cls),schedule=sessionSchedule(cls,date,zone);
  if (!cls?.students.some(s=>s.id===studentId)) return 'Student is not enrolled in this class.';
  if (!schedule) return 'Configure a school timezone and bell schedule first.';
  const earlier=state.trips.find(t=>t.studentId===studentId && t.returnedAt==null && t.sessionId!==sessionId(classId,date));
  if (earlier) return `Unresolved trip in session ${earlier.sessionId}. Open that date and mark returned first.`;
  if (schoolDate(at,zone)!==date) return 'Departures can only be recorded for the current school date.';
  if (at<schedule.startAt) return 'Class has not started.';
  if (at>=schedule.endAt) return 'Class has ended. Resolve outstanding trips; no new ordinary departures.';
  const opens=schedule.startAt+rulesFor(cls).restrictionMinutes*60000;
  if (at<opens) return `Departures available in ${Math.ceil((opens-at)/1000)}s (first ${rulesFor(cls).restrictionMinutes} minutes). Requests are welcome.`;
  const sum=restroomSummary(classId,date,at);
  if (sum.active.length>=rulesFor(cls).capacity) return 'Restroom capacity is full.';
  if (sum.queue.length && sum.queue[0].studentId!==studentId) return 'Waiting students have priority. Join the queue.';
  return '';
}
const result = (kind,message) => ({kind,message});
export function requestRestroom(classId,date,studentId) {
  const cls=classById(classId),at=nowFor(classId),zone=zoneFor(cls);
  if (!cls?.students.some(s=>s.id===studentId)) return result('error','Student is not enrolled in this class.');
  if (!zone || !sessionSchedule(cls,date,zone)) return result('error','Configure a school timezone and bell schedule first.');
  if (schoolDate(at,zone)!==date) return result('error','Requests can only be recorded for the current school date.');
  const sum=restroomSummary(classId,date);
  const active=state.trips.find(t=>t.studentId===studentId && t.returnedAt==null);
  if (active) return result('already',`Student is already out (session ${active.sessionId}).`);
  if (sum.queue.some(q=>q.studentId===studentId)) return result('already','Student is already waiting.');
  const q={id:uid(),sessionId:sessionId(classId,date),classId,studentId,requestedAt:at};
  commit({...state,queue:[...state.queue,q]});
  return result('waiting','Request added to the waiting list. Confirm Mark out when the student leaves.');
}
export function markOut(classId,date,studentId,reason='') {
  const cls=classById(classId),at=nowFor(classId),zone=zoneFor(cls);
  if (!cls?.students.some(s=>s.id===studentId)) return result('error','Student is not enrolled in this class.');
  const sum=restroomSummary(classId,date);
  const active=state.trips.find(t=>t.studentId===studentId && t.returnedAt==null);
  if (active) return result('already',`Student is already out (session ${active.sessionId}).`);
  const blocked=departureEligibility(classId,date,studentId,at);
  if (blocked && !reason.trim()) return result('error',blocked);
  // Overrides bypass capacity, queue, and opening restriction, never historical dates or missing schedules.
  if (!zone || !sessionSchedule(cls,date,zone) || schoolDate(at,zone)!==date) return result('error','Configure this session and select the current school date.');
  const trip={id:uid(),sessionId:sessionId(classId,date),classId,studentId,departedAt:at,returnedAt:null,durationMs:null,teacherOverride:!!reason.trim(),overrideReason:reason.trim()};
  commit({...state,trips:[...state.trips,trip],queue:state.queue.filter(q=>!(q.sessionId===trip.sessionId && q.studentId===studentId))});
  return result('out',reason.trim()?'Marked out with documented teacher override.':'Marked out.');
}
export function markReturned(classId,date,studentId) {
  const at=nowFor(classId),sum=restroomSummary(classId,date),trip=sum.active.find(t=>t.studentId===studentId);
  if (!trip) return result('error','No active trip in this session. Check the selected period and date.');
  if (at<trip.departedAt) return result('error','Return time is before departure. Advance the demo clock.');
  commit({...state,trips:state.trips.map(t=>t.id===trip.id?{...t,returnedAt:at,durationMs:at-t.departedAt}:t)});
  return result('returned','Marked returned. The next waiting student must confirm departure.');
}
export function cancelRequest(id) { commit({...state,queue:state.queue.filter(q=>q.id!==id)}); }
let lastScan=null;
export function scanStudent(classId,date,mode,identifier) {
  const id=identifier.trim().toUpperCase();
  if (!/^[A-Z0-9-]{3,40}$/.test(id)) return result('error','Invalid identifier. Scan a printed label or use manual lookup.');
  const cls=classById(classId),student=cls?.students.find(s=>s.scanId===id);
  if (!student) return result('error',state.classes.some(c=>c.students.some(s=>s.scanId===id))?'Student is not enrolled in the selected class.':'Unknown identifier. Check the roster or use manual lookup.');
  const key=[classId,date,mode,id].join('|'),realNow=Date.now();
  if (lastScan?.key===key && realNow-lastScan.at<1500) return result('already',mode==='attendance'?'Already checked in (duplicate scan ignored).':'Duplicate scan ignored.');
  lastScan={key,at:realNow};
  let r;
  if (mode==='attendance') r=checkIn(classId,student.id,date);
  else if (mode==='return') r=markReturned(classId,date,student.id);
  else if (mode==='departure') {
    const sum=restroomSummary(classId,date);
    if (sum.active.some(t=>t.studentId===student.id)) r=result('already','Student is already out.');
    else if (!departureEligibility(classId,date,student.id)) r=markOut(classId,date,student.id);
    else r=requestRestroom(classId,date,student.id);
  } else r=result('error','Choose a scan mode.');
  return {...r,message:`${student.name}: ${r.message}`};
}
export function ensurePeriod7() {
  const existing=state.classes.find(c=>c.demo);
  if (existing) {commit({...state,currentClassId:existing.id,selectedDate:schoolToday(existing)});return existing.id;}
  const id=uid(),students=['Alex River','Jordan Bell','Sam Flores','Taylor Chen','Robin Park','Casey Reed'].map(name=>({id:uid(),name,scanId:'S-'+uid().toUpperCase()}));
  const cls={id,name:'Period 7 · DEMO',demo:true,lateAfter:'14:05',students,schedule:{grace:5,weekdays:Object.fromEntries([0,1,2,3,4,5,6].map(d=>[d,{start:'14:00',end:'15:00'}])),overrides:{}}};
  commit({...state,classes:[...state.classes,cls],currentClassId:id,selectedDate:'2026-10-26',demoClock:Date.parse('2026-10-26T18:59:00Z')});
  return id;
}
export function setDemoClock(at) {
  const cls=currentClass();
  if (!cls?.demo || !Number.isFinite(at)) return;
  if (state.trips.some(t=>t.classId===cls.id && (t.returnedAt??t.departedAt)>at)) throw Error('Reset the demo before moving its clock before existing trips.');
  commit({...state,demoClock:at});
}
export function resetPeriod7() {
  const cls=state.classes.find(c=>c.demo); if (!cls) return;
  commit({...state,classes:state.classes.filter(c=>c.id!==cls.id),checkIns:state.checkIns.filter(x=>x.classId!==cls.id),trips:state.trips.filter(x=>x.classId!==cls.id),queue:state.queue.filter(x=>x.classId!==cls.id),overrides:Object.fromEntries(Object.entries(state.overrides).filter(([k])=>!k.startsWith(cls.id+'|'))),finalized:Object.fromEntries(Object.entries(state.finalized).filter(([k])=>!k.startsWith(cls.id+'|')))});
  ensurePeriod7();
}
