# Contributing to Desktop Waifu

Thank you for your interest in contributing to Desktop Waifu! This document provides guidelines and instructions for contributing.

## How to Contribute

### Reporting Issues

- Search existing issues before creating a new one
- Use a clear, descriptive title
- Include steps to reproduce for bugs
- Mention your OS, browser, and relevant versions

### Pull Requests

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Make your changes
4. Test your changes thoroughly
5. Commit with clear, descriptive messages
6. Push to your fork and submit a pull request

## Development Setup

### Prerequisites

- [Bun](https://bun.sh/) - JavaScript runtime
- [Rust](https://www.rust-lang.org/tools/install) - Required for Tauri and overlay
- [Tauri prerequisites](https://tauri.app/start/prerequisites/)

For Wayland overlay development:
- GTK4 development libraries
- gtk4-layer-shell

### Getting Started

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/desktop-waifu.git
cd desktop-waifu

# Install dependencies
bun install

# Start development server
bun dev:web

# Or run with overlay (Wayland only)
bun dev
```

## Code Style Guidelines

### TypeScript/React

- Use explicit type definitions; avoid `any`
- Prefer functional components with hooks
- Use descriptive variable and function names
- Keep React components focused and single-purpose

### File Organization

| Type of Code | Location | Notes |
|--------------|----------|-------|
| React components | `src/components/` | Organized by feature (e.g., `character/`, `chat/`, `ui/`) |
| Shared utilities | `src/lib/` | Non-React code: LLM providers, personalities, helpers |
| Type definitions | Near usage or `src/types/` | Prefer colocating types with the code that uses them |
| Static assets | `public/` | VRM models, animations, images |

## Adding New Characters

### Licensing Requirements

VRM models contributed to this repository must be licensed for open-source distribution. Acceptable licenses include:
- CC0 (Public Domain)
- CC-BY (Attribution)
- MIT or similar permissive licenses

Do not contribute models that:
- Were purchased with a personal-use-only license
- Are ripped from games or other software
- Have unclear or restrictive licensing terms

If attribution is required, include it in your pull request description and we'll add it to the repository.

### Steps

1. Prepare a VRM model file with appropriate licensing
2. Place the model in `public/characters/` as `{character-id}.vrm`
3. Add the character to `src/characters/index.ts`:

```typescript
export const characters: Record<string, Character> = {
  // ... existing characters
  yourcharacter: createCharacter('yourcharacter', 'Your Character Name'),
};
```

The character will automatically appear in the settings modal.

## Adding New LLM Providers

1. Create a new provider file in `src/lib/llm/providers/`:

```typescript
// src/lib/llm/providers/your-provider.ts
import type { LLMProvider, Message } from './base';

export class YourProvider implements LLMProvider {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async chat(messages: Message[], systemPrompt: string): Promise<string> {
    // Implement synchronous chat
  }

  async *streamChat(
    messages: Message[],
    systemPrompt: string
  ): AsyncGenerator<string> {
    // Implement streaming chat
  }
}
```

2. Register the provider in `src/lib/llm/index.ts`:

```typescript
import { YourProvider } from './providers/your-provider';

export function createProvider(
  provider: string,
  apiKey: string
): LLMProvider {
  switch (provider) {
    // ... existing cases
    case 'your-provider':
      return new YourProvider(apiKey);
  }
}
```

3. Add model options to the settings store in `src/store/index.ts`

## Adding New Personalities

1. Create a personality definition in `src/lib/personalities/definitions/`:

```typescript
// src/lib/personalities/definitions/your-personality.ts
import type { Personality } from '../types';

export const yourPersonality: Personality = {
  id: 'your-personality',
  name: 'Your Personality',
  description: 'Brief description for the settings UI',
  traits: `
    Describe the personality traits here.
    This affects how the AI behaves.
  `,
  speechStyle: `
    Describe how the personality speaks.
    Include tone, vocabulary, and mannerisms.
  `,
};
```

2. Register in `src/lib/personalities/index.ts`:

```typescript
import { yourPersonality } from './definitions/your-personality';

export const personalities: Record<PersonalityId, Personality> = {
  // ... existing personalities
  'your-personality': yourPersonality,
};
```

3. Add the ID to the `PersonalityId` type in `src/lib/personalities/types.ts`

## Testing Guidelines

Currently, the project relies on manual testing:

- Test in both window mode and overlay mode (if on Wayland)
- Test with different LLM providers
- Test character switching and animations
- Verify settings persistence across page reloads

## Pull Request Process

1. Ensure your code follows the style guidelines
2. Update documentation if needed
3. Test your changes across supported platforms when possible
4. Describe your changes clearly in the PR description
5. Link any related issues
6. Be responsive to review feedback

## Questions?

Feel free to open an issue for questions about contributing. We're happy to help!
