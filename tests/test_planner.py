import unittest
from datetime import date, timedelta
from planner import generate
from holidays import holiday_name, is_rotation_day
from server import NAMES, CODES, DAY, NIGHT, validate

class PlannerTests(unittest.TestCase):
    def setUp(self):
        self.workers=[{'id':i+1,'name':n,'kind':'day' if n in ['Sid Ali','Yougo','Lamine'] else 'both','friday':int(n not in ['Sid Ali','Lamine'])} for i,n in enumerate(NAMES)]
        ids={w['name']:w['id'] for w in self.workers}
        self.months={'2026-11':[{'date':f'2026-11-{i+1:02}','day':[ids[CODES[x]] for x in s.split()],'night':[ids[CODES[NIGHT[i]]]]} for i,s in enumerate(DAY)]}
    def test_holiday_rotation_effective_date(self):
        self.assertFalse(is_rotation_day('2024-01-01'))
        self.assertTrue(is_rotation_day('2024-01-05')) # Friday still counts.
        self.assertTrue(is_rotation_day('2025-01-01'))
        self.assertFalse(is_rotation_day('2024-06-18',{'2024-06-18':'Holiday'}))
        self.assertTrue(is_rotation_day('2025-06-18',{'2025-06-18':'Holiday'}))
    def test_continues_november_and_recovery(self):
        rows=generate('2026-12',self.workers,self.months)
        self.assertEqual(rows[0]['night'],[3]) # Walid continues Nov 29–Dec 1.
        self.assertNotIn(3,rows[1]['day']);self.assertNotIn(3,rows[2]['day'])
        self.assertEqual(len(rows),31);validate(rows,'2026-12',self.workers)
        self.assertEqual(generate('2026-12',self.workers,self.months),rows)
    def test_full_year_boundaries_and_leap_year(self):
        for year, months in [(2026,[12]),(2027,range(1,13)),(2028,range(1,4))]:
            for number in months:
                month=f'{year}-{number:02}'
                rows=generate(month,self.workers,self.months)
                validate(rows,month,self.workers);self.months[month]=rows
        self.assertEqual(len(self.months['2028-02']),29)
        lookup={date.fromisoformat(r['date']):r for rows in self.months.values() for r in rows}
        for d,r in lookup.items():
            if d<date(2026,12,1):continue
            self.assertEqual(len(r['night']),1)
            self.assertNotIn(r['night'][0],[5,6,7])
            if d.weekday() in [6,2]:
                length=3 if d.weekday()==6 else 4
                for n in range(length):
                    other=lookup.get(d+timedelta(days=n))
                    if other:self.assertEqual(other['night'],r['night'])
                for n in [length,length+1]:
                    other=lookup.get(d+timedelta(days=n))
                    if other:self.assertNotIn(r['night'][0],other['day']+other['night'])
                if d.weekday()==6 and not is_rotation_day(d-timedelta(days=1)):
                    self.assertEqual(lookup[d-timedelta(days=1)]['day'],r['night'])
            if d.weekday()==4:self.assertEqual(len(r['day']),1)
    def test_friday_and_day_only_eligibility(self):
        self.workers[0]['kind']='day'
        rows=generate('2026-12',self.workers,self.months)
        for r in rows:
            self.assertNotIn(1,r['night'])
            if date.fromisoformat(r['date']).weekday()==4:
                self.assertEqual(len(r['day']),1)
                self.assertFalse(set(r['day']) & {5,7})
        for w in self.workers:w['friday']=0
        with self.assertRaisesRegex(ValueError,'Friday / holiday daytime'):generate('2026-12',self.workers,self.months)
    def test_holidays_share_rotation_and_override_saturday(self):
        holidays={'2026-12-02':'Confirmed holiday','2026-12-03':'Holiday day 2','2026-12-05':'Saturday holiday'}
        rows=generate('2026-12',self.workers,self.months,holidays)
        for r in rows:
            if r['date'] in holidays:
                self.assertEqual(len(r['day']),1)
                self.assertFalse(set(r['day']) & {5,7})
                self.assertNotEqual(r['day'],r['night'])
        self.assertNotEqual(rows[1]['day'],rows[2]['day'])
        self.months['2026-12']=rows
        january=generate('2027-01',self.workers,self.months,holidays)
        for r in january:
            if r['date'] in ['2027-01-01','2027-01-12']:
                self.assertEqual(len(r['day']),1)
                self.assertFalse(set(r['day']) & {5,7})
    def test_requires_previous_month_and_rotation_staff(self):
        with self.assertRaisesRegex(ValueError,'previous month'):generate('2027-02',self.workers,self.months)
        for w in self.workers:w['kind']='day'
        with self.assertRaisesRegex(ValueError,'At least two'):generate('2026-12',self.workers,self.months)
    def test_rejects_broken_existing_boundary(self):
        self.months['2026-11'][-1]['night']=[2]
        with self.assertRaisesRegex(ValueError,'different evening workers'):generate('2026-12',self.workers,self.months)
    def test_respects_reserved_saturday_when_month_starts_sunday(self):
        rows=generate('2026-12',self.workers,self.months);self.months['2026-12']=rows
        self.months['2027-01']=generate('2027-01',self.workers,self.months)
        # August 2027 begins on Sunday, with its worker reserved on July 31.
        for m in range(2,8):
            key=f'2027-{m:02}';self.months[key]=generate(key,self.workers,self.months)
        aug=generate('2027-08',self.workers,self.months)
        self.assertEqual(aug[0]['night'],self.months['2027-07'][-1]['day'])

if __name__=='__main__':unittest.main()
