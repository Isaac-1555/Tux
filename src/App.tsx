import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { load } from '@tauri-apps/plugin-store';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { TerminalPane } from './TerminalPane';
import { EditorPane } from './EditorPane';
import { DiffPane } from './DiffPane';
import { Sidebar } from './Sidebar';
import { KeymapSettings } from './KeymapSettings';
import { loadOverrides, saveOverrides } from './keymapStorage';
import {
  type KeymapOverride,
  effectiveKeymap,
  matchCombo,
} from './keymap';
import type { FileNode, GitFileStatus } from './types';
import './App.css';

let storeInstance: any = null;

function App() {
  const [loaded, setLoaded] = useState(false);
  const [terminals, setTerminals] = useState<{ id: string }[]>([]);
  const [activeTerminalId, setActiveTerminalId] = useState<string | null>(null);
  const [editorFile, setEditorFile] = useState<string | null>(null);

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarTab, setSidebarTab] = useState<'terminals' | 'explorer' | 'git'>('terminals');

  const [explorerTree, setExplorerTree] = useState<FileNode[]>([]);
  const [explorerRoot, setExplorerRoot] = useState<string>('/Users/user');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [gitStatus, setGitStatus] = useState<Record<string, string>>({});
  const [showHiddenFiles, setShowHiddenFiles] = useState(false);

  // Terminal metadata: { cwd, processName, gitBranch }
  const [terminalMeta, setTerminalMeta] = useState<Record<string, { cwd: string; processName: string; gitBranch: string | null }>>({});

  // Resizable split: fraction of width for the left (editor) pane
  const [splitRatio, setSplitRatio] = useState(0.5);
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const [diffFile, setDiffFile] = useState<string | null>(null);
  const isDraggingRef = useRef(false);

  const [keymapOverrides, setKeymapOverrides] = useState<KeymapOverride>({});
  const [keymapLoaded, setKeymapLoaded] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const handleSplitMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (ev: MouseEvent) => {
      if (!isDraggingRef.current || !splitContainerRef.current) return;
      const rect = splitContainerRef.current.getBoundingClientRect();
      let ratio = (ev.clientX - rect.left) / rect.width;
      ratio = Math.max(0.15, Math.min(0.85, ratio));
      setSplitRatio(ratio);
    };

    const onMouseUp = () => {
      isDraggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, []);

  // Load initial state
  useEffect(() => {
    async function loadState() {
      try {
        if (!storeInstance) {
          storeInstance = await load('workspace.json');
        }
        const savedTerminals = await storeInstance.get('terminals');
        if (savedTerminals && Array.isArray(savedTerminals) && savedTerminals.length > 0) {
          setTerminals(savedTerminals);
          setActiveTerminalId(savedTerminals[0].id);
        } else {
          const newTerm = { id: `term-${Date.now()}` };
          setTerminals([newTerm]);
          setActiveTerminalId(newTerm.id);
        }
      } catch (e) {
        console.error("Failed to load state", e);
        const newTerm = { id: `term-${Date.now()}` };
        setTerminals([newTerm]);
        setActiveTerminalId(newTerm.id);
      }

      // Load explorer tree (default /Users/user)
      try {
        const res = await invoke<FileNode[]>('read_dir', { path: '/Users/user' });
        setExplorerTree(res);
      } catch (e) {
        console.error("Failed to read dir", e);
      }

      // Load git status
      try {
        const gitRes = await invoke<GitFileStatus[]>('get_git_status', { path: '.' });
        const statusMap: Record<string, string> = {};
        for (const status of gitRes) {
          const parts = status.path.split('/');
          const name = parts[parts.length - 1];
          statusMap[name] = status.status;
        }
        setGitStatus(statusMap);
      } catch (e) {
        console.error("Failed to read git status", e);
      }

      setLoaded(true);
    }
    loadState();
  }, []);

  useEffect(() => {
    loadOverrides().then((o) => {
      setKeymapOverrides(o);
      setKeymapLoaded(true);
    }).catch(() => setKeymapLoaded(true));
  }, []);

  useEffect(() => {
    if (!keymapLoaded) return;
    saveOverrides(keymapOverrides).catch(() => {});
  }, [keymapOverrides, keymapLoaded]);

  // Listen for CWD changes + meta changes from backend
  useEffect(() => {
    if (!loaded) return;

    const unlistens: (() => void)[] = [];

    terminals.forEach((t) => {
      // CWD changed
      const u1 = listen<string>(`pty-cwd-changed-${t.id}`, (event) => {
        const newCwd = event.payload;
        setTerminalMeta((prev) => ({
          ...prev,
          [t.id]: { ...prev[t.id], cwd: newCwd, processName: prev[t.id]?.processName ?? 'shell', gitBranch: prev[t.id]?.gitBranch ?? null },
        }));
        // If this is the active terminal, update explorer root and tree
        if (t.id === activeTerminalId) {
          setExplorerRoot(newCwd);
          setExpandedFolders(new Set());
          invoke<FileNode[]>('read_dir', { path: newCwd }).then(setExplorerTree).catch(console.error);
          // Update git status for new directory
          invoke<GitFileStatus[]>('get_git_status', { path: newCwd })
            .then(gitRes => {
              const statusMap: Record<string, string> = {};
              for (const status of gitRes) {
                const parts = status.path.split('/');
                statusMap[parts[parts.length - 1]] = status.status;
              }
              setGitStatus(statusMap);
            })
            .catch(() => setGitStatus({}));
        }
      });
      unlistens.push(() => { u1.then(u => u()); });

      // Meta changed (process name, git branch)
      const u2 = listen(`pty-meta-changed-${t.id}`, async () => {
        try {
          const [name, branch] = await Promise.all([
            invoke<string>('get_pty_process_name_cmd', { id: t.id }),
            invoke<null | string>('get_pty_git_branch', { id: t.id }),
          ]);
          setTerminalMeta((prev) => ({
            ...prev,
            [t.id]: { ...prev[t.id], processName: name, gitBranch: branch, cwd: prev[t.id]?.cwd ?? '/Users/user' },
          }));
        } catch (e) {
          console.error("Failed to fetch meta for", t.id, e);
        }
      });
      unlistens.push(() => { u2.then(u => u()); });
    });

    // Initial meta fetch for existing terminals
    terminals.forEach(async (t) => {
      try {
        const [cwd, name, branch] = await Promise.all([
          invoke<string>('get_pty_cwd', { id: t.id }),
          invoke<string>('get_pty_process_name_cmd', { id: t.id }),
          invoke<null | string>('get_pty_git_branch', { id: t.id }),
        ]);
        setTerminalMeta((prev) => ({
          ...prev,
          [t.id]: { cwd, processName: name, gitBranch: branch },
        }));
        if (t.id === activeTerminalId) {
          setExplorerRoot(cwd);
          setExpandedFolders(new Set());
          invoke<FileNode[]>('read_dir', { path: cwd }).then(setExplorerTree).catch(console.error);
        }
      } catch (e) {
        console.error("Failed initial meta for", t.id, e);
      }
    });

    return () => {
      unlistens.forEach(u => u());
    };
  }, [loaded, terminals, activeTerminalId]);

  // Save terminals state
  useEffect(() => {
    if (!loaded || !storeInstance) return;
    storeInstance.set('terminals', terminals)
      .then(() => storeInstance.save())
      .catch((e: any) => console.error("Failed to save state", e));
  }, [terminals, loaded]);

  const addTerminal = () => {
    const newTerm = { id: `term-${Date.now()}` };
    setTerminals(prev => [...prev, newTerm]);
    setActiveTerminalId(newTerm.id);
  };

  // Global keyboard shortcuts - capture phase so terminal focus doesn't swallow them
  const effectiveKeyEntries = useMemo(() => effectiveKeymap(keymapOverrides), [keymapOverrides]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showSettings) return;
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      if (!(e.metaKey || e.ctrlKey)) {
        return;
      }

      for (const entry of effectiveKeyEntries) {
        if (!matchCombo(e, entry.combo)) continue;

        switch (entry.action) {
          case 'addTerminal':
            e.preventDefault();
            addTerminal();
            break;
          case 'toggleSidebar':
            e.preventDefault();
            setSidebarOpen(prev => !prev);
            break;
          case 'focusTerminalsTab':
            e.preventDefault();
            setSidebarTab('terminals');
            break;
          case 'focusExplorerTab':
            e.preventDefault();
            setSidebarTab('explorer');
            break;
          case 'focusGitTab':
            e.preventDefault();
            setSidebarTab('git');
            break;
          case 'focusTerminalN': {
            const idx = (entry.payload ?? 1) - 1;
            if (idx >= 0 && idx < terminals.length) {
              e.preventDefault();
              setActiveTerminalId(terminals[idx].id);
            }
            break;
          }
          case 'toggleDiff': {
            e.preventDefault();
            const cwd = activeTerminalId ? terminalMeta[activeTerminalId]?.cwd : null;
            if (cwd) {
              setDiffFile(prev => prev === cwd ? null : cwd);
            }
            break;
          }
        }
        e.stopPropagation();
        return;
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [effectiveKeyEntries, terminals, activeTerminalId, terminalMeta, showSettings]);

  const removeTerminal = async (id: string) => {
    try {
      await invoke('close_pty', { id });
    } catch (e) {
      console.error('Failed to close PTY:', e);
    }
    setTerminals(prev => {
      const newTerminals = prev.filter(t => t.id !== id);
      if (newTerminals.length === 0) {
        const newTerm = { id: `term-${Date.now()}` };
        setActiveTerminalId(newTerm.id);
        return [newTerm];
      }
      if (id === activeTerminalId) {
        setActiveTerminalId(newTerminals[newTerminals.length - 1].id);
      }
      return newTerminals;
    });
    // Clean up meta
    setTerminalMeta(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const openFile = (path: string) => {
    setEditorFile(path);
  };

  const closeEditor = () => {
    setEditorFile(null);
    setDiffFile(null);
  };

  const closeDiff = () => {
    setDiffFile(null);
  };

  const handleToggleFolder = async (path: string) => {
    setExpandedFolders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(path)) {
        newSet.delete(path);
      } else {
        newSet.add(path);
        invoke<FileNode[]>('read_dir', { path }).then(children => {
          setExplorerTree(prevTree => updateTreeChildren(prevTree, path, children));
        }).catch(e => console.error("Failed to load folder", e));
      }
      return newSet;
    });
  };

  // Helper to update tree children recursively
  const updateTreeChildren = (nodes: FileNode[], targetPath: string, children: FileNode[]): FileNode[] => {
    return nodes.map(node => {
      if (node.path === targetPath) {
        return { ...node, children };
      }
      if (node.children) {
        return { ...node, children: updateTreeChildren(node.children, targetPath, children) };
      }
      return node;
    });
  };

  if (!loaded) {
    return (
      <div style={{ color: '#fff', padding: '20px' }}>Loading workspace...</div>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', backgroundColor: '#1e1e1e' }}>
      {showSettings && (
        <KeymapSettings
          overrides={keymapOverrides}
          onSave={setKeymapOverrides}
          onClose={() => setShowSettings(false)}
        />
      )}
      <Sidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen(prev => !prev)}
        activeTab={sidebarTab}
        onTabChange={setSidebarTab}
        terminals={terminals}
        activeTerminalId={activeTerminalId}
        activeTerminalCwd={activeTerminalId ? terminalMeta[activeTerminalId]?.cwd ?? null : null}
        onTerminalSelect={setActiveTerminalId}
        onAddTerminal={addTerminal}
        onRemoveTerminal={removeTerminal}
        explorerTree={explorerTree}
        explorerRoot={explorerRoot}
        expandedFolders={expandedFolders}
        onToggleFolder={handleToggleFolder}
        onFileClick={openFile}
        gitStatus={gitStatus}
        terminalMeta={terminalMeta}
        showHiddenFiles={showHiddenFiles}
        onToggleHiddenFiles={() => setShowHiddenFiles(prev => !prev)}
        onOpenSettings={() => setShowSettings(true)}
      />

      {/* Main Content - unified structure to prevent terminal remounting */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <div ref={splitContainerRef} style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
          {/* Editor pane - show/hide with CSS to avoid unmounting terminals */}
          <div style={{
            width: editorFile ? (diffFile ? '50%' : `${splitRatio * 100}%`) : (diffFile ? '50%' : '0%'),
            overflow: 'hidden',
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            flexShrink: 0,
            transition: 'width 0.1s ease',
          }}>
            {editorFile ? (
              <EditorPane filePath={editorFile} onClose={closeEditor} />
            ) : diffFile ? (
              <DiffPane filePath={diffFile} onClose={closeDiff} />
            ) : null}
          </div>

          {/* Diff pane - show when both editorFile and diffFile are set */}
          {diffFile && editorFile && (
            <>
              {/* Drag handle between editor and diff */}
              <div
                onMouseDown={handleSplitMouseDown}
                style={{
                  width: '5px',
                  cursor: 'col-resize',
                  backgroundColor: '#252526',
                  flexShrink: 0,
                  position: 'relative',
                  zIndex: 10,
                }}
              >
                <div style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: '50%',
                  width: '1px',
                  backgroundColor: '#333',
                }} />
              </div>
              
              <div style={{
                width: '50%',
                overflow: 'hidden',
                minWidth: 0,
                display: 'flex',
                flexDirection: 'column',
                flexShrink: 0,
              }}>
                <DiffPane filePath={diffFile} onClose={closeDiff} />
              </div>
            </>
          )}

          {/* Drag handle - only show when editor is open and no diff */}
          {editorFile && !diffFile && (
            <div
              onMouseDown={handleSplitMouseDown}
              style={{
                width: '5px',
                cursor: 'col-resize',
                backgroundColor: '#252526',
                flexShrink: 0,
                position: 'relative',
                zIndex: 10,
              }}
            >
              <div style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: '50%',
                width: '1px',
                backgroundColor: '#333',
              }} />
            </div>
          )}

          {/* Terminal pane - always in same position in the tree */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
            {terminals.map(t => (
              <div
                key={t.id}
                style={{
                  flex: t.id === activeTerminalId ? 1 : 0,
                  display: t.id === activeTerminalId ? 'flex' : 'none',
                  flexDirection: 'column',
                  height: '100%',
                  minHeight: 0,
                  overflow: 'hidden',
                }}
              >
                <TerminalHeader id={t.id} onRemove={removeTerminal} meta={terminalMeta[t.id]} />
                <div style={{ flex: 1, position: 'relative', minHeight: 0, overflow: 'hidden' }}>
                  <TerminalPane id={t.id} isVisible={t.id === activeTerminalId} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Terminal header with contextual name
function TerminalHeader({ id, onRemove, meta }: { id: string; onRemove: (id: string) => void; meta?: { processName: string; gitBranch: string | null } }) {
  const displayName = meta ? (meta.gitBranch ? `${meta.processName} · ${meta.gitBranch}` : meta.processName) : `Terminal ${id.slice(-4)}`;

  return (
    <div style={{ height: '30px', backgroundColor: '#252526', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', padding: '0 10px', fontSize: '12px', color: '#888', gap: '8px' }}>
      <span>{displayName}</span>
      <button onClick={() => onRemove(id)} style={{ marginLeft: 'auto', cursor: 'pointer', background: 'transparent', border: 'none', color: '#888', fontSize: '14px' }}>×</button>
    </div>
  );
}

export default App;
