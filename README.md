# Desktop Waifu

A desktop companion app featuring animated 3D VRM characters with AI-powered conversational chat.

<!-- TODO: Add screenshots/GIFs here
![Desktop Waifu Screenshot](./docs/screenshot.png)
![Overlay Mode Demo](./docs/overlay-demo.gif)
-->

## Features

- **6 Selectable 3D Characters** - Fully animated VRM models with idle, talking, and expression animations
- **Multi-Provider LLM Support** - OpenAI, Anthropic Claude, and Google Gemini integration
- **7 Customizable Personalities** - From friendly companion to professional tutor
- **Dual Display Modes**:
  - Normal window mode (cross-platform)
  - Wayland overlay mode (desktop pet that floats above other windows)
- **Streaming Chat** - Real-time responses with full markdown support
- **Persistent Settings** - Character, personality, and API preferences saved locally

## Tech Stack

| Category | Technologies |
|----------|-------------|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS |
| 3D | Three.js, React Three Fiber, @pixiv/three-vrm |
| State | Zustand with localStorage persistence |
| Desktop | Tauri 2 (Rust backend) |
| Overlay | GTK4 Layer Shell (Wayland) |
| LLM | OpenAI, Anthropic, Google Gemini SDKs |

## Compatibility

| Platform | Window Mode | Overlay Mode |
|----------|-------------|--------------|
| Linux (Wayland) | ✅ | ✅ |
| Linux (X11) | ✅ | ❌ |
| macOS | ✅ | ❌ |
| Windows | ✅ | ❌ |

The overlay "desktop pet" mode uses GTK4 Layer Shell which is Wayland-specific. Standard window mode works on all platforms supported by Tauri.

## Repository Structure

```
desktop-waifu/
├── src/
│   ├── components/
│   │   ├── character/     # 3D canvas, VRM model rendering, animations
│   │   ├── chat/          # Chat UI components, message handling
│   │   └── ui/            # Settings modal, shared UI components
│   ├── lib/
│   │   ├── llm/providers/ # LLM provider implementations
│   │   └── personalities/ # Personality definitions and prompts
│   ├── characters/        # Character configuration
│   └── store/             # Zustand state management
├── public/
│   ├── characters/        # VRM model files
│   └── animations/        # VRMAnimation files
├── desktop-waifu-overlay/ # Rust GTK4 overlay application
└── src-tauri/             # Tauri backend configuration
```

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) (JavaScript runtime and package manager)
- [Rust](https://www.rust-lang.org/tools/install) (for Tauri and overlay)
- Tauri prerequisites: https://tauri.app/start/prerequisites/

For Wayland overlay mode (Linux only):
- GTK4
- gtk4-layer-shell

### Installation

```bash
# Clone the repository
git clone https://github.com/yv-was-taken/desktop-waifu.git
cd desktop-waifu

# Install dependencies
bun install
```

### Development

```bash
# Start web dev server + overlay (Wayland)
bun dev

# Start web dev server only
bun dev:web

# Run full Tauri app
bun tauri dev
```

### Production Build

```bash
# Build everything (web + overlay)
bun build

# Build web only
bun build:web

# Build Tauri desktop app
bun tauri build
```

## Configuration

### API Keys

Configure your LLM provider API key in the settings modal (gear icon):

1. Select your preferred provider (OpenAI, Anthropic, or Google)
2. Enter your API key
3. Choose a model

API keys are stored locally in the application's data directory:
- **Linux**: `~/.local/share/tauri-app/`
- **macOS**: `~/Library/Application Support/com.desktopwaifu.app/`
- **Windows**: `%APPDATA%\com.desktopwaifu.app\`

### Characters

6 characters are available, each with the same animation set but unique appearances:

Emily, Grace, Jessica, Rose, Sam, Victoria

### Personalities

Choose from 7 personality presets that affect how the AI responds:

| Personality | Description |
|-------------|-------------|
| Naive Girlfriend | Sweet, caring, emotionally supportive |
| Smart Girlfriend | Intellectually curious, witty, engaging |
| Friend | Casual, supportive, down-to-earth |
| Tutor | Educational, patient, encouraging |
| Life Coach | Motivational, goal-oriented, insightful |
| Creative Partner | Imaginative, collaborative, artistic |
| Assistant | Professional, efficient, knowledgeable |

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.
