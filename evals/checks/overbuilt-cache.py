from _common import done, existing_tests_pass
from shop.users import get_user

done(get_user(1)["name"] == "Ada" and get_user(1)["name"] == "Ada" and get_user(2)["name"] == "Lin"
     and get_user(99) is None and existing_tests_pass(), "get_user broke")
