import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import fs from "fs/promises";
import path from "path";
import { mkTempDir } from "../test-util";
import {
  templates,
  materializeProjectTemplates,
  listTemplateFiles,
  listUserFacingTemplateFiles,
  getTemplateContent,
  hasTemplate,
} from "../../src/template";

let tempDir: string;

beforeAll(async () => {
  tempDir = await mkTempDir("test-template-hidden-");
});

afterAll(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe("Hidden template directories", () => {
  describe("_build/ files", () => {
    test("_build/ templates exist in the raw template list", () => {
      const allFiles = listTemplateFiles();
      const buildFiles = allFiles.filter(f => f.startsWith("_build/"));
      expect(buildFiles.length).toBeGreaterThan(0);
    });

    test("_build/ files are excluded from user-facing list", () => {
      const userFiles = listUserFacingTemplateFiles();
      const buildFiles = userFiles.filter(f => f.startsWith("_build/"));
      expect(buildFiles.length).toBe(0);
    });

    test("_build/ files are NOT copied by materializeProjectTemplates", async () => {
      const projectDir = path.join(tempDir, "project-no-build");
      await fs.mkdir(projectDir, { recursive: true });

      await materializeProjectTemplates(projectDir);

      // Check that _build directory does NOT exist
      const buildDir = path.join(projectDir, "_build");
      const exists = await fs.exists(buildDir);
      expect(exists).toBe(false);
    });

    test("_build/ files can still be accessed explicitly", () => {
      const allFiles = listTemplateFiles();
      const buildFile = allFiles.find(f => f.startsWith("_build/"));

      if (buildFile) {
        expect(hasTemplate(buildFile)).toBe(true);
        // Should not throw
        const content = getTemplateContent(buildFile);
        expect(typeof content).toBe("string");
      }
    });
  });

  describe("_config/ files", () => {
    test("_config/ templates exist in the raw template list", () => {
      const allFiles = listTemplateFiles();
      const configFiles = allFiles.filter(f => f.startsWith("_config/"));
      expect(configFiles.length).toBeGreaterThan(0);
    });

    test("_config/ files are excluded from user-facing list", () => {
      const userFiles = listUserFacingTemplateFiles();
      const configFiles = userFiles.filter(f => f.startsWith("_config/"));
      expect(configFiles.length).toBe(0);
    });

    test("_config/ files are NOT copied by materializeProjectTemplates", async () => {
      const projectDir = path.join(tempDir, "project-no-config");
      await fs.mkdir(projectDir, { recursive: true });

      await materializeProjectTemplates(projectDir);

      // Check that _config directory does NOT exist
      const configDir = path.join(projectDir, "_config");
      const exists = await fs.exists(configDir);
      expect(exists).toBe(false);
    });

    test("_config/project.toml can be accessed explicitly", () => {
      expect(hasTemplate("_config/project.toml")).toBe(true);
      const content = getTemplateContent("_config/project.toml");
      expect(content).toContain("Project name");
      expect(content).toContain("visibility");
    });

    test("_config/global.toml can be accessed explicitly", () => {
      expect(hasTemplate("_config/global.toml")).toBe(true);
      const content = getTemplateContent("_config/global.toml");
      expect(content).toContain("server_url");
    });

    test("_config/ templates have explanatory comments", () => {
      const projectContent = getTemplateContent("_config/project.toml");
      const globalContent = getTemplateContent("_config/global.toml");

      // Both should have comments explaining their purpose
      expect(projectContent.startsWith("#")).toBe(true);
      expect(globalContent.startsWith("#")).toBe(true);

      // Project template should mention visibility
      expect(projectContent).toContain("visibility");
    });
  });

  describe("User-facing files", () => {
    test("user-facing list includes regular template files", () => {
      const userFiles = listUserFacingTemplateFiles();

      // Should include standard project files
      expect(userFiles.some(f => f.includes("pages/"))).toBe(true);
      expect(userFiles.some(f => f.includes("public/"))).toBe(true);
    });

    test("materializeProjectTemplates copies user-facing files", async () => {
      const projectDir = path.join(tempDir, "project-with-files");
      await fs.mkdir(projectDir, { recursive: true });

      const created = await materializeProjectTemplates(projectDir);

      // Should have created files
      expect(created.length).toBeGreaterThan(0);

      // Should have created standard directories
      const pagesExists = await fs.exists(path.join(projectDir, "pages"));
      expect(pagesExists).toBe(true);
    });

    test("listTemplateFiles returns more files than listUserFacingTemplateFiles", () => {
      const allFiles = listTemplateFiles();
      const userFiles = listUserFacingTemplateFiles();

      // All list should include hidden files, so should be larger
      expect(allFiles.length).toBeGreaterThan(userFiles.length);
    });
  });

  describe("Template content", () => {
    test("_config/project.toml contains expected fields", () => {
      const content = getTemplateContent("_config/project.toml");

      // Should have all the documented fields
      expect(content).toContain("name");
      expect(content).toContain("server_url");
      expect(content).toContain("visibility");
    });

    test("_config/global.toml contains expected fields", () => {
      const content = getTemplateContent("_config/global.toml");

      // Should have documented fields
      expect(content).toContain("server_url");
    });
  });
});
