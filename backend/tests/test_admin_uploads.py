import pytest
from fastapi import HTTPException

from app.api.admin_uploads import detect_image_extension


def test_detects_supported_product_images() -> None:
    assert detect_image_extension(b"\xff\xd8\xff\xe0jpeg") == ".jpg"
    assert detect_image_extension(b"\x89PNG\r\n\x1a\nrest") == ".png"
    assert detect_image_extension(b"RIFF\x04\x00\x00\x00WEBPdata") == ".webp"


def test_rejects_non_image_upload() -> None:
    with pytest.raises(HTTPException) as exc:
        detect_image_extension(b"this is not an image")
    assert exc.value.status_code == 415
