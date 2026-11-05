import { icon } from '../icons.js';
import { getState, subscribe, currentClass, selectClass, hereToday, setSidebarExpanded } from '../store.js';
import { escapeHtml } from '../format.js';
import { classDialog } from './classes.js';

// Phones always get the 64px rail; there's no room for the full sidebar.
const narrowQuery = matchMedia('(max-width: 760px)');

// The tile shown for a period: the first number in its name ("Period 1 · English 9" → "1"),
// else its first letter.
const periodTile = (name) => name.match(/\d+/)?.[0] ?? name.trim().charAt(0).toUpperCase();

// The sidebar: 260px with labels, or the 64px icon rail. Lists the periods with today's counts.
export function mountSidebar() {
  const app = document.querySelector('.app');
  const toggle = document.getElementById('sidebar-toggle');
  const periodsEl = document.getElementById('periods');
  toggle.innerHTML = icon('sidebar');

  // Attendance (and its Restroom tab) is the page that shows the selected period, so the period is lit
  // there and nowhere else. Every other page (Classes, Settings) leaves it dark.
  const showsPeriod = () => !/^#\/(classes|settings)$/.test(location.hash);

  function renderLayout() {
    const rail = narrowQuery.matches || !getState().settings.sidebarExpanded;
    app.classList.toggle('rail', rail);
    app.classList.toggle('narrow', narrowQuery.matches);
    const label = rail ? 'Expand sidebar' : 'Collapse sidebar';
    toggle.setAttribute('aria-label', label);
    toggle.title = label;
    toggle.setAttribute('aria-expanded', String(!rail));
  }

  function renderPeriods() {
    const current = showsPeriod() ? currentClass() : null;
    periodsEl.innerHTML = getState().classes.map((c) => {
      const here = hereToday(c.id);
      const total = c.students.length;
      const active = c.id === current?.id;
      return `
        <button class="nav-item period${active ? ' active' : ''}" data-class="${c.id}" title="${escapeHtml(`${c.name} · ${here}/${total} here today`)}" ${active ? 'aria-current="true"' : ''}>
          <span class="period-tile" aria-hidden="true">${escapeHtml(periodTile(c.name))}</span>
          <span class="label">${escapeHtml(c.name)}</span>
          <span class="label count" aria-label="${here} of ${total} here today">${here}/${total}</span>
        </button>`;
    }).join('') + `
      <button class="nav-item" data-add title="Add class">${icon('plus')}<span class="label">Add class</span></button>`;
  }

  toggle.addEventListener('click', () => setSidebarExpanded(!getState().settings.sidebarExpanded));

  // Picking a period opens its attendance, or stays on the Restroom tab if that's where you are.
  periodsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.hasAttribute('data-add')) return classDialog();
    selectClass(btn.dataset.class);
    location.hash = location.hash === '#/restroom' ? '#/restroom' : '#/attendance';
  });

  narrowQuery.addEventListener('change', renderLayout);
  window.addEventListener('hashchange', renderPeriods);
  subscribe(() => { renderLayout(); renderPeriods(); });
  renderLayout();
  renderPeriods();
}
