import unittest,subprocess,json,shutil
from pathlib import Path
from history import ARCHIVE,combined_months,historical_special_days
from server import NAMES
from planner import generate
ROOT=Path(__file__).resolve().parents[1]

@unittest.skipUnless(shutil.which('node'),'Node is only needed for development verification')
class LocalPlannerTests(unittest.TestCase):
    def test_browser_planner_matches_server_across_years(self):
        ids={n:i+1 for i,n in enumerate(NAMES)}
        workers=[{'id':ids[n],'name':n,'kind':'day' if n in ['Sid Ali','Yougo','Lamine'] else 'both','friday':n not in ['Sid Ali','Lamine']} for n in NAMES]
        months=combined_months({},ids);holidays=historical_special_days();holidays['2027-01-06']='Confirmed holiday'
        keys=['2026-12']+[f'2027-{m:02}' for m in range(1,13)]+[f'2028-{m:02}' for m in range(1,4)]
        script="const vm=require('vm'),fs=require('fs');global.window={};vm.runInThisContext(fs.readFileSync('local/engine.js','utf8'));const input=JSON.parse(fs.readFileSync(0,'utf8')),out={};for(const key of input.keys){const rows=window.ShiftPlanner.generate(key,input.workers,input.months,input.holidays);window.ShiftPlanner.validate(rows,key,input.workers,input.holidays);input.months[key]=rows;out[key]=rows;}process.stdout.write(JSON.stringify(out));"
        proc=subprocess.run(['node','-e',script],cwd=ROOT,input=json.dumps({'keys':keys,'workers':workers,'months':months,'holidays':holidays}),capture_output=True,text=True,check=True)
        actual=json.loads(proc.stdout)
        for key in keys:
            expected=generate(key,workers,months,holidays);self.assertEqual(actual[key],expected,key);months[key]=expected
    def test_local_storage_authentication_backup_and_rollback(self):
        script=r"""
const vm=require('vm'),fs=require('fs'),assert=require('assert');global.window={};global.crypto=require('crypto').webcrypto;const saved={};let quota=false;global.localStorage={getItem:k=>saved[k]||null,setItem:(k,v)=>{if(quota)throw Error('quota');saved[k]=v;}};
vm.runInThisContext(fs.readFileSync('local/engine.js','utf8'));window.LOCAL_ARCHIVE=JSON.parse(fs.readFileSync('resources/history.json','utf8'));const names=['Billel','Samir','Walid','Abderrahim','Sid Ali','Yougo','Lamine','Amine','Oumama'],ids=Object.fromEntries(names.map((n,i)=>[n,i+1]));window.LOCAL_CONFIG={seed:{workers:names.map(n=>({id:ids[n],name:n,kind:['Sid Ali','Yougo','Lamine'].includes(n)?'day':'both',friday:!['Sid Ali','Lamine'].includes(n)})),months:{},holidays:{},identities:ids}};global.ShiftPlanner=window.ShiftPlanner;vm.runInThisContext(fs.readFileSync('local/storage.js','utf8'));const local=window.LocalShift;
(async()=>{await assert.rejects(local.api('worker',{name:'Blocked',kind:'both',friday:true}));await local.api('setup',{password:'TestLocalPassword123!'});assert(!(await local.api('state')).password);await local.api('worker',{name:'New person',kind:'day',friday:true});const backup=local.exportData();assert(!JSON.stringify(backup).includes('TestLocalPassword'));assert(!backup.data.password);quota=true;await assert.rejects(local.api('worker',{name:'Not saved',kind:'both',friday:true}));quota=false;assert(!(await local.api('state')).workers.some(w=>w.name==='Not saved'));const broken=JSON.parse(JSON.stringify(backup));broken.data.workers[0].id=broken.data.workers[1].id;assert.throws(()=>local.restore(broken));local.restore(backup);assert(!local.shared().seed.password);await local.api('logout',{});await assert.rejects(local.api('login',{username:'admin',password:'wrong'}));await local.api('login',{username:'admin',password:'TestLocalPassword123!'});assert((await local.api('state')).admin);console.log('PASS');})().catch(e=>{console.error(e);process.exitCode=1});
"""
        result=subprocess.run(['node','-e',script],cwd=ROOT,capture_output=True,text=True,check=True)
        self.assertIn('PASS',result.stdout)

if __name__=='__main__':unittest.main()
