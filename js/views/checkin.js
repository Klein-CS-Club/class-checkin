import { mountScanner } from './scanner.js';
import { icon } from '../icons.js';
import { getState, subscribe, classById, sortedStudents, checkIn, undoCheckIn, isCheckedIn, stopKiosk } from '../store.js';
import { matchesSearch, firstName } from '../names.js';
import { escapeHtml } from '../format.js';
import { openModal } from '../modal.js';

const GREETING_MS = 3000;

// The unattended tablet screen at the door. Never shows times or late status.
export function renderCheckin(el) {
  const cls = classById(getState().kiosk.classId);
  el.innerHTML = `
    <div class="kiosk">
      <header class="kiosk-head">
        <div>
          <p class="kiosk-class">${escapeHtml(cls?.name ?? '')}</p>
          <h1>Find your name</h1>
        </div>
        <button class="action" id="lock" aria-label="Teacher: exit check-in">${icon('lock')}Teacher</button>
      </header>
      <div class="kiosk-search-wrap">
        <label class="search kiosk-search">
          ${icon('search')}
          <input id="search" type="text" inputmode="search" enterkeyhint="go" placeholder="Start typing your name" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" aria-label="Search your name">
        </label>
      </div>
      <p class="sr-only" aria-live="polite" id="live"></p>
      <div id="kiosk-scanner"></div><p id="checkin-error" role="status"></p><div class="kiosk-list" id="list"></div>
      <p class="kiosk-foot">Can’t find your name? Tell your teacher.</p>
      <div class="greeting" id="greeting" hidden></div>
    </div>`;

  mountScanner(el.querySelector('#kiosk-scanner'), {kiosk:true});
  const searchEl = el.querySelector('#search');
  const listEl = el.querySelector('#list');
  const liveEl = el.querySelector('#live');
  const greetingEl = el.querySelector('#greeting');
  let query = '';
  let highlight = -1;
  let matches = [];
  let greeting = null; // { result, query } while the greeting shows
  let timer = null;

  function renderList() {
    if (!cls) {
      listEl.innerHTML = '<p class="kiosk-empty">This class no longer exists. Ask your teacher.</p>';
      return;
    }
    matches = sortedStudents(cls).filter((s) => matchesSearch(s.name, query));
    liveEl.textContent = matches.length ? `${matches.length} names` : 'No matching names';
    listEl.innerHTML = matches.length
      ? matches.map((s, i) => {
          const done = isCheckedIn(cls.id, s.id);
          return `
            <div class="kiosk-row${i === highlight ? ' highlight' : ''}">
              <span class="kiosk-name">${escapeHtml(s.name)}</span>
              ${done
                ? `<span class="tag-done">${icon('check')}Checked in</span>`
                : `<button class="btn-primary" data-id="${s.id}">Check in</button>`}
            </div>`;
        }).join('')
      : `<p class="kiosk-empty">No names match “${escapeHtml(query)}”.</p>`;
    listEl.querySelector('.highlight')?.scrollIntoView({ block: 'nearest' });
  }

  function setQuery(value) {
    query = value;
    searchEl.value = value;
    highlight = -1;
    listEl.scrollTop = 0;
    renderList();
  }

  function showGreeting(student, result) {
    greeting = { result, query };
    const again = result.kind === 'already';
    greetingEl.innerHTML = `
      <div class="greeting-check">${icon('check')}</div>
      <h2>Welcome, ${escapeHtml(firstName(student.name))}!</h2>
      <p>${again ? 'You’re already checked in.' : 'You’re checked in.'}</p>
      <button class="btn-link" id="not-you">Not you?</button>`;
    greetingEl.hidden = false;
    timer = setTimeout(resetForNextPerson, GREETING_MS);
  }

  function hideGreeting() {
    clearTimeout(timer);
    greeting = null;
    greetingEl.hidden = true;
    greetingEl.innerHTML = '';
  }

  function resetForNextPerson() {
    hideGreeting();
    setQuery('');
    searchEl.focus();
  }

  // "Not you?" undoes only the check-in this greeting just made, then goes back to the
  // same search so the right person can tap their own row.
  function notYou() {
    const { result, query: previous } = greeting;
    hideGreeting();
    if (result.kind === 'recorded') undoCheckIn(result.checkIn.id);
    setQuery(previous);
    searchEl.focus();
  }

  // Only the button checks someone in, so scrolling can't cause an accidental check-in.
  function doCheckIn(student) {
    if (greeting || isCheckedIn(cls.id, student.id)) return;
    const result = checkIn(cls.id, student.id);
    if (result.kind === 'error') { el.querySelector('#checkin-error').textContent = result.message; return; }
    showGreeting(student, result);
  }

  listEl.addEventListener('click', (e) => {
    const id = e.target.closest('[data-id]')?.dataset.id;
    const student = id && cls.students.find((s) => s.id === id);
    if (student) doCheckIn(student);
  });

  greetingEl.addEventListener('click', (e) => {
    if (e.target.closest('#not-you')) notYou();
  });

  searchEl.addEventListener('input', () => setQuery(searchEl.value));
  searchEl.addEventListener('keydown', (e) => {
    if (e.isComposing) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!matches.length) return;
      highlight = e.key === 'ArrowDown' ? Math.min(highlight + 1, matches.length - 1) : Math.max(highlight - 1, 0);
      renderList();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = matches[highlight] ?? (matches.length === 1 ? matches[0] : null);
      if (target) doCheckIn(target);
    } else if (e.key === 'Escape') {
      setQuery('');
    }
  });

  el.querySelector('#lock').addEventListener('click', () => {
    clearTimeout(timer);
    showPinPad(() => { if (greeting) resetForNextPerson(); });
  });

  const unsubscribe = subscribe(() => { if (getState().kiosk) renderList(); });
  renderList();
  searchEl.focus();

  return () => {
    clearTimeout(timer);
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
