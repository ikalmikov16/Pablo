/**
 * resolveDisplayName — single source for player labels in banners, toasts, etc.
 */

import type { PlayerId, PlayerView } from '@pablo/engine';

import { t } from '../i18n';
import { botIndex, isBotId } from '../supabase/internal/room';

function shortHumanId(id: PlayerId): string {
  return t('game.playerShort', { id: id.slice(0, 8) });
}

/**
 * Module-local registry of player-chosen display names. This is UI-layer state
 * (never engine state): it lets the many deep `resolveDisplayName(view, id)`
 * callers — toasts, flight choreography, banners — surface real human names
 * without threading a names map through every planner function. The game screen
 * populates it on entry and clears it on unmount; the lobby passes names
 * explicitly via `lobbyMemberName` instead.
 */
const displayNameRegistry = new Map<PlayerId, string>();

/** Merge chosen names into the registry. Empty/blank names clear an entry. */
export function setDisplayNames(
  names: Readonly<Record<PlayerId, string | null | undefined>>,
): void {
  for (const [id, name] of Object.entries(names)) {
    const trimmed = name?.trim();
    if (trimmed) displayNameRegistry.set(id, trimmed);
    else displayNameRegistry.delete(id);
  }
}

export function clearDisplayNames(): void {
  displayNameRegistry.clear();
}

export function registeredDisplayName(id: PlayerId): string | null {
  return displayNameRegistry.get(id) ?? null;
}

/** Bot names come from i18n (`botName.1` … `botName.3`), never literals. */
export function botDisplayName(id: PlayerId): string {
  const idx = botIndex(id);
  return idx !== null ? t(`botName.${idx}`) : id;
}

export function resolveDisplayName(view: PlayerView, id: PlayerId): string {
  if (id === view.self) return t('game.you');
  if (isBotId(id)) return botDisplayName(id);
  return registeredDisplayName(id) ?? shortHumanId(id);
}

/**
 * Pure name resolver for the lobby, where there is no `PlayerView`. Prefers the
 * chosen name (passed in), then falls back to "You" for self, bot names, and
 * finally a short id. Kept pure (names passed in) so it's trivially testable.
 */
export function lobbyMemberName(
  id: PlayerId,
  opts: {
    readonly selfId: PlayerId | null;
    readonly names: Readonly<Record<PlayerId, string | null>>;
  },
): string {
  const name = opts.names[id]?.trim();
  if (name) return name;
  if (id === opts.selfId) return t('game.you');
  if (isBotId(id)) return botDisplayName(id);
  return shortHumanId(id);
}
