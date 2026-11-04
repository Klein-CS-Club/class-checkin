import { barcodeSvg } from '../barcode.js';
import { escapeHtml as esc } from '../format.js';
export function showLabels(cls) {
  const root=document.createElement('div');root.id='print-labels';root.className='labels-overlay';
  root.innerHTML=`<div class="labels-toolbar"><h1>Student barcode labels · ${esc(cls.name)}</h1><p>Code 39 · identifier only. Enable Code 39 on your scanner and an Enter suffix. Print at 100% scale; test one label before printing a full sheet.</p><form class="toolbar"><label class="field"><span>Width (mm)</span><input name="width" type="number" min="55" max="180" value="80" required></label><label class="field"><span>Height (mm)</span><input name="height" type="number" min="30" max="100" value="35" required></label><button class="btn-secondary">Update dimensions</button><button class="btn-primary" type="button" id="print">Print labels</button><button class="btn-secondary" type="button" id="close-labels">Close</button></form></div><div id="label-sheet">${cls.students.map(s=>`<article class="student-label"><strong>${esc(s.name)}</strong>${barcodeSvg(s.scanId)}<span>${esc(s.scanId)}</span></article>`).join('')}</div>`;
  const previous=document.activeElement;document.body.append(root);
  root.querySelector('form').onsubmit=e=>{e.preventDefault();const f=e.currentTarget.elements;root.style.setProperty('--label-width',f.width.value+'mm');root.style.setProperty('--label-height',f.height.value+'mm');};
  root.querySelector('#print').onclick=()=>window.print();
  const close=()=>{root.remove();document.removeEventListener('keydown',key);previous?.focus();};
  const key=e=>{if(e.key==='Escape')close();};document.addEventListener('keydown',key);
  root.querySelector('#close-labels').onclick=close;root.querySelector('#close-labels').focus();
}
