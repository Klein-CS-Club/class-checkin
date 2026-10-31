import { icon } from '../icons.js';
import { getState, subscribe, classById, dayRows, checkIn, undoCheckIn, stopKiosk } from '../store.js';
import { matchesSearch } from '../names.js';
import { escapeHtml, todayKey, time12 } from '../format.js';
import { openModal } from '../modal.js';

// A teacher's Present or Late in Attendance counts as checked in too.
const isHere = (row) => row.status === 'present' || row.status === 'late';

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
          <label class="kiosk-label" for="search">Your name</label>
          <label class="search kiosk-search">
            ${icon('search')}
            <input id="search" type="text" inputmode="search" enterkeyhint="go" placeholder="Start typing your name" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
          </label>
          <button class="btn-primary btn-xl" id="go" disabled>Check in</button>
          <div class="kiosk-undo" id="undo" hidden></div>
          <p class="kiosk-help" id="hint">Type your name, then press Enter.</p>
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
  let open = [];   // matching students not yet checked in; the highlight moves through these
  let undo = null; // { result, query } while the undo notice shows
  let clockTimer = null;

  // The highlighted row, or the only one left. Several matches and no highlight: nobody.
  const target = () => (query.trim() ? open[highlight] ?? (open.length === 1 ? open[0] : null) : null);

  function renderClock() {
    const now = new Date();
    el.querySelector('#clock').textContent = time12(now);
    el.querySelector('#date').textContent = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    // Wake again at the top of the next minute.
    clockTimer = setTimeout(() => { renderClock(); render(); }, 60000 - (now % 60000));
  }

  const row = ({ student }, i) => `
    <div class="kiosk-row${i === highlight ? ' highlight' : ''}">
      <span class="kiosk-name">${escapeHtml(student.name)}</span>
      <button class="btn-primary" data-id="${student.id}">Check in</button>
    </div>`;
  const doneRow = ({ student, checkIn: entry }) => `
    <div class="kiosk-row done">
      <span class="kiosk-name">${escapeHtml(student.name)}</span>
      <span class="kiosk-done">${icon('check')}Checked in${entry ? ` · ${time12(entry.at)}` : ''}</span>
    </div>`;

  function render() {
    if (!cls) {
      listEl.innerHTML = '<p class="kiosk-empty">This class no longer exists. Ask your teacher.</p>';
      searchEl.disabled = true;
      return;
    }
    const rows = dayRows(cls.id, todayKey());
    el.querySelector('#count').textContent = `${rows.filter(isHere).length} of ${rows.length} checked in`;

    const matches = rows.filter((r) => matchesSearch(r.student.name, query));
    const done = matches.filter(isHere);
    open = matches.filter((r) => !isHere(r));
    highlight = Math.min(highlight, open.length - 1);
    goEl.disabled = !target();
    // Several names and none picked: Enter does nothing, so say what to do instead.
    const several = query.trim() && open.length > 1 && !open[highlight];
    hintEl.textContent = several
      ? `${open.length} names match. Keep typing, or press ↓ to choose yours.`
      : target() ? `Press Enter to check in ${target().student.name}.` : 'Type your name, then press Enter.';
    liveEl.textContent = several
      ? `${open.length} names match. Keep typing, or press the down arrow to choose yours.`
      : matches.length ? `${matches.length} names` : 'No matching names';
    listEl.innerHTML = matches.length
      ? open.map(row).join('') + done.map(doneRow).join('')
      : `<p class="kiosk-empty">No names match “${escapeHtml(query)}”.</p>`;
    listEl.querySelector('.highlight')?.scrollIntoView({ block: 'nearest' });
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

  goEl.addEventListener('click', () => { const t = target(); if (t) doCheckIn(t); });

  listEl.addEventListener('click', (e) => {
    const id = e.target.closest('[data-id]')?.dataset.id;
    const r = id && open.find((o) => o.student.id === id);
    if (r) doCheckIn(r);
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
      if (t) doCheckIn(t);
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
  searchEl.focus();

  return () => {
    clearTimeout(clockTimer);
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
