export type KeyCombo = {
  key: string;
  mod: boolean;
  shift: boolean;
  alt: boolean;
};

export type KeymapAction =
  | 'addTerminal'
  | 'focusTerminalsTab'
  | 'focusExplorerTab'
  | 'focusGitTab'
  | 'focusTerminalN'
  | 'toggleSidebar'
  | 'toggleDiff';

export type KeymapCategory = 'Terminals' | 'Sidebar' | 'Editor';

export type KeymapEntry = {
  id: string;
  action: KeymapAction;
  payload?: number;
  combo: KeyCombo;
  description: string;
  category: KeymapCategory;
};

export type KeymapOverride = Record<string, KeyCombo>;

const MAC = (() => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /Mac|iPhone|iPad|iPod/i.test(ua);
})();

export function isMacOS(): boolean {
  return MAC;
}

const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta']);

export function comboFromEvent(e: KeyboardEvent): KeyCombo | null {
  if (MODIFIER_KEYS.has(e.key)) return null;
  let key = e.key;
  if (key.length === 1) key = key.toLowerCase();
  return {
    key,
    mod: e.metaKey || e.ctrlKey,
    shift: e.shiftKey,
    alt: e.altKey,
  };
}

export function combosEqual(a: KeyCombo, b: KeyCombo): boolean {
  return a.key === b.key && a.mod === b.mod && a.shift === b.shift && a.alt === b.alt;
}

export function matchCombo(e: KeyboardEvent, combo: KeyCombo): boolean {
  if ((e.metaKey || e.ctrlKey) !== combo.mod) return false;
  if (e.shiftKey !== combo.shift) return false;
  if (e.altKey !== combo.alt) return false;
  let key = e.key;
  if (key.length === 1) key = key.toLowerCase();
  return key === combo.key;
}

export function formatCombo(combo: KeyCombo, isMac: boolean): string {
  const parts: string[] = [];
  if (combo.mod) parts.push(isMac ? '⌘' : 'Ctrl');
  if (combo.shift) parts.push(isMac ? '⇧' : 'Shift');
  if (combo.alt) parts.push(isMac ? '⌥' : 'Alt');
  let key = combo.key;
  if (key.length === 1) key = key.toUpperCase();
  else if (key === 'Enter') key = '↵';
  else if (key === 'Escape') key = 'Esc';
  else if (key === 'ArrowUp') key = '↑';
  else if (key === 'ArrowDown') key = '↓';
  else if (key === 'ArrowLeft') key = '←';
  else if (key === 'ArrowRight') key = '→';
  else if (key === 'Backspace') key = '⌫';
  else if (key === 'Delete') key = '⌦';
  else if (key === 'Tab') key = '⇥';
  else if (key === ' ') key = 'Space';
  parts.push(key);
  const sep = isMac ? '' : '+';
  return parts.join(sep);
}

export const DEFAULT_KEYMAP: KeymapEntry[] = [
  {
    id: 'addTerminal',
    action: 'addTerminal',
    combo: { key: 't', mod: true, shift: false, alt: false },
    description: 'New terminal',
    category: 'Terminals',
  },
  {
    id: 'focusTerminalN.1',
    action: 'focusTerminalN',
    payload: 1,
    combo: { key: '1', mod: true, shift: false, alt: false },
    description: 'Focus terminal 1',
    category: 'Terminals',
  },
  {
    id: 'focusTerminalN.2',
    action: 'focusTerminalN',
    payload: 2,
    combo: { key: '2', mod: true, shift: false, alt: false },
    description: 'Focus terminal 2',
    category: 'Terminals',
  },
  {
    id: 'focusTerminalN.3',
    action: 'focusTerminalN',
    payload: 3,
    combo: { key: '3', mod: true, shift: false, alt: false },
    description: 'Focus terminal 3',
    category: 'Terminals',
  },
  {
    id: 'focusTerminalsTab',
    action: 'focusTerminalsTab',
    combo: { key: 't', mod: true, shift: true, alt: false },
    description: 'Show Terminals tab',
    category: 'Sidebar',
  },
  {
    id: 'focusExplorerTab',
    action: 'focusExplorerTab',
    combo: { key: 'e', mod: true, shift: true, alt: false },
    description: 'Show Explorer tab',
    category: 'Sidebar',
  },
  {
    id: 'focusGitTab',
    action: 'focusGitTab',
    combo: { key: 'e', mod: true, shift: false, alt: false },
    description: 'Show Git tab',
    category: 'Sidebar',
  },
  {
    id: 'toggleSidebar',
    action: 'toggleSidebar',
    combo: { key: 'b', mod: true, shift: false, alt: false },
    description: 'Toggle sidebar',
    category: 'Sidebar',
  },
  {
    id: 'toggleDiff',
    action: 'toggleDiff',
    combo: { key: 'd', mod: true, shift: false, alt: false },
    description: 'Toggle diff pane',
    category: 'Editor',
  },
];

export function effectiveKeymap(overrides: KeymapOverride): KeymapEntry[] {
  return DEFAULT_KEYMAP.map((entry) => {
    const ov = overrides[entry.id];
    return ov ? { ...entry, combo: ov } : entry;
  });
}

export function findConflict(
  combo: KeyCombo,
  excludeId: string,
  entries: KeymapEntry[],
): KeymapEntry | null {
  for (const entry of entries) {
    if (entry.id === excludeId) continue;
    if (combosEqual(entry.combo, combo)) return entry;
  }
  return null;
}
