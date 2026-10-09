import { describe, expect, it } from "vitest";
import { safeReturnPath } from "./safe-return-path";

describe("safeReturnPath", () => {
  it("accepts paths inside the active locale", () => {
    expect(safeReturnPath("/ar/checkout", "ar")).toBe("/ar/checkout");
    expect(safeReturnPath("/en", "en")).toBe("/en");
  });

  it("rejects external or cross-locale paths", () => {
    expect(safeReturnPath("https://example.com", "ar")).toBeNull();
    expect(safeReturnPath("//example.com", "ar")).toBeNull();
    expect(safeReturnPath("/en/checkout", "ar")).toBeNull();
    expect(safeReturnPath("/ar\\checkout", "ar")).toBeNull();
  });
});
