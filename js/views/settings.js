import { icon } from '../icons.js';
import { getState, setPin, setRestroomRules, openDemo, loadDemo, resetAll, backupText, readBackup, restoreBackup } from '../store.js';
import { confirmDialog } from '../modal.js';
import { downloadFile } from '../csv.js';
import { todayKey } from '../format.js';

const SUPPORT_EMAIL = 'kleinhscompsciclub@gmail.com';
const SUPPORT_HREF = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Class check-in support')}`;

export function renderSettings(el) {
  const { settings } = getState();
  el.innerHTML = `
    <div class="page">
      <header class="page-head"><h1>Settings</h1></header>
      <div class="page-body settings">
        <section class="settings-section">
          <h2 class="settings-label">Teacher PIN</h2>
          <form class="settings-main" id="pin-form" novalidate>
            <label class="setting-row">
              <span class="setting-text">
                <span class="setting-title">New 4-digit PIN</span>
                <span class="setting-sub">Students can’t leave the check-in screen without it. It only stops casual tapping;
                  anyone with the device can still clear its data.</span>
              </span>
              <input name="pin" type="password" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="••••">
            </label>
            <div class="settings-foot">
              <p class="field-error" hidden></p>
              <span class="saved-note" id="saved" hidden>${icon('check')}Saved</span>
              <button type="submit" class="btn-primary">Save PIN</button>
            </div>
          </form>
        </section>
        <section class="settings-section">
          <h2 class="settings-label">Restroom</h2>
          <form class="settings-main" id="rules-form" novalidate>
            <label class="setting-row">
              <span class="setting-text">
                <span class="setting-title">Students out at once</span>
                <span class="setting-sub">Anyone who can’t go yet joins the waitlist, and the first in line goes when it’s their turn.</span>
              </span>
              <input name="capacity" type="number" min="1" max="50" step="1" inputmode="numeric" value="${settings.capacity}">
            </label>
            <label class="setting-row">
              <span class="setting-text">
                <span class="setting-title">No trips at the start and end of class</span>
                <span class="setting-sub">With 10 minutes, no one goes in the first or last 10 minutes of class. The end only applies
                  to classes that have an end time. Use 0 to allow trips from the start.</span>
              </span>
              <span class="setting-control">
                <input name="minutes" type="number" min="0" max="120" step="1" inputmode="numeric" value="${settings.restrictionMinutes}">
                <span class="setting-unit">min</span>
              </span>
            </label>
            <div class="settings-foot">
              <p class="field-error" hidden></p>
              <span class="saved-note" id="rules-saved" hidden>${icon('check')}Saved</span>
              <button type="submit" class="btn-primary">Save</button>
            </div>
          </form>
        </section>
        <section class="settings-section">
          <h2 class="settings-label">Data</h2>
          <div class="settings-main">
            <div class="setting-row">
              <span class="setting-text">
                <span class="setting-title">Stored on this device only</span>
                <span class="setting-sub">A backup saves your classes, rosters, attendance, restroom trips and settings to a file.
                  Clearing this browser’s data erases them, so download a new backup after you change rosters.</span>
              </span>
            </div>
            <div class="settings-foot settings-foot-start">
              <button class="btn-secondary" id="backup">${icon('download')}Download backup</button>
              <label class="btn-secondary file-btn">${icon('upload')}Restore backup<input type="file" accept=".json,application/json" hidden></label>
              <span id="restore-msg" hidden></span>
            </div>
          </div>
        </section>
        <section class="settings-section">
          <h2 class="settings-label">Demo</h2>
          <div class="settings-main">
            <div class="setting-row">
              <span class="setting-text">
                <span class="setting-title">Load demo classes</span>
                <span class="setting-sub">Replaces your classes and attendance with three made-up classes and a week of history. Keeps the PIN.</span>
              </span>
              <button class="btn-secondary" data-reset="demo">Load demo</button>
            </div>
            <div class="setting-row">
              <span class="setting-text">
                <span class="setting-title">Period 7 demo</span>
                <span class="setting-sub">Adds a made-up Period 7 with a clock you set yourself, to try the restroom rules without waiting
                  for the bell. Your classes and records are not touched.</span>
              </span>
              <button class="btn-secondary" data-p7>Open demo</button>
            </div>
          </div>
        </section>
        <section class="settings-section">
          <h2 class="settings-label">Support</h2>
          <div class="settings-main">
            <div class="setting-row">
              <span class="setting-text">
                <span class="setting-title">Contact the computer science club</span>
                <span class="setting-sub">Email us if something breaks or you need a hand. Please don’t include student names.</span>
                <span class="setting-sub support-email">${SUPPORT_EMAIL}</span>
              </span>
            </div>
            <div class="settings-foot settings-foot-start">
              <a class="btn-secondary" href="${SUPPORT_HREF}">${icon('mail')}Email the club</a>
              <button class="btn-secondary" id="copy-email">${icon('copy')}Copy address</button>
              <span id="copy-msg" class="saved-note" hidden>Copied</span>
            </div>
          </div>
        </section>
        <section class="settings-section">
          <h2 class="settings-label">Erase data</h2>
          <div class="settings-main settings-plain">
            <p class="setting-sub">Removes every class, student and check-in, and sets the PIN back to 1234.</p>
            <button class="btn-danger" data-reset="all">${icon('trash')}Erase all data</button>
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

  const copyMsg = el.querySelector('#copy-msg');
  el.querySelector('#copy-email').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(SUPPORT_EMAIL);
      copyMsg.className = 'saved-note';
      copyMsg.textContent = 'Copied';
    } catch {
      copyMsg.className = 'field-error';
      copyMsg.textContent = 'Couldn’t copy. Select the address above instead.';
    }
    copyMsg.hidden = false;
  });

  el.querySelector('.settings').addEventListener('click', async (e) => {
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
