#!/usr/bin/env bash
set -euo pipefail

# AUR publish script for desktop-waifu
# Pushes the current PKGBUILD to the Arch User Repository

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
AUR_REPO="ssh://aur@aur.archlinux.org/desktop-waifu.git"
WORK_DIR="/tmp/desktop-waifu-aur"

# Extract version from PKGBUILD
VERSION=$(grep -E '^pkgver=' "$PROJECT_ROOT/packaging/aur/PKGBUILD" | cut -d'=' -f2)

echo "Publishing desktop-waifu v$VERSION to AUR..."
echo ""

# Clone AUR repo (remove existing clone if present)
echo "Cloning AUR repository..."
if [ -d "$WORK_DIR" ]; then
    rm -rf "$WORK_DIR"
fi
git clone "$AUR_REPO" "$WORK_DIR"
cd "$WORK_DIR"

# Copy PKGBUILD
echo "Copying PKGBUILD..."
cp "$PROJECT_ROOT/packaging/aur/PKGBUILD" ./PKGBUILD

# Generate .SRCINFO
echo "Generating .SRCINFO..."
makepkg --printsrcinfo > .SRCINFO

# Check for changes
if git diff --quiet; then
    echo ""
    echo "No changes to publish. AUR is already up to date."
    exit 0
fi

# Show diff
echo ""
echo "Changes to be published:"
git diff

# Commit and push
echo ""
echo "Committing and pushing to AUR..."
git add PKGBUILD .SRCINFO
git commit -m "Update to v$VERSION"
git push

echo ""
echo "Successfully published desktop-waifu v$VERSION to AUR!"
echo "Users can now install/update with: yay -S desktop-waifu"
