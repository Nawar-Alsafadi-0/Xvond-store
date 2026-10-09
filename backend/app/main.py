from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.api.router import api_router
from app.core.auth_rate_limit import check_auth_rate_limit
from app.core.config import get_settings
from app.core.database import engine

settings = get_settings()
media_root = Path(settings.media_root)
media_root.mkdir(parents=True, exist_ok=True)

app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    docs_url="/docs" if settings.app_env != "production" else None,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    limited = check_auth_rate_limit(request, settings.api_prefix)
    if limited is not None:
        return limited

    if request.url.path.startswith(f"{settings.api_prefix}/admin") and request.method != "GET":
        content_type = request.headers.get("content-type", "")
        upload_path = f"{settings.api_prefix}/admin/uploads/product-image"
        multipart_upload = (
            request.method == "POST"
            and request.url.path == upload_path
            and content_type.startswith("multipart/form-data")
        )
        if request.method in {"POST", "PATCH", "PUT"} and not (
            "application/json" in content_type or multipart_upload
        ):
            return JSONResponse(
                status_code=415,
                content={"detail": "Content-Type must be application/json"},
            )
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    if settings.app_env == "production":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    if request.url.path.startswith(
        (
            f"{settings.api_prefix}/auth",
            f"{settings.api_prefix}/account",
            f"{settings.api_prefix}/admin",
        )
    ):
        response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/health", tags=["system"])
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "xvond-store-api"}


@app.get("/ready", tags=["system"])
async def ready() -> dict[str, str]:
    try:
        async with engine.connect() as connection:
            await connection.execute(text("select 1"))
    except (SQLAlchemyError, OSError):
        raise HTTPException(status_code=503, detail="Database unavailable") from None
    email_configured = bool(
        settings.smtp_host and settings.smtp_username and settings.smtp_password
    )
    return {
        "status": "ready",
        "database": "connected",
        "email": "configured" if email_configured else "not-configured",
        "google_auth": "configured" if settings.google_auth_enabled else "not-configured",
        "phone_auth": "configured" if settings.phone_auth_enabled else "not-configured",
    }


app.mount(
    f"{settings.api_prefix}/media",
    StaticFiles(directory=media_root),
    name="media",
)
app.include_router(api_router, prefix=settings.api_prefix)
