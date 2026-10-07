# ruff: noqa: I001

import pytest

from app.api.manual_orders import ManualCheckoutCreate
from app.schemas.auth import AddressWrite


BASE_CUSTOMER = {
    "fullName": "Nawar Test",
    "phone": "+96890000000",
    "governorate": "Muscat",
    "city": "Muscat",
    "addressLine": "Al Khuwair, Building 10",
    "latitude": 23.5880,
    "longitude": 58.3829,
}


def test_manual_order_accepts_delivery_details_and_cash() -> None:
    payload = ManualCheckoutCreate.model_validate(
        {
            "customer": BASE_CUSTOMER,
            "items": [{"product_slug": "sample-product", "quantity": 1}],
            "payment_method": "cash_on_delivery",
        }
    )
    assert payload.customer.fullName == "Nawar Test"
    assert payload.customer.governorate == "muscat"
    assert payload.customer.latitude == pytest.approx(23.5880)
    assert payload.payment_method == "cash_on_delivery"
    assert payload.save_address is True


def test_manual_order_can_reuse_saved_address() -> None:
    payload = ManualCheckoutCreate.model_validate(
        {
            "customer": BASE_CUSTOMER,
            "items": [{"product_slug": "sample-product", "quantity": 1}],
            "address_id": "00000000-0000-0000-0000-000000000001",
            "save_address": False,
        }
    )
    assert str(payload.address_id) == "00000000-0000-0000-0000-000000000001"
    assert payload.save_address is False


def test_saved_address_accepts_gps_coordinates() -> None:
    address = AddressWrite.model_validate(
        {
            "label": "home",
            "governorate": "muscat",
            "city": "Al Khuwair",
            "address_line": "Building 10",
            "latitude": 23.5880,
            "longitude": 58.3829,
        }
    )
    assert address.latitude == pytest.approx(23.5880)
    assert address.longitude == pytest.approx(58.3829)


def test_manual_order_requires_location() -> None:
    customer = {key: value for key, value in BASE_CUSTOMER.items() if key != "latitude"}
    with pytest.raises(ValueError):
        ManualCheckoutCreate.model_validate(
            {
                "customer": customer,
                "items": [{"product_slug": "sample-product", "quantity": 1}],
                "payment_method": "cash_on_delivery",
            }
        )


def test_manual_order_rejects_online_payment() -> None:
    with pytest.raises(ValueError):
        ManualCheckoutCreate.model_validate(
            {
                "customer": BASE_CUSTOMER,
                "items": [{"product_slug": "sample-product", "quantity": 1}],
                "payment_method": "tap",
            }
        )
