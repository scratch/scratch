import { describe, expect, test, beforeAll } from "bun:test";
import { render, buildFileMap, formatFileTree } from "../../src/util";
import fs from "fs/promises";
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

describe("util.formatFileTree", () => {
    test("formats files and directories", () => {
        const files = ["src/index.ts", "src/util.ts", "README.md"];
        const result = formatFileTree(files);

        expect(result).toContain("src/");
        expect(result.some(line => line.includes("index.ts"))).toBe(true);
        expect(result.some(line => line.includes("util.ts"))).toBe(true);
        expect(result.some(line => line.includes("README.md"))).toBe(true);
    });

    test("handles empty directories (paths ending with /)", () => {
        const files = ["pages/", "public/", "src/index.ts"];
        const result = formatFileTree(files);

        // Empty directories should appear without children
        expect(result).toContain("pages/");
        expect(result).toContain("public/");
        expect(result).toContain("src/");

        // Should not have stray connectors for empty directories
        const pagesIndex = result.indexOf("pages/");
        const publicIndex = result.indexOf("public/");

        // The line after pages/ should not be an empty connector
        if (pagesIndex < result.length - 1) {
            expect(result[pagesIndex + 1]).not.toMatch(/^\s*[└├]── $/);
        }
        if (publicIndex < result.length - 1) {
            expect(result[publicIndex + 1]).not.toMatch(/^\s*[└├]── $/);
        }
    });

    test("sorts directories before files", () => {
        const files = ["zebra.txt", "alpha/file.ts"];
        const result = formatFileTree(files);

        const alphaIndex = result.findIndex(line => line.includes("alpha/"));
        const zebraIndex = result.findIndex(line => line.includes("zebra.txt"));

        expect(alphaIndex).toBeLessThan(zebraIndex);
    });
});
