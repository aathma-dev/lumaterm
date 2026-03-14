import { Direction, SplitNode } from "../types";

let paneCounter = 0;
export function generatePaneId(): string {
  return `pane-${++paneCounter}-${Date.now()}`;
}

export function splitNode(
  tree: SplitNode,
  targetPaneId: string,
  direction: Direction
): { newTree: SplitNode; newPaneId: string } {
  const newPaneId = generatePaneId();

  const transform = (node: SplitNode): SplitNode => {
    if (node.type === "leaf") {
      if (node.paneId === targetPaneId) {
        return {
          type: "split",
          direction,
          ratio: 0.5,
          first: { type: "leaf", paneId: targetPaneId },
          second: { type: "leaf", paneId: newPaneId },
        };
      }
      return node;
    }
    return {
      ...node,
      first: transform(node.first),
      second: transform(node.second),
    };
  };

  return { newTree: transform(tree), newPaneId };
}

export function removeNode(
  tree: SplitNode,
  targetPaneId: string
): SplitNode | null {
  if (tree.type === "leaf") {
    return tree.paneId === targetPaneId ? null : tree;
  }

  const firstResult = removeNode(tree.first, targetPaneId);
  const secondResult = removeNode(tree.second, targetPaneId);

  if (firstResult === null) return secondResult;
  if (secondResult === null) return firstResult;

  return { ...tree, first: firstResult, second: secondResult };
}

export function updateRatio(
  tree: SplitNode,
  path: number[],
  newRatio: number
): SplitNode {
  if (tree.type === "leaf" || path.length === 0) return tree;

  if (path.length === 1) {
    return { ...tree, ratio: Math.max(0.1, Math.min(0.9, newRatio)) };
  }

  const [head, ...rest] = path;
  if (tree.type === "split") {
    if (head === 0) {
      return { ...tree, first: updateRatio(tree.first, rest, newRatio) };
    }
    return { ...tree, second: updateRatio(tree.second, rest, newRatio) };
  }
  return tree;
}

export function findAllPaneIds(tree: SplitNode): string[] {
  if (tree.type === "leaf") return [tree.paneId];
  return [
    ...findAllPaneIds(tree.first),
    ...findAllPaneIds(tree.second),
  ];
}

export function findAdjacentPane(
  tree: SplitNode,
  currentPaneId: string,
  directionKey: "left" | "right" | "up" | "down"
): string | null {
  const allPanes = findAllPaneIds(tree);
  const idx = allPanes.indexOf(currentPaneId);
  if (idx === -1) return null;

  if (directionKey === "right" || directionKey === "down") {
    return allPanes[(idx + 1) % allPanes.length];
  }
  return allPanes[(idx - 1 + allPanes.length) % allPanes.length];
}

// --- Directional pane navigation (Terminator-style) ---

type NavDirection = "up" | "down" | "left" | "right";

/** Find the path (sequence of 'first'/'second') from root to a pane */
function findPath(
  node: SplitNode,
  paneId: string
): ("first" | "second")[] | null {
  if (node.type === "leaf") {
    return node.paneId === paneId ? [] : null;
  }
  const fp = findPath(node.first, paneId);
  if (fp !== null) return ["first", ...fp];
  const sp = findPath(node.second, paneId);
  if (sp !== null) return ["second", ...sp];
  return null;
}

/**
 * Find the edge pane in the opposite subtree when navigating.
 * E.g., going "right" → find the leftmost pane in the target subtree.
 */
function findEdgePane(node: SplitNode, direction: NavDirection): string {
  if (node.type === "leaf") return node.paneId;

  const splitDir: Direction =
    direction === "left" || direction === "right" ? "vertical" : "horizontal";

  if (node.direction === splitDir) {
    // Take the child closest to where we came from
    const child =
      direction === "right" || direction === "down"
        ? node.first
        : node.second;
    return findEdgePane(child, direction);
  }
  // Perpendicular split — just take first child
  return findEdgePane(node.first, direction);
}

/**
 * Terminator-style directional navigation.
 * Given a pane and a direction, find the visually adjacent pane.
 */
export function findPaneInDirection(
  root: SplitNode,
  paneId: string,
  direction: NavDirection
): string | null {
  const path = findPath(root, paneId);
  if (!path) return null;

  // Which split direction matters for this nav direction
  const splitDir: Direction =
    direction === "left" || direction === "right" ? "vertical" : "horizontal";
  // Which child we need to currently be in, to be able to move in this direction
  const needToBeIn: "first" | "second" =
    direction === "right" || direction === "down" ? "first" : "second";

  // Walk the tree along the path, collecting split ancestors
  let node: SplitNode = root;
  const ancestors: {
    splitNode: SplitNode & { type: "split" };
    childTaken: "first" | "second";
  }[] = [];

  for (const step of path) {
    if (node.type === "split") {
      ancestors.push({ splitNode: node as SplitNode & { type: "split" }, childTaken: step });
      node = step === "first" ? node.first : node.second;
    }
  }

  // Walk backwards through ancestors to find a matching split
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const { splitNode, childTaken } = ancestors[i];
    if (splitNode.direction === splitDir && childTaken === needToBeIn) {
      // Go to the other child and find the nearest pane on the edge
      const otherChild =
        needToBeIn === "first" ? splitNode.second : splitNode.first;
      return findEdgePane(otherChild, direction);
    }
  }

  return null; // No pane in that direction
}
