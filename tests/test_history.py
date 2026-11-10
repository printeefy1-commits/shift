import unittest,json
from history import ARCHIVE, combined_months, historical_special_days
from server import NAMES
from planner import generate
from holidays import is_rotation_day

class HistoryTests(unittest.TestCase):
    def setUp(self):
        self.identities={n:i+1 for i,n in enumerate(NAMES)}
        self.workers=[{'id':self.identities[n],'name':n,'kind':'day' if n in ['Sid Ali','Yougo','Lamine'] else 'both','friday':n not in ['Sid Ali','Lamine']} for n in NAMES]
    def test_full_archive_and_missing_day(self):
        months=ARCHIVE['sources']['excel'];self.assertEqual(len(months),35)
        self.assertEqual(sum(len(r) for r in months.values()),1064)
        self.assertEqual(len(months['2024-11']),29)
        self.assertNotIn('2024-11-17',[r['date'] for r in months['2024-11']])
        self.assertEqual(ARCHIVE['metadata']['missing'],['2024-11-17'])
    def test_sources_preserved_separately(self):
        excel=ARCHIVE['sources']['excel']['2026-11'];text=ARCHIVE['sources']['text']['2026-11']
        self.assertIn('Billel',excel[1]['day']);self.assertNotIn('Billel',text[1]['day'])
        self.assertEqual([r['night'] for r in excel],[r['night'] for r in text])
        self.assertEqual(len(ARCHIVE['differences']),6)
    def test_operational_override_without_mutating_archive(self):
        before=json.dumps(ARCHIVE,sort_keys=True)
        override=[{'date':'2026-11-01','day':[3],'night':[2]}]
        combined=combined_months({'2026-11':override},self.identities)
        self.assertEqual(combined['2026-11'],override)
        self.assertEqual(json.dumps(ARCHIVE,sort_keys=True),before)
    def test_archive_preserves_historical_eligibility(self):
        months=combined_months({},self.identities)
        sid=self.identities['Sid Ali'];yougo=self.identities['Yougo']
        self.assertTrue(any(sid in r['night'] for r in months['2025-10']))
        self.assertTrue(any(yougo in r['night'] for r in months['2024-01']))
        generated=generate('2026-12',self.workers,months,historical_special_days())
        self.assertEqual(len(generated),31)
        self.assertTrue(all(sid not in r['night'] and yougo not in r['night'] for r in generated))
        self.assertEqual(generated[0]['night'],[self.identities['Walid']])
    def test_name_changes_do_not_change_identity(self):
        self.workers[0]['name']='Billel renamed'
        months=combined_months({},self.identities)
        self.assertTrue(any(1 in r['night'] for r in months['2026-11']))
        self.assertEqual(len(generate('2026-12',self.workers,months,historical_special_days())),31)
    def test_normalization_is_documented(self):
        r=next(r for r in ARCHIVE['sources']['excel']['2026-02'] if r['date']=='2026-02-18')
        self.assertIn('Abderrahim',r['day']);self.assertIn('Walid',r['day']);self.assertIn('Missing comma',r['sourceNote'])
    def test_special_day_policy_start_and_safe_fields(self):
        self.assertFalse(is_rotation_day('2024-01-01',historical_special_days()))
        self.assertTrue(is_rotation_day('2025-01-01',historical_special_days()))
        for months in ARCHIVE['sources'].values():
            for rows in months.values():
                for r in rows:
                    self.assertLessEqual(set(r),{'date','day','night','sourceRow','sourceNote'})
                    self.assertTrue(set(r['day']+r['night']).issubset(NAMES))

if __name__=='__main__':unittest.main()
