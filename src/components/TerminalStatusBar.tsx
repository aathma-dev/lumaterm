import { useEffect, useState, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Terminal } from "@xterm/xterm";
import { useAppStore } from "../state/store";

interface TerminalStatusBarProps {
  paneId: string;
  groupId: string;
  terminalRef: React.RefObject<Terminal | null>;
  connectionType: string | null;
  isActive: boolean;
}

const CONNECTION_META: Record<string, { label: string; color: "green" | "cyan" | "yellow" | "magenta" | "blue"; icon: "lock" | "transfer" | "globe" | "link" }> = {
  ssh:    { label: "SSH",    color: "green",   icon: "lock" },
  scp:    { label: "SCP",    color: "cyan",    icon: "transfer" },
  sftp:   { label: "SFTP",   color: "cyan",    icon: "transfer" },
  ftp:    { label: "FTP",    color: "yellow",  icon: "transfer" },
  rsync:  { label: "RSYNC",  color: "green",   icon: "transfer" },
  telnet: { label: "TELNET", color: "yellow",  icon: "link" },
  nc:     { label: "NC",     color: "magenta", icon: "link" },
  curl:   { label: "CURL",   color: "blue",    icon: "globe" },
  wget:   { label: "WGET",   color: "blue",    icon: "globe" },
};

function ConnectionIcon({ type }: { type: "lock" | "transfer" | "globe" | "link" }) {
  switch (type) {
    case "lock":
      return (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <rect x="1" y="5" width="10" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.1" />
          <path d="M3.5 5V3.5a2.5 2.5 0 0 1 5 0V5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
          <circle cx="6" cy="8" r="1" fill="currentColor" />
        </svg>
      );
    case "transfer":
      return (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2 4h8M7.5 1.5L10 4 7.5 6.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M10 8H2M4.5 5.5L2 8l2.5 2.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "globe":
      return (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.1" />
          <ellipse cx="6" cy="6" rx="2" ry="4.5" stroke="currentColor" strokeWidth="0.9" />
          <line x1="1.5" y1="4.5" x2="10.5" y2="4.5" stroke="currentColor" strokeWidth="0.9" />
          <line x1="1.5" y1="7.5" x2="10.5" y2="7.5" stroke="currentColor" strokeWidth="0.9" />
        </svg>
      );
    case "link":
      return (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M5 7l2-2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
          <path d="M7.5 5.5l1-1a1.8 1.8 0 0 0-2.5-2.5l-1 1" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
          <path d="M4.5 6.5l-1 1a1.8 1.8 0 0 0 2.5 2.5l1-1" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
        </svg>
      );
  }
}

export function TerminalStatusBar({
  paneId,
  groupId,
  terminalRef,
  connectionType,
  isActive,
}: TerminalStatusBarProps) {
  const t = useAppStore((s) => s.theme);
  const globalFontSize = useAppStore((s) => s.fontSize);
  const paneFontSizeOverride = useAppStore((s) => s.groups[groupId]?.panes[paneId]?.fontSizeOverride ?? null);
  const fontSize = paneFontSizeOverride ?? globalFontSize;
  const setPaneFontSize = useAppStore((s) => s.setPaneFontSize);
  const splitPane = useAppStore((s) => s.splitPane);
  const toggleZoom = useAppStore((s) => s.toggleZoom);
  const zoomedPaneId = useAppStore((s) => s.zoomedPaneId);
  const removePaneFromGroup = useAppStore((s) => s.removePaneFromGroup);

  const ptyId = useAppStore((s) => s.groups[groupId]?.panes[paneId]?.ptyId ?? null);
  const isZoomed = zoomedPaneId === paneId;
  const [lineCount, setLineCount] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [shellName, setShellName] = useState("");
  const [gitBranch, setGitBranch] = useState("");
  const [gitChanges, setGitChanges] = useState(0);
  const [isGitRepo, setIsGitRepo] = useState(false);
  const intervalRef = useRef<number | null>(null);
  const gitIntervalRef = useRef<number | null>(null);

  // Fetch default shell once
  useEffect(() => {
    invoke<string>("get_default_shell").then((shell) => {
      // Extract shell name from path, e.g. /bin/zsh -> zsh
      const name = shell.split("/").pop() || shell;
      setShellName(name);
    });
  }, []);

  // Poll PTY cwd + git status
  useEffect(() => {
    if (ptyId === null) return;
    const fetchCwdAndGit = () => {
      invoke<string>("pty_get_cwd", { ptyId })
        .then((cwd) => {
          return invoke<{ is_repo: boolean; branch: string; changes: number }>("git_status_short", { cwd });
        })
        .then((status) => {
          setIsGitRepo(status.is_repo);
          setGitBranch(status.branch);
          setGitChanges(status.changes);
        })
        .catch(() => {
          setIsGitRepo(false);
        });
    };
    fetchCwdAndGit();
    gitIntervalRef.current = window.setInterval(fetchCwdAndGit, 3000);
    return () => {
      if (gitIntervalRef.current) clearInterval(gitIntervalRef.current);
    };
  }, [ptyId]);

  // Update line count periodically
  useEffect(() => {
    const update = () => {
      const term = terminalRef.current;
      if (!term) return;
      const buf = term.buffer.active;
      // Count actual used lines: find last non-empty line
      let used = 0;
      for (let i = buf.length - 1; i >= 0; i--) {
        const line = buf.getLine(i);
        if (line && line.translateToString(true).trim().length > 0) {
          used = i + 1;
          break;
        }
      }
      setLineCount(used);
    };
    update();
    intervalRef.current = window.setInterval(update, 800);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [terminalRef]);

  const handleSplitV = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      splitPane(paneId, "vertical");
    },
    [paneId, splitPane]
  );

  const handleSplitH = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      splitPane(paneId, "horizontal");
    },
    [paneId, splitPane]
  );

  const handleZoom = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      toggleZoom();
    },
    [toggleZoom]
  );

  const handleZoomIn = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setPaneFontSize(groupId, paneId, fontSize + 1);
    },
    [fontSize, groupId, paneId, setPaneFontSize]
  );

  const handleZoomOut = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setPaneFontSize(groupId, paneId, fontSize - 1);
    },
    [fontSize, groupId, paneId, setPaneFontSize]
  );

  const handleClose = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      removePaneFromGroup(groupId, paneId);
    },
    [groupId, paneId, removePaneFromGroup]
  );

  const btnStyle: React.CSSProperties = {
    background: "transparent",
    border: "none",
    color: t.textMuted,
    cursor: "pointer",
    padding: "2px 4px",
    borderRadius: 3,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "color 0.12s, background 0.12s",
    lineHeight: 1,
  };

  return (
    <div
      style={{
        position: "absolute",
        bottom: 8,
        right: 8,
        zIndex: 10,
        pointerEvents: "auto",
      }}
    >
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "5px 10px",
          borderRadius: 8,
          background: t.bgContextMenu,
          border: `1px solid ${t.border}`,
          backdropFilter: "blur(12px)",
          boxShadow: "0 2px 12px rgba(0,0,0,0.2)",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif",
          fontSize: 11,
          transition: "opacity 0.2s",
          opacity: hovered || isActive ? 1 : 0.35,
        }}
      >
        {/* Connection indicator */}
        {connectionType && CONNECTION_META[connectionType] && (() => {
          const meta = CONNECTION_META[connectionType];
          const color = t.terminal[meta.color] || t.terminal.green;
          return (
            <span
              title={`${meta.label} Connection`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 3,
                color,
                fontSize: 10,
                fontWeight: 600,
                marginRight: 2,
              }}
            >
              <ConnectionIcon type={meta.icon} />
              {meta.label}
            </span>
          );
        })()}

        {/* Shell name */}
        {shellName && (
          <span
            title={`Shell: ${shellName}`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 3,
              color: t.textMuted,
              fontSize: 10,
              fontFamily: "'SF Mono', Menlo, monospace",
              marginRight: 2,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <rect x="1" y="2" width="10" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.1" />
              <path d="M3 5.5L5 7L3 8.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
              <line x1="6" y1="8.5" x2="9" y2="8.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
            </svg>
            {shellName}
          </span>
        )}

        {/* Git info */}
        {isGitRepo && gitBranch && (
          <span
            title={`Branch: ${gitBranch}${gitChanges > 0 ? ` (${gitChanges} uncommitted)` : ""}`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 3,
              color: gitChanges > 0 ? t.terminal.yellow : t.terminal.green,
              fontSize: 10,
              fontFamily: "'SF Mono', Menlo, monospace",
              marginRight: 2,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <circle cx="6" cy="2.5" r="1.5" stroke="currentColor" strokeWidth="1.1" />
              <circle cx="6" cy="9.5" r="1.5" stroke="currentColor" strokeWidth="1.1" />
              <line x1="6" y1="4" x2="6" y2="8" stroke="currentColor" strokeWidth="1.1" />
            </svg>
            {gitBranch}
            {gitChanges > 0 && (
              <span
                style={{
                  background: t.terminal.yellow,
                  color: "#000",
                  fontSize: 9,
                  fontWeight: 700,
                  borderRadius: 6,
                  padding: "0 4px",
                  lineHeight: "14px",
                  minWidth: 14,
                  textAlign: "center",
                }}
              >
                {gitChanges}
              </span>
            )}
          </span>
        )}

        {/* Line count */}
        <span
          title="Total lines in buffer"
          style={{
            color: t.textMuted,
            fontSize: 10,
            fontFamily: "'SF Mono', Menlo, monospace",
            whiteSpace: "nowrap",
          }}
        >
          {lineCount.toLocaleString()} ln
        </span>

        {/* Divider */}
        <div style={{ width: 1, height: 14, background: t.border, margin: "0 3px" }} />

        {/* Zoom out */}
        <button
          onClick={handleZoomOut}
          style={btnStyle}
          title="Zoom Out (decrease font size)"
          onMouseEnter={(e) => {
            e.currentTarget.style.color = t.textPrimary;
            e.currentTarget.style.background = t.bgButtonHover;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = t.textMuted;
            e.currentTarget.style.background = "transparent";
          }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <circle cx="5.5" cy="5.5" r="3.5" stroke="currentColor" strokeWidth="1.1" />
            <line x1="8.2" y1="8.2" x2="11" y2="11" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
            <line x1="3.5" y1="5.5" x2="7.5" y2="5.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
          </svg>
        </button>

        {/* Font size label */}
        <span
          style={{
            color: t.textMuted,
            fontSize: 10,
            fontFamily: "'SF Mono', Menlo, monospace",
            minWidth: 20,
            textAlign: "center",
          }}
        >
          {fontSize}
        </span>

        {/* Zoom in */}
        <button
          onClick={handleZoomIn}
          style={btnStyle}
          title="Zoom In (increase font size)"
          onMouseEnter={(e) => {
            e.currentTarget.style.color = t.textPrimary;
            e.currentTarget.style.background = t.bgButtonHover;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = t.textMuted;
            e.currentTarget.style.background = "transparent";
          }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <circle cx="5.5" cy="5.5" r="3.5" stroke="currentColor" strokeWidth="1.1" />
            <line x1="8.2" y1="8.2" x2="11" y2="11" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
            <line x1="3.5" y1="5.5" x2="7.5" y2="5.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
            <line x1="5.5" y1="3.5" x2="5.5" y2="7.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
          </svg>
        </button>

        {/* Divider */}
        <div style={{ width: 1, height: 14, background: t.border, margin: "0 3px" }} />

        {/* Split Vertical */}
        <button
          onClick={handleSplitV}
          style={btnStyle}
          title="Split Vertical"
          onMouseEnter={(e) => {
            e.currentTarget.style.color = t.textPrimary;
            e.currentTarget.style.background = t.bgButtonHover;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = t.textMuted;
            e.currentTarget.style.background = "transparent";
          }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <rect x="1" y="1" width="10" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.1" />
            <line x1="6" y1="1" x2="6" y2="11" stroke="currentColor" strokeWidth="1.1" />
          </svg>
        </button>

        {/* Split Horizontal */}
        <button
          onClick={handleSplitH}
          style={btnStyle}
          title="Split Horizontal"
          onMouseEnter={(e) => {
            e.currentTarget.style.color = t.textPrimary;
            e.currentTarget.style.background = t.bgButtonHover;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = t.textMuted;
            e.currentTarget.style.background = "transparent";
          }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <rect x="1" y="1" width="10" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.1" />
            <line x1="1" y1="6" x2="11" y2="6" stroke="currentColor" strokeWidth="1.1" />
          </svg>
        </button>

        {/* Fullscreen / Zoom toggle */}
        <button
          onClick={handleZoom}
          style={{
            ...btnStyle,
            color: isZoomed ? t.accent : t.textMuted,
          }}
          title={isZoomed ? "Exit Fullscreen" : "Fullscreen"}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = isZoomed ? t.accent : t.textPrimary;
            e.currentTarget.style.background = t.bgButtonHover;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = isZoomed ? t.accent : t.textMuted;
            e.currentTarget.style.background = "transparent";
          }}
        >
          {isZoomed ? (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M4 1v3H1" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M8 1v3h3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 11V8H1" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M8 11V8h3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M1 4V1h3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M11 4V1H8" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M1 8v3h3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M11 8v3H8" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>

        {/* Divider */}
        <div style={{ width: 1, height: 14, background: t.border, margin: "0 3px" }} />

        {/* Close terminal */}
        <button
          onClick={handleClose}
          style={{
            ...btnStyle,
            color: t.textMuted,
          }}
          title="Close Terminal"
          onMouseEnter={(e) => {
            e.currentTarget.style.color = t.danger;
            e.currentTarget.style.background = t.bgButtonHover;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = t.textMuted;
            e.currentTarget.style.background = "transparent";
          }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <line x1="3" y1="3" x2="9" y2="9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            <line x1="9" y1="3" x2="3" y2="9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
