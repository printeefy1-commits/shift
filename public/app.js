const $=id=>document.getElementById(id);
let state, month='2026-11', tab='schedule', drafts={}, historyData, historyMonth='2026-11';
const holidayName=day=>state.holidays[day]||state.fixedHolidays[day.slice(5)];
const rotationDay=day=>new Date(day+'T12:00:00').getDay()===5||(day>='2025-01-01'&&!!holidayName(day));
const rosterForMonth=()=>drafts[month]||state.months[month];
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const monthTitle=m=>new Date(m+'-01T12:00:00').toLocaleDateString('en-GB',{month:'long',year:'numeric'});
async function api(path,body){const r=await fetch('/api/'+path,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw new Error(data.error||'Request failed');return data;}
async function refresh(){const result=await Promise.all([api('state'),historyData?Promise.resolve(historyData):api('history')]);state=result[0];historyData=result[1];if(!state.admin)drafts={};render();}
function notify(message){$('notice').textContent=message;clearTimeout(notify.timer);notify.timer=setTimeout(()=>$('notice').textContent='',6000);}
function render(){
 document.querySelectorAll('.admin-only').forEach(e=>e.hidden=!state.admin);
 $('authButton').textContent=state.admin?'Sign out →':'Admin sign in →';$('access').textContent=state.admin?'● Administrator access':'● View-only access';$('teamCount').textContent=state.workers.length;
 $('monthLabel').textContent=monthTitle(month);const rows=rosterForMonth();$('draftBanner').hidden=!drafts[month];$('monthCaption').textContent=rows?(drafts[month]?'Draft roster · ':'Monthly roster · ')+rows.length+' days':'Monthly roster · Not published';$('empty').hidden=!!rows;
 const filter=$('search').value.trim().toLowerCase();const workers=Object.fromEntries(state.workers.map(w=>[w.id,w]));
 const filtered=(rows||[]).filter(r=>!filter||[...r.day,...r.night].some(id=>workers[id]?.name.toLowerCase().includes(filter)));
 $('roster').innerHTML=filtered.map(row=>{const date=new Date(row.date+'T12:00:00');const holiday=holidayName(row.date);const weekend=[5,6].includes(date.getDay())||!!holiday;return `<tr class="${weekend?'weekend':''}"><td><div class="day-date"><span class="date-number">${date.getDate().toString().padStart(2,'0')}</span><span class="weekday">${date.toLocaleDateString('en-GB',{weekday:'long'})}<small>${holiday?escape(holiday):weekend?'Weekend':'Weekday'}</small></span></div></td>${['day','night'].map(key=>`<td><div class="chips">${row[key].map(id=>`<span class="chip ${key==='night'?'evening':''}">${escape(workers[id]?.name||'Unknown')}</span>`).join('')||'<span class="empty-shift">Unassigned</span>'}</div></td>`).join('')}${state.admin?`<td><button class="button edit-shift" data-date="${row.date}" aria-label="Edit ${row.date}">Edit</button></td>`:''}</tr>`}).join('');
 $('rowCount').textContent=rows?`${filtered.length} of ${rows.length} days${filter?' · Filtered view':''}`:'No schedule yet';
 $('teamGrid').innerHTML=state.workers.map(w=>`<article class="person"><div class="avatar">${escape(w.name[0])}</div><h3>${escape(w.name)}</h3><p>${w.kind==='day'?'☀ Day shifts only':'☀ Day & ☾ evening shifts'}</p><p>${w.friday?'Friday & holiday daytime eligible':'No Friday / holiday daytime shifts'}</p>${state.admin?`<button class="button edit-worker" data-id="${w.id}">Edit member →</button>`:''}</article>`).join('');
 renderHolidays();renderHistory();
 document.querySelectorAll('.edit-shift').forEach(b=>b.onclick=()=>editShift(b.dataset.date));document.querySelectorAll('.edit-worker').forEach(b=>b.onclick=()=>editWorker(Number(b.dataset.id)));
}
function openModal(title,html,submit,label='Save changes'){$('dialogTitle').textContent=title;$('dialogBody').innerHTML=html;$('formError').textContent='';$('submitModal').textContent=label;$('submitModal').disabled=false;$('modalForm').onsubmit=async e=>{e.preventDefault();$('formError').textContent='';$('submitModal').disabled=true;try{await submit(new FormData(e.target));$('modal').close();await refresh();}catch(err){$('formError').textContent=err.message;}finally{$('submitModal').disabled=false;}};$('modal').showModal();}
function editShift(date){const row=rosterForMonth().find(r=>r.date===date);openModal('Edit shift · '+new Date(date+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'long'}),'<p class="help">Select the team for each shift. Day-only members are excluded from evening shifts. Friday and holiday daytime selections respect each member’s eligibility.</p>'+['day','night'].map(key=>`<fieldset><legend>${key==='day'?'Day · 09:00–17:30':'Evening · 17:30–23:30'}</legend>${state.workers.filter(w=>(key==='day'||w.kind==='both')&&(key!=='day'||!rotationDay(date)||w.friday)).map(w=>`<label><input type="checkbox" name="${key}" value="${w.id}" ${row[key].includes(w.id)?'checked':''}>${escape(w.name)}</label>`).join('')}</fieldset>`).join(''),async form=>{const day=form.getAll('day').map(Number),night=form.getAll('night').map(Number);if(day.some(id=>night.includes(id)))throw new Error('A person cannot work both shifts on the same day.');const roster=rosterForMonth().map(r=>r.date===date?{date,day,night}:r);if(drafts[month]){drafts[month]=roster;notify('Draft updated. Publish when you are ready.');}else{await api('month',{month,roster});notify('Shift updated. Everyone can see the latest schedule.');}});}
function editWorker(id){const w=state.workers.find(w=>w.id===id);openModal(w?'Edit team member':'Add team member',`<label class="field">Full name<input name="name" value="${escape(w?.name||'')}" required maxlength="60" autocomplete="off"></label><label class="field">Shift eligibility<select name="kind"><option value="both">Day & evening shifts</option><option value="day" ${w?.kind==='day'?'selected':''}>Day shifts only</option></select></label><label class="field"><input name="friday" type="checkbox" ${!w||w.friday?'checked':''}> Available for Friday & holiday daytime shifts</label><p class="help">To switch to day-only, first remove this member from any current or future evening shifts.</p>`,async form=>{await api('worker',{id,name:form.get('name'),kind:form.get('kind'),friday:form.has('friday')});notify(w?'Team member updated.':'Team member added.');});}
$('authButton').onclick=async()=>{if(state.admin){try{await api('logout',{});await refresh();notify('Signed out. You are viewing the shared schedule.');}catch(e){notify(e.message);}return;}openModal('Welcome back.',`<p class="help">Sign in to manage your team and schedule.</p><label class="field">Username<input name="username" value="admin" required autocomplete="username"></label><label class="field">Password<input name="password" type="password" required autocomplete="current-password"></label>${!state.adminConfigured?'<p class="help">Administrator access needs to be configured by the server owner.</p>':''}`,async form=>{await api('login',Object.fromEntries(form));notify('Signed in as administrator.');},'Sign in');};
function move(delta){const d=new Date(month+'-01T12:00:00');d.setMonth(d.getMonth()+delta);month=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');render();}
$('prev').onclick=()=>move(-1);$('next').onclick=()=>move(1);$('search').oninput=render;$('print').onclick=()=>window.print();
$('newMonth').onclick=()=>{if(drafts[month]){notify('Publish or discard the current draft first.');return;}if(state.months[month]){notify('This month already exists. Use Edit to update its shifts.');return;}openModal('Plan '+monthTitle(month),'<p class="help">Create a blank month and assign shifts manually. To use your team’s rotation rules instead, choose Generate this month.</p>',async()=>{const [y,m]=month.split('-').map(Number);const n=new Date(y,m,0).getDate();await api('month',{month,roster:Array.from({length:n},(_,i)=>({date:month+'-'+String(i+1).padStart(2,'0'),day:[],night:[]}))});notify('Month created. Add your team using Edit.');},'Create blank month');};
$('addWorker').onclick=()=>editWorker();$('closeModal').onclick=$('cancelModal').onclick=()=>$('modal').close();
function setTab(value){tab=value;for(const view of ['schedule','team','holidays','history']){$(view+'View').hidden=tab!==view;$(view+'Tab').classList.toggle('active',tab===view);}$('breadcrumb').textContent={schedule:'Schedule',team:'Team members',holidays:'Public holidays',history:'Shift history'}[tab];$('pageTitle').textContent={schedule:'A little more organized.',team:'Good work starts with people.',holidays:'Time off, thoughtfully covered.',history:'Every shift has a story.'}[tab];$('pageSubtitle').textContent={schedule:'Your team’s shifts, with a clear view of what’s ahead.',team:'Meet your team and keep everyone’s availability up to date.',holidays:'Algerian holidays, with one shared rotation for daytime coverage.',history:'Explore the original schedules and understand how your team’s rhythm evolved.'}[tab];}
$('scheduleTab').onclick=()=>setTab('schedule');$('teamTab').onclick=()=>setTab('team');$('holidaysTab').onclick=()=>setTab('holidays');$('historyTab').onclick=()=>setTab('history');
function renderHolidays(){
 const year=month.slice(0,4);$('holidayYear').textContent='Holiday calendar · '+year+' (selected schedule year)';
 const days={...Object.fromEntries(Object.entries(state.fixedHolidays).map(([day,name])=>[year+'-'+day,name])),...state.holidays};
 $('holidayList').innerHTML=Object.entries(days).filter(([day])=>day.startsWith(year)).sort(([a],[b])=>a.localeCompare(b)).map(([day,name])=>`<article class="person"><h3>${escape(name)}</h3><p>${new Date(day+'T12:00:00').toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'})}</p><p>One eligible employee · daytime rotation</p>${state.admin&&state.holidays[day]?`<button class="button edit-holiday" data-date="${day}">Edit date / name</button> <button class="button remove-holiday" data-date="${day}">Remove</button>`:'<p>Fixed annual public holiday</p>'}</article>`).join('');
 document.querySelectorAll('.edit-holiday').forEach(b=>b.onclick=()=>editHoliday(b.dataset.date));
 document.querySelectorAll('.remove-holiday').forEach(b=>b.onclick=()=>openModal('Remove holiday?',`<p class="help">Remove ${escape(days[b.dataset.date])} on ${b.dataset.date}? Existing schedules are unchanged.</p>`,async()=>{await api('holiday',{date:b.dataset.date,remove:true});notify('Holiday removed. Review affected schedules.');},'Remove holiday'));
}
function editHoliday(day){openModal(day?'Edit holiday':'Add confirmed holiday',`<label class="field">Date<input name="date" type="date" value="${day||month+'-01'}" required ${day?'readonly':''}></label><label class="field">Holiday name<input name="name" value="${escape(day?state.holidays[day]:'')}" maxlength="80" required></label><p class="help">For a multi-day holiday, add each date separately. Published schedules will not change automatically: regenerate or edit the affected month. To move a date, remove it and add the correct date.</p>`,async form=>{await api('holiday',Object.fromEntries(form));notify('Holiday saved. Regenerate or edit the affected month.');});}
$('addHoliday').onclick=()=>editHoliday();
let planning=false;
async function generateDraft(target){
 const result=await api('generate',{month:target});drafts[target]=result.roster;month=target;$('search').value='';notify('Schedule generated. Review the draft, then publish.');
}
async function generateMonth(target){
 if(planning)return;
 if(drafts[target]){month=target;render();notify('Review or discard the existing draft first.');return;}
 if(state.months[target]){
  openModal('Replace '+monthTitle(target)+'?', '<p class="help">Generate a replacement draft? The published schedule will remain unchanged until you review and publish the replacement.</p>',()=>generateDraft(target),'Generate replacement');return;
 }
 planning=true;$('planNext').disabled=$('generateMonth').disabled=true;
 try{await generateDraft(target);render();}catch(e){notify(e.message);}finally{planning=false;$('planNext').disabled=$('generateMonth').disabled=false;}
}
$('generateMonth').onclick=()=>generateMonth(month);
$('planNext').onclick=()=>{const d=new Date(month+'-01T12:00:00');d.setMonth(d.getMonth()+1);generateMonth(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'));};
$('discardDraft').onclick=()=>{delete drafts[month];render();notify('Draft discarded. Published schedules are unchanged.');};
$('publishDraft').onclick=()=>{const target=month;openModal(state.months[target]?'Replace published schedule?':'Publish schedule?',`<p class="help">Publish ${escape(monthTitle(target))} for everyone to view? ${state.months[target]?'This replaces the existing assignments for this month.':''}</p>`,async()=>{await api('month',{month:target,roster:drafts[target]});delete drafts[target];notify('Schedule published. Your team can now view it.');},'Publish schedule');};
window.addEventListener('beforeunload',e=>{if(Object.keys(drafts).length){e.preventDefault();e.returnValue='';}});
setInterval(()=>{if(!$('modal').open)refresh().catch(()=>{});},30000);
refresh().catch(e=>notify('Unable to load the schedule. '+e.message));

function renderHistory(){
 const available=Object.keys(historyData.sources.excel).sort().reverse();
 $('historyMonth').innerHTML=available.map(m=>`<option value="${m}" ${m===historyMonth?'selected':''}>${monthTitle(m)}</option>`).join('');
 const source=$('historySource').value;
 $('historySource').querySelector('option[value=text]').disabled=!historyData.sources.text[historyMonth];
 if(source==='text'&&!historyData.sources.text[historyMonth])$('historySource').value='excel';
 const selected=$('historySource').value;const rows=historyData.sources[selected][historyMonth]||[];
 const [y,m]=historyMonth.split('-').map(Number),count=new Date(y,m,0).getDate();
 const lookup=Object.fromEntries(rows.map(r=>[r.date,r]));const missing=[],notes=rows.filter(r=>r.sourceNote).map(r=>r.date+': '+r.sourceNote);
 $('historyRows').innerHTML=Array.from({length:count},(_,i)=>{
  const day=historyMonth+'-'+String(i+1).padStart(2,'0'),r=lookup[day],d=new Date(day+'T12:00:00');
  if(!r)missing.push(day);
  return `<tr class="${!r?'missing-record':[5,6].includes(d.getDay())?'weekend':''}"><td><div class="day-date"><span class="date-number">${String(i+1).padStart(2,'0')}</span><span class="weekday">${d.toLocaleDateString('en-GB',{weekday:'long'})}<small>${r?.sourceRow?'Excel row '+r.sourceRow:!r?'Missing source record':'Text source'}</small></span></div></td>${['day','night'].map(key=>`<td><div class="chips">${r?r[key].map(n=>`<span class="chip ${key==='night'?'evening':''}">${escape(n)}</span>`).join('')||'<span class="empty-shift">No assignment recorded</span>':'<span class="empty-shift">Not recorded — coverage unknown</span>'}</div></td>`).join('')}</tr>`;
 }).join('');
 $('historyTitle').textContent=monthTitle(historyMonth);$('historySourceLabel').textContent=selected==='excel'?'Excel workbook':'Original text';$('historyCount').textContent=rows.length+' recorded days · '+missing.length+' missing';
 $('historyWarning').hidden=!missing.length&&!notes.length;$('historyWarning').textContent=(missing.length?'Missing record: '+missing.join(', ')+'. No assignments have been invented for this date. ':'')+notes.join(' · ');
 $('sourceComparison').hidden=historyMonth!=='2026-11';
 $('comparisonRows').innerHTML=historyData.differences.map(r=>`<tr><td>${r.date}</td><td>${escape(r.text_only.join(', ')||'—')}</td><td>${escape(r.excel_only.join(', ')||'—')}</td></tr>`).join('');
}
$('historyMonth').onchange=e=>{historyMonth=e.target.value;renderHistory();};$('historySource').onchange=renderHistory;$('printHistory').onclick=()=>window.print();
