/**
 * Shared HTTP broadcast helper for Supabase Realtime.
 * Uses the Realtime REST API so edge functions don't need a WebSocket.
 */

/**
 * Fires a broadcast tick on channel `game:{gameId}`.
 * Non-fatal: logs but does not throw on failure.
 */
export async function broadcastGameTick(gameId: string, version: number): Promise<void> {
  const url = Deno.env.get('SUPABASE_URL')!;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  try {
    await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        apikey: key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          {
            topic: `game:${gameId}`,
            event: 'tick',
            payload: { version },
          },
        ],
      }),
    });
  } catch (e) {
    console.error('[broadcastGameTick] failed:', e);
  }
}
