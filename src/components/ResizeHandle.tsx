import { useCallback, useRef } from "react";

interface ResizeHandleProps {
  direction: "vertical" | "horizontal";
  position: "left" | "right" | "top" | "bottom";
  onResize: (size: number) => void;
}

export function ResizeHandle({ direction, position, onResize }: ResizeHandleProps) {
  const handleRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const parent = handleRef.current?.parentElement;
      if (!parent) return;

      const startWidth = parent.offsetWidth;
      const startHeight = parent.offsetHeight;

      const onMouseMove = (ev: MouseEvent) => {
        if (direction === "vertical") {
          const delta = position === "right"
            ? ev.clientX - startX
            : startX - ev.clientX;
          onResize(startWidth + delta);
        } else {
          const delta = position === "bottom"
            ? ev.clientY - startY
            : startY - ev.clientY;
          onResize(startHeight + delta);
        }
      };

      const onMouseUp = () => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.body.style.cursor = direction === "vertical" ? "col-resize" : "row-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [direction, position, onResize]
  );

  const isVertical = direction === "vertical";
  const posStyle: React.CSSProperties = {};
  if (position === "right") { posStyle.right = 0; posStyle.top = 0; posStyle.bottom = 0; }
  else if (position === "left") { posStyle.left = 0; posStyle.top = 0; posStyle.bottom = 0; }
  else if (position === "top") { posStyle.top = 0; posStyle.left = 0; posStyle.right = 0; }
  else { posStyle.bottom = 0; posStyle.left = 0; posStyle.right = 0; }

  return (
    <div
      ref={handleRef}
      onMouseDown={handleMouseDown}
      style={{
        position: "absolute",
        zIndex: 10,
        ...posStyle,
        width: isVertical ? 4 : undefined,
        height: isVertical ? undefined : 4,
        cursor: isVertical ? "col-resize" : "row-resize",
      }}
    />
  );
}
