import { icon } from '../icons.js';
import {
  getState, subscribe, classById, dayRows, checkIn, undoCheckIn, stopKiosk, sortedStudents, todayFor, nowFor,
  restroomSummary, departureEligibility, requestRestroom, markOut, markReturned, cancelRequest, closingProblem,
} from '../store.js';
import { matchesSearch } from '../names.js';
import { escapeHtml, time12, duration } from '../format.js';
import { openModal } from '../modal.js';
import { ruleText } from './restroom.js';

// A student who checked in is checked in, even if they came so late the class counts them absent.
// A teacher's Present or Late in Attendance counts as checked in too.
const isHere = (row) => !!row.checkIn || row.status === 'present' || row.status === 'late';

// The unattended Chromebook at the door. Shows check-in times, never late status.
export function renderCheckin(el) {
  const cls = classById(getState().kiosk.classId);
  el.innerHTML = `
    <div class="kiosk">
      <header class="kiosk-bar">
        <p class="kiosk-class">${escapeHtml(cls?.name ?? '')}</p>
        <div class="kiosk-clock"><span id="clock"></span><span id="date"></span></div>
        <p class="kiosk-count" id="count"></p>
        <button class="action" id="lock" aria-label="Teacher: exit check-in">${icon('lock')}Teacher</button>
      </header>
      <div class="kiosk-body">
        <section class="kiosk-entry">
          <div class="kiosk-tabs" role="group" aria-label="What do you need?">
            <button class="kiosk-tab" data-mode="checkin" aria-pressed="true">Check in</button>
            <button class="kiosk-tab" data-mode="restroom" aria-pressed="false">Restroom</button>
          </div>
          <label class="kiosk-label" for="search">Your name</label>
          <label class="search kiosk-search">
            ${icon('search')}
            <input id="search" type="text" inputmode="search" enterkeyhint="go" placeholder="Start typing your name" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
          </label>
          <button class="btn-primary btn-xl" id="go" disabled>Check in</button>
          <div class="kiosk-undo" id="undo" hidden></div>
          <p class="kiosk-help" id="hint">Type your name, then press Enter.</p>
          <p class="restroom-rule" id="rule" hidden></p>
          <p class="kiosk-help">Can’t find your name? Tell your teacher.</p>
        </section>
        <section class="kiosk-list" id="list" aria-label="Class list"></section>
      </div>
      <p class="sr-only" aria-live="polite" id="live"></p>
    </div>`;

  const searchEl = el.querySelector('#search');
  const goEl = el.querySelector('#go');
  const listEl = el.querySelector('#list');
  const liveEl = el.querySelector('#live');
  const undoEl = el.querySelector('#undo');
  const hintEl = el.querySelector('#hint');
  let query = '';
  let highlight = -1;
  let open = [];   // matching students with something to press; the highlight moves through these
  let undo = null; // { result, query } while the undo notice shows
  let mode = 'checkin'; // or 'restroom'
  let restroomSig = ''; // what the Restroom list last showed, so the timer only redraws when it changes
  let clockTimer = null;
  let liveTimer = null;

  // The highlighted row, or the only one left. Several matches and no highlight: nobody.
  const target = () => (query.trim() ? open[highlight] ?? (open.length === 1 ? open[0] : null) : null);

  function renderClock() {
    const now = new Date(cls ? nowFor(cls.id) : Date.now());
    el.querySelector('#clock').textContent = time12(now);
    el.querySelector('#date').textContent = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    // Wake again at the top of the next minute.
    clockTimer = setTimeout(() => { renderClock(); render(); }, 60000 - (now % 60000));
  }

  const row = ({ student, act }, i) => `
    <div class="kiosk-row${i >= 0 && i === highlight ? ' highlight' : ''}">
      <span class="kiosk-name">${escapeHtml(student.name)}</span>
      ${act?.closed
        ? `<span class="kiosk-done">${act.closed}</span>`
        : `<button class="btn-primary" data-id="${student.id}">${act ? act.label : 'Check in'}</button>`}
    </div>`;
  const doneRow = ({ student, checkIn: entry }) => `
    <div class="kiosk-row done">
      <span class="kiosk-name">${escapeHtml(student.name)}</span>
      <span class="kiosk-done">${icon('check')}Checked in${entry ? ` · ${time12(entry.at)}` : ''}</span>
    </div>`;
  // Several names and none picked: Enter does nothing, so say what to do instead.
  function setHints(matchCount, pressText) {
    const several = query.trim() && open.length > 1 && !open[highlight];
    hintEl.textContent = several
      ? `${open.length} names match. Keep typing, or press ↓ to choose yours.`
      : target() ? pressText(target()) : 'Type your name, then press Enter.';
    liveEl.textContent = several
      ? `${open.length} names match. Keep typing, or press the down arrow to choose yours.`
      : matchCount ? `${matchCount} names` : 'No matching names';
  }

  function render() {
    if (!cls) {
      listEl.innerHTML = '<p class="kiosk-empty">This class no longer exists. Ask your teacher.</p>';
      searchEl.disabled = true;
      return;
    }
    if (mode === 'restroom') return renderRestroom();
    const rows = dayRows(cls.id, todayFor(cls));
    el.querySelector('#count').textContent = `${rows.filter(isHere).length} of ${rows.length} checked in`;

    const matches = rows.filter((r) => matchesSearch(r.student.name, query));
    const done = matches.filter(isHere);
    open = matches.filter((r) => !isHere(r));
    highlight = Math.min(highlight, open.length - 1);
    goEl.disabled = !target();
    setHints(matches.length, (t) => `Press Enter to check in ${t.student.name}.`);
    listEl.innerHTML = matches.length
      ? open.map(row).join('') + done.map(doneRow).join('')
      : `<p class="kiosk-empty">No names match “${escapeHtml(query)}”.</p>`;
    listEl.querySelector('.highlight')?.scrollIntoView({ block: 'nearest' });
  }

  // ----- Restroom tab -----
  // What a student can do right now. kind is null when all they can do is wait their turn.
  // queueId is set while they are on the waitlist, so "Leave waitlist" knows which place to remove.
  function restroomAction(student, sum, at) {
    if (sum.active.some((t) => t.studentId === student.id)) return { kind: 'return', label: 'I’m back' };
    const reason = departureEligibility(cls.id, todayFor(cls), student.id, at);
    const place = sum.queue.findIndex((q) => q.studentId === student.id);
    if (place >= 0) {
      const waiting = { place: place + 1, queueId: sum.queue[place].id };
      return reason ? { kind: null, reason, ...waiting } : { kind: 'go', label: 'Go now', ...waiting };
    }
    // Once trips have closed the store won't take a place in line, so say so instead of offering a button.
    // The long reason is in the blue note on the left; each row gets the short version.
    const closed = closingProblem(cls, todayFor(cls), at);
    if (closed) return { kind: null, reason, closed: closed.startsWith('Class is over') ? 'Class is over' : 'Trips closed' };
    return { kind: 'request', label: reason ? 'Join waitlist' : 'Go to restroom', reason };
  }

  const nameOf = (studentId) => cls.students.find((s) => s.id === studentId)?.name ?? 'Removed student';

  // The right side, top to bottom: sessions (who is out), the waitlist, then everyone else.
  // Students who are out come back from their Session card, so they are not in the name list.
  function restroomRows() {
    const at = nowFor(cls.id);
    const sum = restroomSummary(cls.id, todayFor(cls), at);
    const all = sortedStudents(cls)
      .filter((s) => matchesSearch(s.name, query))
      .map((student) => ({ student, act: restroomAction(student, sum, at) }));
    const waitlist = all.filter((r) => r.act.place).sort((a, b) => a.act.place - b.act.place);
    const names = all.filter((r) => !r.act.place && r.act.kind !== 'return');
    // A session lasts from leaving to coming back. With nobody out, the last finished trip stays so its times can be read.
    const last = sum.completed.reduce((a, t) => (!a || t.returnedAt > a.returnedAt ? t : a), null);
    const sessions = sum.active.length ? sum.active : last ? [last] : [];
    const sig = JSON.stringify([
      sum.active.length, sum.queue.length, sessions.map((t) => [t.id, t.returnedAt]),
      all.map((r) => [r.student.id, r.act.kind, r.act.label, r.act.place, r.act.reason, r.act.closed]),
    ]);
    return { sum, all, waitlist, names, sessions, sig };
  }

  const sessionCard = (t) => `
    <div class="kiosk-session${t.returnedAt == null ? '' : ' done'}">
      <div class="kiosk-session-info">
        <p class="kiosk-session-title">${t.returnedAt == null ? 'Session' : 'Last session'}</p>
        <p class="kiosk-session-name">${escapeHtml(nameOf(t.studentId))}</p>
        <p class="kiosk-session-sub">Time out: ${time12(t.departedAt)}</p>
        <p class="kiosk-session-sub">Time in: ${t.returnedAt == null ? '—' : time12(t.returnedAt)}</p>
      </div>
      <div class="stopwatch" data-trip="${t.id}" role="timer" aria-label="Time out for this trip"></div>
      ${t.returnedAt == null ? `<button class="btn-primary" data-return="${t.studentId}">I’m back</button>` : ''}
    </div>`;

  function renderRestroom() {
    const { sum, all, waitlist, names, sessions, sig } = restroomRows();
    restroomSig = sig;
    el.querySelector('#count').textContent = `Out: ${sum.active.length} · Waiting: ${sum.queue.length}`;
    showRule();
    // Enter and the highlight move through what can be pressed: whose turn it is, then the names.
    open = [...waitlist.filter((r) => r.act.kind), ...names.filter((r) => r.act.kind)];
    highlight = Math.min(highlight, open.length - 1);
    goEl.textContent = target()?.act.label ?? 'Go to restroom';
    goEl.disabled = !target();
    setHints(all.length, (t) => `Press Enter: ${t.act.label} (${t.student.name}).`);

    const waitRow = (r) => `
      <div class="kiosk-row wait${open.indexOf(r) === highlight && highlight >= 0 ? ' highlight' : ''}">
        <span class="kiosk-name">${escapeHtml(r.student.name)}<small class="kiosk-sub">#${r.act.place} · ${r.act.kind ? 'Your turn' : escapeHtml(r.act.reason)}</small></span>
        ${r.act.kind ? `<button class="btn-primary" data-id="${r.student.id}">Go now</button>` : ''}
        <button class="btn-gray" data-leave="${r.act.queueId}" aria-label="Leave waitlist: ${escapeHtml(r.student.name)}">Leave waitlist</button>
      </div>`;
    const nameRow = (r) => row(r, open.indexOf(r));
    const heading = (text) => `<h2 class="kiosk-list-title">${text}</h2>`;
    const above = sessions.length || waitlist.length;

    listEl.innerHTML = sessions.map(sessionCard).join('')
      + (waitlist.length ? heading('Waitlist') + waitlist.map(waitRow).join('') : '')
      + (names.length ? (above ? heading('Class list') : '') + names.map(nameRow).join('') : '')
      + (all.length ? '' : `<p class="kiosk-empty">No names match “${escapeHtml(query)}”.</p>`);
    tickSessions(sessions);
    listEl.querySelector('.highlight')?.scrollIntoView({ block: 'nearest' });
  }

  // The opening time or the rule in force, shown once instead of on every row.
  function showRule() {
    const ruleEl = el.querySelector('#rule');
    ruleEl.hidden = mode !== 'restroom';
    if (mode === 'restroom') ruleEl.textContent = ruleText(cls, todayFor(cls), nowFor(cls.id));
  }

  // The running timers count up in place, without redrawing the cards.
  function tickSessions(sessions) {
    const at = nowFor(cls.id);
    sessions.forEach((t) => {
      const n = listEl.querySelector(`[data-trip="${t.id}"]`);
      if (n) n.textContent = duration((t.returnedAt ?? at) - t.departedAt);
    });
  }

  // Trips can open or a slot can free up with nobody touching the screen, so check every second.
  // Redrawing only when something changed keeps a tap from landing on a list that just rebuilt.
  function refreshRestroom() {
    if (!cls || mode !== 'restroom') return;
    showRule();
    const { sessions, sig } = restroomRows();
    if (sig !== restroomSig) render();
    else tickSessions(sessions);
  }

  function setQuery(value) {
    query = value;
    searchEl.value = value;
    highlight = -1;
    listEl.scrollTop = 0;
    render();
  }

  // The bar under the notice counts down 8s and closes it when it runs out.
  // New markup restarts the countdown when the next check-in replaces the notice.
  function showUndo(student, result) {
    undo = { result, query };
    const label = result.kind === 'already' ? 'Already checked in' : 'Checked in';
    undoEl.innerHTML = `
      <span class="kiosk-undo-mark">${icon('check')}</span>
      <span class="kiosk-undo-label"><span>${label} ·</span> <span>${time12(result.checkIn.at)}</span></span>
      <strong class="kiosk-undo-name">${escapeHtml(student.name)}</strong>
      <div class="kiosk-undo-actions">
        <button class="btn-link" id="not-you">Not you?</button>
        <button class="kiosk-undo-close" id="undo-close" aria-label="Close">${icon('close')}</button>
      </div>
      <span class="kiosk-undo-bar" aria-hidden="true"></span>`;
    undoEl.hidden = false;
  }

  function hideUndo() {
    undo = null;
    undoEl.hidden = true;
  }

  // "Not you?" undoes only the check-in just made, then puts the search back the way it was.
  function notYou() {
    const { result, query: previous } = undo;
    hideUndo();
    if (result.kind === 'recorded') undoCheckIn(result.checkIn.id);
    setQuery(previous);
    searchEl.focus();
  }

  // Only buttons check someone in, so scrolling can't cause an accidental check-in.
  function doCheckIn({ student }) {
    const result = checkIn(cls.id, student.id);
    showUndo(student, result);
    setQuery('');
    liveEl.textContent = `Checked in ${student.name}`;
    searchEl.focus();
  }

  // No notice here: the list changing is the answer (a name joins the waitlist, a Session card starts or ends).
  // Screen readers still get the result.
  function doRestroom({ student, act }) {
    const run = { return: markReturned, go: markOut, request: requestRestroom }[act.kind];
    const { message } = run(cls.id, todayFor(cls), student.id);
    setQuery('');
    liveEl.textContent = `${student.name}: ${message}`;
    searchEl.focus();
  }

  const activate = (r) => (mode === 'restroom' ? doRestroom(r) : doCheckIn(r));

  goEl.addEventListener('click', () => { const t = target(); if (t) activate(t); });

  listEl.addEventListener('click', (e) => {
    const back = e.target.closest('[data-return]')?.dataset.return;
    if (back) return doRestroom({ student: cls.students.find((s) => s.id === back), act: { kind: 'return' } });
    const leave = e.target.closest('[data-leave]')?.dataset.leave;
    if (leave) {
      cancelRequest(leave);
      liveEl.textContent = 'Left the waitlist';
      return render();
    }
    const id = e.target.closest('[data-id]')?.dataset.id;
    const r = id && open.find((o) => o.student.id === id);
    if (r) activate(r);
  });

  el.querySelector('.kiosk-tabs').addEventListener('click', (e) => {
    const next = e.target.closest('[data-mode]')?.dataset.mode;
    if (!next || next === mode) return;
    mode = next;
    el.querySelectorAll('.kiosk-tab').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
    goEl.textContent = mode === 'restroom' ? 'Go to restroom' : 'Check in';
    showRule();
    hideUndo();
    setQuery('');
    searchEl.focus();
  });

  undoEl.addEventListener('click', (e) => {
    if (e.target.closest('#not-you')) notYou();
    else if (e.target.closest('#undo-close')) { hideUndo(); searchEl.focus(); }
  });
  undoEl.addEventListener('animationend', (e) => {
    if (e.animationName === 'undo-countdown') hideUndo();
  });

  // A click on empty space sends focus back to the name box.
  el.addEventListener('click', (e) => {
    if (!e.target.closest('button, input')) searchEl.focus();
  });

  searchEl.addEventListener('input', () => setQuery(searchEl.value));
  searchEl.addEventListener('keydown', (e) => {
    if (e.isComposing) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!query.trim() || !open.length) return;
      highlight = e.key === 'ArrowDown' ? Math.min(highlight + 1, open.length - 1) : Math.max(highlight - 1, 0);
      render();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const t = target();
      if (t) activate(t);
    } else if (e.key === 'Escape') {
      setQuery('');
    }
  });

  el.querySelector('#lock').addEventListener('click', () => {
    showPinPad(() => searchEl.focus());
  });

  const unsubscribe = subscribe(() => { if (getState().kiosk) render(); });
  renderClock();
  render();
  liveTimer = setInterval(refreshRestroom, 1000);
  searchEl.focus();

  return () => {
    clearTimeout(clockTimer);
    clearInterval(liveTimer);
    unsubscribe();
  };
}

// PIN keypad, styled like the cash register's checkout keypad. Unlocks at 4 digits.
function showPinPad(onCancel) {
  let unlocked = false;
  openModal({
    title: 'Teacher PIN',
    className: 'modal-sm pin-modal',
    render(body, close) {
      let pin = '';
      body.innerHTML = `
        <p class="modal-text">Enter your PIN to leave check-in.</p>
        <div class="pin-dots" aria-hidden="true">${'<span></span>'.repeat(4)}</div>
        <p class="field-error pin-error" aria-live="assertive"></p>
        <div class="keypad">
          ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button data-k="${n}">${n}</button>`).join('')}
          <span></span>
          <button data-k="0">0</button>
          <button data-k="back" aria-label="Delete">${icon('backspace')}</button>
        </div>`;
      const dots = body.querySelectorAll('.pin-dots span');
      const errorEl = body.querySelector('.pin-error');

      function press(k) {
        errorEl.textContent = '';
        if (k === 'back') pin = pin.slice(0, -1);
        else if (pin.length < 4) pin += k;
        dots.forEach((d, i) => d.classList.toggle('on', i < pin.length));
        if (pin.length < 4) return;
        if (stopKiosk(pin)) {
          unlocked = true;
          close();
          return;
        }
        pin = '';
        dots.forEach((d) => d.classList.remove('on'));
        errorEl.textContent = 'Wrong PIN. Try again.';
      }

      body.addEventListener('click', (e) => {
        const k = e.target.closest('[data-k]')?.dataset.k;
        if (k) press(k);
      });
      const onKey = (e) => {
        if (/^[0-9]$/.test(e.key)) press(e.key);
        else if (e.key === 'Backspace') press('back');
      };
      document.addEventListener('keydown', onKey);
      // Stop listening once the modal is gone, however it closed.
      new MutationObserver((_, obs) => {
        if (body.isConnected) return;
        obs.disconnect();
        document.removeEventListener('keydown', onKey);
        if (!unlocked) onCancel();
      }).observe(document.getElementById('modal-root'), { childList: true });
    },
  });
}
