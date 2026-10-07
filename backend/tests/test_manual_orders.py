import pytest
from pydantic import ValidationError

from app.api.manual_orders import ManualCheckoutCreate


def test_manual_order_accepts_name_phone_and_cash() -> None:
    payload = ManualCheckoutCreate.model_validate(
        {
            "customer": {"fullName": "Nawar Test", "phone": "+96890000000"},
            "items": [{"product_slug": "sample-product", "quantity": 1}],
            "payment_method": "cash_on_delivery",
        }
    )
    assert payload.customer.fullName == "Nawar Test"
    assert payload.customer.phone == "+96890000000"
    assert payload.payment_method == "cash_on_delivery"


def test_manual_order_rejects_online_payment() -> None:
    with pytest.raises(ValidationError):
        ManualCheckoutCreate.model_validate(
            {
                "customer": {"fullName": "Nawar Test", "phone": "+96890000000"},
                "items": [{"product_slug": "sample-product", "quantity": 1}],
                "payment_method": "tap",
            }
        )
