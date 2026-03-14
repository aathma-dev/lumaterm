export type ThemeMode = "dark" | "light" | "system";

export interface AppTheme {
  // Backgrounds
  bg: string;
  bgSidebar: string;
  bgTerminal: string;
  bgInput: string;
  bgButton: string;
  bgButtonHover: string;
  bgActiveItem: string;
  bgHover: string;

  // Borders
  border: string;
  borderActive: string;

  // Text
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textAccent: string;

  // Accent
  accent: string;
  accentBg: string;
  accentBorder: string;
  accentBgHover: string;

  // Terminal
  terminal: {
    background: string;
    foreground: string;
    cursor: string;
    selectionBackground: string;
    black: string;
    red: string;
    green: string;
    yellow: string;
    blue: string;
    magenta: string;
    cyan: string;
    white: string;
    brightBlack: string;
    brightRed: string;
    brightGreen: string;
    brightYellow: string;
    brightBlue: string;
    brightMagenta: string;
    brightCyan: string;
    brightWhite: string;
  };

  // Scrollbar
  scrollThumb: string;
  scrollThumbHover: string;

  // Context menu
  bgContextMenu: string;
  bgContextMenuHover: string;

  // Danger
  danger: string;
}

export const darkTheme: AppTheme = {
  bg: "#1a1b26",
  bgSidebar: "#16161e",
  bgTerminal: "#1a1b26",
  bgInput: "rgba(255,255,255,0.04)",
  bgButton: "rgba(255,255,255,0.04)",
  bgButtonHover: "rgba(255,255,255,0.08)",
  bgActiveItem: "rgba(122, 162, 247, 0.1)",
  bgHover: "rgba(255,255,255,0.03)",

  border: "rgba(65, 72, 104, 0.4)",
  borderActive: "rgba(122, 162, 247, 0.5)",

  textPrimary: "#c0caf5",
  textSecondary: "#a9b1d6",
  textMuted: "#565f89",
  textAccent: "#7dcfff",

  accent: "#7aa2f7",
  accentBg: "rgba(122, 162, 247, 0.1)",
  accentBorder: "rgba(122, 162, 247, 0.25)",
  accentBgHover: "rgba(122, 162, 247, 0.18)",

  terminal: {
    background: "#1a1b26",
    foreground: "#c0caf5",
    cursor: "#c0caf5",
    selectionBackground: "#33467c",
    black: "#15161e",
    red: "#f7768e",
    green: "#9ece6a",
    yellow: "#e0af68",
    blue: "#7aa2f7",
    magenta: "#bb9af7",
    cyan: "#7dcfff",
    white: "#a9b1d6",
    brightBlack: "#414868",
    brightRed: "#f7768e",
    brightGreen: "#9ece6a",
    brightYellow: "#e0af68",
    brightBlue: "#7aa2f7",
    brightMagenta: "#bb9af7",
    brightCyan: "#7dcfff",
    brightWhite: "#c0caf5",
  },

  scrollThumb: "rgba(65, 72, 104, 0.5)",
  scrollThumbHover: "rgba(86, 95, 137, 0.7)",

  bgContextMenu: "rgba(30, 32, 48, 0.95)",
  bgContextMenuHover: "rgba(122, 162, 247, 0.15)",

  danger: "#f7768e",
};

export const lightTheme: AppTheme = {
  bg: "#f5f5f5",
  bgSidebar: "#e8e8ec",
  bgTerminal: "#fafafa",
  bgInput: "rgba(0,0,0,0.04)",
  bgButton: "rgba(0,0,0,0.05)",
  bgButtonHover: "rgba(0,0,0,0.1)",
  bgActiveItem: "rgba(59, 130, 246, 0.1)",
  bgHover: "rgba(0,0,0,0.04)",

  border: "rgba(0, 0, 0, 0.12)",
  borderActive: "rgba(59, 130, 246, 0.5)",

  textPrimary: "#1e1e2e",
  textSecondary: "#4c4f69",
  textMuted: "#8c8fa1",
  textAccent: "#0369a1",

  accent: "#3b82f6",
  accentBg: "rgba(59, 130, 246, 0.08)",
  accentBorder: "rgba(59, 130, 246, 0.25)",
  accentBgHover: "rgba(59, 130, 246, 0.15)",

  terminal: {
    background: "#fafafa",
    foreground: "#1e1e2e",
    cursor: "#1e1e2e",
    selectionBackground: "rgba(59, 130, 246, 0.2)",
    black: "#5c5f77",
    red: "#d20f39",
    green: "#40a02b",
    yellow: "#df8e1d",
    blue: "#1e66f5",
    magenta: "#8839ef",
    cyan: "#179299",
    white: "#dce0e8",
    brightBlack: "#6c6f85",
    brightRed: "#d20f39",
    brightGreen: "#40a02b",
    brightYellow: "#df8e1d",
    brightBlue: "#1e66f5",
    brightMagenta: "#8839ef",
    brightCyan: "#179299",
    brightWhite: "#4c4f69",
  },

  scrollThumb: "rgba(0, 0, 0, 0.15)",
  scrollThumbHover: "rgba(0, 0, 0, 0.25)",

  bgContextMenu: "rgba(255, 255, 255, 0.96)",
  bgContextMenuHover: "rgba(59, 130, 246, 0.1)",

  danger: "#d20f39",
};

export function getResolvedTheme(mode: ThemeMode, systemDark: boolean): AppTheme {
  if (mode === "system") return systemDark ? darkTheme : lightTheme;
  return mode === "dark" ? darkTheme : lightTheme;
}
