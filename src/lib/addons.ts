import React from "react";

export interface Addon {
  /** Unique identifier for this addon */
  id: string;
  /** Display label in the tab bar */
  label: string;
  /** SVG icon component — receives the current color */
  icon: (color: string) => React.ReactNode;
  /** The React component to render as the panel content */
  component: React.ComponentType;
  /** Sort order — lower numbers appear first (default: 100) */
  order: number;
}

const registry: Map<string, Addon> = new Map();
let listeners: Array<() => void> = [];
let cachedSnapshot: Addon[] = [];

function rebuildSnapshot(): void {
  cachedSnapshot = Array.from(registry.values()).sort((a, b) => a.order - b.order);
}

/** Register an addon view for the info panel sidebar */
export function registerAddon(addon: Addon): void {
  registry.set(addon.id, addon);
  rebuildSnapshot();
  listeners.forEach((fn) => fn());
}

/** Unregister an addon by id */
export function unregisterAddon(id: string): void {
  registry.delete(id);
  rebuildSnapshot();
  listeners.forEach((fn) => fn());
}

/** Get all registered addons sorted by order (cached for useSyncExternalStore) */
export function getAddons(): Addon[] {
  return cachedSnapshot;
}

/** Get a specific addon by id */
export function getAddon(id: string): Addon | undefined {
  return registry.get(id);
}

/** Subscribe to registry changes. Returns an unsubscribe function. */
export function onAddonsChange(fn: () => void): () => void {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter((l) => l !== fn);
  };
}
