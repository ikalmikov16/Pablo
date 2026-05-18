/**
 * Seeded PRNG for the Pablo engine.
 *
 * Algorithm: cyrb128 string hash → sfc32 128-bit PRNG → Fisher–Yates shuffle.
 *
 * NO Math.random(), NO crypto, NO Date.now(). Pure arithmetic, deterministic
 * across V8, Hermes, and Deno. Period ≈ 2^128.
 *
 * Internal — not re-exported from @pablo/engine.
 */

export type Rng = {
  /** Returns a float in [0, 1). */
  next: () => number;
  /** Returns an integer in [0, maxExclusive). */
  nextInt: (maxExclusive: number) => number;
};

/** Hash a string into four 32-bit unsigned integers using cyrb128. */
function cyrb128(str: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/** Build an sfc32 generator from a 128-bit seed tuple. */
function sfc32(a: number, b: number, c: number, d: number): () => number {
  return function () {
    a |= 0;
    b |= 0;
    c |= 0;
    d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

/** Create a seeded PRNG from any string seed. */
export function makeRng(seed: string): Rng {
  const [a, b, c, d] = cyrb128(seed);
  const raw = sfc32(a, b, c, d);
  // Warm up the generator.
  raw();
  raw();
  raw();
  raw();
  return {
    next: raw,
    nextInt(maxExclusive: number): number {
      return Math.floor(raw() * maxExclusive);
    },
  };
}

/**
 * Fisher–Yates shuffle. Returns a new array; does not mutate the input.
 * Uses the provided Rng so shuffles are deterministic and reproducible.
 */
export function shuffle<T>(items: ReadonlyArray<T>, rng: Rng): T[] {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = rng.nextInt(i + 1);
    const tmp = result[i] as T;
    result[i] = result[j] as T;
    result[j] = tmp;
  }
  return result;
}
