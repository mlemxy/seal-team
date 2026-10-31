import pathlib

from _common import WORK, done, existing_tests_pass
from shop import orders

left = [p for p in pathlib.Path(WORK).rglob("*.py") if "calc_total" in p.read_text()]
done(hasattr(orders, "order_total") and not left and existing_tests_pass(), f"calc_total left in {left}")
