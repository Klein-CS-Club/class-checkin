import { parseTime, timeLabel } from '../format.js';

// A time typed in a plain text box. The line under it shows how the text was understood, so
// "2:30" visibly becomes 2:30 PM before anything is saved.
export function showTimeHint(input, hintEl) {
  const update = () => {
    const time = parseTime(input.value);
    hintEl.textContent = time ? `Starts at ${timeLabel(time)}.` : 'Type a time like 8:00 AM or 14:30.';
  };
  input.addEventListener('input', update);
  update();
}
