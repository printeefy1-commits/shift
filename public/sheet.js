window.ShiftSheet=(()=>{
 const states={working:'Working',recovery:'Récupération',training:'Formation',leave:'Congé',sick:'Maladie + vaccin',fridayHoliday:'Vendredi + jour férié',saturday:'Samedi',telework:'Télétravail',unscheduled:'Not scheduled'};
 const active=s=>['working','telework','fridayHoliday','saturday'].includes(s);
 function cells(row,workers){const saved=row.cells||[],seen=new Set(saved.map(c=>c.workerId));if(saved.length)return [...saved,...workers.filter(w=>!seen.has(w.id)).map(w=>({workerId:w.id,state:'unscheduled',shift:'day'}))];const order=[...row.night,...row.day,...workers.map(w=>w.id)].filter((id,i,a)=>a.indexOf(id)===i);return order.map(id=>({workerId:id,state:row.night.includes(id)||row.day.includes(id)?'working':row.recovery?.includes(id)?'recovery':'unscheduled',shift:row.night.includes(id)?'night':'day'}));}
 function fromCells(date,items){return{date,day:items.filter(c=>active(c.state)&&c.shift==='day').map(c=>c.workerId),night:items.filter(c=>active(c.state)&&c.shift==='night').map(c=>c.workerId),cells:items.map(c=>({...c}))};}
 function validate(row,workers){if(!row.cells)return;const ids=new Set(workers.map(w=>w.id));if(!Array.isArray(row.cells)||row.cells.length>workers.length||new Set(row.cells.map(c=>c.workerId)).size!==row.cells.length||row.cells.some(c=>!ids.has(c.workerId)||!Object.hasOwn(states,c.state)||!['day','night'].includes(c.shift)))throw Error('Each engineer must appear once, with a valid state and shift.');const projected=fromCells(row.date,row.cells);for(const key of ['day','night'])if(JSON.stringify([...projected[key]].sort())!==JSON.stringify([...row[key]].sort()))throw Error('Engineer states do not match the shift assignments.');}

 const nextDate=(date,n)=>{const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
 function recover(rows,workers,previous=[]){
  const result=JSON.parse(JSON.stringify(rows)),all=new Map([...previous,...result].map(r=>[r.date,r])),rest=new Map();
  for(const r of all.values())for(const id of r.night){const next=all.get(nextDate(r.date,1));if(next&&!next.night.includes(id))for(let n=1;n<=2;n++){const d=nextDate(r.date,n);if(!rest.has(d))rest.set(d,new Set());rest.get(d).add(id);}}
  for(const r of all.values())if(new Date(r.date+'T12:00:00Z').getUTCDay()===5)for(const id of r.day){const d=nextDate(r.date,2);if(!rest.has(d))rest.set(d,new Set());rest.get(d).add(id);}
  return result.map(r=>{const items=cells(r,workers);for(const id of rest.get(r.date)||[]){const c=items.find(c=>c.workerId===id);if(c&&r.night.includes(id))throw Error('Recovery conflict on '+r.date+': an engineer needs two full days off after an evening block.');if(c){c.state='recovery';c.shift='day';}}const row={...r,...fromCells(r.date,items)};row.recovery=items.filter(c=>c.state==='recovery').map(c=>c.workerId);return row;});
 }
 function swap(rows,date,a,b,workers,onlyDate=false){if(a===b)throw Error('Choose two different engineers.');return rows.map(r=>{if(r.date<date||(onlyDate&&r.date!==date))return r;return fromCells(r.date,cells(r,workers).map(c=>({...c,workerId:c.workerId===a?b:c.workerId===b?a:c.workerId})));});}
 return{states,active,cells,fromCells,validate,recover,swap};
})();
