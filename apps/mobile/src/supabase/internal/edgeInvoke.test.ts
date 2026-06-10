import { describe, expect, test } from 'bun:test';
import type { SupabaseClient } from '@supabase/supabase-js';

import { invokeEdge, toClientResult } from './edgeInvoke';

describe('edgeInvoke', () => {
  test('toClientResult maps ok envelope', () => {
    const result = toClientResult({ ok: true, data: { version: 3 } });
    expect(result).toEqual({ ok: true, data: { version: 3 } });
  });

  test('toClientResult maps error envelope', () => {
    const result = toClientResult({ ok: false, error: 'version_mismatch' });
    expect(result).toEqual({ ok: false, error: 'version_mismatch' });
  });

  test('invokeEdge maps network throw to network_error', async () => {
    const supabase = {
      functions: {
        invoke: async () => {
          throw new Error('offline');
        },
      },
    } as unknown as SupabaseClient;

    const result = await invokeEdge(supabase, 'applyMove', {});
    expect(result).toEqual({ ok: false, error: 'network_error' });
  });

  test('invokeEdge maps function error envelope', async () => {
    const supabase = {
      functions: {
        invoke: async () => ({
          data: { ok: false, error: 'not_authorized' },
          error: null,
        }),
      },
    } as unknown as SupabaseClient;

    const result = await invokeEdge(supabase, 'joinRoom', { code: 'ABCD' });
    expect(result).toEqual({ ok: false, error: 'not_authorized' });
  });

  test('invokeEdge reads envelope from non-2xx FunctionsHttpError context', async () => {
    const errorWithContext = Object.assign(
      new Error('Edge Function returned a non-2xx status code'),
      {
        context: new Response(JSON.stringify({ ok: false, error: 'unauthenticated' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }),
      },
    );
    const supabase = {
      functions: {
        invoke: async () => ({ data: null, error: errorWithContext }),
      },
    } as unknown as SupabaseClient;

    const result = await invokeEdge(supabase, 'applyMove', {});
    expect(result).toEqual({ ok: false, error: 'unauthenticated' });
  });

  test('invokeEdge falls back to network_error when context body is not an envelope', async () => {
    const errorWithContext = Object.assign(new Error('non-2xx'), {
      context: new Response('<html>gateway timeout</html>', { status: 504 }),
    });
    const supabase = {
      functions: {
        invoke: async () => ({ data: null, error: errorWithContext }),
      },
    } as unknown as SupabaseClient;

    const result = await invokeEdge(supabase, 'applyMove', {});
    expect(result).toEqual({ ok: false, error: 'network_error' });
  });
});
