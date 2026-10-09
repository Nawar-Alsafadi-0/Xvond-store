from fastapi import APIRouter

from app.api import (
    accounts,
    admin,
    admin_order_details,
    admin_uploads,
    catalog,
    courier,
    external_auth,
    facebook_auth,
    manual_orders,
    operator_auth,
    orders,
    payments,
    phone_auth,
    profile,
    readiness_admin,
    session_status,
    shipping_admin,
)

api_router = APIRouter()
api_router.include_router(accounts.router)
api_router.include_router(operator_auth.router)
api_router.include_router(session_status.router)
api_router.include_router(phone_auth.router)
api_router.include_router(external_auth.router)
api_router.include_router(facebook_auth.router)
api_router.include_router(profile.router)
api_router.include_router(catalog.router)
api_router.include_router(admin.router)
api_router.include_router(admin_order_details.router)
api_router.include_router(admin_uploads.router)
api_router.include_router(shipping_admin.router)
api_router.include_router(readiness_admin.router)
api_router.include_router(orders.router)
api_router.include_router(manual_orders.router)
api_router.include_router(payments.router)
api_router.include_router(courier.router)
