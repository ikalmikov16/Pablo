/**
 * resolveDisplayName — single source for player labels in banners, toasts, etc.
 */

import type { PlayerId, PlayerView } from '@pablo/engine';

import { t } from '../i18n';
import { botIndex, isBotId } from '../supabase/internal/room';

function shortHumanId(id: PlayerId): string {
  return t('game.playerShort', { id: id.slice(0, 8) });
}

/** Bot names come from i18n (`botName.1` … `botName.3`), never literals. */
export function botDisplayName(id: PlayerId): string {
  const idx = botIndex(id);
  return idx !== null ? t(`botName.${idx}`) : id;
}

export function resolveDisplayName(view: PlayerView, id: PlayerId): string {
  if (id === view.self) return t('game.you');
  if (isBotId(id)) return botDisplayName(id);
  return shortHumanId(id);
}
