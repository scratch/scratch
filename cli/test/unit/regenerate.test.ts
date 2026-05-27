import { describe, expect, test } from "bun:test";
import fs from "fs/promises";
import path from "path";
import { mkTempDir } from "../test-util";
import { findRegenerateTargets } from "../../src/cmd/regenerate";

describe("regenerate target discovery", () => {
  test("finds explainer files with prompt frontmatter", async () => {
    const tempDir = await mkTempDir("regenerate-targets-");
    const explainersDir = path.join(tempDir, "pages", "explainers");
    await fs.mkdir(explainersDir, { recursive: true });
    await fs.writeFile(path.join(explainersDir, "index.mdx"), "---\ntitle: Index\n---\n");
    await fs.writeFile(path.join(explainersDir, "has-prompt.mdx"), `---
title: Has Prompt
prompt: Explain this system
---

Old body
`);
    await fs.writeFile(path.join(explainersDir, "no-prompt.mdx"), "---\ntitle: No Prompt\n---\n");

    const targets = await findRegenerateTargets(tempDir);
    expect(targets).toHaveLength(1);
    expect(targets[0]!.slug).toBe("has-prompt");
    expect(targets[0]!.frontmatterBlock).toContain("prompt: Explain this system");

    const filtered = await findRegenerateTargets(tempDir, "has-prompt");
    expect(filtered).toHaveLength(1);

    await fs.rm(tempDir, { recursive: true, force: true });
  });
});
