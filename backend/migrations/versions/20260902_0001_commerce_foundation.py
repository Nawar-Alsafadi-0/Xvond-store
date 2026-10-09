"""commerce foundation

Revision ID: 20260902_0001
Revises:
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260902_0001"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def timestamps() -> list[sa.Column]:
    return [
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    ]


def upgrade() -> None:
    order_status = sa.Enum(
        "pending",
        "confirmed",
        "processing",
        "shipped",
        "delivered",
        "cancelled",
        "returned",
        name="orderstatus",
    )
    payment_status = sa.Enum(
        "pending", "authorized", "paid", "failed", "refunded", name="paymentstatus"
    )

    op.create_table(
        "categories",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("slug", sa.String(140), nullable=False),
        sa.Column("name_ar", sa.String(200), nullable=False),
        sa.Column("name_en", sa.String(200), nullable=False),
        sa.Column("description_ar", sa.Text()),
        sa.Column("description_en", sa.Text()),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        *timestamps(),
        sa.UniqueConstraint("slug"),
    )
    op.create_index("ix_categories_slug", "categories", ["slug"])
    op.create_table(
        "customers",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("phone", sa.String(32)),
        sa.Column("full_name", sa.String(180), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        *timestamps(),
        sa.UniqueConstraint("email"),
        sa.UniqueConstraint("phone"),
    )
    op.create_index("ix_customers_email", "customers", ["email"])
    op.create_table(
        "products",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("slug", sa.String(180), nullable=False),
        sa.Column("sku", sa.String(80), nullable=False),
        sa.Column("name_ar", sa.String(250), nullable=False),
        sa.Column("name_en", sa.String(250), nullable=False),
        sa.Column("description_ar", sa.Text()),
        sa.Column("description_en", sa.Text()),
        sa.Column("category_id", sa.Uuid(), sa.ForeignKey("categories.id"), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        *timestamps(),
        sa.UniqueConstraint("slug"),
        sa.UniqueConstraint("sku"),
    )
    op.create_index("ix_products_slug", "products", ["slug"])
    op.create_index("ix_products_sku", "products", ["sku"])
    op.create_index("ix_products_category_id", "products", ["category_id"])
    op.create_index("ix_products_is_active", "products", ["is_active"])
    op.create_table(
        "product_variants",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "product_id",
            sa.Uuid(),
            sa.ForeignKey("products.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("sku", sa.String(80), nullable=False),
        sa.Column("title_ar", sa.String(180), nullable=False),
        sa.Column("title_en", sa.String(180), nullable=False),
        sa.Column("price", sa.Numeric(12, 3), nullable=False),
        sa.Column("compare_at_price", sa.Numeric(12, 3)),
        sa.Column("stock_quantity", sa.Integer(), nullable=False),
        *timestamps(),
        sa.UniqueConstraint("product_id", "sku"),
    )
    op.create_index("ix_product_variants_product_id", "product_variants", ["product_id"])
    op.create_index("ix_product_variants_sku", "product_variants", ["sku"])
    op.create_table(
        "addresses",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("customer_id", sa.Uuid(), sa.ForeignKey("customers.id"), nullable=False),
        sa.Column("label", sa.String(80), nullable=False),
        sa.Column("country_code", sa.String(2), nullable=False),
        sa.Column("governorate", sa.String(120), nullable=False),
        sa.Column("city", sa.String(120), nullable=False),
        sa.Column("address_line", sa.String(300), nullable=False),
        sa.Column("postal_code", sa.String(20)),
        *timestamps(),
    )
    op.create_index("ix_addresses_customer_id", "addresses", ["customer_id"])
    op.create_table(
        "orders",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("order_number", sa.String(32), nullable=False),
        sa.Column("customer_id", sa.Uuid(), sa.ForeignKey("customers.id")),
        sa.Column("status", order_status, nullable=False),
        sa.Column("payment_status", payment_status, nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("subtotal", sa.Numeric(12, 3), nullable=False),
        sa.Column("discount_total", sa.Numeric(12, 3), nullable=False),
        sa.Column("shipping_total", sa.Numeric(12, 3), nullable=False),
        sa.Column("tax_total", sa.Numeric(12, 3), nullable=False),
        sa.Column("grand_total", sa.Numeric(12, 3), nullable=False),
        *timestamps(),
        sa.UniqueConstraint("order_number"),
    )
    op.create_index("ix_orders_order_number", "orders", ["order_number"])
    op.create_index("ix_orders_customer_id", "orders", ["customer_id"])
    op.create_index("ix_orders_status", "orders", ["status"])
    op.create_index("ix_orders_payment_status", "orders", ["payment_status"])
    op.create_table(
        "coupons",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("code", sa.String(60), nullable=False),
        sa.Column("discount_type", sa.String(20), nullable=False),
        sa.Column("value", sa.Numeric(12, 3), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        *timestamps(),
        sa.UniqueConstraint("code"),
    )
    op.create_index("ix_coupons_code", "coupons", ["code"])
    op.create_table(
        "return_requests",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("order_id", sa.Uuid(), sa.ForeignKey("orders.id"), nullable=False),
        sa.Column("status", sa.String(30), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        *timestamps(),
    )
    op.create_index("ix_return_requests_order_id", "return_requests", ["order_id"])
    op.create_index("ix_return_requests_status", "return_requests", ["status"])


def downgrade() -> None:
    for table in [
        "return_requests",
        "coupons",
        "orders",
        "addresses",
        "product_variants",
        "products",
        "customers",
        "categories",
    ]:
        op.drop_table(table)
    sa.Enum(name="paymentstatus").drop(op.get_bind())
    sa.Enum(name="orderstatus").drop(op.get_bind())
