import { describe, expect, test } from "bun:test";
import fs from "fs/promises";
import path from "path";
import { mkTempDir } from "../../test-util";
import {
  loadProjectsIndex,
  resolveIndexedProject,
  upsertProjectIndexEntry,
} from "../../../src/config/projects-index";

describe("projects index", () => {
  test("creates and updates indexed project entries", async () => {
    const tempDir = await mkTempDir("projects-index-");
    const indexPath = path.join(tempDir, ".scratch", "projects.json");
    const projectDir = path.join(tempDir, "myscratch");

    await upsertProjectIndexEntry(projectDir, {}, indexPath);
    await upsertProjectIndexEntry(projectDir, { name: "renamed" }, indexPath);

    const index = await loadProjectsIndex(indexPath);
    expect(index.projects).toHaveLength(1);
    expect(index.projects[0]!.path).toBe(path.resolve(projectDir));
    expect(index.projects[0]!.name).toBe("renamed");

    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test("preserves unrelated indexed projects", async () => {
    const tempDir = await mkTempDir("projects-index-preserve-");
    const indexPath = path.join(tempDir, ".scratch", "projects.json");

    await upsertProjectIndexEntry(path.join(tempDir, "one"), {}, indexPath);
    await upsertProjectIndexEntry(path.join(tempDir, "two"), {}, indexPath);

    const index = await loadProjectsIndex(indexPath);
    expect(index.projects.map((entry) => entry.name).sort()).toEqual(["one", "two"]);

    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test("resolves by name, path, containing cwd, and single default", async () => {
    const tempDir = await mkTempDir("projects-index-resolve-");
    const indexPath = path.join(tempDir, ".scratch", "projects.json");
    const projectDir = path.join(tempDir, "myscratch");

    await upsertProjectIndexEntry(projectDir, { name: "notes" }, indexPath);

    expect((await resolveIndexedProject("notes", tempDir, indexPath))?.path).toBe(path.resolve(projectDir));
    expect((await resolveIndexedProject(projectDir, tempDir, indexPath))?.name).toBe("notes");
    expect((await resolveIndexedProject(undefined, path.join(projectDir, "pages"), indexPath))?.name).toBe("notes");
    expect((await resolveIndexedProject(undefined, tempDir, indexPath))?.name).toBe("notes");

    await fs.rm(tempDir, { recursive: true, force: true });
  });
});
