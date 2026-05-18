/**
 * Minimal i18n wrapper for Phase 3.
 *
 * Phase 4 replaces this with a full expo-localization integration; the t() call
 * signature is stable so no component changes are required.
 *
 * - Keys are dot-separated paths into the locale JSON.
 * - Unknown keys fall back to the key string itself (debuggable).
 * - Interpolation uses {{varName}} syntax (ICU-inspired, simple enough for v1).
 */
import en from './locales/en.json';

type Vars = Record<string, string | number>;

function lookup(obj: Record<string, unknown>, path: string): string | undefined {
  const parts = path.split('.');
  let node: unknown = obj;
  for (const part of parts) {
    if (node === null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string' ? node : undefined;
}

export function t(key: string, vars?: Vars): string {
  const raw = lookup(en as Record<string, unknown>, key);
  if (raw === undefined) return key;
  if (!vars) return raw;
  return raw.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? ''));
}
