import test from 'node:test';
import assert from 'node:assert/strict';

import { onRequestPost as sessionPost, onRequestGet as sessionGet } from '../functions/api/agent/session.js';
import { onRequestPost as ttsPost } from '../functions/api/tts.js';

function jsonReq(url, body, method = 'POST') {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
}

test('session API returns 500 when env secrets are missing', async () => {
  const res = await sessionPost({
    request: jsonReq('https://example.test/api/agent/session', { voiceGender: 'female' }),
    env: {}
  });
  assert.equal(res.status, 500);
  const data = await res.json();
  assert.equal(data.success, false);
});

test('session API returns ElevenLabs WebRTC token and distinct voice configs when quota is healthy', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/v1/user/subscription')) {
      return new Response(JSON.stringify({ character_count: 1000, character_limit: 10000 }), { status: 200 });
    }
    if (u.includes('/v1/convai/conversation/token')) {
      return new Response(JSON.stringify({ token: 'rtc-tok-abc', conversation_id: 'conv_abc' }), { status: 200 });
    }
    throw new Error(`Unexpected fetch URL: ${u}`);
  };

  try {
    const resFemale = await sessionPost({
      request: jsonReq('https://example.test/api/agent/session', { voiceGender: 'female' }),
      env: { ELEVENLABS_API_KEY: 'sk_test', ELEVENLABS_AGENT_ID: 'agent_123' }
    });
    assert.equal(resFemale.status, 200);
    const f = await resFemale.json();
    assert.equal(f.connectionType, 'webrtc');
    assert.equal(f.conversationToken, 'rtc-tok-abc');
    assert.equal(f.voiceConfig.agentName, 'Jasmin');
    assert.equal(f.voiceConfig.voiceId, 'qXOoUJU1h7AiwSe4ltRA');
    assert.equal(f.dynamicVariables.agent_name, 'Jasmin');

    const resMale = await sessionPost({
      request: jsonReq('https://example.test/api/agent/session', { voiceGender: 'male' }),
      env: { ELEVENLABS_API_KEY: 'sk_test', ELEVENLABS_AGENT_ID: 'agent_123' }
    });
    assert.equal(resMale.status, 200);
    const m = await resMale.json();
    assert.equal(m.connectionType, 'webrtc');
    assert.equal(m.voiceConfig.agentName, 'Mas Rouf');
    assert.equal(m.voiceConfig.voiceId, 'zmqLb9Ysr8fUvDD7hXK8');
    assert.equal(m.dynamicVariables.agent_name, 'Mas Rouf');
    assert.match(m.dynamicVariables.agent_persona, /Kapus Datin/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('session API uses ElevenLabs WebSocket signedUrl when WebRTC token is unavailable', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/v1/user/subscription')) {
      return new Response(JSON.stringify({ character_count: 500, character_limit: 10000 }), { status: 200 });
    }
    if (u.includes('/v1/convai/conversation/token')) {
      return new Response('upstream error', { status: 502 });
    }
    if (u.includes('/v1/convai/conversation/get-signed-url')) {
      return new Response(JSON.stringify({ signed_url: 'wss://signed.example/ws' }), { status: 200 });
    }
    throw new Error(`Unexpected fetch URL: ${u}`);
  };

  try {
    const res = await sessionGet({
      request: new Request('https://example.test/api/agent/session?voiceGender=female'),
      env: { ELEVENLABS_API_KEY: 'sk_test', ELEVENLABS_AGENT_ID: 'agent_123' }
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.connectionType, 'websocket');
    assert.equal(data.signedUrl, 'wss://signed.example/ws');
    assert.equal(data.voiceGender, 'female');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('session API returns 503 maintenance mode with NO fallback when ElevenLabs quota is exhausted (< 250 chars remaining)', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const target = String(url);
    if (target.includes('/v1/user/subscription')) {
      return new Response(JSON.stringify({ character_count: 9801, character_limit: 10000 }), { status: 200 });
    }
    if (target.includes('/v1/convai/conversation/token')) {
      return new Response(JSON.stringify({ token: 'should-never-reach-client' }), { status: 200 });
    }
    throw new Error(`Unexpected fetch URL: ${target}`);
  };

  try {
    const res = await sessionPost({
      request: jsonReq('https://example.test/api/agent/session', { voiceGender: 'female' }),
      env: { ELEVENLABS_API_KEY: 'sk_test', ELEVENLABS_AGENT_ID: 'agent_123' }
    });
    assert.equal(res.status, 503);
    const data = await res.json();
    assert.equal(data.success, false);
    assert.equal(data.maintenance, true);
    assert.equal(data.reason, 'quota_exhausted');
    assert.equal(data.quota.remaining, 199);
    assert.equal(data.connectionType, undefined);
    assert.equal(data.conversationToken, undefined);
    assert.match(data.error, /maintenance/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('session API returns 503 maintenance fail-fast on upstream HTTP 402/429 without extra signed-url latency', async () => {
  const originalFetch = globalThis.fetch;
  const calledEndpoints = [];
  globalThis.fetch = async (url) => {
    const target = String(url);
    calledEndpoints.push(target);
    if (target.includes('/user/subscription')) {
      return new Response(JSON.stringify({ character_count: 100, character_limit: 10000 }), { status: 200 });
    }
    if (target.includes('/convai/conversation/token')) {
      return new Response('Too Many Requests', { status: 429 });
    }
    throw new Error(`Should fail-fast before calling ${target}`);
  };

  try {
    const res = await sessionPost({
      request: jsonReq('https://example.test/api/agent/session', { voiceGender: 'female' }),
      env: { ELEVENLABS_API_KEY: 'sk_test', ELEVENLABS_AGENT_ID: 'agent_test' }
    });
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.maintenance, true);
    assert.equal(body.reason, 'concurrency_or_rate_limited');
    assert.equal(body.connectionType, undefined);
    assert.equal(calledEndpoints.some((u) => u.includes('get-signed-url')), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('tts API maps female and male voiceGender to correct voice IDs', async () => {
  const originalFetch = globalThis.fetch;
  const calledUrls = [];
  globalThis.fetch = async (url) => {
    calledUrls.push(String(url));
    return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
  };

  try {
    await ttsPost({
      request: jsonReq('https://example.test/api/tts', { text: 'Halo', voiceGender: 'female' }),
      env: { ELEVENLABS_API_KEY: 'sk_test' }
    });
    await ttsPost({
      request: jsonReq('https://example.test/api/tts', { text: 'Halo', voiceGender: 'male' }),
      env: { ELEVENLABS_API_KEY: 'sk_test' }
    });

    assert.match(calledUrls[0], /qXOoUJU1h7AiwSe4ltRA/);
    assert.match(calledUrls[1], /zmqLb9Ysr8fUvDD7hXK8/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('multi-user concurrency: 30 simultaneous ElevenLabs session requests stay isolated', async () => {
  const originalFetch = globalThis.fetch;
  let seq = 0;
  globalThis.fetch = async (url) => {
    const target = String(url);
    if (target.includes('/user/subscription')) {
      return new Response(JSON.stringify({ character_count: 100, character_limit: 10000 }), { status: 200 });
    }
    if (target.includes('/conversation/token')) {
      const id = ++seq;
      return new Response(JSON.stringify({ token: `rtc_${id}`, conversation_id: `conv_${id}` }), { status: 200 });
    }
    return new Response('not mocked', { status: 500 });
  };

  try {
    const tasks = Array.from({ length: 30 }, (_, idx) => {
      const gender = idx % 2 === 1 ? 'male' : 'female';
      return sessionPost({
        request: jsonReq('https://example.test/api/agent/session', { voiceGender: gender }),
        env: { ELEVENLABS_API_KEY: 'sk_test', ELEVENLABS_AGENT_ID: 'agent_test' }
      }).then((r) => r.json());
    });

    const results = await Promise.all(tasks);
    const seenTokens = new Set();

    for (let i = 0; i < results.length; i += 1) {
      const sess = results[i];
      const expectedMale = i % 2 === 1;
      assert.equal(sess.success, true);
      assert.equal(sess.voiceGender, expectedMale ? 'male' : 'female');
      assert.equal(sess.voiceConfig.agentName, expectedMale ? 'Mas Rouf' : 'Jasmin');
      assert.equal(seenTokens.has(sess.conversationToken), false);
      seenTokens.add(sess.conversationToken);
    }
    assert.equal(seenTokens.size, 30);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
