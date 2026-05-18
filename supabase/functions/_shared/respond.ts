/**
 * Shared response helpers. All edge function responses flow through here
 * so the shape is always { ok: true, data } | { ok: false, error }.
 */

export function ok<T>(data: T): Response {
  return new Response(JSON.stringify({ ok: true, data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function err(code: string, httpStatus = 200): Response {
  return new Response(JSON.stringify({ ok: false, error: code }), {
    status: httpStatus,
    headers: { 'Content-Type': 'application/json' },
  });
}
