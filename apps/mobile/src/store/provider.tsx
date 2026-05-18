/**
 * GameStoreProvider — mounts a Zustand store scoped to a single game route.
 *
 * Usage: wrap the (game)/[gameId]/_layout.tsx children with this provider.
 * Unmounting it tears down the store and unsubscribes from the client.
 */

import React, { createContext, useContext, useEffect, useRef, type PropsWithChildren } from 'react';
import { useStore } from 'zustand';

import type { GameId, PabloClient } from '../supabase/types';
import { createGameStore, type GameStore, type GameStoreInstance } from './gameStore';

// ─── Context ──────────────────────────────────────────────────────────────────

const GameStoreContext = createContext<GameStoreInstance | null>(null);

export function useGameStore<T>(selector: (s: GameStore) => T): T {
  const store = useContext(GameStoreContext);
  if (!store) throw new Error('useGameStore used outside GameStoreProvider');
  return useStore(store, selector);
}

// ─── Provider ─────────────────────────────────────────────────────────────────

type Props = PropsWithChildren<{
  readonly gameId: GameId;
  readonly client: PabloClient;
}>;

export function GameStoreProvider({ gameId, client, children }: Props) {
  const storeRef = useRef<GameStoreInstance | null>(null);
  if (!storeRef.current) {
    storeRef.current = createGameStore();
  }
  const store = storeRef.current;

  useEffect(() => {
    const unsubView = client.subscribePlayerView(gameId, (view, version) => {
      store.getState().receiveView(view, version);
    });

    const unsubEvents = client.subscribeGameEvents(gameId, (events) => {
      store.getState().enqueueEvents(events);
    });

    return () => {
      unsubView();
      unsubEvents();
    };
  }, [gameId, client, store]);

  return <GameStoreContext.Provider value={store}>{children}</GameStoreContext.Provider>;
}
