import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { GitCommit, GitBranch, GitFileStatus } from './types';
import { GitBranch as GitBranchIcon, GitCommit as GitCommitIcon, Check, AlertCircle, RefreshCw } from 'lucide-react';

interface GitViewerProps {
  path: string;
}

export function GitViewer({ path }: GitViewerProps) {
  const [branch, setBranch] = useState<GitBranch | null>(null);
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [status, setStatus] = useState<GitFileStatus[]>([]);
  const [loading, setLoading] = useState(true);

  const loadGitData = async () => {
    setLoading(true);
    try {
      const [branchData, commitsData, statusData] = await Promise.all([
        invoke<GitBranch>('get_git_branch', { path }),
        invoke<GitCommit[]>('get_git_commits', { path }),
        invoke<GitFileStatus[]>('get_git_status', { path }),
      ]);
      setBranch(branchData);
      setCommits(commitsData);
      setStatus(statusData);
    } catch (e) {
      console.error('Git error', e);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadGitData();
  }, [path]);

  const staged = status.filter(s => s.status === 'Added');
  const unstaged = status.filter(s => s.status === 'Modified' || s.status === 'Deleted');

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString();
  };

  if (loading) return <div style={{ padding: '20px', color: '#888' }}>Loading git...</div>;

  return (
    <div style={{ padding: '10px', overflowY: 'auto', height: '100%' }}>
      {/* Branch */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px', padding: '8px', backgroundColor: '#2a2a2a', borderRadius: '4px' }}>
        <GitBranchIcon size={16} color="#73c991" />
        <span style={{ color: '#d4d4d4', fontSize: '13px', fontWeight: 'bold' }}>{branch?.name || 'unknown'}</span>
        <button onClick={loadGitData} style={{ marginLeft: 'auto', background: 'transparent', border: 'none', cursor: 'pointer', color: '#888' }}>
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Staged */}
      {staged.length > 0 && (
        <div style={{ marginBottom: '12px' }}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#666', marginBottom: '6px', letterSpacing: '0.5px' }}>Staged</div>
          {staged.map(f => (
            <div key={f.path} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 8px', fontSize: '12px', color: '#73c991' }}>
              <Check size={14} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.path}</span>
            </div>
          ))}
        </div>
      )}

      {/* Unstaged */}
      {unstaged.length > 0 && (
        <div style={{ marginBottom: '12px' }}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#666', marginBottom: '6px', letterSpacing: '0.5px' }}>Changes</div>
          {unstaged.map(f => (
            <div key={f.path} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 8px', fontSize: '12px', color: f.status === 'Deleted' ? '#f14c4c' : '#e2c08d' }}>
              <AlertCircle size={14} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.path}</span>
            </div>
          ))}
        </div>
      )}

      {/* Commits */}
      <div>
        <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#666', marginBottom: '6px', letterSpacing: '0.5px' }}>Commits</div>
        {commits.map(c => (
          <div key={c.hash} style={{ padding: '8px', marginBottom: '4px', backgroundColor: '#2a2a2a', borderRadius: '4px', cursor: 'pointer' }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#333'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#2a2a2a'}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
              <GitCommitIcon size={14} color="#5865f2" />
              <span style={{ color: '#5865f2', fontSize: '11px', fontFamily: 'monospace' }}>{c.short_hash}</span>
            </div>
            <div style={{ color: '#d4d4d4', fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: '2px' }}>
              {c.message}
            </div>
            <div style={{ color: '#666', fontSize: '10px' }}>{c.author} • {formatTime(c.time)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
