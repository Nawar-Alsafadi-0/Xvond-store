import asyncio
import sys
import tempfile
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import func, select, text

from app.core.config import get_settings
from app.core.database import SessionFactory
from app.models.commerce import Product, ProductVariant
from app.models.shipping import ShippingRate
from app.services.shipping.local import OMAN_GOVERNORATE_KEYS

EXPECTED_OMAN_GOVERNORATES = len(OMAN_GOVERNORATE_KEYS)


def migration_head() -> str:
    config = Config("alembic.ini")
    script = ScriptDirectory.from_config(config)
    head = script.get_current_head()
    if head is None:
        raise RuntimeError("Alembic has no migration head")
    return head


def media_storage_writable(media_root: str) -> bool:
    try:
        root = Path(media_root)
        root.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(prefix="xvond-preflight-", dir=root, delete=True) as handle:
            handle.write(b"ok")
            handle.flush()
        return True
    except OSError:
        return False


async def run() -> int:
    settings = get_settings()
    failures: list[str] = []
    expected_head = migration_head()

    async with SessionFactory() as session:
        database_head = await session.scalar(text("select version_num from alembic_version"))
        active_products = await session.scalar(
            select(func.count(Product.id)).where(Product.is_active.is_(True))
        )
        stocked_variants = await session.scalar(
            select(func.count(ProductVariant.id))
            .join(Product, Product.id == ProductVariant.product_id)
            .where(Product.is_active.is_(True), ProductVariant.stock_quantity > 0)
        )
        active_shipping_keys = set(
            await session.scalars(
                select(ShippingRate.governorate_key).where(ShippingRate.is_active.is_(True))
            )
        )
        paid_shipping_rates = await session.scalar(
            select(func.count(ShippingRate.id)).where(
                ShippingRate.is_active.is_(True), ShippingRate.amount != 0
            )
        )

    tap_ready = bool(
        settings.tap_enabled
        and settings.tap_secret_key
        and settings.tap_merchant_id
        and settings.tap_webhook_url
    )
    checks = {
        "environment": settings.app_env == "production",
        "https_frontend": settings.frontend_url.startswith("https://"),
        "migrations": database_head == expected_head,
        "catalog": bool(active_products and stocked_variants),
        "oman_governorates": active_shipping_keys == OMAN_GOVERNORATE_KEYS,
        "free_delivery": (paid_shipping_rates or 0) == 0,
        "database_residency": settings.database_residency_country.strip().upper() == "OM",
        "smtp": bool(settings.smtp_host and settings.smtp_username and settings.smtp_password),
        "product_media": media_storage_writable(settings.media_root),
        "payment": True,
    }

    for name, ready in checks.items():
        print(f"{'OK' if ready else 'FAIL'}  {name}")
        if not ready:
            failures.append(name)

    print(f"database migration: {database_head or 'missing'} / expected {expected_head}")
    print(f"active products: {active_products or 0}")
    print(f"stocked variants on active products: {stocked_variants or 0}")
    print(
        f"required Oman delivery areas active: "
        f"{len(active_shipping_keys & OMAN_GOVERNORATE_KEYS)}/{EXPECTED_OMAN_GOVERNORATES}"
    )
    unexpected = sorted(active_shipping_keys - OMAN_GOVERNORATE_KEYS)
    if unexpected:
        print("unexpected active delivery areas: " + ", ".join(unexpected))
    print(f"paid delivery areas: {paid_shipping_rates or 0}")
    print(f"product media root: {settings.media_root}")
    print("payment methods: COD enabled" + (" + Tap ready" if tap_ready else " + Tap optional/not ready"))

    if failures:
        print("Preflight failed: " + ", ".join(failures), file=sys.stderr)
        return 1
    print("Production preflight passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(run()))
