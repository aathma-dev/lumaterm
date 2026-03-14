import { useCallback, useRef, useState } from "react";
import { Direction } from "../types";
import { useAppStore } from "../state/store";

interface SplitDividerProps {
  direction: Direction;
  onResize: (ratio: number) => void;
}

export function SplitDivider({ direction, onResize }: SplitDividerProps) {
  const dividerRef = useRef<HTMLDivElement>(null);
  const theme = useAppStore((s) => s.theme);
  const [dragging, setDragging] = useState(false);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const parent = dividerRef.current?.parentElement;
      if (!parent) return;

      const rect = parent.getBoundingClientRect();
      setDragging(true);

      const onMouseMove = (ev: MouseEvent) => {
        let ratio: number;
        if (direction === "horizontal") {
          ratio = (ev.clientY - rect.top) / rect.height;
        } else {
          ratio = (ev.clientX - rect.left) / rect.width;
        }
        onResize(Math.max(0.1, Math.min(0.9, ratio)));
      };

      const onMouseUp = () => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        setDragging(false);
      };

      document.body.style.cursor =
        direction === "horizontal" ? "row-resize" : "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [direction, onResize]
  );

  const isHorizontal = direction === "horizontal";

  return (
    <div
      ref={dividerRef}
      onMouseDown={handleMouseDown}
      style={{
        flexShrink: 0,
        position: "relative",
        cursor: isHorizontal ? "row-resize" : "col-resize",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        ...(isHorizontal
          ? { height: 6, width: "100%", padding: "2px 0" }
          : { width: 6, height: "100%", padding: "0 2px" }),
      }}
    >
      {/* Visible handle */}
      <div
        style={{
          borderRadius: 3,
          background: dragging ? theme.accent : "transparent",
          border: `1px solid ${dragging ? theme.accent : theme.border}`,
          transition: "background 0.15s, border-color 0.15s",
          boxSizing: "border-box" as const,
          ...(isHorizontal
            ? { width: 48, height: 4 }
            : { height: 48, width: 4 }),
        }}
      />
    </div>
  );
}
