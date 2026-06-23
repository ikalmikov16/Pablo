import { describe, expect, test } from 'bun:test';

import { starPathSvg, zelligeTiles } from './zellige';

describe('starPathSvg', () => {
  test('closes with Z and has 16 vertices', () => {
    const path = starPathSvg();
    expect(path.endsWith('Z')).toBe(true);
    expect(path.startsWith('M')).toBe(true);
    const lineSegments = path.match(/L/g)?.length ?? 0;
    expect(lineSegments + 1).toBe(16);
  });

  test('is stable across calls', () => {
    expect(starPathSvg()).toBe(starPathSvg());
  });
});

describe('zelligeTiles', () => {
  const w = 220;
  const h = 320;
  const tileSize = 44;

  test('is deterministic for fixed inputs', () => {
    expect(zelligeTiles(w, h, tileSize)).toEqual(zelligeTiles(w, h, tileSize));
  });

  test('tile centers lie within the card bounds', () => {
    for (const tile of zelligeTiles(w, h, tileSize)) {
      expect(tile.cx).toBeGreaterThanOrEqual(0);
      expect(tile.cx).toBeLessThanOrEqual(w);
      expect(tile.cy).toBeGreaterThanOrEqual(0);
      expect(tile.cy).toBeLessThanOrEqual(h);
    }
  });

  test('checkerboard alternates accent and secondary slots', () => {
    const tiles = zelligeTiles(w, h, tileSize);
    expect(tiles.length).toBeGreaterThan(0);
    const accent = tiles.filter((t) => t.slot === 'accent').length;
    const secondary = tiles.filter((t) => t.slot === 'secondary').length;
    expect(Math.abs(accent - secondary)).toBeLessThanOrEqual(1);
  });

  test('returns empty array for non-positive tile size', () => {
    expect(zelligeTiles(w, h, 0)).toEqual([]);
  });
});
