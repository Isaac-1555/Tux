import { useState, useEffect } from 'react';
import { load } from '@tauri-apps/plugin-store';
import { invoke } from '@tauri-apps/api/core';
import { TerminalPane } from './TerminalPane';
import { EditorPane } from './EditorPane';
import { Sidebar } from './Sidebar';
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
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [gitStatus, setGitStatus] = useState<Record<string, string>>({});

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

      // Load explorer tree (root level)
      try {
        const res = await invoke<FileNode[]>('read_dir', { path: '.' });
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

  const removeTerminal = (id: string) => {
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
  };

  const openFile = (path: string) => {
    setEditorFile(path);
  };

  const closeEditor = () => {
    setEditorFile(null);
  };

  const handleToggleFolder = async (path: string) => {
    setExpandedFolders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(path)) {
        newSet.delete(path);
      } else {
        newSet.add(path);
        // Lazy load children
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

  if (!loaded) return <div style={{ color: '#fff', padding: '20px' }}>Loading workspace...</div>;

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', backgroundColor: '#1e1e1e' }}>
      <Sidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen(prev => !prev)}
        activeTab={sidebarTab}
        onTabChange={setSidebarTab}
        terminals={terminals}
        activeTerminalId={activeTerminalId}
        onTerminalSelect={setActiveTerminalId}
        onAddTerminal={addTerminal}
        explorerTree={explorerTree}
        expandedFolders={expandedFolders}
        onToggleFolder={handleToggleFolder}
        onFileClick={openFile}
        gitStatus={gitStatus}
      />

      {/* Main Content */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {editorFile ? (
          <EditorPane
            filePath={editorFile}
            onClose={closeEditor}
          />
        ) : (
          <div style={{ display: 'flex', height: '100%' }}>
            {terminals.map(t => (
              <div
                key={t.id}
                style={{
                  flex: t.id === activeTerminalId ? 1 : 0,
                  display: t.id === activeTerminalId ? 'flex' : 'none',
                  flexDirection: 'column',
                  height: '100%',
                  borderRight: '1px solid #333',
                }}
              >
                <div style={{ height: '30px', backgroundColor: '#252526', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', padding: '0 10px', fontSize: '12px', color: '#888', gap: '8px' }}>
                  <span>Terminal {t.id.slice(-4)}</span>
                  {terminals.length > 1 && (
                    <span onClick={() => removeTerminal(t.id)} style={{ marginLeft: 'auto', cursor: 'pointer', color: '#888' }}>×</span>
                  )}
                </div>
                <div style={{ flex: 1, position: 'relative' }}>
                  <TerminalPane id={t.id} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
