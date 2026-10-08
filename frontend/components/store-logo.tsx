import Image from "next/image";
import type { CSSProperties } from "react";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

type StoreLogoProps = {
  size?: number;
  priority?: boolean;
  className?: string;
  style?: CSSProperties;
};

export function StoreLogo({ size = 96, priority = false, className = "", style }: StoreLogoProps) {
  return (
    <Image
      src={`${basePath}/assets/logo.png`}
      alt="XVOND VAULT"
      width={size}
      height={size}
      sizes={`${size}px`}
      priority={priority}
      className={`store-logo ${className}`.trim()}
      style={{ objectFit: "contain", ...style }}
    />
  );
}
