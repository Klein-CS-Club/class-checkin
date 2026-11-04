import * as store from '../store.js';
import { escapeHtml as esc, addDays, dayLabel } from '../format.js';
import { sessionId, sessionSchedule, schoolTime, schoolDate, duration, zonedTimestamp } from '../session.js';
import { toCsv, downloadCsv } from '../csv.js';
import { confirmDialog, openModal } from '../modal.js';
import { mountScanner } from './scanner.js';

export function renderAttendance(el) {
  const restroom=location.hash==='#/restroom';
  let notice='';
  el.innerHTML=`<div class="page session-page"><header class="page-head"><h1 id="title">Attendance</h1><span class="spacer"></span><div class="date-step"><button class="action" data-step="-1" aria-label="Previous day">Previous</button><input type="date" id="date" aria-label="Date"><button class="action" data-step="1" aria-label="Next day">Next</button></div><button class="btn-secondary" id="current-period">Go to current period</button></header>
    <div class="page-body"><section class="session-context" aria-label="Selected session"></section><div id="demo-controls"></div><div id="scanner"></div>
    <nav class="session-tabs" aria-label="Class session"><a href="#/attendance" ${!restroom?'aria-current="page"':''}>Attendance</a><a href="#/restroom" ${restroom?'aria-current="page"':''}>Restroom</a><span id="restroom-brief"></span></nav>
    <p id="session-notice" role="status"></p><div id="session-content"></div></div></div>`;
  const page=el.querySelector('.session-page');
  const body=el.querySelector('#session-content'),dateEl=el.querySelector('#date');
  const updateScanner=mountScanner(el.querySelector('#scanner'));
  function context() {
    if (!page.isConnected) return;
    const cls=store.currentClass();
    if (!cls) return;
    const date=store.selectedDate(),at=store.nowFor(cls.id),z=store.zoneFor(cls),s=sessionSchedule(cls,date,z),sum=store.restroomSummary(cls.id,date);
    const phase=!s?'Schedule needed':at<s.startAt?'Upcoming':at<s.endAt?'In progress':'Ended';
    const timing=!s?'':at<s.startAt?`${Math.ceil((s.startAt-at)/60000)} min until start`:at<s.endAt?`${Math.floor((at-s.startAt)/60000)} min elapsed · ${Math.ceil((s.endAt-at)/60000)} min remaining`:'Session has ended';
    el.querySelector('.session-context').innerHTML=`<div><strong>${esc(dayLabel(date))}</strong> · ${esc(z??'School timezone not set')}<p>${s?`${esc(s.start)}–${esc(s.end)} · Late cutoff ${schoolTime(s.cutoffAt,z)} (${cls.schedule.grace} min grace)`:'<a href="#/classes">Configure this period’s bell schedule</a> and <a href="#/settings">school timezone</a> to record arrivals.'}</p></div><div class="session-live"><strong>${phase}</strong><span>${timing}</span></div>`;
    el.querySelector('#restroom-brief').textContent=`Out: ${sum.active.length} · Waiting: ${sum.queue.length}`;
    el.querySelectorAll('[data-live-at]').forEach(n=>{n.textContent=duration(at-Number(n.dataset.liveAt));});
    const clockInput=el.querySelector('#demo-time'); if(clockInput && document.activeElement!==clockInput) clockInput.value=schoolTime(at,z);
    const rule=el.querySelector('#departure-rule');
    if (rule) rule.textContent=!s?'Configure the bell schedule before departures.':at<s.startAt?'Class has not started. Requests can join the waiting list.':at<s.startAt+store.rulesFor(cls).restrictionMinutes*60000?`Ordinary departures open in ${duration(s.startAt+store.rulesFor(cls).restrictionMinutes*60000-at)}. Requests and returns are allowed.`:at>=s.endAt?'Session ended. Outstanding trips need a return; they are never closed automatically.':'Departures are open. Confirm when each student actually leaves.';
    const liveTotal=el.querySelector('#live-total'); if(liveTotal) liveTotal.textContent=duration(sum.liveMs);
    el.querySelectorAll('[data-out-for]').forEach(n=>{const studentTrips=sum.trips.filter(t=>t.studentId===n.dataset.outFor);n.textContent=duration(studentTrips.reduce((ms,t)=>ms+Math.max(0,(t.returnedAt??at)-t.departedAt),0));});
    // Eligibility can change with wall time; update only action state, never replace focused fields.
    el.querySelectorAll('[data-act="out"]').forEach(b=>{const reason=store.departureEligibility(cls.id,date,b.dataset.student);b.disabled=!!reason;b.title=reason;});
    el.querySelectorAll('.queue-item').forEach(n=>n.classList.toggle('next-eligible',!store.departureEligibility(cls.id,date,n.dataset.student)));
  }
  function render() {
    if (!page.isConnected) return;
    const cls=store.currentClass();
    if(!cls){body.innerHTML='<div class="panel-empty">No classes yet. <a href="#/classes">Add a class</a> or <a href="#/settings">load Period 7 demo</a>.</div>';return;}
    const date=store.selectedDate(),sum=store.restroomSummary(cls.id,date),rows=store.dayRows(cls.id,date),sid=sessionId(cls.id,date),zone=store.zoneFor(cls);
    const time=at=>zone?schoolTime(at,zone):'Timezone needed';
    el.querySelector('#title').textContent=cls.name;
    dateEl.value=date;
    updateScanner();
    el.querySelector('#session-notice').textContent=store.getStorageError()||notice;
    const demo=el.querySelector('#demo-controls');
    // Do not rebuild demo controls on each store notification while the teacher is typing.
    if(demo.dataset.class!==cls.id){demo.dataset.class=cls.id;demo.innerHTML=cls.demo?`<details class="demo-controls"><summary>Period 7 demo time controls · fictional schedule</summary><p>Frozen clock for this demo only. Attendance and restroom data in other classes are untouched.</p><div class="toolbar"><label class="field"><span>Demo school time</span><input id="demo-time" type="time" value="${time(store.nowFor(cls.id))}"></label><button class="btn-secondary" data-demo="set">Set time</button>${['13:59','14:00','14:05','14:06','14:09','14:10','14:15','15:01'].map(t=>`<button class="btn-link" data-demo="${t}">${t}</button>`).join('')}<button class="btn-link" data-demo="reset">Reset only demo</button></div></details>`:'';}
    if(!restroom) {
      body.innerHTML=`<div class="toolbar"><button class="btn-secondary" id="export">Export CSV</button><button class="btn-secondary" id="kiosk">Start check-in kiosk</button><span class="spacer"></span><button class="btn-link" id="rest">Mark rest present</button><button class="btn-secondary" id="finalize">${store.getState().finalized[sid]?'Undo finalization':'Finalize attendance'}</button></div>
      <p class="hint">Late minutes are measured from scheduled start. Manual edits are status-only; original arrivals are preserved.</p>
      <section class="panel table-wrap"><table class="table"><thead><tr><th>Student</th><th>Arrival</th><th>Minutes late</th><th>Status</th><th>Arrival action</th></tr></thead><tbody>${rows.map(r=>`<tr><td class="student-name">${esc(r.student.name)}</td><td>${r.checkIn?time(r.checkIn.at):'—'}</td><td>${store.minutesLate(cls,date,r.student.id)??'—'}</td><td><div class="status-cell"><div class="seg" role="group" aria-label="Status for ${esc(r.student.name)}">${[['present','P'],['late','L'],['absent','A']].map(([s,l])=>`<button data-act="status" data-student="${r.student.id}" data-status="${s}" title="${store.STATUSES[s]}" aria-pressed="${r.status===s}">${l}</button>`).join('')}</div><span class="status-text status-${r.status}">${store.STATUSES[r.status]}</span>${r.overridden?`<button class="btn-link" data-act="status" data-student="${r.student.id}" data-status="">Edited · Undo</button>`:''}</div></td><td><button class="${r.checkIn?'btn-link':'btn-secondary'}" data-act="arrive" data-student="${r.student.id}">${r.checkIn?'Already checked in':'Record arrival'}</button></td></tr>`).join('')}</tbody></table>${!rows.length?'<p class="panel-empty">No students. Add a roster in Classes.</p>':''}</section>`;
    } else {
      const student=id=>cls.students.find(s=>s.id===id)?.name??'Removed student';
      const outButton=id=>`<button class="btn-primary" data-act="out" data-student="${id}">Mark out</button><button class="btn-link" data-act="override" data-student="${id}">Teacher override</button>`;
      body.innerHTML=`<div class="restroom-totals" aria-label="Restroom session totals"><span><strong>${sum.active.length}</strong> Currently out</span><span><strong>${sum.queue.length}</strong> Waiting</span><span><strong>${sum.completed.length}</strong> Completed trips</span><span><strong>${sum.unique}</strong> Unique students</span><span>Completed time <strong>${duration(sum.completedMs)}</strong></span><span>Including active <strong id="live-total">${duration(sum.liveMs)}</strong></span></div><p class="rule-note" id="departure-rule"></p>
      <div class="restroom-columns"><section class="panel"><div class="panel-head"><h2>Currently out</h2><span>${sum.active.length} / ${store.rulesFor(cls).capacity} capacity</span></div>${sum.active.map(t=>`<div class="trip-row"><div><strong>${esc(student(t.studentId))}</strong><p>Left ${time(t.departedAt)} · <span data-live-at="${t.departedAt}"></span></p>${t.teacherOverride?`<p class="override-note">Teacher override: ${esc(t.overrideReason)}</p>`:''}${sessionSchedule(cls,date,zone)?.endAt<=store.nowFor(cls.id)?'<p class="field-error">Unresolved after class ended</p>':''}</div><button class="btn-primary" data-act="return" data-student="${t.studentId}">Mark returned</button></div>`).join('')||'<p class="panel-empty">Everyone is in class.</p>'}</section>
      <section class="panel"><div class="panel-head"><h2>Waiting</h2><span>First requested, first out</span></div>${sum.queue.map((q,i)=>`<div class="trip-row queue-item" data-student="${q.studentId}"><div><strong>${i+1}. ${esc(student(q.studentId))}</strong><p>Requested ${time(q.requestedAt)} · waiting <span data-live-at="${q.requestedAt}"></span></p><span class="eligible-label">Next eligible · confirm departure</span></div><div class="row-actions">${outButton(q.studentId)}<button class="btn-link" data-act="cancel" data-id="${q.id}">Cancel request</button></div></div>`).join('')||'<p class="panel-empty">No one is waiting. Request from the roster below.</p>'}</section></div>
      <section class="panel"><div class="panel-head"><h2>Student restroom totals</h2></div><div class="table-wrap"><table class="table"><thead><tr><th>Student</th><th>State</th><th>Trips</th><th>Total time out</th><th>Action</th></tr></thead><tbody>${store.sortedStudents(cls).map(s=>{const trips=sum.trips.filter(t=>t.studentId===s.id),out=sum.active.some(t=>t.studentId===s.id),waiting=sum.queue.some(q=>q.studentId===s.id);return `<tr><td>${esc(s.name)}</td><td>${out?'Out':waiting?'Waiting':'In class'}</td><td>${trips.length}</td><td data-out-for="${s.id}"></td><td>${out?`<button class="btn-secondary" data-act="return" data-student="${s.id}">Mark returned</button>`:waiting?'See waiting list':`<button class="btn-secondary" data-act="request" data-student="${s.id}">Request restroom</button> ${outButton(s.id)}`}</td></tr>`;}).join('')}</tbody></table></div></section>
      <section class="panel"><div class="panel-head"><h2>Completed trips</h2></div>${sum.completed.map(t=>`<div class="trip-row"><strong>${esc(student(t.studentId))}</strong><span>${time(t.departedAt)} → ${time(t.returnedAt)} · ${duration(t.durationMs)}</span>${t.teacherOverride?`<span>Teacher override: ${esc(t.overrideReason)}</span>`:''}</div>`).join('')||'<p class="panel-empty">Returned trips will appear here with their departure, return and duration.</p>'}</section>`;
    }
    context();
  }
  el.querySelector('.session-page').addEventListener('change',e=>{if(e.target===dateEl && dateEl.value) store.selectDate(dateEl.value);});
  el.querySelector('.session-page').addEventListener('click',async e=>{
    const b=e.target.closest('button');if(!b)return;
    const cls=store.currentClass(),date=store.selectedDate();
    if(b.dataset.step) {store.selectDate(addDays(date,Number(b.dataset.step)));return;}
    if(b.id==='current-period'){const c=store.currentPeriod();if(c){store.selectClass(c.id);store.selectDate(store.schoolToday(c));}else{notice='No configured period is in progress. Your selected session has been kept.';render();}return;}
    if(!cls)return;
    if(b.dataset.demo){try{if(b.dataset.demo==='reset'){if(await confirmDialog({title:'Reset Period 7 demo?',message:'Only the fictional demo records will be removed.',confirmLabel:'Reset demo'}))store.resetPeriod7();}else store.setDemoClock(zonedTimestamp(date,b.dataset.demo==='set'?el.querySelector('#demo-time').value:b.dataset.demo,store.zoneFor(cls)));}catch(error){notice=error.message;render();}return;}
    const id=b.dataset.student,a=b.dataset.act;
    if(a==='arrive')notice=store.checkIn(cls.id,id,date).message;
    if(a==='status')store.setOverride(cls.id,date,id,b.dataset.status||null);
    if(a==='request')notice=store.requestRestroom(cls.id,date,id).message;
    if(a==='out')notice=store.markOut(cls.id,date,id).message;
    if(a==='return')notice=store.markReturned(cls.id,date,id).message;
    if(a==='cancel')store.cancelRequest(b.dataset.id);
    if(a==='override'){openModal({title:'Teacher emergency override',className:'modal-sm',render(body,close){body.innerHTML=`<form class="form"><p>Bypass the departure restriction, capacity, or queue order. A reason is kept with this trip.</p><label class="field"><span>Reason (required)</span><input name="reason" required maxlength="300" autofocus></label><button class="btn-primary">Confirm departure</button></form>`;body.querySelector('form').onsubmit=e=>{e.preventDefault();const reason=body.querySelector('input').value.trim();if(!reason)return;notice=store.markOut(cls.id,date,id,reason).message;close();render();};}});return;}
    if(b.id==='kiosk'){store.startKiosk(cls.id);return;}
    if(b.id==='finalize'){if(store.getState().finalized[sessionId(cls.id,date)])store.undoFinalize(cls.id,date);else if(await confirmDialog({title:'Finalize attendance?',message:'Unchecked students will be marked Absent. Arrivals and manual edits are preserved. You can undo this action.',confirmLabel:'Mark remaining absent'}))store.finalizeAttendance(cls.id,date);}
    if(b.id==='rest' && await confirmDialog({title:'Mark rest present?',message:'Add status-only Present overrides for unchecked or absent students. Each edit can be undone.',confirmLabel:'Mark present'}))store.markRestPresent(cls.id,date);
    if(b.id==='export'){const zone=store.zoneFor(cls);downloadCsv(`attendance-${date}.csv`,toCsv(['Date','Class','Student','Status','Arrival time','Minutes late from start','Manual override','School timezone'],store.dayRows(cls.id,date).map(r=>[date,cls.name,r.student.name,store.STATUSES[r.status],r.checkIn?zone?schoolTime(r.checkIn.at,zone):new Date(r.checkIn.at).toISOString():'',store.minutesLate(cls,date,r.student.id),r.overridden?'Yes (status only)':'No',zone??'Not configured'])));}
    render();
  });
  const unsubscribe=store.subscribe(render);render();const timer=setInterval(context,1000);
  return ()=>{unsubscribe();clearInterval(timer);};
}
