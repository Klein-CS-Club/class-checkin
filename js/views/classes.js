import { icon } from '../icons.js';
import { getState, subscribe, classById, sortedStudents, addClass, selectClass, updateClass, deleteClass, addStudents, renameStudent, removeStudent } from '../store.js';
import { escapeHtml, timeLabel } from '../format.js';
import { namesFromCsv } from '../csv.js';
import { openModal, confirmDialog } from '../modal.js';

export function renderClasses(el) {
  el.innerHTML = `
    <div class="page">
      <header class="page-head">
        <h1>Classes</h1>
        <span class="spacer"></span>
        <button class="btn-primary" id="add-class">${icon('plus')}Add class</button>
      </header>
      <div class="page-body" id="body"></div>
    </div>`;

  const bodyEl = el.querySelector('#body');

  function render() {
    const { classes } = getState();
    bodyEl.innerHTML = classes.length
      ? `<div class="panels">${classes.map((c) => `
          <section class="panel">
            <div class="panel-head">
              <div>
                <h2>${escapeHtml(c.name)}</h2>
                <div class="stat-sub">${c.students.length} student${c.students.length === 1 ? '' : 's'} · Late after ${escapeHtml(timeLabel(c.lateAfter))}</div>
              </div>
              <span class="spacer"></span>
              <button class="btn-link" data-a="edit-class" data-class="${c.id}">${icon('edit')}Edit</button>
              <button class="btn-link" data-a="add-students" data-class="${c.id}">${icon('plus')}Add students</button>
            </div>
            <div class="roster">
              ${c.students.length
                ? sortedStudents(c).map((s) => `
                  <div class="list-row">
                    <span class="list-text"><span class="list-title">${escapeHtml(s.name)}</span></span>
                    <button class="icon-btn" data-a="rename" data-class="${c.id}" data-student="${s.id}" aria-label="Rename ${escapeHtml(s.name)}">${icon('edit')}</button>
                    <button class="icon-btn danger" data-a="remove" data-class="${c.id}" data-student="${s.id}" aria-label="Remove ${escapeHtml(s.name)}">${icon('trash')}</button>
                  </div>`).join('')
                : '<div class="panel-empty">No students yet.</div>'}
            </div>
          </section>`).join('')}</div>`
      : '<section class="panel"><div class="panel-empty">No classes yet. Add one to get started.</div></section>';
  }

  el.querySelector('.page').addEventListener('click', async (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.id === 'add-class') return classDialog();
    const cls = classById(t.dataset.class);
    if (!cls) return;
    const student = cls.students.find((s) => s.id === t.dataset.student);
    if (t.dataset.a === 'edit-class') classDialog(cls);
    else if (t.dataset.a === 'add-students') addStudentsDialog(cls);
    else if (t.dataset.a === 'rename' && student) renameDialog(cls, student);
    else if (t.dataset.a === 'remove' && student) {
      const ok = await confirmDialog({
        title: `Remove ${student.name}?`,
        message: `They’ll be taken off ${cls.name}, along with their attendance in this class.`,
        confirmLabel: 'Remove',
        danger: true,
      });
      if (ok) removeStudent(cls.id, student.id);
    }
  });

  render();
  return subscribe(render);
}

// Add a class, or edit one (with a Delete button) when `cls` is given.
export function classDialog(cls) {
  openModal({
    title: cls ? 'Edit class' : 'Add class',
    className: 'modal-sm',
    render(body, close) {
      body.innerHTML = `
        <form class="form" novalidate>
          <label class="field">
            <span>Class name</span>
            <input name="name" type="text" maxlength="60" autocomplete="off" placeholder="Period 1 · English 9" value="${escapeHtml(cls?.name ?? '')}" autofocus>
          </label>
          <label class="field">
            <span>Late after</span>
            <input name="lateAfter" type="time" value="${cls?.lateAfter ?? '08:00'}">
          </label>
          <p class="field-error" hidden></p>
          <div class="modal-actions">
            ${cls ? '<button type="button" class="btn-link danger-link" data-a="delete">Delete class</button><span class="spacer"></span>' : ''}
            <button type="button" class="btn-secondary" data-a="cancel">Cancel</button>
            <button type="submit" class="btn-primary">${cls ? 'Save' : 'Add class'}</button>
          </div>
        </form>`;
      const form = body.querySelector('form');
      const errorEl = form.querySelector('.field-error');

      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = form.name.value.trim();
        const lateAfter = form.lateAfter.value;
        const error = !name ? 'Give the class a name.' : !lateAfter ? 'Pick a late-after time.' : '';
        errorEl.textContent = error;
        errorEl.hidden = !error;
        if (error) return;
        if (cls) updateClass(cls.id, { name, lateAfter });
        else selectClass(addClass(name, lateAfter)); // a new class opens as the current period
        close();
      });

      body.addEventListener('click', async (e) => {
        const a = e.target.closest('[data-a]')?.dataset.a;
        if (a === 'cancel') close();
        if (a !== 'delete') return;
        close();
        const ok = await confirmDialog({
          title: `Delete ${cls.name}?`,
          message: 'The class, its roster and all of its attendance will be erased from this device. This can’t be undone.',
          confirmLabel: 'Delete class',
          danger: true,
        });
        if (ok) deleteClass(cls.id);
      });
    },
  });
}

// Paste names (one per line) or import a CSV, which fills the box for review first.
function addStudentsDialog(cls) {
  openModal({
    title: `Add students to ${cls.name}`,
    render(body, close) {
      body.innerHTML = `
        <form class="form" novalidate>
          <label class="field">
            <span>Names, one per line</span>
            <textarea name="names" rows="9" placeholder="Maya Johnson&#10;Liam Carter&#10;Sofía Ramírez" autofocus></textarea>
          </label>
          <p class="hint">Paste from a spreadsheet or your school system, or type a single name.
            “Last, First” is flipped to “First Last”. Names already on the roster are skipped.</p>
          <p class="field-error" hidden></p>
          <div class="modal-actions">
            <label class="btn-link file-btn">${icon('upload')}Import CSV<input type="file" accept=".csv,text/csv" hidden></label>
            <span class="spacer"></span>
            <button type="button" class="btn-secondary" data-a="cancel">Cancel</button>
            <button type="submit" class="btn-primary">Add students</button>
          </div>
        </form>`;
      const form = body.querySelector('form');
      const errorEl = form.querySelector('.field-error');
      const showError = (msg) => { errorEl.textContent = msg; errorEl.hidden = !msg; };

      form.querySelector('input[type=file]').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const names = namesFromCsv(await file.text()).map((n) => n.trim()).filter(Boolean);
        if (!names.length) return showError('No names found in that file.');
        showError('');
        const current = form.names.value.trim();
        form.names.value = (current ? `${current}\n` : '') + names.join('\n');
      });

      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const names = form.names.value.split(/\r?\n/).map((n) => n.trim()).filter(Boolean);
        if (!names.length) return showError('Type or paste at least one name.');
        const added = addStudents(cls.id, names);
        if (!added) return showError('Those names are already on the roster.');
        close();
      });

      body.addEventListener('click', (e) => {
        if (e.target.closest('[data-a="cancel"]')) close();
      });
    },
  });
}

function renameDialog(cls, student) {
  openModal({
    title: 'Rename student',
    className: 'modal-sm',
    render(body, close) {
      body.innerHTML = `
        <form class="form" novalidate>
          <label class="field">
            <span>Name</span>
            <input name="name" type="text" maxlength="80" autocomplete="off" value="${escapeHtml(student.name)}" autofocus>
          </label>
          <div class="modal-actions">
            <button type="button" class="btn-secondary" data-a="cancel">Cancel</button>
            <button type="submit" class="btn-primary">Save</button>
          </div>
        </form>`;
      const form = body.querySelector('form');
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = form.name.value.replace(/\s+/g, ' ').trim();
        if (name) renameStudent(cls.id, student.id, name);
        close();
      });
      body.addEventListener('click', (e) => {
        if (e.target.closest('[data-a="cancel"]')) close();
      });
    },
  });
}
