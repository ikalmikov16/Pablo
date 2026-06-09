import { describe, expect, test, beforeEach } from 'bun:test';

import {
  getAnchorRect,
  getAnchorSnapshot,
  registerAnchor,
  resetAnchorRegistryForTests,
  unregisterAnchor,
} from './anchorRegistry';

beforeEach(() => {
  resetAnchorRegistryForTests();
});

describe('anchorRegistry', () => {
  test('register and read round-trip', () => {
    registerAnchor({ kind: 'deck' }, { x: 1, y: 2, w: 30, h: 40 });
    const snap = getAnchorSnapshot();
    expect(getAnchorRect(snap, { kind: 'deck' })).toEqual({ x: 1, y: 2, w: 30, h: 40 });
  });

  test('unregister removes anchor', () => {
    registerAnchor({ kind: 'discard' }, { x: 0, y: 0, w: 10, h: 10 });
    unregisterAnchor({ kind: 'discard' });
    const snap = getAnchorSnapshot();
    expect(getAnchorRect(snap, { kind: 'discard' })).toBeNull();
  });

  test('re-register overwrites', () => {
    registerAnchor({ kind: 'drawn' }, { x: 0, y: 0, w: 10, h: 10 });
    registerAnchor({ kind: 'drawn' }, { x: 5, y: 5, w: 20, h: 28 });
    const snap = getAnchorSnapshot();
    expect(getAnchorRect(snap, { kind: 'drawn' })?.w).toBe(20);
  });

  test('snapshot is a copy', () => {
    registerAnchor({ kind: 'deck' }, { x: 1, y: 1, w: 1, h: 1 });
    const a = getAnchorSnapshot();
    const b = getAnchorSnapshot();
    expect(a).not.toBe(b);
    expect(a.get('deck')).toEqual(b.get('deck'));
  });
});
