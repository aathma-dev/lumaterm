import { useCallback } from "react";
import { SplitNode } from "../types";
import { SplitDivider } from "./SplitDivider";
import { useAppStore } from "../state/store";
import { updateRatio } from "../lib/split-tree";

interface SplitContainerProps {
  node: SplitNode;
  groupId: string;
  path?: number[];
  zoomedPaneId?: string | null;
  getContainer: (paneId: string) => HTMLDivElement;
}

export function SplitContainer({
  node,
  groupId,
  path = [],
  zoomedPaneId,
  getContainer,
}: SplitContainerProps) {
  const groups = useAppStore((s) => s.groups);
  const updateTree = useAppStore((s) => s.updateTree);
  const theme = useAppStore((s) => s.theme);

  const handleResize = useCallback(
    (newRatio: number) => {
      const group = groups[groupId];
      if (!group) return;
      if (!group.tree) return;
      const newTree = updateRatio(group.tree, [...path, 0], newRatio);
      updateTree(groupId, newTree);
    },
    [groupId, groups, path, updateTree]
  );

  if (node.type === "leaf") {
    const isZoomed = zoomedPaneId === node.paneId;
    const isHiddenByZoom = !!zoomedPaneId && !isZoomed;
    const container = getContainer(node.paneId);

    return (
      <div
        ref={(el) => {
          if (el && container.parentNode !== el) {
            el.appendChild(container);
          }
        }}
        data-pane-id={node.paneId}
        style={{
          width: "100%",
          height: "100%",
          overflow: "hidden",
          borderRadius: 4,
          ...(isZoomed
            ? {
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 50,
                background: theme.bgTerminal,
                borderRadius: 0,
              }
            : {}),
          ...(isHiddenByZoom ? { visibility: "hidden" as const } : {}),
        }}
      />
    );
  }

  const isHorizontal = node.direction === "horizontal";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: isHorizontal ? "column" : "row",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        gap: 2,
      }}
    >
      <div
        style={{
          [isHorizontal ? "height" : "width"]: `calc(${node.ratio * 100}% - 4px)`,
          overflow: "hidden",
        }}
      >
        <SplitContainer
          node={node.first}
          groupId={groupId}
          path={[...path, 0]}
          zoomedPaneId={zoomedPaneId}
          getContainer={getContainer}
        />
      </div>
      <SplitDivider direction={node.direction} onResize={handleResize} />
      <div
        style={{
          [isHorizontal ? "height" : "width"]: `calc(${(1 - node.ratio) * 100}% - 4px)`,
          overflow: "hidden",
        }}
      >
        <SplitContainer
          node={node.second}
          groupId={groupId}
          path={[...path, 1]}
          zoomedPaneId={zoomedPaneId}
          getContainer={getContainer}
        />
      </div>
    </div>
  );
}
