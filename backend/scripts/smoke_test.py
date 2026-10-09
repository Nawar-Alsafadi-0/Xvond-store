import asyncio
import os
from decimal import Decimal

import httpx


async def require_ok(client: httpx.AsyncClient, path: str) -> httpx.Response:
    response = await client.get(path)
    response.raise_for_status()
    print(f"OK  {path}  {response.status_code}")
    return response


async def run() -> None:
    api_root = os.getenv("STORE_API_ROOT", "http://localhost:8000").rstrip("/")
    async with httpx.AsyncClient(base_url=api_root, timeout=15.0) as client:
        await require_ok(client, "/health")
        await require_ok(client, "/ready")
        categories = await require_ok(client, "/api/v1/catalog/categories")
        products = await require_ok(client, "/api/v1/catalog/products?in_stock=true&limit=10")

        if not categories.json():
            raise RuntimeError("Catalog categories are empty")
        live_products = products.json()
        if not live_products:
            raise RuntimeError("No in-stock product is available in the production catalog")

        quotable = next(
            (
                (product, variant)
                for product in live_products
                for variant in product.get("variants", [])
                if int(variant.get("stock_quantity", 0)) > 0
            ),
            None,
        )
        if quotable is None:
            raise RuntimeError("No in-stock product variant is available for a checkout quote")
        product, variant = quotable
        quote_response = await client.post(
            "/api/v1/orders/quote",
            json={
                "governorate": "muscat",
                "items": [
                    {
                        "product_slug": product["slug"],
                        "variant_id": variant["id"],
                        "quantity": 1,
                    }
                ],
            },
        )
        quote_response.raise_for_status()
        quote = quote_response.json()
        if not quote.get("shipping_available"):
            raise RuntimeError("Muscat delivery is not available in production")
        if Decimal(str(quote.get("shipping_total"))) != Decimal("0.000"):
            raise RuntimeError("Production checkout is not returning free delivery for Muscat")
        print("OK  Muscat checkout quote returns free delivery")

        non_oman_order = await client.post(
            "/api/v1/orders",
            json={
                "customer": {
                    "fullName": "Production Smoke Test",
                    "email": "smoke-test@example.com",
                    "phone": "+96890000000",
                    "countryCode": "AE",
                    "governorate": "Dubai",
                    "city": "Dubai",
                    "addressLine": "Validation-only request outside Oman",
                },
                "items": [{"product_slug": "validation-only", "quantity": 1}],
                "payment_method": "cash_on_delivery",
            },
        )
        if non_oman_order.status_code != 422:
            raise RuntimeError(
                "Oman-only checkout guard failed: non-Oman order was not rejected with 422"
            )
        print("OK  Oman-only checkout rejects non-Oman country")

    print("Smoke test passed")


if __name__ == "__main__":
    asyncio.run(run())
