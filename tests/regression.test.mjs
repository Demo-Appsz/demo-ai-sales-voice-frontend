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
    assert.equal(m.voiceConfig.voiceId, 'zmqLb9Ysr8fUvDD7hXK8');
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

  // Natural conversational greetings (must NOT sound like a stiff menu)
  res = await fallbackChatPost({
    request: jsonReq('https://example.test/api/call/fallback-chat', {
      message: 'Halo, selamat sore',
      voiceGender: 'female'
    })
  });
  body = await res.json();
  assert.match(body.reply, /Jasmin/);
  assert.equal(/silakan tanyakan data lembaga 2024/i.test(body.reply), false);

  res = await fallbackChatPost({
    request: jsonReq('https://example.test/api/call/fallback-chat', {
      message: 'Halo Mas Rouf, apa kabar?',
      voiceGender: 'male'
    })
  });
  body = await res.json();
  assert.equal(/silakan tanyakan data lembaga 2024/i.test(body.reply), false);
  assert.equal(body.shouldEndCall, false);

  // Closing intent triggers shouldEndCall: true cleanly
  res = await fallbackChatPost({
    request: jsonReq('https://example.test/api/call/fallback-chat', {
      message: 'Oke terima kasih, tutup panggilan ya',
      voiceGender: 'male'
    })
  });
  body = await res.json();
  assert.equal(body.shouldEndCall, true);
  assert.match(body.reply, /tutup|sampai jumpa/i);

  // Negation / topic questions must NOT trigger false-positive close
  res = await fallbackChatPost({
    request: jsonReq('https://example.test/api/call/fallback-chat', {
      message: 'Jangan tutup panggilannya dulu ya, mau tanya soal tutup buku',
      voiceGender: 'male'
    })
  });
  body = await res.json();
  assert.equal(body.shouldEndCall, false);

  // LLM-driven closing via Workers AI binding (zero regex needed for natural phrasing)
  res = await fallbackChatPost({
    request: jsonReq('https://example.test/api/call/fallback-chat', {
      message: 'Mas saya mau meeting dulu ya nanti dilanjut',
      voiceGender: 'male'
    }),
    env: {
      AI: {
        run: async () => ({
          response: JSON.stringify({
            reply: 'Siap, sukses meetingnya ya! Panggilannya saya tutup dulu.',
            end_call: true
          })
        })
      }
    }
  });
  body = await res.json();
  assert.equal(body.shouldEndCall, true);
  assert.match(body.reply, /meeting/i);

  // Multilingual support: Arabic (العربية) & English
  res = await fallbackChatPost({
    request: jsonReq('https://example.test/api/call/fallback-chat', {
      message: 'السلام عليكم، كيف حالك؟',
      voiceGender: 'male'
    })
  });
  body = await res.json();
  assert.equal(body.language, 'ar');
  assert.match(body.reply, /وعليكم السلام/);
  assert.equal(body.shouldEndCall, false);

  res = await fallbackChatPost({
    request: jsonReq('https://example.test/api/call/fallback-chat', {
      message: 'مع السلامة، أغلق المكالمة',
      voiceGender: 'female'
    })
  });
  body = await res.json();
  assert.equal(body.language, 'ar');
  assert.equal(body.shouldEndCall, true);

  res = await fallbackChatPost({
    request: jsonReq('https://example.test/api/call/fallback-chat', {
      message: 'Hello, how many state institutions are in Aceh in 2024?',
      voiceGender: 'female'
    })
  });
  body = await res.json();
  assert.equal(body.language, 'en');
  assert.match(body.reply, /616 state religious institutions/);
  assert.equal(body.shouldEndCall, false);

  res = await fallbackChatPost({
    request: jsonReq('https://example.test/api/call/fallback-chat', {
      message: 'Goodbye, please end the call',
      voiceGender: 'male'
    })
  });
  body = await res.json();
  assert.equal(body.language, 'en');
  assert.equal(body.shouldEndCall, true);
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

test('session API gracefully falls back on upstream HTTP 429 rate-limit burst', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const target = String(url);
    if (target.includes('/user/subscription')) {
      return new Response(JSON.stringify({ character_count: 100, character_limit: 10000 }), { status: 200 });
    }
    return new Response('Too Many Requests', { status: 429 });
  };

  try {
    const res = await sessionPost({
      request: jsonReq('https://example.test/api/agent/session', { voiceGender: 'male' }),
      env: { ELEVENLABS_API_KEY: 'sk_test', ELEVENLABS_AGENT_ID: 'agent_test' }
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.connectionType, 'fallback');
    assert.equal(body.fallbackReason, 'concurrency_or_rate_limited');
    assert.equal(body.voiceConfig.agentName, 'Mas Rouf');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('multi-user concurrency: 30 simultaneous mixed Jasmin and Mas Rouf requests stay isolated', async () => {
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
      const isMale = idx % 2 === 1;
      const gender = isMale ? 'male' : 'female';
      return Promise.all([
        sessionPost({
          request: jsonReq('https://example.test/api/agent/session', { voiceGender: gender }),
          env: { ELEVENLABS_API_KEY: 'sk_test', ELEVENLABS_AGENT_ID: 'agent_test' }
        }).then((r) => r.json()),
        fallbackChatPost({
          request: jsonReq('https://example.test/api/call/fallback-chat', {
            voiceGender: gender,
            message: isMale
              ? 'Berapa pondok pesantren di Jawa Barat tahun 2025?'
              : 'Berapa lembaga di Aceh tahun 2024?'
          })
        }).then((r) => r.json())
      ]).then(([sess, chat]) => ({ isMale, sess, chat }));
    });

    const results = await Promise.all(tasks);
    const seenTokens = new Set();

    for (const { isMale, sess, chat } of results) {
      assert.equal(sess.success, true);
      assert.equal(sess.voiceGender, isMale ? 'male' : 'female');
      assert.equal(sess.voiceConfig.agentName, isMale ? 'Mas Rouf' : 'Jasmin');
      assert.equal(seenTokens.has(sess.conversationToken), false);
      seenTokens.add(sess.conversationToken);

      assert.equal(chat.success, true);
      if (isMale) {
        assert.match(chat.reply, /13\.005 pondok pesantren/);
      } else {
        assert.match(chat.reply, /616 lembaga negeri/);
      }
    }
    assert.equal(seenTokens.size, 30);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
