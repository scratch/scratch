import { describe, expect, test } from "bun:test";
import { compareVersions, getPlatform } from "../../src/cmd/update";

describe("compareVersions", () => {
  test("returns 0 for equal versions", () => {
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
    expect(compareVersions("0.0.1", "0.0.1")).toBe(0);
    expect(compareVersions("10.20.30", "10.20.30")).toBe(0);
  });

  test("returns 1 when first version is greater", () => {
    expect(compareVersions("1.0.1", "1.0.0")).toBe(1);
    expect(compareVersions("1.1.0", "1.0.0")).toBe(1);
    expect(compareVersions("2.0.0", "1.0.0")).toBe(1);
    expect(compareVersions("1.0.0", "0.9.9")).toBe(1);
    expect(compareVersions("0.2.0", "0.1.9")).toBe(1);
  });

  test("returns -1 when first version is less", () => {
    expect(compareVersions("1.0.0", "1.0.1")).toBe(-1);
    expect(compareVersions("1.0.0", "1.1.0")).toBe(-1);
    expect(compareVersions("1.0.0", "2.0.0")).toBe(-1);
    expect(compareVersions("0.9.9", "1.0.0")).toBe(-1);
  });

  test("handles v prefix", () => {
    expect(compareVersions("v1.0.0", "1.0.0")).toBe(0);
    expect(compareVersions("1.0.0", "v1.0.0")).toBe(0);
    expect(compareVersions("v1.0.1", "v1.0.0")).toBe(1);
    expect(compareVersions("v1.0.0", "v1.0.1")).toBe(-1);
  });

  test("handles versions with different segment counts", () => {
    expect(compareVersions("1.0", "1.0.0")).toBe(0);
    expect(compareVersions("1.0.0", "1.0")).toBe(0);
    expect(compareVersions("1.0.1", "1.0")).toBe(1);
    expect(compareVersions("1.0", "1.0.1")).toBe(-1);
  });

  test("handles large version numbers", () => {
    expect(compareVersions("100.200.300", "100.200.299")).toBe(1);
    expect(compareVersions("100.200.300", "100.200.301")).toBe(-1);
  });
});

describe("getPlatform", () => {
  test("returns a valid platform string", () => {
    const platform = getPlatform();
    const validPlatforms = [
      "darwin-arm64",
      "darwin-x64",
      "linux-arm64",
      "linux-x64",
    ];
    expect(validPlatforms).toContain(platform);
  });

  test("matches current process platform and arch", () => {
    const platform = getPlatform();
    const os = process.platform === "darwin" ? "darwin" : "linux";
    const arch = process.arch === "arm64" ? "arm64" : "x64";
    expect(platform).toBe(`${os}-${arch}`);
  });
});
