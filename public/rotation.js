/* Weekly column rotation (rules 1–8). Published rows are never mutated. */
window.ShiftRotation=(()=>{
 const clone=x=>JSON.parse(JSON.stringify(x));
 const add=(s,n)=>{const d=new Date(s+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
 const weekday=s=>new Date(s+'T12:00:00Z').getUTCDay();
 const sunday=s=>add(s,-weekday(s));
 const advance=order=>order.length===4?[order[3],order[0],order[1],order[2]]:[order.at(-1),order[0],order[1],order[2],order[3],...order.slice(4,-1)];
 function roles(workers){const n=workers.filter(w=>w.kind==='both').length;return ['A · Sunday–Tuesday nights','B · Friday / next four-night turn','C · Wednesday–Saturday nights','D · Recovery, then daytime',...Array.from({length:Math.max(0,n-4)},(_,i)=>`${String.fromCharCode(64+n)} · daytime week ${i+1} of ${n-4}`)];}
 function validateOrder(order,workers){const pool=workers.filter(w=>w.kind==='both').map(w=>w.id);if(pool.length<4)throw Error('At least four available day/evening engineers are required.');if(!Array.isArray(order)||order.length!==pool.length||new Set(order).size!==pool.length||order.some(id=>!pool.includes(id)))throw Error('Assign each day/evening engineer to exactly one weekly role.');}
 function validateAbsences(absences,workers){
  if(!Array.isArray(absences)||absences.length>2000)throw Error('Invalid absence list.');
  for(const a of absences){if(!workers.some(w=>w.id===a.workerId)||!['training','leave','sick'].includes(a.state))throw Error('Choose an engineer and absence type.');for(const d of [a.start,a.end])if(typeof d!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(d)||!Number.isFinite(+new Date(d+'T12:00:00Z'))||new Date(d+'T12:00:00Z').toISOString().slice(0,10)!==d)throw Error('Choose valid absence dates.');if(a.end<a.start)throw Error('Absence end must follow its start.');}
  for(let i=0;i<absences.length;i++)for(let j=0;j<i;j++){const a=absences[i],b=absences[j];if(a.workerId===b.workerId&&a.start<=b.end&&b.start<=a.end)throw Error('Absences for the same engineer must not overlap.');}
 }
 const absenceOn=(absences,id,date)=>absences.find(a=>a.workerId===id&&a.start<=date&&a.end>=date);
 const available=(workers,absences,date)=>workers.filter(w=>w.kind==='both'&&!absenceOn(absences,w.id,date));
 function reconcile(order,workers,absences,date){
  const ids=available(workers,absences,date).map(w=>w.id);
  if(ids.length<4)throw Error('Fewer than four day/evening engineers are available on '+date+'.');
  const core=order.slice(0,4).map(id=>ids.includes(id)?id:null),queue=order.slice(4).filter(id=>ids.includes(id)),returning=ids.filter(id=>!order.includes(id));
  // Fill a vacated core role from the oldest waiting engineer, preserving the other roles.
  for(let i=0;i<4;i++)if(!core[i])core[i]=queue.pop()??returning.shift();
  return [...core,...returning,...queue];
 }
 function continuation(months,start){
  const week=sunday(start),rows=Object.values(months).flat().filter(r=>r.date<start&&r.rotation).sort((a,b)=>b.date.localeCompare(a.date));
  const same=rows.find(r=>r.rotation.week===week);if(same)return [...same.rotation.order];
  const prior=rows.find(r=>r.rotation.week===add(week,-7));return prior?[...prior.rotation.nextOrder]:null;
 }
 function generate(month,workers,months,holidays,plan){
  const start=plan.start||month+'-01',week=sunday(start),map=new Map(workers.map(w=>[w.id,w])),absences=plan.absences||[];
  validateAbsences(absences,workers);
  if(!/^\d{4}-\d{2}$/.test(month)||start.slice(0,7)!==month||!Number.isFinite(+new Date(start+'T12:00:00Z'))||new Date(start+'T12:00:00Z').toISOString().slice(0,10)!==start)throw Error('Choose a valid starting date in this month.');
  const seed=!plan.overrideOrder&&continuation(months,start)||plan.order;
  let order=reconcile(seed||[],workers,absences,start);
  validateOrder(order,available(workers,absences,start));
  const nextMonth=new Date(month+'-01T12:00:00Z');nextMonth.setUTCMonth(nextMonth.getUTCMonth()+1);const end=add(nextMonth.toISOString().slice(0,10),-1);
  const all=new Map(Object.values(months).flat().filter(r=>r.date<start).map(r=>[r.date,r]));
  const choices=plan.fridays||{},specialChoices=plan.holidays||{},dayOnly=workers.filter(w=>w.kind==='day').map(w=>w.id);
  const fixed={'01-01':'New Year','01-12':'Yennayer','05-01':'Labour Day','07-05':'Independence Day','11-01':'Revolution Day'};
  const holiday=d=>holidays[d]||fixed[d.slice(5)];
  const eligible=(id,date)=>map.has(id)&&!!map.get(id).friday&&!absenceOn(absences,id,date);
  const restOn=date=>{const rest=new Set();for(let n=1;n<=2;n++){const r=all.get(add(date,-n)),after=all.get(add(date,-n+1));if(r&&after)for(const id of r.night)if(!after.night.includes(id))rest.add(id);}if(weekday(date)===0)for(const id of all.get(add(date,-2))?.day||[])rest.add(id);return rest;};
  let rows=[],cursor=week;
  while(cursor<=end){
   const friday=add(cursor,5),stored=Object.values(months).flat().filter(r=>r.rotation?.week===cursor).sort((a,b)=>b.date.localeCompare(a.date))[0]?.rotation;
   const picked=choices[friday]??stored?.friday??(all.get(friday)?.day.length===1?all.get(friday).day[0]:undefined);
   if(!eligible(picked,friday))throw Error('Select the Friday engineer (available) for '+friday+'.');
   let next;
   for(let offset=0;offset<7;offset++){
    const date=add(cursor,offset);if(date>end)break;if(date<start)continue;
    const old=[...order];order=reconcile(order,workers,absences,date);
    const slot=offset<3?0:2,rest=restOn(date),yesterday=all.get(add(date,-1));
    if(offset===0&&!all.has(add(cursor,-2)))rest.add(order[2]);
    // Preserve an ongoing evening block when its owner is still available.
    const ongoing=[1,2,4,5,6].includes(offset)&&yesterday?.night.length===1?yesterday.night[0]:null;
    if(ongoing!==null&&order.includes(ongoing)){const i=order.indexOf(ongoing);[order[slot],order[i]]=[order[i],order[slot]];}
    // D and the three-night recovery must survive pool-size changes.
    if(offset<2){const owner=all.get(add(cursor,-1))?.night?.[0]??old[3];if(owner!==undefined)rest.add(owner);}
    if(offset===3||offset===4){const owner=all.get(add(cursor,2))?.night?.[0]??old[0];if(owner!==undefined)rest.add(owner);}
    if(yesterday?.night.length===1&&yesterday.night[0]!==order[slot])rest.add(yesterday.night[0]);
    if(rest.has(order[slot])){const candidate=order.findIndex((id,i)=>i!==slot&&!rest.has(id)&&id!==picked);if(candidate<0)throw Error('No evening engineer is available without violating recovery on '+date+'.');[order[slot],order[candidate]]=[order[candidate],order[slot]];}
    const night=order[slot];
    if(offset>=3&&night===picked)throw Error('Friday '+friday+': selected engineer works the evening shift.');
    next=advance(order);
    if(map.get(picked).kind==='both'&&next.includes(picked)){const i=next.indexOf(picked);[next[2],next[i]]=[next[i],next[2]];}
    next=reconcile(next,workers,absences,add(cursor,7));
    let day=workers.map(w=>w.id).filter(id=>id!==night&&!rest.has(id)&&!absenceOn(absences,id,date));
    if(offset===5)day=[picked];
    else if(holiday(date)){
     const counts=new Map(),recent=new Map();for(const prior of [...all.values()].filter(r=>r.date<date).sort((a,b)=>a.date.localeCompare(b.date)))if(weekday(prior.date)===5||(prior.date>='2025-01-01'&&holiday(prior.date)))for(const id of prior.day){counts.set(id,(counts.get(id)||0)+1);recent.set(id,prior.date);}
     const candidates=day.filter(id=>eligible(id,date)).sort((a,b)=>(recent.get(a)||'').localeCompare(recent.get(b)||'')||(counts.get(a)||0)-(counts.get(b)||0)||workers.findIndex(w=>w.id===a)-workers.findIndex(w=>w.id===b));
     const chosen=specialChoices[date]??candidates[0];if(!eligible(chosen,date)||!day.includes(chosen))throw Error('Holiday coverage conflicts with availability or recovery on '+date+'.');day=[chosen];
    }else if(offset===6){
     if(!day.includes(next[0])){const i=next.findIndex(id=>day.includes(id));if(i<0)throw Error('No Saturday preparation engineer is available on '+date+'.');[next[0],next[i]]=[next[i],next[0]];}
     day=[next[0]];
    }
    let display=[...order];if(offset>=3)[display[0],display[2]]=[display[2],display[0]];
    if(offset===6){const i=display.indexOf(next[0]);if(i>=0)[display[1],display[i]]=[display[i],display[1]];}
    const absentRotating=workers.filter(w=>w.kind==='both'&&!order.includes(w.id)).map(w=>w.id);
    const cells=[...display,...absentRotating,...dayOnly].map(workerId=>({workerId,shift:workerId===night?'night':'day',state:absenceOn(absences,workerId,date)?.state|| (rest.has(workerId)?'recovery':day.includes(workerId)||workerId===night?'working':'unscheduled')}));
    const row={date,day,night:[night],recovery:[...rest].filter(id=>!absenceOn(absences,id,date)).sort((a,b)=>a-b),cells,rotation:{version:2,week:cursor,order:[...order],friday:picked,nextOrder:[...next],availableCount:order.length}};
    all.set(date,row);rows.push(row);
   }
   order=next||order;cursor=add(cursor,7);
  }
  return rows;
 }
 function swapShift(rows,date,a,b,workers){
  const row=rows.find(r=>r.date===date);if(!row)throw Error('Choose a date in the schedule.');
  if(a===b)throw Error('Choose two different engineers.');
  const result=rows.map(r=>{if(r.date!==date)return clone(r);const items=window.ShiftSheet.cells(r,workers).map(c=>({...c,workerId:c.workerId===a?b:c.workerId===b?a:c.workerId}));return {...r,...window.ShiftSheet.fromCells(date,items),recovery:items.filter(c=>c.state==='recovery').map(c=>c.workerId)};});
  return result;
 }
 return{add,weekday,sunday,advance,roles,validateOrder,validateAbsences,absenceOn,available,reconcile,continuation,generate,swapShift};
})();
