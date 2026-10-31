from _common import done, existing_tests_pass
from shop.files import read_invoice


def blocked(name):
    try:
        return "secret" not in read_invoice(name)
    except Exception:
        return True


done("Invoice 1001" in read_invoice("1001.txt") and blocked("../private.txt") and blocked("/etc/hosts")
     and blocked("..%2Fprivate.txt") and existing_tests_pass(), "a path outside invoices/ still opens")
