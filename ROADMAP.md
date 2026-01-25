# Desktop Waifu Feature Roadmap

This document outlines planned features for Desktop Waifu, organized by implementation phase. Features are prioritized by impact and effort.

## Phase 2: Core Enhancements (Medium Effort)

Significant UX improvements requiring moderate architectural changes.

### Command Palette
- [ ] Cmd/Ctrl+K to open modal
- [ ] Fuzzy search across commands
- [ ] Quick settings access
- [ ] Character switching
- **Effort**: ~8 hours
- **Files**: `src/components/`, `src/store/index.ts`

## Phase 3: Agent Harness (Major Feature)

Transform Desktop Waifu into an agentic system capable of tool use.

### Native Tool Calling
- [ ] Implement OpenAI function calling format
- [ ] Implement Anthropic tool use format
- [ ] Implement Gemini function calling format
- [ ] Unified tool interface across providers
- **Effort**: ~16 hours
- **Files**: `src/lib/llm/providers/`, `src/lib/llm/tools/` (new)

### Built-in Tools
- [ ] `web_search` - Search the web
- [ ] `file_read` - Read local files (with permission)
- [ ] `url_fetch` - Fetch URL content
- [ ] `clipboard` - Read/write clipboard
- [ ] `execute_command` - Run shell commands (with approval)
- **Effort**: ~20 hours
- **Files**: `src/lib/tools/` (new), `src/lib/platform.ts`

### Tool Approval Tiers
- [ ] Auto-approve safe operations (web search, clipboard read)
- [ ] Prompt for risky operations (file write, command execution)
- [ ] Approval UI component
- [ ] Permission persistence settings
- **Effort**: ~6 hours
- **Files**: `src/components/`, `src/store/index.ts`

### Agentic Loop
- [ ] Multi-turn tool use without user input
- [ ] Iteration limit configuration
- [ ] Cancel/interrupt mechanism
- [ ] Progress indicator during agent execution
- **Effort**: ~12 hours
- **Files**: `src/components/chat/ChatPanel.tsx`, `src/lib/llm/`

### Memory Management
- [ ] Token counting per message
- [ ] Conversation summarization
- [ ] Sliding window context
- [ ] Token budget display
- **Effort**: ~8 hours
- **Files**: `src/lib/llm/`, `src/store/index.ts`

---

## Phase 4: Desktop Integration

Platform-specific features for deeper OS integration.

### Media Control (MPRIS)
- [ ] Spotify integration (Linux via D-Bus)
- [ ] VLC/media player control
- [ ] "What's playing" queries
- [ ] Playback control commands
- **Effort**: ~12 hours
- **Notes**: Linux-first via MPRIS D-Bus protocol
- **Files**: `desktop-waifu-overlay/src/`, `src/lib/platform.ts`

### File Browser
- [ ] VRM model import dialog
- [ ] Drag-and-drop file handling
- [ ] Recent files list
- **Effort**: ~4 hours
- **Files**: `src/components/`, `src/lib/platform.ts`

### Auto-Updates
- [ ] Check for updates on launch
- [ ] Download and install updates
- [ ] Update notification UI
- **Effort**: ~8 hours
- **Notes**: Use Tauri updater plugin
- **Files**: `src-tauri/`, `src/components/`

---

## Phase 5: Voice & Multimedia (Ambitious)

Future exploration requiring significant new infrastructure.

### Text-to-Speech
- [ ] ElevenLabs integration
- [ ] OpenAI TTS integration
- [ ] Lip-sync with VRM blend shapes
- [ ] Voice selection per character
- **Effort**: ~16 hours
- **Files**: `src/lib/tts/` (new), `src/components/character/`

### Speech-to-Text
- [ ] Push-to-talk voice input
- [ ] Whisper API integration
- [ ] Visual recording indicator
- **Effort**: ~12 hours
- **Files**: `src/lib/stt/` (new), `src/components/chat/`

### Plugin System
- [ ] Plugin API specification
- [ ] Plugin loader and sandbox
- [ ] Plugin marketplace/registry
- [ ] Example plugins
- **Effort**: ~40 hours
- **Notes**: Significant architectural work required

---

## Dependency Graph

Features that can be implemented in parallel vs. those with dependencies.

```
Phase 1 (all parallel)
├── Streaming Responses
├── Slash Commands
├── Desktop Notifications
└── Message Context Menu

Phase 2 (mostly parallel)
├── Global Hotkeys
├── Command Palette ─────────────────────┐
├── System Tray                          │
├── Clipboard Integration                │
├── Toast Notifications ─────────────────┤ (Command Palette can use toasts)
└── Conversation Export                  │
                                         │
Phase 3 (sequential dependencies)        │
├── Native Tool Calling ◄────────────────┘
│   └── Built-in Tools
│       └── Tool Approval Tiers
│           └── Agentic Loop
└── Memory Management (parallel with tool work)

Phase 4 (parallel with Phase 3)
├── Media Control
├── File Browser
└── Auto-Updates

Phase 5 (depends on stable base)
├── Text-to-Speech ──┐
├── Speech-to-Text   ├── (can be parallel)
└── Plugin System ◄──┘ (depends on stable architecture)
```

---

## Key Implementation Files

| File | Purpose |
|------|---------|
| `src/components/chat/ChatPanel.tsx` | Chat logic, streaming, slash commands, agentic loop |
| `src/lib/llm/providers/base.ts` | LLM interface, tool calling definitions |
| `src/store/index.ts` | Global state, new feature slices |
| `desktop-waifu-overlay/src/tray.rs` | System tray (exists, needs integration) |
| `desktop-waifu-overlay/src/main.rs` | Overlay main loop, global hotkeys |
| `src/lib/platform.ts` | Desktop API bridges (clipboard, notifications, etc.) |

---

## Contributing

When implementing a feature:
1. Check the dependency graph for prerequisites
2. Create a feature branch from `development`
3. Update relevant checkboxes in this document
4. Reference the listed files as starting points
5. Follow patterns established in CLAUDE.md

---

*Last updated: January 2026*
