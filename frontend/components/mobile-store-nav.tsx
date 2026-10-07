"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HeartIcon, HomeIcon, UserCircleIcon, ShoppingBagIcon } from "@heroicons/react/24/outline";
import type { Locale } from "@/lib/i18n";
import { useCommerce } from "./commerce-provider";

export function MobileStoreNav({ locale }: { locale: Locale }) {
  const pathname = usePathname();
  const { cartCount } = useCommerce();
  const ar = locale === "ar";

  if (pathname.startsWith(`/${locale}/admin`)) return null;

  const homeHref = `/${locale}`;
  const items = [
    { href: homeHref, label: ar ? "المعرض" : "Gallery", icon: HomeIcon },
    { href: `/${locale}/wishlist`, label: ar ? "المفضلة" : "Wishlist", icon: HeartIcon },
    { href: `/${locale}/account`, label: ar ? "حسابي" : "Account", icon: UserCircleIcon },
    { href: `/${locale}/cart`, label: ar ? "السلة" : "Cart", icon: ShoppingBagIcon, count: cartCount },
  ];

  return (
    <nav className="mobile-store-nav" aria-label={ar ? "تنقل المتجر" : "Store navigation"}>
      {items.map((item, index) => {
        const active = index === 0 ? pathname === homeHref : pathname.startsWith(item.href.split("?")[0]);
        const Icon = item.icon;
        return <Link key={`${item.href}-${index}`} href={item.href} className={active ? "active" : ""}><span className="mobile-nav-icon"><Icon />{item.count ? <b>{item.count}</b> : null}</span><small>{item.label}</small></Link>;
      })}
    </nav>
  );
}
