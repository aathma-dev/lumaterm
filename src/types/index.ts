export type Direction = "horizontal" | "vertical";

export type SplitNode =
  | { type: "leaf"; paneId: string }
  | {
      type: "split";
      direction: Direction;
      ratio: number;
      first: SplitNode;
      second: SplitNode;
    };

export interface PaneData {
  id: string;
  ptyId: number;
  title: string;
  fontSizeOverride: number | null; // null = use global default
}

export interface TermGroup {
  id: string;
  name: string;
  cwd: string;
  tree: SplitNode | null; // null = empty session, no terminals yet
  panes: Record<string, PaneData>;
}
