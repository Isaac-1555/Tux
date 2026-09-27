import type { ThemeColors } from './theme';
import { deriveUiColors } from './theme';

type Props = {
  colors: ThemeColors;
};

export function ThemePreview({ colors }: Props) {
  const { onAccent } = deriveUiColors(colors);
  const dot = (c: string) => (
    <span style={{ width: 4, height: 4, borderRadius: '50%', background: c, display: 'inline-block' }} />
  );
  const bar = (c: string, w: string) => (
    <span style={{ height: 4, width: w, borderRadius: 2, background: c, display: 'block' }} />
  );

  return (
    <div
      className="th-preview"
      style={{ background: colors.bgApp, borderColor: colors.border }}
      aria-hidden
    >
      <div style={{ width: 38, background: colors.bgSidebar, display: 'flex', flexDirection: 'column', gap: 4, padding: 5 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 3, color: colors.fgBright, fontSize: 7, fontWeight: 700, fontFamily: 'ui-monospace, monospace' }}>
          Tux
        </div>
        <div style={{ height: 11, borderRadius: 2, background: colors.accent, color: onAccent, fontSize: 7, display: 'flex', alignItems: 'center', paddingLeft: 3, fontFamily: 'ui-monospace, monospace' }}>
          Aa
        </div>
        {bar(colors.fgDim, '70%')}
        {bar(colors.fgDim, '52%')}
        <div style={{ marginTop: 'auto', display: 'flex', gap: 3 }}>
          {bar(colors.gitAdd, '6px')}
          {bar(colors.gitMod, '6px')}
          {bar(colors.gitDel, '6px')}
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ height: 13, background: colors.bgHeader, display: 'flex', alignItems: 'center', gap: 3, padding: '0 5px', borderBottom: `1px solid ${colors.border}` }}>
          {dot(colors.red)}
          {dot(colors.yellow)}
          {dot(colors.green)}
          <span style={{ marginLeft: 'auto', fontSize: 6, color: colors.fgMuted, fontFamily: 'ui-monospace, monospace' }}>~/tux</span>
        </div>

        <div style={{ height: 30, background: colors.termBg, padding: '4px 5px', display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ fontSize: 7, fontFamily: 'ui-monospace, monospace', color: colors.green }}>{'>'} npm run dev</span>
          {bar(colors.termFg, '78%')}
          {bar(colors.fgMuted, '46%')}
        </div>

        <div style={{ flex: 1, background: colors.editorBg, padding: '4px 5px', display: 'flex', flexDirection: 'column', gap: 3 }}>
          {bar(colors.editorComment, '40%')}
          {bar(colors.editorKeyword, '62%')}
          {bar(colors.editorString, '50%')}
          {bar(colors.editorFunction, '72%')}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 1 }}>
            <span style={{ fontSize: 7, color: colors.editorFg, fontFamily: 'ui-monospace, monospace' }}>Aa</span>
            {bar(colors.editorNumber, '18%')}
            {bar(colors.warn, '12%')}
            {bar(colors.diffAdd, '12%')}
            {bar(colors.diffDel, '12%')}
          </div>
        </div>
      </div>
    </div>
  );
}
