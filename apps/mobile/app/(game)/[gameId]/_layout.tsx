import { useLocalSearchParams } from 'expo-router';
import { Stack } from 'expo-router';

import { client } from '../../../src/supabase/client';
import { GameStoreProvider } from '../../../src/store/provider';

export default function GameIdLayout() {
  const { gameId } = useLocalSearchParams<{ gameId: string }>();

  return (
    <GameStoreProvider gameId={gameId} client={client}>
      <Stack screenOptions={{ headerShown: false }} />
    </GameStoreProvider>
  );
}
