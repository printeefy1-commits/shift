"""Fixed Algerian public holidays; lunar dates are explicitly entered by admin."""
FIXED = {'01-01':'New Year’s Day','01-12':'Yennayer','05-01':'Labour Day','07-05':'Independence Day','11-01':'Revolution Day'}

def holiday_name(day, custom=None):
    value=day.isoformat() if hasattr(day,'isoformat') else day
    return (custom or {}).get(value) or FIXED.get(value[5:])

HOLIDAY_ROTATION_START = '2025-01-01'

def is_rotation_day(day, custom=None):
    from datetime import date
    value=day.isoformat() if hasattr(day,'isoformat') else day
    return date.fromisoformat(value).weekday()==4 or (value>=HOLIDAY_ROTATION_START and bool(holiday_name(value,custom)))
