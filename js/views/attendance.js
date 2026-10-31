import { icon } from '../icons.js';
import { subscribe, classById, currentClass, dayRows, setOverride, markRestPresent, startKiosk, STATUSES } from '../store.js';
import { escapeHtml, todayKey, addDays, dayLabel, time12, timeLabel } from '../format.js';
import { toCsv, downloadCsv } from '../csv.js';
import { confirmDialog } from '../modal.js';

let date = todayKey();

const SEG = [['present', 'P'], ['late', 'L'], ['absent', 'A']];

// Whether the Present list is open. A per-device preference, so it lives outside the store.
const OPEN_KEY = 'class-checkin-present-open';
let presentOpen = false;
try { presentOpen = localStorage.getItem(OPEN_KEY) === '1'; } catch { /* ignore */ }

// One student: name, status (with the check-in time when there is one), and the P / L / A override.
const row = (r) => `
  <div class="att-row">
    <span class="att-name">${escapeHtml(r.student.name)}</span>
    <span class="att-status status-${r.status}">${STATUSES[r.status]}${r.checkIn && r.status !== 'absent' ? ` <span class="att-time">· ${escapeHtml(time12(r.checkIn.at))}</span>` : ''}</span>
    <div class="status-cell">
      ${r.overridden ? `<button class="btn-link auto" data-student="${r.student.id}" data-status="" title="Go back to the automatic status">Edited · Undo</button>` : ''}
      <div class="seg" role="group" aria-label="Status for ${escapeHtml(r.student.name)}">
        ${SEG.map(([s, short]) => `<button class="seg-${s}" data-student="${r.student.id}" data-status="${s}" aria-pressed="${r.status === s}" title="${STATUSES[s]}">${short}</button>`).join('')}
      </div>
    </div>
  </div>`;

export function renderAttendance(el) {
  el.innerHTML = `
    <div class="page">
      <header class="page-head">
        <div class="page-title">
          <small>Attendance</small>
          <h1 id="title">Attendance</h1>
        </div>
        <span class="spacer"></span>
        <div class="date-step">
          <button class="action" data-step="-1" aria-label="Previous day">${icon('chevronLeft')}</button>
          <input type="date" id="date" aria-label="Date">
          <button class="action" data-step="1" aria-label="Next day">${icon('chevronRight')}</button>
        </div>
        <button class="btn-secondary" id="export">${icon('download')}Export CSV</button>
        <button class="btn-primary" id="kiosk">${icon('play')}Start check-in</button>
      </header>
      <div class="page-body" id="body"></div>
      <p class="sr-only" aria-live="polite" id="live"></p>
    </div>`;

  const bodyEl = el.querySelector('#body');
  const dateEl = el.querySelector('#date');
  const liveEl = el.querySelector('#live');
  // Students edited on this visit keep the place they started in, so a row doesn't jump out
  // from under the pointer. Maps student id to that starting status; cleared when the day changes.
  let pinned = new Map();
  let refocus = null; // { student, status } of the button to focus after the next render

  function setDate(value) {
    date = value;
    pinned = new Map();
    render();
  }

  function render() {
    // The period comes from the sidebar.
    const cls = currentClass();
    el.querySelector('#title').textContent = cls?.name ?? 'Attendance';
    dateEl.value = date;
    el.querySelector('#export').disabled = !cls;
    el.querySelector('#kiosk').disabled = !cls;
    if (!cls) {
      bodyEl.innerHTML = `
        <section class="panel"><div class="panel-empty">
          No classes yet. <a href="#/classes">Add a class</a> to start taking attendance.
        </div></section>`;
      return;
    }
    const rows = dayRows(cls.id, date);
    const count = (s) => rows.filter((r) => r.status === s).length;
    const isToday = date === todayKey();
    // Skyward assumes everyone is present, so the exceptions come first. dayRows is already in last-name order.
    const place = (r) => pinned.get(r.student.id) ?? r.status;
    const toMark = ['absent', 'late', 'notyet'].flatMap((s) => rows.filter((r) => place(r) === s));
    const present = rows.filter((r) => place(r) === 'present');
    bodyEl.innerHTML = `
      <div class="stats-row">
        ${['present', 'late', 'absent', 'notyet'].map((s) => `
          <div class="stat-card">
            <div class="stat-label">${STATUSES[s]}</div>
            <div class="stat-value status-${s}">${count(s)}</div>
          </div>`).join('')}
      </div>
      <section class="panel att-panel">
        <div class="panel-head">
          <h2>${escapeHtml(dayLabel(date))}${isToday ? ' · Today' : ''}</h2>
          <span class="stat-sub">Late after ${escapeHtml(timeLabel(cls.lateAfter))}</span>
          <span class="spacer"></span>
          <button class="btn-link" id="rest" ${count('absent') + count('notyet') ? '' : 'disabled'}>${icon('check')}Mark rest present</button>
        </div>
        ${rows.length ? `
          <h3 class="att-heading">Mark in Skyward</h3>
          ${toMark.length
            ? `<div class="att-list">${toMark.map(row).join('')}</div>`
            : '<p class="att-calm">Everyone’s here. Nothing to mark.</p>'}
          ${present.length ? `
            <button class="att-toggle" id="present-toggle" aria-expanded="${presentOpen}" aria-controls="present-list">
              ${icon('chevronRight')}Present (${present.length})
            </button>
            <div class="att-list" id="present-list" ${presentOpen ? '' : 'hidden'}>${present.map(row).join('')}</div>` : ''}`
        : '<div class="panel-empty">No students in this class yet. <a href="#/classes">Add students</a>.</div>'}
      </section>`;
    if (refocus) {
      const { student, status } = refocus;
      refocus = null;
      (bodyEl.querySelector(`[data-student="${student}"][data-status="${status}"]`)
        ?? bodyEl.querySelector(`[data-student="${student}"][aria-pressed="true"]`))?.focus();
    }
  }

  function override(studentId, status) {
    const cls = currentClass();
    const before = dayRows(cls.id, date).find((r) => r.student.id === studentId);
    if (!pinned.has(studentId)) pinned.set(studentId, before.status);
    refocus = { student: studentId, status };
    setOverride(cls.id, date, studentId, status || null);
    const after = dayRows(cls.id, date).find((r) => r.student.id === studentId);
    liveEl.textContent = status
      ? `${after.student.name} marked ${STATUSES[after.status]}`
      : `${after.student.name} back to ${STATUSES[after.status]}`;
  }

  el.querySelector('.page').addEventListener('click', async (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.step) {
      setDate(addDays(date, Number(t.dataset.step)));
    } else if (t.dataset.student) {
      override(t.dataset.student, t.dataset.status);
    } else if (t.id === 'present-toggle') {
      presentOpen = !presentOpen;
      try { localStorage.setItem(OPEN_KEY, presentOpen ? '1' : '0'); } catch { /* ignore */ }
      render();
      el.querySelector('#present-toggle').focus();
    } else if (t.id === 'rest') {
      const ok = await confirmDialog({
        title: 'Mark the rest present?',
        message: 'Everyone still marked Absent or Not yet will be marked Present for this day.',
        confirmLabel: 'Mark present',
      });
      if (ok) markRestPresent(currentClass().id, date);
    } else if (t.id === 'export') {
      exportDay(currentClass().id, date);
    } else if (t.id === 'kiosk') {
      startKiosk(currentClass().id);
    }
  });

  dateEl.addEventListener('change', () => {
    if (dateEl.value) setDate(dateEl.value);
  });

  render();
  return subscribe(render);
}

function exportDay(id, day) {
  const cls = classById(id);
  const rows = dayRows(id, day).map((r) => [
    day,
    cls.name,
    r.student.name,
    STATUSES[r.status],
    r.checkIn ? time12(r.checkIn.at) : '',
  ]);
  const slug = cls.name.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  downloadCsv(`attendance-${slug || 'class'}-${day}.csv`, toCsv(['Date', 'Class', 'Student', 'Status', 'Check-in time'], rows));
}
