import { icon } from '../icons.js';
import { getState, setPin, loadDemo, resetAll } from '../store.js';
import { confirmDialog } from '../modal.js';

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
        <section class="panel danger-zone">
          <div class="panel-head"><h2>Data</h2><span class="stat-sub">Stored on this device only</span></div>
          <div class="list-row">
            <span class="list-text">
              <span class="list-title">Load demo classes</span>
              <span class="list-sub">Replaces your classes and attendance with three made-up classes and a week of history. Keeps the PIN.</span>
            </span>
            <button class="btn-secondary" data-reset="demo">Load demo</button>
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

  el.querySelector('.danger-zone').addEventListener('click', async (e) => {
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
