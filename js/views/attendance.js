import { icon } from '../icons.js';
import { subscribe, classById, currentClass, dayRows, bellFor, startTimeFor, setDayStart, setOverride, markRestPresent, startKiosk, STATUSES } from '../store.js';
import { escapeHtml, todayKey, addDays, dayLabel, time12, timeLabel } from '../format.js';
import { toCsv, downloadCsv } from '../csv.js';
import { confirmDialog, openModal } from '../modal.js';

let date = todayKey();

const SEG = [['present', 'P'], ['late', 'L'], ['absent', 'A']];

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
    </div>`;

  const bodyEl = el.querySelector('#body');
  const dateEl = el.querySelector('#date');

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
          <span class="stat-sub">Starts ${escapeHtml(timeLabel(startTimeFor(cls, date)))}${cls.dayStarts?.[date] ? ' (changed for this day)' : ''} · Late after ${escapeHtml(time12(bellFor(cls, date).cutoffAt))}</span>
          <button class="btn-link" id="day-start">Change start time</button>
          <span class="spacer"></span>
          <button class="btn-link" id="rest" ${count('absent') + count('notyet') ? '' : 'disabled'}>${icon('check')}Mark rest present</button>
        </div>
        ${rows.length ? `
          <table class="table">
            <thead><tr><th>Student</th><th>Checked in</th><th class="status-col">Status</th></tr></thead>
            <tbody>
              ${rows.map((r) => `
                <tr>
                  <td class="student-name">${escapeHtml(r.student.name)}</td>
                  <td class="tabular muted">${r.checkIn ? escapeHtml(time12(r.checkIn.at)) : '—'}</td>
                  <td class="status-col">
                    <div class="status-cell">
                      ${r.overridden ? `<button class="edited-undo" data-student="${r.student.id}" data-status="" aria-label="Undo edit for ${escapeHtml(r.student.name)}" title="Go back to the automatic status">Edited · Undo${icon('close')}</button>` : ''}
                      <div class="seg" role="group" aria-label="Status for ${escapeHtml(r.student.name)}">
                        ${SEG.map(([s, short]) => `<button class="seg-${s}" data-student="${r.student.id}" data-status="${s}" aria-pressed="${r.status === s}" title="${STATUSES[s]}">${short}</button>`).join('')}
                      </div>
                      <span class="status-text status-${r.status}">${STATUSES[r.status]}</span>
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
    } else if (t.dataset.student) {
      setOverride(currentClass().id, date, t.dataset.student, t.dataset.status || null);
    } else if (t.id === 'rest') {
      const ok = await confirmDialog({
        title: 'Mark the rest present?',
        message: 'Everyone still marked Absent or Not yet will be marked Present for this day.',
        confirmLabel: 'Mark present',
      });
      if (ok) markRestPresent(currentClass().id, date);
    } else if (t.id === 'day-start') {
      dayStartDialog(currentClass(), date);
    } else if (t.id === 'export') {
      exportDay(currentClass().id, date);
    } else if (t.id === 'kiosk') {
      startKiosk(currentClass().id);
    }
  });

  dateEl.addEventListener('change', () => {
    if (dateEl.value) { date = dateEl.value; render(); }
  });

  render();
  return subscribe(render);
}

// A different start time for one date, such as an assembly or a shortened day.
function dayStartDialog(cls, date) {
  const changed = !!cls.dayStarts?.[date];
  openModal({
    title: `Start time for ${dayLabel(date)}`,
    className: 'modal-sm',
    render(body, close) {
      body.innerHTML = `
        <form class="form" novalidate>
          <label class="field">
            <span>Start time</span>
            <input name="time" type="time" value="${startTimeFor(cls, date)}" autofocus>
          </label>
          <p class="hint">Only for this day. The usual start time is ${escapeHtml(timeLabel(cls.startTime))},
            and arrivals more than ${cls.lateMinutes} min after the start still count as late.</p>
          <p class="field-error" hidden></p>
          <div class="modal-actions">
            ${changed ? '<button type="button" class="btn-link" data-a="usual">Use usual time</button>' : ''}
            <span class="spacer"></span>
            <button type="button" class="btn-secondary" data-a="cancel">Cancel</button>
            <button type="submit" class="btn-primary">Save</button>
          </div>
        </form>`;
      const form = body.querySelector('form');
      const errorEl = form.querySelector('.field-error');

      form.addEventListener('submit', (e) => {
        e.preventDefault();
        errorEl.hidden = !!form.time.value;
        errorEl.textContent = 'Pick a start time.';
        if (!form.time.value) return;
        setDayStart(cls.id, date, form.time.value === cls.startTime ? null : form.time.value);
        close();
      });

      body.addEventListener('click', (e) => {
        const a = e.target.closest('[data-a]')?.dataset.a;
        if (a === 'cancel') close();
        if (a === 'usual') { setDayStart(cls.id, date, null); close(); }
      });
    },
  });
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
