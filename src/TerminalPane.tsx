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

      const term = new Terminal({
        fontSize: 14,
        fontFamily: 'Monaco, Menlo, "Courier New", monospace',
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
      
      term.open(containerRef.current!);
      termRef.current = term;

      // Delay initial fit to let container layout settle
      if (fitAddon) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (mounted) fitTerminal();
          });
        });
      }

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
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        overflow: 'hidden',
      }}
    />
  );
}
