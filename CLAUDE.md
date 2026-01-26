# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Desktop Waifu is a Tauri + React + TypeScript desktop application featuring animated 3D VRM characters with AI-powered conversational chat. It combines Three.js-based 3D rendering with multi-provider LLM integration.

## Build Commands

**IMPORTANT: Use `bun dev` for development, NOT `bun tauri dev`.**
**IMPORTANT: Always use `bun` instead of `npm`, `npx`, or `yarn`. This project uses bun as its package manager.**

When asked about build/dev commands, always run `cat package.json | grep -A 15 '"scripts"'` to verify. Never assume based on conventions.

```bash
bun dev              # PRIMARY DEV COMMAND - Runs Vite + desktop-waifu-overlay together
bun build            # Type check + production build (frontend + overlay)
bunx tsc --noEmit    # Type check only (no build output)
```

### Command Details
- **`bun dev`**: This is the main development command. It runs both the Vite dev server (port 1420) AND the desktop-waifu-overlay Rust binary concurrently. Use this for all development and testing.
- **`bun tauri dev`**: Do NOT use this. It runs Tauri's CLI dev command which is separate from our overlay architecture.
- **`bun dev:web`**: Runs only the Vite frontend (no overlay). Use for frontend-only debugging.

## Architecture

### Tech Stack
- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS
- **3D**: Three.js, React Three Fiber, @pixiv/three-vrm for VRM model/animation support
- **State**: Zustand with localStorage persistence
- **Desktop**: Tauri 2 (Rust backend)
- **LLM**: OpenAI, Anthropic, and Google Gemini SDKs

### Key Directories
- `src/components/character/` - 3D canvas and VRM model rendering with animation system
- `src/components/chat/` - Chat UI (ChatPanel orchestrates LLM calls)
- `src/lib/llm/providers/` - LLM provider abstraction (base.ts defines interface)
- `src/store/index.ts` - Global Zustand store (character, chat, settings slices)
- `src/characters/*/` - Character configs (model paths, animations, expressions, system prompts)
- `src-tauri/` - Rust backend and Tauri configuration

### State Management Pattern
The Zustand store in `src/store/index.ts` manages five slices:
- **Character**: isLoaded, currentAnimation, currentExpression, isTalking, isHiding
- **Chat**: messages array, isThinking, isUserTyping
- **Settings**: llmProvider, apiKey, model selection, personality, UI preferences
- **UI**: chatPanelOpen, isScaleSliderDragging, quadrant position
- **Execution**: Command execution state with approval flow (status, generatedCommand, approved)

### LLM Provider Pattern
Providers implement the `LLMProvider` interface in `src/lib/llm/providers/base.ts`:
- Each provider handles system messages differently
- Both synchronous `chat()` and `streamChat()` methods supported
- API calls run client-side with `dangerouslyAllowBrowser` flag

### Animation Flow
Character animations transition based on chat state: idle → thinking → talking → listening. The CharacterModel component handles VRM loading, animation mixing with cross-fade, and expression blending via blend shapes.

## Adding New Content

### New Character
Create a folder in `src/characters/` with:
- `config.ts` - Model path, available animations, expressions mapping
- `prompt.ts` - System prompt defining personality

### New LLM Provider
1. Create provider class in `src/lib/llm/providers/` implementing `LLMProvider`
2. Register in `src/lib/llm/index.ts`
3. Add model options to settings store

## Package Distribution

The project is published to multiple package registries:

| Platform | Install Command | Source |
|----------|-----------------|--------|
| **Arch (AUR)** | `yay -S desktop-waifu` | packaging/aur/PKGBUILD |
| **Debian/Ubuntu** | `sudo dpkg -i desktop-waifu_X.Y.Z_amd64.deb` | GitHub Releases (.deb) |
| **macOS (Homebrew)** | `brew tap yv-was-taken/desktop-waifu && brew install desktop-waifu` | packaging/homebrew/desktop-waifu.rb |
| **NixOS/Nix** | `nix run github:yv-was-taken/desktop-waifu` | packaging/nix/default.nix |

### Release Workflow

Use the unified release script to bump version and publish to all registries:

```bash
./scripts/bump-and-publish.sh --verify X.Y.Z
```

**IMPORTANT: Always use the `--verify` flag when publishing**, unless the user specifies no verification is needed (e.g., re-running after a specific package failed and CI already passed).

This script is **idempotent** - if it fails midway, re-run it and it will skip completed steps.

**What it does:**
1. Bumps version in all config files (package.json, Cargo.toml, PKGBUILD, etc.)
2. Commits and pushes the version bump
3. Creates and pushes git tag (triggers GitHub Actions for .deb/.app builds)
4. Publishes to Homebrew tap (fetches sha256, updates formula)
5. Publishes to AUR (generates .SRCINFO, pushes to AUR repo)
6. Waits for GitHub Actions to complete and verifies all artifacts

**Individual scripts** (used internally by bump-and-publish.sh):
- `./scripts/bump-version.sh` - Updates version in all files
- `./scripts/publish-homebrew.sh` - Publishes to Homebrew tap
- `./scripts/publish-aur.sh` - Publishes to AUR

## Debugging

**NEVER use `console.log()` for debugging.** Client-side console.log will NOT appear in the terminal running `bun dev` - it only shows in browser devtools which are not accessible in the overlay.

**ALWAYS use `debugLog()` from `src/lib/debug.ts` instead:**
1. Import: `import { debugLog } from '../../lib/debug';`
2. Enable debug flags in **BOTH** locations:
   - Client: Set `DEBUG_ENABLED = true` in `src/lib/debug.ts`
   - Server: Set `DEBUG_LOGGING = true` in `desktop-waifu-overlay/src/main.rs`
3. Use: `debugLog('your message here');`
4. Messages will appear in the terminal where `bun dev` is running

### Testing Hide Hotkey in Dev Mode
To simulate the hide/show hotkey toggle during development, send a command to the IPC socket:
```bash
python -c "import socket; s=socket.socket(socket.AF_UNIX); s.connect('/run/user/$(id -u)/desktop-waifu.sock'); s.send(b'toggle')"
```
