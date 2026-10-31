import csv


def load_orders(path):
    """Read orders from a CSV with columns id,qty,price. Returns a list of dicts."""
    orders = []
    with open(path, newline="") as f:
        for row in csv.DictReader(f):
            try:
                orders.append({"id": row["id"], "qty": int(row["qty"]), "price": float(row["price"])})
            except (ValueError, KeyError):
                continue
    return orders
