# Scratch CLI - Command Output & Interactive Flow Review

This document catalogs all CLI command outputs and interactive flows for review.

---

## Global Options

```
scratch --help
scratch --version
scratch -v, --verbose     Verbose output
scratch -q, --quiet       Quiet mode (errors only)
scratch --show-bun-errors Show full Bun error stack traces
```

---

## 1. scratch create [path]

**Purpose:** Create a new Scratch project

**Options:**
- `--no-src` - Skip src/ template directory
- `--no-package` - Skip package.json template
- `--minimal` - Minimal mode: skip example content, use simple PageWrapper

### Output (new directory):

```
Created a new Scratch project in my-site:

  pages/
  │   └── index.mdx
  public/
  │   ├── favicon.svg
  │   └── scratch-logo.svg
  src/
  │   ├── markdown/
  │   │   ├── CodeBlock.tsx
  │   │   ├── Heading.tsx
  │   │   └── Link.tsx
  │   ├── PageWrapper.jsx
  │   └── tailwind.css
  .gitignore
  AGENTS.md
  package.json

Start the development server:

  cd my-site
  scratch dev
```

### Output (current directory):

```
Created a new Scratch project:

  pages/
  ...

Start the development server:

  scratch dev
```

### Output (project already exists):

```
No files created (project already exists)
```

---

## 2. scratch build [path]

**Purpose:** Bundle project into a static website

**Options:**
- `-o, --out-dir <path>` - Output directory (default: dist)
- `-d, --development` - Development mode
- `-b, --base <path>` - Base path for deployment (e.g., /mysite/)
- `--test-base` - Output to dist/<base>/ for local testing
- `--no-ssg` - Disable static site generation
- `--static <mode>` - Static file mode: public, assets, all (default: assets)
- `--strict` - Do not inject PageWrapper component or missing imports
- `--highlight <mode>` - Syntax highlighting: off, popular, auto, all (default: auto)

### Output (normal):

```
Building Scratch project in .
Build completed in 1234ms
```

### Output (verbose -v):

```
Building Scratch project in .
Building with Bun...
=== [01] Ensure dependencies ===
=== [02] Reset directories ===
=== [03] Create TSX entries ===
Running parallel: Build Tailwind CSS + Server build
...
=== TIMING BREAKDOWN ===
  01-ensure-dependencies: 50ms
  02-reset-directories: 12ms
  ...
Build completed in 1234ms
```

### Output (error):

```
Build failed: <error message>
```

---

## 3. scratch dev [path]

**Purpose:** Start local development server with hot reload

**Options:**
- `-d, --development` - Development mode (always enabled)
- `-n, --no-open` - Don't open browser automatically
- `-p, --port <port>` - Port for dev server (default: 5173)
- `-b, --base <path>` - Base path for deployment
- `--static <mode>` - Static file mode: public, assets, all
- `--strict` - Do not inject PageWrapper
- `--highlight <mode>` - Syntax highlighting mode

### Output:

```
Starting dev server in .
Building Scratch project in .
Build completed in 1234ms
Dev server running at http://localhost:5173/
```

### Output (port in use):

```
Starting dev server in .
Building Scratch project in .
Build completed in 1234ms
Port 5173 is in use, trying 5174...
Dev server running at http://localhost:5174/
```

### Output (file change):

```
File change detected, rebuilding...
Build completed in 456ms
```

### Output (shutdown):

```
Shutting down...
```

---

## 4. scratch preview [path]

**Purpose:** Preview production build locally

**Options:**
- `-n, --no-open` - Don't open browser automatically
- `-p, --port <port>` - Port for preview server (default: 4173)

### Output:

```
Starting preview server in .
Preview server running at http://localhost:4173/
```

### Output (no build):

```
Preview server failed: Build directory 'dist' not found. Run 'scratch build' first to generate the site.
```

---

## 5. scratch watch <path> (alias: view)

**Purpose:** Serve target file/directory on development server

**Options:**
- `-p, --port <port>` - Port for dev server (default: 5173)
- `-n, --no-open` - Don't open browser automatically

### Output (file):

```
Rendering file docs/intro.md
Installing dependencies (first run, this will be cached)...
Dependencies installed
Building Scratch project in /tmp/scratch-watch-xxx
Build completed in 1234ms
Dev server running at http://localhost:5173/
```

### Output (directory):

```
Rendering directory docs/
Building Scratch project in /tmp/scratch-watch-xxx
Build completed in 1234ms
Dev server running at http://localhost:5173/
```

### Output (file deleted/recreated):

```
Source file deleted, waiting for it to be recreated...
Source file recreated, synced
```

### Output (path not found):

```
Watch failed: Path not found: invalid/path.md
```

---

## 6. scratch clean [path]

**Purpose:** Remove build artifacts

### Output:

```
Cleaned dist/ and .scratch-build-cache/
```

---

## 7. scratch update

**Purpose:** Update scratch to the latest version

### Output (checking):

```
Current version: 0.1.0
Platform: darwin-arm64
Checking for updates...
```

### Output (up to date):

```
Current version: 0.1.0
Platform: darwin-arm64
Checking for updates...
Already up to date (0.1.0)
```

### Output (updating):

```
Current version: 0.1.0
Platform: darwin-arm64
Checking for updates...
New version available: 0.2.0
Downloading scratch-darwin-arm64...
Verifying checksum...
Checksum verified
Replacing /usr/local/bin/scratch...
Updated to 0.2.0
```

---

## 8. scratch checkout [file] (alias: eject)

**Purpose:** Clone file/directory from built-in templates

**Options:**
- `-l, --list` - List available template files
- `-f, --force` - Overwrite existing files without confirmation

### Output (--list):

```
Available template files:

  pages/
  │   └── index.mdx
  public/
  │   ├── favicon.svg
  │   └── scratch-logo.svg
  src/
  │   ├── markdown/
  │   │   ├── CodeBlock.tsx
  │   │   ├── Heading.tsx
  │   │   └── Link.tsx
  │   ├── PageWrapper.jsx
  │   └── tailwind.css
  .gitignore
  AGENTS.md
  package.json
```

### Output (new file):

```
Created:

  src/
  └── markdown/
      └── CodeBlock.tsx
```

### Interactive flow (existing file):

```
The following files will be overwritten:

  src/
  └── PageWrapper.jsx

? Overwrite these files? (Y/n)
```

**If yes:**
```
Restored:

  src/
  └── PageWrapper.jsx
```

**If no:**
```
Skipped 1 existing file.
```

### Output (with --force):

```
Restored:

  src/
  └── PageWrapper.jsx
```

### Output (not found):

```
Checkout failed: No template found for: invalid/path
This command should be run from the project root.
Use 'scratch checkout --list' to see all available templates.
```

---

## 9. scratch cloud login

**Purpose:** Log in to Scratch Cloud via OAuth device flow

### Interactive flow:

```
Logging in to https://app.scratch.wiki

Your verification code is:

    ABCD-1234

Opening browser to complete authentication...
(If browser doesn't open, visit: https://app.scratch.wiki/device)

Waiting for approval...
```

**On success:**
```
Logged in as user@example.com
```

**Already logged in:**
```
Already logged in as user@example.com
Use "scratch cloud logout" to log out first
```

**Session expired:**
```
Session expired, logging in again...
<continues with login flow>
```

**Denied:**
```
Login denied
```

**Expired:**
```
Login expired. Please try again.
```

**Connection error:**
```
cloud login failed: Could not connect to https://app.scratch.wiki
  Error: Unable to connect

  Troubleshooting:
  - Is the server running?
  - Check the URL with: scratch cloud config
  - For local dev, try http://localhost:8788 instead of http://app.localhost:8788
```

---

## 10. scratch cloud logout

**Purpose:** Log out from Scratch Cloud

### Output (logged in):

```
Logged out
```

### Output (not logged in):

```
Not logged in
```

---

## 11. scratch cloud whoami

**Purpose:** Show current user info

### Output (logged in):

```
Email: user@example.com
Name:  John Doe
Server: https://app.scratch.wiki
```

### Output (not logged in):

```
Not logged in
```

### Output (session expired):

```
Session expired. Please log in again.
```

---

## 12. scratch cloud config

**Purpose:** Configure Scratch Cloud settings (server URL)

### Interactive flow:

```
Scratch Cloud Configuration

Config file: ~/.config/scratch/config.toml

Current server URL: https://app.scratch.wiki (default)

? Enter server URL [https://app.scratch.wiki]: _
```

**On save:**
```
Server URL set to https://custom.example.com
Configuration saved to ~/.config/scratch/config.toml
```

**Invalid URL:**
```
Invalid URL: not-a-url
```

**Non-HTTPS for non-localhost:**
```
Server URL must use HTTPS (except for localhost)
```

---

## 13. scratch cloud deploy [path]

**Purpose:** Deploy project to Scratch Cloud

**Options:**
- `--name <name>` - Override project name
- `--namespace <namespace>` - Override namespace
- `--no-build` - Skip build step

### Interactive flow (first deploy, no config):

```
Project Setup
=============

? Project name [my-site]: _
```

**Namespace selection (if user has custom domain):**
```
? Choose your project URL:
❯ https://pages.scratch.wiki/example.com/my-site/
  https://pages.scratch.wiki/_/my-site/
```

**On save config:**
```
Saving .scratch/project.toml...
```

### Output (with existing config):

```
Using project configuration from .scratch/project.toml
  name:      my-site
  namespace: _ (global)

Building project...
Building Scratch project in .
Build completed in 1234ms
Zipping dist/...
  42 files, 256.3 KB
Uploading to server...

Created project "my-site"
Deployed v1 to https://pages.scratch.wiki/_/my-site/
```

### Output (subsequent deploy):

```
Using project configuration from .scratch/project.toml
  name:      my-site
  namespace: _ (global)

Building project...
Building Scratch project in .
Build completed in 1234ms
Zipping dist/...
  42 files, 256.3 KB
Uploading to server...

Deployed v2 to https://pages.scratch.wiki/_/my-site/
```

### Interactive flow (name conflict):

```
...
Uploading to server...

Project "my-site" is owned by a different user.

? Enter a different project name: _
```

**On new name:**
```
Saving .scratch/project.toml...

Note: If your site has broken links, run `scratch cloud deploy` again to rebuild with the new name.
```

### Output (too large):

```
cloud deploy failed: Deploy too large. Reduce the size of your dist/ directory.
```

### Output (no dist):

```
cloud deploy failed: dist/ directory not found. Run `scratch build` first or remove --no-build
```

---

## 14. scratch cloud projects [list]

**Purpose:** List all user's projects (list is default subcommand)

### Output (has projects):

```
Your projects:

  _/my-site       v3  https://pages.scratch.wiki/_/my-site/
  example.com/docs  v1  https://pages.scratch.wiki/example.com/docs/

2 projects
```

### Output (no projects):

```
No projects found.
Deploy your first project with `scratch cloud deploy`
```

---

## 15. scratch cloud projects info [name]

**Purpose:** Show project details

**Options:**
- `--namespace <namespace>` - Specify namespace

### Output:

```
Project: my-site
Namespace: _ (global)
URL: https://pages.scratch.wiki/_/my-site/
Live Version: 3
Total Deploys: 5
Created: Jan 15, 2025
Last Deploy: Jan 20, 2025
```

### Interactive flow (ambiguous name):

```
? Select project:
❯ _/my-site
  example.com/my-site
```

### Output (not found):

```
cloud projects info failed: Project "_/my-site" not found
```

### Output (no project specified, no config):

```
cloud projects info failed: No project specified and no .scratch/project.toml found
Run this command from a project directory or specify a project name
```

---

## 16. scratch cloud projects delete [name]

**Purpose:** Delete a project and all its deploys

**Options:**
- `--namespace <namespace>` - Specify namespace

### Interactive flow:

```
This will delete project "_/my-site" and all its deploys.
This action cannot be undone.

? Type "my-site" to confirm: _
```

**On confirm:**
```
Project "_/my-site" deleted
```

**On mismatch:**
```
Confirmation did not match. Deletion cancelled.
```

---

## 17. scratch cloud share [project]

**Purpose:** Create a time-limited share token (default action)

**Options:**
- `--namespace <namespace>` - Specify namespace
- `--name <name>` - Token name
- `--duration <duration>` - Token duration (1d, 1w, 1m)

### Interactive flow:

```
? Token name (e.g., "client-review"): _
```

```
? Choose token duration:
❯ 1 day
  1 week
  1 month
```

### Output:

```
Created share token for _/my-site

  Name:    client-review
  Expires: Jan 27, 2025, 10:30 AM (1 week)

Share URL (copy this - token is shown only once):

  https://pages.scratch.wiki/_/my-site/?token=abc123xyz
```

### Output (limit exceeded):

```
cloud share failed: Maximum number of active share tokens reached (10)
```

### Output (disabled):

```
cloud share failed: Share tokens are disabled on this server
```

---

## 18. scratch cloud share list [project]

**Purpose:** List share tokens for a project

**Options:**
- `--namespace <namespace>` - Specify namespace

### Output (has tokens):

```
Share tokens for _/my-site:

  tok_abc123  client-review  1 week
    Created: Jan 20, 2025, 10:30 AM
    Expires: Jan 27, 2025, 10:30 AM

  tok_def456  team-demo  1 day (expired)
    Created: Jan 15, 2025, 02:00 PM
    Expires: Jan 16, 2025, 02:00 PM

  tok_ghi789  old-token  1 month (revoked)
    Created: Jan 10, 2025, 09:00 AM
    Expires: Feb 10, 2025, 09:00 AM
    Revoked: Jan 12, 2025, 11:00 AM

3 tokens (1 active)
```

### Output (no tokens):

```
No share tokens for _/my-site
Create one with `scratch cloud share <project>`
```

---

## 19. scratch cloud share revoke <tokenId> [project]

**Purpose:** Revoke a share token

**Options:**
- `--namespace <namespace>` - Specify namespace

### Output:

```
Revoked share token "client-review" for _/my-site
```

### Output (not found):

```
cloud share revoke failed: Share token "tok_invalid" not found
```

---

## Error Handling (Global)

### Standard error format:

```
<command> failed: <error message>
```

### With --show-bun-errors:

```
<command> failed: <error object with stack trace>
```

---

## Notes for Review

### Consistency questions:
1. Should all commands use the same indentation for tree output? yes
2. Should server URLs be displayed with or without trailing slashes? without
3. Should "namespace: _ (global)" always show the underscore, or just "global"? just global 
4. Should timestamps include timezone? yes

### UX considerations:
1. The build output is minimal - should it show more progress? yes
2. Deploy shows file count and size - should build do the same? yes. deploy should show size unzipped and zipped.
3. Should there be color coding for success/error/warning? not now
4. Should interactive prompts have consistent styling? yes.

### Potential improvements:
1. Add `--json` output format for scripting  - not now
2. Add `--dry-run` for deploy  - sure 
3. Add progress bars for long operations  - not now 
4. Add `scratch cloud projects rename` command - not now
