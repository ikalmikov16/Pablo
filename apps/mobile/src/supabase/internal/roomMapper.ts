import type { GameRules } from '@pablo/engine';

import type { GameId, Room, RoomId } from '../types';

export type RoomRow = {
  readonly id: string;
  readonly code: string;
  readonly host_id: string;
  readonly status: 'waiting' | 'playing';
  readonly rules: GameRules;
  readonly max_players: number;
  readonly current_game_id?: string | null;
};

export type RoomApiShape = {
  readonly id: string;
  readonly code: string;
  readonly hostId: string;
  readonly status: 'waiting' | 'playing';
  readonly members: ReadonlyArray<string>;
  readonly maxPlayers: number;
  readonly rules: GameRules;
  readonly currentGameId?: string | null;
};

export function mapRoomRow(row: RoomRow, members: ReadonlyArray<string>): Room {
  return {
    id: row.id as RoomId,
    code: row.code,
    hostId: row.host_id,
    status: row.status,
    members,
    maxPlayers: row.max_players,
    rules: row.rules,
    currentGameId: (row.current_game_id ?? null) as GameId | null,
  };
}

export function mapRoomApi(room: RoomApiShape): Room {
  return {
    id: room.id as RoomId,
    code: room.code,
    hostId: room.hostId,
    status: room.status,
    members: room.members,
    maxPlayers: room.maxPlayers,
    rules: room.rules,
    currentGameId: (room.currentGameId ?? null) as GameId | null,
  };
}
