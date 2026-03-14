import { create } from "zustand";
import { persist } from "zustand/middleware";
import { invoke } from "@tauri-apps/api/core";
import { TermGroup, SplitNode, Direction } from "../types";
import {
  generatePaneId,
  splitNode,
  removeNode,
  findAllPaneIds,
  findPaneInDirection,
} from "../lib/split-tree";
import { ThemeMode, AppTheme, getResolvedTheme } from "../lib/theme";

function syncWindowTheme(mode: ThemeMode, systemDark: boolean) {
  // Tell Tauri to update the native window theme (title bar, menu bar)
  const resolved = mode === "system" ? (systemDark ? "dark" : "light") : mode;
  invoke("set_window_theme", { theme: mode === "system" ? "system" : resolved }).catch(() => {});
}

type NavDirection = "up" | "down" | "left" | "right";

interface AppState {
  groups: Record<string, TermGroup>;
  activeGroupId: string;
  activePaneId: string | null;
  browserVisible: boolean;
  browserUrl: string;
  sideMenuVisible: boolean;
  sideMenuWidth: number;
  browserWidth: number;
  homedir: string;
  zoomedPaneId: string | null;
  themeMode: ThemeMode;
  systemDark: boolean;
  theme: AppTheme;

  // Settings
  settingsVisible: boolean;
  fontFamily: string;
  fontSize: number;
  scrollbackLimit: number;
  restoreLines: number;
  showStatusBar: boolean;
  shellPath: string; // empty string = system default

  // Init
  setHomedir: (dir: string) => void;

  // Group / session actions
  createGroup: (cwd?: string) => void;
  removeGroup: (groupId: string) => string[];
  setActiveGroup: (groupId: string) => void;
  renameGroup: (groupId: string, name: string) => void;
  setGroupCwd: (groupId: string, cwd: string) => void;

  // Terminal / pane actions
  addTerminal: (groupId: string) => string;
  addPane: (groupId: string, paneId: string, ptyId: number) => void;
  removePaneFromGroup: (groupId: string, paneId: string) => string[];
  setActivePaneId: (paneId: string) => void;
  splitPane: (
    paneId: string,
    direction: Direction
  ) => { newPaneId: string } | null;
  updateTree: (groupId: string, tree: SplitNode) => void;

  // Navigation (Terminator-style)
  focusPaneInDirection: (direction: NavDirection) => void;
  focusNextPane: () => void;
  focusPrevPane: () => void;
  toggleZoom: () => void;

  // Browser
  toggleBrowser: () => void;
  setBrowserUrl: (url: string) => void;
  setBrowserWidth: (width: number) => void;

  // Git panel (legacy - kept for backwards compat)
  gitPanelVisible: boolean;
  gitPanelWidth: number;
  toggleGitPanel: () => void;
  setGitPanelWidth: (width: number) => void;

  // Docker panel (legacy)
  dockerPanelVisible: boolean;
  dockerPanelWidth: number;
  toggleDockerPanel: () => void;
  setDockerPanelWidth: (width: number) => void;

  // Unified info panel
  infoPanelVisible: boolean;
  infoPanelWidth: number;
  infoPanelTab: string;
  toggleInfoPanel: () => void;
  setInfoPanelWidth: (width: number) => void;
  setInfoPanelTab: (tab: string) => void;

  // Side menu
  toggleSideMenu: () => void;
  setSideMenuWidth: (width: number) => void;

  // Theme
  setThemeMode: (mode: ThemeMode) => void;
  cycleTheme: () => void;
  setSystemDark: (dark: boolean) => void;

  // Settings actions
  toggleSettings: () => void;
  setFontFamily: (font: string) => void;
  setFontSize: (size: number) => void;
  setScrollbackLimit: (limit: number) => void;
  setRestoreLines: (lines: number) => void;
  setShowStatusBar: (show: boolean) => void;
  setShellPath: (path: string) => void;
  setPaneFontSize: (groupId: string, paneId: string, size: number | null) => void;
}

function makeGroupId() {
  return `group-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

const initialGroupId = makeGroupId();
const initialSystemDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true;

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      groups: {
        [initialGroupId]: {
          id: initialGroupId,
          name: "Session 1",
          cwd: "",
          tree: null,
          panes: {},
        },
      },
      activeGroupId: initialGroupId,
      activePaneId: null,
      browserVisible: false,
      browserUrl: "",
      sideMenuVisible: true,
      sideMenuWidth: 220,
      browserWidth: 420,
      gitPanelVisible: false,
      gitPanelWidth: 360,
      dockerPanelVisible: false,
      dockerPanelWidth: 380,
      infoPanelVisible: true,
      infoPanelWidth: 380,
      infoPanelTab: "system",
      homedir: "~",
      zoomedPaneId: null,
      themeMode: "system" as ThemeMode,
      systemDark: initialSystemDark,
      theme: getResolvedTheme("system", initialSystemDark),

      // Settings defaults
      settingsVisible: false,
      fontFamily: "'SF Mono', 'JetBrains Mono', 'Fira Code', Menlo, Monaco, monospace",
      fontSize: 14,
      scrollbackLimit: 5000,
      restoreLines: 100,
      showStatusBar: true,
      shellPath: "",

      setHomedir: (dir) => {
        set({ homedir: dir });
      },

      createGroup: (cwd?: string) => {
        const state = get();
        const resolvedCwd = cwd || "";
        const groupId = makeGroupId();
        const groupCount = Object.keys(state.groups).length;
        const group: TermGroup = {
          id: groupId,
          name: `Session ${groupCount + 1}`,
          cwd: resolvedCwd,
          tree: null,
          panes: {},
        };
        set((s) => ({
          groups: { ...s.groups, [groupId]: group },
          activeGroupId: groupId,
          activePaneId: null,
          zoomedPaneId: null,
        }));
      },

      removeGroup: (groupId) => {
        const state = get();
        const group = state.groups[groupId];
        if (!group) return [];

        const paneIds = group.tree ? findAllPaneIds(group.tree) : [];
        const remaining = { ...state.groups };
        delete remaining[groupId];

        const keys = Object.keys(remaining);
        if (keys.length === 0) {
          const newId = makeGroupId();
          const newGroup: TermGroup = {
            id: newId,
            name: "Session 1",
            cwd: "",
            tree: null,
            panes: {},
          };
          set({
            groups: { [newId]: newGroup },
            activeGroupId: newId,
            activePaneId: null,
            zoomedPaneId: null,
          });
        } else {
          const newActive =
            state.activeGroupId === groupId ? keys[0] : state.activeGroupId;
          const newActiveGroup = remaining[newActive];
          set({
            groups: remaining,
            activeGroupId: newActive,
            activePaneId: newActiveGroup.tree
              ? findAllPaneIds(newActiveGroup.tree)[0] || null
              : null,
            zoomedPaneId: null,
          });
        }
        return paneIds;
      },

      setActiveGroup: (groupId) => {
        const group = get().groups[groupId];
        if (group) {
          set({
            activeGroupId: groupId,
            activePaneId: group.tree
              ? findAllPaneIds(group.tree)[0] || null
              : null,
            zoomedPaneId: null,
          });
        }
      },

      renameGroup: (groupId, name) => {
        set((s) => ({
          groups: {
            ...s.groups,
            [groupId]: { ...s.groups[groupId], name },
          },
        }));
      },

      setGroupCwd: (groupId, cwd) => {
        set((s) => ({
          groups: {
            ...s.groups,
            [groupId]: { ...s.groups[groupId], cwd },
          },
        }));
      },

      addTerminal: (groupId) => {
        const state = get();
        const group = state.groups[groupId];
        if (!group) return "";

        const paneId = generatePaneId();

        if (!group.tree) {
          set((s) => ({
            groups: {
              ...s.groups,
              [groupId]: {
                ...group,
                tree: { type: "leaf", paneId },
              },
            },
            activePaneId: paneId,
            zoomedPaneId: null,
          }));
        } else {
          const activePaneInGroup = state.activePaneId;
          const allPanes = findAllPaneIds(group.tree);
          const targetPane =
            activePaneInGroup && allPanes.includes(activePaneInGroup)
              ? activePaneInGroup
              : allPanes[allPanes.length - 1];

          const result = splitNode(group.tree, targetPane, "vertical");
          set((s) => ({
            groups: {
              ...s.groups,
              [groupId]: { ...group, tree: result.newTree },
            },
            activePaneId: result.newPaneId,
            zoomedPaneId: null,
          }));
          return result.newPaneId;
        }

        return paneId;
      },

      addPane: (groupId, paneId, ptyId) => {
        set((s) => {
          const group = s.groups[groupId];
          if (!group) return s;
          return {
            groups: {
              ...s.groups,
              [groupId]: {
                ...group,
                panes: {
                  ...group.panes,
                  [paneId]: { id: paneId, ptyId, title: "Terminal", fontSizeOverride: null },
                },
              },
            },
          };
        });
      },

      removePaneFromGroup: (groupId, paneId) => {
        const state = get();
        const group = state.groups[groupId];
        if (!group || !group.tree) return [];

        const newTree = removeNode(group.tree, paneId);
        const newPanes = { ...group.panes };
        delete newPanes[paneId];

        set((s) => ({
          groups: {
            ...s.groups,
            [groupId]: { ...group, tree: newTree, panes: newPanes },
          },
          activePaneId:
            s.activePaneId === paneId
              ? newTree
                ? findAllPaneIds(newTree)[0] || null
                : null
              : s.activePaneId,
          zoomedPaneId:
            s.zoomedPaneId === paneId ? null : s.zoomedPaneId,
        }));
        return [paneId];
      },

      setActivePaneId: (paneId) => set({ activePaneId: paneId }),

      splitPane: (paneId, direction) => {
        const state = get();
        const group = state.groups[state.activeGroupId];
        if (!group || !group.tree) return null;

        const { newTree, newPaneId } = splitNode(group.tree, paneId, direction);
        set((s) => ({
          groups: {
            ...s.groups,
            [s.activeGroupId]: { ...group, tree: newTree },
          },
          activePaneId: newPaneId,
          zoomedPaneId: null,
        }));
        return { newPaneId };
      },

      updateTree: (groupId, tree) => {
        set((s) => ({
          groups: {
            ...s.groups,
            [groupId]: { ...s.groups[groupId], tree },
          },
        }));
      },

      focusPaneInDirection: (direction) => {
        const state = get();
        const group = state.groups[state.activeGroupId];
        if (!group?.tree || !state.activePaneId) return;

        const target = findPaneInDirection(
          group.tree,
          state.activePaneId,
          direction
        );
        if (target) {
          set({ activePaneId: target });
        }
      },

      focusNextPane: () => {
        const state = get();
        const group = state.groups[state.activeGroupId];
        if (!group?.tree || !state.activePaneId) return;

        const allPanes = findAllPaneIds(group.tree);
        const idx = allPanes.indexOf(state.activePaneId);
        if (idx === -1) return;
        set({ activePaneId: allPanes[(idx + 1) % allPanes.length] });
      },

      focusPrevPane: () => {
        const state = get();
        const group = state.groups[state.activeGroupId];
        if (!group?.tree || !state.activePaneId) return;

        const allPanes = findAllPaneIds(group.tree);
        const idx = allPanes.indexOf(state.activePaneId);
        if (idx === -1) return;
        set({
          activePaneId:
            allPanes[(idx - 1 + allPanes.length) % allPanes.length],
        });
      },

      toggleZoom: () => {
        const state = get();
        if (state.zoomedPaneId) {
          set({ zoomedPaneId: null });
        } else if (state.activePaneId) {
          set({ zoomedPaneId: state.activePaneId });
        }
      },

      toggleBrowser: () =>
        set((s) => ({ browserVisible: !s.browserVisible })),
      setBrowserUrl: (url) => set({ browserUrl: url }),
      setBrowserWidth: (width) =>
        set({ browserWidth: Math.max(200, Math.min(800, width)) }),

      toggleGitPanel: () =>
        set((s) => ({ gitPanelVisible: !s.gitPanelVisible })),
      setGitPanelWidth: (width) =>
        set({ gitPanelWidth: Math.max(200, Math.min(800, width)) }),

      toggleDockerPanel: () =>
        set((s) => ({ dockerPanelVisible: !s.dockerPanelVisible })),
      setDockerPanelWidth: (width) =>
        set({ dockerPanelWidth: Math.max(200, Math.min(800, width)) }),

      toggleInfoPanel: () =>
        set((s) => ({ infoPanelVisible: !s.infoPanelVisible })),
      setInfoPanelWidth: (width) =>
        set({ infoPanelWidth: Math.max(250, Math.min(800, width)) }),
      setInfoPanelTab: (tab) =>
        set({ infoPanelTab: tab, infoPanelVisible: true }),

      toggleSideMenu: () =>
        set((s) => ({ sideMenuVisible: !s.sideMenuVisible })),
      setSideMenuWidth: (width) =>
        set({ sideMenuWidth: Math.max(150, Math.min(400, width)) }),

      setThemeMode: (mode) => {
        const state = get();
        set({
          themeMode: mode,
          theme: getResolvedTheme(mode, state.systemDark),
        });
        syncWindowTheme(mode, state.systemDark);
      },
      cycleTheme: () => {
        const state = get();
        const order: ThemeMode[] = ["system", "dark", "light"];
        const idx = order.indexOf(state.themeMode);
        const next = order[(idx + 1) % order.length];
        set({
          themeMode: next,
          theme: getResolvedTheme(next, state.systemDark),
        });
        syncWindowTheme(next, state.systemDark);
      },
      setSystemDark: (dark) => {
        const state = get();
        set({
          systemDark: dark,
          theme: getResolvedTheme(state.themeMode, dark),
        });
        syncWindowTheme(state.themeMode, dark);
      },

      // Settings
      toggleSettings: () =>
        set((s) => ({ settingsVisible: !s.settingsVisible })),
      setFontFamily: (font) => set({ fontFamily: font }),
      setFontSize: (size) =>
        set({ fontSize: Math.max(8, Math.min(32, size)) }),
      setScrollbackLimit: (limit) =>
        set({ scrollbackLimit: Math.max(100, Math.min(100000, limit)) }),
      setRestoreLines: (lines) =>
        set({ restoreLines: Math.max(0, Math.min(10000, lines)) }),
      setShowStatusBar: (show) => set({ showStatusBar: show }),
      setShellPath: (path) => set({ shellPath: path }),
      setPaneFontSize: (groupId, paneId, size) => {
        set((s) => {
          const group = s.groups[groupId];
          if (!group || !group.panes[paneId]) return s;
          const clamped = size === null ? null : Math.max(8, Math.min(32, size));
          return {
            groups: {
              ...s.groups,
              [groupId]: {
                ...group,
                panes: {
                  ...group.panes,
                  [paneId]: { ...group.panes[paneId], fontSizeOverride: clamped },
                },
              },
            },
          };
        });
      },
    }),
    {
      name: "lumaterm-state",
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Recompute theme from persisted themeMode + current system preference
          const systemDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true;
          state.systemDark = systemDark;
          state.theme = getResolvedTheme(state.themeMode, systemDark);
          syncWindowTheme(state.themeMode, systemDark);
        }
      },
      partialize: (state) => ({
        groups: Object.fromEntries(
          Object.entries(state.groups).map(([id, g]) => [
            id,
            { ...g, panes: {} },
          ])
        ),
        activeGroupId: state.activeGroupId,
        browserUrl: state.browserUrl,
        browserVisible: state.browserVisible,
        sideMenuVisible: state.sideMenuVisible,
        sideMenuWidth: state.sideMenuWidth,
        browserWidth: state.browserWidth,
        gitPanelVisible: state.gitPanelVisible,
        gitPanelWidth: state.gitPanelWidth,
        dockerPanelVisible: state.dockerPanelVisible,
        dockerPanelWidth: state.dockerPanelWidth,
        infoPanelVisible: state.infoPanelVisible,
        infoPanelWidth: state.infoPanelWidth,
        infoPanelTab: state.infoPanelTab,
        themeMode: state.themeMode,
        fontFamily: state.fontFamily,
        fontSize: state.fontSize,
        scrollbackLimit: state.scrollbackLimit,
        restoreLines: state.restoreLines,
        showStatusBar: state.showStatusBar,
        shellPath: state.shellPath,
      }),
    }
  )
);
