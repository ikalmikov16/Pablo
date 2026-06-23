import { describe, expect, it } from 'bun:test';

import {
  layoutHasOverlaps,
  layoutWithinBounds,
  seatLayout,
  type OpponentCount,
  type SeatLayoutInsets,
} from './seatLayout';
import { tokens } from '../../../design/tokens';

const ZERO_INSETS: SeatLayoutInsets = { top: 0, bottom: 0, left: 0, right: 0 };
const NOTCH_INSETS: SeatLayoutInsets = { top: 47, bottom: 34, left: 0, right: 0 };

const PROFILES: ReadonlyArray<{ name: string; w: number; h: number }> = [
  { name: 'iPhone SE', w: 320, h: 568 },
  { name: 'iPhone 14', w: 390, h: 844 },
  { name: 'iPhone 16 Pro Max', w: 430, h: 932 },
];

function deckCenterX(layout: ReturnType<typeof seatLayout>): number {
  return layout.deck.left + layout.deck.width / 2;
}

function deckCardCenterY(layout: ReturnType<typeof seatLayout>): number {
  const deckCardH = Math.floor(tokens.game.size.deckCard * 1.46);
  return layout.deck.top + deckCardH / 2;
}

describe('seatLayout', () => {
  for (const profile of PROFILES) {
    for (const count of [1, 2, 3] as const satisfies ReadonlyArray<OpponentCount>) {
      it(`${profile.name} — ${count} opponent(s): no overlap, in bounds, centred deck`, () => {
        const layout = seatLayout(count, profile.w, profile.h, ZERO_INSETS);
        expect(layout.opponents).toHaveLength(count);
        expect(layoutHasOverlaps(layout)).toBe(false);
        expect(layoutWithinBounds(layout, profile.w, profile.h, ZERO_INSETS)).toBe(true);
        expect(Math.abs(deckCenterX(layout) - profile.w / 2)).toBeLessThanOrEqual(2);
      });

      it(`${profile.name} — ${count} opponent(s): respects safe-area insets`, () => {
        const layout = seatLayout(count, profile.w, profile.h, NOTCH_INSETS);
        expect(layoutWithinBounds(layout, profile.w, profile.h, NOTCH_INSETS)).toBe(true);
      });
    }
  }

  it('uses opponentCardSm on wide screens for three opponents', () => {
    const layout = seatLayout(3, 430, 932, ZERO_INSETS);
    expect(layout.opponentCardWidth).toBe(tokens.game.size.opponentCardSm);
  });

  it('uses opponentCardMd for one or two opponents', () => {
    expect(seatLayout(1, 390, 844, ZERO_INSETS).opponentCardWidth).toBe(
      tokens.game.size.opponentCardMd,
    );
    expect(seatLayout(2, 390, 844, ZERO_INSETS).opponentCardWidth).toBe(
      tokens.game.size.opponentCardMd,
    );
  });

  it('own card width is ownCardMax on tall screens', () => {
    const layout = seatLayout(1, 430, 932, ZERO_INSETS);
    expect(layout.ownCardWidth).toBe(tokens.game.size.ownCardMax);
  });

  it('pins opponents to the top band', () => {
    const layout = seatLayout(2, 390, 844, ZERO_INSETS);
    const topBand = tokens.game.table.seatPadding;
    for (const seat of layout.opponents) {
      expect(seat.top).toBe(topBand);
    }
    expect(layout.opponents[0]!.top).toBeLessThan(layout.deck.top);
  });

  it('places self seat at the bottom band', () => {
    const layout = seatLayout(2, 390, 844, ZERO_INSETS);
    expect(layout.self.top).toBeGreaterThan(layout.deck.top + layout.deck.height);
  });

  it('centers deck cards vertically on the table', () => {
    const h = 844;
    const layout = seatLayout(2, 390, h, ZERO_INSETS);
    expect(Math.abs(deckCardCenterY(layout) - h / 2)).toBeLessThanOrEqual(8);
  });

  it('places drawn zone adjacent to the centred deck without overlap', () => {
    const layout = seatLayout(2, 390, 844, ZERO_INSETS);
    expect(layout.drawn.top).toBeGreaterThanOrEqual(layout.deck.top);
    expect(layout.self.top).toBeGreaterThan(layout.drawn.top);
    expect(layoutHasOverlaps(layout)).toBe(false);
  });

  it('keeps layout valid on short screens', () => {
    const layout = seatLayout(2, 320, 568, ZERO_INSETS);
    expect(layout.opponents[0]!.top).toBe(tokens.game.table.seatPadding);
    expect(layoutHasOverlaps(layout)).toBe(false);
    expect(layoutWithinBounds(layout, 320, 568, ZERO_INSETS)).toBe(true);
  });

  it('spaces opponent seats wider than gaps inside each hand', () => {
    const layout = seatLayout(3, 390, 844, ZERO_INSETS);
    const gapBetweenSeats =
      layout.opponents[1]!.left - (layout.opponents[0]!.left + layout.opponents[0]!.width);
    expect(gapBetweenSeats).toBeGreaterThan(tokens.game.table.handGap);
    expect(gapBetweenSeats).toBeGreaterThanOrEqual(tokens.game.table.handGap + 4);
  });

  it('uses seatHeaderHeight for opponent band math', () => {
    expect(tokens.game.table.seatHeaderHeight).toBe(36);
    const layout = seatLayout(2, 390, 844, ZERO_INSETS);
    const gridH = 2 * Math.floor(layout.opponentCardWidth * 1.46) + tokens.game.table.handGap;
    const expectedOppH = tokens.game.table.seatHeaderHeight + tokens.game.table.nameGap + gridH;
    expect(layout.opponents[0]!.height).toBe(expectedOppH);
  });

  it('sizes each opponent seat to the grid width, not equal screen thirds', () => {
    const layout = seatLayout(3, 390, 844, ZERO_INSETS);
    const expectedW = layout.opponentCardWidth * 2 + tokens.game.table.handGap;
    for (const seat of layout.opponents) {
      expect(seat.width).toBe(expectedW);
    }
  });
});
