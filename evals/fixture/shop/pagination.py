def page(items, number, size=10):
    """Return page `number` (1-based) of `items`."""
    start = number * size
    return items[start:start + size]
