import { useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";

interface PtyOutput {
  pty_id: number;
  data: string; // base64
}

export function usePty(
  onData: (data: Uint8Array) => void,
  cols: number,
  rows: number
) {
  const ptyIdRef = useRef<number | null>(null);
  const unlistenRef = useRef<UnlistenFn | null>(null);
  const onDataRef = useRef(onData);
  onDataRef.current = onData;

  const create = useCallback(async (cwd?: string) => {
    const id = await invoke<number>("pty_create", { cols, rows, cwd: cwd || null });
    ptyIdRef.current = id;

    const unlisten = await listen<PtyOutput>("pty-output", (event) => {
      if (event.payload.pty_id === id) {
        const binary = atob(event.payload.data);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        onDataRef.current(bytes);
      }
    });
    unlistenRef.current = unlisten;
    return id;
  }, [cols, rows]);

  const write = useCallback(async (data: string) => {
    if (ptyIdRef.current === null) return;
    const encoded = btoa(data);
    await invoke("pty_write", { ptyId: ptyIdRef.current, data: encoded });
  }, []);

  const resize = useCallback(async (cols: number, rows: number) => {
    if (ptyIdRef.current === null) return;
    await invoke("pty_resize", {
      ptyId: ptyIdRef.current,
      cols,
      rows,
    });
  }, []);

  const close = useCallback(() => {
    if (unlistenRef.current) {
      unlistenRef.current();
      unlistenRef.current = null;
    }
    if (ptyIdRef.current !== null) {
      const id = ptyIdRef.current;
      ptyIdRef.current = null;
      invoke("pty_close", { ptyId: id }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    return () => {
      close();
    };
  }, [close]);

  return { create, write, resize, close, ptyIdRef };
}
