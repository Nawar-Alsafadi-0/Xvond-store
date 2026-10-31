from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_session
from app.core.security import require_admin
from app.models.commerce import Product, ProductVariant
from app.models.shipping import ShippingRate
from app.services.shipping.local import OMAN_GOVERNORATE_KEYS

router = APIRouter(
    prefix="/admin/launch-readiness",
    tags=["admin-readiness"],
    dependencies=[Depends(require_admin)],
)
Session = Annotated[AsyncSession, Depends(get_session)]
EXPECTED_OMAN_GOVERNORATES = len(OMAN_GOVERNORATE_KEYS)


@router.get("")
async def launch_readiness(session: Session) -> dict[str, object]:
    settings = get_settings()
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
    smtp_ready = bool(
        settings.smtp_host and settings.smtp_username and settings.smtp_password
    )
    tap_ready = bool(
        settings.tap_enabled
        and settings.tap_secret_key
        and settings.tap_merchant_id
        and settings.tap_webhook_url
    )
    payment_ready = True
    residency_ready = settings.database_residency_country.strip().upper() == "OM"
    shipping_ready = (
        active_shipping_keys == OMAN_GOVERNORATE_KEYS
        and (settings.shipping_pricing_mode == "configured" or (paid_shipping_rates or 0) == 0)
    )
    production_ready = settings.app_env == "production" and settings.frontend_url.startswith(
        "https://"
    )

    checks = [
        {
            "key": "catalog",
            "ready": bool(active_products and stocked_variants),
            "detail": (
                f"{active_products or 0} active products, "
                f"{stocked_variants or 0} stocked variants on active products"
            ),
        },
        {
            "key": "market",
            "ready": True,
            "detail": "Oman only · OMR · free delivery",
        },
        {
            "key": "shipping",
            "ready": shipping_ready,
            "detail": (
                f"{len(active_shipping_keys)}/{EXPECTED_OMAN_GOVERNORATES} required Oman governorates active · "
                f"{paid_shipping_rates or 0} with non-zero delivery fee · "
                f"policy: {settings.shipping_pricing_mode}"
            ),
        },
        {
            "key": "data_residency",
            "ready": residency_ready,
            "detail": (
                "Primary database declared in Oman"
                if residency_ready
                else f"DATABASE_RESIDENCY_COUNTRY={settings.database_residency_country}"
            ),
        },
        {
            "key": "email",
            "ready": smtp_ready,
            "detail": "SMTP configured" if smtp_ready else "SMTP incomplete",
        },
        {
            "key": "payment",
            "ready": payment_ready,
            "detail": "Cash on delivery enabled · Tap enabled" if tap_ready else "Cash on delivery enabled · Tap optional/not ready",
        },
        {
            "key": "production",
            "ready": production_ready,
            "detail": f"APP_ENV={settings.app_env}",
        },
    ]
    ready_count = sum(1 for check in checks if check["ready"])
    return {
        "ready": ready_count == len(checks),
        "ready_count": ready_count,
        "total_checks": len(checks),
        "checks": checks,
    }
