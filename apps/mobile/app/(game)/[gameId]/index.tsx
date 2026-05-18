/**
 * Main game screen.
 *
 * Layout (top → bottom):
 *  1. Top bar — turn indicator + Leave button
 *  2. Opponent rows
 *  3. Deck + discard area
 *  4. Own hand grid
 *  5. Action bar
 *
 * Overlays (z-indexed on top):
 *  - PeekOverlay during peek_phase for the local player
 *  - MatchHandFlow / MatchDiscardFlow / DrawFlow for composite actions
 *  - EndOfRound when status === 'ended'
 *  - PabloBanner
 *  - ToastHost
 */

import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Dimensions, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Move } from '@pablo/engine';
import { ActionBar } from '../../../src/components/game/ActionBar';
import { DrawFlow } from '../../../src/components/game/actionFlows/DrawFlow';
import { MatchDiscardFlow } from '../../../src/components/game/actionFlows/MatchDiscardFlow';
import { MatchHandFlow } from '../../../src/components/game/actionFlows/MatchHandFlow';
import { PowerFlow } from '../../../src/components/game/actionFlows/PowerFlow';
import { DeckArea } from '../../../src/components/game/DeckArea';
import { EndOfRound } from '../../../src/components/game/EndOfRound';
import { HandGrid } from '../../../src/components/game/HandGrid';
import { OpponentRow } from '../../../src/components/game/OpponentRow';
import { PabloBanner } from '../../../src/components/game/PabloBanner';
import { PeekOverlay } from '../../../src/components/game/PeekOverlay';
import { ToastHost } from '../../../src/components/game/ToastHost';
import { tokens } from '../../../src/design/tokens';
import { t } from '../../../src/i18n';
import { botName, isBotId } from '../../../src/supabase/internal/room';
import { useGameStore } from '../../../src/store/provider';
import {
  getLegalMovesForPlayer,
  selectCanDraw,
  selectDeckCount,
  selectDiscardTopCardId,
  selectDrawnCardId,
  selectEndOfRoundVisible,
  selectIsLocalPowerPending,
  selectOpponentEntries,
  selectPeekOverlayVisible,
  selectView,
  selectVersion,
} from '../../../src/store/selectors';
import type { ActionBarItem } from '../../../src/store/selectors';
import { client } from '../../../src/supabase/client';

const { width: SCREEN_W } = Dimensions.get('window');
const HAND_GRID_WIDTH = SCREEN_W - tokens.space.lg * 2;

type ActiveFlow = 'match_hand' | 'match_discard' | 'draw_flow' | null;

export default function GameScreen() {
  const { gameId } = useLocalSearchParams<{ gameId: string }>();
  const view = useGameStore(selectView);
  const version = useGameStore(selectVersion);
  const deckCount = useGameStore(selectDeckCount);
  const discardTopCardId = useGameStore(selectDiscardTopCardId);
  const drawnCardId = useGameStore(selectDrawnCardId);
  const canDraw = useGameStore(selectCanDraw);
  const opponents = useGameStore(selectOpponentEntries);
  const isPeekPhase = useGameStore(selectPeekOverlayVisible);
  const isEnded = useGameStore(selectEndOfRoundVisible);
  const isLocalPowerPending = useGameStore(selectIsLocalPowerPending);
  const showToast = useGameStore((s) => s.showToast);
  const clearPeekPicks = useGameStore((s) => s.clearPeekPicks);
  const promoteView = useGameStore((s) => s.promoteView);
  const dequeueEvents = useGameStore((s) => s.dequeueEvents);
  const animQueue = useGameStore((s) => s.animQueue);

  const [activeFlow, setActiveFlow] = useState<ActiveFlow>(null);

  // Simple animation drain: when events arrive, wait a tick then promote the view.
  // Full Reanimated choreography is a Phase 7 polish item — the game is fully
  // functional with this sequential-delay approach.
  useEffect(() => {
    if (animQueue.pending.length === 0) return;
    const timer = setTimeout(() => {
      promoteView();
      dequeueEvents();
    }, tokens.game.duration.eventDrain);
    return () => clearTimeout(timer);
  }, [animQueue.pending, promoteView, dequeueEvents]);

  // Auto-open the draw flow when a card lands in hand.
  useEffect(() => {
    if (drawnCardId && view?.status === 'playing' && view.pendingPower === null) {
      setActiveFlow('draw_flow');
    } else if (!drawnCardId && activeFlow === 'draw_flow') {
      setActiveFlow(null);
    }
  }, [drawnCardId, view?.status, view?.pendingPower]);

  async function dispatch(move: Move) {
    if (!view) return;
    const key = `${gameId}:${version}:${move.type}:${JSON.stringify(move)}`;
    const result = await client.applyMove({
      gameId,
      move,
      idempotencyKey: key,
      expectedVersion: version,
    });
    if (!result.ok) {
      showToast(`error.${result.error}`);
    }
  }

  function getDisplayName(id: string): string {
    if (isBotId(id)) return botName(id);
    if (id === view?.self) return t('game.you');
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
    <SafeAreaView style={styles.root}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <Text style={styles.turnLabel} numberOfLines={1}>
          {view ? turnLabel : t('game.status.peekPhase')}
        </Text>
        <TouchableOpacity onPress={() => router.replace('/(home)')} activeOpacity={0.7}>
          <Text style={styles.leaveText}>{t('game.leave')}</Text>
        </TouchableOpacity>
      </View>

      {/* Opponent rows */}
      {opponents.map((entry) => {
        const pabloCallable =
          view?.status === 'playing' &&
          view.pabloCalledBy === null &&
          view.drawnCardId === null &&
          view.pendingPower === null &&
          getLegalMovesForPlayer(view, entry.id).some((m) => m.type === 'call_pablo');

        return (
          <OpponentRow
            key={entry.id}
            entry={entry}
            displayName={getDisplayName(entry.id)}
            catalog={catalog}
            pabloCallable={pabloCallable}
            onCallPablo={() => void dispatch({ type: 'call_pablo', playerId: self })}
            isCurrent={entry.isCurrentTurn}
          />
        );
      })}

      {/* Deck + discard */}
      <DeckArea
        deckCount={deckCount}
        discardTopCardId={discardTopCardId}
        catalog={catalog}
        canDraw={canDraw}
        onDraw={() => void dispatch({ type: 'draw_from_deck', playerId: self })}
      />

      {/* Own hand */}
      <View style={styles.handArea}>
        <HandGrid gridWidth={HAND_GRID_WIDTH} catalog={catalog} />
      </View>

      {/* Action bar */}
      <ActionBar onCompositeAction={handleCompositeAction} onDispatchMove={handleDispatchMove} />

      {/* ── Overlays ── */}

      {isPeekPhase && view?.status === 'peek_phase' && (
        <PeekOverlay
          catalog={catalog}
          onConfirm={(indices) => {
            clearPeekPicks();
            void dispatch({ type: 'choose_peek', playerId: self, indices });
          }}
        />
      )}

      {activeFlow === 'match_hand' && (
        <MatchHandFlow
          catalog={catalog}
          onConfirm={(a, b) => {
            setActiveFlow(null);
            void dispatch({ type: 'match_hand', playerId: self, handIndexA: a, handIndexB: b });
          }}
          onCancel={() => setActiveFlow(null)}
        />
      )}

      {activeFlow === 'match_discard' && (
        <MatchDiscardFlow
          catalog={catalog}
          onConfirm={(idx) => {
            setActiveFlow(null);
            void dispatch({ type: 'match_discard', playerId: self, handIndex: idx });
          }}
          onCancel={() => setActiveFlow(null)}
        />
      )}

      {activeFlow === 'draw_flow' && drawnCardId && (
        <DrawFlow
          catalog={catalog}
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

      {isLocalPowerPending && (
        <PowerFlow
          catalog={catalog}
          displayName={getDisplayName}
          onUsePeekSelf={(handIndex) =>
            void dispatch({ type: 'use_peek_self', playerId: self, handIndex })
          }
          onUsePeekOpponent={(targetPlayer, targetHandIndex) =>
            void dispatch({
              type: 'use_peek_opponent',
              playerId: self,
              targetPlayer,
              targetHandIndex,
            })
          }
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
        />
      )}

      {isEnded && (
        <EndOfRound
          catalog={catalog}
          displayName={getDisplayName}
          onPlayAgain={() => router.replace('/(home)/new-game')}
          onHome={() => router.replace('/(home)')}
        />
      )}

      <PabloBanner displayName={getDisplayName} />
      <ToastHost />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokens.game.surface.table,
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
  turnLabel: {
    flex: 1,
    fontSize: tokens.font.size.sm,
    fontWeight: tokens.font.weight.semibold,
    color: tokens.color.text.primary,
  },
  leaveText: {
    fontSize: tokens.font.size.sm,
    color: tokens.color.text.secondary,
    paddingHorizontal: tokens.space.sm,
    paddingVertical: tokens.space.xs,
  },
  handArea: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: tokens.space.lg,
  },
});
