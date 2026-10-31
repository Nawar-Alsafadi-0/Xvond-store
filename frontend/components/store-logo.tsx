import type { CSSProperties } from "react";

type StoreLogoProps = {
  size?: number;
  priority?: boolean;
  className?: string;
  style?: CSSProperties;
};

/** Text-only commercial logo: buyer's configured name, no proprietary Xvond image. */
export function StoreLogo({ size = 96, className = "", style }: StoreLogoProps) {
  const brandName = process.env.NEXT_PUBLIC_STORE_NAME || "My Store";
  return (
    <span
      aria-label={brandName}
      className={`store-logo ${className}`.trim()}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 700,
        letterSpacing: "0.02em",
        fontSize: Math.max(14, Math.min(size / 4, 34)),
        lineHeight: 1.2,
        textAlign: "center",
        ...style,
      }}
    >
      {brandName}
    </span>
  );
}
