import { describe, expect, test } from 'bun:test';
import { DEFAULT_RULES } from '@pablo/engine';
import { makeRng } from '@pablo/engine';

import { BOT_IDS, botIndex, generateRoomCode, isBotId, makeRoom } from './room';

describe('generateRoomCode', () => {
  test('returns 6 uppercase alphanumeric characters (matches server codes)', () => {
    const rng = makeRng('test-seed');
    const code = generateRoomCode(rng);
    expect(code).toHaveLength(6);
    expect(/^[A-Z0-9]+$/.test(code)).toBe(true);
    // No ambiguous chars
    expect(code).not.toMatch(/[O01I]/);
  });

  test('is deterministic with a fixed seed', () => {
    const code1 = generateRoomCode(makeRng('same'));
    const code2 = generateRoomCode(makeRng('same'));
    expect(code1).toBe(code2);
  });

  test('differs for different seeds', () => {
    const code1 = generateRoomCode(makeRng('seed-a'));
    const code2 = generateRoomCode(makeRng('seed-b'));
    // Astronomically unlikely to collide.
    expect(code1).not.toBe(code2);
  });
});

describe('isBotId', () => {
  test('identifies bot ids', () => {
    for (const id of BOT_IDS) {
      expect(isBotId(id)).toBe(true);
    }
  });

  test('human is not a bot', () => {
    expect(isBotId('human')).toBe(false);
    expect(isBotId('player-123')).toBe(false);
  });
});

describe('botIndex', () => {
  test('returns 1-based index for bot ids', () => {
    expect(botIndex(BOT_IDS[0])).toBe(1);
    expect(botIndex(BOT_IDS[1])).toBe(2);
    expect(botIndex(BOT_IDS[2])).toBe(3);
  });

  test('returns null for non-bots', () => {
    expect(botIndex('human')).toBeNull();
  });
});

describe('makeRoom', () => {
  test('creates a room with expected shape', () => {
    const room = makeRoom({
      id: 'r1',
      code: 'ABCD',
      hostId: 'human',
      rules: DEFAULT_RULES,
      maxPlayers: 4,
    });
    expect(room.id).toBe('r1');
    expect(room.code).toBe('ABCD');
    expect(room.hostId).toBe('human');
    expect(room.status).toBe('waiting');
    expect(room.members).toEqual(['human']);
    expect(room.maxPlayers).toBe(4);
    expect(room.currentGameId).toBeNull();
  });
});
