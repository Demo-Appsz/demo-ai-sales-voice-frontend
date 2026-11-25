import test from 'node:test';
import assert from 'node:assert/strict';

import { onRequestPost as sessionPost, onRequestGet as sessionGet } from '../functions/api/agent/session.js';
import { onRequestPost as fallbackChatPost } from '../functions/api/call/fallback-chat.js';
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

test('session API returns WebRTC token and distinct voice configs for Jasmin and Mas Rouf when quota is healthy', async () => {
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
    // Jasmin (female)
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

    // Mas Rouf (male - Kapus Datin)
    const resMale = await sessionPost({
      request: jsonReq('https://example.test/api/agent/session', { voiceGender: 'male' }),
      env: { ELEVENLABS_API_KEY: 'sk_test', ELEVENLABS_AGENT_ID: 'agent_123' }
    });
    assert.equal(resMale.status, 200);
    const m = await resMale.json();
    assert.equal(m.connectionType, 'webrtc');
    assert.equal(m.voiceConfig.agentName, 'Mas Rouf');
    assert.equal(m.voiceConfig.voiceId, '5U7QzveIXT8fIoBXaoUC');
    assert.equal(m.dynamicVariables.agent_name, 'Mas Rouf');
    assert.match(m.dynamicVariables.agent_persona, /Kapus Datin/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('session API falls back to WebSocket signedUrl if WebRTC token fails', async () => {
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
      request: new Request('https://example.test/api/agent/session?voiceGender=male'),
      env: { ELEVENLABS_API_KEY: 'sk_test', ELEVENLABS_AGENT_ID: 'agent_123' }
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.connectionType, 'websocket');
    assert.equal(data.signedUrl, 'wss://signed.example/ws');
    assert.equal(data.voiceGender, 'male');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('session API returns fallback mode cleanly when quota is exhausted (< 250 chars remaining)', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes('/v1/user/subscription')) {
      return new Response(JSON.stringify({ character_count: 9801, character_limit: 10000 }), { status: 200 });
    }
    throw new Error('Should not request conversation token when quota is exhausted');
  };

  try {
    for (const voiceGender of ['female', 'male']) {
      const res = await sessionPost({
        request: jsonReq('https://example.test/api/agent/session', { voiceGender }),
        env: { ELEVENLABS_API_KEY: 'sk_test', ELEVENLABS_AGENT_ID: 'agent_123' }
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.connectionType, 'fallback');
      assert.equal(data.fallbackReason, 'quota_exhausted');
      assert.equal(data.quota.remaining, 199);
      assert.equal(data.voiceGender, voiceGender);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fallback-chat API answers 2024, 2025, and persona queries accurately', async () => {
  // Aceh 2024
  let res = await fallbackChatPost({
    request: jsonReq('https://example.test/api/call/fallback-chat', {
      message: 'Berapa rincian data Aceh tahun 2024?',
      voiceGender: 'male'
    })
  });
  let body = await res.json();
  assert.equal(body.success, true);
  assert.match(body.reply, /616 lembaga negeri/);
  assert.match(body.reply, /433 MIN/);
  assert.match(body.reply, /109 MTsN/);

  // Jawa Barat 2025
  res = await fallbackChatPost({
    request: jsonReq('https://example.test/api/call/fallback-chat', {
      message: 'Berapa pesantren di Jawa Barat 2025?',
      voiceGender: 'female'
    })
  });
  body = await res.json();
  assert.match(body.reply, /13\.005 pondok pesantren/);
  assert.match(body.reply, /9\.223/);
  assert.match(body.reply, /3\.782/);

  // Jogja alias 2025
  res = await fallbackChatPost({
    request: jsonReq('https://example.test/api/call/fallback-chat', {
      message: 'Data pesantren jogja tahun 2025',
      voiceGender: 'male'
    })
  });
  body = await res.json();
  assert.match(body.reply, /438 pondok pesantren/);

  // National 2024 & 2025
  res = await fallbackChatPost({
    request: jsonReq('https://example.test/api/call/fallback-chat', {
      message: 'Total nasional pesantren 2025 berapa?',
      voiceGender: 'male'
    })
  });
  body = await res.json();
  assert.match(body.reply, /42\.435 pondok pesantren/);

  // Identity & Kapus Datin
  res = await fallbackChatPost({
    request: jsonReq('https://example.test/api/call/fallback-chat', {
      message: 'Siapa kamu?',
      voiceGender: 'male'
    })
  });
  body = await res.json();
  assert.match(body.reply, /Mas Rouf/);
  assert.match(body.reply, /Kepala Pusat Data dan Informasi/);

  res = await fallbackChatPost({
    request: jsonReq('https://example.test/api/call/fallback-chat', {
      message: 'Siapa kamu?',
      voiceGender: 'female'
    })
  });
  body = await res.json();
  assert.match(body.reply, /Jasmin/);
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
    assert.match(calledUrls[1], /5U7QzveIXT8fIoBXaoUC/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
