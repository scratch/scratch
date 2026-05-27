import { describe, expect, test } from "bun:test";
import fs from "fs/promises";
import path from "path";
import { mkTempDir } from "../test-util";
import { skillsCommand } from "../../src/cmd/skills";
import { renderScratchExplainSkill } from "../../src/skills/scratch-explain";

describe("scratch skills", () => {
  test("renders a scratch-explain skill with project path guidance", () => {
    const content = renderScratchExplainSkill("/tmp/myscratch");
    expect(content).toContain("name: scratch-explain");
    expect(content).toContain("/tmp/myscratch");
    expect(content).toContain("{{PROJECT_PATH}}");
    expect(content).toContain("published: false");
  });

  test("installs the skill into the current repository", async () => {
    const tempDir = await mkTempDir("skills-install-");
    const projectDir = path.join(tempDir, "myscratch");
    const repoDir = path.join(tempDir, "repo");
    await fs.mkdir(path.join(projectDir, "pages"), { recursive: true });
    await fs.mkdir(repoDir, { recursive: true });

    await skillsCommand({ project: projectDir }, repoDir);

    const skill = await fs.readFile(path.join(repoDir, ".agents", "skills", "scratch-explain", "SKILL.md"), "utf-8");
    expect(skill).toContain(path.resolve(projectDir));

    await fs.rm(tempDir, { recursive: true, force: true });
  });
});
