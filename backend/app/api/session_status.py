import uuid
from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.accounts import profile
from app.core.database import get_session
from app.core.security import SESSION_COOKIE, decode_session
from app.models.commerce import Customer
from app.models.integrations import AuthIdentity

router = APIRouter(tags=["authentication"])
Session = Annotated[AsyncSession, Depends(get_session)]


@router.get("/auth/session")
async def session_status(
    session: Session,
    session_cookie: Annotated[str | None, Cookie(alias=SESSION_COOKIE)] = None,
) -> dict[str, object]:
    """Return a guest-safe session snapshot without 401 for normal signed-out traffic."""
    try:
        payload = decode_session(session_cookie)
    except HTTPException:
        return {"authenticated": False, "profile": None}
    if payload.get("role") != "customer":
        return {"authenticated": False, "profile": None}
    try:
        customer_id = uuid.UUID(str(payload["sub"]))
    except (ValueError, KeyError):
        return {"authenticated": False, "profile": None}
    customer = await session.get(Customer, customer_id)
    if customer is None or not customer.is_active:
        return {"authenticated": False, "profile": None}

    phone_verified = False
    if customer.phone:
        phone_verified = (
            await session.scalar(
                select(AuthIdentity.id).where(
                    AuthIdentity.customer_id == customer.id,
                    AuthIdentity.provider == "phone",
                    AuthIdentity.subject == customer.phone,
                )
            )
        ) is not None

    snapshot = profile(customer).model_dump(mode="json")
    snapshot["phone_verified"] = phone_verified
    return {"authenticated": True, "profile": snapshot}
