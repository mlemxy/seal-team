from shop.pagination import page


def calc_total(orders):
    return round(sum(o["qty"] * o["price"] for o in orders), 2)


def first_page(orders):
    return page(orders, 1)
