import test from 'node:test';
import assert from 'node:assert/strict';

import { onRequestPost as sessionPost } from '../functions/api/agent/session.js';
import { onRequestPost as ttsPost } from '../functions/api/tts.js';
import { onRequestPost as tracePost } from '../functions/api/telemetry/trace.js';

function jsonReq(url, body) {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

test('Telemetry: session API records voice_ai_sessions and trace log to Supabase when configured', async () => {
  const originalFetch = globalThis.fetch;
  const supabaseWrites = [];

  globalThis.fetch = async (url, init = {}) => {
    const target = String(url);
    if (target.startsWith('https://mock-proj.supabase.co/rest/v1/')) {
      supabaseWrites.push({
        path: target.replace('https://mock-proj.supabase.co/rest/v1/', ''),
        method: init.method || 'GET',
        headers: init.headers || {},
        body: JSON.parse(init.body)
      });
      return new Response('', { status: 201 });
    }
    if (target.includes('/v1/user/subscription')) {
      return new Response(JSON.stringify({ character_count: 100, character_limit: 10000 }), { status: 200 });
    }
    if (target.includes('/v1/convai/conversation/token')) {
      return new Response(JSON.stringify({ token: 'rtc_tok_supa', conversation_id: 'conv_supa_1' }), {
        status: 200
      });
    }
    throw new Error(`Unexpected fetch URL: ${target}`);
  };

  const pendingPromises = [];
  try {
    const res = await sessionPost({
      request: new Request('https://demo-ai-sales-voice.pages.dev/api/agent/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-IPCountry': 'ID', 'User-Agent': 'UnitTest/1.0' },
        body: JSON.stringify({ voiceGender: 'female' })
      }),
      env: {
        ELEVENLABS_API_KEY: 'sk_test',
        ELEVENLABS_AGENT_ID: 'agent_123',
        SUPABASE_URL: 'https://mock-proj.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'srv_role_secret'
      },
      waitUntil: (p) => pendingPromises.push(p)
    });

    await Promise.all(pendingPromises);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.traceId);

    const sessionRow = supabaseWrites.find((w) => w.path.startsWith('voice_ai_sessions'));
    const traceRow = supabaseWrites.find((w) => w.path === 'voice_ai_trace_logs');
    assert.ok(sessionRow, 'Expected upsert to voice_ai_sessions');
    assert.ok(traceRow, 'Expected insert to voice_ai_trace_logs');
    assert.equal(sessionRow.body.trace_id, data.traceId);
    assert.equal(sessionRow.body.environment, 'production');
    assert.equal(sessionRow.body.transport, 'webrtc');
    assert.equal(sessionRow.body.country, 'ID');
    assert.equal(traceRow.body.event_name, 'session_webrtc_issued');
    assert.equal(traceRow.body.source, 'server_session');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Telemetry: POST /api/telemetry/trace logs client lifecycle, updates session status, and saves transcripts', async () => {
  const originalFetch = globalThis.fetch;
  const supabaseWrites = [];

  globalThis.fetch = async (url, init = {}) => {
    const target = String(url);
    if (target.startsWith('https://dev-proj.supabase.co/rest/v1/')) {
      supabaseWrites.push({
        path: target.replace('https://dev-proj.supabase.co/rest/v1/', ''),
        method: init.method || 'GET',
        body: JSON.parse(init.body)
      });
      return new Response('', { status: 201 });
    }
    throw new Error(`Unexpected URL: ${target}`);
  };

  const env = {
    CF_PAGES_BRANCH: 'development',
    SUPABASE_URL: 'https://dev-proj.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'srv_dev_secret'
  };

  const pending = [];
  const waitUntil = (p) => pending.push(p);

  try {
    // Rejects invalid payload without traceId/eventName
    const badRes = await tracePost({
      request: jsonReq('https://development.demo-ai-sales-voice.pages.dev/api/telemetry/trace', { foo: 'bar' }),
      env,
      waitUntil
    });
    assert.equal(badRes.status, 400);

    // 1. Connected event
    await tracePost({
      request: jsonReq('https://development.demo-ai-sales-voice.pages.dev/api/telemetry/trace', {
        traceId: 'trace-xyz-1',
        eventName: 'call_connected',
        conversationId: 'conv_abc_99',
        latencyMs: 420
      }),
      env,
      waitUntil
    });

    // 2. Transcript message
    await tracePost({
      request: jsonReq('https://development.demo-ai-sales-voice.pages.dev/api/telemetry/trace', {
        traceId: 'trace-xyz-1',
        eventName: 'transcript_message',
        conversationId: 'conv_abc_99',
        messageCount: 1,
        payload: { speaker: 'user', text: 'Assalamualaikum, info pesantren 2025', eventId: 42 }
      }),
      env,
      waitUntil
    });

    // 3. Call ended
    await tracePost({
      request: jsonReq('https://development.demo-ai-sales-voice.pages.dev/api/telemetry/trace', {
        traceId: 'trace-xyz-1',
        eventName: 'call_ended',
        durationSeconds: 35,
        messageCount: 2,
        message: 'Panggilan telepon telah diakhiri'
      }),
      env,
      waitUntil
    });

    await Promise.all(pending);

    const traceLogs = supabaseWrites.filter((w) => w.path === 'voice_ai_trace_logs');
    assert.equal(traceLogs.length, 3);
    assert.equal(traceLogs[0].body.environment, 'preview');

    const msgInsert = supabaseWrites.find((w) => w.path === 'voice_ai_messages');
    assert.ok(msgInsert);
    assert.equal(msgInsert.body.speaker, 'user');
    assert.equal(msgInsert.body.content, 'Assalamualaikum, info pesantren 2025');

    const endPatch = supabaseWrites.find(
      (w) => w.method === 'PATCH' && w.body.status === 'ended' && w.body.duration_seconds === 35
    );
    assert.ok(endPatch, 'Expected session PATCH with duration_seconds and status ended');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Telemetry: TTS failure writes tts_error trace without breaking error response', async () => {
  const originalFetch = globalThis.fetch;
  const tracePayloads = [];

  globalThis.fetch = async (url, init = {}) => {
    const target = String(url);
    if (target.startsWith('https://mock-proj.supabase.co/rest/v1/voice_ai_trace_logs')) {
      tracePayloads.push(JSON.parse(init.body));
      return new Response('', { status: 201 });
    }
    if (target.includes('/v1/text-to-speech/')) {
      return new Response('quota exceeded', { status: 401 });
    }
    throw new Error(`Unexpected URL: ${target}`);
  };

  const pending = [];
  try {
    const res = await ttsPost({
      request: jsonReq('https://demo-ai-sales-voice.pages.dev/api/tts', {
        text: 'Tes ucapan Jasmin',
        voiceGender: 'female'
      }),
      env: {
        ELEVENLABS_API_KEY: 'sk_test',
        SUPABASE_URL: 'https://mock-proj.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'srv_secret'
      },
      waitUntil: (p) => pending.push(p)
    });
    await Promise.all(pending);

    assert.equal(res.status, 401);
    assert.equal(tracePayloads.length, 1);
    assert.equal(tracePayloads[0].event_name, 'tts_error');
    assert.equal(tracePayloads[0].http_status, 401);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
