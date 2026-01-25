export { isSlashCommand, parseSlashCommand } from './parser';
export { getCommand, commandRegistry } from './handlers';
export type {
  CommandContext,
  CommandResult,
  ParsedCommand,
  CommandHandler,
  CommandDefinition,
} from './types';

import { isSlashCommand, parseSlashCommand } from './parser';
import { getCommand } from './handlers';
import type { CommandContext, CommandResult } from './types';

export function executeSlashCommand(
  input: string,
  context: CommandContext
): CommandResult | null {
  if (!isSlashCommand(input)) return null;

  const parsed = parseSlashCommand(input);
  if (!parsed) {
    return {
      handled: true,
      error: 'Invalid command format. Type `/help` for available commands.',
    };
  }

  const command = getCommand(parsed.name);
  if (!command) {
    return {
      handled: true,
      error: `Unknown command "/${parsed.name}". Type \`/help\` for available commands.`,
    };
  }

  return command.handler(parsed.args, parsed.rawArgs, context);
}
