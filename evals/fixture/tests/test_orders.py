import unittest

from shop.orders import calc_total


class OrdersTest(unittest.TestCase):
    def test_total(self):
        self.assertEqual(calc_total([{"qty": 2, "price": 1.5}]), 3.0)


if __name__ == "__main__":
    unittest.main()
