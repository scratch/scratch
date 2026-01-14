import { describe, expect, test } from "bun:test";
import { resolveImageUrl } from "../../src/build/steps/08-inject-frontmatter";

describe("resolveImageUrl", () => {
  test("returns empty string for empty input", () => {
    expect(resolveImageUrl("")).toBe("");
    expect(resolveImageUrl("", "https://example.com")).toBe("");
  });

  test("returns relative path unchanged when no siteUrl", () => {
    expect(resolveImageUrl("/social-image.png")).toBe("/social-image.png");
    expect(resolveImageUrl("images/photo.jpg")).toBe("images/photo.jpg");
  });

  test("prepends siteUrl to relative path starting with /", () => {
    expect(resolveImageUrl("/social-image.png", "https://example.com")).toBe(
      "https://example.com/social-image.png"
    );
  });

  test("prepends siteUrl with / to relative path not starting with /", () => {
    expect(resolveImageUrl("images/photo.jpg", "https://example.com")).toBe(
      "https://example.com/images/photo.jpg"
    );
  });

  test("removes trailing slash from siteUrl before combining", () => {
    expect(resolveImageUrl("/image.png", "https://example.com/")).toBe(
      "https://example.com/image.png"
    );
  });

  test("leaves https:// URLs unchanged", () => {
    const absoluteUrl = "https://cdn.example.com/image.png";
    expect(resolveImageUrl(absoluteUrl)).toBe(absoluteUrl);
    expect(resolveImageUrl(absoluteUrl, "https://other.com")).toBe(absoluteUrl);
  });

  test("leaves http:// URLs unchanged", () => {
    const absoluteUrl = "http://cdn.example.com/image.png";
    expect(resolveImageUrl(absoluteUrl)).toBe(absoluteUrl);
    expect(resolveImageUrl(absoluteUrl, "https://other.com")).toBe(absoluteUrl);
  });
});
