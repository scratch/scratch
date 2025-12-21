import { describe, expect, test, beforeAll } from "bun:test";
import { render, firstExistingPath, objMap, objMapAsync, fmtBytes, mirror, buildFileMap } from "../../src/util";
import fs from "fs/promises";
import template from "../../src/template";
import { mkTempDir } from "../test-util";
import path from "path";

let tempDir: string;

beforeAll(async () => {
    tempDir = await mkTempDir("test-util-");
});

describe("util.render", () => {
    test("renders a template file and writes the result to a rendered file", async () => {
        const templateContent = "Variable: {{variable}}, Import: {{import}}";
        const templatePath = path.join(tempDir, "template", "test-template.md");
        await fs.mkdir(path.dirname(templatePath), { recursive: true });
        await fs.writeFile(templatePath, templateContent);

        const renderedPath = path.join(tempDir, "rendered", "test-rendered.md");
        const variables = { variable: "value" };
        const importVariables = { import: path.resolve(tempDir, "import", "test-import.md") };
        await render(templatePath, renderedPath, variables, importVariables);

        expect(await fs.exists(renderedPath)).toBe(true);
        const renderedContent = await fs.readFile(renderedPath, "utf-8");
        expect(renderedContent).toBe("Variable: value, Import: ../import/test-import.md");
    });
});

describe("util.firstExistingPath", () => {
    test("returns the first existing path from array", async () => {
        const existingFile = path.join(tempDir, "existing.txt");
        await fs.writeFile(existingFile, "content");

        const paths = [
            path.join(tempDir, "non-existing1.txt"),
            path.join(tempDir, "non-existing2.txt"),
            existingFile,
            path.join(tempDir, "non-existing3.txt")
        ];

        const result = await firstExistingPath(paths);
        expect(result).toBe(existingFile);
    });

    test("works with baseDir for relative paths", async () => {
        const subDir = path.join(tempDir, "subdir");
        await fs.mkdir(subDir, { recursive: true });
        const existingFile = path.join(subDir, "existing.txt");
        await fs.writeFile(existingFile, "content");

        const paths = ["non-existing.txt", "existing.txt"];

        const result = await firstExistingPath(paths, subDir);
        expect(result).toBe(existingFile);
    });

    test("handles absolute paths even with baseDir", async () => {
        const existingFile = path.join(tempDir, "absolute-existing.txt");
        await fs.writeFile(existingFile, "content");

        const paths = [existingFile];

        const result = await firstExistingPath(paths, "/some/other/dir");
        expect(result).toBe(existingFile);
    });

    test("throws error when no existing path found", async () => {
        const paths = [
            path.join(tempDir, "non-existing1.txt"),
            path.join(tempDir, "non-existing2.txt")
        ];

        await expect(firstExistingPath(paths)).rejects.toThrow("No existing path found");
    });
});

describe("util.objMap", () => {
    test("maps function over object values", () => {
        const obj = { a: 1, b: 2, c: 3 };
        const result = objMap(obj, val => val * 2);

        expect(result).toEqual({ a: 2, b: 4, c: 6 });
    });

    test("works with different value types", () => {
        const obj = {
            str: "hello",
            num: 42,
            bool: true,
            arr: [1, 2, 3]
        };
        const result = objMap(obj, val => typeof val);

        expect(result).toEqual({
            str: "string",
            num: "number",
            bool: "boolean",
            arr: "object"
        });
    });

    test("handles empty object", () => {
        const obj = {};
        const result = objMap(obj, val => val);

        expect(result).toEqual({});
    });

    test("preserves keys", () => {
        const obj = { "key-1": "value", "key.2": "value", "key 3": "value" };
        const result = objMap(obj, val => val.toUpperCase());

        expect(result).toEqual({
            "key-1": "VALUE",
            "key.2": "VALUE",
            "key 3": "VALUE"
        });
    });
});

describe("util.objMapAsync", () => {
    test("maps async function over object values", async () => {
        const obj = { a: 1, b: 2, c: 3 };
        const result = await objMapAsync(obj, async val => {
            await new Promise(resolve => setTimeout(resolve, 10));
            return val * 2;
        });

        expect(result).toEqual({ a: 2, b: 4, c: 6 });
    });

    test("handles Promise-returning functions", async () => {
        const obj = { x: "hello", y: "world" };
        const result = await objMapAsync(obj, val => Promise.resolve(val.toUpperCase()));

        expect(result).toEqual({ x: "HELLO", y: "WORLD" });
    });

    test("handles empty object", async () => {
        const obj = {};
        const result = await objMapAsync(obj, async val => val);

        expect(result).toEqual({});
    });

    test("processes all values in parallel", async () => {
        const obj = { a: 1, b: 2, c: 3 };
        let callCount = 0;
        const startTime = Date.now();

        const result = await objMapAsync(obj, async val => {
            callCount++;
            await new Promise(resolve => setTimeout(resolve, 50));
            return val * 10;
        });

        const elapsed = Date.now() - startTime;

        expect(callCount).toBe(3);
        expect(elapsed).toBeLessThan(100); // Should be ~50ms if parallel, not 150ms
        expect(result).toEqual({ a: 10, b: 20, c: 30 });
    });
});

describe("util.fmtBytes", () => {
    test("formats bytes correctly", () => {
        expect(fmtBytes(0)).toBe("0B");
        expect(fmtBytes(500)).toBe("500B");
        expect(fmtBytes(1024)).toBe("1kB");
        expect(fmtBytes(1536)).toBe("2kB"); // rounds to nearest
    });

    test("handles kilobytes", () => {
        expect(fmtBytes(1024)).toBe("1kB");
        expect(fmtBytes(2048)).toBe("2kB");
        expect(fmtBytes(1024 * 500)).toBe("500kB");
    });

    test("handles megabytes", () => {
        expect(fmtBytes(1024 * 1024)).toBe("1mB");
        expect(fmtBytes(1024 * 1024 * 5)).toBe("5mB");
    });

    test("handles precision parameter", () => {
        expect(fmtBytes(1536, 1)).toBe("1.5kB");
        expect(fmtBytes(1536, 2)).toBe("1.50kB");
        expect(fmtBytes(1024 * 1024 * 2.5, 1)).toBe("2.5mB");
    });

    test("handles large numbers", () => {
        expect(fmtBytes(1024 * 1024 * 1024)).toBe("1gB");
        expect(fmtBytes(1024 * 1024 * 1024 * 1024)).toBe("1tB");
    });
});

describe("util.mirror", () => {
    test("copies files to destination and returns created files", async () => {
        const srcDir = path.join(tempDir, "mirror-src");
        const destDir = path.join(tempDir, "mirror-dest");

        await fs.mkdir(srcDir, { recursive: true });
        await fs.writeFile(path.join(srcDir, "file1.txt"), "content1");
        await fs.writeFile(path.join(srcDir, "file2.txt"), "content2");

        const created = await mirror(srcDir, destDir, { recursive: true });

        expect(created.sort()).toEqual(["file1.txt", "file2.txt"]);
        expect(await fs.readFile(path.join(destDir, "file1.txt"), "utf-8")).toBe("content1");
        expect(await fs.readFile(path.join(destDir, "file2.txt"), "utf-8")).toBe("content2");
    });

    test("skips existing files when overwrite is false", async () => {
        const srcDir = path.join(tempDir, "mirror-src-skip");
        const destDir = path.join(tempDir, "mirror-dest-skip");

        await fs.mkdir(srcDir, { recursive: true });
        await fs.mkdir(destDir, { recursive: true });
        await fs.writeFile(path.join(srcDir, "existing.txt"), "new content");
        await fs.writeFile(path.join(destDir, "existing.txt"), "old content");

        const created = await mirror(srcDir, destDir, { recursive: true, overwrite: false });

        expect(created).toEqual([]);
        expect(await fs.readFile(path.join(destDir, "existing.txt"), "utf-8")).toBe("old content");
    });

    test("overwrites files when overwrite is true", async () => {
        const srcDir = path.join(tempDir, "mirror-src-overwrite");
        const destDir = path.join(tempDir, "mirror-dest-overwrite");

        await fs.mkdir(srcDir, { recursive: true });
        await fs.mkdir(destDir, { recursive: true });
        await fs.writeFile(path.join(srcDir, "existing.txt"), "new content");
        await fs.writeFile(path.join(destDir, "existing.txt"), "old content");

        const created = await mirror(srcDir, destDir, { recursive: true, overwrite: true });

        expect(created).toEqual(["existing.txt"]);
        expect(await fs.readFile(path.join(destDir, "existing.txt"), "utf-8")).toBe("new content");
    });

    test("handles recursive directory copying", async () => {
        const srcDir = path.join(tempDir, "mirror-src-recursive");
        const destDir = path.join(tempDir, "mirror-dest-recursive");

        await fs.mkdir(path.join(srcDir, "subdir"), { recursive: true });
        await fs.writeFile(path.join(srcDir, "root.txt"), "root");
        await fs.writeFile(path.join(srcDir, "subdir", "nested.txt"), "nested");

        const created = await mirror(srcDir, destDir, { recursive: true });

        expect(created.sort()).toEqual(["root.txt", "subdir/nested.txt"]);
        expect(await fs.readFile(path.join(destDir, "subdir", "nested.txt"), "utf-8")).toBe("nested");
    });
});

describe("util.buildFileMap", () => {
    test("creates map of filename to path", async () => {
        const dir = path.join(tempDir, "filemap-test");
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(path.join(dir, "Button.jsx"), "export default Button");
        await fs.writeFile(path.join(dir, "Card.tsx"), "export default Card");

        const result = await buildFileMap(dir, "**/*.{jsx,tsx}", true);

        expect(result.map).toHaveProperty("Button");
        expect(result.map).toHaveProperty("Card");
        expect(result.map["Button"]).toContain("Button.jsx");
        expect(result.conflicts.size).toBe(0);
    });

    test("detects conflicts with same basename", async () => {
        const dir = path.join(tempDir, "filemap-conflicts");
        await fs.mkdir(path.join(dir, "ui"), { recursive: true });
        await fs.mkdir(path.join(dir, "forms"), { recursive: true });
        await fs.writeFile(path.join(dir, "ui", "Button.jsx"), "ui button");
        await fs.writeFile(path.join(dir, "forms", "Button.jsx"), "forms button");

        const result = await buildFileMap(dir, "**/*.jsx", true);

        expect(result.conflicts.has("Button")).toBe(true);
    });

    test("uses full path when basename is false", async () => {
        const dir = path.join(tempDir, "filemap-fullpath");
        await fs.mkdir(path.join(dir, "src"), { recursive: true });
        await fs.writeFile(path.join(dir, "src", "Button.jsx"), "button");

        const result = await buildFileMap(dir, "**/*.jsx", false);

        expect(result.map).toHaveProperty("src/Button");
        expect(result.map).not.toHaveProperty("Button");
    });

    test("handles empty directory", async () => {
        const dir = path.join(tempDir, "filemap-empty");
        await fs.mkdir(dir, { recursive: true });

        const result = await buildFileMap(dir, "**/*.jsx", true);

        expect(Object.keys(result.map).length).toBe(0);
        expect(result.conflicts.size).toBe(0);
    });
});