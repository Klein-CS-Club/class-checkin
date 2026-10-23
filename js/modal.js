import { icon } from './icons.js';
import { escapeHtml } from './format.js';

// Opens a modal. `render(body, close)` fills it; returns close().
export function openModal({ title, className = '', dismissible = true, render }) {
  const root = document.getElementById('modal-root');
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal ${className}" tabindex="-1" role="dialog" aria-modal="true" ${title ? 'aria-labelledby="modal-title"' : ''}>
      ${title ? `<div class="modal-head"><h2 id="modal-title">${escapeHtml(title)}</h2>${dismissible ? `<button class="modal-close" aria-label="Close">${icon('close')}</button>` : ''}</div>` : ''}
      <div class="modal-body"></div>
    </div>`;
  root.appendChild(backdrop);
  const previousFocus = document.activeElement;

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    backdrop.classList.add('closing');
    const done = () => backdrop.remove();
    if (getComputedStyle(backdrop).animationName === 'none') done();
    else {
      backdrop.addEventListener('animationend', done, { once: true });
      // Animations don't run in background tabs, so animationend may never fire.
      setTimeout(done, 300);
    }
    previousFocus?.focus?.();
  }
  function onKey(e) {
    if (e.key === 'Escape' && dismissible) close();
  }

  document.addEventListener('keydown', onKey);
  backdrop.addEventListener('click', (e) => {
    if (dismissible && (e.target === backdrop || e.target.closest('.modal-close'))) close();
  });

  render(backdrop.querySelector('.modal-body'), close);
  (backdrop.querySelector('[autofocus]') || backdrop.querySelector('.modal'))?.focus?.();
  return close;
}

export function confirmDialog({ title, message, confirmLabel = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    let answered = false;
    openModal({
      title,
      className: 'modal-sm',
      render(body, close) {
        body.innerHTML = `
          <p class="modal-text">${escapeHtml(message)}</p>
          <div class="modal-actions">
            <button class="btn-secondary" data-a="no">Cancel</button>
            <button class="${danger ? 'btn-danger' : 'btn-primary'}" data-a="yes" autofocus>${escapeHtml(confirmLabel)}</button>
          </div>`;
        body.addEventListener('click', (e) => {
          const a = e.target.closest('[data-a]')?.dataset.a;
          if (!a) return;
          answered = true;
          resolve(a === 'yes');
          close();
        });
        // Resolve false if dismissed by Escape/backdrop.
        new MutationObserver((_, obs) => {
          if (!body.isConnected) { obs.disconnect(); if (!answered) resolve(false); }
        }).observe(document.getElementById('modal-root'), { childList: true });
      },
    });
  });
}
