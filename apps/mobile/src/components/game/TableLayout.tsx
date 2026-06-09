/**
 * TableLayout — absolute-positioned poker table (opponents, deck, own hand).
 */

import React, { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import type { PlayerId, PlayerViewEntry } from '@pablo/engine';
import { OpponentSeat } from './OpponentSeat';
import { seatLayout, type OpponentCount, type SeatLayoutInsets } from './internal/seatLayout';
import { useAnchor } from './internal/useAnchor';

/** Table area lives inside `SafeAreaView`; padding is already applied by the parent. */
const TABLE_INSETS: SeatLayoutInsets = { top: 0, bottom: 0, left: 0, right: 0 };

type Props = {
  readonly opponents: ReadonlyArray<PlayerViewEntry>;
  readonly displayName: (id: PlayerId) => string;
  readonly currentPlayerId: PlayerId | null;
  readonly deck: React.ReactNode;
  readonly ownHand: React.ReactNode;
  /**
   * Optional highlight in the drawn landing zone (flight target). The draw-flow
   * sheet shows the large hero card; this slot stays for anchor measurement.
   */
  readonly drawnPreview?: React.ReactNode;
};

function opponentCount(n: number): OpponentCount {
  if (n === 1) return 1;
  if (n === 2) return 2;
  return 3;
}

function DrawnLandingZone({ children }: { readonly children?: React.ReactNode }) {
  const { ref, onLayout } = useAnchor({ kind: 'drawn' });

  return (
    <View ref={ref} onLayout={onLayout} style={styles.drawnZone} collapsable={false}>
      {children}
    </View>
  );
}

export function TableLayout({
  opponents,
  displayName,
  currentPlayerId,
  deck,
  ownHand,
  drawnPreview,
}: Props) {
  const [size, setSize] = useState({ w: 0, h: 0 });

  function onLayout(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout;
    if (width !== size.w || height !== size.h) {
      setSize({ w: width, h: height });
    }
  }

  const layout =
    size.w > 0 && size.h > 0
      ? seatLayout(opponentCount(Math.min(opponents.length, 3)), size.w, size.h, TABLE_INSETS)
      : null;

  const ownHandNode =
    layout && React.isValidElement(ownHand)
      ? React.cloneElement(
          ownHand as React.ReactElement<{ gridWidth?: number; cardWidth?: number }>,
          { gridWidth: layout.self.width, cardWidth: layout.ownCardWidth },
        )
      : ownHand;

  return (
    <View style={styles.table} onLayout={onLayout}>
      {layout &&
        opponents.map((entry, i) => {
          const box = layout.opponents[i];
          if (!box) return null;
          return (
            <View
              key={entry.id}
              style={[
                styles.absolute,
                {
                  top: box.top,
                  left: box.left,
                  width: box.width,
                  height: box.height,
                },
              ]}
            >
              <OpponentSeat
                entry={entry}
                displayName={displayName(entry.id)}
                cardWidth={layout.opponentCardWidth}
                isCurrent={entry.id === currentPlayerId}
              />
            </View>
          );
        })}
      {layout && (
        <View
          style={[
            styles.absolute,
            styles.deckCenter,
            {
              top: layout.deck.top,
              left: layout.deck.left,
              width: layout.deck.width,
              height: layout.deck.height,
            },
          ]}
        >
          {deck}
        </View>
      )}
      {layout && (
        <View
          style={[
            styles.absolute,
            styles.selfCenter,
            {
              top: layout.self.top,
              left: layout.self.left,
              width: layout.self.width,
              height: layout.self.height,
            },
          ]}
        >
          {ownHandNode}
        </View>
      )}
      {layout && (
        <View
          style={[
            styles.absolute,
            styles.drawnLayer,
            {
              top: layout.drawn.top,
              left: layout.drawn.left,
              width: layout.drawn.width,
              height: layout.drawn.height,
            },
          ]}
          pointerEvents="none"
        >
          <DrawnLandingZone>{drawnPreview}</DrawnLandingZone>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  table: {
    flex: 1,
  },
  absolute: {
    position: 'absolute',
  },
  deckCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  selfCenter: {
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  drawnLayer: {
    zIndex: 12,
    elevation: 12,
  },
  drawnZone: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
