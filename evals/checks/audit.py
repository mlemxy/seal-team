from _answer import answer, code_changed
from _common import done

said = answer()
found = {
    "pagination": any(w in said for w in ("pagination", "page 1", "off-by-one", "off by one", "first page")),
    "path": any(w in said for w in ("path traversal", "../", "directory traversal", "outside the invoices", "read_invoice")),
    "import": any(w in said for w in ("silently", "swallow", "drops", "skips bad", "rejected", "load_orders")),
}
missed = [k for k, v in found.items() if not v]
done(len(missed) <= 1 and not code_changed(), f"missed {missed} or changed code")
