# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Desktop Waifu is a Tauri + React + TypeScript desktop application featuring animated 3D VRM characters with AI-powered conversational chat. It combines Three.js-based 3D rendering with multi-provider LLM integration.

## Build Commands

```bash
bun dev              # Start Vite dev server (port 1420)
bun build            # Type check + production build
bun tauri dev        # Run full Tauri app in development
bun tauri build      # Build production desktop app
```

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
