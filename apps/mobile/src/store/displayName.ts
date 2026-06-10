/**
 * resolveDisplayName — single source for player labels in banners, toasts, etc.
 */

import type { PlayerId, PlayerView } from '@pablo/engine';

import { t } from '../i18n';
import { botName, isBotId } from '../supabase/internal/room';

function shortHumanId(id: PlayerId): string {
  return t('game.playerShort', { id: id.slice(0, 8) });
}

export function resolveDisplayName(view: PlayerView, id: PlayerId): string {
  if (id === view.self) return t('game.you');
  if (isBotId(id)) return botName(id);
  return shortHumanId(id);
}
