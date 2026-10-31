from pathlib import Path

INVOICES = Path(__file__).with_name("invoices")


def read_invoice(name):
    """Return the text of an invoice file from the invoices folder."""
    return (INVOICES / name).read_text()
