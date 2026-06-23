import { describe, expect, test } from 'bun:test';

import { tokens } from '../../design/tokens';
import { avatarColor } from './internal/avatarColor';

const PALETTE = new Set<string>(tokens.game.avatar.palette);

describe('avatarColor', () => {
  test('is deterministic for the same seed', () => {
    expect(avatarColor('player-alice')).toBe(avatarColor('player-alice'));
  });

  test('always returns a palette member', () => {
    for (let i = 0; i < 50; i++) {
      expect(PALETTE.has(avatarColor(`seed-${i}`))).toBe(true);
    }
  });

  test('distinct seeds use at least three palette slots over a 20-id sample', () => {
    const used = new Set<string>();
    for (let i = 0; i < 20; i++) {
      used.add(avatarColor(`opponent-${i}`));
    }
    expect(used.size).toBeGreaterThanOrEqual(3);
  });
});
