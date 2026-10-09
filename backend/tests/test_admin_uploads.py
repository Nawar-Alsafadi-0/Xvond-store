import pytest
from fastapi import HTTPException

from app.api.admin_uploads import build_product_media_url, detect_image_extension


def test_detects_supported_product_images() -> None:
    assert detect_image_extension(b"\xff\xd8\xff\xe0jpeg") == ".jpg"
    assert detect_image_extension(b"\x89PNG\r\n\x1a\nrest") == ".png"
    assert detect_image_extension(b"RIFF\x04\x00\x00\x00WEBPdata") == ".webp"


def test_rejects_non_image_upload() -> None:
    with pytest.raises(HTTPException) as exc:
        detect_image_extension(b"this is not an image")
    assert exc.value.status_code == 415


def test_product_media_url_uses_public_api_subpath() -> None:
    assert build_product_media_url(
        request_base_url="http://127.0.0.1:8000/",
        api_prefix="/api/v1",
        public_api_url="https://xvond.com/store-api/v1",
        filename="product.jpg",
    ) == "https://xvond.com/store-api/v1/media/products/product.jpg"


def test_product_media_url_falls_back_to_request_origin() -> None:
    assert build_product_media_url(
        request_base_url="http://localhost:8000/",
        api_prefix="/api/v1",
        public_api_url=None,
        filename="product.webp",
    ) == "http://localhost:8000/api/v1/media/products/product.webp"
