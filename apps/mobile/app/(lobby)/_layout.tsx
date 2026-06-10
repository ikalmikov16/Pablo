import { Stack } from 'expo-router';
import { useMemo } from 'react';

import { ClientProvider } from '../../src/supabase/ClientProvider';
import { getRealClient } from '../../src/supabase/client';

export default function LobbyLayout() {
  // Construct lazily on render (not at module load) so a missing Supabase env
  // only fails the online flow, never app startup / offline play.
  const client = useMemo(() => getRealClient(), []);
  return (
    <ClientProvider client={client}>
      <Stack screenOptions={{ headerShown: false }} />
    </ClientProvider>
  );
}
