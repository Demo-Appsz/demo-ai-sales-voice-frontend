const CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

const VOICE_PRESETS = {
  female: {
    agentName: "Jasmin",
    voiceId: "qXOoUJU1h7AiwSe4ltRA", // Jasmin (Zulfa - Native Indonesian Energetic)
    stability: 0.36,
    speed: 1.05,
    similarityBoost: 0.78,
    dynamicVariables: {
      agent_name: "Jasmin",
      agent_greeting:
        "Halo! Dengan Jasmin di sini, asisten layanan pelanggan Anda. Apa kabar? Ada yang bisa saya bantu hari ini?",
      agent_persona:
        "Anda adalah konsultan Sales dan Layanan Pelanggan virtual yang hangat, komunikatif, dan solutif. Anda membantu menggali kebutuhan penelepon secara natural dan berdiskusi seputar solusi digital, layanan bisnis, maupun pertanyaan umum."
    }
  },
  male: {
    agentName: "Mas Rouf",
    voiceId: "zmqLb9Ysr8fUvDD7hXK8", // Mas Rouf (Zan - Native Indonesian ~50yo Mature, Warm & Energetic)
    stability: 0.40,
    speed: 1.04,
    similarityBoost: 0.78,
    dynamicVariables: {
      agent_name: "Mas Rouf",
      agent_greeting:
        "Halo! Saya Mas Rouf, Kepala Pusat Data dan Informasi. Ada yang bisa saya bantu atau kita diskusikan hari ini?",
      agent_persona:
        "Anda menjabat sebagai Kapus Datin (Kepala Pusat Data dan Informasi), sosok pimpinan matang berusia sekitar 50 tahun yang tetap energik, sigap, hangat, dan akrab saat berdiskusi. Anda menguasai secara mendalam tata kelola data dan informasi terpadu, prinsip Satu Data, integrasi dan interoperabilitas sistem lintas unit atau instansi, arsitektur SPBE (Sistem Pemerintahan Berbasis Elektronik) dan layanan digital publik, infrastruktur pusat data (data center) dan cloud, keamanan siber serta perlindungan data, hingga pemanfaatan analitik data dan AI untuk mendukung pengambilan keputusan pimpinan (data-driven policy) serta diseminasi informasi publik. Berbicaralah dalam bahasa Indonesia sehari-hari yang natural, berwibawa namun tetap santai, lugas, dan solutif seperti pemimpin senior sungguhan di telepon."
    }
  }
};

async function fetchWithTimeout(url, options = {}, timeoutMs = 6000) {
  const signal =
    typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
      ? AbortSignal.timeout(timeoutMs)
      : undefined;
  return fetch(url, signal ? { ...options, signal } : options);
}

function buildFallbackResponse({ gender, voiceConfig, preset, fallbackReason, quota = null }) {
  return new Response(
    JSON.stringify({
      success: true,
      connectionType: "fallback",
      fallbackReason,
      ...(quota ? { quota } : {}),
      voiceGender: gender,
      voiceConfig,
      dynamicVariables: preset.dynamicVariables
    }),
    { status: 200, headers: CORS_HEADERS }
  );
}

const inFlightQuotaChecks = new Map();

async function getSubscriptionQuota(apiKey, agentId) {
  const cacheKeyId = String(agentId || "default");
  const cacheUrl = `https://quota-cache.internal/elevenlabs-sub/${encodeURIComponent(cacheKeyId)}`;
  let edgeCache = null;

  try {
    if (typeof caches !== "undefined" && caches?.default) {
      edgeCache = caches.default;
      const cached = await edgeCache.match(cacheUrl);
      if (cached) {
        return await cached.json();
      }
    }
  } catch {
    edgeCache = null;
  }

  if (inFlightQuotaChecks.has(cacheKeyId)) {
    return inFlightQuotaChecks.get(cacheKeyId);
  }

  const checkPromise = (async () => {
    const subRes = await fetchWithTimeout(
      "https://api.elevenlabs.io/v1/user/subscription",
      { headers: { "xi-api-key": apiKey } },
      4500
    ).catch(() => null);

    if (!subRes?.ok) return null;

    const subData = await subRes.json();
    const used = Number(subData.character_count || 0);
    const limit = Number(subData.character_limit || 0);
    const remaining = Math.max(0, limit - used);
    const quota = { used, limit, remaining };

    if (edgeCache && limit > 0) {
      try {
        await edgeCache.put(
          cacheUrl,
          new Response(JSON.stringify(quota), {
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "public, max-age=10"
            }
          })
        );
      } catch {}
    }

    return quota;
  })().finally(() => {
    inFlightQuotaChecks.delete(cacheKeyId);
  });

  inFlightQuotaChecks.set(cacheKeyId, checkPromise);
  return checkPromise;
}

async function createAgentSession({ request, env }) {
  const apiKey = env?.ELEVENLABS_API_KEY;
  const agentId = env?.ELEVENLABS_AGENT_ID;

  if (!apiKey || !agentId) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "Server configuration missing (ELEVENLABS_API_KEY / ELEVENLABS_AGENT_ID)"
      }),
      { status: 500, headers: CORS_HEADERS }
    );
  }

  let gender = "female";
  try {
    if (request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      if (body?.voiceGender === "male" || body?.voiceGender === "female") {
        gender = body.voiceGender;
      }
    } else {
      const url = new URL(request.url);
      const q = url.searchParams.get("voiceGender");
      if (q === "male" || q === "female") {
        gender = q;
      }
    }
  } catch {
    gender = "female";
  }

  const preset = VOICE_PRESETS[gender] || VOICE_PRESETS.female;
  const voiceConfig = {
    agentName: preset.agentName,
    voiceId: preset.voiceId,
    stability: preset.stability,
    speed: preset.speed,
    similarityBoost: preset.similarityBoost
  };

  try {
    // Check remaining quota (edge-cached 10s so concurrent bursts don't rate-limit upstream)
    const quota = await getSubscriptionQuota(apiKey, agentId);
    if (quota && quota.limit > 0 && quota.remaining < 250) {
      return buildFallbackResponse({
        gender,
        voiceConfig,
        preset,
        fallbackReason: "quota_exhausted",
        quota
      });
    }

    // Request WebRTC conversation token
    const tokenRes = await fetchWithTimeout(
      `https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${encodeURIComponent(agentId)}`,
      { headers: { "xi-api-key": apiKey } },
      6000
    ).catch(() => null);

    if (tokenRes?.ok) {
      const tokenData = await tokenRes.json();
      if (tokenData.token) {
        return new Response(
          JSON.stringify({
            success: true,
            connectionType: "webrtc",
            conversationToken: tokenData.token,
            conversationId: tokenData.conversation_id || null,
            voiceGender: gender,
            voiceConfig,
            dynamicVariables: preset.dynamicVariables
          }),
          { status: 200, headers: CORS_HEADERS }
        );
      }
    }

    // Fallback to WebSocket signed URL
    const signedRes = await fetchWithTimeout(
      `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`,
      { headers: { "xi-api-key": apiKey } },
      6000
    ).catch(() => null);

    if (!signedRes || !signedRes.ok) {
      const status = signedRes?.status || 503;
      const fallbackReason = status === 429 ? "concurrency_or_rate_limited" : "upstream_unavailable";
      return buildFallbackResponse({
        gender,
        voiceConfig,
        preset,
        fallbackReason
      });
    }

    const signedData = await signedRes.json();
    return new Response(
      JSON.stringify({
        success: true,
        connectionType: "websocket",
        signedUrl: signedData.signed_url,
        voiceGender: gender,
        voiceConfig,
        dynamicVariables: preset.dynamicVariables
      }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch {
    return buildFallbackResponse({
      gender,
      voiceConfig,
      preset,
      fallbackReason: "upstream_unavailable"
    });
  }
}

export async function onRequestGet(context) {
  return createAgentSession(context);
}

export async function onRequestPost(context) {
  return createAgentSession(context);
}
