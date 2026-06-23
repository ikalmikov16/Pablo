/**
 * Haptic feedback for game moves. Centralised so the dispatch site stays
 * declarative and so we never let a haptic failure block a move.
 *
 * - selection: light "tick" for low-stakes choices (draw, swap, discard)
 * - impact (medium): a satisfying thump for committed plays (match, power)
 * - notification (warning): the irreversible Pablo call
 * - notification (error): a server-rejected move
 *
 * No-op on web (expo-haptics resolves at runtime but the platform has
 * no haptic engine; gate it explicitly to avoid noisy warnings).
 */

import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

import type { Move } from '@pablo/engine';

export function hapticForMove(move: Move): void {
  if (Platform.OS === 'web') return;
  try {
    switch (move.type) {
      case 'draw_from_deck':
      case 'discard_drawn':
      case 'swap_drawn':
      case 'skip_power':
      case 'choose_peek':
      case 'peek_one':
        void Haptics.selectionAsync();
        break;
      case 'match_hand':
      case 'match_discard':
      case 'match_drawn':
      case 'use_peek_self':
      case 'use_peek_opponent':
      case 'use_swap_blind':
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        break;
      case 'call_pablo':
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        break;
    }
  } catch {
    // Haptic engine unavailable — silently skip.
  }
}

export function hapticForMoveError(): void {
  if (Platform.OS === 'web') return;
  try {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  } catch {
    // Haptic engine unavailable — silently skip.
  }
}

/** Light selection tick for UI button presses (chrome screens). */
export function hapticTap(): void {
  if (Platform.OS === 'web') return;
  try {
    void Haptics.selectionAsync();
  } catch {
    // Haptic engine unavailable — silently skip.
  }
}

/** Soft tap when the turn passes to the local player. */
export function hapticForTurnStart(): void {
  if (Platform.OS === 'web') return;
  try {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch {
    // Haptic engine unavailable — silently skip.
  }
}
