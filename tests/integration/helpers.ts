/**
 * Integration test helpers.
 * Reads local env from apps/mobile/.env.local (or process.env overrides).
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function parseEnvFile(filePath: string): Record<string, string> {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const result: Record<string, string> = {};
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      result[key] = value;
    }
    return result;
  } catch {
    return {};
  }
}

const workspaceRoot = resolve(import.meta.dir, '../..');
const mobileEnv = parseEnvFile(resolve(workspaceRoot, 'apps/mobile/.env.local'));

export const SUPABASE_URL =
  process.env.SUPABASE_URL ?? mobileEnv['EXPO_PUBLIC_SUPABASE_URL'] ?? 'http://127.0.0.1:54321';

export const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ?? mobileEnv['EXPO_PUBLIC_SUPABASE_ANON_KEY'] ?? '';

export const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;

/** Sign in anonymously and return a Supabase client with the session. */
export async function signInAnon(): Promise<{ client: SupabaseClient; uid: string }> {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const {
    data: { user },
    error,
  } = await client.auth.signInAnonymously();
  if (error || !user) throw new Error(`signInAnonymously failed: ${error?.message}`);
  return { client, uid: user.id };
}

/** Call an edge function with the given client's session. */
export async function callFn<T>(
  client: SupabaseClient,
  name: string,
  body: Record<string, unknown>,
): Promise<T> {
  const {
    data: { session },
  } = await client.auth.getSession();
  const token = session?.access_token;
  const res = await fetch(`${FUNCTIONS_URL}/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok && res.status !== 200) {
    throw new Error(`HTTP ${res.status} from ${name}: ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}
