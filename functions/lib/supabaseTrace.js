export const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

const TELEMETRY_TIMEOUT_MS = 3500;

export function isSupabaseConfigured(env) {
  return Boolean(env?.SUPABASE_URL && env?.SUPABASE_SERVICE_ROLE_KEY);
}

export function resolveEnvironmentName(request, env) {
  if (env?.CF_PAGES_BRANCH === 'main') return 'production';
  if (env?.CF_PAGES_BRANCH) return 'preview';
  try {
    const hostname = new URL(request.url).hostname.toLowerCase();
    if (hostname === '127.0.0.1' || hostname === 'localhost') return 'local';
    if (hostname === 'demo-ai-sales-voice.pages.dev') return 'production';
    if (hostname.endsWith('.demo-ai-sales-voice.pages.dev')) return 'preview';
  } catch {}
  return 'production';
}

export function runBackground(context, promise) {
  const safePromise = Promise.resolve(promise).catch(() => {});
  if (typeof context?.waitUntil === 'function') {
    context.waitUntil(safePromise);
  }
  return safePromise;
}

function getSupabaseHeaders(env, prefer = 'return=minimal') {
  return {
    'Content-Type': 'application/json',
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    Prefer: prefer
  };
}

function trimBaseUrl(url) {
  let clean = String(url || '').trim();
  while (clean.endsWith('/')) {
    clean = clean.slice(0, -1);
  }
  return clean;
}

async function postRest(env, tablePath, method, body, prefer = 'return=minimal') {
  if (!isSupabaseConfigured(env)) return false;
  const baseUrl = trimBaseUrl(env.SUPABASE_URL);
  if (!baseUrl) return false;

  try {
    const signal =
      typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
        ? AbortSignal.timeout(TELEMETRY_TIMEOUT_MS)
        : undefined;
    const res = await fetch(`${baseUrl}/rest/v1/${tablePath}`, {
      method,
      headers: getSupabaseHeaders(env, prefer),
      body: JSON.stringify(body),
      ...(signal ? { signal } : {})
    });
    if (!res.ok) {
      console.warn(`Supabase telemetry ${tablePath} HTTP ${res.status}`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn(`Supabase telemetry ${tablePath} error:`, err?.message || err);
    return false;
  }
}

export async function upsertVoiceSession(env, sessionRow) {
  if (!sessionRow?.trace_id) return false;
  return postRest(
    env,
    'voice_ai_sessions?on_conflict=trace_id',
    'POST',
    sessionRow,
    'resolution=merge-duplicates,return=minimal'
  );
}

export async function patchVoiceSession(env, traceId, fields) {
  if (!traceId || !fields || typeof fields !== 'object') return false;
  return postRest(
    env,
    `voice_ai_sessions?trace_id=eq.${encodeURIComponent(String(traceId))}`,
    'PATCH',
    fields
  );
}

export async function insertTraceLog(env, logRow) {
  if (!logRow?.trace_id || !logRow?.event_name) return false;
  return postRest(env, 'voice_ai_trace_logs', 'POST', logRow);
}

export async function insertConversationMessage(env, messageRow) {
  if (!messageRow?.trace_id || !messageRow?.content) return false;
  return postRest(env, 'voice_ai_messages', 'POST', messageRow);
}
