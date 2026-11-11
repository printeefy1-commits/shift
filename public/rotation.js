/* Weekly column rotation (rules 1–8). Published rows are never mutated. */
window.ShiftRotation=(()=>{
 const clone=x=>JSON.parse(JSON.stringify(x));
 const add=(s,n)=>{const d=new Date(s+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
 const weekday=s=>new Date(s+'T12:00:00Z').getUTCDay();
 const sunday=s=>add(s,-weekday(s));
 const advance=order=>[order.at(-1),order[0],order[1],order[2],order[3],...order.slice(4,-1)];
 function roles(workers){const n=workers.filter(w=>w.kind==='both').length;return ['A · Sunday–Tuesday nights','B · Friday / next four-night turn','C · Wednesday–Saturday nights','D · Recovery, then daytime',...Array.from({length:Math.max(0,n-4)},(_,i)=>`${String.fromCharCode(64+n)} · daytime week ${i+1} of ${n-4}`)];}
 function validateOrder(order,workers){const pool=workers.filter(w=>w.kind==='both').map(w=>w.id);if(pool.length<5)throw Error('Rules 1–8 require at least five day/evening engineers.');if(!Array.isArray(order)||order.length!==pool.length||new Set(order).size!==pool.length||order.some(id=>!pool.includes(id)))throw Error('Assign each day/evening engineer to exactly one weekly role.');}
 function generate(month,workers,months,holidays,plan){
  const start=plan.start||month+'-01',week=sunday(start),map=new Map(workers.map(w=>[w.id,w]));
  if(!/^\d{4}-\d{2}$/.test(month)||start.slice(0,7)!==month||!Number.isFinite(+new Date(start+'T12:00:00Z')))throw Error('Choose a valid starting date in this month.');
  validateOrder(plan.order,workers);
  const nextMonth=new Date(month+'-01T12:00:00Z');nextMonth.setUTCMonth(nextMonth.getUTCMonth()+1);const end=add(nextMonth.toISOString().slice(0,10),-1);
  const all=new Map(Object.values(months).flat().map(r=>[r.date,r]));
  const choices=plan.fridays||{},specialChoices=plan.holidays||{},dayOnly=workers.filter(w=>w.kind==='day').map(w=>w.id);
  const fixed={'01-01':'New Year','01-12':'Yennayer','05-01':'Labour Day','07-05':'Independence Day','11-01':'Revolution Day'};
  const holiday=d=>holidays[d]||fixed[d.slice(5)];
  const eligible=id=>map.has(id)&&!!map.get(id).friday;
  // Persisted weekly metadata continues the queue across month boundaries.
  let order=[...plan.order],rows=[],cursor=week;
  while(cursor<=end){
   const friday=add(cursor,5),picked=choices[friday]??all.get(friday)?.rotation?.friday??(all.get(friday)?.day.length===1?all.get(friday).day[0]:undefined);
   if(!eligible(picked))throw Error('Select the Friday engineer for '+friday+'.');
   if(picked===order[2])throw Error('Friday '+friday+': this engineer already works the evening shift.');
   let next=advance(order);
   // A daytime-only Friday engineer (including Yougo) leaves B's night turn intact.
   if(map.get(picked).kind==='both'){const i=next.indexOf(picked);[next[2],next[i]]=[next[i],next[2]];}
   const previousFriday=all.get(add(cursor,-2));
   const lastFriday=previousFriday?.day?.length===1?previousFriday.day[0]:null;
   for(let offset=0;offset<7;offset++){
    const date=add(cursor,offset);if(date>end)break;
    const night=offset<3?order[0]:order[2],rest=new Set();
    if(offset<2)rest.add(order[3]);if(offset===3||offset===4)rest.add(order[0]);if(offset===0&&lastFriday!==null)rest.add(lastFriday);
    if(rest.has(night))throw Error('Recovery conflicts with the evening turn on '+date+'. Check the initial weekly roles.');
    let day=workers.map(w=>w.id).filter(id=>id!==night&&!rest.has(id));
    if(offset===5)day=[picked];
    else if(holiday(date)){
     const counts=new Map(),recent=new Map();for(const prior of [...all.values()].filter(r=>r.date<date).sort((a,b)=>a.date.localeCompare(b.date)))if(weekday(prior.date)===5||(prior.date>='2025-01-01'&&holiday(prior.date)))for(const id of prior.day){counts.set(id,(counts.get(id)||0)+1);recent.set(id,prior.date);}
     const candidates=day.filter(eligible).sort((a,b)=>(recent.get(a)||'').localeCompare(recent.get(b)||'')||(counts.get(a)||0)-(counts.get(b)||0)||workers.findIndex(w=>w.id===a)-workers.findIndex(w=>w.id===b));
     const chosen=specialChoices[date]??candidates[0];
     if(!eligible(chosen))throw Error('Select the holiday engineer for '+date+'.');
     if(!day.includes(chosen))throw Error('Holiday coverage conflicts with a night shift or recovery on '+date+'.');
     day=[chosen];
    }else if(offset===6){day=[next[0]];if(day[0]===night||rest.has(day[0]))throw Error('Saturday preparation conflicts with recovery on '+date+'.');}
    let display=[...order];
    if(offset>=3)[display[0],display[2]]=[display[2],display[0]];
    if(offset===6){const i=display.indexOf(next[0]);[display[1],display[i]]=[display[i],display[1]];}
    const cells=[...display,...dayOnly].map(workerId=>({workerId,shift:workerId===night?'night':'day',state:rest.has(workerId)?'recovery':day.includes(workerId)||workerId===night?'working':'unscheduled'}));
    const row={date,day,night:[night],recovery:[...rest].sort((a,b)=>a-b),cells,rotation:{version:1,week:cursor,order:[...order],friday:picked,nextOrder:[...next]}};
    // Keep contextual weekdays for the next week's Friday-rest calculation.
    all.set(date,row);if(date>=start)rows.push(row);
   }
   order=next;cursor=add(cursor,7);
  }
  return rows;
 }
 function swapShift(rows,date,a,b,workers){
  const row=rows.find(r=>r.date===date);if(!row)throw Error('Choose a date in the schedule.');
  if(a===b)throw Error('Choose two different engineers.');
  const result=rows.map(r=>{if(r.date!==date)return clone(r);const items=window.ShiftSheet.cells(r,workers).map(c=>({...c,workerId:c.workerId===a?b:c.workerId===b?a:c.workerId}));return {...r,...window.ShiftSheet.fromCells(date,items),recovery:items.filter(c=>c.state==='recovery').map(c=>c.workerId)};});
  return result;
 }
 return{add,weekday,sunday,advance,roles,validateOrder,generate,swapShift};
})();
