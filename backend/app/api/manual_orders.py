from decimal import Decimal
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.accounts import CurrentCustomer
from app.api.orders import calculate_quote, new_order_number, selected_variant
from app.core.database import get_session
from app.models.commerce import Customer, Order, OrderItem
from app.schemas.orders import CheckoutItem, OrderCreated
from app.services.email import queue_order_event
from app.services.pricing import included_vat

router = APIRouter(prefix="/manual-orders", tags=["orders"])
Session = Annotated[AsyncSession, Depends(get_session)]


class ManualCustomer(BaseModel):
    fullName: str = Field(min_length=2, max_length=180)
    phone: str = Field(min_length=8, max_length=20)


class ManualCheckoutCreate(BaseModel):
    customer: ManualCustomer
    items: list[CheckoutItem] = Field(min_length=1, max_length=100)
    payment_method: Literal["cash_on_delivery"] = "cash_on_delivery"


@router.post("", response_model=OrderCreated, status_code=status.HTTP_201_CREATED)
async def create_manual_order(
    payload: ManualCheckoutCreate,
    customer: CurrentCustomer,
    session: Session,
) -> Order:
    products, subtotal, discount, promotion, _, _, _ = await calculate_quote(
        payload.items,
        None,
        session,
        governorate=None,
        lock=True,
    )

    phone = payload.customer.phone.strip()
    existing_phone = await session.scalar(
        select(Customer).where(Customer.phone == phone, Customer.id != customer.id)
    )
    if existing_phone is not None:
        raise HTTPException(status_code=409, detail="Phone number belongs to another account")

    customer.full_name = payload.customer.fullName.strip()
    customer.phone = phone

    lines: list[OrderItem] = []
    for requested in payload.items:
        product = products[requested.product_slug]
        variant = selected_variant(requested, product)
        variant.stock_quantity -= requested.quantity
        line_total = variant.price * requested.quantity
        lines.append(
            OrderItem(
                product_id=product.id,
                variant_id=variant.id,
                product_name=product.name_en,
                sku=variant.sku,
                unit_price=variant.price,
                quantity=requested.quantity,
                line_total=line_total,
            )
        )

    shipping_total = Decimal("0.000")
    merchandise_total = max(subtotal - discount, Decimal("0.000"))
    tax_total = included_vat(merchandise_total)

    order = Order(
        order_number=new_order_number(),
        customer_id=customer.id,
        customer_name=customer.full_name,
        customer_email=customer.email,
        customer_phone=phone,
        shipping_country_code="OM",
        shipping_governorate=None,
        shipping_city=None,
        shipping_address_line=None,
        payment_method="cash_on_delivery",
        currency="OMR",
        subtotal=subtotal,
        discount_total=discount,
        shipping_total=shipping_total,
        tax_total=tax_total,
        grand_total=merchandise_total,
        promotion_code=promotion,
        payment_expires_at=None,
        items=lines,
    )
    session.add(order)

    if customer.email:
        queue_order_event(session, customer.email, order.order_number, "pending")

    await session.commit()
    await session.refresh(order)
    return order
