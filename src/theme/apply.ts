import type { ThemeColors } from './types';
import { withAlpha } from './utils';
import { deriveUiColors } from './contrast';

const VAR_MAP: Record<keyof ThemeColors, string> = {
  bgApp: '--bg-app',
  bgSidebar: '--bg-sidebar',
  bgHeader: '--bg-header',
  bgElevated: '--bg-elevated',
  bgHover: '--bg-hover',
  border: '--border',
  borderStrong: '--border-strong',
  fg: '--fg',
  fgMuted: '--fg-muted',
  fgDim: '--fg-dim',
  fgFaint: '--fg-faint',
  fgBright: '--fg-bright',
  accent: '--accent',
  accentHover: '--accent-hover',
  danger: '--danger',
  dangerHover: '--danger-hover',
  warn: '--warn',
  running: '--running',
  gitAdd: '--git-add',
  gitMod: '--git-mod',
  gitDel: '--git-del',
  folder: '--folder',
  diffAdd: '--diff-add',
  diffAddBg: '--diff-add-bg',
  diffDel: '--diff-del',
  diffDelBg: '--diff-del-bg',
  diffHeader: '--diff-header',
  termBg: '--term-bg',
  termFg: '--term-fg',
  termCursor: '--term-cursor',
  termCursorAccent: '--term-cursor-accent',
  termSelection: '--term-selection',
  black: '--ansi-black',
  red: '--ansi-red',
  green: '--ansi-green',
  yellow: '--ansi-yellow',
  blue: '--ansi-blue',
  magenta: '--ansi-magenta',
  cyan: '--ansi-cyan',
  white: '--ansi-white',
  brightBlack: '--ansi-bright-black',
  brightRed: '--ansi-bright-red',
  brightGreen: '--ansi-bright-green',
  brightYellow: '--ansi-bright-yellow',
  brightBlue: '--ansi-bright-blue',
  brightMagenta: '--ansi-bright-magenta',
  brightCyan: '--ansi-bright-cyan',
  brightWhite: '--ansi-bright-white',
  editorBg: '--editor-bg',
  editorFg: '--editor-fg',
  editorSelection: '--editor-selection',
  editorCursor: '--editor-cursor',
  editorLineHighlight: '--editor-line-highlight',
  editorComment: '--editor-comment',
  editorKeyword: '--editor-keyword',
  editorString: '--editor-string',
  editorFunction: '--editor-function',
  editorNumber: '--editor-number',
  editorType: '--editor-type',
  editorOperator: '--editor-operator',
  editorPunctuation: '--editor-punctuation',
};

export function applyTheme(colors: ThemeColors): void {
  const root = document.documentElement;
  for (const [key, cssVar] of Object.entries(VAR_MAP) as [keyof ThemeColors, string][]) {
    root.style.setProperty(cssVar, colors[key]);
  }

  // Legibility-derived foregrounds for text/icons sitting on accent or danger.
  const derived = deriveUiColors(colors);
  root.style.setProperty('--on-accent', derived.onAccent);
  root.style.setProperty('--on-danger', derived.onDanger);
  root.style.setProperty('--accent-text', derived.accentText);

  // Bridge existing --diff-* library vars
  root.style.setProperty('--diff-background-color', colors.bgApp);
  root.style.setProperty('--diff-text-color', colors.fg);
  root.style.setProperty('--diff-selection-background-color', withAlpha(colors.accent, 0.25));
  root.style.setProperty('--diff-selection-text-color', colors.fg);
  root.style.setProperty('--diff-gutter-insert-background-color', withAlpha(colors.diffAdd, 0.2));
  root.style.setProperty('--diff-gutter-insert-text-color', colors.diffAdd);
  root.style.setProperty('--diff-gutter-delete-background-color', withAlpha(colors.diffDel, 0.2));
  root.style.setProperty('--diff-gutter-delete-text-color', colors.diffDel);
  root.style.setProperty('--diff-gutter-selected-background-color', withAlpha(colors.accent, 0.15));
  root.style.setProperty('--diff-gutter-selected-text-color', colors.fg);
  root.style.setProperty('--diff-code-insert-background-color', colors.diffAddBg);
  root.style.setProperty('--diff-code-insert-text-color', colors.diffAdd);
  root.style.setProperty('--diff-code-delete-background-color', colors.diffDelBg);
  root.style.setProperty('--diff-code-delete-text-color', colors.diffDel);
  root.style.setProperty('--diff-code-insert-edit-background-color', withAlpha(colors.diffAdd, 0.4));
  root.style.setProperty('--diff-code-insert-edit-text-color', colors.diffAdd);
  root.style.setProperty('--diff-code-delete-edit-background-color', withAlpha(colors.diffDel, 0.4));
  root.style.setProperty('--diff-code-delete-edit-text-color', colors.diffDel);
  root.style.setProperty('--diff-code-selected-background-color', withAlpha(colors.accent, 0.15));
  root.style.setProperty('--diff-code-selected-text-color', colors.fg);
  root.style.setProperty('--diff-omit-gutter-line-color', colors.diffDel);

  root.style.colorScheme = colors.bgApp.toLowerCase() === '#ffffff' ||
    parseInt(colors.bgApp.replace('#', '').slice(0, 2) || '1e', 16) > 0xaa
    ? 'light'
    : 'dark';
}
