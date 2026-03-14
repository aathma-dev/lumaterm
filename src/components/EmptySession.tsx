import { useState, useCallback } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useAppStore } from "../state/store";

interface EmptySessionProps {
  groupId: string;
}

export function EmptySession({ groupId }: EmptySessionProps) {
  const addTerminal = useAppStore((s) => s.addTerminal);
  const setGroupCwd = useAppStore((s) => s.setGroupCwd);
  const groups = useAppStore((s) => s.groups);
  const group = groups[groupId];
  const hasCwdSet = !!group?.cwd;
  const t = useAppStore((s) => s.theme);

  const [picking, setPicking] = useState(false);

  const handlePickFolder = useCallback(async () => {
    setPicking(true);
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Choose working directory for this session",
      });
      if (selected) {
        setGroupCwd(groupId, selected as string);
      }
    } finally {
      setPicking(false);
    }
  }, [groupId, setGroupCwd]);

  const handleCreate = useCallback(() => {
    addTerminal(groupId);
  }, [addTerminal, groupId]);

  const buttonStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: t.accentBg,
    border: `1px solid ${t.accentBorder}`,
    color: t.accent,
    padding: "8px 20px",
    borderRadius: 8,
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 500,
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif",
    transition: "all 0.15s",
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        gap: 16,
        color: t.textMuted,
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif",
      }}
    >
      <svg
        width="48"
        height="48"
        viewBox="0 0 48 48"
        fill="none"
        style={{ color: t.textMuted, opacity: 0.6 }}
      >
        <rect x="4" y="8" width="40" height="32" rx="4" stroke="currentColor" strokeWidth="2" />
        <path d="M14 20l6 5-6 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M24 30h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>

      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 15, color: t.textSecondary, marginBottom: 4 }}>
          {group?.name || "Session"}
        </div>
        <div style={{ fontSize: 13 }}>
          {hasCwdSet
            ? `Working directory: ${group.cwd}`
            : "Choose a working directory to get started"}
        </div>
      </div>

      {!hasCwdSet ? (
        <button
          onClick={handlePickFolder}
          disabled={picking}
          style={buttonStyle}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = t.accentBgHover;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = t.accentBg;
          }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M1.5 3.5C1.5 2.95 1.95 2.5 2.5 2.5H5.5L7 4H11.5C12.05 4 12.5 4.45 12.5 5V10.5C12.5 11.05 12.05 11.5 11.5 11.5H2.5C1.95 11.5 1.5 11.05 1.5 10.5V3.5Z"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {picking ? "Opening..." : "Choose Folder"}
        </button>
      ) : (
        <>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={handleCreate}
              style={buttonStyle}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = t.accentBgHover;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = t.accentBg;
              }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <line x1="7" y1="2" x2="7" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="2" y1="7" x2="12" y2="7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              New Terminal
            </button>
            <button
              onClick={handlePickFolder}
              disabled={picking}
              style={{
                ...buttonStyle,
                background: t.bgButton,
                border: `1px solid ${t.border}`,
                color: t.textMuted,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = t.bgButtonHover;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = t.bgButton;
              }}
            >
              Change Folder
            </button>
          </div>
          <div style={{ fontSize: 11, color: t.textMuted, opacity: 0.7 }}>
            or press Cmd+N
          </div>
        </>
      )}
    </div>
  );
}
