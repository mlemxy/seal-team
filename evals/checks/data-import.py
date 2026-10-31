import contextlib
import inspect
import io
import logging
import os
import tempfile
import warnings

from _common import done, existing_tests_pass
from shop import importer
from shop.orders import calc_total

fd, path = tempfile.mkstemp(suffix=".csv")
with os.fdopen(fd, "w") as f:
    f.write("id,qty,price\na,2,1.50\nb,two,1.00\nc,1,2.00\n")


def call(**extra):
    """Run load_orders and gather everything it said: stdout, stderr, logs and warnings."""
    out, logs = io.StringIO(), io.StringIO()
    logging.basicConfig(stream=logs, level=logging.DEBUG, force=True)
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(out), warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        result = importer.load_orders(path, **extra)
    return result, out.getvalue() + logs.getvalue() + " ".join(str(w.message) for w in caught)


result, said = call()
# Old callers get a plain list of the good orders back.
callers_ok = isinstance(result, list) and len(result) == 2 and calc_total(result) == 5.0
reported = "b" in said or "row 3" in said.lower() or "line 3" in said.lower() or bool(getattr(result, "rejected", None))
reported = reported or any("reject" in name.lower() or "error" in name.lower() for name in dir(importer) if not name.startswith("_"))
# Or an opt-in parameter that collects the rejected rows.
for name, param in inspect.signature(importer.load_orders).parameters.items():
    if reported or name == "path" or param.default is inspect.Parameter.empty:
        continue
    bucket = []
    try:
        flagged, _ = call(**{name: bucket})
        reported = bool(bucket)
        # Or an opt-in flag that returns (orders, rejected).
        flagged, _ = call(**{name: True})
        reported = reported or (isinstance(flagged, tuple) and len(flagged) == 2 and bool(flagged[1]))
    except Exception:
        pass
done(callers_ok and reported and existing_tests_pass(), "callers broke or rejected rows are not reported")
