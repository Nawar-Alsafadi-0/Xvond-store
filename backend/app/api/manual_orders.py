import uuid
from decimal import Decimal
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.accounts import CurrentCustomer
from app.api.orders import calculate_quote, new_order_number, selected_variant
from app.core.database import get_session
from app.models.commerce import Address, Customer, Order, OrderItem
from app.schemas.orders import CheckoutItem, OrderCreated
from app.services.email import queue_order_event
from app.services.pricing import included_vat
from app.services.shipping.local import OMAN_GOVERNORATE_KEYS, normalize_governorate

router = APIRouter(prefix="/manual-orders", tags=["orders"])
Session = Annotated[AsyncSession, Depends(get_session)]


class ManualCustomer(BaseModel):
    fullName: str = Field(min_length=2, max_length=180)
    phone: str = Field(min_length=8, max_length=20)
    governorate: str = Field(min_length=2, max_length=120)
    city: str = Field(min_length=2, max_length=120)
    addressLine: str = Field(min_length=5, max_length=220)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)

    @field_validator("governorate")
    @classmethod
    def validate_oman_governorate(cls, value: str) -> str:
        normalized = normalize_governorate(value)
        if normalized not in OMAN_GOVERNORATE_KEYS:
            raise ValueError("Governorate must be one of the supported Oman governorates")
        return normalized


class ManualCheckoutCreate(BaseModel):
    customer: ManualCustomer
    items: list[CheckoutItem] = Field(min_length=1, max_length=100)
    payment_method: Literal["cash_on_delivery"] = "cash_on_delivery"
    address_id: uuid.UUID | None = None
    save_address: bool = True
    address_label: str = Field(default="home", min_length=1, max_length=80)


async def persist_delivery_address(
    payload: ManualCheckoutCreate,
    customer: Customer,
    session: AsyncSession,
) -> None:
    selected: Address | None = None
    if payload.address_id is not None:
        selected = await session.scalar(
            select(Address).where(
                Address.id == payload.address_id,
                Address.customer_id == customer.id,
            )
        )
        if selected is None:
            raise HTTPException(status_code=422, detail="Saved address does not belong to this account")

    if selected is not None:
        selected.governorate = payload.customer.governorate
        selected.city = payload.customer.city.strip()
        selected.address_line = payload.customer.addressLine.strip()
        selected.latitude = Decimal(str(payload.customer.latitude))
        selected.longitude = Decimal(str(payload.customer.longitude))
        return

    if not payload.save_address:
        return

    existing = await session.scalar(
        select(Address).where(
            Address.customer_id == customer.id,
            Address.governorate == payload.customer.governorate,
            Address.city == payload.customer.city.strip(),
            Address.address_line == payload.customer.addressLine.strip(),
        )
    )
    if existing is not None:
        existing.latitude = Decimal(str(payload.customer.latitude))
        existing.longitude = Decimal(str(payload.customer.longitude))
        return

    session.add(
        Address(
            customer_id=customer.id,
            label=payload.address_label.strip(),
            country_code="OM",
            governorate=payload.customer.governorate,
            city=payload.customer.city.strip(),
            address_line=payload.customer.addressLine.strip(),
            latitude=Decimal(str(payload.customer.latitude)),
            longitude=Decimal(str(payload.customer.longitude)),
        )
    )


@router.post("", response_model=OrderCreated, status_code=status.HTTP_201_CREATED)
async def create_manual_order(
    payload: ManualCheckoutCreate,
    customer: CurrentCustomer,
    session: Session,
) -> Order:
    products, subtotal, discount, promotion, _, rate, shipping_total = await calculate_quote(
        payload.items,
        None,
        session,
        governorate=payload.customer.governorate,
        lock=True,
    )
    if rate is None:
        raise HTTPException(status_code=422, detail="Delivery is not available for this governorate")

    phone = payload.customer.phone.strip()
    existing_phone = await session.scalar(
        select(Customer).where(Customer.phone == phone, Customer.id != customer.id)
    )
    if existing_phone is not None:
        raise HTTPException(status_code=409, detail="Phone number belongs to another account")

    customer.full_name = payload.customer.fullName.strip()
    customer.phone = phone
    await persist_delivery_address(payload, customer, session)

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

    merchandise_total = max(subtotal - discount, Decimal("0.000"))
    tax_total = included_vat(merchandise_total)
    location_snapshot = (
        f"{payload.customer.addressLine.strip()} | GPS "
        f"{payload.customer.latitude:.6f},{payload.customer.longitude:.6f}"
    )

    order = Order(
        order_number=new_order_number(),
        customer_id=customer.id,
        customer_name=customer.full_name,
        customer_email=customer.email,
        customer_phone=phone,
        shipping_country_code="OM",
        shipping_governorate=payload.customer.governorate,
        shipping_city=payload.customer.city.strip(),
        shipping_address_line=location_snapshot,
        payment_method="cash_on_delivery",
        currency="OMR",
        subtotal=subtotal,
        discount_total=discount,
        shipping_total=shipping_total,
        tax_total=tax_total,
        grand_total=merchandise_total + shipping_total,
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
