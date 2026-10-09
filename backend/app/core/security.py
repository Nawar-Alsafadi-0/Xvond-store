import base64
import hashlib
import hmac
import json
import os
import secrets
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import Cookie, Header, HTTPException, Request, status

from app.core.config import get_settings

SESSION_COOKIE = "xvond_store_session"
PBKDF2_ITERATIONS = 600_000


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, PBKDF2_ITERATIONS)
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, encoded: str | None) -> bool:
    if not encoded:
        return False
    try:
        algorithm, rounds, salt, expected = encoded.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), int(rounds))
        return secrets.compare_digest(digest.hex(), expected)
    except (ValueError, TypeError):
        return False


def _encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode()


def _decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def create_session(subject: str, role: str) -> str:
    settings = get_settings()
    payload = {
        "sub": subject,
        "role": role,
        "exp": int((datetime.now(UTC) + timedelta(hours=settings.session_hours)).timestamp()),
    }
    body = _encode(json.dumps(payload, separators=(",", ":")).encode())
    signature = _encode(hmac.digest(settings.session_secret.encode(), body.encode(), "sha256"))
    return f"{body}.{signature}"


def decode_session(token: str | None) -> dict[str, str | int]:
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required"
        )
    try:
        body, signature = token.split(".", 1)
        expected = _encode(
            hmac.digest(get_settings().session_secret.encode(), body.encode(), "sha256")
        )
        if not secrets.compare_digest(signature, expected):
            raise ValueError
        payload = json.loads(_decode(body))
        if int(payload["exp"]) < int(datetime.now(UTC).timestamp()):
            raise ValueError
        return payload
    except (ValueError, KeyError, json.JSONDecodeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired session"
        ) from None


def operator_route_allowed(method: str, path: str, api_prefix: str = "/api/v1") -> bool:
    prefix = f"{api_prefix}/admin"
    if not path.startswith(prefix):
        return False
    relative = path[len(prefix):] or "/"
    method = method.upper()

    if method == "GET" and relative in {"/overview", "/products", "/categories", "/orders", "/discounts", "/coupons"}:
        return True
    if method == "GET" and relative.startswith("/orders/"):
        return True
    if method == "POST" and relative in {"/products", "/discounts", "/coupons", "/uploads/product-image"}:
        return True
    if method == "PATCH" and relative.startswith(("/products/", "/variants/", "/inventory/", "/discounts/", "/coupons/")):
        return True
    if method == "DELETE" and relative.startswith(("/products/", "/discounts/", "/coupons/")):
        return True
    return False


async def require_admin(
    request: Request,
    session_cookie: Annotated[str | None, Cookie(alias=SESSION_COOKIE)] = None,
    authorization: Annotated[str | None, Header()] = None,
) -> None:
    settings = get_settings()
    if session_cookie:
        payload = decode_session(session_cookie)
        role = payload.get("role")
        if role == "admin":
            return
        if role == "operator":
            if operator_route_allowed(request.method, request.url.path, settings.api_prefix):
                return
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This operator account does not have permission for this action",
            )
    expected = f"Bearer {settings.admin_api_token}"
    if authorization is None or not hmac.compare_digest(authorization, expected):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
