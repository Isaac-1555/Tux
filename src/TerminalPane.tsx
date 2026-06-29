import { useEffect, useRef, useCallback } from 'react';
import { init, Terminal, FitAddon, UrlRegexProvider } from 'ghostty-web';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-shell';

export function TerminalPane({ id, isVisible }: { id: string; isVisible: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fitTerminal = useCallback(() => {
    if (fitAddonRef.current && termRef.current && containerRef.current) {
      // Only fit if container has non-zero dimensions
      const { clientWidth, clientHeight } = containerRef.current;
      if (clientWidth === 0 || clientHeight === 0) return;
      try {
        fitAddonRef.current.fit();
      } catch (e) {
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
    let unlisten: (() => void) | undefined;
    let mounted = true;
    let resizeObserver: ResizeObserver | null = null;

    async function setup() {
      await init();
      if (!mounted) return;

      const fontFamily = 'Monaco, Menlo, "Courier New", monospace';
      const fontSize = 14;
      await document.fonts.ready;
      try {
        await document.fonts.load(`${fontSize}px ${fontFamily}`);
      } catch (e) {
        console.warn('[TerminalPane] Font preload failed, continuing:', e);
      }

      const container = containerRef.current!;
      const { clientWidth, clientHeight } = container;
      if (clientWidth > 0 && clientHeight > 0) {
        container.style.width = `${clientWidth}px`;
        container.style.height = `${clientHeight}px`;
        requestAnimationFrame(() => {
          container.style.width = '';
          container.style.height = '';
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

      let fitAddon;
      try {
        fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        fitAddonRef.current = fitAddon;
      } catch (e) {
        console.warn("FitAddon not found", e);
      }

      term.open(container);
      termRef.current = term;

      const renderer = (term as any).renderer;
      if (renderer) {
        const testCanvas = document.createElement('canvas');
        const ctx = testCanvas.getContext('2d')!;
        ctx.font = `${fontSize}px ${fontFamily}`;
        const m = ctx.measureText('M');
        const width = Math.ceil(m.width);
        const baselineA = m.actualBoundingBoxAscent;
        const baselineD = m.actualBoundingBoxDescent;
        if (baselineA !== undefined && baselineD !== undefined) {
          renderer.metrics = {
            width,
            height: Math.ceil(baselineA + baselineD) + 2,
            baseline: Math.ceil(baselineA) + 1,
          };
        }
        renderer.resize(term.cols, term.rows);
      }

      if (fitAddon) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (mounted && termRef.current) {
              fitTerminal();
            }
          });
        });
      }

      (window as any).__terminalDebug = {
        term,
        getMetrics: () => {
          const canvas = (term as any).renderer?.getCanvas?.();
          const metrics = (term as any).renderer?.getMetrics?.();
          return {
            dpr: window.devicePixelRatio,
            visualScale: (window as any).visualViewport?.scale,
            containerSize: { w: container.clientWidth, h: container.clientHeight },
            canvasCSS: canvas ? { w: canvas.style.width, h: canvas.style.height } : null,
            canvasBuffer: canvas ? { w: canvas.width, h: canvas.height } : null,
            metrics,
            fontStatus: document.fonts.status,
          };
        }
      };

      // Listen for data from Rust PTY
      const unlistenPromise = listen<number[]>(`pty-data-${id}`, (event) => {
        const u8 = new Uint8Array(event.payload);
        term.write(u8);
      });

      // Send data to Rust PTY
      term.onData((data) => {
        // Convert DEL (0x7f) backspace to BS (0x08) for shell compatibility
        const bytes = data.replace(/\x7f/g, '\x08');
        const encoder = new TextEncoder();
        invoke('write_pty', { id, data: Array.from(encoder.encode(bytes)) });
      });

      // Request PTY spawn
      await invoke('spawn_pty', { id, rows: term.rows, cols: term.cols });

      // Register URL link provider - opens URLs in default browser on Cmd/Ctrl+click
      try {
        const urlProvider = new UrlRegexProvider(term as any);
        // Wrap the provider to use Tauri shell open instead of window.open
        term.registerLinkProvider({
          provideLinks(y: number, callback: (links: any[] | undefined) => void) {
            urlProvider.provideLinks(y, (links) => {
              if (links) {
                const wrapped = links.map((link) => ({
                  ...link,
                  activate(_event: MouseEvent) {
                    // Open URL in default browser via Tauri
                    open(link.text).catch((e: any) => console.error('Failed to open URL:', e));
                  },
                }));
                callback(wrapped);
              } else {
                callback(undefined);
              }
            });
          },
          dispose() {
            urlProvider.dispose?.();
          },
        });
      } catch (e) {
        console.warn('Failed to register URL link provider', e);
      }

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

      unlisten = await unlistenPromise;
    }

    setup();

    return () => {
      mounted = false;
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      if (unlisten) unlisten();
      if (termRef.current) termRef.current.dispose();
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
              if (!container) return;
              const dpr = window.devicePixelRatio;
              const testCanvas = document.createElement('canvas');
              const ctx = testCanvas.getContext('2d')!;
              ctx.font = '14px Monaco, Menlo, "Courier New", monospace';
              const m = ctx.measureText('M');
              const w = ctx.measureText('W').width;
              const bboxA = m.actualBoundingBoxAscent || 14 * 0.8;
              const bboxD = m.actualBoundingBoxDescent || 14 * 0.2;
              const cellH = Math.ceil(bboxA + bboxD) + 2;
              el.textContent = [
                `DPR:${dpr}`,
                `cont:${container.clientWidth}×${container.clientHeight}`,
                `phys:${(container.clientWidth * dpr).toFixed(0)}×${(container.clientHeight * dpr).toFixed(0)}`,
                `glyph:⌊${w.toFixed(1)}×${cellH}⌋`,
                `fit.cols:${(container.clientWidth / w).toFixed(1)}`,
                `fit.rows:${(container.clientHeight / cellH).toFixed(1)}`,
                `frac:${(container.clientWidth % 1).toFixed(2)}×${(container.clientHeight % 1).toFixed(2)}`,
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
