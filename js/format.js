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

// "8:05 AM"
export const time12 = (ms) => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

// "08:05" → "8:05 AM"
export const timeLabel = (hm) => time12(new Date(`2000-01-01T${hm}:00`).getTime());

// "Fri, Oct 23"
export const dayLabel = (key) =>
  new Date(`${key}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

export const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
