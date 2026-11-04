import { icon } from '../icons.js';
import {
  subscribe, classById, currentClass, dayRows, bellFor, scheduleFor, setDaySchedule, bellProblem, setOverride, markRestPresent,
  isFinalized, finalizeAttendance, undoFinalize, startKiosk, STATUSES,
} from '../store.js';
import { escapeHtml, todayKey, addDays, dayLabel, time12, timeLabel, parseTime } from '../format.js';
import { showTimeHint } from './timeinput.js';
import { toCsv, downloadCsv } from '../csv.js';
import { confirmDialog, openModal } from '../modal.js';

let date = todayKey();

const SEG = [['present', 'P'], ['late', 'L'], ['absent', 'A']];

// "Starts 8:00 AM · Ends 8:50 AM · Late after 8:05 AM · Absent after 8:15 AM", noting when the day was changed.
function bellSummary(cls, date) {
  const { startTime, endTime } = scheduleFor(cls, date);
  const { cutoffAt, absentAt } = bellFor(cls, date);
  const changed = cls.days?.[date] ? ' (changed for this day)' : '';
  const ends = endTime ? ` · Ends ${timeLabel(endTime)}` : '';
  const absent = absentAt === null ? '' : ` · Absent after ${time12(absentAt)}`;
  return `Starts ${timeLabel(startTime)}${changed}${ends} · Late after ${time12(cutoffAt)}${absent}`;
}

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
          <span class="stat-sub">${escapeHtml(bellSummary(cls, date))}</span>
          <button class="btn-link" id="day-times">Change times</button>
          <span class="spacer"></span>
          <button class="btn-secondary" id="rest" ${count('absent') + count('notyet') ? '' : 'disabled'}>${icon('check')}Mark rest present</button>
          ${isToday ? `<button class="btn-secondary" id="finalize">${isFinalized(cls.id, date) ? 'Undo finalization' : 'Finalize attendance'}</button>` : ''}
        </div>
        ${rows.length ? `
          <table class="table">
            <thead><tr><th>Student</th><th>Checked in</th><th>Minutes late</th><th class="status-col">Status</th></tr></thead>
            <tbody>
              ${rows.map((r) => `
                <tr>
                  <td class="student-name">${escapeHtml(r.student.name)}</td>
                  <td class="tabular muted">${r.checkIn ? escapeHtml(time12(r.checkIn.at)) : '—'}</td>
                  <td class="tabular muted">${r.minutesLate ?? '—'}</td>
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
    } else if (t.id === 'finalize') {
      const cls = currentClass();
      if (isFinalized(cls.id, date)) return undoFinalize(cls.id, date);
      const ok = await confirmDialog({
        title: 'Finalize attendance?',
        message: 'Everyone who hasn’t checked in will be marked Absent. Check-ins and edits stay as they are, and you can undo this.',
        confirmLabel: 'Mark absent',
      });
      if (ok) finalizeAttendance(cls.id, date);
    } else if (t.id === 'day-times') {
      dayTimesDialog(currentClass(), date);
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

// Different times for one date, such as an assembly or a shortened day.
function dayTimesDialog(cls, date) {
  const usual = { startTime: cls.startTime, endTime: cls.endTime ?? null, lateMinutes: cls.lateMinutes, absentMinutes: cls.absentMinutes ?? null };
  const now = scheduleFor(cls, date);
  const changed = !!cls.days?.[date];
  openModal({
    title: `Times for ${dayLabel(date)}`,
    className: 'modal-sm',
    render(body, close) {
      body.innerHTML = `
        <form class="form" novalidate>
          <label class="field">
            <span>Start time</span>
            <input name="time" type="text" autocomplete="off" placeholder="8:00 AM" value="${escapeHtml(timeLabel(now.startTime))}" autofocus>
          </label>
          <p class="hint" id="time-hint"></p>
          <label class="field">
            <span>End time (optional)</span>
            <input name="end" type="text" autocomplete="off" placeholder="8:50 AM" value="${now.endTime ? escapeHtml(timeLabel(now.endTime)) : ''}">
          </label>
          <p class="hint" id="end-hint"></p>
          <label class="field">
            <span>Late after (minutes)</span>
            <input name="late" type="number" min="0" max="60" step="1" inputmode="numeric" value="${now.lateMinutes}">
          </label>
          <label class="field">
            <span>Absent after (minutes, optional)</span>
            <input name="absent" type="number" min="1" max="240" step="1" inputmode="numeric" placeholder="Never" value="${now.absentMinutes ?? ''}">
          </label>
          <p class="hint">Only for this day. The usual times are ${escapeHtml(timeLabel(usual.startTime))}${usual.endTime ? `–${escapeHtml(timeLabel(usual.endTime))}` : ''}, late after ${usual.lateMinutes} min${usual.absentMinutes ? `, absent after ${usual.absentMinutes} min` : ''}.</p>
          <p class="field-error" hidden></p>
          <div class="modal-actions">
            ${changed ? '<button type="button" class="btn-link" data-a="usual">Use usual times</button>' : ''}
            <span class="spacer"></span>
            <button type="button" class="btn-secondary" data-a="cancel">Cancel</button>
            <button type="submit" class="btn-primary">Save</button>
          </div>
        </form>`;
      const form = body.querySelector('form');
      const errorEl = form.querySelector('.field-error');
      showTimeHint(form.time, form.querySelector('#time-hint'));
      showTimeHint(form.end, form.querySelector('#end-hint'), { label: 'Ends at', optional: true });

      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const startTime = parseTime(form.time.value);
        const lateMinutes = Number(form.late.value);
        const absentText = form.absent.value.trim();
        const absentMinutes = absentText === '' ? null : Number(absentText);
        const endText = form.end.value.trim();
        const endTime = endText === '' ? null : parseTime(endText);
        const error = !startTime ? 'Type a start time like 8:00 AM.'
          : endText !== '' && !endTime ? 'Type an end time like 8:50 AM, or leave it empty.'
          : bellProblem({ startTime, endTime, lateMinutes, absentMinutes });
        errorEl.textContent = error;
        errorEl.hidden = !error;
        if (error) return;
        const same = startTime === usual.startTime && endTime === usual.endTime
          && lateMinutes === usual.lateMinutes && absentMinutes === usual.absentMinutes;
        setDaySchedule(cls.id, date, same ? null : { startTime, endTime, lateMinutes, absentMinutes });
        close();
      });

      body.addEventListener('click', (e) => {
        const a = e.target.closest('[data-a]')?.dataset.a;
        if (a === 'cancel') close();
        if (a === 'usual') { setDaySchedule(cls.id, date, null); close(); }
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
    r.minutesLate ?? '',
  ]);
  const slug = cls.name.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  downloadCsv(`attendance-${slug || 'class'}-${day}.csv`, toCsv(['Date', 'Class', 'Student', 'Status', 'Check-in time', 'Minutes late'], rows));
}
