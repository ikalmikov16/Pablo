import { useLocalSearchParams } from 'expo-router';
import { Stack } from 'expo-router';
import { useMemo } from 'react';

import { GameStoreProvider } from '../../../src/store/provider';
import { ClientProvider } from '../../../src/supabase/ClientProvider';
import { resolveClientForMode } from '../../../src/supabase/client';
import { parseGameMode } from '../../../src/supabase/gameMode';

export default function GameIdLayout() {
  const { gameId, mode } = useLocalSearchParams<{ gameId: string; mode?: string }>();
  const clientMode = parseGameMode(mode);
  const client = useMemo(() => resolveClientForMode(clientMode), [clientMode]);

  return (
    <ClientProvider client={client}>
      {/* Key by gameId so navigating between games (e.g. next round) always
          mounts a fresh store instead of reusing the previous game's state. */}
      <GameStoreProvider key={gameId} gameId={gameId} client={client}>
        <Stack screenOptions={{ headerShown: false }} />
      </GameStoreProvider>
    </ClientProvider>
  );
}
