#!/usr/bin/env bash
set -euo pipefail

# Release script for desktop-waifu
# Handles version bump, tagging, and publishing to all package registries
# Idempotent: can be re-run safely if it fails midway

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
GITHUB_REPO="yv-was-taken/desktop-waifu"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Spinner characters
SPINNER='⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'

print_step() {
    echo -e "${BLUE}→${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_skip() {
    echo -e "${YELLOW}○${NC} $1 (already done)"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_info() {
    echo -e "  $1"
}

# Compare semver versions: returns 0 if $1 >= $2, 1 otherwise
version_gte() {
    local v1="$1"
    local v2="$2"

    # Split into components
    IFS='.' read -r v1_major v1_minor v1_patch <<< "$v1"
    IFS='.' read -r v2_major v2_minor v2_patch <<< "$v2"

    # Remove any pre-release suffix for comparison
    v1_patch="${v1_patch%%-*}"
    v2_patch="${v2_patch%%-*}"

    if (( v1_major > v2_major )); then return 0; fi
    if (( v1_major < v2_major )); then return 1; fi
    if (( v1_minor > v2_minor )); then return 0; fi
    if (( v1_minor < v2_minor )); then return 1; fi
    if (( v1_patch >= v2_patch )); then return 0; fi
    return 1
}

# Get version from a specific file
get_version_from_file() {
    local file="$1"
    case "$file" in
        *.json)
            grep -E '"version"' "$file" | head -1 | sed -E 's/.*"([0-9]+\.[0-9]+\.[0-9]+)".*/\1/'
            ;;
        *.toml)
            grep -E '^version\s*=' "$file" | head -1 | sed -E 's/.*"([0-9]+\.[0-9]+\.[0-9]+)".*/\1/'
            ;;
        *PKGBUILD)
            grep -E '^pkgver=' "$file" | sed -E 's/pkgver=([0-9]+\.[0-9]+\.[0-9]+).*/\1/'
            ;;
        *.rb)
            grep -E '/tags/v[0-9]+\.[0-9]+\.[0-9]+' "$file" | sed -E 's/.*\/tags\/v([0-9]+\.[0-9]+\.[0-9]+).*/\1/'
            ;;
        *.nix)
            grep -E 'version = "[0-9]+\.[0-9]+\.[0-9]+"' "$file" | head -1 | sed -E 's/.*"([0-9]+\.[0-9]+\.[0-9]+)".*/\1/'
            ;;
    esac
}

# List of all version files to check
VERSION_FILES=(
    "package.json"
    "src-tauri/tauri.conf.json"
    "src-tauri/Cargo.toml"
    "desktop-waifu-overlay/Cargo.toml"
    "packaging/aur/PKGBUILD"
    "packaging/homebrew/desktop-waifu.rb"
    "packaging/nix/default.nix"
)

# Check if all version files are at the target version
all_files_at_version() {
    local target="$1"
    for file in "${VERSION_FILES[@]}"; do
        local ver=$(get_version_from_file "$PROJECT_ROOT/$file")
        if [[ "$ver" != "$target" ]]; then
            return 1
        fi
    done
    return 0
}

# Get current version from package.json (used as reference for >= comparison)
get_current_version() {
    get_version_from_file "$PROJECT_ROOT/package.json"
}

# Check if local branch is ahead of remote
local_ahead_of_remote() {
    git fetch origin master --quiet 2>/dev/null || true
    local LOCAL=$(git rev-parse HEAD)
    local REMOTE=$(git rev-parse origin/master 2>/dev/null || echo "")
    [[ "$LOCAL" != "$REMOTE" ]]
}

# Check if tag exists locally
tag_exists_local() {
    git tag -l "v$1" | grep -q "v$1"
}

# Check if tag exists on remote
tag_exists_remote() {
    git ls-remote --tags origin "refs/tags/v$1" 2>/dev/null | grep -q "v$1"
}

# Get expected sha256 for a version tarball
get_tarball_sha256() {
    local version="$1"
    curl -sL "https://github.com/$GITHUB_REPO/archive/refs/tags/v$version.tar.gz" | sha256sum | cut -d' ' -f1
}

# Get sha256 from local homebrew formula
get_formula_sha256() {
    grep -E '^\s*sha256 "' "$PROJECT_ROOT/packaging/homebrew/desktop-waifu.rb" | sed -E 's/.*"([a-f0-9]{64})".*/\1/'
}

# Check if AUR is up to date
aur_is_current() {
    local version="$1"
    local temp_dir="/tmp/desktop-waifu-aur-check"
    rm -rf "$temp_dir"
    if git clone --quiet ssh://aur@aur.archlinux.org/desktop-waifu.git "$temp_dir" 2>/dev/null; then
        local aur_version=$(grep -E '^pkgver=' "$temp_dir/PKGBUILD" | cut -d'=' -f2)
        rm -rf "$temp_dir"
        [[ "$aur_version" == "$version" ]]
    else
        rm -rf "$temp_dir"
        return 1
    fi
}

# Verify Homebrew tap has correct version
verify_homebrew() {
    local version="$1"
    local temp_dir="/tmp/homebrew-desktop-waifu-check"
    rm -rf "$temp_dir"

    if git clone --quiet "https://github.com/yv-was-taken/homebrew-desktop-waifu.git" "$temp_dir" 2>/dev/null; then
        local tap_version=$(grep -E '/tags/v[0-9]+\.[0-9]+\.[0-9]+' "$temp_dir/Formula/desktop-waifu.rb" 2>/dev/null | sed -E 's/.*\/tags\/v([0-9]+\.[0-9]+\.[0-9]+).*/\1/')
        rm -rf "$temp_dir"
        [[ "$tap_version" == "$version" ]]
    else
        rm -rf "$temp_dir"
        return 1
    fi
}

# Wait for GitHub Actions with spinner
wait_for_github_actions() {
    local version="$1"
    local tag="v$version"

    print_step "Waiting for GitHub Actions to complete..."

    # Find the workflow run for this tag
    local run_id=""
    local attempts=0
    local max_attempts=30  # Wait up to 5 minutes for run to appear

    while [[ -z "$run_id" ]] && (( attempts < max_attempts )); do
        run_id=$(gh run list --repo "$GITHUB_REPO" --limit 10 --json headBranch,databaseId,event \
            --jq ".[] | select(.headBranch == \"$tag\" or .event == \"push\") | .databaseId" 2>/dev/null | head -1 || echo "")

        if [[ -z "$run_id" ]]; then
            sleep 10
            ((attempts++))
        fi
    done

    if [[ -z "$run_id" ]]; then
        print_error "Could not find GitHub Actions run for $tag"
        print_info "Check manually: https://github.com/$GITHUB_REPO/actions"
        return 1
    fi

    # Poll until complete
    local status="in_progress"
    local conclusion=""
    local elapsed=0
    local spin_idx=0

    while [[ "$status" == "in_progress" ]] || [[ "$status" == "queued" ]]; do
        # Get current status
        local run_info=$(gh run view "$run_id" --repo "$GITHUB_REPO" --json status,conclusion 2>/dev/null || echo '{"status":"in_progress","conclusion":""}')
        status=$(echo "$run_info" | jq -r '.status')
        conclusion=$(echo "$run_info" | jq -r '.conclusion')

        # Show spinner
        local spin_char="${SPINNER:$spin_idx:1}"
        local mins=$((elapsed / 60))
        local secs=$((elapsed % 60))
        printf "\r  ${BLUE}%s${NC} Build in progress... (%dm %02ds)" "$spin_char" "$mins" "$secs"

        spin_idx=$(( (spin_idx + 1) % ${#SPINNER} ))
        sleep 2
        elapsed=$((elapsed + 2))
    done

    printf "\r%80s\r" ""  # Clear line

    if [[ "$conclusion" == "success" ]]; then
        print_success "GitHub Actions completed successfully!"

        # Verify artifacts exist
        print_step "Verifying release artifacts..."
        local release_info=$(gh release view "v$version" --repo "$GITHUB_REPO" --json assets 2>/dev/null || echo '{"assets":[]}')

        local artifacts=("desktop-waifu-linux-x86_64.tar.gz" "desktop-waifu_${version}-1_amd64.deb")

        for artifact in "${artifacts[@]}"; do
            if echo "$release_info" | jq -e ".assets[] | select(.name | contains(\"${artifact%_*}\"))" >/dev/null 2>&1; then
                print_info "${GREEN}✓${NC} $artifact"
            else
                # Try partial match for deb which has variable naming
                if [[ "$artifact" == *".deb"* ]] && echo "$release_info" | jq -e '.assets[] | select(.name | endswith(".deb"))' >/dev/null 2>&1; then
                    local deb_name=$(echo "$release_info" | jq -r '.assets[] | select(.name | endswith(".deb")) | .name')
                    print_info "${GREEN}✓${NC} $deb_name"
                else
                    print_info "${RED}✗${NC} $artifact (not found)"
                fi
            fi
        done

        # Check for macOS artifact
        if echo "$release_info" | jq -e '.assets[] | select(.name | contains("macos") or contains("macOS"))' >/dev/null 2>&1; then
            local macos_name=$(echo "$release_info" | jq -r '.assets[] | select(.name | contains("macos") or contains("macOS")) | .name')
            print_info "${GREEN}✓${NC} $macos_name"
        else
            print_info "${YELLOW}○${NC} macOS artifact (not found, may still be uploading)"
        fi

        return 0
    else
        print_error "GitHub Actions failed!"
        print_info "View logs: https://github.com/$GITHUB_REPO/actions/runs/$run_id"
        return 1
    fi
}

# Full verification of all package registries
verify_release() {
    local version="$1"
    local all_passed=true

    echo ""
    print_step "Verifying release v$version across all registries..."
    echo ""

    # 1. GitHub Actions / Release artifacts
    if ! wait_for_github_actions "$version"; then
        all_passed=false
    fi

    echo ""

    # 2. Homebrew tap
    print_step "Verifying Homebrew tap..."
    if verify_homebrew "$version"; then
        print_info "${GREEN}✓${NC} Homebrew tap at v$version"
    else
        print_info "${RED}✗${NC} Homebrew tap not at v$version"
        all_passed=false
    fi

    # 3. AUR
    print_step "Verifying AUR..."
    if aur_is_current "$version"; then
        print_info "${GREEN}✓${NC} AUR at v$version"
    else
        print_info "${RED}✗${NC} AUR not at v$version"
        all_passed=false
    fi

    echo ""

    if $all_passed; then
        print_success "All package registries verified!"
        return 0
    else
        print_error "Some verifications failed. Check output above."
        return 1
    fi
}

# Show usage
usage() {
    echo "Usage: $0 [--verify] <version>"
    echo ""
    echo "Arguments:"
    echo "  version     The version to release (e.g., 0.2.4, 0.3.0)"
    echo ""
    echo "Options:"
    echo "  --verify    Wait for CI and verify all registries (GitHub, Homebrew, AUR)"
    echo "  --help      Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 0.2.5              # Release version 0.2.5"
    echo "  $0 --verify 0.2.5     # Release and wait for CI to complete"
    echo "  $0 --verify 0.2.4     # Just verify an existing release"
}

# Main release flow
main() {
    local verify=false
    local version=""

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --verify)
                verify=true
                shift
                ;;
            --help|-h)
                usage
                exit 0
                ;;
            *)
                if [[ -z "$version" ]]; then
                    version="$1"
                else
                    echo "Error: Unexpected argument '$1'"
                    usage
                    exit 1
                fi
                shift
                ;;
        esac
    done

    if [[ -z "$version" ]]; then
        echo "Error: Version is required"
        usage
        exit 1
    fi

    # Validate version format
    if ! [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        print_error "Invalid version format: $version"
        print_info "Use semver format (e.g., 0.2.4, 1.0.0)"
        exit 1
    fi

    cd "$PROJECT_ROOT"

    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  Desktop Waifu Release v$version${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo ""

    local current_version=$(get_current_version)

    # Check if this is a verify-only run for existing release
    if $verify && tag_exists_remote "$version"; then
        if [[ "$current_version" == "$version" ]]; then
            print_info "Release v$version already exists, running verification..."
            echo ""
            verify_release "$version"
            exit $?
        fi
    fi

    # Validate version is >= current
    if ! version_gte "$version" "$current_version"; then
        print_error "Version $version is less than current version $current_version"
        exit 1
    fi

    # Step 1: Bump version
    print_step "Bumping version..."
    if all_files_at_version "$version"; then
        print_skip "All files already at $version"
    else
        "$SCRIPT_DIR/bump-version.sh" "$version"
        print_success "Version bumped to $version"
    fi

    # Step 2: Commit version bump
    print_step "Committing version bump..."
    if git diff --quiet && git diff --cached --quiet; then
        print_skip "No changes to commit"
    else
        git add -A
        git commit -m "Bump version to $version"
        print_success "Changes committed"
    fi

    # Step 3: Push commit
    print_step "Pushing to origin..."
    if ! local_ahead_of_remote; then
        print_skip "Already in sync with origin"
    else
        git push origin master
        print_success "Pushed to origin/master"
    fi

    # Step 4: Create tag
    print_step "Creating tag v$version..."
    if tag_exists_local "$version"; then
        print_skip "Tag v$version already exists locally"
    else
        git tag "v$version"
        print_success "Tag v$version created"
    fi

    # Step 5: Push tag
    print_step "Pushing tag to origin..."
    if tag_exists_remote "$version"; then
        print_skip "Tag v$version already exists on origin"
    else
        git push origin "v$version"
        print_success "Tag v$version pushed (GitHub Actions triggered)"
    fi

    # Step 6: Publish to Homebrew
    print_step "Publishing to Homebrew..."
    local expected_sha256=$(get_tarball_sha256 "$version")
    local current_sha256=$(get_formula_sha256)

    if [[ "$expected_sha256" == "$current_sha256" ]]; then
        print_skip "Homebrew formula already has correct sha256"
    else
        "$SCRIPT_DIR/publish-homebrew.sh"
        print_success "Published to Homebrew tap"
    fi

    # Step 7: Commit sha256 update
    print_step "Committing Homebrew sha256 update..."
    if git diff --quiet packaging/homebrew/desktop-waifu.rb; then
        print_skip "No sha256 changes to commit"
    else
        git add packaging/homebrew/desktop-waifu.rb
        git commit -m "Update Homebrew sha256 for v$version"
        print_success "sha256 update committed"
    fi

    # Step 8: Push sha256 commit
    print_step "Pushing sha256 update..."
    if ! local_ahead_of_remote; then
        print_skip "Already in sync with origin"
    else
        git push origin master
        print_success "Pushed to origin/master"
    fi

    # Step 9: Publish to AUR
    print_step "Publishing to AUR..."
    if aur_is_current "$version"; then
        print_skip "AUR already at v$version"
    else
        "$SCRIPT_DIR/publish-aur.sh"
        print_success "Published to AUR"
    fi

    echo ""
    echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}  Release v$version complete!${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
    echo ""
    print_info "Homebrew: brew tap $GITHUB_REPO && brew install desktop-waifu"
    print_info "AUR:      yay -S desktop-waifu"
    print_info "Debian:   Download .deb from GitHub Releases (after CI completes)"
    echo ""

    if $verify; then
        echo ""
        verify_release "$version"
    else
        print_info "${YELLOW}Note:${NC} GitHub Actions is building .deb and .app in the background"
        print_info "Check status: https://github.com/$GITHUB_REPO/actions"
        print_info "Or run: $0 --verify $version"
    fi

    echo ""
}

main "$@"
