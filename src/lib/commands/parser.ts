import type { ParsedCommand } from './types';

export function isSlashCommand(input: string): boolean {
  return input.trimStart().startsWith('/');
}

export function parseSlashCommand(input: string): ParsedCommand | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) return null;

  const parts = trimmed.slice(1).split(/\s+/);
  const name = parts[0]?.toLowerCase() || '';
  if (!name) return null;

  return {
    name,
    args: parts.slice(1),
    rawArgs: trimmed.slice(1 + name.length).trim(),
  };
}
