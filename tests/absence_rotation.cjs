const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');global.window={};for(const f of ['public/sheet.js','public/rotation.js','local/engine.js'])vm.runInThisContext(fs.readFileSync(f,'utf8'));const e=window.ShiftRotation,s=window.ShiftSheet;
const workers=n=>[...Array.from({length:n},(_,i)=>({id:i+1,name:'eng'+(i+1),kind:'both',friday:true})),{id:101,name:'Yougo',kind:'day',friday:true},{id:102,name:'Day only',kind:'day',friday:false}];
// Exact four-week example: columns A/B/C/D, plus two daytime-only engineers.
{
 const w=workers(4),months={'2027-07':[{date:'2027-07-30',day:[2],night:[4]},{date:'2027-07-31',day:[1],night:[4]}]},order=[1,3,2,4];
 const rows=e.generate('2027-08',w,months,{},{order,fridays:{'2027-08-06':3,'2027-08-13':1,'2027-08-20':4,'2027-08-27':2,'2027-09-03':3}});
 const initial=e.generate('2027-08',w,{},{},{order,fridays:{'2027-08-06':3,'2027-08-13':1,'2027-08-20':4,'2027-08-27':2,'2027-09-03':3}});assert(initial[0].recovery.includes(2));
 const expected=[[1,3,2,4],[4,1,3,2],[2,4,1,3],[3,2,4,1]];
 for(let week=0;week<4;week++){
  const [a,b,c,d]=expected[week],sun=e.add('2027-08-01',week*7),at=i=>rows.find(r=>r.date===e.add(sun,i));
  for(let i=0;i<3;i++)assert.deepEqual(at(i).night,[a]);for(let i=3;i<7;i++)assert.deepEqual(at(i).night,[c]);
  assert(at(0).recovery.includes(c));assert(at(0).recovery.includes(d));assert(at(1).recovery.includes(d));assert(at(1).day.includes(c));assert(at(2).day.includes(c));assert(at(2).day.includes(d));
  assert(at(3).recovery.includes(a));assert(at(4).recovery.includes(a));assert.deepEqual(at(5).day,[b]);assert.deepEqual(at(6).day,[d]);
 }
 window.ShiftPlanner.validate(rows,'2027-08',w);
}
// Six-week absence spans months: 6 -> 5 -> 6, with no change in worker eligibility.
for(const state of ['training','leave','sick']){
 const w=workers(6),absences=[{workerId:6,state,start:'2027-08-08',end:'2027-09-18'}],fridays={};for(let d='2027-07-01';d<'2027-12-01';d=e.add(d,1))if(e.weekday(d)===5)fridays[d]=101;
 const months={};let input=[1,2,3,4,5,6];
 for(const month of ['2027-08','2027-09','2027-10']){
  const before=JSON.stringify(months),continued=e.continuation(months,month+'-01');
  // A contrary requested initial order cannot reset published turns at a month boundary.
  const rows=e.generate(month,w,months,{},{order:continued?[6,5,4,3,2,1]:input,fridays,absences});assert.equal(JSON.stringify(months),before);
  for(const r of rows){const away=r.date>='2027-08-08'&&r.date<='2027-09-18';assert.equal(r.rotation.order.length,away?5:6,r.date);assert.equal(r.rotation.order.includes(6),!away,r.date);if(away){assert(!r.day.includes(6)&&!r.night.includes(6));assert.equal(r.cells.find(c=>c.workerId===6).state,state);}s.validate(r,w);}
  const previous=Object.values(months).flat(),fixed=s.recover(rows,w,previous);assert.deepEqual(fixed.map(r=>[...r.day].sort()),rows.map(r=>[...r.day].sort()),month+' recovery');
  if(continued&&rows[0].date==='2027-09-01')assert.deepEqual(rows[0].rotation.order,continued);
  window.ShiftPlanner.validate(rows,month,w);months[month]=rows;
 }
 assert(months['2027-09'].find(r=>r.date==='2027-09-19').rotation.order.includes(6));
 assert(months['2027-10'].some(r=>r.night.includes(6)));assert.equal(w.find(x=>x.id===6).kind,'both');
}
// Midweek withdrawal and return, overlapping absence rejection, and safe minimum.
{
 const w=workers(6),fridays={};for(let d='2027-08-01';d<'2027-09-10';d=e.add(d,1))if(e.weekday(d)===5)fridays[d]=101;
 const rows=e.generate('2027-08',w,{},{},{order:[1,2,3,4,5,6],fridays,absences:[{workerId:1,state:'leave',start:'2027-08-02',end:'2027-08-17'}]});
 for(const r of rows)if(r.date>='2027-08-02'&&r.date<='2027-08-17')assert(!r.day.includes(1)&&!r.night.includes(1));
 const fixed=s.recover(rows,w);assert.deepEqual(fixed.map(r=>[...r.day].sort()),rows.map(r=>[...r.day].sort()));
 assert.throws(()=>e.validateAbsences([{workerId:1,state:'sick',start:'2027-08-01',end:'2027-08-10'},{workerId:1,state:'leave',start:'2027-08-09',end:'2027-08-11'}],w),/overlap/);
 assert.throws(()=>e.generate('2027-08',w,{},{},{order:[1,2,3,4,5,6],fridays,absences:[1,2,3].map(workerId=>({workerId,state:'leave',start:'2027-08-01',end:'2027-08-31'}))}),/Fewer than four/);
}
console.log('PASS: exact four-engineer example, six-week training/leave/sick, 6-to-5-to-6, midweek changes, month continuity and safe recovery');
// Every rotating role, on every weekday: replace absent coverage without restarting other roles.
for(let workerId=1;workerId<=6;workerId++)for(let offset=0;offset<7;offset++){
 const w=workers(6),start=e.add('2027-08-01',offset),end=e.add(start,41),absences=[{workerId,state:'training',start,end}],fridays={};
 for(let d='2027-07-01';d<'2027-11-10';d=e.add(d,1))if(e.weekday(d)===5)fridays[d]=101;
 const months={};for(const month of ['2027-08','2027-09','2027-10']){
  const rows=e.generate(month,w,months,{},{order:[1,2,3,4,5,6],fridays,absences});
  const repaired=s.recover(rows,w,Object.values(months).flat());assert.deepEqual(repaired.map(r=>[...r.day].sort()),rows.map(r=>[...r.day].sort()),'role '+workerId+' weekday '+offset+' '+month);
  for(const r of rows){const absent=r.date>=start&&r.date<=end;assert.equal(r.rotation.order.length,absent?5:6);if(absent)assert(![...r.day,...r.night].includes(workerId));}
  months[month]=rows;
 }
}
console.log('PASS: availability changes for all six roles on every weekday');
