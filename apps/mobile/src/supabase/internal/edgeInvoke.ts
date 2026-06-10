import type { SupabaseClient } from '@supabase/supabase-js';

import type { ClientErrorCode, ClientResult } from '../types';

type Envelope<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: string };

function isClientErrorCode(code: string): code is ClientErrorCode {
  return typeof code === 'string' && code.length > 0;
}

export function toClientResult<T>(envelope: Envelope<T> | null | undefined): ClientResult<T> {
  if (!envelope) return { ok: false, error: 'internal_error' };
  if (envelope.ok) return { ok: true, data: envelope.data };
  const code = envelope.error;
  return { ok: false, error: isClientErrorCode(code) ? code : 'internal_error' };
}

export function ok<T>(data: T): ClientResult<T> {
  return { ok: true, data };
}

export function fail(error: ClientErrorCode): ClientResult<never> {
  return { ok: false, error };
}

/**
 * Invoke a Supabase edge function and map the `{ ok, data } | { ok, error }` envelope
 * to `ClientResult<T>`.
 *
 * Edge functions return most errors as HTTP 200 envelopes, but auth failures
 * use 401, which supabase-js surfaces as a `FunctionsHttpError` instead of
 * parsed data. The original Response is on `error.context`, so we read the
 * envelope from there before falling back to `network_error`.
 */
export async function invokeEdge<T>(
  supabase: SupabaseClient,
  name: string,
  body: Record<string, unknown>,
): Promise<ClientResult<T>> {
  try {
    const { data, error } = await supabase.functions.invoke<Envelope<T>>(name, { body });
    if (error) {
      const response = (error as { context?: unknown }).context;
      if (response instanceof Response) {
        try {
          return toClientResult((await response.json()) as Envelope<T>);
        } catch {
          // Body wasn't our envelope — fall through to network_error.
        }
      }
      return fail('network_error');
    }
    return toClientResult(data);
  } catch {
    return fail('network_error');
  }
}
