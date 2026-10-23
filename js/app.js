import { icon } from './icons.js';
import { getState, subscribe } from './store.js';
import { renderCheckin } from './views/checkin.js';
import { renderAttendance } from './views/attendance.js';
import { renderClasses } from './views/classes.js';
import { renderSettings } from './views/settings.js';

const routes = [
  { path: 'attendance', label: 'Attendance', icon: 'clipboard', group: 'main' },
  { path: 'classes', label: 'Classes', icon: 'users', group: 'main' },
  { path: 'settings', label: 'Settings', icon: 'settings', group: 'bottom' },
];

// Each view is render(el) and may return a cleanup function.
const views = {
  checkin: renderCheckin,
  attendance: renderAttendance,
  classes: renderClasses,
  settings: renderSettings,
};
let cleanup = null;
let current = null;

function renderNav() {
  const link = (r) =>
    `<a href="#/${r.path}" class="nav-item" data-path="${r.path}" title="${r.label}" aria-label="${r.label}">${icon(r.icon)}</a>`;
  document.getElementById('nav-main').innerHTML = routes.filter((r) => r.group === 'main').map(link).join('');
  document.getElementById('nav-bottom').innerHTML = routes.filter((r) => r.group === 'bottom').map(link).join('');
}

// While the kiosk is on, every route shows the check-in screen until the PIN is entered.
function currentPath() {
  if (getState().kiosk) return 'checkin';
  const path = location.hash.replace(/^#\/?/, '');
  return routes.some((r) => r.path === path) ? path : 'attendance';
}

function route() {
  const path = currentPath();
  if (`#/${path}` !== location.hash) history.replaceState(null, '', `#/${path}`);
  document.body.classList.toggle('kiosk-mode', path === 'checkin');
  document.querySelectorAll('.nav-item').forEach((a) => {
    a.classList.toggle('active', a.dataset.path === path);
    if (a.dataset.path === path) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  if (cleanup) cleanup();
  current = path;
  const el = document.getElementById('view');
  el.innerHTML = '';
  cleanup = views[path](el) ?? null;
}

renderNav();
window.addEventListener('hashchange', route);
// Starting or leaving the kiosk switches screens.
subscribe(() => { if (currentPath() !== current) route(); });
route();
