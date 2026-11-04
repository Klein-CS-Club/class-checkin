// Dates are the device's local date as "YYYY-MM-DD"; times are "HH:mm" (24-hour).

const pad = (n) => String(n).padStart(2, '0');

export const dateKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const todayKey = () => dateKey();

// "2026-10-23" + 1 → "2026-10-24". Noon avoids daylight-saving edges.
export function addDays(key, n) {
  const d = new Date(`${key}T12:00:00`);
  d.setDate(d.getDate() + n);
  return dateKey(d);
}

// "HH:mm" of a timestamp, in local time.
export const hhmm = (ms) => {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// The moment "HH:mm" happens on a local date key.
export const atTime = (date, hm) => new Date(`${date}T${hm}:00`).getTime();

// "8:05 AM"
export const time12 = (ms) => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

// What someone types for a time → "HH:mm", or null when it isn't a time.
// "8", "8:05", "8:05 am", "2:30pm" and "1430" all work. With no am or pm, 7 to 11 mean morning and
// 1 to 6 mean afternoon (classes don't start at 3 AM), 12 is noon, and 13 to 23 are 24-hour times.
export function parseTime(text) {
  const match = /^(\d{1,2})(?::?(\d{2}))?\s*(?:([ap])\.?m?\.?)?$/i.exec(String(text).trim());
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  const half = match[3]?.toLowerCase();
  if (minute > 59) return null;
  if (half) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (half === 'p' ? 12 : 0);
  } else if (hour >= 1 && hour <= 6) {
    hour += 12;
  }
  return hour > 23 ? null : `${pad(hour)}:${pad(minute)}`;
}

// "08:05" → "8:05 AM"
export const timeLabel = (hm) => time12(new Date(`2000-01-01T${hm}:00`).getTime());

// "Fri, Oct 23"
export const dayLabel = (key) =>
  new Date(`${key}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

export const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
