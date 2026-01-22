#!/usr/bin/env bash
set -euo pipefail

# Homebrew publish script for desktop-waifu
# Updates sha256 and pushes the formula to the Homebrew tap

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
HOMEBREW_TAP="https://github.com/yv-was-taken/homebrew-desktop-waifu.git"
WORK_DIR="/tmp/homebrew-desktop-waifu"
FORMULA_PATH="$PROJECT_ROOT/packaging/homebrew/desktop-waifu.rb"

# Extract version from formula URL
VERSION=$(grep -E '^\s*url ".*v[0-9]+\.[0-9]+\.[0-9]+' "$FORMULA_PATH" | sed -E 's/.*v([0-9]+\.[0-9]+\.[0-9]+).*/\1/')

echo "Publishing desktop-waifu v$VERSION to Homebrew tap..."
echo ""

# Fetch and update sha256
TARBALL_URL="https://github.com/yv-was-taken/desktop-waifu/archive/refs/tags/v$VERSION.tar.gz"
echo "Fetching sha256 for v$VERSION tarball..."
NEW_SHA256=$(curl -sL "$TARBALL_URL" | sha256sum | cut -d' ' -f1)
echo "sha256: $NEW_SHA256"
echo ""

# Update local formula with new sha256
echo "Updating local formula..."
sed -i "s/sha256 \"[a-f0-9]\{64\}\"/sha256 \"$NEW_SHA256\"/" "$FORMULA_PATH"

# Clone Homebrew tap (remove existing clone if present)
echo "Cloning Homebrew tap..."
if [ -d "$WORK_DIR" ]; then
    rm -rf "$WORK_DIR"
fi
git clone "$HOMEBREW_TAP" "$WORK_DIR"
cd "$WORK_DIR"

# Copy formula
echo "Copying formula..."
mkdir -p Formula
cp "$FORMULA_PATH" Formula/desktop-waifu.rb

# Check for changes
if git diff --quiet; then
    echo ""
    echo "No changes to publish. Homebrew tap is already up to date."
    exit 0
fi

# Show diff
echo ""
echo "Changes to be published:"
git diff

# Commit and push
echo ""
echo "Committing and pushing to Homebrew tap..."
git add Formula/desktop-waifu.rb
git commit -m "Update to v$VERSION"
git push

echo ""
echo "Successfully published desktop-waifu v$VERSION to Homebrew tap!"
echo "Users can now install/update with: brew install yv-was-taken/desktop-waifu/desktop-waifu"
