from app.core.security import operator_route_allowed


def test_operator_can_manage_catalog_promotions_and_view_orders() -> None:
    allowed = [
        ("GET", "/api/v1/admin/overview"),
        ("GET", "/api/v1/admin/products"),
        ("POST", "/api/v1/admin/products"),
        ("PATCH", "/api/v1/admin/products/abc"),
        ("DELETE", "/api/v1/admin/products/abc"),
        ("PATCH", "/api/v1/admin/variants/abc"),
        ("PATCH", "/api/v1/admin/inventory/SKU-1"),
        ("GET", "/api/v1/admin/categories"),
        ("GET", "/api/v1/admin/orders"),
        ("GET", "/api/v1/admin/orders/abc/detail"),
        ("GET", "/api/v1/admin/discounts"),
        ("POST", "/api/v1/admin/discounts"),
        ("PATCH", "/api/v1/admin/discounts/abc"),
        ("GET", "/api/v1/admin/coupons"),
        ("POST", "/api/v1/admin/coupons"),
        ("POST", "/api/v1/admin/uploads/product-image"),
    ]
    assert all(operator_route_allowed(method, path) for method, path in allowed)


def test_operator_cannot_change_orders_or_sensitive_admin_areas() -> None:
    blocked = [
        ("PATCH", "/api/v1/admin/orders/abc"),
        ("GET", "/api/v1/admin/customers"),
        ("GET", "/api/v1/admin/returns"),
        ("PATCH", "/api/v1/admin/returns/abc"),
        ("GET", "/api/v1/admin/settings"),
        ("PUT", "/api/v1/admin/settings/store-name"),
        ("GET", "/api/v1/admin/shipping"),
        ("POST", "/api/v1/admin/shipping"),
        ("GET", "/api/v1/admin/readiness"),
        ("POST", "/api/v1/admin/categories"),
        ("PATCH", "/api/v1/admin/categories/abc"),
        ("DELETE", "/api/v1/admin/categories/abc"),
    ]
    assert all(not operator_route_allowed(method, path) for method, path in blocked)
