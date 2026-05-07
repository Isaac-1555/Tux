import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface DiffPaneProps {
  filePath: string;
  onClose: () => void;
}

export function DiffPane({ filePath, onClose }: DiffPaneProps) {
  const [diffText, setDiffText] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadDiff() {
      try {
        setLoading(true);
        setError(null);

        const pathParts = filePath.split('/');
        const lastPart = pathParts[pathParts.length - 1];
        const hasFileExtension = lastPart.includes('.') && !lastPart.startsWith('.');
        const isDirectoryDiffCase = filePath === 'cwd' || !hasFileExtension;
        
        const diffPath = isDirectoryDiffCase ? (filePath === 'cwd' ? '.' : filePath) : filePath;
        const diffContent = await invoke<string>('get_git_diff', { path: diffPath });
        
        if (!diffContent || diffContent.trim() === '') {
          setError('No changes in this directory');
          setLoading(false);
          return;
        }

        setDiffText(diffContent);
      } catch (e) {
        console.error("Failed to load diff", e);
        setError(String(e));
      }
      setLoading(false);
    }
    loadDiff();
  }, [filePath]);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#1e1e1e' }}>
        <div style={{ height: '30px', backgroundColor: '#252526', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', padding: '0 10px', fontSize: '12px', color: '#888' }}>
          <span style={{ flex: 1 }}>Git Changes</span>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#888', cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ padding: '20px', color: '#888' }}>Loading diff...</div>
      </div>
    );
  }

  if (error || !diffText) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#1e1e1e' }}>
        <div style={{ height: '30px', backgroundColor: '#252526', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', padding: '0 10px', fontSize: '12px', color: '#888' }}>
          <span style={{ flex: 1 }}>Git Changes</span>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#888', cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ padding: '20px', color: '#888' }}>
          {error || 'No changes or not a git repository'}
        </div>
      </div>
    );
  }

  const lines = diffText.split('\n');
  const fileCount = (diffText.match(/^diff --git/g) || []).length || 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#1e1e1e' }}>
      <div style={{ height: '30px', backgroundColor: '#252526', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', padding: '0 10px', fontSize: '12px', color: '#888' }}>
        <span style={{ flex: 1 }}>Git Changes ({fileCount} {fileCount === 1 ? 'file' : 'files'})</span>
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#888', cursor: 'pointer' }}>×</button>
      </div>
      <div style={{ flex: 1, overflow: 'auto', backgroundColor: '#1e1e1e', fontFamily: 'ui-monospace, Consolas, monospace', fontSize: '12px' }}>
        {lines.map((line, i) => {
          const isAdd = line.startsWith('+') && !line.startsWith('+++');
          const isDel = line.startsWith('-') && !line.startsWith('---');
          const isHeader = line.startsWith('@@') || line.startsWith('diff ') || line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++');
          
          return (
            <div
              key={i}
              style={{
                display: 'flex',
                backgroundColor: isAdd ? 'rgba(46, 160, 67, 0.15)' : isDel ? 'rgba(248, 81, 73, 0.15)' : 'transparent',
                color: isAdd ? '#2ea043' : isDel ? '#f85149' : isHeader ? '#7ee787' : '#d4d4d4',
                lineHeight: 1.5,
                minHeight: '20px',
              }}
            >
              <span style={{ width: '20px', textAlign: 'center', flexShrink: 0, userSelect: 'none', opacity: 0.5 }}>
                {line.charAt(0) || ' '}
              </span>
              <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', paddingRight: '10px' }}>
                {line.slice(1)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}