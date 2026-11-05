import {
  restroomSummary, departureEligibility, closingProblem, rulesFor, requestRestroom, markOut, markReturned,
  cancelRequest, sortedStudents, todayFor, nowFor, bellFor, statusFor,
} from '../store.js';
import { escapeHtml, duration, time12 } from '../format.js';
import { openModal } from '../modal.js';

// The Restroom tab of the Attendance page. attendance.js owns the page and calls these.

// What the last action said, shown above the lists until the next one.
let notice = '';
export const clearRestroomNotice = () => { notice = ''; };

const nameOf = (cls, studentId) => cls.students.find((s) => s.id === studentId)?.name ?? 'Removed student';

// Time a student has spent out today, counting a trip that hasn't ended yet.
const msOut = (sum, studentId, at) => sum.trips
  .filter((t) => t.studentId === studentId)
  .reduce((total, t) => total + Math.max(0, (t.returnedAt ?? at) - t.departedAt), 0);

export function ruleText(cls, date, at) {
  if (date !== todayFor(cls)) return 'Trips can only be started today. Students who are still out can be marked back.';
  const { startAt, endAt } = bellFor(cls, date);
  const { restrictionMinutes } = rulesFor(cls);
  if (at < startAt) return `Class starts at ${time12(startAt)}. Students can join the waitlist until then.`;
  const opensAt = startAt + restrictionMinutes * 60000;
  if (at < opensAt) return `Trips open at ${time12(opensAt)}. Students can join the waitlist until then.`;
  const closed = closingProblem(cls, date, at);
  if (closed) return `${closed} Students who are out can still come back.`;
  const until = endAt ? ` until ${time12(endAt - restrictionMinutes * 60000)}` : '';
  return `Trips are open${until}.`;
}

export function restroomHtml(cls, date) {
  const at = nowFor(cls.id);
  const sum = restroomSummary(cls.id, date, at);
  const isToday = date === todayFor(cls);
  const { capacity } = rulesFor(cls);
  const name = (id) => escapeHtml(nameOf(cls, id));
  const note = (t) => (t.overrideReason ? ` · Teacher override: ${escapeHtml(t.overrideReason)}` : '');

  const outRows = sum.active.map((t) => `
    <div class="list-row">
      <span class="list-text">
        <span class="list-title">${name(t.studentId)}</span>
        <span class="list-sub">Left ${time12(t.departedAt)} · <span data-since="${t.departedAt}"></span>${note(t)}</span>
      </span>
      <button class="btn-primary" data-r="return" data-student="${t.studentId}">I’m back</button>
    </div>`).join('');

  const outPanel = `
    <section class="panel trip-list">
      <div class="panel-head"><h2>Out now</h2><span class="stat-sub">${sum.active.length} of ${capacity} allowed</span></div>
      ${outRows || '<div class="panel-empty">Everyone is in class.</div>'}
    </section>`;

  const waitRows = sum.queue.map((q, i) => `
    <div class="list-row">
      <span class="list-text">
        <span class="list-title">${i + 1}. ${name(q.studentId)}</span>
        <span class="list-sub">Asked ${time12(q.requestedAt)} · waiting <span data-since="${q.requestedAt}"></span></span>
      </span>
      <button class="btn-primary" data-r="out" data-go data-student="${q.studentId}">Go now</button>
      <button class="btn-link" data-r="override" data-student="${q.studentId}">Override</button>
      <button class="btn-link" data-r="cancel" data-id="${q.id}" aria-label="Remove ${name(q.studentId)} from the waitlist">Remove</button>
    </div>`).join('');

  const waitPanel = `
    <section class="panel trip-list">
      <div class="panel-head"><h2>Waitlist</h2><span class="stat-sub">First asked, first out</span></div>
      ${waitRows || '<div class="panel-empty">No one is waiting.</div>'}
    </section>`;

  // Students who are out come back from the Out now list, so their row here just says where they are.
  const studentRows = sortedStudents(cls).map((s) => {
    const out = sum.active.some((t) => t.studentId === s.id);
    const place = sum.queue.findIndex((q) => q.studentId === s.id);
    let action = '—';
    if (out) action = '<span class="muted">Out</span>';
    else if (place >= 0) action = `<span class="muted">Waiting · #${place + 1}</span>`;
    else if (isToday) {
      action = `<button class="btn-link" data-r="override" data-student="${s.id}">Override</button>
        <button class="btn-secondary" data-r="request" data-student="${s.id}">Send out</button>`;
    }
    // Not checked in (or absent): the name is grayed so it's clear who isn't in the room.
    const away = ['notyet', 'absent'].includes(statusFor(cls, date, s.id));
    return `
      <tr>
        <td class="student-name${away ? ' away' : ''}">${escapeHtml(s.name)}</td>
        <td class="tabular muted" data-label="Trips">${sum.trips.filter((t) => t.studentId === s.id).length}</td>
        <td class="tabular muted" data-label="Time out" data-out-for="${s.id}">${duration(msOut(sum, s.id, at))}</td>
        <td class="status-col"><div class="status-cell">${action}</div></td>
      </tr>`;
  }).join('');

  const studentsPanel = `
    <section class="panel">
      <div class="panel-head"><h2>Students</h2></div>
      ${cls.students.length ? `
        <table class="table">
          <thead><tr><th>Student</th><th>Trips</th><th>Time out</th><th class="status-col">Restroom</th></tr></thead>
          <tbody>${studentRows}</tbody>
        </table>` : '<div class="panel-empty">No students in this class yet.</div>'}
    </section>`;

  const doneRows = [...sum.completed].reverse().map((t) => `
    <div class="list-row">
      <span class="list-text">
        <span class="list-title">${name(t.studentId)}</span>
        <span class="list-sub">${time12(t.departedAt)} → ${time12(t.returnedAt)} · ${duration(t.returnedAt - t.departedAt)}${note(t)}</span>
      </span>
    </div>`).join('');

  const donePanel = `
    <section class="panel trip-list">
      <div class="panel-head"><h2>Completed trips</h2></div>
      ${doneRows || '<div class="panel-empty">Finished trips show up here.</div>'}
    </section>`;

  return `
    <p class="restroom-rule" id="r-rule">${escapeHtml(ruleText(cls, date, at))}</p>
    <p class="hint" role="status">${escapeHtml(notice)}</p>
    <div class="restroom-grid">
      <div class="restroom-col">${outPanel + waitPanel + donePanel}</div>
      <div class="restroom-col">${studentsPanel}</div>
    </div>`;
}

// Runs every second: updates timers and button states in place, so typing and focus aren't disturbed.
export function refreshRestroomLive(root, cls, date) {
  const at = nowFor(cls.id);
  const sum = restroomSummary(cls.id, date, at);
  root.querySelectorAll('[data-since]').forEach((n) => { n.textContent = duration(at - Number(n.dataset.since)); });
  root.querySelectorAll('[data-out-for]').forEach((n) => { n.textContent = duration(msOut(sum, n.dataset.outFor, at)); });
  const rule = root.querySelector('#r-rule');
  if (rule) rule.textContent = ruleText(cls, date, at);
  root.querySelectorAll('[data-go]').forEach((b) => {
    const reason = departureEligibility(cls.id, date, b.dataset.student, at);
    b.disabled = !!reason;
    b.title = reason;
  });
  root.querySelectorAll('[data-r="request"]').forEach((b) => {
    const reason = departureEligibility(cls.id, date, b.dataset.student, at);
    b.textContent = reason ? 'Add to waitlist' : 'Send out';
    b.title = reason;
  });
}

// Returns true when the click was a restroom button. rerender shows the new notice even when nothing changed.
export function handleRestroomClick(button, cls, date, rerender) {
  const action = button.dataset.r;
  if (!action) return false;
  const studentId = button.dataset.student;
  if (action === 'override') overrideDialog(cls, date, studentId, rerender);
  else if (action === 'cancel') cancelRequest(button.dataset.id);
  else {
    const run = { request: requestRestroom, out: markOut, return: markReturned }[action];
    notice = run(cls.id, date, studentId).message;
    rerender();
  }
  return true;
}

// Sends a student out even when the restroom is full, trips haven't opened, or others are waiting.
function overrideDialog(cls, date, studentId, rerender) {
  openModal({
    title: 'Teacher override',
    className: 'modal-sm',
    render(body, close) {
      body.innerHTML = `
        <form class="form" novalidate>
          <p class="modal-text">Sends ${escapeHtml(nameOf(cls, studentId))} out even if the restroom is full, trips haven’t
            opened, or others are waiting first. The reason is saved with the trip.</p>
          <label class="field">
            <span>Reason</span>
            <input name="reason" type="text" maxlength="200" autocomplete="off" autofocus>
          </label>
          <p class="field-error" hidden></p>
          <div class="modal-actions">
            <span class="spacer"></span>
            <button type="button" class="btn-secondary" data-a="cancel">Cancel</button>
            <button type="submit" class="btn-primary">Send out</button>
          </div>
        </form>`;
      const form = body.querySelector('form');
      const errorEl = form.querySelector('.field-error');

      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const reason = form.reason.value.trim();
        errorEl.textContent = 'Type a reason.';
        errorEl.hidden = !!reason;
        if (!reason) return;
        notice = markOut(cls.id, date, studentId, reason).message;
        close();
        rerender();
      });

      body.addEventListener('click', (e) => {
        if (e.target.closest('[data-a="cancel"]')) close();
      });
    },
  });
}
