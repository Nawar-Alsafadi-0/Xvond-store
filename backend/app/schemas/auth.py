from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=180)
    email: EmailStr
    password: str = Field(min_length=10, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class ProfileRead(BaseModel):
    id: str
    full_name: str
    email: str | None
    phone: str | None = None
    email_verified: bool


class EmailRequest(BaseModel):
    email: EmailStr


class TokenRequest(BaseModel):
    token: str = Field(min_length=32, max_length=200)


class PasswordResetConfirm(TokenRequest):
    password: str = Field(min_length=10, max_length=128)


class WishlistWrite(BaseModel):
    product_slug: str = Field(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$", max_length=180)


class ReturnWrite(BaseModel):
    order_number: str = Field(min_length=8, max_length=32)
    reason: str = Field(min_length=5, max_length=2000)


class AddressWrite(BaseModel):
    label: str = Field(default="home", min_length=1, max_length=80)
    governorate: str = Field(min_length=2, max_length=120)
    city: str = Field(min_length=2, max_length=120)
    address_line: str = Field(min_length=5, max_length=300)
    postal_code: str | None = Field(default=None, max_length=20)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
