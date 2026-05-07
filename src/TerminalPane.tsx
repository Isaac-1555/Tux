import { useEffect, useRef } from 'react';
import { init, Terminal, FitAddon } from 'ghostty-web';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export function TerminalPane({ id }: { id: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let mounted = true;

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
      } catch (e) {
        console.warn("FitAddon not found", e);
      }
      
      term.open(containerRef.current!);
      if (fitAddon) {
        fitAddon.fit();
      }
      termRef.current = term;

      // Listen for data from Rust PTY
      const unlistenPromise = listen<number[]>(`pty-data-${id}`, (event) => {
        const u8 = new Uint8Array(event.payload);
        term.write(u8);
      });

      // Send data to Rust PTY
      term.onData((data) => {
        const encoder = new TextEncoder();
        invoke('write_pty', { id, data: Array.from(encoder.encode(data)) });
      });

      // Request PTY spawn
      await invoke('spawn_pty', { id, rows: term.rows, cols: term.cols });

      // Handle Resize
      term.onResize(({ cols, rows }) => {
        invoke('resize_pty', { id, rows, cols });
      });

      const resizeObserver = new ResizeObserver(() => {
        // Simple manual fit if FitAddon fails
        // this is rudimentary; a proper fit logic is needed.
      });
      resizeObserver.observe(containerRef.current!);

      unlisten = await unlistenPromise;
    }

    setup();

    return () => {
      mounted = false;
      if (unlisten) unlisten();
      if (termRef.current) termRef.current.dispose();
    };
  }, [id]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}
