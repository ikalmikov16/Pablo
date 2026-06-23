import { describe, expect, test } from 'bun:test';

import { deckDepthLayers } from './pileDecor';

describe('deckDepthLayers', () => {
  test('exact thresholds', () => {
    expect(deckDepthLayers(0)).toBe(0);
    expect(deckDepthLayers(1)).toBe(0);
    expect(deckDepthLayers(2)).toBe(1);
    expect(deckDepthLayers(9)).toBe(1);
    expect(deckDepthLayers(10)).toBe(2);
    expect(deckDepthLayers(24)).toBe(2);
    expect(deckDepthLayers(25)).toBe(3);
    expect(deckDepthLayers(52)).toBe(3);
  });

  test('is monotonic non-decreasing from 0 to 60', () => {
    let prev = deckDepthLayers(0);
    for (let count = 1; count <= 60; count++) {
      const next = deckDepthLayers(count);
      expect(next).toBeGreaterThanOrEqual(prev);
      prev = next;
    }
  });
});
