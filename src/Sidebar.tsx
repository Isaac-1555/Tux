
import { Monitor, Folder, GitBranch, Menu } from 'lucide-react';
import { FileTree } from './FileTree';
import { GitViewer } from './GitViewer';
import type { FileNode } from './types';

interface SidebarProps {
  open: boolean;
  onToggle: () => void;
  activeTab: 'terminals' | 'explorer' | 'git';
  onTabChange: (tab: 'terminals' | 'explorer' | 'git') => void;
  terminals: { id: string }[];
  activeTerminalId: string | null;
  onTerminalSelect: (id: string) => void;
  onAddTerminal: () => void;
  explorerTree: FileNode[];
  expandedFolders: Set<string>;
  onToggleFolder: (path: string) => void;
  onFileClick: (path: string) => void;
  gitStatus: Record<string, string>;
}

export function Sidebar({
  open,
  onToggle,
  activeTab,
  onTabChange,
  terminals,
  activeTerminalId,
  onTerminalSelect,
  onAddTerminal,
  explorerTree,
  expandedFolders,
  onToggleFolder,
  onFileClick,
  gitStatus,
}: SidebarProps) {
  if (!open) {
    return (
      <div style={{ width: '40px', backgroundColor: '#181818', borderRight: '1px solid #333', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '8px' }}>
        <button onClick={onToggle} style={{ background: 'transparent', border: 'none', color: '#888', cursor: 'pointer', padding: '8px' }}>
          <Menu size={18} />
        </button>
      </div>
    );
  }

  return (
    <div style={{ width: '250px', backgroundColor: '#181818', borderRight: '1px solid #333', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header with toggle */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '12px 12px 8px 12px', color: '#fff', borderBottom: '1px solid #333' }}>
        <span style={{ fontWeight: 'bold', flex: 1 }}>Lite-Mux</span>
        <button onClick={onToggle} style={{ background: 'transparent', border: 'none', color: '#888', cursor: 'pointer', padding: '4px' }}>
          <Menu size={16} />
        </button>
      </div>

      {/* Tab icons */}
      <div style={{ display: 'flex', borderBottom: '1px solid #333' }}>
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
              background: activeTab === key ? '#2a2a2a' : 'transparent',
              border: 'none',
              borderBottom: activeTab === key ? '2px solid #5865f2' : '2px solid transparent',
              color: activeTab === key ? '#fff' : '#888',
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

      {/* Tab content */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        {activeTab === 'terminals' && (
          <div style={{ padding: '10px' }}>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#666', marginBottom: '8px', letterSpacing: '0.5px' }}>Sessions</div>
            {terminals.map(t => (
              <div
                key={t.id}
                onClick={() => onTerminalSelect(t.id)}
                style={{
                  padding: '8px 10px',
                  marginBottom: '4px',
                  borderRadius: '4px',
                  backgroundColor: t.id === activeTerminalId ? '#5865f2' : '#2a2a2a',
                  color: '#ccc',
                  fontSize: '13px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <Monitor size={14} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  Terminal {t.id.slice(-4)}
                </span>
              </div>
            ))}
            <button
              onClick={onAddTerminal}
              style={{ marginTop: '10px', width: '100%', background: 'transparent', color: '#aaa', border: '1px dashed #555', padding: '6px', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}
            >
              + New Terminal
            </button>
          </div>
        )}

        {activeTab === 'explorer' && (
          <div style={{ padding: '10px' }}>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#666', marginBottom: '8px', letterSpacing: '0.5px' }}>Explorer</div>
            <FileTree
              nodes={explorerTree}
              expandedFolders={expandedFolders}
              onToggle={onToggleFolder}
              onFileClick={onFileClick}
              gitStatus={gitStatus}
            />
          </div>
        )}

        {activeTab === 'git' && (
          <GitViewer path="." />
        )}
      </div>
    </div>
  );
}
