import { useEffect, useRef, useCallback } from "react";
import { useAppStore } from "../state/store";

interface PaneContextMenuProps {
  paneId: string;
  x: number;
  y: number;
  onClose: () => void;
}

interface MenuItem {
  label: string;
  shortcut?: string;
  action: () => void;
  separator?: false;
}

interface SeparatorItem {
  separator: true;
}

type MenuEntry = MenuItem | SeparatorItem;

export function PaneContextMenu({
  paneId,
  x,
  y,
  onClose,
}: PaneContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const splitPane = useAppStore((s) => s.splitPane);
  const removePaneFromGroup = useAppStore((s) => s.removePaneFromGroup);
  const activeGroupId = useAppStore((s) => s.activeGroupId);
  const toggleZoom = useAppStore((s) => s.toggleZoom);
  const zoomedPaneId = useAppStore((s) => s.zoomedPaneId);
  const t = useAppStore((s) => s.theme);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  const items: MenuEntry[] = [
    {
      label: "Split Vertically",
      shortcut: "\u2318D",
      action: () => {
        splitPane(paneId, "vertical");
        onClose();
      },
    },
    {
      label: "Split Horizontally",
      shortcut: "\u2318\u21e7D",
      action: () => {
        splitPane(paneId, "horizontal");
        onClose();
      },
    },
    { separator: true },
    {
      label: zoomedPaneId ? "Unzoom Pane" : "Zoom Pane",
      shortcut: "\u2318\u21e7\u21b5",
      action: () => {
        toggleZoom();
        onClose();
      },
    },
    { separator: true },
    {
      label: "Close Pane",
      shortcut: "\u2318W",
      action: () => {
        removePaneFromGroup(activeGroupId, paneId);
        onClose();
      },
    },
  ];

  const menuWidth = 200;
  const menuHeight = items.length * 32;
  const adjustedX = x + menuWidth > window.innerWidth ? x - menuWidth : x;
  const adjustedY = y + menuHeight > window.innerHeight ? y - menuHeight : y;

  return (
    <div
      ref={menuRef}
      style={{
        position: "fixed",
        left: adjustedX,
        top: adjustedY,
        zIndex: 9999,
        background: t.bgContextMenu,
        border: `1px solid ${t.border}`,
        borderRadius: 8,
        padding: "4px 0",
        minWidth: menuWidth,
        backdropFilter: "blur(12px)",
        boxShadow:
          "0 8px 32px rgba(0, 0, 0, 0.25), 0 2px 8px rgba(0, 0, 0, 0.15)",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif",
      }}
    >
      {items.map((item, i) =>
        "separator" in item && item.separator ? (
          <div
            key={i}
            style={{
              height: 1,
              background: t.border,
              margin: "4px 8px",
            }}
          />
        ) : (
          <ContextMenuItem
            key={i}
            label={(item as MenuItem).label}
            shortcut={(item as MenuItem).shortcut}
            action={(item as MenuItem).action}
            hoverBg={t.bgContextMenuHover}
            textColor={t.textPrimary}
            shortcutColor={t.textMuted}
          />
        )
      )}
    </div>
  );
}

function ContextMenuItem({
  label,
  shortcut,
  action,
  hoverBg,
  textColor,
  shortcutColor,
}: {
  label: string;
  shortcut?: string;
  action: () => void;
  hoverBg: string;
  textColor: string;
  shortcutColor: string;
}) {
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      action();
    },
    [action]
  );

  return (
    <div
      onClick={handleClick}
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "6px 12px",
        fontSize: 13,
        color: textColor,
        cursor: "pointer",
        transition: "background 0.1s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = hoverBg;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
    >
      <span>{label}</span>
      {shortcut && (
        <span style={{ color: shortcutColor, fontSize: 12, marginLeft: 24 }}>
          {shortcut}
        </span>
      )}
    </div>
  );
}
