import secrets
from typing import Annotated

from fastapi import APIRouter, Cookie, HTTPException, Response

from app.core.config import get_settings
from app.core.security import SESSION_COOKIE, create_session, decode_session
from app.schemas.auth import LoginRequest

router = APIRouter(tags=["authentication"])


def set_operator_session_cookie(response: Response, token: str) -> None:
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


@router.post("/auth/operator/login")
async def operator_login(payload: LoginRequest, response: Response) -> dict[str, str]:
    settings = get_settings()
    if not settings.operator_email or not settings.operator_password:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    valid = secrets.compare_digest(payload.email.lower(), settings.operator_email.lower())
    valid &= secrets.compare_digest(payload.password, settings.operator_password)
    if not valid:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    set_operator_session_cookie(response, create_session(settings.operator_email, "operator"))
    return {"role": "operator", "email": settings.operator_email}


@router.get("/auth/operator/me")
async def operator_me(
    session_cookie: Annotated[str | None, Cookie(alias=SESSION_COOKIE)] = None,
) -> dict[str, str]:
    payload = decode_session(session_cookie)
    if payload.get("role") != "operator":
        raise HTTPException(status_code=401, detail="Operator authentication required")
    return {"role": "operator", "email": str(payload["sub"])}
