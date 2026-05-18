/**
 * Pure helpers for room creation and bot player management.
 * No side effects; all randomness injected via Rng.
 */

import type { PlayerId } from '@pablo/engine';
import type { makeRng } from '@pablo/engine';

import type { Room, RoomId } from '../types';

type Rng = ReturnType<typeof makeRng>;

// Omit ambiguous chars (O, 0, 1, I) so codes read cleanly aloud.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateRoomCode(rng: Rng): string {
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += CODE_ALPHABET[rng.nextInt(CODE_ALPHABET.length)];
  }
  return code;
}

export const BOT_IDS: Readonly<[PlayerId, PlayerId, PlayerId]> = ['bot:1', 'bot:2', 'bot:3'];
export const BOT_NAMES: Readonly<[string, string, string]> = ['Cabo Cassette', 'Cambia', 'Pablito'];

export function isBotId(id: PlayerId): boolean {
  return (BOT_IDS as ReadonlyArray<string>).includes(id);
}

export function botName(id: PlayerId): string {
  const idx = (BOT_IDS as ReadonlyArray<string>).indexOf(id);
  return idx >= 0 ? (BOT_NAMES[idx] ?? id) : id;
}

export function makeRoom(opts: {
  readonly id: RoomId;
  readonly code: string;
  readonly hostId: PlayerId;
  readonly rules: Room['rules'];
  readonly maxPlayers: number;
}): Room {
  return {
    id: opts.id,
    code: opts.code,
    hostId: opts.hostId,
    status: 'waiting',
    members: [opts.hostId],
    maxPlayers: opts.maxPlayers,
    rules: opts.rules,
  };
}
