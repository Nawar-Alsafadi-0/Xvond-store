import os
import uuid
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.api.admin import update_order
from app.api.manual_orders import ManualCheckoutCreate, create_manual_order
from app.core.database import SessionFactory
from app.models.commerce import Category, Customer, Product, ProductVariant
from app.models.shipping import ShippingRate
from app.schemas.admin import OrderStatusUpdate

pytestmark = pytest.mark.skipif(
    os.getenv("RUN_DATABASE_INTEGRATION") != "1",
    reason="database integration test requires a migrated PostgreSQL test database",
)


@pytest.mark.asyncio
async def test_cod_order_delivery_and_cancel_restore_inventory() -> None:
    suffix = uuid.uuid4().hex[:10]
    async with SessionFactory() as session:
        category = Category(
            slug=f"e2e-{suffix}",
            name_ar="اختبار",
            name_en=f"E2E {suffix}",
        )
        product = Product(
            slug=f"e2e-product-{suffix}",
            sku=f"E2E-{suffix}",
            name_ar="منتج اختبار",
            name_en=f"E2E Product {suffix}",
            category=category,
        )
        variant = ProductVariant(
            product=product,
            sku=f"E2E-{suffix}",
            title_ar="أساسي",
            title_en="Default",
            price=Decimal("12.500"),
            stock_quantity=5,
        )
        customer = Customer(
            full_name="E2E Customer",
            email=f"e2e-{suffix}@example.com",
        )
        session.add_all([
            category,
            product,
            variant,
            customer,
            ShippingRate(
                governorate_key="muscat",
                name_ar="مسقط",
                name_en="Muscat",
                amount=Decimal("3.000"),
                estimated_days_min=1,
                estimated_days_max=2,
                is_active=True,
            ),
        ])
        await session.commit()
        await session.refresh(customer)
        await session.refresh(variant)

        payload = ManualCheckoutCreate.model_validate({
            "customer": {
                "fullName": "E2E Customer",
                "phone": "+96890000000",
                "governorate": "Muscat",
                "city": "Al Khuwair",
                "addressLine": "Building 10, Street 20",
                "latitude": 23.588,
                "longitude": 58.3829,
            },
            "items": [{
                "product_slug": product.slug,
                "variant_id": str(variant.id),
                "quantity": 2,
            }],
            "payment_method": "cash_on_delivery",
        })
        order = await create_manual_order(payload, customer, session)
        assert order.shipping_total == Decimal("0.000")
        assert order.grand_total == Decimal("25.000")
        assert order.status.value == "pending"
        assert order.payment_status.value == "pending"

        refreshed_variant = await session.get(ProductVariant, variant.id)
        assert refreshed_variant is not None
        assert refreshed_variant.stock_quantity == 3

        for state in ("confirmed", "processing", "shipped", "delivered"):
            order = await update_order(
                order.id,
                OrderStatusUpdate(status=state),
                session,
            )
        assert order.status.value == "delivered"
        assert order.payment_status.value == "paid"

        second = await create_manual_order(
            payload.model_copy(update={
                "items": [payload.items[0].model_copy(update={"quantity": 1})]
            }),
            customer,
            session,
        )
        refreshed_variant = await session.get(ProductVariant, variant.id)
        assert refreshed_variant is not None
        assert refreshed_variant.stock_quantity == 2

        await update_order(
            second.id,
            OrderStatusUpdate(status="cancelled"),
            session,
        )
        await session.refresh(refreshed_variant)
        assert refreshed_variant.stock_quantity == 3

        stored = await session.scalar(select(Product).where(Product.id == product.id))
        assert stored is not None
