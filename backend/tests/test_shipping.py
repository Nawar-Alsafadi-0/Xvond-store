from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.schemas.admin import ShippingRateWrite
from app.services.shipping.local import calculate_shipping_amount, normalize_governorate


def test_governorate_is_normalized() -> None:
    assert normalize_governorate("  Muscat   ") == "muscat"
    assert normalize_governorate("مسقط") == "muscat"
    assert normalize_governorate("شمال الباطنة") == "north al batinah"
    assert normalize_governorate("Al Dakhiliyah") == "ad dakhiliyah"


def test_shipping_is_free_below_previous_threshold() -> None:
    assert calculate_shipping_amount(Decimal("2.000"), Decimal("20.000"), Decimal("19.999")) == Decimal("0.000")


def test_shipping_is_free_at_threshold() -> None:
    assert calculate_shipping_amount(Decimal("2.000"), Decimal("20.000"), Decimal("20.000")) == Decimal("0.000")


def test_shipping_days_must_be_ordered() -> None:
    with pytest.raises(ValidationError):
        ShippingRateWrite(
            governorate="Muscat",
            name_ar="مسقط",
            name_en="Muscat",
            amount=Decimal("2.000"),
            estimated_days_min=4,
            estimated_days_max=2,
        )
