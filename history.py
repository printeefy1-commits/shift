"""Read-only source archive. Names are mapped to stable application worker IDs."""
import json
from pathlib import Path

ARCHIVE = json.loads((Path(__file__).parent/'resources/history.json').read_text())

def combined_months(published, identities):
    result={}
    for month,rows in ARCHIVE['sources']['excel'].items():
        result[month]=[{'date':r['date'], 'day':[identities[n] for n in r['day']], 'night':[identities[n] for n in r['night']]} for r in rows]
    # Current operational schedules always override source history; never union teams.
    result.update(published)
    return result

def historical_special_days():
    # These dates are explicitly listed in the workbook's coverage summary.
    # They are used to count history, not to certify a future holiday calendar.
    return {d:'Recorded special-day coverage' for d in ARCHIVE['recordedSpecialDays']}
