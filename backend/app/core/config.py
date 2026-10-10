from functools import lru_cache

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Xvond Store API"
    app_env: str = "development"
    api_prefix: str = "/api/v1"
    database_url: str = "postgresql+asyncpg://xvond_store:xvond_store@localhost:5432/xvond_store"
    database_residency_country: str = "OM"
    admin_api_token: str = Field(default="development-only-token-change-me", min_length=24)
    admin_email: str = "admin@xvond.com"
    admin_password: str = Field(default="development-admin-password", min_length=8)
    operator_email: str | None = None
    operator_password: str | None = Field(default=None, min_length=8)
    session_secret: str = Field(default="development-session-secret-change-me", min_length=32)
    session_hours: int = Field(default=12, ge=1, le=168)
    pending_order_hold_minutes: int = Field(default=30, ge=5, le=180)
    frontend_url: str = "http://localhost:3000"
    public_api_url: str | None = None
    media_root: str = "./media"
    email_from: str = "Xvond Store <no-reply@xvond.com>"
    smtp_host: str | None = None
    smtp_port: int = Field(default=587, ge=1, le=65535)
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_starttls: bool = True
    tap_enabled: bool = False
    tap_secret_key: str | None = None
    tap_merchant_id: str | None = None
    tap_source_id: str = "src_all"
    tap_webhook_url: str | None = None
    google_client_id: str | None = None
    google_client_secret: str | None = None
    google_redirect_uri: str | None = None
    apple_client_id: str | None = None
    apple_team_id: str | None = None
    apple_key_id: str | None = None
    apple_private_key: str | None = None
    apple_redirect_uri: str | None = None
    facebook_app_id: str | None = None
    facebook_app_secret: str | None = None
    facebook_redirect_uri: str | None = None
    facebook_graph_version: str = "v24.0"
    twilio_account_sid: str | None = None
    twilio_auth_token: str | None = None
    twilio_verify_service_sid: str | None = None
    courier_webhook_secret: str | None = None
    cors_origins: str = "http://localhost:3000"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def secure_cookies(self) -> bool:
        return self.app_env == "production"

    @property
    def google_auth_enabled(self) -> bool:
        return bool(self.google_client_id and self.google_client_secret and self.google_redirect_uri)

    @property
    def apple_auth_enabled(self) -> bool:
        return bool(
            self.apple_client_id
            and self.apple_team_id
            and self.apple_key_id
            and self.apple_private_key
            and self.apple_redirect_uri
        )

    @property
    def facebook_auth_enabled(self) -> bool:
        return bool(self.facebook_app_id and self.facebook_app_secret and self.facebook_redirect_uri)

    @property
    def phone_auth_enabled(self) -> bool:
        return bool(self.twilio_account_sid and self.twilio_auth_token and self.twilio_verify_service_sid)

    @model_validator(mode="after")
    def validate_production(self) -> "Settings":
        if self.app_env != "production":
            return self

        def placeholder(value: str) -> bool:
            lowered = value.lower()
            return any(word in lowered for word in ("development", "replace", "change-me"))

        insecure = {
            "ADMIN_API_TOKEN": placeholder(self.admin_api_token),
            "ADMIN_PASSWORD": placeholder(self.admin_password),
            "SESSION_SECRET": placeholder(self.session_secret),
            "DATABASE_URL": (
                "xvond_store:xvond_store@localhost" in self.database_url
                or placeholder(self.database_url)
            ),
            "SMTP_USERNAME": placeholder(self.smtp_username or ""),
            "SMTP_PASSWORD": placeholder(self.smtp_password or ""),
        }
        if self.operator_email or self.operator_password:
            if not self.operator_email or not self.operator_password:
                raise ValueError("OPERATOR_EMAIL and OPERATOR_PASSWORD must be configured together")
            insecure["OPERATOR_PASSWORD"] = placeholder(self.operator_password)
        invalid = [name for name, failed in insecure.items() if failed]
        if invalid:
            raise ValueError(f"Production configuration is unsafe: {', '.join(invalid)}")
        if self.database_residency_country.strip().upper() != "OM":
            raise ValueError("Production database residency must be Oman (OM) for the current launch")
        if not all((self.smtp_host, self.smtp_username, self.smtp_password)):
            raise ValueError("Production SMTP configuration is required")
        if not self.phone_auth_enabled:
            raise ValueError("Production Twilio Verify configuration is required")
        if not self.frontend_url.startswith("https://"):
            raise ValueError("Production FRONTEND_URL must use HTTPS")
        if not self.public_api_url or not self.public_api_url.startswith("https://"):
            raise ValueError("Production PUBLIC_API_URL must use HTTPS")
        origins = self.cors_origin_list
        if not origins or "*" in origins or any(not origin.startswith("https://") for origin in origins):
            raise ValueError("Production CORS_ORIGINS must contain explicit HTTPS origins only")
        if self.tap_enabled:
            if not all((self.tap_secret_key, self.tap_merchant_id, self.tap_webhook_url)):
                raise ValueError("Tap is enabled but TAP_SECRET_KEY, TAP_MERCHANT_ID or TAP_WEBHOOK_URL is missing")
            if placeholder(self.tap_secret_key or ""):
                raise ValueError("Production TAP_SECRET_KEY must not be a placeholder")
            if not (self.tap_webhook_url or "").startswith("https://"):
                raise ValueError("Production TAP_WEBHOOK_URL must use HTTPS")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
