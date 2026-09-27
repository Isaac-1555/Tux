import { Monitor, Folder, GitBranch, Menu, Eye, EyeOff, X, Plus, Settings, RefreshCw } from 'lucide-react';
import { FileTree } from './FileTree';
import { GitViewer } from './GitViewer';
import type { FileNode, TerminalMeta } from './types';

interface SidebarProps {
  open: boolean;
  onToggle: () => void;
  activeTab: 'terminals' | 'explorer' | 'git';
  onTabChange: (tab: 'terminals' | 'explorer' | 'git') => void;
  terminals: { id: string }[];
  activeTerminalId: string | null;
  activeTerminalCwd: string | null;
  onTerminalSelect: (id: string) => void;
  onAddTerminal: () => void;
  onAddTerminalInCwd: (cwd?: string) => void;
  onRemoveTerminal: (id: string) => void;
  explorerTree: FileNode[];
  explorerRoot: string;
  expandedFolders: Set<string>;
  onToggleFolder: (path: string) => void;
  onFileClick: (path: string) => void;
  gitStatus: Record<string, string>;
  terminalMeta: Record<string, TerminalMeta>;
  showHiddenFiles: boolean;
  onToggleHiddenFiles: () => void;
  onRefreshExplorer: () => void;
  onOpenSettings?: () => void;
}

export function Sidebar({
  open,
  onToggle,
  activeTab,
  onTabChange,
  terminals,
  activeTerminalId,
  activeTerminalCwd,
  onTerminalSelect,
  onAddTerminal,
  onAddTerminalInCwd,
  onRemoveTerminal,
  explorerTree,
  explorerRoot,
  expandedFolders,
  onToggleFolder,
  onFileClick,
  gitStatus,
  terminalMeta,
  showHiddenFiles,
  onToggleHiddenFiles,
  onRefreshExplorer,
  onOpenSettings,
}: SidebarProps) {
  const getTerminalDisplayName = (id: string, index: number): string => {
    const meta = terminalMeta[id];
    if (meta?.currentCommand) {
      const truncated = meta.currentCommand.length > 40
        ? meta.currentCommand.slice(0, 40) + '…'
        : meta.currentCommand;
      return meta.gitBranch ? `${truncated} · ${meta.gitBranch}` : truncated;
    }
    if (meta) {
      return meta.gitBranch ? `${meta.processName} · ${meta.gitBranch}` : meta.processName;
    }
    return `Terminal ${index + 1}`;
  };

  if (!open) {
    return (
      <div style={{ width: '40px', backgroundColor: 'var(--bg-sidebar)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '8px', gap: '4px' }}>
        <button onClick={onToggle} style={{ background: 'transparent', border: 'none', color: 'var(--fg-muted)', cursor: 'pointer', padding: '8px' }}>
          <Menu size={18} />
        </button>
        {onOpenSettings && (
          <button onClick={onOpenSettings} title="Settings" style={{ background: 'transparent', border: 'none', color: 'var(--fg-muted)', cursor: 'pointer', padding: '8px' }}>
            <Settings size={18} />
          </button>
        )}
      </div>
    );
  }

  return (
    <div style={{ width: '250px', backgroundColor: 'var(--bg-sidebar)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '12px 12px 8px 12px', color: 'var(--fg-bright)', borderBottom: '1px solid var(--border)' }}>
        <span style={{ display: 'flex', alignItems: 'center', flex: 1, fontWeight: 'bold', fontFamily: '"JetBrains Mono", "SF Mono", Menlo, Monaco, monospace', fontSize: '15px', letterSpacing: '0.5px' }}>
          Tux
        </span>
        {onOpenSettings && (
          <button onClick={onOpenSettings} title="Settings" style={{ background: 'transparent', border: 'none', color: 'var(--fg-muted)', cursor: 'pointer', padding: '4px', display: 'inline-flex', alignItems: 'center' }}>
            <Settings size={16} />
          </button>
        )}
        <button onClick={onToggle} style={{ background: 'transparent', border: 'none', color: 'var(--fg-muted)', cursor: 'pointer', padding: '4px', display: 'inline-flex', alignItems: 'center' }}>
          <Menu size={16} />
        </button>
      </div>

      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
        {[
          { key: 'terminals', icon: Monitor, label: 'Terminals' },
          { key: 'explorer', icon: Folder, label: 'Explorer' },
          { key: 'git', icon: GitBranch, label: 'Git' },
        ].map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            onClick={() => onTabChange(key as 'terminals' | 'explorer' | 'git')}
            style={{
              flex: 1,
              padding: '10px 0',
              background: activeTab === key ? 'var(--bg-elevated)' : 'transparent',
              border: 'none',
              borderBottom: activeTab === key ? '2px solid var(--accent)' : '2px solid transparent',
              color: activeTab === key ? 'var(--fg-bright)' : 'var(--fg-muted)',
              cursor: 'pointer',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
            }}
            title={label}
          >
            <Icon size={18} />
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        {activeTab === 'terminals' && (
          <div style={{ padding: '10px' }}>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--fg-dim)', marginBottom: '8px', letterSpacing: '0.5px' }}>Sessions</div>
            {terminals.map((t, idx) => (
              <div
                key={t.id}
                onClick={() => onTerminalSelect(t.id)}
                style={{
                  padding: '8px 10px',
                  marginBottom: '4px',
                  borderRadius: '4px',
                  backgroundColor: t.id === activeTerminalId ? 'var(--accent)' : 'var(--bg-elevated)',
                  color: t.id === activeTerminalId ? 'var(--on-accent)' : 'var(--fg)',
                  fontSize: '13px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                  <Monitor size={14} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {getTerminalDisplayName(t.id, idx)}
                  </span>
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); onAddTerminalInCwd(terminalMeta[t.id]?.cwd); }}
                    title="New terminal in this directory"
                    style={{ background: 'transparent', border: 'none', color: t.id === activeTerminalId ? 'var(--on-accent)' : 'var(--fg-muted)', cursor: 'pointer', padding: '2px', display: 'flex', borderRadius: '2px' }}
                  >
                    <Plus size={14} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onRemoveTerminal(t.id); }}
                    style={{ background: 'transparent', border: 'none', color: t.id === activeTerminalId ? 'var(--on-accent)' : 'var(--fg-muted)', cursor: 'pointer', padding: '2px', display: 'flex', borderRadius: '2px' }}
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            ))}
            <button
              onClick={onAddTerminal}
              style={{ marginTop: '10px', width: '100%', background: 'transparent', color: 'var(--fg-muted)', border: '1px dashed var(--fg-faint)', padding: '6px', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}
            >
              + New Terminal
            </button>
          </div>
        )}

        {activeTab === 'explorer' && (
          <div style={{ padding: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--fg-dim)', letterSpacing: '0.5px' }}>Explorer</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                <button
                  onClick={onRefreshExplorer}
                  style={{ background: 'transparent', border: 'none', color: 'var(--fg-dim)', cursor: 'pointer', padding: '2px' }}
                  title="Refresh"
                >
                  <RefreshCw size={14} />
                </button>
                <button
                  onClick={onToggleHiddenFiles}
                  style={{ background: 'transparent', border: 'none', color: showHiddenFiles ? 'var(--accent)' : 'var(--fg-dim)', cursor: 'pointer', padding: '2px' }}
                  title={showHiddenFiles ? 'Hide hidden files' : 'Show hidden files'}
                >
                  {showHiddenFiles ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>
              </div>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--fg-muted)', marginBottom: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={explorerRoot}>
              {explorerRoot.split('/').pop() || explorerRoot}
              <span style={{ color: 'var(--fg-faint)', marginLeft: '4px' }}>{explorerRoot}</span>
            </div>
            <FileTree
              nodes={explorerTree}
              expandedFolders={expandedFolders}
              onToggle={onToggleFolder}
              onFileClick={onFileClick}
              gitStatus={gitStatus}
              showHiddenFiles={showHiddenFiles}
            />
          </div>
        )}

        {activeTab === 'git' && (
          <GitViewer path={activeTerminalCwd || "."} />
        )}
      </div>
    </div>
  );
}
