import { icon } from '../icons.js';
import { getState, subscribe, classById, dayRows, setOverride, markRestPresent, startKiosk, STATUSES } from '../store.js';
import { escapeHtml, todayKey, addDays, dayLabel, time12, timeLabel } from '../format.js';
import { toCsv, downloadCsv } from '../csv.js';
import { confirmDialog } from '../modal.js';

let classId = null;
let date = todayKey();

const SEG = [['present', 'P'], ['late', 'L'], ['absent', 'A']];

export function renderAttendance(el) {
  const { classes } = getState();
  if (!classById(classId)) classId = classes[0]?.id ?? null;

  el.innerHTML = `
    <div class="page">
      <header class="page-head">
        <h1>Attendance</h1>
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
    </div>`;

  const bodyEl = el.querySelector('#body');
  const dateEl = el.querySelector('#date');

  function render() {
    const cls = classById(classId);
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
    const rows = dayRows(classId, date);
    const count = (s) => rows.filter((r) => r.status === s).length;
    const isToday = date === todayKey();
    bodyEl.innerHTML = `
      <div class="tabs" role="tablist">
        ${getState().classes.map((c) => `<button class="tab${c.id === classId ? ' active' : ''}" role="tab" aria-selected="${c.id === classId}" data-class="${c.id}">${escapeHtml(c.name)}</button>`).join('')}
      </div>
      <div class="stats-row">
        ${['present', 'late', 'absent', 'notyet'].map((s) => `
          <div class="stat-card">
            <div class="stat-label">${STATUSES[s]}</div>
            <div class="stat-value status-${s}">${count(s)}</div>
          </div>`).join('')}
      </div>
      <section class="panel">
        <div class="panel-head">
          <h2>${escapeHtml(dayLabel(date))}${isToday ? ' · Today' : ''}</h2>
          <span class="stat-sub">Late after ${escapeHtml(timeLabel(cls.lateAfter))}</span>
          <span class="spacer"></span>
          <button class="btn-link" id="rest" ${count('absent') + count('notyet') ? '' : 'disabled'}>${icon('check')}Mark rest present</button>
        </div>
        ${rows.length ? `
          <table class="table">
            <thead><tr><th>Student</th><th>Checked in</th><th>Status</th></tr></thead>
            <tbody>
              ${rows.map((r) => `
                <tr>
                  <td class="student-name">${escapeHtml(r.student.name)}</td>
                  <td class="tabular muted">${r.checkIn ? escapeHtml(time12(r.checkIn.at)) : '—'}</td>
                  <td>
                    <div class="status-cell">
                      <div class="seg" role="group" aria-label="Status for ${escapeHtml(r.student.name)}">
                        ${SEG.map(([s, short]) => `<button class="seg-${s}" data-student="${r.student.id}" data-status="${s}" aria-pressed="${r.status === s}" title="${STATUSES[s]}">${short}</button>`).join('')}
                      </div>
                      <span class="status-text status-${r.status}">${STATUSES[r.status]}</span>
                      ${r.overridden ? `<button class="btn-link auto" data-student="${r.student.id}" data-status="" title="Go back to the automatic status">Edited · Undo</button>` : ''}
                    </div>
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>`
        : '<div class="panel-empty">No students in this class yet. <a href="#/classes">Add students</a>.</div>'}
      </section>`;
  }

  el.querySelector('.page').addEventListener('click', async (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.step) {
      date = addDays(date, Number(t.dataset.step));
      render();
    } else if (t.dataset.class) {
      classId = t.dataset.class;
      render();
    } else if (t.dataset.student) {
      setOverride(classId, date, t.dataset.student, t.dataset.status || null);
    } else if (t.id === 'rest') {
      const ok = await confirmDialog({
        title: 'Mark the rest present?',
        message: 'Everyone still marked Absent or Not yet will be marked Present for this day.',
        confirmLabel: 'Mark present',
      });
      if (ok) markRestPresent(classId, date);
    } else if (t.id === 'export') {
      exportDay(classId, date);
    } else if (t.id === 'kiosk') {
      startKiosk(classId);
    }
  });

  dateEl.addEventListener('change', () => {
    if (dateEl.value) { date = dateEl.value; render(); }
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
