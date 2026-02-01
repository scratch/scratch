import { describe, expect, test, beforeAll } from "bun:test";
import fs from "fs/promises";
import path from "path";
import { mkTempDir } from "../../test-util";
import { createZip, formatDate, formatDateTime, formatRelativeTime } from "../../../src/cmd/cloud/util";

let tempDir: string;

beforeAll(async () => {
    tempDir = await mkTempDir("test-cloud-util-");
});

describe("createZip", () => {
    test("creates a zip archive from a directory with files", async () => {
        const testDir = path.join(tempDir, "basic-zip");
        await fs.mkdir(testDir, { recursive: true });
        await fs.writeFile(path.join(testDir, "index.html"), "<html>Hello</html>");
        await fs.writeFile(path.join(testDir, "style.css"), "body { color: red; }");

        const result = await createZip(testDir);

        expect(result.fileCount).toBe(2);
        expect(result.totalBytes).toBeGreaterThan(0);
        expect(result.data.byteLength).toBeGreaterThan(0);
        // Zip should produce valid output (no specific size requirement due to variable overhead)
    });

    test("handles nested directories", async () => {
        const testDir = path.join(tempDir, "nested-zip");
        await fs.mkdir(path.join(testDir, "assets", "images"), { recursive: true });
        await fs.writeFile(path.join(testDir, "index.html"), "<html></html>");
        await fs.writeFile(path.join(testDir, "assets", "main.js"), "console.log('hi')");
        await fs.writeFile(path.join(testDir, "assets", "images", "logo.txt"), "fake image data");

        const result = await createZip(testDir);

        expect(result.fileCount).toBe(3);
        expect(result.totalBytes).toBeGreaterThan(0);
    });

    test("handles empty directory", async () => {
        const testDir = path.join(tempDir, "empty-zip");
        await fs.mkdir(testDir, { recursive: true });

        const result = await createZip(testDir);

        expect(result.fileCount).toBe(0);
        expect(result.totalBytes).toBe(0);
        // Zip should still be valid (has minimal headers)
        expect(result.data.byteLength).toBeGreaterThan(0);
    });

    test("calculates correct total bytes", async () => {
        const testDir = path.join(tempDir, "bytes-zip");
        await fs.mkdir(testDir, { recursive: true });

        const content1 = "Hello, World!"; // 13 bytes
        const content2 = "Test content"; // 12 bytes
        await fs.writeFile(path.join(testDir, "file1.txt"), content1);
        await fs.writeFile(path.join(testDir, "file2.txt"), content2);

        const result = await createZip(testDir);

        expect(result.fileCount).toBe(2);
        expect(result.totalBytes).toBe(content1.length + content2.length);
    });

    test("produces valid zip data that can be extracted", async () => {
        const testDir = path.join(tempDir, "valid-zip");
        await fs.mkdir(testDir, { recursive: true });
        await fs.writeFile(path.join(testDir, "test.txt"), "test content");

        const result = await createZip(testDir);

        // Verify we can read the zip back using JSZip
        const JSZipModule = await import("jszip");
        const JSZip = JSZipModule.default || JSZipModule;
        const zip = await JSZip.loadAsync(result.data);

        const files = Object.keys(zip.files);
        expect(files).toContain("test.txt");

        const content = await zip.file("test.txt")?.async("string");
        expect(content).toBe("test content");
    });

    test("preserves directory structure in zip", async () => {
        const testDir = path.join(tempDir, "structure-zip");
        await fs.mkdir(path.join(testDir, "level1", "level2"), { recursive: true });
        await fs.writeFile(path.join(testDir, "root.txt"), "root");
        await fs.writeFile(path.join(testDir, "level1", "mid.txt"), "mid");
        await fs.writeFile(path.join(testDir, "level1", "level2", "deep.txt"), "deep");

        const result = await createZip(testDir);

        // Verify structure using JSZip
        const JSZipModule = await import("jszip");
        const JSZip = JSZipModule.default || JSZipModule;
        const zip = await JSZip.loadAsync(result.data);

        const files = Object.keys(zip.files).filter(f => !f.endsWith('/'));
        expect(files).toContain("root.txt");
        expect(files).toContain("level1/mid.txt");
        expect(files).toContain("level1/level2/deep.txt");
    });

    test("skips directories themselves (only includes files)", async () => {
        const testDir = path.join(tempDir, "dirs-only-zip");
        await fs.mkdir(path.join(testDir, "empty-subdir"), { recursive: true });
        await fs.writeFile(path.join(testDir, "file.txt"), "content");

        const result = await createZip(testDir);

        // Should only count the file, not the empty directory
        expect(result.fileCount).toBe(1);
    });

    test("handles binary content", async () => {
        const testDir = path.join(tempDir, "binary-zip");
        await fs.mkdir(testDir, { recursive: true });

        // Create a buffer with binary data
        const binaryData = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe, 0xfd]);
        await fs.writeFile(path.join(testDir, "binary.bin"), binaryData);

        const result = await createZip(testDir);

        expect(result.fileCount).toBe(1);
        expect(result.totalBytes).toBe(binaryData.length);

        // Verify binary content is preserved
        const JSZipModule = await import("jszip");
        const JSZip = JSZipModule.default || JSZipModule;
        const zip = await JSZip.loadAsync(result.data);

        const content = await zip.file("binary.bin")?.async("uint8array");
        expect(content).toEqual(new Uint8Array(binaryData));
    });
});

describe("formatDate", () => {
    test("formats date string as short date", () => {
        const result = formatDate("2024-01-15T10:30:00Z");
        // Result should contain year, month, and day
        expect(result).toContain("2024");
        expect(result).toContain("Jan");
        expect(result).toContain("15");
    });

    test("handles ISO date strings", () => {
        const result = formatDate("2023-12-25T00:00:00.000Z");
        expect(result).toContain("Dec");
        expect(result).toContain("25");
        expect(result).toContain("2023");
    });

    test("handles different months", () => {
        expect(formatDate("2024-06-01T00:00:00Z")).toContain("Jun");
        expect(formatDate("2024-11-30T00:00:00Z")).toContain("Nov");
    });
});

describe("formatDateTime", () => {
    test("formats date string with time", () => {
        const result = formatDateTime("2024-01-15T14:30:00Z");
        // Result should contain date components
        expect(result).toContain("2024");
        expect(result).toContain("Jan");
        expect(result).toContain("15");
    });

    test("includes time components", () => {
        const result = formatDateTime("2024-01-15T14:30:00Z");
        // Should have some time indication (exact format depends on locale)
        expect(result.length).toBeGreaterThan(formatDate("2024-01-15T14:30:00Z").length);
    });

    test("handles midnight", () => {
        const result = formatDateTime("2024-06-01T00:00:00Z");
        expect(result).toContain("Jun");
        expect(result).toContain("1");
        expect(result).toContain("2024");
    });
});

describe("formatRelativeTime", () => {
    test("returns 'just now' for very recent times", () => {
        const now = new Date();
        const result = formatRelativeTime(now);
        expect(result).toBe("just now");
    });

    test("returns 'just now' for 1 minute ago", () => {
        const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
        const result = formatRelativeTime(oneMinuteAgo);
        expect(result).toBe("just now");
    });

    test("returns minutes ago for times less than an hour ago", () => {
        const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
        const result = formatRelativeTime(thirtyMinutesAgo);
        expect(result).toBe("30 minutes ago");
    });

    test("returns '1 hour ago' for one hour", () => {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const result = formatRelativeTime(oneHourAgo);
        expect(result).toBe("1 hour ago");
    });

    test("returns hours ago for times less than a day ago", () => {
        const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000);
        const result = formatRelativeTime(fiveHoursAgo);
        expect(result).toBe("5 hours ago");
    });

    test("returns '1 day ago' for one day", () => {
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const result = formatRelativeTime(oneDayAgo);
        expect(result).toBe("1 day ago");
    });

    test("returns days ago for times less than a month ago", () => {
        const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
        const result = formatRelativeTime(fiveDaysAgo);
        expect(result).toBe("5 days ago");
    });

    test("returns '1 month ago' for 30-59 days", () => {
        const fortyFiveDaysAgo = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
        const result = formatRelativeTime(fortyFiveDaysAgo);
        expect(result).toBe("1 month ago");
    });

    test("returns months ago for times less than a year", () => {
        const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        const result = formatRelativeTime(ninetyDaysAgo);
        expect(result).toBe("3 months ago");
    });

    test("returns years ago for times more than a year", () => {
        const twoYearsAgo = new Date(Date.now() - 730 * 24 * 60 * 60 * 1000);
        const result = formatRelativeTime(twoYearsAgo);
        expect(result).toBe("2 years ago");
    });

    test("returns '1 year ago' for one year (singular)", () => {
        const oneYearAgo = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000);
        const result = formatRelativeTime(oneYearAgo);
        expect(result).toBe("1 year ago");
    });
});
