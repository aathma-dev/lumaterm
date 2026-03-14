import { useEffect, useRef, useCallback, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { usePty } from "../hooks/use-pty";
import { useAppStore } from "../state/store";
import { PaneContextMenu } from "./PaneContextMenu";
import { TerminalStatusBar } from "./TerminalStatusBar";
import "@xterm/xterm/css/xterm.css";

interface TerminalPaneProps {
  paneId: string;
  groupId: string;
}

export function TerminalPane({ paneId, groupId }: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const initializedRef = useRef(false);
  const resizeTimeoutRef = useRef<number | null>(null);
  const groupIdRef = useRef(groupId);
  groupIdRef.current = groupId;

  const activePaneId = useAppStore((s) => s.activePaneId);
  const setActivePaneId = useAppStore((s) => s.setActivePaneId);
  const addPane = useAppStore((s) => s.addPane);
  const groups = useAppStore((s) => s.groups);
  const theme = useAppStore((s) => s.theme);
  const fontFamily = useAppStore((s) => s.fontFamily);
  const globalFontSize = useAppStore((s) => s.fontSize);
  const paneFontSizeOverride = useAppStore((s) => s.groups[groupId]?.panes[paneId]?.fontSizeOverride ?? null);
  const fontSize = paneFontSizeOverride ?? globalFontSize;
  const scrollbackLimit = useAppStore((s) => s.scrollbackLimit);
  const showStatusBar = useAppStore((s) => s.showStatusBar);

  const isActive = activePaneId === paneId;

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [connectionType, setConnectionType] = useState<string | null>(null);

  const sessionCwd = groups[groupId]?.cwd;

  const handleData = useCallback((data: Uint8Array) => {
    terminalRef.current?.write(data);
  }, []);

  const { create, write, resize, close } = usePty(handleData, 80, 24);

  // Live theme update
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.options.theme = theme.terminal;
    }
  }, [theme]);

  // Live font family update
  useEffect(() => {
    if (terminalRef.current && fitAddonRef.current) {
      terminalRef.current.options.fontFamily = fontFamily;
      fitAddonRef.current.fit();
      resize(terminalRef.current.cols, terminalRef.current.rows);
    }
  }, [fontFamily]);

  // Live font size update
  useEffect(() => {
    if (terminalRef.current && fitAddonRef.current) {
      terminalRef.current.options.fontSize = fontSize;
      fitAddonRef.current.fit();
      resize(terminalRef.current.cols, terminalRef.current.rows);
    }
  }, [fontSize]);

  // Live scrollback update
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.options.scrollback = scrollbackLimit;
    }
  }, [scrollbackLimit]);

  useEffect(() => {
    if (!containerRef.current || initializedRef.current) return;
    initializedRef.current = true;

    const state = useAppStore.getState();

    const term = new Terminal({
      cursorBlink: true,
      fontSize: state.fontSize,
      fontFamily: state.fontFamily,
      scrollback: state.scrollbackLimit,
      theme: state.theme.terminal,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());

    term.open(containerRef.current);
    terminalRef.current = term;
    fitAddonRef.current = fitAddon;

    requestAnimationFrame(() => {
      fitAddon.fit();

      const cols = term.cols;
      const rows = term.rows;

      create(sessionCwd).then((ptyId) => {
        addPane(groupIdRef.current, paneId, ptyId);
        resize(cols, rows);
      });
    });

    // Connection detection: monitor terminal title changes
    term.onTitleChange((title) => {
      const hasRemote = /@/.test(title) && !/^~/.test(title);
      if (hasRemote) {
        setConnectionType((prev) => prev || "ssh");
      }
    });

    // Connection detection: track user input for network commands
    const CONNECTION_PATTERNS: [RegExp, string][] = [
      [/^ssh\s/, "ssh"],
      [/^scp\s/, "scp"],
      [/^sftp\s/, "sftp"],
      [/^ftp\s/, "ftp"],
      [/^rsync\s/, "rsync"],
      [/^telnet\s/, "telnet"],
      [/^nc\s/, "nc"],
      [/^ncat\s/, "nc"],
      [/^netcat\s/, "nc"],
      [/^curl\s/, "curl"],
      [/^wget\s/, "wget"],
    ];

    let inputBuffer = "";
    term.onData((data) => {
      write(data);
      if (data === "\r" || data === "\n") {
        const cmd = inputBuffer.trim();
        let matched = false;
        for (const [pattern, type] of CONNECTION_PATTERNS) {
          if (pattern.test(cmd)) {
            setConnectionType(type);
            matched = true;
            break;
          }
        }
        if (!matched && (cmd === "exit" || cmd === "logout" || cmd === "bye" || cmd === "quit")) {
          setConnectionType(null);
        }
        inputBuffer = "";
      } else if (data === "\x7f") {
        inputBuffer = inputBuffer.slice(0, -1);
      } else if (data.length === 1 && data >= " ") {
        inputBuffer += data;
      }
    });

    const observer = new ResizeObserver(() => {
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
      resizeTimeoutRef.current = window.setTimeout(() => {
        if (fitAddonRef.current && terminalRef.current) {
          fitAddonRef.current.fit();
          resize(terminalRef.current.cols, terminalRef.current.rows);
        }
      }, 100);
    });

    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      if (resizeTimeoutRef.current) clearTimeout(resizeTimeoutRef.current);
      term.dispose();
      close();
    };
  }, []);

  const handleClick = useCallback(() => {
    setActivePaneId(paneId);
    terminalRef.current?.focus();
    setContextMenu(null);
  }, [paneId, setActivePaneId]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setActivePaneId(paneId);
      setContextMenu({ x: e.clientX, y: e.clientY });
    },
    [paneId, setActivePaneId]
  );

  useEffect(() => {
    if (isActive && terminalRef.current) {
      terminalRef.current.focus();
    }
  }, [isActive]);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <div
        ref={containerRef}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        style={{
          width: "100%",
          height: "100%",
          overflow: "hidden",
          borderRadius: 4,
          border: isActive
            ? `1px solid ${theme.borderActive}`
            : "1px solid transparent",
          padding: 2,
          boxSizing: "border-box",
          transition: "border-color 0.15s",
        }}
      />
      {contextMenu && (
        <PaneContextMenu
          paneId={paneId}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
        />
      )}
      {showStatusBar && (
        <TerminalStatusBar
          paneId={paneId}
          groupId={groupId}
          terminalRef={terminalRef}
          connectionType={connectionType}
          isActive={isActive}
        />
      )}
    </div>
  );
}
