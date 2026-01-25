#!/bin/bash
set -eu

# Scratch Installation Script
# Usage: curl -fsSL https://raw.githubusercontent.com/scratch/scratch/main/install.sh | sh

REPO="scratch/scratch"
INSTALL_DIR="$HOME/.local/bin"
BINARY_NAME="scratch"

# Temp directory for downloads (will be set in main())
temp_dir=""

# Cleanup on exit or interruption
cleanup() {
  if [[ -n "$temp_dir" && -d "$temp_dir" ]]; then
    rm -rf "$temp_dir"
  fi
}
trap cleanup EXIT INT TERM

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

info() {
  echo -e "${GREEN}==>${NC} $1"
}

warn() {
  echo -e "${YELLOW}Warning:${NC} $1"
}

error() {
  echo -e "${RED}Error:${NC} $1" >&2
  exit 1
}

# Detect OS
detect_os() {
  case "$(uname -s)" in
    Darwin) echo "darwin" ;;
    Linux) echo "linux" ;;
    *) error "Unsupported operating system: $(uname -s)" ;;
  esac
}

# Detect architecture
detect_arch() {
  case "$(uname -m)" in
    x86_64|amd64) echo "x64" ;;
    arm64|aarch64) echo "arm64" ;;
    *) error "Unsupported architecture: $(uname -m)" ;;
  esac
}

# Get the latest release version from GitHub
get_latest_version() {
  if command -v curl &> /dev/null; then
    curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/'
  elif command -v wget &> /dev/null; then
    wget -qO- "https://api.github.com/repos/$REPO/releases/latest" | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/'
  else
    error "Neither curl nor wget found. Please install one of them."
  fi
}

# Download a file
download() {
  local url="$1"
  local dest="$2"

  if command -v curl &> /dev/null; then
    curl -fsSL "$url" -o "$dest"
  elif command -v wget &> /dev/null; then
    wget -q "$url" -O "$dest"
  else
    error "Neither curl nor wget found. Please install one of them."
  fi
}

# Calculate SHA256 hash
sha256() {
  local file="$1"
  if command -v shasum &> /dev/null; then
    shasum -a 256 "$file" | awk '{print $1}'
  elif command -v sha256sum &> /dev/null; then
    sha256sum "$file" | awk '{print $1}'
  else
    error "No sha256 tool found. Cannot verify download integrity."
  fi
}

# Extract checksum from JSON (works without jq)
extract_checksum() {
  local json="$1"
  local platform="$2"
  # Simple grep-based extraction
  echo "$json" | grep -o "\"$platform\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" | sed -E 's/.*"([^"]+)"$/\1/'
}

# Add to PATH
add_to_path() {
  local shell_profile=""

  # Detect shell and profile file
  case "$SHELL" in
    */zsh) shell_profile="$HOME/.zshrc" ;;
    */bash)
      if [[ -f "$HOME/.bash_profile" ]]; then
        shell_profile="$HOME/.bash_profile"
      else
        shell_profile="$HOME/.bashrc"
      fi
      ;;
    */fish) shell_profile="$HOME/.config/fish/config.fish" ;;
    *) shell_profile="$HOME/.profile" ;;
  esac

  # Check if already in PATH
  if [[ ":$PATH:" == *":$INSTALL_DIR:"* ]]; then
    return 0
  fi

  # Add to profile if not already there
  if [[ -f "$shell_profile" ]] && grep -q "$INSTALL_DIR" "$shell_profile" 2>/dev/null; then
    return 0
  fi

  info "Adding $INSTALL_DIR to PATH in $shell_profile"

  if [[ "$SHELL" == */fish ]]; then
    echo "fish_add_path $INSTALL_DIR" >> "$shell_profile"
  else
    echo "" >> "$shell_profile"
    echo "# Scratch" >> "$shell_profile"
    echo "export PATH=\"$INSTALL_DIR:\$PATH\"" >> "$shell_profile"
  fi

  warn "Restart your shell or run: export PATH=\"$INSTALL_DIR:\$PATH\""
}

main() {
  info "Installing Scratch..."

  # Detect platform
  local os=$(detect_os)
  local arch=$(detect_arch)
  local platform="${os}-${arch}"

  info "Detected platform: $platform"

  # Get latest version
  local version=$(get_latest_version)
  if [[ -z "$version" ]]; then
    error "Could not determine latest version"
  fi

  info "Latest version: $version"

  # Create install directory
  mkdir -p "$INSTALL_DIR"

  # Download binary
  local binary_name="scratch-${platform}"
  local download_url="https://github.com/$REPO/releases/download/$version/$binary_name"
  temp_dir=$(mktemp -d)  # Set global so trap can clean up
  local temp_binary="$temp_dir/$binary_name"

  info "Downloading $binary_name..."
  download "$download_url" "$temp_binary"

  # Download and verify checksum (mandatory for security)
  local checksums_url="https://github.com/$REPO/releases/download/$version/checksums.json"
  local checksums_file="$temp_dir/checksums.json"

  if download "$checksums_url" "$checksums_file" 2>/dev/null; then
    local expected_hash=$(extract_checksum "$(cat "$checksums_file")" "$platform")
    if [[ -n "$expected_hash" ]]; then
      info "Verifying checksum..."
      local actual_hash=$(sha256 "$temp_binary")
      if [[ "$actual_hash" != "$expected_hash" ]]; then
        error "Checksum mismatch! Expected $expected_hash, got $actual_hash"
      fi
      info "Checksum verified"
    else
      error "Could not extract checksum for platform: $platform"
    fi
  else
    error "Could not download checksums. Installation aborted for security."
  fi

  # Install binary
  chmod +x "$temp_binary"
  mv "$temp_binary" "$INSTALL_DIR/$BINARY_NAME"

  # Add to PATH
  add_to_path

  info "Scratch installed successfully!"
  echo ""
  echo "  Location: $INSTALL_DIR/$BINARY_NAME"
  echo "  Version:  $version"
  echo ""
  echo "Run 'scratch --help' to get started."
}

main "$@"
