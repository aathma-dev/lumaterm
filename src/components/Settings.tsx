import { useEffect, useCallback } from "react";
import { useAppStore } from "../state/store";
import { ThemeMode } from "../lib/theme";

const FONT_OPTIONS = [
  { label: "SF Mono (default)", value: "'SF Mono', 'JetBrains Mono', 'Fira Code', Menlo, Monaco, monospace" },
  { label: "JetBrains Mono", value: "'JetBrains Mono', monospace" },
  { label: "Fira Code", value: "'Fira Code', monospace" },
  { label: "Menlo", value: "Menlo, Monaco, monospace" },
  { label: "Monaco", value: "Monaco, monospace" },
  { label: "Cascadia Code", value: "'Cascadia Code', monospace" },
  { label: "Source Code Pro", value: "'Source Code Pro', monospace" },
  { label: "IBM Plex Mono", value: "'IBM Plex Mono', monospace" },
  { label: "Courier New", value: "'Courier New', monospace" },
];

const SHORTCUTS = [
  {
    group: "Shell",
    items: [
      { label: "New Terminal", shortcut: "\u2318N" },
      { label: "New Session", shortcut: "\u2318T" },
      { label: "Close Terminal", shortcut: "\u2318W" },
      { label: "Close Session", shortcut: "\u2318\u21e7W" },
    ],
  },
  {
    group: "View",
    items: [
      { label: "Split Vertically", shortcut: "\u2318D" },
      { label: "Split Horizontally", shortcut: "\u2318\u21e7D" },
      { label: "Zoom Pane", shortcut: "\u2318\u21e7\u21b5" },
      { label: "Toggle Sidebar", shortcut: "\u2318E" },
      { label: "Toggle Browser", shortcut: "\u2318B" },
      { label: "Toggle Git Panel", shortcut: "\u2318G" },
      { label: "Toggle Theme", shortcut: "\u2318\u21e7T" },
      { label: "Settings", shortcut: "\u2318," },
    ],
  },
  {
    group: "Navigate",
    items: [
      { label: "Focus Pane Above", shortcut: "\u2318\u2325\u2191" },
      { label: "Focus Pane Below", shortcut: "\u2318\u2325\u2193" },
      { label: "Focus Pane Left", shortcut: "\u2318\u2325\u2190" },
      { label: "Focus Pane Right", shortcut: "\u2318\u2325\u2192" },
      { label: "Next Pane", shortcut: "\u2318]" },
      { label: "Previous Pane", shortcut: "\u2318[" },
    ],
  },
  {
    group: "Window",
    items: [
      { label: "Next Session", shortcut: "\u2318\u21e7]" },
      { label: "Previous Session", shortcut: "\u2318\u21e7[" },
    ],
  },
];

const SF = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', system-ui, sans-serif";

export function Settings() {
  const t = useAppStore((s) => s.theme);
  const toggleSettings = useAppStore((s) => s.toggleSettings);
  const fontFamily = useAppStore((s) => s.fontFamily);
  const fontSize = useAppStore((s) => s.fontSize);
  const scrollbackLimit = useAppStore((s) => s.scrollbackLimit);
  const restoreLines = useAppStore((s) => s.restoreLines);
  const themeMode = useAppStore((s) => s.themeMode);
  const setFontFamily = useAppStore((s) => s.setFontFamily);
  const setFontSize = useAppStore((s) => s.setFontSize);
  const setScrollbackLimit = useAppStore((s) => s.setScrollbackLimit);
  const setRestoreLines = useAppStore((s) => s.setRestoreLines);
  const showStatusBar = useAppStore((s) => s.showStatusBar);
  const setShowStatusBar = useAppStore((s) => s.setShowStatusBar);
  const setThemeMode = useAppStore((s) => s.setThemeMode);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") toggleSettings();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [toggleSettings]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) toggleSettings();
    },
    [toggleSettings]
  );

  // -- macOS-style reusable styles --

  const cardStyle: React.CSSProperties = {
    background: t.bgInput,
    border: `0.5px solid ${t.border}`,
    borderRadius: 10,
    overflow: "hidden",
    marginBottom: 20,
  };

  const rowStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 44,
    padding: "8px 16px",
    fontFamily: SF,
    fontSize: 13,
    color: t.textPrimary,
  };

  const separatorStyle: React.CSSProperties = {
    height: 0.5,
    background: t.border,
    marginLeft: 16,
  };

  const groupLabelStyle: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 400,
    color: t.textMuted,
    padding: "24px 16px 8px",
    fontFamily: SF,
  };

  const selectStyle: React.CSSProperties = {
    background: "transparent",
    border: "none",
    color: t.accent,
    fontSize: 13,
    fontFamily: SF,
    cursor: "pointer",
    textAlign: "right" as const,
    outline: "none",
    appearance: "none" as const,
    paddingRight: 16,
    backgroundImage: `url("data:image/svg+xml,%3Csvg width='8' height='5' viewBox='0 0 8 5' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l3 3 3-3' stroke='%23888' stroke-width='1.2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right 0 center",
  };

  const stepperStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 0,
    border: `0.5px solid ${t.border}`,
    borderRadius: 7,
    overflow: "hidden",
    background: t.bgSidebar,
  };

  const stepperBtnStyle: React.CSSProperties = {
    width: 30,
    height: 28,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "transparent",
    border: "none",
    color: t.accent,
    fontSize: 16,
    fontWeight: 400,
    cursor: "pointer",
    fontFamily: SF,
  };

  const stepperValueStyle: React.CSSProperties = {
    minWidth: 36,
    textAlign: "center" as const,
    fontSize: 13,
    fontFamily: SF,
    color: t.textPrimary,
    borderLeft: `0.5px solid ${t.border}`,
    borderRight: `0.5px solid ${t.border}`,
    padding: "4px 0",
  };

  const toggleBg = (on: boolean) => on ? t.accent : (t.bgButton);
  const toggleKnob = (on: boolean): React.CSSProperties => ({
    width: 21,
    height: 21,
    borderRadius: "50%",
    background: "#fff",
    boxShadow: "0 1px 3px rgba(0,0,0,0.3), 0 0 1px rgba(0,0,0,0.1)",
    position: "absolute",
    top: 1.5,
    left: on ? 20 : 1.5,
    transition: "left 0.2s ease",
  });

  return (
    <div
      onClick={handleBackdropClick}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
      }}
    >
      <div
        style={{
          width: 580,
          maxHeight: "85vh",
          background: t.bgSidebar,
          borderRadius: 14,
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 24px 80px rgba(0,0,0,0.35), 0 0 0 0.5px rgba(255,255,255,0.05)",
          fontFamily: SF,
        }}
      >
        {/* Toolbar / Title bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
            height: 52,
            borderBottom: `0.5px solid ${t.border}`,
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 600, color: t.textPrimary }}>
            Settings
          </span>
          <button
            onClick={toggleSettings}
            style={{
              position: "absolute",
              right: 16,
              background: "transparent",
              border: "none",
              color: t.textMuted,
              fontSize: 20,
              cursor: "pointer",
              padding: "2px 6px",
              borderRadius: 6,
              lineHeight: 1,
              fontFamily: SF,
            }}
          >
            ×
          </button>
        </div>

        {/* Scrollable content */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "4px 24px 24px",
          }}
        >
          {/* ── Font ── */}
          <div style={groupLabelStyle}>Font</div>
          <div style={cardStyle}>
            {/* Font Family */}
            <div style={rowStyle}>
              <span>Family</span>
              <select
                value={fontFamily}
                onChange={(e) => setFontFamily(e.target.value)}
                style={selectStyle}
              >
                {FONT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div style={separatorStyle} />
            {/* Font Size */}
            <div style={rowStyle}>
              <span>Size</span>
              <div style={stepperStyle}>
                <button
                  onClick={() => setFontSize(fontSize - 1)}
                  style={stepperBtnStyle}
                >
                  −
                </button>
                <div style={stepperValueStyle}>{fontSize}</div>
                <button
                  onClick={() => setFontSize(fontSize + 1)}
                  style={stepperBtnStyle}
                >
                  +
                </button>
              </div>
            </div>
          </div>

          {/* Font Preview */}
          <div
            style={{
              background: t.terminal.background,
              border: `0.5px solid ${t.border}`,
              borderRadius: 10,
              padding: "14px 16px",
              fontFamily: fontFamily,
              fontSize: fontSize,
              color: t.terminal.foreground,
              lineHeight: 1.5,
              overflow: "hidden",
              marginBottom: 20,
            }}
          >
            <div>
              <span style={{ color: t.terminal.green }}>user@mac</span>
              <span style={{ color: t.terminal.white }}>:</span>
              <span style={{ color: t.terminal.blue }}>~/projects</span>
              <span style={{ color: t.terminal.white }}>$ </span>
              <span>echo "Hello, world!"</span>
            </div>
            <div>Hello, world!</div>
            <div style={{ color: t.terminal.brightBlack }}>
              ABCDEFGHIJKLM 0123456789 {"{}[]()"}
            </div>
          </div>

          {/* ── Appearance ── */}
          <div style={groupLabelStyle}>Appearance</div>
          <div style={cardStyle}>
            {/* Theme */}
            <div style={rowStyle}>
              <span>Theme</span>
              <div
                style={{
                  display: "flex",
                  border: `0.5px solid ${t.border}`,
                  borderRadius: 7,
                  overflow: "hidden",
                  background: t.bgSidebar,
                }}
              >
                {(["system", "dark", "light"] as ThemeMode[]).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setThemeMode(mode)}
                    style={{
                      padding: "5px 14px",
                      fontSize: 12,
                      fontWeight: themeMode === mode ? 600 : 400,
                      cursor: "pointer",
                      border: "none",
                      borderLeft: mode !== "system" ? `0.5px solid ${t.border}` : "none",
                      background: themeMode === mode ? t.accent : "transparent",
                      color: themeMode === mode ? "#fff" : t.textSecondary,
                      fontFamily: SF,
                      transition: "all 0.15s",
                    }}
                  >
                    {mode.charAt(0).toUpperCase() + mode.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div style={separatorStyle} />
            {/* Status Bar Toggle */}
            <div style={rowStyle}>
              <div>
                <div>Status Bar</div>
                <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>
                  Controls and info at the bottom of each pane
                </div>
              </div>
              <button
                onClick={() => setShowStatusBar(!showStatusBar)}
                style={{
                  width: 42,
                  height: 25,
                  borderRadius: 12.5,
                  border: "none",
                  cursor: "pointer",
                  position: "relative",
                  background: toggleBg(showStatusBar),
                  transition: "background 0.2s ease",
                  flexShrink: 0,
                }}
              >
                <div style={toggleKnob(showStatusBar)} />
              </button>
            </div>
          </div>

          {/* ── Buffer ── */}
          <div style={groupLabelStyle}>Buffer</div>
          <div style={cardStyle}>
            {/* Scrollback */}
            <div style={rowStyle}>
              <div>
                <div>Scrollback Limit</div>
                <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>
                  Lines kept in buffer (100 – 100,000)
                </div>
              </div>
              <div style={stepperStyle}>
                <button
                  onClick={() => setScrollbackLimit(scrollbackLimit - 1000)}
                  style={stepperBtnStyle}
                >
                  −
                </button>
                <div style={{ ...stepperValueStyle, minWidth: 52 }}>
                  {scrollbackLimit.toLocaleString()}
                </div>
                <button
                  onClick={() => setScrollbackLimit(scrollbackLimit + 1000)}
                  style={stepperBtnStyle}
                >
                  +
                </button>
              </div>
            </div>
            <div style={separatorStyle} />
            {/* Restore Lines */}
            <div style={rowStyle}>
              <div>
                <div>Lines to Restore</div>
                <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>
                  Output restored when reopening (0 = off)
                </div>
              </div>
              <div style={stepperStyle}>
                <button
                  onClick={() => setRestoreLines(restoreLines - 50)}
                  style={stepperBtnStyle}
                >
                  −
                </button>
                <div style={{ ...stepperValueStyle, minWidth: 44 }}>
                  {restoreLines}
                </div>
                <button
                  onClick={() => setRestoreLines(restoreLines + 50)}
                  style={stepperBtnStyle}
                >
                  +
                </button>
              </div>
            </div>
          </div>

          {/* ── Keyboard Shortcuts ── */}
          <div style={groupLabelStyle}>Keyboard Shortcuts</div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
              marginBottom: 20,
            }}
          >
            {SHORTCUTS.map((group) => (
              <div key={group.group} style={cardStyle}>
                {/* Card header */}
                <div
                  style={{
                    padding: "10px 16px 8px",
                    fontSize: 11,
                    fontWeight: 600,
                    color: t.textMuted,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    fontFamily: SF,
                  }}
                >
                  {group.group}
                </div>
                {group.items.map((item) => (
                  <div key={item.label}>
                    <div style={separatorStyle} />
                    <div
                      style={{
                        ...rowStyle,
                        minHeight: 40,
                        padding: "6px 16px",
                      }}
                    >
                      <span style={{ fontSize: 13, color: t.textPrimary }}>
                        {item.label}
                      </span>
                      <kbd
                        style={{
                          fontSize: 12,
                          fontFamily: "'SF Mono', Menlo, monospace",
                          color: t.textSecondary,
                          background: t.bgSidebar,
                          padding: "3px 8px",
                          borderRadius: 5,
                          border: `0.5px solid ${t.border}`,
                          boxShadow: "0 1px 0 rgba(0,0,0,0.12)",
                          lineHeight: "18px",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {item.shortcut}
                      </kbd>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
          {/* ── Footer Logo ── */}
          <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 4px" }}>
            <img src="/app-icon.png" alt="LumaTerm" style={{ width: 40, height: 40 }} />
          </div>
        </div>
      </div>
    </div>
  );
}
