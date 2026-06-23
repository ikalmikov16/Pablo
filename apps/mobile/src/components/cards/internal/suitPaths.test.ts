import { describe, expect, test } from 'bun:test';

import type { Suit } from '@pablo/engine';
import { suitPath } from './suitPaths';

const SUITS: ReadonlyArray<Suit> = ['hearts', 'diamonds', 'clubs', 'spades'];
const SVG_CMD = /^[MLCZ\s.\d-]+$/;

describe('suitPath', () => {
  test('returns distinct non-empty paths for all four suits', () => {
    const paths = SUITS.map((suit) => suitPath(suit));
    expect(paths.every((p) => p.length > 0)).toBe(true);
    expect(new Set(paths).size).toBe(4);
  });

  test('paths start with M and use only SVG path characters', () => {
    for (const suit of SUITS) {
      const path = suitPath(suit);
      expect(path.startsWith('M')).toBe(true);
      expect(SVG_CMD.test(path)).toBe(true);
    }
  });

  test('paths are stable across calls', () => {
    for (const suit of SUITS) {
      expect(suitPath(suit)).toBe(suitPath(suit));
    }
  });
});
