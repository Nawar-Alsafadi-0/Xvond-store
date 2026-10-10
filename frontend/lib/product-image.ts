const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

export function normalizeProductImageSource(source: string): string {
  try {
    const imageUrl = new URL(source);
    const configuredApiUrl = new URL(API_URL);
    const mediaMarker = "/media/products/";
    const mediaIndex = imageUrl.pathname.indexOf(mediaMarker);
    const localImageHost = imageUrl.hostname === "localhost" || imageUrl.hostname === "127.0.0.1";

    if (mediaIndex >= 0 && localImageHost) {
      const apiPath = configuredApiUrl.pathname.replace(/\/$/, "");
      const mediaPath = imageUrl.pathname.slice(mediaIndex);
      return `${configuredApiUrl.origin}${apiPath}${mediaPath}${imageUrl.search}`;
    }
  } catch {
    // Relative placeholders and already-valid image URLs can be used as-is.
  }

  return source;
}

export function isLocalImageSource(source: string): boolean {
  try {
    const imageUrl = new URL(source);
    return imageUrl.hostname === "localhost" || imageUrl.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}
