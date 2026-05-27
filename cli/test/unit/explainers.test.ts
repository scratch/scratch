import { describe, expect, test } from "bun:test";
import fs from "fs/promises";
import path from "path";
import { mkTempDir } from "../test-util";
import {
  collectExplainerMetadata,
  generateExplainerData,
  pruneUnpublishedExplainers,
} from "../../src/build/explainers";

describe("explainer metadata", () => {
  test("generates sorted explainer data from frontmatter", async () => {
    const tempDir = await mkTempDir("explainer-data-");
    const explainersDir = path.join(tempDir, "pages", "explainers");
    await fs.mkdir(explainersDir, { recursive: true });
    await fs.writeFile(path.join(explainersDir, "index.mdx"), "# Index");
    await fs.writeFile(path.join(explainersDir, "first-note.mdx"), `---
title: First
description: One
date: 2026-01-02
published: true
---
`);
    await fs.writeFile(path.join(explainersDir, "second-note.md"), `---
date: 2026-01-03
published: false
---
`);

    const explainers = await generateExplainerData(tempDir);
    expect(explainers.map((item) => item.title)).toEqual(["Second Note", "First"]);
    expect(explainers[0]!.published).toBe(false);
    expect(explainers[1]!.href).toBe("./first-note/");

    const generated = await fs.readFile(path.join(tempDir, ".scratch", "generated", "explainerData.ts"), "utf-8");
    expect(generated).toContain("export const explainers");

    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test("returns empty metadata when explainers directory is missing", async () => {
    const tempDir = await mkTempDir("explainer-missing-");
    expect(await collectExplainerMetadata(tempDir)).toEqual([]);
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test("prunes unpublished explainer routes", async () => {
    const tempDir = await mkTempDir("explainer-prune-");
    const explainersDir = path.join(tempDir, "pages", "explainers");
    const distExplainersDir = path.join(tempDir, "dist", "explainers");
    await fs.mkdir(explainersDir, { recursive: true });
    await fs.mkdir(path.join(distExplainersDir, "draft"), { recursive: true });
    await fs.mkdir(path.join(distExplainersDir, "live"), { recursive: true });
    await fs.writeFile(path.join(explainersDir, "draft.mdx"), `---
published: false
---
`);
    await fs.writeFile(path.join(explainersDir, "live.mdx"), `---
published: true
---
`);

    const pruned = await pruneUnpublishedExplainers(tempDir);
    expect(pruned).toEqual(["draft"]);
    expect(await fs.exists(path.join(distExplainersDir, "draft"))).toBe(false);
    expect(await fs.exists(path.join(distExplainersDir, "live"))).toBe(true);

    await fs.rm(tempDir, { recursive: true, force: true });
  });
});
