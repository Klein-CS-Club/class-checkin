import { icon } from './icons.js';
import { getState, subscribe } from './store.js';
import { renderCheckin } from './views/checkin.js';
import { renderAttendance } from './views/attendance.js';
import { renderClasses } from './views/classes.js';
import { renderSettings } from './views/settings.js';
import { mountSidebar } from './views/sidebar.js';

const routes = [
  { path: 'attendance', label: 'Attendance', icon: 'clipboard', group: 'main' },
  { path: 'classes', label: 'Classes', icon: 'users', group: 'main' },
  { path: 'settings', label: 'Settings', icon: 'settings', group: 'bottom' },
];

// Each view is render(el) and may return a cleanup function.
// Restroom is a tab of the Attendance page, so it has a route but no sidebar link of its own.
const views = {
  checkin: renderCheckin,
  attendance: renderAttendance,
  restroom: renderAttendance,
  classes: renderClasses,
  settings: renderSettings,
};
let cleanup = null;
let current = null;

function renderNav() {
  const link = (r) =>
    `<a href="#/${r.path}" class="nav-item" data-path="${r.path}" title="${r.label}">${icon(r.icon)}<span class="label">${r.label}</span></a>`;
  document.getElementById('nav-main').innerHTML = routes.filter((r) => r.group === 'main').map(link).join('');
  document.getElementById('nav-bottom').innerHTML = routes.filter((r) => r.group === 'bottom').map(link).join('');
}

// While the kiosk is on, every route shows the check-in screen until the PIN is entered.
function currentPath() {
  if (getState().kiosk) return 'checkin';
  const path = location.hash.replace(/^#\/?/, '');
  return path === 'restroom' || routes.some((r) => r.path === path) ? path : 'attendance';
}

function route() {
  const path = currentPath();
  if (`#/${path}` !== location.hash) history.replaceState(null, '', `#/${path}`);
  document.body.classList.toggle('kiosk-mode', path === 'checkin');
  const navPath = path === 'restroom' ? 'attendance' : path;
  document.querySelectorAll('.nav-item[data-path]').forEach((a) => {
    a.classList.toggle('active', a.dataset.path === navPath);
    if (a.dataset.path === navPath) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  if (cleanup) cleanup();
  current = path;
  const el = document.getElementById('view');
  el.innerHTML = '';
  cleanup = views[path](el) ?? null;
}

renderNav();
mountSidebar();
window.addEventListener('hashchange', route);
// Starting or leaving the kiosk switches screens.
subscribe(() => { if (currentPath() !== current) route(); });
route();
