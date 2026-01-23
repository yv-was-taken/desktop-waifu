export interface CommandContext {
  clearMessages: () => void;
  toggleSettings: () => void;
  updateSettings: (settings: { selectedCharacter?: string }) => void;
  addMessage: (message: { role: 'assistant'; content: string }) => void;
  availableCharacters: string[];
  currentCharacter: string;
}

export interface CommandResult {
  handled: boolean;
  feedbackMessage?: string;
  error?: string;
}

export interface ParsedCommand {
  name: string;
  args: string[];
  rawArgs: string;
}

export type CommandHandler = (
  args: string[],
  rawArgs: string,
  context: CommandContext
) => CommandResult;

export interface CommandDefinition {
  name: string;
  description: string;
  usage: string;
  handler: CommandHandler;
}
