import os, json, sqlite3, secrets, hashlib, hmac, time, calendar
from pathlib import Path
from datetime import date
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from http.cookies import SimpleCookie
from planner import generate
from history import ARCHIVE, combined_months, historical_special_days
from holidays import FIXED, holiday_name, is_rotation_day

ROOT = Path(__file__).parent
DB = Path(os.environ.get('SHIFT_DB', ROOT / 'data/shift.db'))
SESSIONS = {}
NAMES = ['Billel','Samir','Walid','Abderrahim','Sid Ali','Yougo','Lamine','Amine','Oumama']
# Exact transcription of the supplied November 2026 roster.
DAY = ['B','W A S Y L M','W A S Y L M B','O A S Y L M B','O A S Y L M B','O','A','B R S Y L M','B R S Y L M O','B R S Y L M O W','R S Y L O W','R S Y L M O W','R','M','O W S Y L A','O W S Y L A R','O W S Y L A R B','O W S Y L A B','O W S Y L A B','Y','O','B M S Y L A W','B M S Y L A W','B M S R L A W','B M S R L Y W','B M S R L Y W','M','W','B R S Y L O','B R S Y L O M']
NIGHT = ['R']*3+['W']*4+['A']*3+['B']*4+['M']*3+['R']*4+['O']*3+['A']*4+['W']*2
CODES = dict(zip('BRWASYLMO', NAMES))

def connect():
    c=sqlite3.connect(DB); c.row_factory=sqlite3.Row; return c

def initialize():
    DB.parent.mkdir(parents=True, exist_ok=True)
    with connect() as c:
        c.executescript('CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT); CREATE TABLE IF NOT EXISTS workers(id INTEGER PRIMARY KEY,name TEXT NOT NULL,kind TEXT NOT NULL); CREATE TABLE IF NOT EXISTS months(month TEXT PRIMARY KEY,roster TEXT NOT NULL);')
        c.execute('CREATE TABLE IF NOT EXISTS holidays(day TEXT PRIMARY KEY, name TEXT NOT NULL)')
        if 'friday' not in {r['name'] for r in c.execute('PRAGMA table_info(workers)')}:
            c.execute('ALTER TABLE workers ADD COLUMN friday INTEGER NOT NULL DEFAULT 1')
            c.execute("UPDATE workers SET friday=0 WHERE lower(replace(name,' ','')) IN ('sidali','lamine')")
        if not c.execute('SELECT 1 FROM settings WHERE key="initialized"').fetchone():
            for name in NAMES: c.execute('INSERT INTO workers(name,kind,friday) VALUES (?,?,?)',(name,'day' if name in ['Sid Ali','Yougo','Lamine'] else 'both',int(name not in ['Sid Ali','Lamine'])))
            ids={r['name']:r['id'] for r in c.execute('SELECT * FROM workers')}
            roster=[{'date':f'2026-11-{i+1:02}', 'day':[ids[CODES[x]] for x in s.split()], 'night':[ids[CODES[NIGHT[i]]]]} for i,s in enumerate(DAY)]
            c.execute('INSERT INTO months VALUES (?,?)',('2026-11',json.dumps(roster)))
            c.execute('INSERT INTO settings VALUES ("initialized","1")')
        if not c.execute("SELECT 1 FROM settings WHERE key='history_worker_ids'").fetchone():
            identities={r['name']:r['id'] for r in c.execute('SELECT * FROM workers')}
            required={n for rows in ARCHIVE['sources']['excel'].values() for r in rows for n in r['day']+r['night']}
            if not required.issubset(identities): raise ValueError('History import needs the original worker names to be mapped to IDs.')
            c.execute("INSERT INTO settings VALUES ('history_worker_ids',?)",(json.dumps({n:identities[n] for n in required}),))
        password=os.environ.get('SHIFT_ADMIN_PASSWORD')
        if password and not c.execute('SELECT 1 FROM settings WHERE key="password"').fetchone():
            if len(password)<12: raise ValueError('SHIFT_ADMIN_PASSWORD must contain at least 12 characters')
            salt=secrets.token_hex(16)
            digest=hashlib.scrypt(password.encode(),salt=salt.encode(),n=16384,r=8,p=1).hex()
            c.execute('INSERT INTO settings VALUES ("password",?)',(salt+':'+digest,))

def validate(roster, month, workers, holidays=None):
    try:
        y,m=map(int,month.split('-')); count=calendar.monthrange(y,m)[1]
    except (ValueError,TypeError): raise ValueError('Choose a valid month.')
    if not isinstance(roster,list) or len(roster)!=count: raise ValueError('The month must contain every calendar day.')
    kinds={w['id']:w['kind'] for w in workers}
    no_friday={w['id'] for w in workers if not w.get('friday',1)}
    for i,row in enumerate(roster):
        if row.get('date')!=f'{month}-{i+1:02}': raise ValueError('Dates must match the selected month.')
        for key in ['day','night']:
            ids=row.get(key)
            if not isinstance(ids,list) or any(type(x)!=int or x not in kinds for x in ids) or len(ids)!=len(set(ids)): raise ValueError('Invalid employee selection.')
        if is_rotation_day(row['date'],holidays) and no_friday.intersection(row['day']): raise ValueError('An employee selected for Friday / holiday daytime is not eligible.')
        if set(row['day']) & set(row['night']): raise ValueError('A person cannot work both shifts on the same day.')
        if any(kinds[x]=='day' for x in row['night']): raise ValueError('Day-only employees cannot work evening shifts.')

class Handler(BaseHTTPRequestHandler):
    def send(self,status,data):
        raw=json.dumps(data).encode(); self.send_response(status); self.send_header('Content-Type','application/json'); self.send_header('Cache-Control','no-store'); self.send_header('X-Content-Type-Options','nosniff'); self.end_headers(); self.wfile.write(raw)
    def authenticated(self):
        cookie=SimpleCookie()
        try: cookie.load(self.headers.get('Cookie',''))
        except Exception: return False
        token=cookie.get('shift_session'); return bool(token and SESSIONS.get(token.value,0)>time.time())
    def do_GET(self):
        if self.path=='/api/history':
            self.send(200,ARCHIVE); return
        if self.path=='/api/state':
            with connect() as c:
                self.send(200,{'holidays':dict(c.execute('SELECT day,name FROM holidays').fetchall()),'fixedHolidays':FIXED,'historySummary':ARCHIVE['metadata'],'admin':self.authenticated(),'adminConfigured':bool(c.execute('SELECT 1 FROM settings WHERE key="password"').fetchone()),'workers':[dict(r) for r in c.execute('SELECT * FROM workers')], 'months':{r['month']:json.loads(r['roster']) for r in c.execute('SELECT * FROM months')}})
            return
        paths={'/':'index.html','/app.js':'app.js','/style.css':'style.css'}
        if self.path not in paths: self.send(404,{'error':'Not found'}); return
        p=ROOT/'public'/paths[self.path]; self.send_response(200); self.send_header('Content-Type',{'html':'text/html','js':'text/javascript','css':'text/css'}[p.suffix[1:]]+'; charset=utf-8'); self.send_header('X-Content-Type-Options','nosniff'); self.send_header('Content-Security-Policy',"default-src 'self'; style-src 'self'; script-src 'self'; frame-ancestors 'none'"); self.end_headers(); self.wfile.write(p.read_bytes())
    def do_POST(self):
        # Same-origin requests only, including when deployed behind an HTTPS proxy.
        origin=self.headers.get('Origin')
        if origin:
            from urllib.parse import urlsplit
            if urlsplit(origin).netloc!=self.headers.get('Host'): self.send(403,{'error':'Invalid request origin'}); return
        try:
            size=int(self.headers.get('Content-Length','0'))
            if size>1000000: raise ValueError('Request too large')
            body=json.loads(self.rfile.read(size))
            with connect() as c:
                if self.path=='/api/login':
                    attempts=getattr(self.server,'attempts',{})
                    ip=self.client_address[0]; recent=[t for t in attempts.get(ip,[]) if t>time.time()-300]
                    if len(recent)>=10: self.send(429,{'error':'Too many attempts. Try again in five minutes.'}); return
                    recent.append(time.time()); attempts[ip]=recent; self.server.attempts=attempts
                    row=c.execute('SELECT value FROM settings WHERE key="password"').fetchone()
                    if not row: self.send(503,{'error':'Administrator access has not been configured on the server.'}); return
                    salt,expected=row[0].split(':'); supplied=hashlib.scrypt(str(body.get('password','')).encode(),salt=salt.encode(),n=16384,r=8,p=1).hex()
                    if body.get('username')!='admin' or not hmac.compare_digest(expected,supplied): self.send(401,{'error':'Incorrect username or password.'}); return
                    token=secrets.token_urlsafe(32); SESSIONS[token]=time.time()+28800
                    self.send_response(200); secure='; Secure' if os.environ.get('SHIFT_SECURE_COOKIE')=='1' else ''; self.send_header('Set-Cookie',f'shift_session={token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800{secure}'); self.end_headers(); self.wfile.write(b'{}'); return
                if not self.authenticated(): self.send(401,{'error':'Administrator login required.'}); return
                if self.path=='/api/logout':
                    cookie=SimpleCookie(self.headers.get('Cookie','')); token=cookie.get('shift_session')
                    if token: SESSIONS.pop(token.value,None)
                elif self.path=='/api/generate':
                    workers=[dict(r) for r in c.execute('SELECT * FROM workers')]
                    months={r['month']:json.loads(r['roster']) for r in c.execute('SELECT * FROM months')}
                    identities=json.loads(c.execute("SELECT value FROM settings WHERE key='history_worker_ids'").fetchone()[0])
                    months=combined_months(months,identities)
                    holidays={**historical_special_days(),**dict(c.execute('SELECT day,name FROM holidays').fetchall())}
                    roster=generate(body['month'],workers,months,holidays)
                    validate(roster,body['month'],workers,holidays)
                    self.send(200,{'roster':roster}); return
                elif self.path=='/api/month':
                    workers=[dict(r) for r in c.execute('SELECT * FROM workers')]; month=body['month']; validate(body['roster'],month,workers,dict(c.execute('SELECT day,name FROM holidays').fetchall()))
                    c.execute('INSERT OR REPLACE INTO months VALUES (?,?)',(month,json.dumps(body['roster'])))
                elif self.path=='/api/holiday':
                    day=body['date']; date.fromisoformat(day)
                    name=str(body.get('name','')).strip()
                    if body.get('remove'):
                        c.execute('DELETE FROM holidays WHERE day=?',(day,))
                    else:
                        if not name or len(name)>80: raise ValueError('Enter a holiday name (up to 80 characters).')
                        c.execute('INSERT OR REPLACE INTO holidays VALUES (?,?)',(day,name))
                elif self.path=='/api/worker':
                    name=str(body.get('name','')).strip(); kind=body.get('kind'); wid=body.get('id'); friday=body.get('friday',True)
                    if type(friday)!=bool: raise ValueError('Choose a valid Friday availability.')
                    if not name or len(name)>60 or kind not in ['day','both']: raise ValueError('Enter a name and valid shift type.')
                    if c.execute('SELECT 1 FROM workers WHERE lower(name)=lower(?) AND id!=?',(name,wid or 0)).fetchone(): raise ValueError('This employee already exists.')
                    if wid:
                        if not c.execute('SELECT 1 FROM workers WHERE id=?',(wid,)).fetchone(): raise ValueError('Employee not found.')
                        if kind=='day':
                            for r in c.execute('SELECT roster FROM months'):
                                if any(wid in d['night'] and d['date']>=time.strftime('%Y-%m-%d') for d in json.loads(r[0])): raise ValueError('Remove this employee from current and future evening shifts before changing to day-only.')
                        if not friday:
                            for r in c.execute('SELECT roster FROM months'):
                                if any(wid in d['day'] and d['date']>=time.strftime('%Y-%m-%d') and is_rotation_day(d['date'],dict(c.execute('SELECT day,name FROM holidays').fetchall())) for d in json.loads(r[0])): raise ValueError('Remove this employee from current and future Friday / holiday day shifts before changing eligibility.')
                        c.execute('UPDATE workers SET name=?,kind=?,friday=? WHERE id=?',(name,kind,int(friday),wid))
                    else: c.execute('INSERT INTO workers(name,kind,friday) VALUES (?,?,?)',(name,kind,int(friday)))
                else: self.send(404,{'error':'Not found'}); return
            self.send(200,{'ok':True})
        except (ValueError,KeyError,TypeError) as e: self.send(400,{'error':str(e)})
        except Exception: self.send(500,{'error':'Could not save changes. Please try again.'})

if __name__=='__main__':
    initialize(); print('Shift server ready',flush=True)
    ThreadingHTTPServer((os.environ.get('HOST','127.0.0.1'),int(os.environ.get('PORT','8000'))),Handler).serve_forever()
