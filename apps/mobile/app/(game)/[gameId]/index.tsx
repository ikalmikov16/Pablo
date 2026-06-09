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
import { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Move } from '@pablo/engine';
import { ActionBar } from '../../../src/components/game/ActionBar';
import { FlyingCardLayer } from '../../../src/components/game/FlyingCardLayer';
import { DrawFlow } from '../../../src/components/game/actionFlows/DrawFlow';
import { MatchDiscardFlow } from '../../../src/components/game/actionFlows/MatchDiscardFlow';
import { MatchHandFlow } from '../../../src/components/game/actionFlows/MatchHandFlow';
import { PowerFlow } from '../../../src/components/game/actionFlows/PowerFlow';
import { DeckArea } from '../../../src/components/game/DeckArea';
import { EndOfRound } from '../../../src/components/game/EndOfRound';
import { OwnHandGrid } from '../../../src/components/game/OwnHandGrid';
import { PabloBanner } from '../../../src/components/game/PabloBanner';
import { TableDimOverlay } from '../../../src/components/game/internal/TableDimOverlay';
import { TableLayout } from '../../../src/components/game/TableLayout';
import { PeekOverlay } from '../../../src/components/game/PeekOverlay';
import { ToastHost } from '../../../src/components/game/ToastHost';
import { tokens } from '../../../src/design/tokens';
import { hapticForMove, hapticForMoveError } from '../../../src/feedback/haptics';
import { t } from '../../../src/i18n';
import { botName, isBotId } from '../../../src/supabase/internal/room';
import { useGameStore, useGameStoreShallow } from '../../../src/store/provider';
import {
  selectCanDraw,
  selectDeckCount,
  selectDiscardTopCardId,
  selectDrawnCardId,
  selectEndOfRoundVisible,
  selectOpponentEntriesDisplay,
  selectIsAnimating,
  selectIsTableDimmed,
  selectPeekOverlayVisible,
  selectPowerOverlayVisible,
  selectView,
  selectVersion,
} from '../../../src/store/selectors';
import type { ActionBarItem } from '../../../src/store/selectors';
import { client } from '../../../src/supabase/client';

type ActiveFlow = 'match_hand' | 'match_discard' | 'draw_flow' | null;

export default function GameScreen() {
  const { gameId } = useLocalSearchParams<{ gameId: string }>();
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
  const tableDimmed = useGameStore(selectIsTableDimmed);
  const showToast = useGameStore((s) => s.showToast);
  const clearPeekPicks = useGameStore((s) => s.clearPeekPicks);
  const setPeekJustHappened = useGameStore((s) => s.setPeekJustHappened);
  const setLastPeekReveal = useGameStore((s) => s.setLastPeekReveal);

  const [activeFlow, setActiveFlow] = useState<ActiveFlow>(null);

  // Open draw flow after the deck→drawn flight finishes (avoid two Skia cards at once).
  useEffect(() => {
    if (drawnCardId && view?.status === 'playing' && view.pendingPower === null && !isAnimating) {
      setActiveFlow('draw_flow');
    } else if (!drawnCardId && activeFlow === 'draw_flow') {
      setActiveFlow(null);
    }
  }, [activeFlow, drawnCardId, isAnimating, view?.pendingPower, view?.status]);

  async function dispatch(move: Move) {
    if (!view || isAnimating) return;
    hapticForMove(move);
    const key = `${gameId}:${version}:${move.type}:${JSON.stringify(move)}`;
    const result = await client.applyMove({
      gameId,
      move,
      idempotencyKey: key,
      expectedVersion: version,
    });
    if (!result.ok) {
      hapticForMoveError();
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
    <View style={styles.screen}>
      <FlyingCardLayer catalog={catalog} />
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

        <View style={styles.tableArea}>
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
              clearPeekPicks();
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
            onPlayAgain={() => router.replace('/(home)/new-game')}
            onHome={() => router.replace('/(home)')}
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
  tableArea: {
    flex: 1,
  },
});
