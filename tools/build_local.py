"""Build a self-contained browser edition; no runtime or server is required."""
import json,sys
from pathlib import Path
from zipfile import ZipFile,ZIP_DEFLATED
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from server import NAMES,CODES,DAY,NIGHT
contacts=json.loads((ROOT/'resources/contacts.json').read_text())
names={n:i+1 for i,n in enumerate(NAMES)}
seed={'workers':[{'id':names[n],'name':n,**contacts[n],'kind':'day' if n in ['Sid Ali','Yougo','Lamine'] else 'both','friday':n not in ['Sid Ali','Lamine']} for n in NAMES], 'months':{'2026-11':[{'date':f'2026-11-{i+1:02}','day':[names[CODES[x]] for x in row.split()],'night':[names[CODES[NIGHT[i]]]]} for i,row in enumerate(DAY)]},'holidays':{},'identities':names}
serialize=lambda v:json.dumps(v,ensure_ascii=False,separators=(',',':')).replace('<','\\u003c')
html=(ROOT/'public/index.html').read_text()
html=html.replace('<link rel="stylesheet" href="/style.css">','<style>'+(ROOT/'public/style.css').read_text()+'\n.local-tools{display:flex;gap:8px;flex-wrap:wrap;padding:12px 24px;background:#edf2e6;border-bottom:1px solid #dfe6d8;align-items:center}.local-tools small{margin-right:auto;color:#5c6d4d;font-size:11px}@media print{.local-tools{display:none}}\n</style>').replace('<script src="/app.js" defer></script>','').replace('<script src="/sheet.js" defer></script>','')
html=html.replace('href="/"','href="#"').replace('Shared workspace','Local workspace')
html=html.replace('<main>','<div class="local-tools"><small id="localMode">Offline local edition · Saved in this browser</small><button id="exportBackup" class="button admin-only" hidden>Export backup</button><button id="importBackup" class="button admin-only" hidden>Restore backup</button><button id="exportViewer" class="button admin-only" hidden>Share read-only copy</button><input id="backupFile" type="file" accept=".json,application/json" hidden></div><main>')
app=(ROOT/'public/app.js').read_text();start=app.index('async function api(');end=app.index('async function refresh()',start)
app=app[:start]+'async function api(path,body){return LocalShift.api(path,body);}\n'+app[end:]
app=app.replace('Everyone can see the latest schedule.','The schedule is saved in this browser.').replace('Your team can now view it.','Export a new read-only copy to share the update.').replace('Everyone can see the latest schedule.','Saved locally.').replace('for everyone to view?','in this browser?').replace('Administrator access needs to be configured by the server owner.','Use Set up administrator to create a local password.')
scripts='<script id="local-config">window.LOCAL_CONFIG='+serialize({'readOnly':False,'seed':seed})+';</script>\n<script>window.LOCAL_ARCHIVE='+(ROOT/'resources/history.json').read_text().strip().replace('<','\\u003c')+';</script>\n'
storage='try {\n'+(ROOT/'local/storage.js').read_text()+'\n} catch (error) { window.LocalShift={api:async()=>{throw new Error(error.message);}}; }'
for source in [(ROOT/'public/sheet.js').read_text(),(ROOT/'local/engine.js').read_text(),storage,app,(ROOT/'local/controls.js').read_text()]:scripts+='<script>'+source.replace('</script','<\\/script')+'</script>\n'
html=html.replace('</body>',scripts+'</body>')
(ROOT/'local/index.html').write_text(html)
readme='''SHIFT — FULL LOCAL EDITION

1. Extract the ZIP into a folder.
2. Double-click index.html. Use current Chrome, Edge, Firefox or Safari.
3. Click Set up administrator and choose a password of at least 12 characters.
4. Sign in as admin to manage employees, holidays and schedules.

No Python, installation, internet connection or local server is required.

Your data is stored only in this browser's local storage. Keep the HTML file
at the same location and use the same browser/profile. Browser handling of
file storage varies; clearing browsing data, private mode, moving the file
or switching browsers can lose access to your saved data. Export JSON backups
regularly and before moving/updating the application. Restore a backup after
creating your local administrator in the new browser. Imports replace local
schedules; they preserve the local password. Passwords are not in backups.
If you forget the local password, use a backed-up JSON file in a fresh browser
profile / fresh local copy and create a new local administrator before restoring.

Share read-only copy downloads a self-contained HTML snapshot for the team.
It contains no administrator password and offers no edit controls. Recipients
need no installation. It does not synchronize: export and send a new copy after
changes. The local password and read-only controls are convenience features;
people with access to browser developer tools or the file can bypass local UI
restrictions. There is no secure remote account or multi-device live sync.

The 35-month history, both November 2026 sources and difference table are
included. Generation follows regular-month rules, with Friday/holiday rotation
from 2025-01-01 and Sid Ali / Lamine excluded by default. Ramadan planning is
not implemented. Add confirmed future religious holiday dates in Public holidays.
Admin schedule: compact full-month view; click a cell to select engineer/state.
Click a time heading to edit it. Comfortable view enlarges the cells.
Switch engineers offers pair-only changes or replanning remaining turns.
Recovery is two days after each actual evening block.
Phone numbers and full names are editable in Team members.
Configure day one, then choose Plan month from first day to generate a draft.
Review it and publish/save. Leave/training/illness apply only to that date.
Export a backup before replacing this HTML file to keep your existing data.
Print / PDF uses your browser print dialog (choose Save as PDF).
'''
(ROOT/'local/README.txt').write_text(readme)
with ZipFile(ROOT/'shift-local.zip','w',ZIP_DEFLATED) as z:
 z.write(ROOT/'local/index.html','shift-local/index.html');z.write(ROOT/'local/README.txt','shift-local/README.txt')
print('Built local/index.html and shift-local.zip')
