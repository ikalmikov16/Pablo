import { describe, expect, test } from 'bun:test';

import { tokens } from '../design/tokens';
import { flightMotionIntent } from './motionIntent';

describe('motion tokens', () => {
  test('duration scale is wired', () => {
    expect(tokens.game.motion.duration.normal).toBe(320);
    expect(tokens.game.motion.spring.settle.damping).toBe(18);
    expect(tokens.game.motion.stagger).toBe(70);
  });
});

describe('flightMotionIntent', () => {
  test('maps emphasis and duration', () => {
    expect(flightMotionIntent({ emphasis: 'hiddenSwap', durationMs: 500 })).toBe('drift');
    expect(flightMotionIntent({ emphasis: 'discardReadable', durationMs: 800 })).toBe('reveal');
    expect(
      flightMotionIntent({
        emphasis: 'normal',
        durationMs: tokens.game.motion.duration.normal,
      }),
    ).toBe('snap');
    expect(
      flightMotionIntent({
        emphasis: 'normal',
        durationMs: tokens.game.motion.duration.heavy,
      }),
    ).toBe('carry');
    expect(
      flightMotionIntent({
        emphasis: 'normal',
        durationMs: tokens.game.motion.duration.quick,
        toAnchor: { kind: 'drawn' },
      }),
    ).toBe('carry');
  });
});
