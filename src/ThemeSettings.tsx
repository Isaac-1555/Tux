import { useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import {
  type ThemeColors,
  type ThemeState,
  type CoreTokenKey,
  THEME_PRESETS,
  CORE_TOKEN_KEYS,
  CORE_TOKEN_LABELS,
  ANSI_TOKEN_KEYS,
  EDITOR_TOKEN_KEYS,
  CUSTOM_THEME_ID,
  DEFAULT_THEME_ID,
  resolveColors,
  cloneColors,
  normalizeHex,
  toCssHex,
  guardTheme,
} from './theme';
import { ThemePreview } from './ThemePreview';
import './ThemeSettings.css';

type Props = {
  state: ThemeState;
  onChange: (state: ThemeState) => void;
};

const ANSI_LABELS: Record<(typeof ANSI_TOKEN_KEYS)[number], string> = {
  black: 'Black',
  red: 'Red',
  green: 'Green',
  yellow: 'Yellow',
  blue: 'Blue',
  magenta: 'Magenta',
  cyan: 'Cyan',
  white: 'White',
  brightBlack: 'Bright black',
  brightRed: 'Bright red',
  brightGreen: 'Bright green',
  brightYellow: 'Bright yellow',
  brightBlue: 'Bright blue',
  brightMagenta: 'Bright magenta',
  brightCyan: 'Bright cyan',
  brightWhite: 'Bright white',
};

const EDITOR_LABELS: Record<(typeof EDITOR_TOKEN_KEYS)[number], string> = {
  editorBg: 'Background',
  editorFg: 'Foreground',
  editorSelection: 'Selection',
  editorCursor: 'Cursor',
  editorLineHighlight: 'Line highlight',
  editorComment: 'Comment',
  editorKeyword: 'Keyword',
  editorString: 'String',
  editorFunction: 'Function',
  editorNumber: 'Number',
  editorType: 'Type',
  editorOperator: 'Operator',
  editorPunctuation: 'Punctuation',
};

export function ThemeSettings({ state, onChange }: Props) {
  const colors = useMemo(() => resolveColors(state), [state]);
  const isCustom = state.activeId === CUSTOM_THEME_ID;

  function selectPreset(id: string) {
    onChange({ activeId: id, custom: state.custom });
  }

  function patchToken(key: keyof ThemeColors, value: string) {
    const base = cloneColors(colors);
    base[key] = value;
    if (key === 'bgApp') {
      base.termBg = value;
      base.editorBg = value;
    }
    if (key === 'fg') {
      base.termFg = value;
      base.editorFg = value;
    }
    if (key === 'diffAdd') base.diffAddBg = toRgba(value, 0.15) ?? base.diffAddBg;
    if (key === 'diffDel') base.diffDelBg = toRgba(value, 0.15) ?? base.diffDelBg;
    onChange({ activeId: CUSTOM_THEME_ID, custom: base });
  }

  function resetCustom() {
    onChange({ activeId: DEFAULT_THEME_ID, custom: null });
  }

  return (
    <div className="th-root">
      <div className="th-scroll">
        <div className="th-section-title">Presets</div>
        <div className="th-presets">
          {THEME_PRESETS.map((p) => {
            const active = !isCustom && state.activeId === p.id;
            return (
              <button
                key={p.id}
                type="button"
                className={`th-preset${active ? ' active' : ''}`}
                onClick={() => selectPreset(p.id)}
              >
                <ThemePreview colors={guardTheme(p.colors)} />
                <div className="th-preset-meta">
                  <span className="th-preset-name">{p.name}</span>
                  <span className="th-preset-mode">{p.mode}</span>
                </div>
              </button>
            );
          })}
          <button
            type="button"
            className={`th-preset${isCustom ? ' active' : ''}`}
            onClick={() => {
              onChange({
                activeId: CUSTOM_THEME_ID,
                custom: state.custom ?? cloneColors(colors),
              });
            }}
          >
            <ThemePreview colors={guardTheme(colors)} />
            <div className="th-preset-meta">
              <span className="th-preset-name">Custom</span>
              <span className="th-preset-mode">edit below</span>
            </div>
          </button>
        </div>

        <div className="th-section-title spaced">Custom builder</div>
        <div className="th-custom-bar">
          <span className="th-custom-hint">
            {isCustom ? 'Editing custom theme — changes apply live' : 'Tweak a color to fork into Custom'}
          </span>
          <button
            type="button"
            className="th-btn"
            disabled={!state.custom && !isCustom}
            onClick={resetCustom}
          >
            <RotateCcw size={12} />
            Reset custom
          </button>
        </div>

        <div className="th-tokens">
          {CORE_TOKEN_KEYS.map((key) => (
            <TokenRow
              key={key}
              label={CORE_TOKEN_LABELS[key as CoreTokenKey]}
              value={colors[key]}
              onChange={(v) => patchToken(key, v)}
            />
          ))}
        </div>

        <details className="th-advanced">
          <summary>Advanced — ANSI & editor syntax</summary>
          <div className="th-advanced-body">
            <div className="th-section-title">Terminal ANSI</div>
            <div className="th-tokens">
              {ANSI_TOKEN_KEYS.map((key) => (
                <TokenRow
                  key={key}
                  label={ANSI_LABELS[key]}
                  value={colors[key]}
                  onChange={(v) => patchToken(key, v)}
                />
              ))}
            </div>
            <div className="th-section-title spaced">Editor syntax</div>
            <div className="th-tokens">
              {EDITOR_TOKEN_KEYS.map((key) => (
                <TokenRow
                  key={key}
                  label={EDITOR_LABELS[key]}
                  value={colors[key]}
                  onChange={(v) => patchToken(key, v)}
                />
              ))}
            </div>
          </div>
        </details>
      </div>
    </div>
  );
}

function TokenRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const solid = value.startsWith('rgba') || value.startsWith('rgb')
    ? (rgbaToHex(value) ?? '#000000')
    : toCssHex(value);
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? solid;

  return (
    <div className="th-token">
      <span className="th-token-label" title={label}>{label}</span>
      <div className="th-token-controls">
        <input
          type="color"
          className="th-color"
          value={solid}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
        />
        <input
          type="text"
          className="th-hex"
          value={shown}
          onFocus={() => setDraft(solid)}
          onChange={(e) => {
            const v = e.target.value;
            setDraft(v);
            const n = normalizeHex(v);
            if (n) onChange(`#${n}`);
          }}
          onBlur={() => setDraft(null)}
          spellCheck={false}
        />
      </div>
    </div>
  );
}

function rgbaToHex(rgba: string): string | null {
  const m = rgba.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (!m) return null;
  const r = Number(m[1]).toString(16).padStart(2, '0');
  const g = Number(m[2]).toString(16).padStart(2, '0');
  const b = Number(m[3]).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

function toRgba(hex: string, alpha: number): string | null {
  const n = normalizeHex(hex);
  if (!n) return null;
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
