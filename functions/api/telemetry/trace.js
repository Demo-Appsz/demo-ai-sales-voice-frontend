import {
  CORS_HEADERS,
  insertConversationMessage,
  insertTraceLog,
  isSupabaseConfigured,
  patchVoiceSession,
  resolveEnvironmentName,
  runBackground
} from '../../lib/supabaseTrace.js';

function cleanString(value, maxLen = 500) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
}

function toSafeInt(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(0, Math.round(value));
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  let body = null;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ success: false, error: 'Invalid JSON payload' }), {
      status: 400,
      headers: CORS_HEADERS
    });
  }

  const traceId = cleanString(body?.traceId, 128);
  const eventName = cleanString(body?.eventName, 80);
  if (!traceId || !eventName) {
    return new Response(
      JSON.stringify({ success: false, error: 'traceId and eventName are required' }),
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const environment = resolveEnvironmentName(request, env);
  const conversationId = cleanString(body?.conversationId, 128);
  const allowedLevels = new Set(['debug', 'info', 'warn', 'error']);
  const level = allowedLevels.has(body?.level) ? body.level : 'info';
  const latencyMs = toSafeInt(body?.latencyMs);
  const durationSeconds = toSafeInt(body?.durationSeconds);
  const messageCount = toSafeInt(body?.messageCount);
  const message = cleanString(body?.message, 1000);
  const payload = body?.payload && typeof body.payload === 'object' ? body.payload : {};

  const work = [];
  work.push(
    insertTraceLog(env, {
      trace_id: traceId,
      elevenlabs_conversation_id: conversationId,
      environment,
      source: cleanString(body?.source, 40) || 'client_call',
      level,
      event_name: eventName,
      latency_ms: latencyMs,
      http_status: toSafeInt(body?.httpStatus),
      message,
      payload
    })
  );

  const nowIso = new Date().toISOString();
  if (eventName === 'call_connected') {
    work.push(
      patchVoiceSession(env, traceId, {
        status: 'connected',
        connected_at: nowIso,
        ...(conversationId ? { elevenlabs_conversation_id: conversationId } : {})
      })
    );
  } else if (
    eventName === 'call_ended' ||
    eventName === 'call_disconnected' ||
    eventName === 'idle_auto_close'
  ) {
    work.push(
      patchVoiceSession(env, traceId, {
        status: 'ended',
        ended_at: nowIso,
        ...(durationSeconds !== null ? { duration_seconds: durationSeconds } : {}),
        ...(messageCount !== null ? { message_count: messageCount } : {}),
        ...(message ? { end_reason: message } : {})
      })
    );
  } else if (
    eventName === 'maintenance_triggered' ||
    eventName === 'mic_permission_denied' ||
    eventName === 'mic_not_found'
  ) {
    const isMaint = eventName === 'maintenance_triggered';
    work.push(
      patchVoiceSession(env, traceId, {
        status: isMaint ? 'maintenance' : 'error',
        ended_at: nowIso,
        ...(isMaint
          ? { maintenance_reason: cleanString(payload?.reason, 120) || message || eventName }
          : { end_reason: message || eventName })
      })
    );
  } else if (eventName === 'transcript_message') {
    const speaker = payload?.speaker === 'user' ? 'user' : 'agent';
    const text = cleanString(payload?.text, 4000);
    if (text) {
      work.push(
        insertConversationMessage(env, {
          trace_id: traceId,
          elevenlabs_conversation_id: conversationId,
          event_id: payload?.eventId !== undefined ? cleanString(String(payload.eventId), 128) : null,
          speaker,
          content: text,
          corrected: Boolean(payload?.corrected)
        })
      );
      if (messageCount !== null) {
        work.push(patchVoiceSession(env, traceId, { message_count: messageCount }));
      }
    }
  }

  runBackground(context, Promise.all(work));

  return new Response(
    JSON.stringify({
      success: true,
      recorded: true,
      configured: isSupabaseConfigured(env),
      traceId
    }),
    { status: 200, headers: CORS_HEADERS }
  );
}
