import { studentHistory, STATUSES } from '../store.js';
import { escapeHtml, time12, dayLabel, duration } from '../format.js';
import { openModal } from '../modal.js';

// One student's record in one class: a one-line count, their days, their restroom trips.
// Teacher pages only. The kiosk never imports this.
export function openStudentHistory(classId, studentId) {
  const h = studentHistory(classId, studentId);
  if (!h) return;
  const { cls, student, days, trips, counts } = h;

  const countText = ['present', 'late', 'absent', 'notyet']
    .filter((s) => s !== 'notyet' || counts.notyet > 0)
    .map((s) => `${STATUSES[s]} ${counts[s]}`)
    .join(' · ');

  const dayRows = days.map((d) => `
    <tr>
      <td>${escapeHtml(dayLabel(d.date))}</td>
      <td><span class="status-text status-${d.status}">${escapeHtml(STATUSES[d.status])}</span>${d.overridden ? ' <span class="muted">Edited</span>' : ''}</td>
      <td class="tabular muted" data-label="Checked in">${d.checkIn ? escapeHtml(time12(d.checkIn.at)) : '—'}</td>
      <td class="tabular muted" data-label="Minutes late">${d.minutesLate ?? '—'}</td>
    </tr>`).join('');

  const tripRows = trips.map((t) => `
    <tr>
      <td>${escapeHtml(dayLabel(t.date))}</td>
      <td class="tabular" data-label="Out">${escapeHtml(time12(t.departedAt))}</td>
      <td class="tabular" data-label="Back">${t.returnedAt == null ? 'Still out' : escapeHtml(time12(t.returnedAt))}</td>
      <td class="tabular muted" data-label="Time out">${t.returnedAt == null ? '—' : escapeHtml(duration(t.returnedAt - t.departedAt))}</td>
      <td class="muted" data-label="Override reason">${t.overrideReason ? escapeHtml(t.overrideReason) : '—'}</td>
    </tr>`).join('');

  openModal({
    title: student.name,
    className: 'modal-wide history',
    render(body) {
      body.innerHTML = `
        <p class="stat-sub">${escapeHtml(cls.name)}</p>
        <p class="history-counts">${escapeHtml(countText)}</p>
        <section class="history-section">
          <h3>Attendance</h3>
          ${days.length ? `
            <table class="table history-table">
              <thead><tr><th>Date</th><th>Status</th><th>Checked in</th><th>Minutes late</th></tr></thead>
              <tbody>${dayRows}</tbody>
            </table>` : '<p class="muted">No attendance days yet.</p>'}
        </section>
        <section class="history-section">
          <h3>Restroom trips</h3>
          ${trips.length ? `
            <table class="table history-table">
              <thead><tr><th>Date</th><th>Out</th><th>Back</th><th>Time out</th><th>Override reason</th></tr></thead>
              <tbody>${tripRows}</tbody>
            </table>` : '<p class="muted">No restroom trips yet.</p>'}
        </section>`;
    },
  });
}
