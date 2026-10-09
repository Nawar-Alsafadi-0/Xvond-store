import asyncio
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status

from app.core.config import get_settings
from app.core.security import require_admin

router = APIRouter(
    prefix="/admin/uploads",
    tags=["admin"],
    dependencies=[Depends(require_admin)],
)

MAX_PRODUCT_IMAGE_BYTES = 8 * 1024 * 1024


def detect_image_extension(content: bytes) -> str:
    if content.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if len(content) >= 12 and content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return ".webp"
    raise HTTPException(
        status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
        detail="Only JPEG, PNG and WebP product images are supported",
    )


@router.post("/product-image", status_code=status.HTTP_201_CREATED)
async def upload_product_image(
    request: Request,
    image: UploadFile = File(...),
) -> dict[str, str | int]:
    content = await image.read(MAX_PRODUCT_IMAGE_BYTES + 1)
    await image.close()
    if not content:
        raise HTTPException(status_code=422, detail="Image file is empty")
    if len(content) > MAX_PRODUCT_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Product image must be 8 MB or smaller")

    extension = detect_image_extension(content)
    settings = get_settings()
    directory = Path(settings.media_root) / "products"
    await asyncio.to_thread(directory.mkdir, parents=True, exist_ok=True)

    filename = f"{uuid.uuid4().hex}{extension}"
    destination = directory / filename
    await asyncio.to_thread(destination.write_bytes, content)

    base_url = str(request.base_url).rstrip("/")
    url = f"{base_url}{settings.api_prefix}/media/products/{filename}"
    return {"url": url, "size": len(content)}
