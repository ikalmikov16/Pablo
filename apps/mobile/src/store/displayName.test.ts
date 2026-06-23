import { afterEach, describe, expect, it } from 'bun:test';

import { DEFAULT_RULES, computePlayerView, newGame } from '@pablo/engine';

import {
  clearDisplayNames,
  lobbyMemberName,
  resolveDisplayName,
  setDisplayNames,
} from './displayName';

describe('resolveDisplayName', () => {
  const state = newGame({
    id: 'g1',
    seed: 'display-name-test',
    players: ['human', 'bot:1'],
    rules: DEFAULT_RULES,
  });
  const view = computePlayerView(state, 'human');

  afterEach(() => {
    clearDisplayNames();
  });

  it('returns "You" for self', () => {
    expect(resolveDisplayName(view, 'human')).toBe('You');
  });

  it('returns botName for bot ids', () => {
    expect(resolveDisplayName(view, 'bot:1')).toBe('Cabo Cassette');
  });

  it('uses a short label for unknown human ids', () => {
    expect(resolveDisplayName(view, 'stranger')).toBe('Player stranger');
  });

  it('prefers a registered name over the short id fallback', () => {
    setDisplayNames({ stranger: 'Mona' });
    expect(resolveDisplayName(view, 'stranger')).toBe('Mona');
  });

  it('clearing the registry restores the short id fallback', () => {
    setDisplayNames({ stranger: 'Mona' });
    clearDisplayNames();
    expect(resolveDisplayName(view, 'stranger')).toBe('Player stranger');
  });

  it('self still resolves to "You" even when a name is registered', () => {
    setDisplayNames({ human: 'Real Name' });
    expect(resolveDisplayName(view, 'human')).toBe('You');
  });

  it('blank registered names are ignored', () => {
    setDisplayNames({ stranger: '   ' });
    expect(resolveDisplayName(view, 'stranger')).toBe('Player stranger');
  });
});

describe('lobbyMemberName', () => {
  it('prefers the chosen name', () => {
    expect(lobbyMemberName('p1', { selfId: 'self', names: { p1: 'Zara' } })).toBe('Zara');
  });

  it('falls back to "You" for self with no name', () => {
    expect(lobbyMemberName('self', { selfId: 'self', names: {} })).toBe('You');
  });

  it('uses bot names for bot ids', () => {
    expect(lobbyMemberName('bot:1', { selfId: 'self', names: {} })).toBe('Cabo Cassette');
  });

  it('falls back to a short id for unknown humans', () => {
    expect(lobbyMemberName('abcdef123456', { selfId: 'self', names: {} })).toBe('Player abcdef12');
  });

  it('a chosen name wins over the self "You" label', () => {
    expect(lobbyMemberName('self', { selfId: 'self', names: { self: 'Me' } })).toBe('Me');
  });
});
