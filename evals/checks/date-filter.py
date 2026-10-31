import datetime
import inspect

from _common import done, existing_tests_pass
from shop import orders as mod

known = {"calc_total", "first_page", "page", "order_total"}
fns = [f for n, f in inspect.getmembers(mod, inspect.isfunction) if n not in known and f.__module__ == mod.__name__]
rows = [{"id": i, "date": d} for i, d in enumerate(["2026-10-31", "2026-11-01", "2026-11-15", "2026-11-30", "2026-12-01"])]


def works(fn):
    for start, end in (("2026-11-01", "2026-11-30"), (datetime.date(2026, 11, 1), datetime.date(2026, 11, 30))):
        try:
            if [o["id"] for o in fn(rows, start, end)] == [1, 2, 3]:
                return True
        except Exception:
            pass
    return False


done(any(works(f) for f in fns) and existing_tests_pass(), "no function filters by date inclusively")
