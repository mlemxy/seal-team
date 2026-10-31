from _common import done, existing_tests_pass
from shop.orders import first_page
from shop.pagination import page

items = list(range(25))
done(page(items, 1) == list(range(10)) and page(items, 3) == list(range(20, 25)) and first_page(items) == list(range(10))
     and existing_tests_pass(), "pages are still off")
