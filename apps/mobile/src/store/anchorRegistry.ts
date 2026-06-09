/**
 * Module-level anchor registry for card-flight animations.
 * Screen-space rects from `measureInWindow`; read only at batch boundaries.
 */

import { anchorKey, type AnchorId, type Rect } from './flightTypes';

export type AnchorSnapshot = ReadonlyMap<string, Rect>;

const registry = new Map<string, Rect>();

export function registerAnchor(id: AnchorId, rect: Rect): void {
  registry.set(anchorKey(id), rect);
}

export function unregisterAnchor(id: AnchorId): void {
  registry.delete(anchorKey(id));
}

export function getAnchorSnapshot(): AnchorSnapshot {
  return new Map(registry);
}

export function getAnchorRect(snapshot: AnchorSnapshot, id: AnchorId): Rect | null {
  return snapshot.get(anchorKey(id)) ?? null;
}

/** Test-only — clears all registered anchors. */
export function resetAnchorRegistryForTests(): void {
  registry.clear();
}
