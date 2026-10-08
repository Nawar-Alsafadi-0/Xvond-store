import type { Metadata } from "next";
import "./globals.css";
import { absoluteUrl } from "@/lib/urls";

export const metadata: Metadata = {
  metadataBase: new URL(absoluteUrl("/")),
  title: { default: "XVOND VAULT | قطع مختارة بحضور مختلف", template: "%s | XVOND VAULT" },
  description: "XVOND VAULT — مجموعة مختارة ومتجددة من القطع المميزة في سلطنة عُمان، بهوية أكثر ندرة وتميّزاً.",
  applicationName: "XVOND VAULT",
  alternates: { canonical: absoluteUrl("/ar"), languages: { "ar-OM": absoluteUrl("/ar"), "en-OM": absoluteUrl("/en") } },
  openGraph: { type: "website", siteName: "XVOND VAULT", locale: "ar_OM", alternateLocale: "en_OM", title: "XVOND VAULT", description: "مختارات مميزة. حضور مختلف.", url: absoluteUrl("/ar") },
  robots: { index: true, follow: true }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html suppressHydrationWarning><body>{children}</body></html>;
}
