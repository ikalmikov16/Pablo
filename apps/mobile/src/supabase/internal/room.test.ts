import { describe, expect, test } from 'bun:test';
import { DEFAULT_RULES } from '@pablo/engine';
import { makeRng } from '@pablo/engine';

import { BOT_IDS, BOT_NAMES, botName, generateRoomCode, isBotId, makeRoom } from './room';

describe('generateRoomCode', () => {
  test('returns 4 uppercase alphanumeric characters', () => {
    const rng = makeRng('test-seed');
    const code = generateRoomCode(rng);
    expect(code).toHaveLength(4);
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

describe('botName', () => {
  test('returns expected names for bot ids', () => {
    expect(botName(BOT_IDS[0])).toBe(BOT_NAMES[0]);
    expect(botName(BOT_IDS[1])).toBe(BOT_NAMES[1]);
    expect(botName(BOT_IDS[2])).toBe(BOT_NAMES[2]);
  });

  test('falls back to id for unknown player', () => {
    expect(botName('human')).toBe('human');
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
