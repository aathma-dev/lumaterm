import { useCallback, useState } from "react";
import { useAppStore } from "../state/store";
import { invoke } from "@tauri-apps/api/core";
import { findAllPaneIds } from "../lib/split-tree";
import { ResizeHandle } from "./ResizeHandle";

export function SideMenu() {
  const groups = useAppStore((s) => s.groups);
  const activeGroupId = useAppStore((s) => s.activeGroupId);
  const setActiveGroup = useAppStore((s) => s.setActiveGroup);
  const createGroup = useAppStore((s) => s.createGroup);
  const removeGroup = useAppStore((s) => s.removeGroup);
  const renameGroup = useAppStore((s) => s.renameGroup);
  const setGroupCwd = useAppStore((s) => s.setGroupCwd);
  const addTerminal = useAppStore((s) => s.addTerminal);
  const activePaneId = useAppStore((s) => s.activePaneId);
  const splitPane = useAppStore((s) => s.splitPane);
  const toggleBrowser = useAppStore((s) => s.toggleBrowser);
  const browserVisible = useAppStore((s) => s.browserVisible);
  const toggleInfoPanel = useAppStore((s) => s.toggleInfoPanel);
  const infoPanelVisible = useAppStore((s) => s.infoPanelVisible);
  const sideMenuWidth = useAppStore((s) => s.sideMenuWidth);
  const setSideMenuWidth = useAppStore((s) => s.setSideMenuWidth);
  const toggleSideMenu = useAppStore((s) => s.toggleSideMenu);
  const toggleSettings = useAppStore((s) => s.toggleSettings);
  const t = useAppStore((s) => s.theme);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editingCwdId, setEditingCwdId] = useState<string | null>(null);
  const [cwdValue, setCwdValue] = useState("");

  const handleNewGroup = useCallback(() => {
    createGroup();
  }, [createGroup]);

  const handleAddTerminal = useCallback(() => {
    addTerminal(activeGroupId);
  }, [addTerminal, activeGroupId]);

  const handleCloseGroup = useCallback(
    (e: React.MouseEvent, groupId: string) => {
      e.stopPropagation();
      const group = groups[groupId];
      if (!group) return;
      const paneIds = group.tree ? findAllPaneIds(group.tree) : [];
      removeGroup(groupId);
      paneIds.forEach((paneId) => {
        if (group.panes[paneId]) {
          invoke("pty_close", { ptyId: group.panes[paneId].ptyId }).catch(
            () => {}
          );
        }
      });
    },
    [removeGroup, groups]
  );

  const handleSplitH = useCallback(() => {
    if (activePaneId) splitPane(activePaneId, "horizontal");
  }, [activePaneId, splitPane]);

  const handleSplitV = useCallback(() => {
    if (activePaneId) splitPane(activePaneId, "vertical");
  }, [activePaneId, splitPane]);

  const handleDoubleClick = useCallback(
    (groupId: string) => {
      setEditingId(groupId);
      setEditValue(groups[groupId].name);
    },
    [groups]
  );

  const handleRename = useCallback(
    (groupId: string) => {
      if (editValue.trim()) {
        renameGroup(groupId, editValue.trim());
      }
      setEditingId(null);
    },
    [editValue, renameGroup]
  );

  const handleCwdClick = useCallback(
    (e: React.MouseEvent, groupId: string) => {
      e.stopPropagation();
      setEditingCwdId(groupId);
      setCwdValue(groups[groupId].cwd);
    },
    [groups]
  );

  const handleCwdSave = useCallback(
    (groupId: string) => {
      if (cwdValue.trim()) {
        setGroupCwd(groupId, cwdValue.trim());
      }
      setEditingCwdId(null);
    },
    [cwdValue, setGroupCwd]
  );

  const shortenPath = (path: string) => {
    const home = useAppStore.getState().homedir;
    if (home && path.startsWith(home)) {
      return "~" + path.slice(home.length);
    }
    return path;
  };

  const hasPanes = !!groups[activeGroupId]?.tree;

  const actionBtnStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: t.bgButton,
    border: `1px solid ${t.border}`,
    color: t.textMuted,
    width: 30,
    height: 26,
    cursor: "pointer",
    borderRadius: 6,
    transition: "all 0.15s",
  };

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        width: sideMenuWidth,
        minWidth: 150,
        background: t.bgSidebar,
        borderRight: `1px solid ${t.border}`,
        userSelect: "none",
      }}
    >
      {/* Top bar with collapse button */}
      <div
        style={{
          padding: "10px 12px",
          display: "flex",
          gap: 6,
          alignItems: "center",
        }}
      >
        {/* Collapse sidebar button */}
        <button
          onClick={toggleSideMenu}
          style={actionBtnStyle}
          title="Hide Sidebar (Cmd+E)"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <rect x="1" y="1" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.2" />
            <line x1="5" y1="1" x2="5" y2="13" stroke="currentColor" strokeWidth="1.2" />
            <path d="M8.5 5.5L7 7l1.5 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <div style={{ flex: 1 }} />

        <button onClick={handleAddTerminal} style={actionBtnStyle} title="New Terminal (Cmd+N)">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <rect x="1" y="2" width="12" height="10" rx="2" stroke="currentColor" strokeWidth="1.2" />
            <path d="M3.5 5L5.5 7L3.5 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            <line x1="7" y1="9" x2="10.5" y2="9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </button>
        <button
          onClick={handleSplitV}
          style={{ ...actionBtnStyle, opacity: hasPanes ? 1 : 0.4 }}
          title="Split Vertical (Cmd+D)"
          disabled={!hasPanes}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <rect x="1" y="1" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.2" />
            <line x1="7" y1="1" x2="7" y2="13" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>
        <button
          onClick={handleSplitH}
          style={{ ...actionBtnStyle, opacity: hasPanes ? 1 : 0.4 }}
          title="Split Horizontal (Cmd+Shift+D)"
          disabled={!hasPanes}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <rect x="1" y="1" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.2" />
            <line x1="1" y1="7" x2="13" y2="7" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>
        <button
          onClick={toggleBrowser}
          style={{ ...actionBtnStyle, color: browserVisible ? t.accent : t.textMuted }}
          title="Toggle Browser (Cmd+B)"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.2" />
            <ellipse cx="7" cy="7" rx="2.5" ry="5.5" stroke="currentColor" strokeWidth="1" />
            <line x1="1.5" y1="5" x2="12.5" y2="5" stroke="currentColor" strokeWidth="1" />
            <line x1="1.5" y1="9" x2="12.5" y2="9" stroke="currentColor" strokeWidth="1" />
          </svg>
        </button>
        <button
          onClick={toggleInfoPanel}
          style={{ ...actionBtnStyle, color: infoPanelVisible ? t.accent : t.textMuted }}
          title="Toggle Info Panel (Cmd+G)"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.2" />
            <circle cx="7" cy="4.5" r="0.7" fill="currentColor" />
            <path d="M7 6.5v4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Sessions header */}
      <div
        style={{
          padding: "8px 12px 6px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: t.textMuted,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif",
          }}
        >
          Sessions
        </span>
        <button
          onClick={handleNewGroup}
          style={{
            background: "transparent",
            border: "none",
            color: t.textMuted,
            cursor: "pointer",
            padding: "2px 4px",
            lineHeight: 1,
            borderRadius: 4,
            display: "flex",
            alignItems: "center",
          }}
          title="New Session (Cmd+T)"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <line x1="6" y1="2" x2="6" y2="10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            <line x1="2" y1="6" x2="10" y2="6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Session list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 6px" }}>
        {Object.values(groups).map((group) => {
          const isActive = group.id === activeGroupId;
          const paneCount = group.tree ? findAllPaneIds(group.tree).length : 0;
          return (
            <div
              key={group.id}
              onClick={() => setActiveGroup(group.id)}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                padding: "8px 8px",
                margin: "1px 0",
                borderRadius: 6,
                cursor: "pointer",
                background: isActive ? t.bgActiveItem : "transparent",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.background = t.bgHover;
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.background = "transparent";
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                style={{ flexShrink: 0, marginTop: 2, color: isActive ? t.accent : t.textMuted }}
              >
                <rect x="1" y="2" width="12" height="10" rx="2" stroke="currentColor" strokeWidth="1.2" />
                <path d="M3.5 5L5.5 7L3.5 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                <line x1="7.5" y1="9" x2="10.5" y2="9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>

              <div style={{ flex: 1, minWidth: 0 }}>
                {editingId === group.id ? (
                  <input
                    autoFocus
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={() => handleRename(group.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRename(group.id);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      background: "transparent",
                      border: `1px solid ${t.borderActive}`,
                      color: t.textPrimary,
                      fontSize: 13,
                      width: "100%",
                      outline: "none",
                      padding: "0 4px",
                      borderRadius: 4,
                      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif",
                    }}
                  />
                ) : (
                  <div
                    onDoubleClick={() => handleDoubleClick(group.id)}
                    style={{
                      fontSize: 13,
                      color: isActive ? t.textPrimary : t.textSecondary,
                      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {group.name}
                  </div>
                )}

                {editingCwdId === group.id ? (
                  <input
                    autoFocus
                    value={cwdValue}
                    onChange={(e) => setCwdValue(e.target.value)}
                    onBlur={() => handleCwdSave(group.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCwdSave(group.id);
                      if (e.key === "Escape") setEditingCwdId(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      background: "transparent",
                      border: `1px solid ${t.borderActive}`,
                      color: t.textAccent,
                      fontSize: 11,
                      width: "100%",
                      outline: "none",
                      padding: "0 4px",
                      borderRadius: 3,
                      marginTop: 2,
                      fontFamily: "'SF Mono', Menlo, monospace",
                    }}
                  />
                ) : (
                  <div
                    onClick={(e) => handleCwdClick(e, group.id)}
                    style={{
                      fontSize: 11,
                      color: t.textMuted,
                      fontFamily: "'SF Mono', Menlo, monospace",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      marginTop: 1,
                    }}
                    title={`Working directory: ${group.cwd} (click to change)`}
                  >
                    {shortenPath(group.cwd)}
                  </div>
                )}

                <div
                  style={{
                    fontSize: 10,
                    color: t.textMuted,
                    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif",
                    marginTop: 2,
                    opacity: 0.7,
                  }}
                >
                  {paneCount === 0
                    ? "no terminals"
                    : `${paneCount} ${paneCount === 1 ? "terminal" : "terminals"}`}
                </div>
              </div>

              {Object.keys(groups).length > 1 && (
                <button
                  onClick={(e) => handleCloseGroup(e, group.id)}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: t.textMuted,
                    fontSize: 14,
                    cursor: "pointer",
                    padding: "0 2px",
                    lineHeight: 1,
                    opacity: 0,
                    transition: "opacity 0.15s",
                    borderRadius: 4,
                    marginTop: 1,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = "0"; }}
                  className="group-close-btn"
                >
                  ×
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Bottom actions */}
      <div
        style={{
          padding: "8px 12px",
          borderTop: `1px solid ${t.border}`,
        }}
      >
        <button
          onClick={toggleSettings}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            width: "100%",
            background: "transparent",
            border: "none",
            color: t.textMuted,
            fontSize: 12,
            cursor: "pointer",
            padding: "6px 4px",
            borderRadius: 6,
            fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif",
            transition: "background 0.15s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = t.bgHover;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
          }}
          title="Settings (Cmd+,)"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="7" cy="7" r="2.2" stroke="currentColor" strokeWidth="1.2" />
            <path d="M7 0.5v2M7 11.5v2M0.5 7h2M11.5 7h2M2.4 2.4l1.4 1.4M10.2 10.2l1.4 1.4M11.6 2.4l-1.4 1.4M3.8 10.2l-1.4 1.4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          Settings
        </button>
      </div>

      <ResizeHandle
        direction="vertical"
        position="right"
        onResize={setSideMenuWidth}
      />
    </div>
  );
}
