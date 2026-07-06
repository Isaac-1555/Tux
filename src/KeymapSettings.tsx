import { useEffect, useMemo, useState } from 'react';
import { X, Search, RotateCcw, TriangleAlert } from 'lucide-react';
import {
  type KeymapEntry,
  type KeymapOverride,
  type KeyCombo,
  comboFromEvent,
  effectiveKeymap,
  findConflict,
  formatCombo,
  isMacOS,
} from './keymap';
import './KeymapSettings.css';

type Props = {
  overrides: KeymapOverride;
  onSave: (o: KeymapOverride) => void;
  onClose: () => void;
};

type PendingState =
  | { kind: 'idle' }
  | { kind: 'recording' }
  | { kind: 'conflict'; combo: KeyCombo; conflict: KeymapEntry };

const CATEGORIES: KeymapEntry['category'][] = ['Terminals', 'Sidebar', 'Editor'];

export function KeymapSettings({ overrides, onSave, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [pending, setPending] = useState<{ id: string; state: PendingState } | null>(null);
  const mac = useMemo(() => isMacOS(), []);

  const effective = useMemo(() => effectiveKeymap(overrides), [overrides]);

  function confirmReassign() {
    if (!pending || pending.state.kind !== 'conflict') return;
    const { combo, conflict } = pending.state;
    const next: KeymapOverride = { ...overrides };
    next[pending.id] = combo;
    delete next[conflict.id];
    onSave(next);
    setPending(null);
  }

  function resetEntry(id: string) {
    const next: KeymapOverride = { ...overrides };
    delete next[id];
    onSave(next);
  }

  function resetAll() {
    onSave({});
  }

  useEffect(() => {
    if (!pending || pending.state.kind !== 'recording') return;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        setPending(null);
        return;
      }
      const combo = comboFromEvent(e);
      if (!combo) return;
      const conflict = findConflict(combo, pending.id, effective);
      if (conflict) {
        setPending({ id: pending.id, state: { kind: 'conflict', combo, conflict } });
      } else {
        onSave({ ...overrides, [pending.id]: combo });
        setPending(null);
      }
    };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [pending, effective, overrides, onSave]);

  const filtered = effective.filter((e) =>
    e.description.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <div className="km-backdrop" onClick={onClose}>
      <div className="km-card" onClick={(e) => e.stopPropagation()}>
        <div className="km-header">
          <div className="km-title">
            <KeyboardIcon />
            <span>Keyboard Shortcuts</span>
          </div>
          <button className="km-icon-btn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="km-search">
          <Search size={14} />
          <input
            type="text"
            placeholder="Search actions..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
        </div>

        <div className="km-list">
          {CATEGORIES.map((cat) => {
            const entries = filtered.filter((e) => e.category === cat);
            if (entries.length === 0) return null;
            return (
              <div key={cat} className="km-category">
                <div className="km-category-header">{cat}</div>
                {entries.map((entry) => {
                  const isOverridden = !!overrides[entry.id];
                  const rowPending = pending?.id === entry.id ? pending.state : null;
                  return (
                    <div key={entry.id} className="km-row">
                      <div className="km-row-label">
                        <span className="km-row-desc">{entry.description}</span>
                        {isOverridden && (
                          <span
                            className="km-reset-single"
                            title="Reset to default"
                            onClick={() => resetEntry(entry.id)}
                          >
                            <RotateCcw size={12} />
                          </span>
                        )}
                      </div>
                      <div className="km-row-right">
                        {rowPending?.kind === 'recording' ? (
                          <span className="km-recording">Press keys... (Esc to cancel)</span>
                        ) : rowPending?.kind === 'conflict' ? (
                          <div className="km-conflict">
                            <div className="km-conflict-line">
                              <TriangleAlert size={12} />
                              <span>
                                {formatCombo(rowPending.combo, mac)} is used by "{rowPending.conflict.description}".
                              </span>
                            </div>
                            <div className="km-conflict-actions">
                              <button
                                className="km-btn km-btn-ghost"
                                onClick={() => setPending(null)}
                              >
                                Cancel
                              </button>
                              <button
                                className="km-btn km-btn-danger"
                                onClick={confirmReassign}
                              >
                                Reassign
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <kbd className="km-combo">{formatCombo(entry.combo, mac)}</kbd>
                            <button
                              className="km-btn km-btn-record"
                              onClick={() => setPending({ id: entry.id, state: { kind: 'recording' } })}
                            >
                              Reassign
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="km-empty">No matching actions.</div>
          )}
        </div>

        <div className="km-footer">
          <button className="km-btn km-btn-ghost" onClick={resetAll}>
            <RotateCcw size={12} />
            <span>Reset all to defaults</span>
          </button>
          <button className="km-btn km-btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function KeyboardIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h.01M18 14h.01M8 14h8" />
    </svg>
  );
}
