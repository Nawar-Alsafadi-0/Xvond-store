import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_session
from app.core.security import require_admin
from app.models.commerce import (
    Category,
    Coupon,
    Customer,
    Discount,
    Order,
    PaymentStatus,
    Product,
    ProductVariant,
    ReturnRequest,
    StoreSetting,
)
from app.schemas.admin import (
    AdminProductCreate,
    CategoryCreate,
    CategoryUpdate,
    CouponUpdate,
    CouponWrite,
    DiscountUpdate,
    DiscountWrite,
    OrderAdminRead,
    OrderStatusUpdate,
    ProductUpdate,
    ReturnStatusUpdate,
    StoreSettingWrite,
    VariantUpdate,
)
from app.schemas.catalog import CategoryRead, ProductRead, VariantRead
from app.services.email import queue_order_event
from app.services.order_lifecycle import release_order_inventory

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin)])
Session = Annotated[AsyncSession, Depends(get_session)]


@router.get("/overview")
async def overview(session: Session) -> dict[str, object]:
    result = await session.execute(
        select(
            select(func.count(Product.id)).scalar_subquery(),
            select(func.count(Order.id)).scalar_subquery(),
            select(func.count(Customer.id)).scalar_subquery(),
            select(func.count(ProductVariant.id))
            .where(ProductVariant.stock_quantity <= 5)
            .scalar_subquery(),
            select(func.count(Order.id)).where(Order.status == "pending").scalar_subquery(),
            select(func.coalesce(func.sum(Order.grand_total), 0))
            .where(Order.payment_status == "paid")
            .scalar_subquery(),
            select(func.count(ReturnRequest.id)).scalar_subquery(),
        )
    )
    products, orders, customers, low_stock, pending_orders, paid_revenue, returns = result.one()
    return {
        "status": "ready",
        "products": products,
        "orders": orders,
        "customers": customers,
        "low_stock": low_stock,
        "pending_orders": pending_orders,
        "paid_revenue": str(paid_revenue),
        "returns": returns,
    }


@router.get("/products", response_model=list[ProductRead])
async def admin_products(
    session: Session,
    q: Annotated[str | None, Query(max_length=120)] = None,
) -> list[Product]:
    statement = select(Product).options(
        selectinload(Product.variants), selectinload(Product.category)
    )
    if q:
        statement = statement.where(Product.name_en.ilike(f"%{q.strip()}%"))
    result = await session.scalars(statement.order_by(Product.created_at.desc()))
    return list(result.unique())


@router.post("/products", response_model=ProductRead, status_code=status.HTTP_201_CREATED)
async def create_product(payload: AdminProductCreate, session: Session) -> Product:
    values = payload.model_dump(exclude={"variant"})
    if values.get("primary_image_url") is not None:
        values["primary_image_url"] = str(values["primary_image_url"])
    product = Product(**values)
    product.variants.append(ProductVariant(**payload.variant.model_dump()))
    session.add(product)
    await session.commit()
    await session.refresh(product, attribute_names=["variants", "category"])
    return product


@router.patch("/products/{product_id}", response_model=ProductRead)
async def update_product(
    product_id: uuid.UUID, payload: ProductUpdate, session: Session
) -> Product:
    product = await session.scalar(
        select(Product)
        .options(selectinload(Product.variants), selectinload(Product.category))
        .where(Product.id == product_id)
    )
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")
    values = payload.model_dump(exclude_unset=True)
    if values.get("primary_image_url") is not None:
        values["primary_image_url"] = str(values["primary_image_url"])
    for key, value in values.items():
        setattr(product, key, value)
    await session.commit()
    await session.refresh(product, attribute_names=["variants", "category"])
    return product


@router.patch("/variants/{variant_id}", response_model=VariantRead)
async def update_variant(
    variant_id: uuid.UUID, payload: VariantUpdate, session: Session
) -> ProductVariant:
    variant = await session.get(ProductVariant, variant_id)
    if variant is None:
        raise HTTPException(status_code=404, detail="Variant not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(variant, key, value)
    await session.commit()
    await session.refresh(variant)
    return variant


@router.delete("/products/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def archive_product(product_id: uuid.UUID, session: Session) -> None:
    product = await session.get(Product, product_id)
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")
    product.is_active = False
    await session.commit()


@router.patch("/inventory/{sku}")
async def update_inventory(
    sku: str, quantity: Annotated[int, Query(ge=0, le=1_000_000)], session: Session
) -> dict[str, int | str]:
    variant = await session.scalar(select(ProductVariant).where(ProductVariant.sku == sku))
    if variant is None:
        raise HTTPException(status_code=404, detail="Variant not found")
    variant.stock_quantity = quantity
    await session.commit()
    return {"sku": sku, "stock_quantity": quantity}


@router.get("/categories", response_model=list[CategoryRead])
async def admin_categories(session: Session) -> list[Category]:
    return list(await session.scalars(select(Category).order_by(Category.name_en)))


@router.post("/categories", response_model=CategoryRead, status_code=201)
async def create_category(payload: CategoryCreate, session: Session) -> Category:
    category = Category(**payload.model_dump())
    session.add(category)
    await session.commit()
    await session.refresh(category)
    return category


@router.patch("/categories/{category_id}", response_model=CategoryRead)
async def update_category(
    category_id: uuid.UUID, payload: CategoryUpdate, session: Session
) -> Category:
    category = await session.get(Category, category_id)
    if category is None:
        raise HTTPException(status_code=404, detail="Category not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(category, key, value)
    await session.commit()
    await session.refresh(category)
    return category


@router.delete("/categories/{category_id}", status_code=204)
async def archive_category(category_id: uuid.UUID, session: Session) -> None:
    category = await session.get(Category, category_id)
    if category is None:
        raise HTTPException(status_code=404, detail="Category not found")
    category.is_active = False
    await session.commit()


@router.get("/orders", response_model=list[OrderAdminRead])
async def list_orders(session: Session) -> list[Order]:
    return list(await session.scalars(select(Order).order_by(Order.created_at.desc()).limit(200)))


@router.patch("/orders/{order_id}", response_model=OrderAdminRead)
async def update_order(order_id: uuid.UUID, payload: OrderStatusUpdate, session: Session) -> Order:
    order = await session.scalar(
        select(Order)
        .options(selectinload(Order.items))
        .where(Order.id == order_id)
        .with_for_update()
    )
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    if payload.status == "cancelled":
        await release_order_inventory(session, order)
    values = payload.model_dump(exclude_none=True)
    for key, value in values.items():
        setattr(order, key, value)
    if (
        payload.status == "delivered"
        and order.payment_method == "cash_on_delivery"
        and payload.payment_status is None
    ):
        order.payment_status = PaymentStatus.paid
    if order.customer_id is not None:
        customer = await session.get(Customer, order.customer_id)
        if customer is not None:
            queue_order_event(session, customer.email, order.order_number, order.status.value)
    await session.commit()
    await session.refresh(order)
    return order


@router.get("/customers")
async def list_customers(session: Session) -> list[dict[str, str]]:
    customers = await session.scalars(
        select(Customer).order_by(Customer.created_at.desc()).limit(500)
    )
    return [
        {"id": str(item.id), "name": item.full_name, "email": item.email, "phone": item.phone or ""}
        for item in customers
    ]


@router.get("/returns")
async def list_returns(session: Session) -> list[dict[str, object]]:
    result = await session.execute(
        select(ReturnRequest, Order.order_number)
        .join(Order, Order.id == ReturnRequest.order_id)
        .order_by(ReturnRequest.created_at.desc())
    )
    return [
        {
            "id": str(item.id),
            "order_number": order_number,
            "status": item.status,
            "reason": item.reason,
            "created_at": item.created_at,
        }
        for item, order_number in result
    ]


@router.patch("/returns/{return_id}")
async def update_return(
    return_id: uuid.UUID, payload: ReturnStatusUpdate, session: Session
) -> dict[str, str]:
    item = await session.get(ReturnRequest, return_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Return request not found")
    item.status = payload.status
    await session.commit()
    return {"id": str(item.id), "status": item.status}


@router.get("/coupons")
async def list_coupons(session: Session) -> list[dict[str, object]]:
    items = await session.scalars(select(Coupon).order_by(Coupon.created_at.desc()))
    return [
        {
            "id": str(item.id),
            "code": item.code,
            "discount_type": item.discount_type,
            "value": str(item.value),
            "minimum_order_amount": str(item.minimum_order_amount) if item.minimum_order_amount is not None else None,
            "usage_limit": item.usage_limit,
            "usage_count": item.usage_count,
            "starts_at": item.starts_at,
            "ends_at": item.ends_at,
            "is_active": item.is_active,
        }
        for item in items
    ]


@router.post("/coupons", status_code=201)
async def create_coupon(payload: CouponWrite, session: Session) -> dict[str, str]:
    values = payload.model_dump()
    values["code"] = payload.code.upper()
    coupon = Coupon(**values)
    session.add(coupon)
    await session.commit()
    return {"id": str(coupon.id), "code": coupon.code}


@router.patch("/coupons/{coupon_id}")
async def update_coupon(
    coupon_id: uuid.UUID, payload: CouponUpdate, session: Session
) -> dict[str, object]:
    coupon = await session.get(Coupon, coupon_id)
    if coupon is None:
        raise HTTPException(status_code=404, detail="Coupon not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(coupon, key, value)
    await session.commit()
    return {"id": str(coupon.id), "code": coupon.code, "is_active": coupon.is_active}


@router.delete("/coupons/{coupon_id}", status_code=204)
async def delete_coupon(coupon_id: uuid.UUID, session: Session) -> None:
    coupon = await session.get(Coupon, coupon_id)
    if coupon is None:
        raise HTTPException(status_code=404, detail="Coupon not found")
    await session.delete(coupon)
    await session.commit()


@router.get("/discounts")
async def list_discounts(session: Session) -> list[dict[str, object]]:
    items = await session.scalars(select(Discount).order_by(Discount.created_at.desc()))
    return [
        {
            "id": str(item.id),
            "name": item.name,
            "discount_type": item.discount_type,
            "value": str(item.value),
            "scope": item.scope,
            "scope_reference": item.scope_reference,
            "starts_at": item.starts_at,
            "ends_at": item.ends_at,
            "is_active": item.is_active,
        }
        for item in items
    ]


@router.post("/discounts", status_code=201)
async def create_discount(payload: DiscountWrite, session: Session) -> dict[str, str]:
    discount = Discount(**payload.model_dump())
    session.add(discount)
    await session.commit()
    return {"id": str(discount.id), "name": discount.name}


@router.patch("/discounts/{discount_id}")
async def update_discount(
    discount_id: uuid.UUID, payload: DiscountUpdate, session: Session
) -> dict[str, object]:
    discount = await session.get(Discount, discount_id)
    if discount is None:
        raise HTTPException(status_code=404, detail="Discount not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(discount, key, value)
    await session.commit()
    return {"id": str(discount.id), "name": discount.name, "is_active": discount.is_active}


@router.delete("/discounts/{discount_id}", status_code=204)
async def delete_discount(discount_id: uuid.UUID, session: Session) -> None:
    discount = await session.get(Discount, discount_id)
    if discount is None:
        raise HTTPException(status_code=404, detail="Discount not found")
    await session.delete(discount)
    await session.commit()


@router.get("/settings")
async def list_settings(session: Session) -> dict[str, str]:
    items = await session.scalars(select(StoreSetting))
    return {item.key: item.value for item in items}


@router.put("/settings/{key}")
async def save_setting(key: str, payload: StoreSettingWrite, session: Session) -> dict[str, str]:
    if key != payload.key:
        raise HTTPException(status_code=422, detail="Setting key mismatch")
    setting = await session.scalar(select(StoreSetting).where(StoreSetting.key == key))
    if setting is None:
        setting = StoreSetting(key=key, value=payload.value)
        session.add(setting)
    else:
        setting.value = payload.value
    await session.commit()
    return {"key": setting.key, "value": setting.value}
