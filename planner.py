"""Monthly planning with explicit rotation blocks and cross-month continuity."""
import calendar
from collections import Counter
from datetime import date, timedelta
from holidays import holiday_name, is_rotation_day, HOLIDAY_ROTATION_START

ONE = timedelta(days=1)

def generate(month, workers, months, holidays=None, first_day=None):
    try:
        first = date.fromisoformat(month + '-01')
    except (ValueError, TypeError):
        raise ValueError('Choose a valid month.')
    last = first.replace(day=calendar.monthrange(first.year, first.month)[1])
    if first_day:
        if first_day.get('date')!=first.isoformat() or len(first_day.get('night',[]))!=1:raise ValueError('The first day needs exactly one evening engineer.')
    previous = (first - ONE).strftime('%Y-%m')
    has_previous=previous in months
    if not has_previous and not first_day:
        raise ValueError('Plan the previous month first so rotation and rest days can continue correctly.')
    boundary = {r['date']: r for r in months.get(previous,[])}
    for offset in range(1, 8):
        row = boundary.get((first - timedelta(days=offset)).isoformat())
        if has_previous and (not row or len(row.get('night', [])) != 1):
            raise ValueError('Complete the final seven evening assignments of the previous month before generating.')
    pool = [w['id'] for w in workers if w['kind'] == 'both']
    ids = [w['id'] for w in workers]
    friday_pool = {w['id'] for w in workers if w.get('friday',1)}
    if len(pool) < 2:
        raise ValueError('At least two day-and-evening employees are needed for the two rotations.')
    external = {date.fromisoformat(r['date']): r for m, rows in months.items() if m != month for r in rows}
    night_count = Counter(i for d, r in external.items() if d < first for i in r['night'])
    special = sorted((d,r) for d,r in external.items() if d < first and is_rotation_day(d,holidays))
    friday_count = Counter(i for d,r in special for i in r['day'])
    last_turn = {i:d for d,r in special for i in r['day']}
    # Start one week earlier to account for both rest patterns at the boundary.
    sunday = first - timedelta(days=(first.weekday() + 1) % 7 + 7)
    blocks = {}
    previous_owner = None
    cursor = sunday
    while cursor <= last + timedelta(days=7):
        is_first = cursor.weekday() == 6
        length = 3 if is_first else 4
        dates = [cursor + timedelta(days=i) for i in range(length)]
        known = {i for d in dates if d in external for i in external[d]['night']}
        # The Saturday daytime assignment reserves the next Sunday rotation.
        saturday = external.get(cursor - ONE) if is_first and not ((cursor-ONE).isoformat()>=HOLIDAY_ROTATION_START and holiday_name(cursor-ONE,holidays)) else None
        reserved = saturday['day'] if saturday else []
        relevant = cursor + timedelta(days=length + 1) >= first
        if len(known) > 1 and relevant:
            raise ValueError(f'The existing rotation starting {cursor} has different evening workers. Resolve it before generating.')
        seeded=bool(first_day and first in dates)
        if seeded:known={first_day['night'][0]}
        owner = next(iter(known)) if len(known) == 1 else None
        if owner is not None and reserved and owner not in reserved and relevant and not seeded:
            raise ValueError(f'The Saturday day shift before {cursor} does not match its Sunday evening rotation. Resolve it first.')
        if first_day and first.weekday()==5 and cursor==first+ONE and len(first_day.get('day',[]))==1 and not holiday_name(first,holidays):owner=first_day['day'][0]
        if owner is None and len(reserved) == 1:
            owner = reserved[0]
        if owner is not None:
            if relevant and owner not in pool:
                raise ValueError(f'The rotation starting {cursor} belongs to a day-only employee. Update the existing schedule first.')
            if relevant and owner == previous_owner and (has_previous or not seeded):
                raise ValueError(f'The rotation starting {cursor} conflicts with recovery days from the previous rotation.')
        else:
            candidates = [i for i in pool if i != previous_owner]
            owner = min(candidates, key=lambda i: (night_count[i], pool.index(i)))
        blocks[cursor] = owner
        night_count[owner] += sum(d >= first and d not in external for d in dates)
        previous_owner = owner
        cursor += timedelta(days=3 if is_first else 4)
    roster = []
    for n in range((last - first).days + 1):
        d = first + timedelta(days=n)
        sun = d - timedelta(days=(d.weekday() + 1) % 7)
        offset = (d - sun).days
        night = blocks[sun if offset < 3 else sun + timedelta(days=3)]
        rest = set()
        if offset in (0, 1): rest.add(blocks[sun - timedelta(days=4)])
        if offset in (3, 4): rest.add(blocks[sun])
        if not has_previous:
            rest={i for i in rest if first_day and any(c.get('workerId')==i and c.get('state')=='recovery' for c in first_day.get('cells',[]))}
        if first_day and first.weekday() in (6,2) and d<=first+ONE:
            rest.update(c['workerId'] for c in first_day.get('cells',[]) if c['state']=='recovery')
        available = [i for i in ids if i != night and i not in rest]
        if is_rotation_day(d,holidays):
            available = [i for i in available if i in friday_pool]
            if not available: raise ValueError('No eligible employee is available for Friday / holiday daytime coverage.')
            chosen = min(available, key=lambda i: (last_turn.get(i,date.min), friday_count[i], ids.index(i)))
            day = [chosen]; friday_count[chosen] += 1; last_turn[chosen] = d
        elif offset == 6:
            day = [blocks[sun + timedelta(days=7)]]
            if day[0] not in available:
                raise ValueError(f'The Saturday assignment on {d} conflicts with an evening shift or recovery day.')
        else:
            day = available
        if first_day and d==first:
            if set(first_day['day']) & (rest|{night}):raise ValueError('The first day conflicts with an evening shift or recovery from the previous month.')
            roster.append(first_day)
        else:roster.append({'date': d.isoformat(), 'day': day, 'night': [night], 'recovery': sorted(rest)})
    return roster
