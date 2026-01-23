import type { CommandDefinition, CommandHandler, CommandResult } from './types';

// Handler for /clear
const clearHandler: CommandHandler = (_args, _rawArgs, context): CommandResult => {
  context.clearMessages();
  return { handled: true };
};

// Handler for /settings
const settingsHandler: CommandHandler = (_args, _rawArgs, context): CommandResult => {
  context.toggleSettings();
  return { handled: true };
};

// Handler for /character
const characterHandler: CommandHandler = (args, _rawArgs, context): CommandResult => {
  const { availableCharacters, currentCharacter, updateSettings } = context;

  // No args: show current + available characters
  if (args.length === 0) {
    const charList = availableCharacters
      .map((c) => (c === currentCharacter ? `**${c}** (current)` : c))
      .join(', ');
    return {
      handled: true,
      feedbackMessage: `Current character: **${currentCharacter}**\n\nAvailable: ${charList}`,
    };
  }

  // With args: switch character
  const requestedChar = args[0].toLowerCase();

  // Check if already using this character
  if (requestedChar === currentCharacter.toLowerCase()) {
    return {
      handled: true,
      feedbackMessage: `Already using **${currentCharacter}**!`,
    };
  }

  // Check if valid character
  const matchedChar = availableCharacters.find((c) => c.toLowerCase() === requestedChar);
  if (!matchedChar) {
    const validChars = availableCharacters.join(', ');
    return {
      handled: true,
      error: `Unknown character "${args[0]}". Available: ${validChars}`,
    };
  }

  // Switch character
  updateSettings({ selectedCharacter: matchedChar });
  return {
    handled: true,
    feedbackMessage: `Switched to **${matchedChar}**!`,
  };
};

// Handler for /help
const helpHandler: CommandHandler = (_args, _rawArgs, _context): CommandResult => {
  const helpText = commandRegistry
    .map((cmd) => `**/${cmd.name}** - ${cmd.description}\n  Usage: \`${cmd.usage}\``)
    .join('\n\n');

  return {
    handled: true,
    feedbackMessage: `**Available Commands:**\n\n${helpText}`,
  };
};

// Command registry
export const commandRegistry: CommandDefinition[] = [
  {
    name: 'clear',
    description: 'Clear all chat messages',
    usage: '/clear',
    handler: clearHandler,
  },
  {
    name: 'settings',
    description: 'Open the settings panel',
    usage: '/settings',
    handler: settingsHandler,
  },
  {
    name: 'character',
    description: 'Show or switch the current character',
    usage: '/character [name]',
    handler: characterHandler,
  },
  {
    name: 'help',
    description: 'Show available commands',
    usage: '/help',
    handler: helpHandler,
  },
];

export function getCommand(name: string): CommandDefinition | undefined {
  return commandRegistry.find((cmd) => cmd.name === name.toLowerCase());
}
