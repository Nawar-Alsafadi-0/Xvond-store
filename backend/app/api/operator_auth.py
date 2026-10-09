import secrets
from typing import Annotated

from fastapi import APIRouter, Cookie, HTTPException, Response

from app.core.config import get_settings
from app.core.security import SESSION_COOKIE, create_session, decode_session
from app.schemas.auth import LoginRequest

router = APIRouter(tags=["authentication"])


def set_admin_session_cookie(response: Response, token: str) -> None:
    settings = get_settings()
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=settings.session_hours * 3600,
        httponly=True,
        secure=settings.secure_cookies,
        samesite="lax",
        path="/",
    )


@router.post("/auth/admin/login")
@router.post("/auth/operator/login")
async def admin_login(payload: LoginRequest, response: Response) -> dict[str, str]:
    settings = get_settings()
    email = payload.email.lower()

    owner_valid = secrets.compare_digest(email, settings.admin_email.lower())
    owner_valid &= secrets.compare_digest(payload.password, settings.admin_password)
    if owner_valid:
        set_admin_session_cookie(response, create_session(settings.admin_email, "admin"))
        return {"role": "admin", "email": settings.admin_email}

    if settings.operator_email and settings.operator_password:
        operator_valid = secrets.compare_digest(email, settings.operator_email.lower())
        operator_valid &= secrets.compare_digest(payload.password, settings.operator_password)
        if operator_valid:
            set_admin_session_cookie(response, create_session(settings.operator_email, "operator"))
            return {"role": "operator", "email": settings.operator_email}

    raise HTTPException(status_code=401, detail="Invalid email or password")


@router.get("/auth/admin/me")
@router.get("/auth/operator/me")
async def admin_me(
    session_cookie: Annotated[str | None, Cookie(alias=SESSION_COOKIE)] = None,
) -> dict[str, str]:
    payload = decode_session(session_cookie)
    role = str(payload.get("role") or "")
    if role not in {"admin", "operator"}:
        raise HTTPException(status_code=401, detail="Admin authentication required")
    return {"role": role, "email": str(payload["sub"])}
