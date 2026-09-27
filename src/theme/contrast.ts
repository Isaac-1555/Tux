import type { ThemeColors } from './types';
import { withAlpha } from './utils';

type Rgb = { r: number; g: number; b: number };

/** Parse #rgb / #rrggbb / #rrggbbaa or rgb()/rgba() into 0-255 channels. */
export function parseRgb(input: string): Rgb | null {
  const s = input.trim().toLowerCase();
  const hex = s.replace(/^#/, '');
  if (/^[0-9a-f]{3,4}$/.test(hex)) {
    return {
      r: parseInt(hex[0] + hex[0], 16),
      g: parseInt(hex[1] + hex[1], 16),
      b: parseInt(hex[2] + hex[2], 16),
    };
  }
  if (/^[0-9a-f]{6,8}$/.test(hex)) {
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
    };
  }
  const m = s.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (m) {
    return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
  }
  return null;
}

export function toHex({ r, g, b }: Rgb): string {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

export function relativeLuminance(rgb: Rgb): number {
  const chan = (v: number) => {
    const n = v / 255;
    return n <= 0.03928 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * chan(rgb.r) + 0.7152 * chan(rgb.g) + 0.0722 * chan(rgb.b);
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

function rgbToHsl({ r, g, b }: Rgb): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return { h: h / 6, s, l };
}

function hueToRgb(p: number, q: number, t: number): number {
  let tt = t;
  if (tt < 0) tt += 1;
  if (tt > 1) tt -= 1;
  if (tt < 1 / 6) return p + (q - p) * 6 * tt;
  if (tt < 1 / 2) return q;
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
  return p;
}

function hslToRgb({ h, s, l }: { h: number; s: number; l: number }): Rgb {
  if (s === 0) {
    const v = l * 255;
    return { r: v, g: v, b: v };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: hueToRgb(p, q, h + 1 / 3) * 255,
    g: hueToRgb(p, q, h) * 255,
    b: hueToRgb(p, q, h - 1 / 3) * 255,
  };
}

/**
 * Return a color at least `min` contrast-ratio from `bg`, preserving `fg` hue
 * and saturation and only shifting lightness. Returns `fg` unchanged when it
 * already passes or cannot be parsed.
 */
export function ensureContrast(fg: string, bg: string, min = 4.5): string {
  const f = parseRgb(fg);
  const b = parseRgb(bg);
  if (!f || !b) return fg;
  if (contrastRatio(f, b) >= min) return fg;

  const black: Rgb = { r: 0, g: 0, b: 0 };
  const white: Rgb = { r: 255, g: 255, b: 255 };
  const target = contrastRatio(black, b) >= contrastRatio(white, b) ? 0 : 1;
  const { h, s, l } = rgbToHsl(f);
  // Overshoot the goal slightly: hex quantization can otherwise land just
  // under `min` after rounding.
  const goal = min + 0.1;

  let best = f;
  let bestRatio = contrastRatio(f, b);
  for (let i = 1; i <= 100; i++) {
    const cand = hslToRgb({ h, s, l: l + (target - l) * (i / 100) });
    const ratio = contrastRatio(cand, b);
    if (ratio > bestRatio) {
      bestRatio = ratio;
      best = cand;
    }
    if (ratio >= goal) return toHex(cand);
  }
  return toHex(best);
}

const TEXT_ON_BGAPP = ['fg', 'fgBright', 'fgMuted', 'fgDim'] as const;
const ICON_ON_BGAPP = ['fgFaint', 'folder'] as const;
const SEMANTIC_ON_BGAPP = [
  'gitAdd',
  'gitMod',
  'gitDel',
  'diffAdd',
  'diffDel',
  'warn',
  'running',
] as const;
const EDITOR_ON_EDITORBG = [
  'editorFg',
  'editorComment',
  'editorKeyword',
  'editorString',
  'editorFunction',
  'editorNumber',
  'editorType',
  'editorOperator',
  'editorPunctuation',
] as const;

/**
 * Return a copy of `colors` with UI text/semantic tokens raised to a minimum
 * contrast ratio against their surface. Terminal palette (ANSI, term*, bg*,
 * border*, accent*, danger*) is left untouched for fidelity.
 */
export function guardTheme(colors: ThemeColors): ThemeColors {
  const out: ThemeColors = { ...colors };
  const bgApp = colors.bgApp;
  const editorBg = colors.editorBg;

  for (const key of TEXT_ON_BGAPP) out[key] = ensureContrast(colors[key], bgApp, 4.5);
  for (const key of ICON_ON_BGAPP) out[key] = ensureContrast(colors[key], bgApp, 3);
  for (const key of SEMANTIC_ON_BGAPP) out[key] = ensureContrast(colors[key], bgApp, 4.5);
  for (const key of EDITOR_ON_EDITORBG) out[key] = ensureContrast(colors[key], editorBg, 4.5);

  out.diffAddBg = withAlpha(out.diffAdd, 0.15);
  out.diffDelBg = withAlpha(out.diffDel, 0.15);

  return out;
}

/** Foreground tokens derived from accent/danger backgrounds (not palette fields). */
export function deriveUiColors(colors: ThemeColors): {
  onAccent: string;
  onDanger: string;
  accentText: string;
} {
  return {
    onAccent: ensureContrast('#ffffff', colors.accent, 4.5),
    onDanger: ensureContrast('#ffffff', colors.danger, 4.5),
    accentText: ensureContrast(colors.accent, colors.bgApp, 4.5),
  };
}
