import { describe, expect, it } from 'bun:test';

import { DEFAULT_RULES, computePlayerView, newGame } from '@pablo/engine';

import { resolveDisplayName } from './displayName';

describe('resolveDisplayName', () => {
  const state = newGame({
    id: 'g1',
    seed: 'display-name-test',
    players: ['human', 'bot:1'],
    rules: DEFAULT_RULES,
  });
  const view = computePlayerView(state, 'human');

  it('returns "You" for self', () => {
    expect(resolveDisplayName(view, 'human')).toBe('You');
  });

  it('returns botName for bot ids', () => {
    expect(resolveDisplayName(view, 'bot:1')).toBe('Cabo Cassette');
  });

  it('uses a short label for unknown human ids', () => {
    expect(resolveDisplayName(view, 'stranger')).toBe('Player stranger');
  });
});
