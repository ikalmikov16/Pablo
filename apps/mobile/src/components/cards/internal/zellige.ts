/**
 * Procedural zellige star tessellation — pure geometry for card backs and felt.
 */

export type ZelligeTile = {
  readonly cx: number;
  readonly cy: number;
  readonly scale: number;
  readonly slot: 'accent' | 'secondary';
};

/** Unit-box 8-point star as a closed SVG path (16 vertices). */
export function starPathSvg(points = 8, innerRatio = 0.42): string {
  const outerR = 0.5;
  const innerR = outerR * innerRatio;
  const cx = 0.5;
  const cy = 0.5;
  const parts: string[] = [];

  for (let i = 0; i < points * 2; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI) / points;
    const r = i % 2 === 0 ? outerR : innerR;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    parts.push(i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`);
  }

  parts.push('Z');
  return parts.join(' ');
}

/** Square grid of star centers covering w × h; checkerboard accent / secondary. */
export function zelligeTiles(w: number, h: number, tileSize: number): ReadonlyArray<ZelligeTile> {
  if (tileSize <= 0) return [];

  const cols = Math.max(1, Math.floor(w / tileSize));
  const rows = Math.max(1, Math.floor(h / tileSize));
  const offsetX = (w - cols * tileSize) / 2;
  const offsetY = (h - rows * tileSize) / 2;
  const tiles: ZelligeTile[] = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cx = offsetX + col * tileSize + tileSize / 2;
      const cy = offsetY + row * tileSize + tileSize / 2;
      tiles.push({
        cx,
        cy,
        scale: tileSize * 0.85,
        slot: (row + col) % 2 === 0 ? 'accent' : 'secondary',
      });
    }
  }

  return tiles;
}
