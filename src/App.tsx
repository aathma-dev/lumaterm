import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { SideMenu } from "./components/SideMenu";
import { SplitContainer } from "./components/SplitContainer";
import { TerminalPane } from "./components/TerminalPane";
import { BrowserPanel } from "./components/BrowserPanel";
import { EmptySession } from "./components/EmptySession";
import { InfoPanel } from "./components/InfoPanel";
import { Settings } from "./components/Settings";
import { useAppStore } from "./state/store";
import { findAllPaneIds } from "./lib/split-tree";

/**
 * Renders the split tree layout + all TerminalPanes via portals.
 *
 * Each pane gets a **stable DOM container** (created once, reused forever).
 * SplitContainer leaf nodes adopt the container via appendChild.
 * TerminalPanes are portaled into these stable containers, so they never
 * unmount when the tree structure changes (splits, closes, etc.).
 */
function GroupContent({
  groupId,
  tree,
  zoomedPaneId,
}: {
  groupId: string;
  tree: import("./types").SplitNode;
  zoomedPaneId: string | null;
}) {
  const stableContainers = useRef(new Map<string, HTMLDivElement>());

  const getContainer = useCallback((paneId: string): HTMLDivElement => {
    let el = stableContainers.current.get(paneId);
    if (!el) {
      el = document.createElement("div");
      el.style.width = "100%";
      el.style.height = "100%";
      el.style.overflow = "hidden";
      stableContainers.current.set(paneId, el);
    }
    return el;
  }, []);

  const paneIds = findAllPaneIds(tree);

  // Clean up containers for removed panes
  useEffect(() => {
    const currentIds = new Set(paneIds);
    for (const [id, el] of stableContainers.current) {
      if (!currentIds.has(id)) {
        el.remove();
        stableContainers.current.delete(id);
      }
    }
  }, [paneIds.join(",")]);

  return (
    <>
      <SplitContainer
        node={tree}
        groupId={groupId}
        zoomedPaneId={zoomedPaneId}
        getContainer={getContainer}
      />
      {paneIds.map((paneId) =>
        createPortal(
          <TerminalPane key={paneId} paneId={paneId} groupId={groupId} />,
          getContainer(paneId)
        )
      )}
    </>
  );
}

export function App() {
  const [splashVisible, setSplashVisible] = useState(true);
  const [splashFading, setSplashFading] = useState(false);

  const groups = useAppStore((s) => s.groups);
  const activeGroupId = useAppStore((s) => s.activeGroupId);
  const browserVisible = useAppStore((s) => s.browserVisible);
  const infoPanelVisible = useAppStore((s) => s.infoPanelVisible);
  const sideMenuVisible = useAppStore((s) => s.sideMenuVisible);
  const zoomedPaneId = useAppStore((s) => s.zoomedPaneId);
  const setHomedir = useAppStore((s) => s.setHomedir);
  const toggleSideMenu = useAppStore((s) => s.toggleSideMenu);
  const settingsVisible = useAppStore((s) => s.settingsVisible);
  const theme = useAppStore((s) => s.theme);

  useEffect(() => {
    // Signal Rust to show the window once the frontend is mounted
    invoke("show_window");

    const fadeTimer = setTimeout(() => setSplashFading(true), 800);
    const removeTimer = setTimeout(() => setSplashVisible(false), 1200);
    return () => { clearTimeout(fadeTimer); clearTimeout(removeTimer); };
  }, []);

  useEffect(() => {
    invoke<string>("get_home_dir").then((dir) => {
      setHomedir(dir);
    });

    // Listen to macOS system dark mode changes
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (e: MediaQueryListEvent) => {
      useAppStore.getState().setSystemDark(e.matches);
    };
    mq.addEventListener("change", handleChange);

    // Listen for native menu events from Rust
    const unlisten = listen<string>("menu-event", (event) => {
      const state = useAppStore.getState();
      switch (event.payload) {
        case "new_terminal":
          state.addTerminal(state.activeGroupId);
          break;
        case "new_session":
          state.createGroup();
          break;
        case "close_terminal":
          if (state.activePaneId) {
            const pane = state.groups[state.activeGroupId]?.panes[state.activePaneId];
            if (pane?.ptyId != null) {
              invoke("pty_close", { ptyId: pane.ptyId });
            }
            state.removePaneFromGroup(state.activeGroupId, state.activePaneId);
          }
          break;
        case "close_session": {
          const closingGroup = state.groups[state.activeGroupId];
          if (closingGroup) {
            for (const p of Object.values(closingGroup.panes)) {
              if (p.ptyId != null) {
                invoke("pty_close", { ptyId: p.ptyId });
              }
            }
          }
          state.removeGroup(state.activeGroupId);
          break;
        }
        case "split_vertical":
          if (state.activePaneId) {
            state.splitPane(state.activePaneId, "vertical");
          }
          break;
        case "split_horizontal":
          if (state.activePaneId) {
            state.splitPane(state.activePaneId, "horizontal");
          }
          break;
        case "zoom_pane":
          state.toggleZoom();
          break;
        case "toggle_sidebar":
          state.toggleSideMenu();
          break;
        case "toggle_browser":
          state.toggleBrowser();
          break;
        case "toggle_info_panel":
          state.toggleInfoPanel();
          break;
        case "toggle_docker_panel":
          if (state.infoPanelVisible && state.infoPanelTab === "containers") {
            state.toggleInfoPanel();
          } else {
            state.setInfoPanelTab("containers");
          }
          break;
        case "toggle_theme":
          state.cycleTheme();
          break;
        case "settings":
          state.toggleSettings();
          break;
        case "focus_up":
          state.focusPaneInDirection("up");
          break;
        case "focus_down":
          state.focusPaneInDirection("down");
          break;
        case "focus_left":
          state.focusPaneInDirection("left");
          break;
        case "focus_right":
          state.focusPaneInDirection("right");
          break;
        case "next_pane":
          state.focusNextPane();
          break;
        case "prev_pane":
          state.focusPrevPane();
          break;
        case "next_session": {
          const groupIds = Object.keys(state.groups);
          const idx = groupIds.indexOf(state.activeGroupId);
          state.setActiveGroup(groupIds[(idx + 1) % groupIds.length]);
          break;
        }
        case "prev_session": {
          const groupIds = Object.keys(state.groups);
          const idx = groupIds.indexOf(state.activeGroupId);
          state.setActiveGroup(
            groupIds[(idx - 1 + groupIds.length) % groupIds.length]
          );
          break;
        }
      }
    });

    return () => {
      unlisten.then((fn) => fn());
      mq.removeEventListener("change", handleChange);
    };
  }, []);

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        width: "100vw",
        overflow: "hidden",
        background: theme.bg,
      }}
    >
      {sideMenuVisible && <SideMenu />}

      {/* Sidebar toggle button — always visible */}
      {!sideMenuVisible && (
        <button
          onClick={toggleSideMenu}
          title="Show Sidebar (Cmd+E)"
          style={{
            position: "absolute",
            top: 8,
            left: 8,
            zIndex: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 28,
            height: 28,
            background: theme.bgButton,
            border: `1px solid ${theme.border}`,
            borderRadius: 6,
            color: theme.textMuted,
            cursor: "pointer",
            backdropFilter: "blur(8px)",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <rect x="1" y="1" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.2" />
            <line x1="5" y1="1" x2="5" y2="13" stroke="currentColor" strokeWidth="1.2" />
            <path d="M7.5 5.5L9 7l-1.5 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          overflow: "hidden",
          minWidth: 0,
          position: "relative",
        }}
      >
        {Object.entries(groups).map(([groupId, group]) => {
          const isActive = groupId === activeGroupId;
          return (
            <div
              key={groupId}
              style={{
                position: isActive ? "relative" : "absolute",
                width: "100%",
                height: "100%",
                overflow: "hidden",
                visibility: isActive ? "visible" : "hidden",
                ...(isActive
                  ? { flex: 1 }
                  : { top: 0, left: 0, pointerEvents: "none" }),
              }}
            >
              {group.tree ? (
                <GroupContent
                  groupId={groupId}
                  tree={group.tree}
                  zoomedPaneId={isActive ? zoomedPaneId : null}
                />
              ) : (
                isActive && <EmptySession groupId={groupId} />
              )}
            </div>
          );
        })}
      </div>

      {browserVisible && <BrowserPanel />}
      {infoPanelVisible && <InfoPanel />}
      {settingsVisible && <Settings />}

      {splashVisible && (
        <div className={`splash-screen${splashFading ? " fade-out" : ""}`}>
          <img src="/app-icon.png" alt="LumaTerm" className="splash-logo" />
        </div>
      )}
    </div>
  );
}
