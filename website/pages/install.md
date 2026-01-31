# Install Scratch

Install the Scratch CLI to build and publish static MDX sites.

## Instructions

1. **Detect the platform**: Run `uname -s` to get the OS (Darwin = macOS, Linux = linux) and `uname -m` to get the architecture (x86_64/amd64 = x64, arm64/aarch64 = arm64). Combine them as `{os}-{arch}` (e.g., `darwin-arm64`, `linux-x64`).

2. **Get the latest version**: Query the GitHub releases API at `https://api.github.com/repos/scratch/scratch/releases/latest` and extract the `tag_name` field. This is the version (e.g., `v0.1.0`).

3. **Download the binary**: Download from `https://github.com/scratch/scratch/releases/download/{version}/scratch-{platform}` to a temp location.

4. **Verify the checksum**: Download `https://github.com/scratch/scratch/releases/download/{version}/checksums.json`, extract the SHA256 hash for your platform, and verify it matches the downloaded binary using `shasum -a 256` (macOS) or `sha256sum` (Linux). Abort if checksums don't match.

5. **Install the binary**: Make it executable with `chmod +x`, then move it to `~/.local/bin/scratch`. Create the directory if it doesn't exist.

6. **Add to PATH**: If `~/.local/bin` is not already in PATH, add `export PATH="$HOME/.local/bin:$PATH"` to the user's shell profile (~/.zshrc, ~/.bashrc, ~/.bash_profile, or ~/.profile depending on their shell).

7. **Verify installation**: Run `scratch --help` to confirm it works.

After installation, run `scratch --help` to get started.
