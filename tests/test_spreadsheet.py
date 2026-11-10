import unittest,json,subprocess,shutil
from pathlib import Path
from server import validate,validate_cells,NAMES
from history import combined_months,historical_special_days
from planner import generate
ROOT=Path(__file__).resolve().parents[1]
class SpreadsheetTests(unittest.TestCase):
 def setUp(self):
  self.ids={n:i+1 for i,n in enumerate(NAMES)}
  self.workers=[{'id':self.ids[n],'name':n,'kind':'day' if n in ['Sid Ali','Yougo','Lamine'] else 'both','friday':n not in ['Sid Ali','Lamine']} for n in NAMES]
  self.months=combined_months({},self.ids)
  self.first={'date':'2026-12-01','day':[3,4,5,6,7,8,9],'night':[2],'cells':[{'workerId':i,'state':'leave' if i==1 else 'working','shift':'night' if i==2 else 'day'} for i in range(1,10)]}
 def test_first_day_preserved_and_rest_follows_seed(self):
  rows=generate('2026-12',self.workers,self.months,historical_special_days(),self.first)
  self.assertEqual(rows[0],self.first)
  for row in rows[1:3]:self.assertIn(2,row['recovery']);self.assertNotIn(2,row['day']+row['night'])
  self.assertTrue(any(1 in r['day']+r['night'] for r in rows[1:])) # Leave not silently extended.
  validate(rows,'2026-12',self.workers,historical_special_days())
 def test_start_without_previous_month(self):
  first={**self.first,'date':'2029-02-01'}
  rows=generate('2029-02',self.workers,{},first_day=first)
  self.assertEqual(rows[0],first);self.assertEqual(len(rows),28)
 def test_duplicate_and_inconsistent_states_rejected(self):
  row=json.loads(json.dumps(self.first));row['cells'][0]['workerId']=2
  with self.assertRaises(ValueError):validate_cells(row,self.workers)
  row=json.loads(json.dumps(self.first));row['cells'][1]['state']='sick'
  with self.assertRaises(ValueError):validate_cells(row,self.workers)
 def test_older_cells_remain_valid_after_adding_engineer(self):
  validate_cells(self.first,self.workers+[{'id':10,'name':'New','kind':'both','friday':True}])
 @unittest.skipUnless(shutil.which('node'),'Node required for JS verification')
 def test_seeded_browser_parity_and_states(self):
  script="""const vm=require('vm'),fs=require('fs');global.window={};for(const f of ['public/sheet.js','local/engine.js'])vm.runInThisContext(fs.readFileSync(f,'utf8'));const x=JSON.parse(fs.readFileSync(0,'utf8'));window.ShiftSheet.validate(x.first,x.workers);const out=window.ShiftPlanner.generate('2026-12',x.workers,x.months,x.holidays,x.first);window.ShiftPlanner.validate(out,'2026-12',x.workers,x.holidays);console.log(JSON.stringify(out));"""
  p=subprocess.run(['node','-e',script],cwd=ROOT,input=json.dumps({'first':self.first,'workers':self.workers,'months':self.months,'holidays':historical_special_days()}),capture_output=True,text=True,check=True)
  self.assertEqual(json.loads(p.stdout),generate('2026-12',self.workers,self.months,historical_special_days(),self.first))
if __name__=='__main__':unittest.main()
