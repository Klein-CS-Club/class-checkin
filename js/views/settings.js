import { escapeHtml } from '../format.js';
import { icon } from '../icons.js';
import { getState, setPin, loadDemo, resetAll, saveSettings } from '../store.js';
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
        <section class="panel"><div class="panel-head"><h2>School & restroom rules</h2></div><form id="school-form" class="form panel-body"><p class="hint">Records stay in this browser, on this device. No synchronization or backend. Set the school's timezone explicitly before using real classes.</p><label class="field"><span>School timezone (IANA name)</span><input name="timezone" placeholder="America/Chicago" value="${escapeHtml(getState().settings.timezone)}" required></label><label class="field"><span>Simultaneous restroom capacity</span><input name="capacity" type="number" min="1" max="50" value="${getState().settings.capacity}" required></label><label class="field"><span>Block ordinary restroom departures for first N minutes (0 disables)</span><input name="restriction" type="number" min="0" max="120" value="${getState().settings.restrictionMinutes}" required></label><p class="hint">Requests and returns are always allowed during the opening restriction. Emergency departures require a teacher reason. Period 7 has isolated demo rules (1 student, 10 minutes).</p><p role="status" id="school-result"></p><button class="btn-primary">Save school settings</button></form></section><section class="panel danger-zone">
          <div class="panel-head"><h2>Data</h2><span class="stat-sub">Stored on this device only</span></div>
          <div class="list-row">
            <span class="list-text">
              <span class="list-title">Period 7 demo / testing</span>
              <span class="list-sub">Adds a fictional Period 7 with an example bell schedule and isolated time controls. Existing classes and records are kept.</span>
            </span>
            <button class="btn-secondary" data-reset="demo">Open Period 7 demo</button>
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

  el.querySelector('#school-form').addEventListener('submit', e => {e.preventDefault();const f=e.currentTarget.elements;try{saveSettings({timezone:f.timezone.value.trim(),capacity:Number(f.capacity.value),restrictionMinutes:Number(f.restriction.value)});el.querySelector('#school-result').textContent='School settings saved.';}catch(error){el.querySelector('#school-result').textContent=error.message;}});
  el.querySelector('.danger-zone').addEventListener('click', async (e) => {
    const kind = e.target.closest('[data-reset]')?.dataset.reset;
    if (!kind) return;
    const demo = kind === 'demo';
    if (demo) { loadDemo(); location.hash='#/attendance'; return; }
    const hasData = getState().classes.length > 0;
    const ok = !hasData || await confirmDialog({
      title: demo ? 'Period 7 demo / testing?' : 'Erase everything?',
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
