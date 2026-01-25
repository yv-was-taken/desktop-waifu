#!/usr/bin/env bash
set -euo pipefail

# Version bump script for desktop-waifu
# Updates version across all package configuration files

if [ $# -ne 1 ]; then
    echo "Usage: $0 <new-version>"
    echo "Example: $0 0.2.0"
    exit 1
fi

NEW_VERSION="$1"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Validate version format (semver)
if ! [[ "$NEW_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?$ ]]; then
    echo "Error: Invalid version format. Use semver (e.g., 0.2.0, 1.0.0-beta.1)"
    exit 1
fi

echo "Bumping version to $NEW_VERSION..."

# Update package.json
echo "  - package.json"
sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"$NEW_VERSION\"/" "$PROJECT_ROOT/package.json"

# Update src-tauri/tauri.conf.json
echo "  - src-tauri/tauri.conf.json"
sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"$NEW_VERSION\"/" "$PROJECT_ROOT/src-tauri/tauri.conf.json"

# Update src-tauri/Cargo.toml
echo "  - src-tauri/Cargo.toml"
sed -i "s/^version = \"[^\"]*\"/version = \"$NEW_VERSION\"/" "$PROJECT_ROOT/src-tauri/Cargo.toml"

# Update desktop-waifu-overlay/Cargo.toml
echo "  - desktop-waifu-overlay/Cargo.toml"
sed -i "s/^version = \"[^\"]*\"/version = \"$NEW_VERSION\"/" "$PROJECT_ROOT/desktop-waifu-overlay/Cargo.toml"

# Update Cargo.lock files
echo "  - desktop-waifu-overlay/Cargo.lock"
(cd "$PROJECT_ROOT/desktop-waifu-overlay" && cargo update --quiet)
echo "  - src-tauri/Cargo.lock"
(cd "$PROJECT_ROOT/src-tauri" && cargo update --quiet)

# Update AUR PKGBUILD
echo "  - packaging/aur/PKGBUILD"
sed -i "s/^pkgver=.*/pkgver=$NEW_VERSION/" "$PROJECT_ROOT/packaging/aur/PKGBUILD"

# Update Debian changelog (add new entry at top)
echo "  - packaging/debian/changelog"
DATE=$(date -R)
NEW_ENTRY="desktop-waifu ($NEW_VERSION-1) unstable; urgency=medium

  * Release version $NEW_VERSION

 -- yv-was-taken <yvmail@proton.me>  $DATE
"
# Prepend new entry to changelog
echo "$NEW_ENTRY" | cat - "$PROJECT_ROOT/packaging/debian/changelog" > "$PROJECT_ROOT/packaging/debian/changelog.tmp"
mv "$PROJECT_ROOT/packaging/debian/changelog.tmp" "$PROJECT_ROOT/packaging/debian/changelog"

# Update Homebrew formula
echo "  - packaging/homebrew/desktop-waifu.rb"
sed -i "s|/tags/v[^\"]*\.tar\.gz|/tags/v$NEW_VERSION.tar.gz|" "$PROJECT_ROOT/packaging/homebrew/desktop-waifu.rb"

echo ""
echo "Version bumped to $NEW_VERSION"
echo ""
echo "Next steps:"
echo "  1. Update CHANGELOG.md with release notes"
echo "  2. Commit changes: git commit -am \"Bump version to $NEW_VERSION\""
echo "  3. Create and push tag: git tag v$NEW_VERSION && git push origin v$NEW_VERSION"
echo "  4. After release, update Homebrew formula sha256 hash"
