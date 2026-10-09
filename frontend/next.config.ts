import type { NextConfig } from "next";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
const imageHostname = process.env.NEXT_PUBLIC_IMAGE_HOSTNAME;
const apiUrl = process.env.NEXT_PUBLIC_API_URL;
const remotePatterns: { protocol: "http" | "https"; hostname: string; port?: string }[] = [];

if (imageHostname) remotePatterns.push({ protocol: "https", hostname: imageHostname });
if (apiUrl) {
  try {
    const parsed = new URL(apiUrl);
    const protocol = parsed.protocol === "http:" ? "http" : "https";
    const pattern = { protocol, hostname: parsed.hostname, port: parsed.port || undefined } as const;
    const duplicate = remotePatterns.some(
      (item) => item.protocol === pattern.protocol && item.hostname === pattern.hostname && item.port === pattern.port,
    );
    if (!duplicate) remotePatterns.push(pattern);
  } catch {
    // Build should remain usable even if the public API URL is supplied later.
  }
}

const nextConfig: NextConfig = {
  output: "standalone",
  basePath,
  poweredByHeader: false,
  reactStrictMode: true,
  images: { remotePatterns },
  async redirects() {
    return [
      { source: "/:locale(ar|en)/lifestyle/new-arrivals", destination: "/:locale/new-arrivals", permanent: true },
      { source: "/:locale(ar|en)/smart/new-arrivals", destination: "/:locale/new-arrivals", permanent: true },
      { source: "/:locale(ar|en)/lifestyle", destination: "/:locale", permanent: true },
      { source: "/:locale(ar|en)/smart", destination: "/:locale", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },
};

export default nextConfig;
