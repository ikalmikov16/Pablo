import { describe, expect, it } from 'bun:test';
import { t } from './index';

describe('t()', () => {
  it('resolves a simple key', () => {
    expect(t('dev.cardLab.title')).toBe('Card Lab');
  });

  it('resolves a nested key', () => {
    expect(t('dev.home.title')).toBe('Pablo');
  });

  it('interpolates a single variable', () => {
    expect(t('dev.cardLab.themeButton', { name: 'Midnight' })).toBe('Theme: Midnight');
  });

  it('interpolates a numeric variable', () => {
    expect(t('dev.cardLab.themeButton', { name: 42 })).toBe('Theme: 42');
  });

  it('returns the key itself for unknown keys (debuggable fallback)', () => {
    expect(t('does.not.exist')).toBe('does.not.exist');
  });

  it('returns raw string when no vars provided', () => {
    expect(t('dev.cardLab.tapToFlip')).toBe('Tap to flip · Drag to move');
  });

  it('does not mutate caller vars object', () => {
    const vars = { name: 'Classic' };
    t('dev.cardLab.themeButton', vars);
    expect(vars).toEqual({ name: 'Classic' });
  });

  it('leaves unmatched placeholders intact', () => {
    // {{name}} key absent from vars → falls back to empty string from String(undefined ?? '')
    const result = t('dev.cardLab.themeButton', {});
    expect(result).toBe('Theme: ');
  });
});
