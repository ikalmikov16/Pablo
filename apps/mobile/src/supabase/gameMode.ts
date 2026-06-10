export type GameMode = 'online' | 'offline';

export function parseGameMode(mode: string | undefined): GameMode {
  return mode === 'online' ? 'online' : 'offline';
}
