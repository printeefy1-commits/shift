import unittest, tempfile, json, threading, urllib.request, urllib.error, os, subprocess, shutil
from pathlib import Path
import server

class ShiftTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp=tempfile.TemporaryDirectory(); server.DB=Path(cls.tmp.name)/'test.db'
        os.environ['SHIFT_ADMIN_PASSWORD']='test-password-1234';server.initialize();del os.environ['SHIFT_ADMIN_PASSWORD']
        cls.http=server.ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
        cls.base='http://127.0.0.1:'+str(cls.http.server_port)
        threading.Thread(target=cls.http.serve_forever,daemon=True).start()
    @classmethod
    def tearDownClass(cls): cls.http.shutdown();cls.http.server_close();cls.tmp.cleanup()
    def setUp(self):
        with server.connect() as c:
            c.execute("DELETE FROM holidays");c.execute("DELETE FROM workers");c.execute("DELETE FROM months");c.execute("DELETE FROM settings WHERE key='initialized'")
        server.initialize()
    def request(self,path,data=None,cookie=None):
        headers={'Content-Type':'application/json'}
        if cookie: headers['Cookie']=cookie
        req=urllib.request.Request(self.base+path,data=None if data is None else json.dumps(data).encode(),headers=headers)
        return urllib.request.urlopen(req)
    @unittest.skipUnless(shutil.which('node'),'Node required for weekly planner integration')
    def test_weekly_rotation_asset_and_publication_roundtrip(self):
        self.assertIn(b'window.ShiftRotation',self.request('/rotation.js').read())
        state=json.load(self.request('/api/state'))
        script="""const fs=require('fs'),vm=require('vm');global.window={};vm.runInThisContext(fs.readFileSync('public/rotation.js','utf8'));const w=JSON.parse(fs.readFileSync(0,'utf8'));process.stdout.write(JSON.stringify(window.ShiftRotation.generate('2027-08',w,{},{},{order:[1,2,3,4,8,9],fridays:{'2027-08-06':6,'2027-08-13':6,'2027-08-20':6,'2027-08-27':6,'2027-09-03':6}})));"""
        proc=subprocess.run(['node','-e',script],cwd=Path(server.__file__).parent,input=json.dumps(state['workers']),capture_output=True,text=True,check=True)
        rows=json.loads(proc.stdout)
        login=self.request('/api/login',{'username':'admin','password':'test-password-1234'});cookie=login.headers['Set-Cookie'].split(';')[0]
        self.request('/api/month',{'month':'2027-08','roster':rows},cookie)
        saved=json.load(self.request('/api/state'))
        self.assertEqual(saved['months']['2027-08'],rows)
        self.assertEqual(saved['months']['2026-11'],state['months']['2026-11'])

    def test_history_read_only_api(self):
        archive=json.load(self.request('/api/history'))
        self.assertEqual(archive['metadata']['days'],1064)
        self.assertEqual(len(archive['sources']['excel']),35)
        login=self.request('/api/login',{'username':'admin','password':'test-password-1234'})
        cookie=login.headers['Set-Cookie'].split(';')[0]
        with self.assertRaises(urllib.error.HTTPError) as e:self.request('/api/history',{'month':'2024-01','roster':[]},cookie)
        self.assertEqual(e.exception.code,404)
    def test_contacts_and_column_times(self):
        state=json.load(self.request('/api/state'))
        self.assertTrue(all(w['phone'] and w['fullName'] for w in state['workers']))
        login=self.request('/api/login',{'username':'admin','password':'test-password-1234'});cookie=login.headers['Set-Cookie'].split(';')[0]
        self.request('/api/preferences',{'columnTimes':[{'start':'16:00','end':'22:00'}]},cookie)
        self.assertEqual(json.load(self.request('/api/state'))['columnTimes'][0]['start'],'16:00')
        with self.assertRaises(urllib.error.HTTPError):self.request('/api/preferences',{'columnTimes':[{'start':'24:00','end':'22:00'}]},cookie)
    def test_seed_matches_supplied_month(self):
        state=json.load(self.request('/api/state')); rows=state['months']['2026-11']
        self.assertEqual(len(rows),30);self.assertEqual(len(state['workers']),9)
        self.assertEqual(rows[0],{'date':'2026-11-01','day':[1],'night':[2]})
        self.assertEqual(rows[-1]['night'],[3]);self.assertEqual(rows[9]['day'],[1,2,5,6,7,8,9,3])
        server.validate(rows,'2026-11',state['workers'])
    def test_generate_is_private_and_requires_admin(self):
        with self.assertRaises(urllib.error.HTTPError) as e:self.request('/api/generate',{'month':'2026-12'})
        self.assertEqual(e.exception.code,401)
        login=self.request('/api/login',{'username':'admin','password':'test-password-1234'})
        cookie=login.headers['Set-Cookie'].split(';')[0]
        result=json.load(self.request('/api/generate',{'month':'2026-12'},cookie))
        self.assertEqual(len(result['roster']),31)
        self.assertNotIn('2026-12',json.load(self.request('/api/state'))['months'])
    def test_holiday_management_and_validation(self):
        with self.assertRaises(urllib.error.HTTPError) as e:self.request('/api/holiday',{'date':'2026-12-02','name':'Test holiday'})
        self.assertEqual(e.exception.code,401)
        login=self.request('/api/login',{'username':'admin','password':'test-password-1234'})
        cookie=login.headers['Set-Cookie'].split(';')[0]
        self.request('/api/holiday',{'date':'2026-12-02','name':'Test holiday'},cookie)
        state=json.load(self.request('/api/state'));self.assertEqual(state['holidays']['2026-12-02'],'Test holiday')
        rows=json.load(self.request('/api/generate',{'month':'2026-12'},cookie))['roster']
        self.assertEqual(len(rows[1]['day']),1)
        rows[1]['day']=[5]
        with self.assertRaisesRegex(ValueError,'holiday'):server.validate(rows,'2026-12',state['workers'],state['holidays'])
        self.request('/api/holiday',{'date':'2026-12-02','remove':True},cookie)
        self.assertNotIn('2026-12-02',json.load(self.request('/api/state'))['holidays'])
    def test_public_cannot_write(self):
        with self.assertRaises(urllib.error.HTTPError) as e:self.request('/api/worker',{'name':'Intruder','kind':'both'})
        self.assertEqual(e.exception.code,401)
    def test_admin_and_eligibility(self):
        login=self.request('/api/login',{'username':'admin','password':'test-password-1234'});cookie=login.headers['Set-Cookie'].split(';')[0]
        self.request('/api/worker',{'name':'New member','kind':'day'},cookie)
        state=json.load(self.request('/api/state'));rows=state['months']['2026-11'];rows[0]['night']=[5]
        with self.assertRaises(urllib.error.HTTPError) as e:self.request('/api/month',{'month':'2026-11','roster':rows},cookie)
        self.assertEqual(e.exception.code,400)
        rows[0]['night']=[2];rows[0]['day']=[3]
        self.request('/api/month',{'month':'2026-11','roster':rows},cookie)
        self.assertEqual(json.load(self.request('/api/state'))['months']['2026-11'][0]['day'],[3])
        self.request('/api/logout',{},cookie)
        with self.assertRaises(urllib.error.HTTPError):self.request('/api/worker',{'name':'Blocked','kind':'both'},cookie)
    def test_friday_eligibility_is_enforced(self):
        state=json.load(self.request('/api/state'))
        self.assertEqual([w['name'] for w in state['workers'] if not w['friday']],['Sid Ali','Lamine'])
        rows=state['months']['2026-11'];rows[5]['day']=[5]
        with self.assertRaisesRegex(ValueError,'Friday'):server.validate(rows,'2026-11',state['workers'])
    def test_same_day_double_shift_rejected(self):
        state=json.load(self.request('/api/state'));rows=state['months']['2026-11'];rows[0]['day']=rows[0]['night']
        with self.assertRaisesRegex(ValueError,'both shifts'):server.validate(rows,'2026-11',state['workers'])

if __name__=='__main__':unittest.main()
