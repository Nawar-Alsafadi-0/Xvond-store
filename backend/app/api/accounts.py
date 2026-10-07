import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_session
from app.core.security import (
    SESSION_COOKIE,
    create_session,
    decode_session,
    hash_password,
    verify_password,
)
from app.models.commerce import (
    AccountToken,
    Address,
    Customer,
    Order,
    Product,
    ReturnRequest,
    WishlistItem,
)
from app.schemas.auth import (
    AddressWrite,
    EmailRequest,
    LoginRequest,
    PasswordResetConfirm,
    ProfileRead,
    RegisterRequest,
    ReturnWrite,
    TokenRequest,
    WishlistWrite,
)
from app.services.email import queue_account_link

router = APIRouter(tags=["authentication"])
Session = Annotated[AsyncSession, Depends(get_session)]


def set_session_cookie(response: Response, token: str) -> None:
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


async def current_customer(
    session: Session,
    session_cookie: Annotated[str | None, Cookie(alias=SESSION_COOKIE)] = None,
) -> Customer:
    payload = decode_session(session_cookie)
    if payload.get("role") != "customer":
        raise HTTPException(status_code=401, detail="Customer authentication required")
    try:
        customer_id = uuid.UUID(str(payload["sub"]))
    except (ValueError, KeyError):
        raise HTTPException(status_code=401, detail="Invalid session") from None
    customer = await session.get(Customer, customer_id)
    if customer is None or not customer.is_active:
        raise HTTPException(status_code=401, detail="Customer not found")
    return customer


CurrentCustomer = Annotated[Customer, Depends(current_customer)]


def profile(customer: Customer) -> ProfileRead:
    return ProfileRead(
        id=str(customer.id),
        full_name=customer.full_name,
        email=customer.email,
        phone=customer.phone,
        email_verified=customer.email_verified,
    )


async def issue_token(customer: Customer, purpose: str, session: AsyncSession) -> str:
    if not customer.email:
        raise HTTPException(status_code=422, detail="This account does not have an email address")
    raw = secrets.token_urlsafe(32)
    session.add(
        AccountToken(
            customer_id=customer.id,
            token_hash=hashlib.sha256(raw.encode()).hexdigest(),
            purpose=purpose,
            expires_at=datetime.now(UTC) + timedelta(hours=2),
        )
    )
    queue_account_link(session, customer.email, purpose, raw)
    await session.commit()
    return raw


async def consume_token(
    raw: str, purpose: str, session: AsyncSession
) -> tuple[AccountToken, Customer]:
    token = await session.scalar(
        select(AccountToken)
        .where(
            AccountToken.token_hash == hashlib.sha256(raw.encode()).hexdigest(),
            AccountToken.purpose == purpose,
        )
        .with_for_update()
    )
    now = datetime.now(UTC)
    if token is None or token.used_at is not None or token.expires_at < now:
        raise HTTPException(status_code=422, detail="Token is invalid or expired")
    customer = await session.get(Customer, token.customer_id)
    if customer is None:
        raise HTTPException(status_code=422, detail="Token is invalid")
    token.used_at = now
    return token, customer


@router.post("/auth/register", response_model=ProfileRead, status_code=status.HTTP_201_CREATED)
async def register(payload: RegisterRequest, response: Response, session: Session) -> ProfileRead:
    email = payload.email.lower()
    customer = await session.scalar(select(Customer).where(Customer.email == email))
    if customer is not None and customer.password_hash:
        raise HTTPException(status_code=409, detail="An account already exists")
    if customer is None:
        customer = Customer(email=email, full_name=payload.full_name or "Xvond Member")
        session.add(customer)
    else:
        customer.full_name = payload.full_name or customer.full_name
    customer.password_hash = hash_password(payload.password)
    await session.commit()
    await session.refresh(customer)
    await issue_token(customer, "verify-email", session)
    set_session_cookie(response, create_session(str(customer.id), "customer"))
    return profile(customer)


@router.post("/auth/login", response_model=ProfileRead)
async def login(payload: LoginRequest, response: Response, session: Session) -> ProfileRead:
    customer = await session.scalar(select(Customer).where(Customer.email == payload.email.lower()))
    if customer is None or not verify_password(payload.password, customer.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    set_session_cookie(response, create_session(str(customer.id), "customer"))
    return profile(customer)


@router.post("/auth/password/forgot", status_code=202)
async def forgot_password(payload: EmailRequest, session: Session) -> dict[str, str]:
    customer = await session.scalar(select(Customer).where(Customer.email == payload.email.lower()))
    if customer is not None and customer.password_hash:
        await issue_token(customer, "reset-password", session)
    return {"status": "accepted"}


@router.post("/auth/password/reset")
async def reset_password(payload: PasswordResetConfirm, session: Session) -> dict[str, str]:
    _, customer = await consume_token(payload.token, "reset-password", session)
    customer.password_hash = hash_password(payload.password)
    await session.commit()
    return {"status": "password-updated"}


@router.post("/auth/email/verify")
async def verify_email(payload: TokenRequest, session: Session) -> dict[str, str]:
    _, customer = await consume_token(payload.token, "verify-email", session)
    customer.email_verified = True
    await session.commit()
    return {"status": "email-verified"}


@router.post("/auth/email/resend", status_code=202)
async def resend_verification(customer: CurrentCustomer, session: Session) -> dict[str, str]:
    if not customer.email:
        raise HTTPException(status_code=422, detail="This account does not have an email address")
    if not customer.email_verified:
        await issue_token(customer, "verify-email", session)
    return {"status": "accepted"}


@router.post("/auth/admin/login")
async def admin_login(payload: LoginRequest, response: Response) -> dict[str, str]:
    settings = get_settings()
    valid = secrets.compare_digest(payload.email.lower(), settings.admin_email.lower())
    valid &= secrets.compare_digest(payload.password, settings.admin_password)
    if not valid:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    set_session_cookie(response, create_session(settings.admin_email, "admin"))
    return {"role": "admin"}


@router.get("/auth/admin/me")
async def admin_me(
    session_cookie: Annotated[str | None, Cookie(alias=SESSION_COOKIE)] = None,
) -> dict[str, str]:
    payload = decode_session(session_cookie)
    if payload.get("role") != "admin":
        raise HTTPException(status_code=401, detail="Admin authentication required")
    return {"role": "admin", "email": str(payload["sub"])}


@router.post("/auth/logout", status_code=204)
async def logout(response: Response) -> None:
    response.delete_cookie(SESSION_COOKIE, path="/")


@router.get("/account/me", response_model=ProfileRead)
async def me(customer: CurrentCustomer) -> ProfileRead:
    return profile(customer)


@router.get("/account/addresses")
async def addresses(
    customer: CurrentCustomer, session: Session
) -> list[dict[str, str | float | None]]:
    result = await session.scalars(
        select(Address)
        .where(Address.customer_id == customer.id)
        .order_by(Address.created_at.desc())
    )
    return [
        {
            "id": str(item.id),
            "label": item.label,
            "governorate": item.governorate,
            "city": item.city,
            "address_line": item.address_line,
            "postal_code": item.postal_code,
            "latitude": item.latitude,
            "longitude": item.longitude,
        }
        for item in result
    ]


@router.post("/account/addresses", status_code=201)
async def add_address(
    payload: AddressWrite, customer: CurrentCustomer, session: Session
) -> dict[str, str]:
    address = Address(customer_id=customer.id, **payload.model_dump())
    session.add(address)
    await session.commit()
    return {"id": str(address.id)}


@router.delete("/account/addresses/{address_id}", status_code=204)
async def delete_address(
    address_id: uuid.UUID, customer: CurrentCustomer, session: Session
) -> None:
    address = await session.scalar(
        select(Address).where(Address.id == address_id, Address.customer_id == customer.id)
    )
    if address is None:
        raise HTTPException(status_code=404, detail="Address not found")
    await session.delete(address)
    await session.commit()


@router.get("/account/orders")
async def customer_orders(customer: CurrentCustomer, session: Session) -> list[dict[str, object]]:
    result = await session.scalars(
        select(Order).where(Order.customer_id == customer.id).order_by(Order.created_at.desc())
    )
    return [
        {
            "order_number": item.order_number,
            "status": item.status,
            "payment_status": item.payment_status,
            "currency": item.currency,
            "grand_total": str(item.grand_total),
            "created_at": item.created_at,
        }
        for item in result
    ]


@router.get("/account/orders/{order_number}/track")
async def customer_order_tracking(
    order_number: str, customer: CurrentCustomer, session: Session
) -> dict[str, object]:
    order = await session.scalar(
        select(Order).where(
            Order.order_number == order_number.upper(),
            Order.customer_id == customer.id,
        )
    )
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    return {
        "order_number": order.order_number,
        "status": order.status,
        "payment_status": order.payment_status,
        "payment_method": order.payment_method,
        "grand_total": str(order.grand_total),
        "currency": order.currency,
        "created_at": order.created_at,
    }


@router.get("/account/wishlist")
async def wishlist(customer: CurrentCustomer, session: Session) -> list[str]:
    result = await session.scalars(
        select(Product.slug)
        .join(WishlistItem, WishlistItem.product_id == Product.id)
        .where(WishlistItem.customer_id == customer.id, Product.is_active.is_(True))
    )
    return list(result)


@router.post("/account/wishlist", status_code=201)
async def add_wishlist(
    payload: WishlistWrite, customer: CurrentCustomer, session: Session
) -> dict[str, str]:
    product = await session.scalar(
        select(Product).where(Product.slug == payload.product_slug, Product.is_active.is_(True))
    )
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")
    existing = await session.scalar(
        select(WishlistItem).where(
            WishlistItem.customer_id == customer.id,
            WishlistItem.product_id == product.id,
        )
    )
    if existing is None:
        session.add(WishlistItem(customer_id=customer.id, product_id=product.id))
        await session.commit()
    return {"product_slug": product.slug}


@router.delete("/account/wishlist/{product_slug}", status_code=204)
async def remove_wishlist(product_slug: str, customer: CurrentCustomer, session: Session) -> None:
    item = await session.scalar(
        select(WishlistItem)
        .join(Product, Product.id == WishlistItem.product_id)
        .where(WishlistItem.customer_id == customer.id, Product.slug == product_slug)
    )
    if item is not None:
        await session.delete(item)
        await session.commit()


@router.get("/account/returns")
async def returns(customer: CurrentCustomer, session: Session) -> list[dict[str, object]]:
    result = await session.execute(
        select(ReturnRequest, Order.order_number)
        .join(Order, Order.id == ReturnRequest.order_id)
        .where(Order.customer_id == customer.id)
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


@router.post("/account/returns", status_code=201)
async def request_return(
    payload: ReturnWrite, customer: CurrentCustomer, session: Session
) -> dict[str, str]:
    order = await session.scalar(
        select(Order).where(
            Order.order_number == payload.order_number.upper(),
            Order.customer_id == customer.id,
        )
    )
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    return_request = ReturnRequest(order_id=order.id, reason=payload.reason)
    session.add(return_request)
    await session.commit()
    return {"id": str(return_request.id), "status": return_request.status}
