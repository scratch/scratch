import { describe, expect, test } from "bun:test";
import { readFile, rm, writeFile, mkdir } from "fs/promises";
import path from "path";
import { runCliSync, mkTempDir } from "./util";

describe("scratch create", () => {
  test("does not overwrite existing package.json", async () => {
    const tempDir = await mkTempDir("create-pkg-");
    const sandboxDir = path.join(tempDir, "sandbox");
    await mkdir(sandboxDir, { recursive: true });

    // Create an existing package.json with custom content
    const existingPackageJson = {
      name: "my-existing-project",
      version: "1.0.0",
      description: "Should not be overwritten",
    };
    await writeFile(
      path.join(sandboxDir, "package.json"),
      JSON.stringify(existingPackageJson, null, 2)
    );

    // Run scratch create in the directory with existing package.json
    runCliSync(["create", "sandbox"], tempDir);

    // Verify package.json was not overwritten
    const packageJsonContent = await readFile(
      path.join(sandboxDir, "package.json"),
      "utf-8"
    );
    const packageJson = JSON.parse(packageJsonContent);

    expect(packageJson.name).toBe("my-existing-project");
    expect(packageJson.version).toBe("1.0.0");
    expect(packageJson.description).toBe("Should not be overwritten");

    await rm(tempDir, { recursive: true, force: true });
  }, 60_000);
});
