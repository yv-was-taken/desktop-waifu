# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Desktop Waifu is a Tauri + React + TypeScript desktop application featuring animated 3D VRM characters with AI-powered conversational chat. It combines Three.js-based 3D rendering with multi-provider LLM integration.

## Build Commands

**IMPORTANT: Use `bun dev` for development, NOT `bun tauri dev`.**

When asked about build/dev commands, always run `cat package.json | grep -A 15 '"scripts"'` to verify. Never assume based on conventions.

```bash
bun dev              # PRIMARY DEV COMMAND - Runs Vite + desktop-waifu-overlay together
bun build            # Type check + production build (frontend + overlay)
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
The Zustand store in `src/store/index.ts` manages three slices:
- **Character**: isLoaded, currentAnimation, currentExpression, isTalking
- **Chat**: messages array, isThinking, isUserTyping
- **Settings**: llmProvider, apiKey, model selection, UI preferences

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

## Debugging

**NEVER use `console.log()` for debugging.** Client-side console.log will NOT appear in the terminal running `bun dev` - it only shows in browser devtools which are not accessible in the overlay.

**ALWAYS use `debugLog()` from `src/lib/debug.ts` instead:**
1. Import: `import { debugLog } from '../../lib/debug';`
2. Enable debug flags in **BOTH** locations:
   - Client: Set `DEBUG_ENABLED = true` in `src/lib/debug.ts`
   - Server: Set `DEBUG_LOGGING = true` in `desktop-waifu-overlay/src/main.rs`
3. Use: `debugLog('your message here');`
4. Messages will appear in the terminal where `bun dev` is running
