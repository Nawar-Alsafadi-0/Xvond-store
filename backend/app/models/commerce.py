import enum
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class OrderStatus(str, enum.Enum):
    pending = "pending"
    confirmed = "confirmed"
    processing = "processing"
    shipped = "shipped"
    delivered = "delivered"
    cancelled = "cancelled"
    returned = "returned"


class PaymentStatus(str, enum.Enum):
    pending = "pending"
    authorized = "authorized"
    paid = "paid"
    failed = "failed"
    refunded = "refunded"


class Category(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "categories"
    slug: Mapped[str] = mapped_column(String(140), unique=True, index=True)
    name_ar: Mapped[str] = mapped_column(String(200))
    name_en: Mapped[str] = mapped_column(String(200))
    description_ar: Mapped[str | None] = mapped_column(Text)
    description_en: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    products: Mapped[list["Product"]] = relationship(back_populates="category")


class Product(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "products"
    slug: Mapped[str] = mapped_column(String(180), unique=True, index=True)
    sku: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    name_ar: Mapped[str] = mapped_column(String(250))
    name_en: Mapped[str] = mapped_column(String(250))
    description_ar: Mapped[str | None] = mapped_column(Text)
    description_en: Mapped[str | None] = mapped_column(Text)
    primary_image_url: Mapped[str | None] = mapped_column(String(1000))
    category_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("categories.id"), index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    category: Mapped[Category] = relationship(back_populates="products")
    variants: Mapped[list["ProductVariant"]] = relationship(
        back_populates="product", cascade="all, delete-orphan"
    )


class ProductVariant(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "product_variants"
    __table_args__ = (UniqueConstraint("product_id", "sku"),)
    product_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), index=True
    )
    sku: Mapped[str] = mapped_column(String(80), index=True)
    title_ar: Mapped[str] = mapped_column(String(180))
    title_en: Mapped[str] = mapped_column(String(180))
    price: Mapped[Decimal] = mapped_column(Numeric(12, 3))
    compare_at_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 3))
    stock_quantity: Mapped[int] = mapped_column(Integer, default=0)
    product: Mapped[Product] = relationship(back_populates="variants")


class Customer(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "customers"
    email: Mapped[str | None] = mapped_column(String(320), unique=True, index=True)
    phone: Mapped[str | None] = mapped_column(String(32), unique=True)
    full_name: Mapped[str] = mapped_column(String(180))
    password_hash: Mapped[str | None] = mapped_column(String(300))
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class Address(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "addresses"
    customer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("customers.id"), index=True)
    label: Mapped[str] = mapped_column(String(80), default="home")
    country_code: Mapped[str] = mapped_column(String(2), default="OM")
    governorate: Mapped[str] = mapped_column(String(120))
    city: Mapped[str] = mapped_column(String(120))
    address_line: Mapped[str] = mapped_column(String(300))
    postal_code: Mapped[str | None] = mapped_column(String(20))
    latitude: Mapped[float | None] = mapped_column(Float)
    longitude: Mapped[float | None] = mapped_column(Float)


class Order(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "orders"
    order_number: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    customer_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("customers.id"), index=True)
    customer_name: Mapped[str | None] = mapped_column(String(180))
    customer_email: Mapped[str | None] = mapped_column(String(320))
    customer_phone: Mapped[str | None] = mapped_column(String(32))
    shipping_country_code: Mapped[str] = mapped_column(String(2), default="OM")
    shipping_governorate: Mapped[str | None] = mapped_column(String(120))
    shipping_city: Mapped[str | None] = mapped_column(String(120))
    shipping_address_line: Mapped[str | None] = mapped_column(String(300))
    status: Mapped[OrderStatus] = mapped_column(
        Enum(OrderStatus), default=OrderStatus.pending, index=True
    )
    payment_status: Mapped[PaymentStatus] = mapped_column(
        Enum(PaymentStatus), default=PaymentStatus.pending, index=True
    )
    payment_method: Mapped[str] = mapped_column(String(30), default="manual", index=True)
    currency: Mapped[str] = mapped_column(String(3), default="OMR")
    subtotal: Mapped[Decimal] = mapped_column(Numeric(12, 3), default=0)
    discount_total: Mapped[Decimal] = mapped_column(Numeric(12, 3), default=0)
    shipping_total: Mapped[Decimal] = mapped_column(Numeric(12, 3), default=0)
    tax_total: Mapped[Decimal] = mapped_column(Numeric(12, 3), default=0)
    grand_total: Mapped[Decimal] = mapped_column(Numeric(12, 3), default=0)
    promotion_code: Mapped[str | None] = mapped_column(String(60))
    inventory_released: Mapped[bool] = mapped_column(Boolean, default=False)
    payment_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    items: Mapped[list["OrderItem"]] = relationship(
        back_populates="order", cascade="all, delete-orphan"
    )


class OrderItem(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "order_items"
    order_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"), index=True
    )
    product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("products.id"), index=True)
    variant_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("product_variants.id"))
    product_name: Mapped[str] = mapped_column(String(250))
    sku: Mapped[str] = mapped_column(String(80))
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 3))
    quantity: Mapped[int] = mapped_column(Integer)
    line_total: Mapped[Decimal] = mapped_column(Numeric(12, 3))
    order: Mapped[Order] = relationship(back_populates="items")


class Coupon(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "coupons"
    code: Mapped[str] = mapped_column(String(60), unique=True, index=True)
    discount_type: Mapped[str] = mapped_column(String(20))
    value: Mapped[Decimal] = mapped_column(Numeric(12, 3))
    minimum_order_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 3))
    usage_limit: Mapped[int | None] = mapped_column(Integer)
    usage_count: Mapped[int] = mapped_column(Integer, default=0)
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class Discount(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "discounts"
    name: Mapped[str] = mapped_column(String(160))
    discount_type: Mapped[str] = mapped_column(String(20))
    value: Mapped[Decimal] = mapped_column(Numeric(12, 3))
    scope: Mapped[str] = mapped_column(String(20), default="store")
    scope_reference: Mapped[str | None] = mapped_column(String(180))
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class StoreSetting(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "store_settings"
    key: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    value: Mapped[str] = mapped_column(Text)


class ReturnRequest(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "return_requests"
    order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orders.id"), index=True)
    status: Mapped[str] = mapped_column(String(30), default="requested", index=True)
    reason: Mapped[str] = mapped_column(Text)


class WishlistItem(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "wishlist_items"
    __table_args__ = (UniqueConstraint("customer_id", "product_id"),)
    customer_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("customers.id", ondelete="CASCADE"), index=True
    )
    product_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), index=True
    )


class AccountToken(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "account_tokens"
    customer_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("customers.id", ondelete="CASCADE"), index=True
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    purpose: Mapped[str] = mapped_column(String(30), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class EmailOutbox(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "email_outbox"
    recipient: Mapped[str] = mapped_column(String(320), index=True)
    subject: Mapped[str] = mapped_column(String(300))
    body: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    last_error: Mapped[str | None] = mapped_column(String(500))
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
