// School calendar helpers; all operational times use an explicitly configured zone.
export const validZone = zone => { try { new Intl.DateTimeFormat('en', { timeZone: zone }); return !!zone; } catch { return false; } };
export const schoolDate = (at, zone) => new Intl.DateTimeFormat('en-CA', {timeZone: zone, year:'numeric',month:'2-digit',day:'2-digit'}).format(at);
export const schoolTime = (at, zone) => new Intl.DateTimeFormat('en-GB', {timeZone:zone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(at);
export const validDate = date => /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date+'T12:00:00Z')) && new Date(date+'T12:00:00Z').toISOString().slice(0,10) === date;
export const validTime = time => /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
export const sessionId = (classId,date) => `${classId}|${date}`;
export function scheduleFor(cls,date) {
  const weekday = new Date(date+'T12:00:00Z').getUTCDay();
  return Object.hasOwn(cls.schedule?.overrides ?? {},date) ? cls.schedule.overrides[date] : cls.schedule?.weekdays?.[weekday] ?? null;
}
export function validateSchedule(schedule) {
  for (const s of [...Object.values(schedule.weekdays ?? {}),...Object.values(schedule.overrides ?? {})]) {
    if (s && (!validTime(s.start) || !validTime(s.end) || s.start >= s.end)) throw Error('Use valid same-day times, with end after start.');
  }
  for (const date of Object.keys(schedule.overrides ?? {})) if (!validDate(date)) throw Error('Choose a valid override date.');
  if (!Number.isInteger(schedule.grace) || schedule.grace < 0 || schedule.grace > 60) throw Error('Grace period must be 0–60 whole minutes.');
}
// Resolve local wall time via Intl. Reject nonexistent daylight-saving times.
export function zonedTimestamp(date,time,zone) {
  if (!validDate(date) || !validTime(time) || !validZone(zone)) throw Error('Set a valid school date, time and timezone.');
  const target = Date.parse(`${date}T${time}:00Z`);
  let at = target;
  for (let i=0;i<4;i++) {
    const represented = Date.parse(`${schoolDate(at,zone)}T${schoolTime(at,zone)}:00Z`);
    const delta = target-represented;
    if (!delta) return at;
    at += delta;
  }
  throw Error('This school time does not exist because of a daylight-saving change.');
}
export function sessionSchedule(cls,date,zone) {
  const s=scheduleFor(cls,date);
  if (!s || !validZone(zone)) return null;
  try {const start=zonedTimestamp(date,s.start,zone),end=zonedTimestamp(date,s.end,zone); return {...s,startAt:start,endAt:end,cutoffAt:start+(cls.schedule.grace??0)*60000};} catch {return null;}
}
export const duration = ms => { const sec=Math.max(0,Math.floor(ms/1000)); return `${Math.floor(sec/60)}m ${String(sec%60).padStart(2,'0')}s`; };
