import { currentClass, selectedDate, scanStudent } from '../store.js';
import { escapeHtml } from '../format.js';
export function mountScanner(el, {classId, date, kiosk=false}={}) {
  const cls=()=>classId ? currentClass()?.id===classId ? currentClass() : null : currentClass();
  el.innerHTML=`<form class="scanner" autocomplete="off">
    <label class="field"><span>Scan mode</span><select name="mode" aria-label="Scan mode">${(kiosk?[['attendance','Attendance']]:[['attendance','Attendance'],['departure','Restroom departure'],['return','Restroom return']]).map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select></label>
    <label class="field scan-field"><span>Scanner ready · <span class="scan-class">${escapeHtml(cls()?.name??'Select a class')}</span></span><input name="identifier" aria-label="Student scan identifier" placeholder="Scan label, then Enter" autocapitalize="characters" spellcheck="false"></label>
    <button class="btn-secondary" type="submit">Submit scan</button>
    <p class="scan-result" role="status" aria-live="polite"></p>
  </form>`;
  const form=el.querySelector('form');
  form.addEventListener('submit',e=>{e.preventDefault();const r=scanStudent(classId??currentClass()?.id,date??selectedDate(),form.elements.mode.value,form.elements.identifier.value);form.querySelector('.scan-result').textContent=r.message;form.querySelector('.scan-result').classList.toggle('field-error',r.kind==='error');form.elements.identifier.value='';});
  return ()=>{el.querySelector('.scan-class').textContent=cls()?.name??'Select a class';};
}
