import { describe, expect, test, beforeAll } from "bun:test";
import { render, buildFileMap, formatFileTree, escapeHtml, getContentType, stripTrailingSlash } from "../../src/util";
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

describe("util.escapeHtml", () => {
    test("escapes ampersand", () => {
        expect(escapeHtml("foo & bar")).toBe("foo &amp; bar");
    });

    test("escapes less than", () => {
        expect(escapeHtml("foo < bar")).toBe("foo &lt; bar");
    });

    test("escapes greater than", () => {
        expect(escapeHtml("foo > bar")).toBe("foo &gt; bar");
    });

    test("escapes double quotes", () => {
        expect(escapeHtml('foo "bar" baz')).toBe("foo &quot;bar&quot; baz");
    });

    test("escapes single quotes", () => {
        expect(escapeHtml("foo 'bar' baz")).toBe("foo &#039;bar&#039; baz");
    });

    test("escapes multiple special characters", () => {
        expect(escapeHtml('<script>alert("xss")</script>')).toBe(
            "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;"
        );
    });

    test("escapes HTML injection attempt", () => {
        expect(escapeHtml('"><img src=x onerror=alert(1)>')).toBe(
            "&quot;&gt;&lt;img src=x onerror=alert(1)&gt;"
        );
    });

    test("handles empty string", () => {
        expect(escapeHtml("")).toBe("");
    });

    test("returns unchanged string with no special characters", () => {
        expect(escapeHtml("Hello World 123")).toBe("Hello World 123");
    });

    test("escapes all five characters in sequence", () => {
        expect(escapeHtml("&<>\"'")).toBe("&amp;&lt;&gt;&quot;&#039;");
    });
});

describe("util.getContentType", () => {
    test("returns correct type for HTML files", () => {
        expect(getContentType("index.html")).toBe("text/html");
        expect(getContentType("/path/to/page.html")).toBe("text/html");
    });

    test("returns correct type for JavaScript files", () => {
        expect(getContentType("app.js")).toBe("application/javascript");
    });

    test("returns correct type for CSS files", () => {
        expect(getContentType("styles.css")).toBe("text/css");
    });

    test("returns correct type for JSON files", () => {
        expect(getContentType("data.json")).toBe("application/json");
    });

    test("returns correct type for image files", () => {
        expect(getContentType("image.png")).toBe("image/png");
        expect(getContentType("photo.jpg")).toBe("image/jpeg");
        expect(getContentType("photo.jpeg")).toBe("image/jpeg");
        expect(getContentType("animation.gif")).toBe("image/gif");
        expect(getContentType("icon.svg")).toBe("image/svg+xml");
        expect(getContentType("favicon.ico")).toBe("image/x-icon");
    });

    test("returns correct type for font files", () => {
        expect(getContentType("font.woff")).toBe("font/woff");
        expect(getContentType("font.woff2")).toBe("font/woff2");
        expect(getContentType("font.ttf")).toBe("font/ttf");
        expect(getContentType("font.eot")).toBe("application/vnd.ms-fontobject");
    });

    test("returns octet-stream for unknown extensions", () => {
        expect(getContentType("file.xyz")).toBe("application/octet-stream");
        expect(getContentType("data.bin")).toBe("application/octet-stream");
    });

    test("handles uppercase extensions", () => {
        expect(getContentType("FILE.HTML")).toBe("text/html");
        expect(getContentType("IMAGE.PNG")).toBe("image/png");
    });

    test("handles files with no extension", () => {
        expect(getContentType("Makefile")).toBe("application/octet-stream");
    });
});

describe("util.stripTrailingSlash", () => {
    test("removes trailing slash from URL", () => {
        expect(stripTrailingSlash("https://example.com/")).toBe("https://example.com");
    });

    test("removes trailing slash from path", () => {
        expect(stripTrailingSlash("/path/to/dir/")).toBe("/path/to/dir");
    });

    test("leaves URL without trailing slash unchanged", () => {
        expect(stripTrailingSlash("https://example.com")).toBe("https://example.com");
    });

    test("leaves path without trailing slash unchanged", () => {
        expect(stripTrailingSlash("/path/to/dir")).toBe("/path/to/dir");
    });

    test("handles empty string", () => {
        expect(stripTrailingSlash("")).toBe("");
    });

    test("handles root slash", () => {
        expect(stripTrailingSlash("/")).toBe("");
    });

    test("only removes one trailing slash", () => {
        expect(stripTrailingSlash("https://example.com//")).toBe("https://example.com/");
    });
});
