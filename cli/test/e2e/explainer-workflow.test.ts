import { describe, expect, test } from "bun:test";
import fs from "fs/promises";
import path from "path";
import { spawnSync } from "child_process";
import { mkTempDir, scratchPath } from "./util";

function runScratch(args: string[], cwd: string, home: string) {
  const result = spawnSync(scratchPath, args, {
    cwd,
    env: { ...process.env, HOME: home },
    encoding: "utf-8",
    stdio: "pipe",
  });

  if (result.status !== 0) {
    throw new Error(`scratch ${args.join(" ")} failed\n${result.stdout}\n${result.stderr}`);
  }

  return result;
}

describe("Explainer workflow", () => {
  test("create, build, skills, and regenerate dry-run use explainer plumbing", async () => {
    const tempDir = await mkTempDir("explainer-workflow-");
    const homeDir = path.join(tempDir, "home");
    const projectDir = path.join(tempDir, "myscratch");
    const repoDir = path.join(tempDir, "repo");

    await fs.mkdir(homeDir, { recursive: true });
    await fs.mkdir(repoDir, { recursive: true });

    runScratch(["create", projectDir], tempDir, homeDir);

    const projectsIndex = JSON.parse(
      await fs.readFile(path.join(homeDir, ".scratch", "projects.json"), "utf-8")
    );
    expect(projectsIndex.projects.some((entry: any) => entry.path === path.resolve(projectDir))).toBe(true);

    const explainerPath = path.join(projectDir, "pages", "explainers", "demo.mdx");
    await fs.writeFile(explainerPath, `---
title: Demo
description: Demo explainer
date: 2026-05-27
published: false
prompt: Explain demo
---

Old body
`);

    runScratch(["build", projectDir, "--no-ssg"], tempDir, homeDir);

    const generated = await fs.readFile(
      path.join(projectDir, ".scratch", "generated", "explainerData.ts"),
      "utf-8"
    );
    expect(generated).toContain("Demo");
    expect(generated).toContain('"published": false');

    runScratch(["skills", "--project", projectDir], repoDir, homeDir);
    const skill = await fs.readFile(
      path.join(repoDir, ".agents", "skills", "scratch-explain", "SKILL.md"),
      "utf-8"
    );
    expect(skill).toContain(path.resolve(projectDir));

    const dryRun = runScratch(["regenerate", projectDir, "--dry-run"], tempDir, homeDir);
    expect(dryRun.stdout).toContain("demo.mdx");
    expect(dryRun.stdout).toContain("Explain demo");

    await fs.rm(tempDir, { recursive: true, force: true });
  });
});
