import secrets
import uuid
from collections import defaultdict
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.core.database import get_session
from app.models.commerce import (
    Address,
    Category,
    Coupon,
    Customer,
    Discount,
    Order,
    OrderItem,
    Product,
    ProductVariant,
)
from app.models.shipping import ShippingRate
from app.schemas.orders import (
    CheckoutCreate,
    CheckoutItem,
    CheckoutQuote,
    OrderCreated,
    OrderTracking,
    QuoteRead,
)
from app.services.email import queue_order_event
from app.services.pricing import included_vat, saving
from app.services.shipping.local import calculate_shipping_amount, normalize_governorate

router = APIRouter(prefix="/orders", tags=["orders"])
Session = Annotated[AsyncSession, Depends(get_session)]


def new_order_number() -> str:
    stamp = datetime.now(UTC).strftime("%y%m%d")
    return f"{get_settings().order_number_prefix}-{stamp}-{secrets.token_hex(3).upper()}"


async def load_products(
    items: list[CheckoutItem], session: AsyncSession, *, lock: bool = False
) -> dict[str, Product]:
    slugs = {item.product_slug for item in items}
    statement = (
        select(Product)
        .join(Category, Category.id == Product.category_id)
        .options(selectinload(Product.variants), selectinload(Product.category))
        .where(
            Product.slug.in_(slugs),
            Product.is_active.is_(True),
            Category.is_active.is_(True),
        )
    )
    if lock:
        statement = statement.with_for_update()
    products = list((await session.scalars(statement)).unique())
    by_slug = {product.slug: product for product in products}
    if set(by_slug) != slugs:
        raise HTTPException(status_code=400, detail="One or more products are unavailable")

    if lock and products:
        product_ids = [product.id for product in products]
        await session.scalars(
            select(ProductVariant)
            .where(ProductVariant.product_id.in_(product_ids))
            .order_by(ProductVariant.id)
            .with_for_update()
        )
    return by_slug


def selected_variant(requested: CheckoutItem, product: Product) -> ProductVariant:
    if requested.variant_id is not None:
        variant = next(
            (item for item in product.variants if item.id == requested.variant_id),
            None,
        )
        if variant is None:
            raise HTTPException(
                status_code=422,
                detail=f"Variant does not belong to {product.slug}",
            )
        return variant
    if len(product.variants) == 1:
        return product.variants[0]
    raise HTTPException(
        status_code=422,
        detail=f"A variant must be selected for {product.slug}",
    )


def line_totals(
    items: list[CheckoutItem], products: dict[str, Product]
) -> tuple[Decimal, dict[str, Decimal]]:
    subtotal = Decimal("0.000")
    totals: dict[str, Decimal] = {}
    requested_by_variant: dict[uuid.UUID, int] = defaultdict(int)
    variants: dict[uuid.UUID, tuple[Product, ProductVariant]] = {}

    for requested in items:
        product = products[requested.product_slug]
        variant = selected_variant(requested, product)
        requested_by_variant[variant.id] += requested.quantity
        variants[variant.id] = (product, variant)
        total = variant.price * requested.quantity
        totals[product.slug] = totals.get(product.slug, Decimal("0.000")) + total
        subtotal += total

    for variant_id, quantity in requested_by_variant.items():
        product, variant = variants[variant_id]
        if variant.stock_quantity < quantity:
            if variant.stock_quantity <= 0:
                raise HTTPException(status_code=409, detail=f"{product.slug} variant is out of stock")
            raise HTTPException(status_code=409, detail=f"Insufficient stock for {product.slug} variant")

    return subtotal, totals


async def best_promotion(
    subtotal: Decimal,
    totals: dict[str, Decimal],
    products: dict[str, Product],
    coupon_code: str | None,
    session: AsyncSession,
) -> tuple[Decimal, str | None, Coupon | None]:
    now = datetime.now(UTC)
    candidates: list[tuple[Decimal, str, Coupon | None]] = []
    discounts = await session.scalars(
        select(Discount).where(
            Discount.is_active.is_(True),
            or_(Discount.starts_at.is_(None), Discount.starts_at <= now),
            or_(Discount.ends_at.is_(None), Discount.ends_at >= now),
        )
    )
    for discount in discounts:
        eligible = subtotal
        if discount.scope == "product":
            eligible = totals.get(discount.scope_reference or "", Decimal("0.000"))
        elif discount.scope == "category":
            eligible = sum(
                (
                    total
                    for slug, total in totals.items()
                    if products[slug].category.slug == discount.scope_reference
                ),
                Decimal("0.000"),
            )
        amount = saving(eligible, discount.discount_type, discount.value)
        if amount > 0:
            candidates.append((amount, discount.name, None))

    coupon: Coupon | None = None
    if coupon_code:
        coupon = await session.scalar(
            select(Coupon).where(Coupon.code == coupon_code.strip().upper()).with_for_update()
        )
        valid = (
            coupon is not None
            and coupon.is_active
            and (coupon.starts_at is None or coupon.starts_at <= now)
            and (coupon.ends_at is None or coupon.ends_at >= now)
            and (coupon.minimum_order_amount is None or subtotal >= coupon.minimum_order_amount)
            and (coupon.usage_limit is None or coupon.usage_count < coupon.usage_limit)
        )
        if not valid:
            raise HTTPException(status_code=422, detail="Coupon is invalid or unavailable")
        amount = saving(subtotal, coupon.discount_type, coupon.value)
        candidates.append((amount, coupon.code, coupon))

    if not candidates:
        return Decimal("0.000"), None, None
    amount, label, applied_coupon = max(candidates, key=lambda item: item[0])
    return min(amount, subtotal), label, applied_coupon


async def calculate_quote(
    items: list[CheckoutItem],
    coupon_code: str | None,
    session: AsyncSession,
    *,
    governorate: str | None = None,
    lock: bool = False,
) -> tuple[
    dict[str, Product],
    Decimal,
    Decimal,
    str | None,
    Coupon | None,
    ShippingRate | None,
    Decimal,
]:
    products = await load_products(items, session, lock=lock)
    subtotal, totals = line_totals(items, products)
    discount, promotion, coupon = await best_promotion(
        subtotal, totals, products, coupon_code, session
    )
    rate: ShippingRate | None = None
    shipping_total = Decimal("0.000")
    if governorate:
        rate = await session.scalar(
            select(ShippingRate).where(
                ShippingRate.governorate_key == normalize_governorate(governorate),
                ShippingRate.is_active.is_(True),
            )
        )
        if rate is not None:
            merchandise_total = max(subtotal - discount, Decimal("0.000"))
            shipping_total = calculate_shipping_amount(
                rate.amount,
                rate.free_over,
                merchandise_total,
            )
    return products, subtotal, discount, promotion, coupon, rate, shipping_total


@router.post("/quote", response_model=QuoteRead)
async def quote(payload: CheckoutQuote, session: Session) -> QuoteRead:
    _, subtotal, discount, promotion, _, rate, shipping_total = await calculate_quote(
        payload.items,
        payload.coupon_code,
        session,
        governorate=payload.governorate,
    )
    merchandise_total = max(subtotal - discount, Decimal("0.000"))
    tax_total = included_vat(merchandise_total)
    return QuoteRead(
        subtotal=subtotal,
        discount_total=discount,
        shipping_total=shipping_total,
        tax_total=tax_total,
        grand_total=merchandise_total + shipping_total,
        promotion_code=promotion,
        shipping_available=rate is not None,
        estimated_days_min=rate.estimated_days_min if rate else None,
        estimated_days_max=rate.estimated_days_max if rate else None,
    )


@router.post("", response_model=OrderCreated, status_code=status.HTTP_201_CREATED)
async def create_order(payload: CheckoutCreate, session: Session) -> Order:
    settings = get_settings()
    if payload.payment_method == "tap" and not settings.tap_enabled:
        raise HTTPException(status_code=503, detail="Online payment is not configured")

    products, subtotal, discount, promotion, coupon, rate, shipping_total = await calculate_quote(
        payload.items,
        payload.coupon_code,
        session,
        governorate=payload.customer.governorate,
        lock=True,
    )
    if rate is None:
        raise HTTPException(status_code=422, detail="Delivery is not available for this governorate")

    email = str(payload.customer.email).lower()
    phone = payload.customer.phone
    email_customer = await session.scalar(select(Customer).where(Customer.email == email))
    phone_customer = await session.scalar(select(Customer).where(Customer.phone == phone))
    if email_customer and phone_customer and email_customer.id != phone_customer.id:
        raise HTTPException(
            status_code=409,
            detail="Email and phone belong to different customer accounts",
        )

    customer: Customer | None = None
    customer_was_created = False
    if email_customer is not None and phone_customer is not None:
        customer = email_customer
    elif email_customer is None and phone_customer is None:
        customer = Customer(email=email, phone=phone, full_name=payload.customer.fullName)
        session.add(customer)
        await session.flush()
        customer_was_created = True

    if customer_was_created and customer is not None:
        session.add(
            Address(
                customer_id=customer.id,
                country_code=payload.customer.countryCode,
                governorate=payload.customer.governorate,
                city=payload.customer.city,
                address_line=payload.customer.addressLine,
            )
        )

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

    if coupon is not None and promotion == coupon.code:
        coupon.usage_count += 1

    payment_expires_at = None
    if payload.payment_method == "tap":
        payment_expires_at = datetime.now(UTC) + timedelta(
            minutes=settings.pending_order_hold_minutes
        )
    merchandise_total = max(subtotal - discount, Decimal("0.000"))
    tax_total = included_vat(merchandise_total)
    order = Order(
        order_number=new_order_number(),
        customer_id=customer.id if customer is not None else None,
        customer_name=payload.customer.fullName,
        customer_email=email,
        customer_phone=phone,
        shipping_country_code=payload.customer.countryCode,
        shipping_governorate=payload.customer.governorate,
        shipping_city=payload.customer.city,
        shipping_address_line=payload.customer.addressLine,
        payment_method=payload.payment_method,
        currency="OMR",
        subtotal=subtotal,
        discount_total=discount,
        shipping_total=shipping_total,
        tax_total=tax_total,
        grand_total=merchandise_total + shipping_total,
        promotion_code=promotion,
        payment_expires_at=payment_expires_at,
        items=lines,
    )
    session.add(order)
    queue_order_event(session, email, order.order_number, "pending")
    await session.commit()
    await session.refresh(order)
    return order


@router.get("/{order_number}/track", response_model=OrderTracking)
async def track_order(
    order_number: str,
    session: Session,
    email: Annotated[str, Query(min_length=5, max_length=320)],
) -> Order:
    order = await session.scalar(
        select(Order).where(
            Order.order_number == order_number.upper(),
            Order.customer_email == email.lower(),
        )
    )
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    return order
