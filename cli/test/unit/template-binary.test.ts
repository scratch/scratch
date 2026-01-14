import { describe, expect, test } from "bun:test";
import { rm, mkdir, readFile } from "fs/promises";
import path from "path";
import {
  templates,
  materializeTemplate,
  hasTemplate,
  isTemplateBinary,
} from "../../src/template";

describe("template binary file handling", () => {
  test("identifies binary files correctly", () => {
    // Check that PNG files are marked as binary
    const pngFiles = Object.keys(templates).filter((f) => f.endsWith(".png"));

    for (const pngFile of pngFiles) {
      expect(isTemplateBinary(pngFile)).toBe(true);
    }
  });

  test("identifies text files correctly", () => {
    // Check that text files are not marked as binary
    const textExtensions = [".ts", ".tsx", ".js", ".jsx", ".css", ".md", ".mdx"];

    for (const [filePath, file] of Object.entries(templates)) {
      const ext = path.extname(filePath);
      if (textExtensions.includes(ext)) {
        expect(file.binary).toBe(false);
      }
    }
  });

  test("binary files have valid base64 content", () => {
    for (const [filePath, file] of Object.entries(templates)) {
      if (file.binary) {
        // Base64 should only contain valid characters
        expect(file.content).toMatch(/^[A-Za-z0-9+/=]*$/);

        // Should be able to decode without error
        const decoded = Buffer.from(file.content, "base64");
        expect(decoded.length).toBeGreaterThan(0);
      }
    }
  });

  test("PNG files have valid PNG header after decoding", () => {
    const pngFiles = Object.entries(templates).filter(([f]) =>
      f.endsWith(".png")
    );

    for (const [filePath, file] of pngFiles) {
      const decoded = Buffer.from(file.content, "base64");

      // PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
      const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      const header = decoded.subarray(0, 8);

      expect(header.equals(pngMagic)).toBe(true);
    }
  });

  test("materializeTemplate writes binary files correctly", async () => {
    // Find a PNG file in templates
    const pngFile = Object.keys(templates).find((f) => f.endsWith(".png"));
    if (!pngFile) {
      // Skip if no PNG files in template (e.g., if social-image.png was removed)
      return;
    }

    const tempDir = path.join("/tmp", `template-binary-test-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });

    try {
      const targetPath = path.join(tempDir, "test.png");
      await materializeTemplate(pngFile, targetPath);

      // Read the file back
      const written = await readFile(targetPath);

      // Verify PNG magic bytes
      const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      const header = written.subarray(0, 8);

      expect(header.equals(pngMagic)).toBe(true);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
