const vm=require('vm'),fs=require('fs'),assert=require('node:assert/strict');global.window={};for(const f of ['public/sheet.js','public/rotation.js','local/engine.js'])vm.runInThisContext(fs.readFileSync(f,'utf8'));
const engine=window.ShiftRotation,sheet=window.ShiftSheet;
const makeWorkers=n=>[...Array.from({length:n},(_,i)=>({id:i+1,name:'Engineer '+(i+1),kind:'both',friday:true})),{id:101,name:'Yougo',kind:'day',friday:true},{id:102,name:'Sid Ali',kind:'day',friday:false},{id:103,name:'Lamine',kind:'day',friday:false}];
const choices={'2027-08-06':101,'2027-08-13':101,'2027-08-20':101,'2027-08-27':101,'2027-09-03':101,'2027-09-10':101,'2027-09-17':101,'2027-09-24':101,'2027-10-01':101};
for(const n of [5,6,7]){
 const workers=makeWorkers(n),order=workers.filter(w=>w.kind==='both').map(w=>w.id),input={};
 const rows=engine.generate('2027-08',workers,input,{}, {order,fridays:choices});
 assert.deepEqual(input,{});assert.equal(rows.length,31);window.ShiftPlanner.validate(rows,'2027-08',workers);
 const at=d=>rows.find(r=>r.date===d),nightStart=engine.add('2027-08-01',(n-3)*7);
 // D -> 1/2/3 weeks in the daytime stage -> Saturday preparation -> 3 nights.
 for(let k=1;k<=n-4;k++){
  const sun=engine.add('2027-08-01',k*7);for(let offset=0;offset<5;offset++)assert(at(engine.add(sun,offset)).day.includes(4));
 }
 assert.deepEqual(at(engine.add(nightStart,-1)).day,[4]);for(let i=0;i<3;i++)assert.deepEqual(at(engine.add(nightStart,i)).night,[4]);
 for(let i=3;i<5;i++){const row=at(engine.add(nightStart,i));if(row)assert(row.recovery.includes(4));}
 // Every generated row keeps all daytime-only engineers in the final three columns.
 for(const row of rows){assert.deepEqual(row.cells.slice(-3).map(c=>c.workerId),[101,102,103]);assert.equal(new Set(row.cells.map(c=>c.workerId)).size,workers.length);sheet.validate(row,workers);}
 assert.deepEqual(at('2027-08-06').day,[101]);assert(at('2027-08-08').recovery.includes(101));assert(!at('2027-08-08').day.includes(101));
 // When Yougo works Friday, B's engineer (2) takes next Wednesday's four nights.
 for(const d of ['2027-08-11','2027-08-12','2027-08-13','2027-08-14'])assert.deepEqual(at(d).night,[2]);
 assert(at('2027-08-15').recovery.includes(2));assert(at('2027-08-16').recovery.includes(2));assert(at('2027-08-17').day.includes(2));
 const after=sheet.recover(rows,workers);assert.deepEqual(after.map(r=>[...r.day].sort()),rows.map(r=>[...r.day].sort()));assert.deepEqual(after.map(r=>r.rotation),rows.map(r=>r.rotation));
 const aug=JSON.stringify(rows),meta=at('2027-08-31').rotation;
 const september=engine.generate('2027-09',workers,{'2027-08':rows},{},{order:meta.order,fridays:choices});
 window.ShiftPlanner.validate(september,'2027-09',workers);assert.equal(JSON.stringify(rows),aug);
 // Interrupted blocks and Friday rest remain valid across a calendar boundary.
 const repaired=sheet.recover(september,workers,rows);assert.deepEqual(repaired.map(r=>[...r.day].sort()),september.map(r=>[...r.day].sort()));
}
const workers=makeWorkers(6),order=[1,2,3,4,5,6];
assert.throws(()=>engine.generate('2027-08',workers,{},{},{order,fridays:{}}),/Select the Friday/);
assert.throws(()=>engine.generate('2027-08',workers,{},{},{order:[1,1,3,4,5,6],fridays:choices}),/exactly one/);
assert.throws(()=>engine.generate('2027-08',workers,{},{},{order,fridays:{...choices,'2027-08-06':102}}),/Select the Friday/);
assert.throws(()=>engine.generate('2027-08',workers,{},{},{order,fridays:{...choices,'2027-08-06':3}}),/evening/);
// Administrator chooses a different eligible Friday engineer; that engineer gets the four-night turn next week.
const rows=engine.generate('2027-08',workers,{},{},{order,fridays:{...choices,'2027-08-06':5}});assert(rows.find(r=>r.date==='2027-08-08').recovery.includes(5));assert.deepEqual(rows.find(r=>r.date==='2027-08-11').night,[5]);
// One-shift swaps affect exactly one date and two engineers; all other rows stay unchanged.
const changed=engine.swapShift(rows,'2027-08-03',5,6,workers);for(let i=0;i<rows.length;i++)if(rows[i].date!=='2027-08-03')assert.deepEqual(changed[i],rows[i]);
assert.equal(changed.find(r=>r.date==='2027-08-03').cells[4].workerId,6);assert.equal(rows.find(r=>r.date==='2027-08-03').cells[4].workerId,5);
const holiday=engine.generate('2027-08',workers,{}, {'2027-08-04':'Test holiday'},{order,fridays:choices,holidays:{'2027-08-04':101}});assert.deepEqual(holiday.find(r=>r.date==='2027-08-04').day,[101]);
const automatic=engine.generate('2027-08',workers,{}, {'2027-08-04':'Test holiday'},{order,fridays:choices});assert.equal(automatic.find(r=>r.date==='2027-08-04').day.length,1);assert(!automatic.find(r=>r.date==='2027-08-04').day.some(id=>[102,103].includes(id)));
console.log('PASS: 5/6/7 engineers, column queues, both recovery patterns, Friday selection and Yougo exception, day-only columns, month continuity, isolated swaps and holidays');
// Repeat across two years, fixed holidays, month boundaries and leap February.
{
 const workers=makeWorkers(6),months={},fridays={};for(let d='2027-01-01';d<'2029-02-01';d=engine.add(d,1))if(engine.weekday(d)===5)fridays[d]=101;
 let order=[1,2,3,4,5,6];
 for(let year=2027;year<=2028;year++)for(let m=1;m<=12;m++){
  const month=`${year}-${String(m).padStart(2,'0')}`,week=engine.sunday(month+'-01'),prior=Object.values(months).flat();
  const same=prior.find(r=>r.rotation.week===week),previous=prior.find(r=>r.rotation.week===engine.add(week,-7));
  order=same?.rotation.order||previous?.rotation.nextOrder||order;
  const rows=engine.generate(month,workers,months,{},{order,fridays});window.ShiftPlanner.validate(rows,month,workers);
  const repaired=sheet.recover(rows,workers,prior);
  assert.deepEqual(repaired.map(r=>[...r.day].sort()),rows.map(r=>[...r.day].sort()),month);
  months[month]=rows;
 }
 assert.equal(months['2028-02'].length,29);
}
console.log('PASS: two-year continuation and leap-year coverage');
