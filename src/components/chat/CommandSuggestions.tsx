import { useEffect, useRef } from 'react';
import { commandRegistry } from '../../lib/commands';

interface CommandSuggestion {
  name: string;
  description: string;
  usage: string;
}

interface CommandSuggestionsProps {
  filter: string; // The text after `/` that the user has typed
  onSelect: (command: string) => void;
  selectedIndex: number;
  onSelectedIndexChange: (index: number) => void;
}

// Simple fuzzy match: checks if all characters in query appear in order in target
function fuzzyMatch(query: string, target: string): boolean {
  const q = query.toLowerCase();
  const t = target.toLowerCase();

  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      qi++;
    }
  }
  return qi === q.length;
}

export function getFilteredCommands(filter: string): CommandSuggestion[] {
  if (!filter) {
    return commandRegistry.map((cmd) => ({
      name: cmd.name,
      description: cmd.description,
      usage: cmd.usage,
    }));
  }

  return commandRegistry
    .filter((cmd) => fuzzyMatch(filter, cmd.name))
    .map((cmd) => ({
      name: cmd.name,
      description: cmd.description,
      usage: cmd.usage,
    }));
}

export function CommandSuggestions({
  filter,
  onSelect,
  selectedIndex,
  onSelectedIndexChange,
}: CommandSuggestionsProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const suggestions = getFilteredCommands(filter);

  // Keep selected index in bounds
  useEffect(() => {
    if (selectedIndex >= suggestions.length) {
      onSelectedIndexChange(Math.max(0, suggestions.length - 1));
    }
  }, [suggestions.length, selectedIndex, onSelectedIndexChange]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const selectedEl = listRef.current.children[selectedIndex] as HTMLElement;
      selectedEl?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  if (suggestions.length === 0) {
    return (
      <div className="absolute bottom-full left-0 right-0 mb-1 bg-slate-800 border border-slate-600 rounded shadow-lg overflow-hidden">
        <div className="px-3 py-2 text-slate-400 text-sm">No matching commands</div>
      </div>
    );
  }

  return (
    <div className="absolute bottom-full left-0 right-0 mb-1 bg-slate-800 border border-slate-600 rounded shadow-lg overflow-hidden">
      <div ref={listRef} className="max-h-48 overflow-y-auto">
        {suggestions.map((cmd, index) => (
          <div
            key={cmd.name}
            className={`px-3 py-2 cursor-pointer flex items-center gap-3 ${
              index === selectedIndex
                ? 'bg-pink-500/20 border-l-2 border-pink-500'
                : 'hover:bg-slate-700 border-l-2 border-transparent'
            }`}
            onClick={() => onSelect(cmd.name)}
            onMouseEnter={() => onSelectedIndexChange(index)}
          >
            <span className="font-mono text-pink-400 font-medium min-w-[100px]">
              /{cmd.name}
            </span>
            <span className="text-slate-300 text-sm">{cmd.description}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
