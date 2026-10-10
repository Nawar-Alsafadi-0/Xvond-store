"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Product } from "@/lib/catalog";

export type CartLine = { product: Product; quantity: number };
type CommerceState = {
  cart: CartLine[];
  wishlist: string[];
  cartCount: number;
  addToCart: (product: Product, quantity?: number) => void;
  removeFromCart: (lineKey: string) => void;
  updateQuantity: (lineKey: string, quantity: number) => void;
  toggleWishlist: (slug: string) => void;
  clearCart: () => void;
};

type CartNotice = { key: number; label: string } | null;

const STORAGE_KEY = "xvond-store-commerce-v1";
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
const CommerceContext = createContext<CommerceState | null>(null);

export function cartLineKey(product: Product): string {
  return `${product.slug}:${product.variantId || "default"}`;
}

async function bestEffortFetch(input: RequestInfo | URL, init?: RequestInit) {
  try {
    return await fetch(input, init);
  } catch {
    return null;
  }
}

export function CommerceProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [cartNotice, setCartNotice] = useState<CartNotice>(null);

  useEffect(() => {
    let restoredCart: CartLine[] = [];
    let restoredWishlist: string[] = [];
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as { cart?: CartLine[]; wishlist?: string[] };
        restoredCart = (parsed.cart ?? []).filter(
          (line) => line?.product?.slug && Number.isInteger(line.quantity) && line.quantity > 0,
        );
        restoredWishlist = parsed.wishlist ?? [];
      }
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
    queueMicrotask(() => {
      setCart(restoredCart);
      setWishlist(restoredWishlist);
      setHydrated(true);
    });

    void (async () => {
      const sessionResponse = await bestEffortFetch(`${API_URL}/auth/session`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!sessionResponse?.ok) return;
      const session = await sessionResponse.json() as { authenticated?: boolean };
      if (!session.authenticated) return;

      const response = await bestEffortFetch(`${API_URL}/account/wishlist`, { credentials: "include" });
      if (!response?.ok) return;

      const remote = await response.json() as string[];
      const merged = [...new Set([...remote, ...restoredWishlist])];
      setWishlist(merged);

      for (const slug of restoredWishlist.filter((item) => !remote.includes(item))) {
        void bestEffortFetch(`${API_URL}/account/wishlist`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ product_slug: slug }),
        });
      }
    })();
  }, []);

  useEffect(() => {
    if (hydrated) window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ cart, wishlist }));
  }, [cart, wishlist, hydrated]);

  useEffect(() => {
    if (!cartNotice) return;
    const timer = window.setTimeout(() => setCartNotice(null), 1800);
    return () => window.clearTimeout(timer);
  }, [cartNotice]);

  const addToCart = useCallback((product: Product, quantity = 1) => {
    setCart((current) => {
      const key = cartLineKey(product);
      const existing = current.find((line) => cartLineKey(line.product) === key);
      const maxQuantity = Math.max(1, Math.min(product.stock || 99, 99));
      return existing
        ? current.map((line) => cartLineKey(line.product) === key
          ? { ...line, product, quantity: Math.min(line.quantity + quantity, maxQuantity) }
          : line)
        : [...current, { product, quantity: Math.min(Math.max(1, quantity), maxQuantity) }];
    });
    const ar = typeof window !== "undefined" && window.location.pathname.startsWith("/ar");
    setCartNotice({ key: Date.now(), label: ar ? "تمت إضافة القطعة إلى السلة" : "Item added to your cart" });
  }, []);

  const removeFromCart = useCallback(
    (lineKey: string) => setCart((current) => current.filter((line) => cartLineKey(line.product) !== lineKey)),
    [],
  );
  const updateQuantity = useCallback((lineKey: string, quantity: number) => {
    if (quantity < 1) return removeFromCart(lineKey);
    setCart((current) => current.map((line) => {
      if (cartLineKey(line.product) !== lineKey) return line;
      const maxQuantity = Math.max(1, Math.min(line.product.stock || 99, 99));
      return { ...line, quantity: Math.min(quantity, maxQuantity) };
    }));
  }, [removeFromCart]);
  const toggleWishlist = useCallback((slug: string) => {
    const removing = wishlist.includes(slug);
    setWishlist((current) => removing ? current.filter((item) => item !== slug) : [...current, slug]);
    void bestEffortFetch(`${API_URL}/account/wishlist${removing ? `/${encodeURIComponent(slug)}` : ""}`, {
      method: removing ? "DELETE" : "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: removing ? undefined : JSON.stringify({ product_slug: slug }),
    });
  }, [wishlist]);
  const clearCart = useCallback(() => setCart([]), []);
  const cartCount = cart.reduce((total, line) => total + line.quantity, 0);
  const value = useMemo(
    () => ({ cart, wishlist, cartCount, addToCart, removeFromCart, updateQuantity, toggleWishlist, clearCart }),
    [cart, wishlist, cartCount, addToCart, removeFromCart, updateQuantity, toggleWishlist, clearCart],
  );

  return <CommerceContext.Provider value={value}>
    {children}
    {cartNotice && <div key={cartNotice.key} className="cart-added-toast" role="status" aria-live="polite">
      <span className="cart-added-check" aria-hidden="true">✓</span>
      <strong>{cartNotice.label}</strong>
    </div>}
  </CommerceContext.Provider>;
}

export function useCommerce() {
  const value = useContext(CommerceContext);
  if (!value) throw new Error("useCommerce must be used inside CommerceProvider");
  return value;
}
