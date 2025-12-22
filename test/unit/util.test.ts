import { describe, expect, test, beforeAll } from "bun:test";
import { render, buildFileMap } from "../../src/util";
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
