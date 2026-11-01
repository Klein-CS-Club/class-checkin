// CSV in and out. The writer is ported from gdpt-checkin's lib/csv.ts.

// UTF-8 byte order mark, so Excel opens accented names correctly.
const BOM = '﻿';

function cell(value) {
  let text = value == null ? '' : String(value);
  // Spreadsheet apps run cells starting with these as formulas. Prefix a quote so
  // they stay plain text (guards against "CSV injection").
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  // Quote cells that contain commas, quotes or line breaks; double any quotes.
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// The full file contents (RFC 4180): BOM, header, rows, CRLF line endings.
export function toCsv(header, rows) {
  return BOM + [header, ...rows].map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n';
}

// Parses CSV text into rows of strings. Handles quoted cells, doubled quotes and CRLF.
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((f) => f.trim()));
}

// Student names from a roster CSV: the "Name" column if there's a header with one,
// "First" + "Last" columns if there are those, otherwise the first column.
export function namesFromCsv(text) {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (...names) => head.findIndex((h) => names.includes(h));
  const name = col('name', 'student', 'student name', 'full name');
  const first = col('first', 'first name', 'given name');
  const last = col('last', 'last name', 'family name', 'surname');
  if (name >= 0) return rows.slice(1).map((r) => r[name] ?? '');
  if (first >= 0 && last >= 0) return rows.slice(1).map((r) => `${r[first] ?? ''} ${r[last] ?? ''}`);
  return rows.map((r) => r[0]);
}

export const downloadCsv = (filename, text) => downloadFile(filename, text, 'text/csv;charset=utf-8');

// Saves text as a file through a Blob link, so nothing leaves the device.
export function downloadFile(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
