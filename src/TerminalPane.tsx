import { useEffect, useRef, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { ImageAddon } from '@xterm/addon-image';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-shell';

export function TerminalPane({ id, isVisible }: { id: string; isVisible: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Generation counter for React 19 StrictMode remount safety. Each effect
  // run captures `myGen = ++generationRef.current`. After any `await`, check
  // isStale() — if the effect re-ran (StrictMode dev) or unmounted, bail
  // without side effects.
  const generationRef = useRef(0);

  const fitTerminal = useCallback(() => {
    if (fitAddonRef.current && termRef.current && containerRef.current) {
      // Only fit if container has non-zero dimensions
      const { clientWidth, clientHeight } = containerRef.current;
      if (clientWidth === 0 || clientHeight === 0) return;
      try {
        fitAddonRef.current.fit();
      } catch {
        // Ignore fit errors
      }
    }
  }, []);

  // Re-fit when terminal becomes visible (switching tabs)
  useEffect(() => {
    if (isVisible && termRef.current && fitAddonRef.current) {
      // Small delay to let layout settle after display change
      const timer = setTimeout(() => fitTerminal(), 50);
      return () => clearTimeout(timer);
    }
  }, [isVisible, fitTerminal]);

  useEffect(() => {
    const myGen = ++generationRef.current;
    let unlisten: (() => void) | null = null;
    let mounted = true;
    let resizeObserver: ResizeObserver | null = null;
    let container: HTMLDivElement | null = null;

    function isStale() {
      return !mounted || myGen !== generationRef.current;
    }

    async function setup() {
      if (isStale()) return;

      const fontFamily = 'Monaco, Menlo, "Courier New", monospace';
      const fontSize = 14;
      await document.fonts.ready;
      if (isStale()) return;
      try {
        await document.fonts.load(`${fontSize}px ${fontFamily}`);
      } catch (e) {
        console.warn('[TerminalPane] Font preload failed, continuing:', e);
      }
      if (isStale()) return;

      container = containerRef.current;
      if (!container) return;
      const el: HTMLDivElement = container;
      // Defensive: clear any leftover xterm DOM from a prior mount cycle
      // (StrictMode remount, hot-reload, etc.) before opening a new terminal.
      while (el.firstChild) el.removeChild(el.firstChild);
      const { clientWidth, clientHeight } = el;
      if (clientWidth > 0 && clientHeight > 0) {
        el.style.width = `${clientWidth}px`;
        el.style.height = `${clientHeight}px`;
        requestAnimationFrame(() => {
          el.style.width = '';
          el.style.height = '';
        });
      }

      const term = new Terminal({
        fontSize,
        fontFamily,
        theme: {
          background: '#1e1e1e',
          foreground: '#d4d4d4',
        },
      });

      term.open(el);
      termRef.current = term;

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      fitAddonRef.current = fitAddon;

      // WebGL renderer: GPU acceleration + automatic DPR handling for crisp
      // glyphs on Retina. Falls back to canvas if GPU unavailable.
      try {
        const webglAddon = new WebglAddon();
        webglAddon.onContextLoss(() => {
          webglAddon.dispose();
        });
        term.loadAddon(webglAddon);
      } catch (e) {
        console.warn('[TerminalPane] WebGL renderer unavailable, using canvas:', e);
      }

      // Image protocol support: SIXEL, iTerm2 IIP, kitty TGP. Lets TUIs that
      // detect terminal image capability (opencode, claude code, etc.) render
      // inline graphics (logos, diffs, charts) instead of falling back to
      // ASCII art. Also enables CSI 14/16/18t cell-size reports so programs
      // can size images correctly.
      try {
        term.loadAddon(new ImageAddon());
      } catch (e) {
        console.warn('[TerminalPane] Image addon failed to load:', e);
      }

      // URL link handler — opens in default browser via Tauri shell.
      try {
        term.loadAddon(new WebLinksAddon((_event, uri) => {
          open(uri).catch((err) => console.error('Failed to open URL:', err));
        }));
      } catch (e) {
        console.warn('[TerminalPane] Web links addon failed to load:', e);
      }

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!isStale() && termRef.current) {
            fitTerminal();
          }
        });
      });

      (window as any).__terminalDebug = {
        term,
        getMetrics: () => {
          const container = containerRef.current;
          if (!container) return null;
          return {
            dpr: window.devicePixelRatio,
            containerSize: { w: container.clientWidth, h: container.clientHeight },
            cols: term.cols,
            rows: term.rows,
            fontSize,
            fontFamily,
            fontStatus: document.fonts.status,
          };
        }
      };

      // Listen for data from Rust PTY. Assign unlisten as soon as the promise
      // resolves (not via the later `await`) so cleanup can unsubscribe even
      // if it runs before that await completes (React 19 StrictMode race).
      const unlistenPromise = listen<number[]>(`pty-data-${id}`, (event) => {
        if (isStale()) return;
        const u8 = new Uint8Array(event.payload);
        term.write(u8);
      });
      unlistenPromise.then(u => {
        if (isStale()) {
          u(); // unsubscribe if stale — don't leak mount 1's listener
        } else {
          unlisten = u;
        }
      }).catch(() => { /* listener registration failed; ignore */ });

      // Send data to Rust PTY
      term.onData((data) => {
        // Convert DEL (0x7f) backspace to BS (0x08) for shell compatibility
        const bytes = data.replace(/\x7f/g, '\x08');
        const encoder = new TextEncoder();
        invoke('write_pty', { id, data: Array.from(encoder.encode(bytes)) });
      });

      // Request PTY spawn
      await invoke('spawn_pty', { id, rows: term.rows, cols: term.cols });

      // StrictMode guard: if the effect re-ran during the await, the new
      // mount will spawn its own PTY. We don't close here — calling
      // close_pty could race-kill the live PTY from the newer mount.
      // Cleanup is the single source of truth for PTY teardown.
      if (isStale()) return;

      // Handle Resize - only resize when terminal explicitly resizes
      term.onResize(({ cols, rows }) => {
        invoke('resize_pty', { id, rows, cols });
      });

      // Set up ResizeObserver with debounce to fit terminal when container resizes
      if (containerRef.current) {
        resizeObserver = new ResizeObserver(() => {
          if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
          resizeTimerRef.current = setTimeout(() => {
            fitTerminal();
          }, 30);
        });
        resizeObserver.observe(containerRef.current);
      }
    }

    setup();

    return () => {
      mounted = false;
      // Kill the PTY this effect spawned (or a leftover from HMR/StrictMode).
      // Fire-and-forget: invoke is async, cleanup can't await.
      invoke('close_pty', { id }).catch(() => { /* already closed or never spawned; ignore */ });
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      if (unlisten) unlisten();
      if (termRef.current) termRef.current.dispose();
      // xterm.js dispose() does not remove its .xterm wrapper + canvases
      // from the container. React 19 StrictMode remounts the effect in dev,
      // so without clearing we end up with two stacked terminals.
      if (container) {
        while (container.firstChild) {
          container.removeChild(container.firstChild);
        }
      }
      termRef.current = null;
      fitAddonRef.current = null;
    };
  }, [id, fitTerminal]);

  return (
    <>
      <div
        ref={containerRef}
        id={`terminal-${id}-container`}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          overflow: 'hidden',
        }}
      />
      <div
        id={`terminal-${id}-debug`}
        style={{
          position: 'absolute',
          bottom: 0,
          right: 0,
          background: 'rgba(0,0,0,0.85)',
          color: '#0f0',
          fontSize: '11px',
          fontFamily: 'monospace',
          padding: '4px 8px',
          zIndex: 99999,
          display: 'none',
          lineHeight: '1.5',
          maxWidth: '600px',
        }}
        ref={el => {
          if (el) {
            const update = () => {
              const container = containerRef.current;
              const term = termRef.current;
              if (!container || !term) return;
              const dpr = window.devicePixelRatio;
              el.textContent = [
                `DPR:${dpr}`,
                `cont:${container.clientWidth}×${container.clientHeight}`,
                `phys:${(container.clientWidth * dpr).toFixed(0)}×${(container.clientHeight * dpr).toFixed(0)}`,
                `cols:${term.cols}`,
                `rows:${term.rows}`,
              ].join(' | ');
            };
            update();
            const ro = new ResizeObserver(update);
            ro.observe(containerRef.current!);
            (window as any).__termDebugUpdate = update;
          }
        }}
      />
      <button
        onClick={() => {
          const debugEl = document.getElementById(`terminal-${id}-debug`);
          if (debugEl) {
            debugEl.style.display = debugEl.style.display === 'none' ? 'block' : 'none';
          }
        }}
        title="Toggle terminal debug (Alt+D)"
        style={{
          position: 'absolute',
          bottom: 4,
          right: 4,
          background: 'rgba(30,30,30,0.9)',
          color: '#0f0',
          border: '1px solid #333',
          fontSize: '10px',
          fontFamily: 'monospace',
          padding: '2px 6px',
          cursor: 'pointer',
          zIndex: 99998,
          opacity: 0.4,
        }}
      >DBG</button>
    </>
  );
}
