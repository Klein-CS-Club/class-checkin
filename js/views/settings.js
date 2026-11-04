import { icon } from '../icons.js';
import { getState, setPin, setRestroomRules, openDemo, loadDemo, resetAll, backupText, readBackup, restoreBackup } from '../store.js';
import { confirmDialog } from '../modal.js';
import { downloadFile } from '../csv.js';
import { todayKey } from '../format.js';

export function renderSettings(el) {
  el.innerHTML = `
    <div class="page">
      <header class="page-head"><h1>Settings</h1></header>
      <div class="page-body settings">
        <section class="panel">
          <div class="panel-head"><h2>Teacher PIN</h2><span class="stat-sub saved-note" id="saved" hidden>${icon('check')}Saved</span></div>
          <form class="form panel-body" id="pin-form" novalidate>
            <p class="hint">Students can’t leave the check-in screen without this PIN. It only stops casual tapping;
              anyone with the device can still clear its data.</p>
            <label class="field">
              <span>New 4-digit PIN</span>
              <input name="pin" type="password" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="••••">
            </label>
            <p class="field-error" hidden></p>
            <div class="modal-actions">
              <button type="submit" class="btn-primary">Save PIN</button>
            </div>
          </form>
        </section>
        <section class="panel">
          <div class="panel-head"><h2>Restroom</h2><span class="stat-sub saved-note" id="rules-saved" hidden>${icon('check')}Saved</span></div>
          <form class="form panel-body" id="rules-form" novalidate>
            <p class="hint">Students who can’t go yet wait on the waitlist, and the first in line goes when it’s their turn.
              With 10 minutes, no one goes in the first 10 or the last 10 minutes of class. The last minutes only apply
              to classes that have an end time.</p>
            <label class="field">
              <span>Students out at once</span>
              <input name="capacity" type="number" min="1" max="50" step="1" inputmode="numeric" value="${getState().settings.capacity}">
            </label>
            <label class="field">
              <span>No trips in the first and last (minutes of class)</span>
              <input name="minutes" type="number" min="0" max="120" step="1" inputmode="numeric" value="${getState().settings.restrictionMinutes}">
            </label>
            <p class="field-error" hidden></p>
            <div class="modal-actions">
              <button type="submit" class="btn-primary">Save</button>
            </div>
          </form>
        </section>
        <section class="panel danger-zone">
          <div class="panel-head"><h2>Data</h2><span class="stat-sub">Stored on this device only</span></div>
          <div class="list-row">
            <span class="list-text">
              <span class="list-title">Download backup</span>
              <span class="list-sub">Saves your classes, rosters, attendance, restroom trips and settings to a file. Clearing this browser’s data
                erases them, so download a new backup after you change rosters.</span>
            </span>
            <button class="btn-secondary" id="backup">Download backup</button>
          </div>
          <div class="list-row">
            <span class="list-text">
              <span class="list-title">Restore from backup</span>
              <span class="list-sub">Replaces everything on this device with a backup file.</span>
              <span class="field-error" id="restore-msg" hidden></span>
            </span>
            <label class="btn-secondary file-btn">Restore<input type="file" accept=".json,application/json" hidden></label>
          </div>
          <div class="list-row">
            <span class="list-text">
              <span class="list-title">Load demo classes</span>
              <span class="list-sub">Replaces your classes and attendance with three made-up classes and a week of history. Keeps the PIN.</span>
            </span>
            <button class="btn-secondary" data-reset="demo">Load demo</button>
          </div>
          <div class="list-row">
            <span class="list-text">
              <span class="list-title">Period 7 demo</span>
              <span class="list-sub">Adds a made-up Period 7 with a clock you set yourself, to try the restroom rules without waiting
                for the bell. Your classes and records are not touched.</span>
            </span>
            <button class="btn-secondary" data-p7>Open Period 7 demo</button>
          </div>
          <div class="list-row">
            <span class="list-text">
              <span class="list-title">Erase everything</span>
              <span class="list-sub">Removes every class, student and check-in, and sets the PIN back to 1234.</span>
            </span>
            <button class="btn-danger" data-reset="all">Erase all</button>
          </div>
        </section>
      </div>
    </div>`;

  const form = el.querySelector('#pin-form');
  const errorEl = form.querySelector('.field-error');
  const savedEl = el.querySelector('#saved');

  form.addEventListener('input', () => { savedEl.hidden = true; });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const pin = form.pin.value.trim();
    const error = /^\d{4}$/.test(pin) ? '' : 'The PIN must be exactly 4 digits.';
    errorEl.textContent = error;
    errorEl.hidden = !error;
    if (error) return;
    setPin(pin);
    form.reset();
    savedEl.hidden = false;
  });

  const rulesForm = el.querySelector('#rules-form');
  const rulesError = rulesForm.querySelector('.field-error');
  const rulesSaved = el.querySelector('#rules-saved');

  rulesForm.addEventListener('input', () => { rulesSaved.hidden = true; });

  rulesForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const capacity = Number(rulesForm.capacity.value);
    const minutes = Number(rulesForm.minutes.value);
    const error = !Number.isInteger(capacity) || capacity < 1 || capacity > 50 ? 'Students out at once must be 1 to 50.'
      : !Number.isInteger(minutes) || minutes < 0 || minutes > 120 ? 'The first minutes must be 0 to 120. Use 0 to allow trips from the start.' : '';
    rulesError.textContent = error;
    rulesError.hidden = !error;
    if (error) return;
    setRestroomRules(capacity, minutes);
    rulesSaved.hidden = false;
  });

  el.querySelector('#backup').addEventListener('click', () => {
    downloadFile(`class-checkin-backup-${todayKey()}.json`, backupText(), 'application/json');
  });

  const restoreMsg = el.querySelector('#restore-msg');
  el.querySelector('input[type=file]').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    let data;
    try {
      data = readBackup(await file.text());
    } catch (err) {
      showRestoreMsg('field-error', err.message);
      return;
    }
    restoreMsg.hidden = true;
    const ok = !getState().classes.length || await confirmDialog({
      title: 'Restore from backup?',
      message: 'Your classes, rosters and attendance on this device will be replaced with the backup. This can’t be undone.',
      confirmLabel: 'Restore',
      danger: true,
    });
    if (!ok) return;
    restoreBackup(data);
    const count = data.classes.length;
    showRestoreMsg('saved-note', `Restored ${count} ${count === 1 ? 'class' : 'classes'}.`);
  });

  function showRestoreMsg(className, text) {
    restoreMsg.className = className;
    restoreMsg.textContent = text;
    restoreMsg.hidden = false;
  }

  el.querySelector('.danger-zone').addEventListener('click', async (e) => {
    if (e.target.closest('[data-p7]')) {
      openDemo();
      location.hash = '#/restroom';
      return;
    }
    const kind = e.target.closest('[data-reset]')?.dataset.reset;
    if (!kind) return;
    const demo = kind === 'demo';
    const hasData = getState().classes.length > 0;
    const ok = !hasData || await confirmDialog({
      title: demo ? 'Load demo classes?' : 'Erase everything?',
      message: demo
        ? 'Your classes, rosters and attendance on this device will be replaced. This can’t be undone.'
        : 'Every class, student and check-in on this device will be erased. This can’t be undone.',
      confirmLabel: demo ? 'Load demo' : 'Erase everything',
      danger: true,
    });
    if (!ok) return;
    if (demo) loadDemo();
    else resetAll();
  });
}
