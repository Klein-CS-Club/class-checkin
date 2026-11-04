import { parseTime, timeLabel } from '../format.js';

// A time typed in a plain text box. The line under it shows how the text was understood, so
// "2:30" visibly becomes 2:30 PM before anything is saved. An optional box can be left empty.
export function showTimeHint(input, hintEl, { label = 'Starts at', optional = false } = {}) {
  const update = () => {
    const text = input.value.trim();
    const time = parseTime(text);
    if (time) hintEl.textContent = `${label} ${timeLabel(time)}.`;
    else if (optional && text === '') hintEl.textContent = 'Optional. Leave it empty if you don’t need it.';
    else hintEl.textContent = 'Type a time like 8:00 AM or 14:30.';
  };
  input.addEventListener('input', update);
  update();
}
