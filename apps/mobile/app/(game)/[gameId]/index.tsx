/**
 * Main game screen.
 *
 * Layout (top → bottom):
 *  1. Top bar — turn indicator + Leave button
 *  2. TableLayout — opponents, deck/discard, own hand
 *  3. Action bar
 *
 * Overlays (z-indexed on top):
 *  - PeekOverlay during peek_phase for the local player
 *  - MatchHandFlow / MatchDiscardFlow / DrawFlow for composite actions
 *  - EndOfRound when status === 'ended'
 *  - PabloBanner
 *  - ToastHost
 */

import { router, useLocalSearchParams } from 'expo-router';
import type { GameMode } from '../../../src/supabase/gameMode';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Move } from '@pablo/engine';
import { ActionBar } from '../../../src/components/game/ActionBar';
import { AnnouncementBanner } from '../../../src/components/game/AnnouncementBanner';
import { FlyingCardLayer } from '../../../src/components/game/FlyingCardLayer';
import { DrawFlow } from '../../../src/components/game/actionFlows/DrawFlow';
import { MatchDiscardFlow } from '../../../src/components/game/actionFlows/MatchDiscardFlow';
import { MatchHandFlow } from '../../../src/components/game/actionFlows/MatchHandFlow';
import { PowerFlow } from '../../../src/components/game/actionFlows/PowerFlow';
import { DeckArea } from '../../../src/components/game/DeckArea';
import { EndOfRound } from '../../../src/components/game/EndOfRound';
import { NetworkBanner } from '../../../src/components/game/NetworkBanner';
import { OwnHandGrid } from '../../../src/components/game/OwnHandGrid';
import { PabloBanner } from '../../../src/components/game/PabloBanner';
import { TableDimOverlay } from '../../../src/components/game/internal/TableDimOverlay';
import { TableBackground } from '../../../src/components/game/TableBackground';
import { TableLayout } from '../../../src/components/game/TableLayout';
import { PeekOverlay } from '../../../src/components/game/PeekOverlay';
import { ToastHost } from '../../../src/components/game/ToastHost';
import { TurnLabel } from '../../../src/components/game/TurnLabel';
import { tokens } from '../../../src/design/tokens';
import { textStyle } from '../../../src/design/typography';
import {
  hapticForMove,
  hapticForMoveError,
  hapticForTurnStart,
} from '../../../src/feedback/haptics';
import { t } from '../../../src/i18n';
import { navigateHome } from '../../../src/navigation/navigateHome';
import { isBotId } from '../../../src/supabase/internal/room';
import {
  botDisplayName,
  clearDisplayNames,
  resolveDisplayName,
  setDisplayNames,
} from '../../../src/store/displayName';
import { useGameStore, useGameStoreShallow } from '../../../src/store/provider';
import {
  selectCanDraw,
  selectDeckCount,
  selectDiscardTopCardId,
  selectDrawnCardId,
  selectEndOfRoundVisible,
  selectOpponentEntriesDisplay,
  selectIsBusy,
  selectIsAnimating,
  selectIsMyTurn,
  selectIsTableDimmed,
  selectPeekOverlayVisible,
  selectPowerOverlayVisible,
  selectView,
  selectVersion,
} from '../../../src/store/selectors';
import type { ActionBarItem } from '../../../src/store/selectors';
import { usePabloClient } from '../../../src/supabase/ClientProvider';
import type { RoomId } from '../../../src/supabase/types';

type ActiveFlow = 'match_hand' | 'match_discard' | 'draw_flow' | null;

export default function GameScreen() {
  const { gameId, mode, roomId } = useLocalSearchParams<{
    gameId: string;
    mode?: GameMode;
    roomId?: string;
  }>();
  const isOnline = mode === 'online';
  const client = usePabloClient();
  const view = useGameStore(selectView);
  const version = useGameStore(selectVersion);
  const deckCount = useGameStore(selectDeckCount);
  const discardTopCardId = useGameStore(selectDiscardTopCardId);
  const drawnCardId = useGameStore(selectDrawnCardId);
  const canDraw = useGameStore(selectCanDraw);
  const opponents = useGameStoreShallow(selectOpponentEntriesDisplay);
  const isPeekPhase = useGameStore(selectPeekOverlayVisible);
  const isEnded = useGameStore(selectEndOfRoundVisible);
  const isPowerOverlay = useGameStore(selectPowerOverlayVisible);
  const isAnimating = useGameStore(selectIsAnimating);
  const isBusy = useGameStore(selectIsBusy);
  const isMyTurn = useGameStore(selectIsMyTurn);
  const tableDimmed = useGameStore(selectIsTableDimmed);
  const showToast = useGameStore((s) => s.showToast);
  const setPeekJustHappened = useGameStore((s) => s.setPeekJustHappened);
  const setLastPeekReveal = useGameStore((s) => s.setLastPeekReveal);
  const setSubmitting = useGameStore((s) => s.setSubmitting);
  const setNetworkError = useGameStore((s) => s.setNetworkError);
  const insets = useSafeAreaInsets();

  const [activeFlow, setActiveFlow] = useState<ActiveFlow>(null);
  const [isHost, setIsHost] = useState(false);

  useEffect(() => {
    if (!isOnline || !roomId) return;
    const unsub = client.subscribeRoom(roomId as RoomId, (room) => {
      if (view) setIsHost(room.hostId === view.self);
      // Once this round is over and the host moves the room on, follow them:
      // into the next game, or back to the lobby while they decide.
      if (room.currentGameId && room.currentGameId !== gameId) {
        router.replace(`/(game)/${room.currentGameId}?mode=online&roomId=${roomId}`);
      } else if (room.status === 'waiting') {
        router.replace(`/(lobby)/room/${roomId}`);
      }
    });
    return unsub;
  }, [client, isOnline, roomId, gameId, view?.self]);

  // Resolve human player names so opponent seats and toasts show real names
  // (bots keep their i18n names; self stays "You"). Cleared on unmount so names
  // never leak between games.
  const playerIdsKey = view?.players.map((p) => p.id).join(',') ?? '';
  useEffect(() => {
    if (!isOnline || !playerIdsKey) return;
    const unsub = client.subscribeDisplayNames(playerIdsKey.split(','), (next) => {
      setDisplayNames(next);
    });
    return unsub;
  }, [client, isOnline, playerIdsKey]);

  useEffect(() => () => clearDisplayNames(), []);

  // Nudge the player when the turn comes back around to them.
  useEffect(() => {
    if (isMyTurn && view?.status === 'playing') hapticForTurnStart();
  }, [isMyTurn, view?.status]);

  // Open draw flow after the deck→drawn flight finishes (avoid two Skia cards at once).
  useEffect(() => {
    if (drawnCardId && view?.status === 'playing' && view.pendingPower === null && !isAnimating) {
      setActiveFlow('draw_flow');
    } else if (!drawnCardId && activeFlow === 'draw_flow') {
      setActiveFlow(null);
    }
  }, [activeFlow, drawnCardId, isAnimating, view?.pendingPower, view?.status]);

  async function dispatch(move: Move) {
    if (!view || isBusy) return;
    hapticForMove(move);
    const key = `${gameId}:${version}:${move.type}:${JSON.stringify(move)}`;
    if (isOnline) setSubmitting(true);
    const result = await client.applyMove({
      gameId,
      move,
      idempotencyKey: key,
      expectedVersion: version,
    });
    if (isOnline) setSubmitting(false);
    if (!result.ok) {
      hapticForMoveError();
      if (result.error === 'network_error') {
        setNetworkError(true);
      }
      showToast(`error.${result.error}`);
    }
  }

  async function handleLeave() {
    if (isOnline && roomId) {
      await client.leaveRoom({ roomId: roomId as RoomId });
    }
    navigateHome();
  }

  async function handlePlayAgain() {
    if (!isOnline || !roomId) {
      router.replace('/(home)/new-game');
      return;
    }
    const lobbyResult = await client.returnToLobby({ roomId: roomId as RoomId });
    if (!lobbyResult.ok) {
      showToast(`error.${lobbyResult.error}`);
      return;
    }
    router.replace(`/(lobby)/room/${roomId}`);
  }

  function getDisplayName(id: string): string {
    if (view) return resolveDisplayName(view, id);
    if (isBotId(id)) return botDisplayName(id);
    return id;
  }

  const catalog = view?.catalog ?? {};
  const self = view?.self ?? '';
  const currentPlayer = view?.currentPlayerId ?? '';
  const turnLabel =
    currentPlayer === self
      ? t('game.status.yourTurn')
      : t('game.status.opponentTurn', { name: getDisplayName(currentPlayer) });

  function handleCompositeAction(id: string) {
    if (id === 'match_hand') setActiveFlow('match_hand');
    else if (id === 'match_discard') setActiveFlow('match_discard');
  }

  function handleDispatchMove(item: ActionBarItem) {
    if (item.move) void dispatch(item.move);
  }

  return (
    <View style={styles.screen}>
      <FlyingCardLayer catalog={catalog} />
      <SafeAreaView style={styles.root} edges={['left', 'right']}>
        <View style={[styles.topChrome, { paddingTop: insets.top }]}>
          <NetworkBanner />

          {/* Top bar */}
          <View style={styles.topBar}>
            <TurnLabel label={view ? turnLabel : t('game.status.loading')} isMyTurn={isMyTurn} />
            <TouchableOpacity onPress={() => void handleLeave()} activeOpacity={0.7}>
              <Text style={styles.leaveText}>{t('game.leave')}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <AnnouncementBanner />

        <View style={styles.tableArea}>
          <TableBackground />
          <TableDimOverlay active={tableDimmed} />
          <TableLayout
            opponents={opponents}
            displayName={getDisplayName}
            currentPlayerId={currentPlayer || null}
            deck={
              <DeckArea
                deckCount={deckCount}
                discardTopCardId={discardTopCardId}
                catalog={catalog}
                canDraw={canDraw}
                onDraw={() => void dispatch({ type: 'draw_from_deck', playerId: self })}
              />
            }
            ownHand={<OwnHandGrid gridWidth={0} catalog={catalog} />}
          />
        </View>

        {/* Action bar */}
        <ActionBar onCompositeAction={handleCompositeAction} onDispatchMove={handleDispatchMove} />

        {/* ── Overlays ── */}

        {isPeekPhase && (
          <PeekOverlay
            catalog={catalog}
            onPeekOne={(move) => {
              // Pin the overlay open even after the engine flips status to
              // 'playing' (which happens the moment all players have peeked
              // their quota) so the player has a beat to memorise.
              setPeekJustHappened(true);
              void dispatch(move);
            }}
            onDismiss={() => {
              setPeekJustHappened(false);
            }}
          />
        )}

        {activeFlow === 'match_hand' && (
          <MatchHandFlow
            onConfirm={(a, b) => {
              setActiveFlow(null);
              void dispatch({ type: 'match_hand', playerId: self, handIndexA: a, handIndexB: b });
            }}
            onCancel={() => setActiveFlow(null)}
          />
        )}

        {activeFlow === 'match_discard' && (
          <MatchDiscardFlow
            onConfirm={(idx) => {
              setActiveFlow(null);
              void dispatch({ type: 'match_discard', playerId: self, handIndex: idx });
            }}
            onCancel={() => setActiveFlow(null)}
          />
        )}

        {activeFlow === 'draw_flow' && drawnCardId && (
          <DrawFlow
            onSwap={(idx) => {
              setActiveFlow(null);
              void dispatch({ type: 'swap_drawn', playerId: self, handIndex: idx });
            }}
            onDiscard={() => {
              setActiveFlow(null);
              void dispatch({ type: 'discard_drawn', playerId: self });
            }}
            onMatchDrawn={(idx) => {
              setActiveFlow(null);
              void dispatch({ type: 'match_drawn', playerId: self, handIndex: idx });
            }}
          />
        )}

        {isPowerOverlay && (
          <PowerFlow
            catalog={catalog}
            displayName={getDisplayName}
            onUsePeekSelf={(handIndex) => {
              // Pin the reveal sheet open before the engine resolves the move:
              // `use_peek_self` advances the turn immediately, which would
              // otherwise unmount the PowerFlow before the player sees the card.
              setLastPeekReveal({ target: self, handIndex });
              void dispatch({ type: 'use_peek_self', playerId: self, handIndex });
            }}
            onUsePeekOpponent={(targetPlayer, targetHandIndex) => {
              setLastPeekReveal({ target: targetPlayer, handIndex: targetHandIndex });
              void dispatch({
                type: 'use_peek_opponent',
                playerId: self,
                targetPlayer,
                targetHandIndex,
              });
            }}
            onUseSwapBlind={(selfHandIndex, targetPlayer, targetHandIndex) =>
              void dispatch({
                type: 'use_swap_blind',
                playerId: self,
                selfHandIndex,
                targetPlayer,
                targetHandIndex,
              })
            }
            onSkip={() => void dispatch({ type: 'skip_power', playerId: self })}
            onDismissReveal={() => setLastPeekReveal(null)}
          />
        )}

        {isEnded && (
          <EndOfRound
            catalog={catalog}
            displayName={getDisplayName}
            showPlayAgain={!isOnline || isHost}
            playAgainLabel={isOnline ? t('result.backToLobby') : t('result.playAgain')}
            waitingMessage={isOnline && !isHost ? t('result.waitingForHost') : null}
            onPlayAgain={() => void handlePlayAgain()}
            onHome={() => void handleLeave()}
          />
        )}

        <PabloBanner />
        <ToastHost />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  root: {
    flex: 1,
    backgroundColor: tokens.game.surface.table,
  },
  topChrome: {
    backgroundColor: tokens.color.surface.card,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: tokens.space.lg,
    paddingVertical: tokens.space.sm,
    backgroundColor: tokens.color.surface.card,
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.border.subtle,
  },
  leaveText: {
    ...textStyle('sm'),
    color: tokens.color.text.secondary,
    paddingHorizontal: tokens.space.sm,
    paddingVertical: tokens.space.xs,
  },
  tableArea: {
    flex: 1,
  },
});
