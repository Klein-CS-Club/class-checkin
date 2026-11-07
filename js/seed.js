// Demo data: made-up names only. Real students get added on the device.
import { addDays, todayKey } from './format.js';

const LATE_MINUTES = 5;

const CLASSES = [
  {
    name: 'Period 1 · English 9',
    startTime: '08:00',
    endTime: '08:50',
    students: [
      'Maya Johnson', 'Liam Carter', 'Sofía Ramírez', 'Noah Kim', 'Ava Thompson', 'Ethan Brooks',
      'Zoë Bennett', 'Lucas Nguyen', 'Chloe Martin', 'Mateo Alvarez', 'Harper Lewis', 'Owen Patel',
      'Isabella Rossi', 'Elijah Woods', 'Grace Chen', 'Jayden Scott', 'Amara Okafor', 'Leo Fischer',
    ],
  },
  {
    name: 'Period 2 · English 10',
    startTime: '08:55',
    endTime: '09:45',
    students: [
      'José Hernández', 'Emma Wilson', 'Aiden Murphy', 'Priya Shah', 'Caleb Turner', 'Lily Anderson',
      'Đức Trần', 'Nora Hughes', 'Gabriel Silva', 'Mia Robinson', 'Samuel Price', 'Hana Sato',
      'Wyatt Cooper', 'Layla Haddad', 'Julian Ward', 'Ella Morgan',
    ],
  },
  {
    name: 'Period 4 · Creative Writing',
    startTime: '11:05',
    endTime: '11:55',
    students: [
      'Ruby Foster', 'Isaac Bell', 'Aaliyah Grant', 'Henry Walsh', 'Camila Ortiz', 'Miles Reed',
      'Thảo Phạm', 'Jack Sullivan', 'Zara Ahmed', 'Theo Larsen', 'Nina Kowalski', 'Ezra Cohen',
    ],
  },
];

// Small deterministic random, so the demo looks the same every time it loads.
function rng(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

// The 5 school days (Mon–Fri) before today.
function pastSchoolDays(n = 5) {
  const days = [];
  for (let key = addDays(todayKey(), -1); days.length < n; key = addDays(key, -1)) {
    const dow = new Date(`${key}T12:00:00`).getDay();
    if (dow !== 0 && dow !== 6) days.push(key);
  }
  return days;
}

export function demoData(uid) {
  const rand = rng(42);
  const classes = CLASSES.map((c) => ({
    id: uid(),
    name: c.name,
    startTime: c.startTime,
    endTime: c.endTime,
    lateMinutes: LATE_MINUTES,
    absentMinutes: null,
    days: {},
    students: c.students.map((name) => ({ id: uid(), name })),
  }));
  const days = pastSchoolDays();
  const checkIns = [];
  for (const date of days) {
    for (const c of classes) {
      const [h, m] = c.startTime.split(':').map(Number);
      const cutoff = h * 60 + m + c.lateMinutes; // minutes after midnight
      for (const s of c.students) {
        const r = rand();
        if (r < 0.08) continue; // absent
        // Most arrive in the 10 minutes before the bell; about 1 in 8 is a few minutes late.
        const offset = r > 0.88 ? 1 + Math.floor(rand() * 9) : -Math.floor(rand() * 10);
        const at = new Date(`${date}T12:00:00`);
        at.setHours(0, cutoff + offset, Math.floor(rand() * 60), 0);
        checkIns.push({ id: uid(), classId: c.id, studentId: s.id, date, at: at.getTime() });
      }
    }
  }
  return { classes, checkIns, overrides: {}, trips: demoTrips(classes, checkIns, days, uid) };
}

const minutesOf = (hm) => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };
const atMinute = (date, minutes) => new Date(`${date}T12:00:00`).setHours(0, minutes, 0, 0);

// Finished restroom trips (3 to 8 minutes) on the past days, one student out at a time, inside the 10:10 rule, by
// students who had already checked in. Two days back one student goes twice; three days back the
// first trip was a teacher override. A separate random stream keeps the check-ins above unchanged.
function demoTrips(classes, checkIns, days, uid) {
  const rand = rng(7);
  const trips = [];
  for (const c of classes) {
    const close = minutesOf(c.endTime) - 10;
    days.forEach((date, daysBack) => {
      let at = minutesOf(c.startTime) + 10 + Math.floor(rand() * 8);
      const count = daysBack === 1 || rand() < 0.5 ? 3 : 2;
      let first = null;
      for (let i = 0; i < count; i += 1) {
        const length = 3 + Math.floor(rand() * 6);
        if (at + length > close) break;
        const here = checkIns.filter((x) => x.classId === c.id && x.date === date && x.at <= atMinute(date, at));
        if (!here.length) break;
        const studentId = daysBack === 1 && i === 2 && first ? first : here[Math.floor(rand() * here.length)].studentId;
        first ??= studentId;
        trips.push({
          id: uid(),
          sessionId: `${c.id}|${date}`,
          classId: c.id,
          studentId,
          departedAt: atMinute(date, at),
          returnedAt: atMinute(date, at + length),
          overrideReason: daysBack === 2 && i === 0 ? 'Nurse pass' : '',
        });
        at += length + 1 + Math.floor(rand() * 4);
      }
    });
  }
  return trips;
}
