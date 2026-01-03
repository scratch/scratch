import { describe, expect, test } from "bun:test";
import { readdir, readFile, rm } from "fs/promises";
import path from "path";
import { runCliSync, mkTempDir } from "./util";

describe("scratch create --minimal", () => {
  test("creates minimal project with simple PageWrapper", async () => {
    const projectDir = await mkTempDir("create-minimal-");

    // Run scratch create with --minimal flag
    runCliSync(["create", ".", "--minimal"], projectDir);

    // Verify pages/ directory exists but is empty
    const pagesDir = path.join(projectDir, "pages");
    const pagesFiles = await readdir(pagesDir);
    expect(pagesFiles).toEqual([]);

    // Verify public/ directory exists with only favicon (no scratch-logo)
    const publicDir = path.join(projectDir, "public");
    const publicFiles = await readdir(publicDir);
    expect(publicFiles).toEqual(["favicon.svg"]);

    // Verify src/ directory exists and has content
    const srcDir = path.join(projectDir, "src");
    const srcFiles = await readdir(srcDir);
    expect(srcFiles).toContain("template");
    expect(srcFiles).toContain("tailwind.css");
    expect(srcFiles).toContain("markdown");

    // Verify src/template/ has only PageWrapper (minimal version, no Header/Footer/etc)
    const templateDir = path.join(projectDir, "src/template");
    const templateFiles = await readdir(templateDir);
    expect(templateFiles).toEqual(["PageWrapper.jsx"]);

    // Verify PageWrapper is the minimal version (no Header/Footer imports)
    const pageWrapperPath = path.join(templateDir, "PageWrapper.jsx");
    const pageWrapperContent = await readFile(pageWrapperPath, "utf-8");
    expect(pageWrapperContent).not.toContain("import Header");
    expect(pageWrapperContent).not.toContain("import Footer");
    expect(pageWrapperContent).toContain("Minimal page wrapper");

    // Verify root files exist
    const rootFiles = await readdir(projectDir);
    expect(rootFiles).toContain(".gitignore");
    expect(rootFiles).toContain("AGENTS.md");
    expect(rootFiles).toContain("package.json");

    // Clean up
    await rm(projectDir, { recursive: true, force: true });
  }, 60_000);
});
