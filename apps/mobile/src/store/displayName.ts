/**
 * resolveDisplayName — single source for player labels in banners, toasts, etc.
 */

import type { PlayerId, PlayerView } from '@pablo/engine';

import { t } from '../i18n';
import { botName, isBotId } from '../supabase/internal/room';

export function resolveDisplayName(view: PlayerView, id: PlayerId): string {
  if (id === view.self) return t('game.you');
  if (isBotId(id)) return botName(id);
  const entry = view.players.find((p) => p.id === id);
  return entry?.id ?? id;
}
