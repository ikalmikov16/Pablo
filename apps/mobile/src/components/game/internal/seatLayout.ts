/**
 * seatLayout — pure geometry for the poker-table screen.
 *
 * Opponents sit in a row at the top; draw/discard are centred on the table;
 * the local player's hand stays in the bottom band.
 */

import { tokens } from '../../../design/tokens';

const CARD_ASPECT = 1.46;
const MIN_OPPONENT_CARD_WIDTH = 44;
const { seatPadding, seatGap, handGap, nameGap, deckGap, nameLineHeight } = tokens.game.table;

export type SeatBox = {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
};

export type SeatLayoutInsets = {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
};

export type SeatLayout = {
  readonly opponents: ReadonlyArray<SeatBox>;
  readonly self: SeatBox;
  readonly deck: SeatBox;
  /** Landing zone for the drawn card (beside or below the centred deck). */
  readonly drawn: SeatBox;
  readonly opponentCardWidth: number;
  readonly ownCardWidth: number;
};

export type OpponentCount = 1 | 2 | 3;

function gridSize(
  cardWidth: number,
  cols: number,
  rows: number,
  gap: number = handGap,
): { width: number; height: number } {
  const cardHeight = Math.floor(cardWidth * CARD_ASPECT);
  const width = cols * cardWidth + (cols - 1) * gap;
  const height = rows * cardHeight + (rows - 1) * gap;
  return { width, height };
}

function opponentSeatContentHeight(cardWidth: number): number {
  const { height: gridH } = gridSize(cardWidth, 2, 2, handGap);
  return nameLineHeight + nameGap + gridH;
}

function opponentSeatContentWidth(cardWidth: number): number {
  return gridSize(cardWidth, 2, 2, handGap).width;
}

function ownSeatContentHeight(cardWidth: number): number {
  return gridSize(cardWidth, 2, 2, tokens.space.sm).height;
}

function ownSeatContentWidth(cardWidth: number): number {
  return gridSize(cardWidth, 2, 2, tokens.space.sm).width;
}

/** Gap between opponent seats — always wider than `handGap` when space allows. */
function interSeatGap(opponentCount: OpponentCount, seatW: number, usableW: number): number {
  if (opponentCount <= 1) return 0;
  const minGap = handGap + 4;
  const slack = usableW - opponentCount * seatW;
  if (slack < minGap * (opponentCount - 1)) {
    return minGap;
  }
  const distributed = Math.floor(slack / (opponentCount - 1));
  return Math.min(seatGap, Math.max(minGap, distributed));
}

function boxesOverlap(a: SeatBox, b: SeatBox): boolean {
  return (
    a.left < b.left + b.width &&
    a.left + a.width > b.left &&
    a.top < b.top + b.height &&
    a.top + a.height > b.top
  );
}

/** Short tables centre the deck in the gap between opponents and own hand. */
const COMPACT_TABLE_MAX_H = 640;

/** Exported for tests — detect overlap between any two boxes in a layout. */
export function layoutHasOverlaps(layout: SeatLayout): boolean {
  const core = [...layout.opponents, layout.self, layout.deck];
  for (let i = 0; i < core.length; i++) {
    for (let j = i + 1; j < core.length; j++) {
      if (boxesOverlap(core[i]!, core[j]!)) return true;
    }
  }
  return false;
}

function fitsInBounds(box: SeatBox, maxW: number, maxH: number, insets: SeatLayoutInsets): boolean {
  const minLeft = insets.left + seatPadding;
  const minTop = insets.top + seatPadding;
  const maxRight = maxW - insets.right - seatPadding;
  const maxBottom = maxH - insets.bottom - seatPadding;
  return (
    box.left >= minLeft &&
    box.top >= minTop &&
    box.left + box.width <= maxRight &&
    box.top + box.height <= maxBottom
  );
}

function placeDrawnNearDeck(
  deck: SeatBox,
  self: SeatBox,
  drawnBandH: number,
  deckCardWidth: number,
  baseLeft: number,
  usableW: number,
): SeatBox {
  const left = baseLeft + Math.max(0, Math.floor((usableW - deckCardWidth) / 2));
  const belowTop = deck.top + deck.height + deckGap;

  if (belowTop + drawnBandH <= self.top - deckGap) {
    return { top: belowTop, left, width: deckCardWidth, height: drawnBandH };
  }

  const besideTop = deck.top + Math.max(0, Math.floor((deck.height - drawnBandH) / 2));
  const besideRight = deck.left + deck.width + deckGap;
  const besideRightBox: SeatBox = {
    top: besideTop,
    left: besideRight,
    width: deckCardWidth,
    height: drawnBandH,
  };
  if (besideRight + deckCardWidth <= baseLeft + usableW && !boxesOverlap(besideRightBox, deck)) {
    return besideRightBox;
  }

  const besideLeft = deck.left - deckGap - deckCardWidth;
  const besideLeftBox: SeatBox = {
    top: besideTop,
    left: besideLeft,
    width: deckCardWidth,
    height: drawnBandH,
  };
  if (besideLeft >= baseLeft && !boxesOverlap(besideLeftBox, deck)) {
    return besideLeftBox;
  }

  const gapTop = deck.top + deck.height + deckGap;
  const gapBottom = self.top - deckGap;
  const gapH = Math.max(0, gapBottom - gapTop);
  if (gapH > 0) {
    const h = Math.min(drawnBandH, gapH);
    const top = gapTop + Math.floor((gapH - h) / 2);
    return { top, left, width: deckCardWidth, height: h };
  }

  return {
    top: deck.top + Math.max(0, Math.floor((deck.height - drawnBandH) / 2)),
    left: deck.left + Math.floor((deck.width - deckCardWidth) / 2),
    width: deckCardWidth,
    height: drawnBandH,
  };
}

export function seatLayout(
  opponentCount: OpponentCount,
  layoutW: number,
  layoutH: number,
  insets: SeatLayoutInsets,
): SeatLayout {
  const deckCardWidth = tokens.game.size.deckCard;
  const deckCardH = Math.floor(deckCardWidth * CARD_ASPECT);
  const deckBandH = deckCardH + tokens.space.xs + nameLineHeight + deckGap;
  /** Match deck card aspect so deck→drawn flights never squash vertically. */
  const drawnBandH = deckCardH;
  const deckW = deckCardWidth * 2 + tokens.space.xl;

  const usableW = layoutW - insets.left - insets.right - seatPadding * 2;

  const baseTop = insets.top + seatPadding;
  const baseLeft = insets.left + seatPadding;
  const bottom = layoutH - insets.bottom - seatPadding;
  const tableCenterY = (baseTop + bottom) / 2;
  const compactTable = layoutH < COMPACT_TABLE_MAX_H;

  let oppCardW: number =
    opponentCount === 3 ? tokens.game.size.opponentCardSm : tokens.game.size.opponentCardMd;
  let ownCardW: number = tokens.game.size.ownCardMax;

  for (let attempt = 0; attempt < 64; attempt++) {
    const oppH = opponentSeatContentHeight(oppCardW);
    const selfH = ownSeatContentHeight(ownCardW);
    const selfTop = bottom - selfH;
    const oppTop = baseTop;

    const minDeckTop = oppTop + oppH + deckGap;
    const maxDeckTop = selfTop - deckGap - deckBandH;
    let deckTop: number;
    if (compactTable) {
      const midH = maxDeckTop - minDeckTop;
      deckTop = minDeckTop + Math.max(0, Math.floor((midH - deckBandH) / 2));
    } else {
      deckTop = Math.round(tableCenterY - deckBandH / 2);
      deckTop = Math.max(minDeckTop, Math.min(maxDeckTop, deckTop));
    }

    const opponentSeatW = opponentSeatContentWidth(oppCardW);
    const gap = interSeatGap(opponentCount, opponentSeatW, usableW);
    const rowWidth = opponentCount * opponentSeatW + (opponentCount - 1) * gap;
    const fitsHorizontally = rowWidth <= usableW;
    const fitsDeckBand = maxDeckTop >= minDeckTop;
    const fitsVertically = fitsDeckBand && selfTop >= oppTop + oppH + deckGap;

    if (fitsVertically && fitsHorizontally) {
      const selfSeatW = Math.min(ownSeatContentWidth(ownCardW), usableW);

      const opponents: SeatBox[] = [];
      let x = baseLeft + Math.max(0, Math.floor((usableW - rowWidth) / 2));

      for (let i = 0; i < opponentCount; i++) {
        opponents.push({
          top: oppTop,
          left: x,
          width: opponentSeatW,
          height: oppH,
        });
        x += opponentSeatW + gap;
      }

      const deck: SeatBox = {
        top: deckTop,
        left: baseLeft + Math.max(0, Math.floor((usableW - deckW) / 2)),
        width: deckW,
        height: deckBandH,
      };

      const self: SeatBox = {
        top: selfTop,
        left: baseLeft + Math.max(0, Math.floor((usableW - selfSeatW) / 2)),
        width: selfSeatW,
        height: selfH,
      };

      const drawn = placeDrawnNearDeck(deck, self, drawnBandH, deckCardWidth, baseLeft, usableW);

      return {
        opponents,
        self,
        deck,
        drawn,
        opponentCardWidth: oppCardW,
        ownCardWidth: ownCardW,
      };
    }

    if (!fitsHorizontally && oppCardW > MIN_OPPONENT_CARD_WIDTH) {
      oppCardW = Math.max(MIN_OPPONENT_CARD_WIDTH, oppCardW - 2);
    } else if (selfH >= oppH && ownCardW > MIN_OPPONENT_CARD_WIDTH) {
      ownCardW = Math.max(MIN_OPPONENT_CARD_WIDTH, ownCardW - 2);
    } else if (oppCardW > MIN_OPPONENT_CARD_WIDTH) {
      oppCardW = Math.max(MIN_OPPONENT_CARD_WIDTH, oppCardW - 2);
    } else {
      ownCardW = Math.max(MIN_OPPONENT_CARD_WIDTH, ownCardW - 2);
    }
  }

  const oppH = opponentSeatContentHeight(MIN_OPPONENT_CARD_WIDTH);
  const selfH = ownSeatContentHeight(MIN_OPPONENT_CARD_WIDTH);
  const selfTop = bottom - selfH;
  const oppTop = baseTop;
  const minDeckTop = oppTop + oppH + deckGap;
  const maxDeckTop = selfTop - deckGap - deckBandH;
  const deckTop = compactTable
    ? minDeckTop + Math.max(0, Math.floor((maxDeckTop - minDeckTop) / 2))
    : Math.max(minDeckTop, Math.min(maxDeckTop, Math.round(tableCenterY - deckBandH / 2)));

  const opponentSeatW = opponentSeatContentWidth(MIN_OPPONENT_CARD_WIDTH);
  const gap = interSeatGap(opponentCount, opponentSeatW, usableW);
  const rowWidth = opponentCount * opponentSeatW + (opponentCount - 1) * gap;

  const opponents: SeatBox[] = [];
  let x = baseLeft + Math.max(0, Math.floor((usableW - rowWidth) / 2));
  for (let i = 0; i < opponentCount; i++) {
    opponents.push({ top: oppTop, left: x, width: opponentSeatW, height: oppH });
    x += opponentSeatW + gap;
  }

  const selfBox: SeatBox = {
    top: selfTop,
    left: baseLeft,
    width: Math.min(ownSeatContentWidth(MIN_OPPONENT_CARD_WIDTH), usableW),
    height: selfH,
  };
  const deckBox: SeatBox = {
    top: deckTop,
    left: baseLeft + Math.max(0, Math.floor((usableW - deckW) / 2)),
    width: deckW,
    height: deckBandH,
  };

  return {
    opponents,
    self: selfBox,
    deck: deckBox,
    drawn: placeDrawnNearDeck(deckBox, selfBox, drawnBandH, deckCardWidth, baseLeft, usableW),
    opponentCardWidth: MIN_OPPONENT_CARD_WIDTH,
    ownCardWidth: MIN_OPPONENT_CARD_WIDTH,
  };
}

/** True when every box in the layout lies inside the safe padded region. */
export function layoutWithinBounds(
  layout: SeatLayout,
  layoutW: number,
  layoutH: number,
  insets: SeatLayoutInsets,
): boolean {
  const boxes = [...layout.opponents, layout.self, layout.deck, layout.drawn];
  return boxes.every((b) => fitsInBounds(b, layoutW, layoutH, insets));
}
