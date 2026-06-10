import { describe, expect, test } from 'bun:test';
import { DEFAULT_RULES } from '@pablo/engine';

import { mapRoomApi, mapRoomRow } from './roomMapper';

describe('roomMapper', () => {
  test('mapRoomRow round-trips current_game_id', () => {
    const room = mapRoomRow(
      {
        id: 'room-1',
        code: 'ABCD12',
        host_id: 'user-1',
        status: 'playing',
        rules: DEFAULT_RULES,
        max_players: 4,
        current_game_id: 'game-1',
      },
      ['user-1', 'user-2'],
    );
    expect(room.currentGameId).toBe('game-1');
    expect(room.members).toEqual(['user-1', 'user-2']);
  });

  test('mapRoomApi maps camelCase API shape', () => {
    const room = mapRoomApi({
      id: 'room-2',
      code: 'WXYZ99',
      hostId: 'host',
      status: 'waiting',
      members: ['host'],
      maxPlayers: 2,
      rules: DEFAULT_RULES,
      currentGameId: null,
    });
    expect(room.hostId).toBe('host');
    expect(room.currentGameId).toBeNull();
  });
});
