import {
  CORS_HEADERS,
  insertTraceLog,
  resolveEnvironmentName,
  runBackground,
  upsertVoiceSession
} from "../../lib/supabaseTrace.js";

const CORE_KEMENAG_RULES =
  "IDENTITAS: Asisten AI Digital Kementerian Agama Republik Indonesia yang humanis, ramah, profesional, tenang, santun, dan komunikatif. VOICE PERSONALITY: Bahasa Indonesia natural dengan artikulasi jelas, jawaban singkat, jelas, langsung pada inti, dan penjelasan bertahap jika diminta. CONVERSATION RULES: (1) Pahami maksud dan konteks pengguna; (2) Jawab berdasarkan sumber resmi Kemenag yang tersedia; (3) Jangan pernah mengarang data, regulasi, persyaratan, prosedur, atau status layanan; (4) Jelaskan keterbatasan secara transparan bila informasi belum tersedia: 'Maaf, informasi tersebut belum dapat saya pastikan berdasarkan sumber yang tersedia.'; (5) Ajukan paling banyak satu pertanyaan klarifikasi bila ambigu; (6) Hindari pengulangan; (7) Jangan memaksa memilih kategori jika sudah jelas; (8) Jangan mengklaim melakukan transaksi, pendaftaran, verifikasi, atau perubahan data; (9) Jangan meminta data pribadi tak relevan; (10) Prioritaskan sumber resmi Kemenag. VOICE INTERACTION: Ubah teks tertulis/tabel/kode/URL menjadi penjelasan verbal sederhana dengan jeda alami, tanpa membaca tabel atau URL secara harfiah. HUMAN ESCALATION: Jika membutuhkan petugas, keputusan administratif, verifikasi personal, atau pengaduan, jelaskan keterbatasan AI dan arahkan ke kanal resmi Kemenag. FOLLOW-UP wajar (bukan tiap respons): 'Apakah informasi tersebut sudah cukup membantu?', 'Apakah ada hal lain yang ingin Anda ketahui?', atau 'Jika diperlukan, saya dapat membantu menjelaskan langkah selanjutnya.'. CLOSING GREETING saat menutup sesi: 'Terima kasih telah menggunakan layanan Asisten AI Kementerian Agama Republik Indonesia. Semoga informasi yang saya sampaikan dapat membantu kebutuhan Anda. Wassalamu’alaikum warahmatullahi wabarakatuh.'";

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
        "Assalamu’alaikum Halo, saya Jasmin, Asisten AI Kementerian Agama Republik Indonesia. Ada yang bisa saya bantu hari ini?",
      agent_persona:
        `Anda adalah Jasmin, Asisten AI Digital Kementerian Agama Republik Indonesia yang hangat, ramah, sabar, komunikatif, dan membantu masyarakat mengakses informasi layanan, program, dan informasi publik Kemenag secara mudah. Gunakan salam pembuka pakem persis seperti berikut saat menyapa di awal panggilan: "Assalamu’alaikum Halo, saya Jasmin, Asisten AI Kementerian Agama Republik Indonesia. Ada yang bisa saya bantu hari ini?". ${CORE_KEMENAG_RULES}`
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
        "Assalamu’alaikum warahmatullahi wabarakatuh. Halo, saya Mas Rouf, Kepala Pusat Data dan Informasi Kementerian Agama Republik Indonesia. Ada yang bisa saya bantu hari ini?",
      agent_persona:
        `Anda adalah Mas Rouf, Kapus Datin (Kepala Pusat Data dan Informasi) sekaligus Asisten AI Digital Kementerian Agama Republik Indonesia, sosok pimpinan matang berusia sekitar 50 tahun yang tetap energik, tenang, sigap, hangat, dan akrab. Anda menguasai tata kelola data dan informasi terpadu, prinsip Satu Data, integrasi sistem lintas unit, arsitektur SPBE dan layanan digital publik, keamanan siber, serta statistik lembaga dan pesantren Kementerian Agama. ${CORE_KEMENAG_RULES}`
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

const MAINTENANCE_ERROR_MESSAGE =
  "Mohon maaf, layanan suara Asisten AI sedang dalam masa pemeliharaan (maintenance) dan sementara belum dapat menerima panggilan. Silakan coba beberapa saat lagi.";

function buildMaintenanceResponse({ status = 503, reason, quota = null, traceId = null }) {
  return new Response(
    JSON.stringify({
      success: false,
      maintenance: true,
      reason,
      ...(traceId ? { traceId } : {}),
      ...(quota ? { quota } : {}),
      error: MAINTENANCE_ERROR_MESSAGE
    }),
    { status, headers: CORS_HEADERS }
  );
}

const inFlightQuotaChecks = new Map();

function buildQuotaCacheUrl(requestUrl, agentId) {
  const origin = (() => {
    try {
      return new URL(requestUrl).origin;
    } catch {
      return "https://demo-ai-sales-voice.pages.dev";
    }
  })();
  return `${origin}/__internal/elevenlabs-sub/${encodeURIComponent(String(agentId || "default"))}`;
}

async function readCachedQuota(cacheUrl) {
  try {
    if (typeof caches !== "undefined" && caches?.default) {
      const cached = await caches.default.match(cacheUrl);
      if (cached) {
        return await cached.json();
      }
    }
  } catch {}
  return null;
}

async function getSubscriptionQuota(apiKey, agentId, requestUrl) {
  const cacheKeyId = String(agentId || "default");
  const cacheUrl = buildQuotaCacheUrl(requestUrl, cacheKeyId);

  const cached = await readCachedQuota(cacheUrl);
  if (cached) return cached;

  if (inFlightQuotaChecks.has(cacheKeyId)) {
    return inFlightQuotaChecks.get(cacheKeyId);
  }

  const checkPromise = (async () => {
    const subRes = await fetchWithTimeout(
      "https://api.elevenlabs.io/v1/user/subscription",
      { headers: { "xi-api-key": apiKey } },
      2500
    ).catch(() => null);

    if (!subRes?.ok) return null;

    const subData = await subRes.json();
    const used = Number(subData.character_count || 0);
    const limit = Number(subData.character_limit || 0);
    const remaining = Math.max(0, limit - used);
    const quota = { used, limit, remaining };

    if (typeof caches !== "undefined" && caches?.default && limit > 0) {
      try {
        await caches.default.put(
          cacheUrl,
          new Response(JSON.stringify(quota), {
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "public, max-age=30"
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

async function createAgentSession(context) {
  const { request, env } = context;
  const startedMs = Date.now();
  const traceId = crypto.randomUUID();
  const environment = resolveEnvironmentName(request, env);
  const country = request.headers.get("CF-IPCountry") || null;
  const userAgent = request.headers.get("User-Agent") || null;

  const apiKey = env?.ELEVENLABS_API_KEY;
  const agentId = env?.ELEVENLABS_AGENT_ID;

  if (!apiKey || !agentId) {
    runBackground(
      context,
      insertTraceLog(env, {
        trace_id: traceId,
        environment,
        source: "server_session",
        level: "error",
        event_name: "session_config_missing",
        latency_ms: Date.now() - startedMs,
        http_status: 500,
        message: "Server configuration missing (ELEVENLABS_API_KEY / ELEVENLABS_AGENT_ID)"
      })
    );
    return new Response(
      JSON.stringify({
        success: false,
        traceId,
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

  const traceSessionAndLog = ({
    status,
    transport,
    eventName,
    level = "info",
    httpStatus = 200,
    conversationId = null,
    reason = null,
    quota = null
  }) => {
    const latencyMs = Date.now() - startedMs;
    runBackground(
      context,
      Promise.all([
        upsertVoiceSession(env, {
          trace_id: traceId,
          elevenlabs_conversation_id: conversationId,
          environment,
          agent_name: preset.agentName,
          voice_gender: gender,
          voice_id: preset.voiceId,
          transport,
          status,
          maintenance_reason: reason,
          quota_used: quota?.used ?? null,
          quota_limit: quota?.limit ?? null,
          quota_remaining: quota?.remaining ?? null,
          country,
          user_agent: userAgent ? userAgent.slice(0, 300) : null
        }),
        insertTraceLog(env, {
          trace_id: traceId,
          elevenlabs_conversation_id: conversationId,
          environment,
          source: "server_session",
          level,
          event_name: eventName,
          latency_ms: latencyMs,
          http_status: httpStatus,
          message: reason,
          payload: {
            voiceGender: gender,
            agentName: preset.agentName,
            transport,
            ...(quota ? { quota } : {})
          }
        })
      ])
    );
  };

  try {
    // 1. Check 30s edge-cached quota first (~1ms): fail-fast if already known exhausted
    const cachedQuota = await readCachedQuota(buildQuotaCacheUrl(request.url, agentId));
    if (cachedQuota && cachedQuota.limit > 0 && cachedQuota.remaining < 250) {
      traceSessionAndLog({
        status: "maintenance",
        transport: "maintenance",
        eventName: "session_maintenance",
        level: "warn",
        httpStatus: 503,
        reason: "quota_exhausted",
        quota: cachedQuota
      });
      return buildMaintenanceResponse({
        status: 503,
        reason: "quota_exhausted",
        quota: cachedQuota,
        traceId
      });
    }

    // 2. Run quota validation & WebRTC token fetch concurrently to eliminate serial RTT penalty
    const [quota, tokenRes] = await Promise.all([
      cachedQuota ? Promise.resolve(cachedQuota) : getSubscriptionQuota(apiKey, agentId, request.url),
      fetchWithTimeout(
        `https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${encodeURIComponent(agentId)}`,
        { headers: { "xi-api-key": apiKey } },
        4500
      ).catch(() => null)
    ]);

    if (quota && quota.limit > 0 && quota.remaining < 250) {
      traceSessionAndLog({
        status: "maintenance",
        transport: "maintenance",
        eventName: "session_maintenance",
        level: "warn",
        httpStatus: 503,
        reason: "quota_exhausted",
        quota
      });
      return buildMaintenanceResponse({
        status: 503,
        reason: "quota_exhausted",
        quota,
        traceId
      });
    }

    if (tokenRes?.ok) {
      const tokenData = await tokenRes.json();
      if (tokenData.token) {
        traceSessionAndLog({
          status: "initializing",
          transport: "webrtc",
          eventName: "session_webrtc_issued",
          conversationId: tokenData.conversation_id || null,
          quota
        });
        return new Response(
          JSON.stringify({
            success: true,
            traceId,
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

    // Fail-fast on explicit ElevenLabs billing/quota or rate-limit status without wasting extra round-trip latency
    if (tokenRes?.status === 402 || tokenRes?.status === 429) {
      const fastReason =
        tokenRes.status === 402 ? "quota_exhausted" : "concurrency_or_rate_limited";
      traceSessionAndLog({
        status: "maintenance",
        transport: "maintenance",
        eventName: "session_maintenance",
        level: "warn",
        httpStatus: 503,
        reason: fastReason,
        quota
      });
      return buildMaintenanceResponse({
        status: 503,
        reason: fastReason,
        quota,
        traceId
      });
    }

    // Secondary ElevenLabs transport: WebSocket signed URL
    const signedRes = await fetchWithTimeout(
      `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`,
      { headers: { "xi-api-key": apiKey } },
      4500
    ).catch(() => null);

    if (!signedRes || !signedRes.ok) {
      const upstreamStatus = signedRes?.status || 503;
      const reason =
        upstreamStatus === 429 ? "concurrency_or_rate_limited" : "upstream_unavailable";
      traceSessionAndLog({
        status: "maintenance",
        transport: "maintenance",
        eventName: "session_maintenance",
        level: "error",
        httpStatus: 503,
        reason,
        quota
      });
      return buildMaintenanceResponse({
        status: 503,
        reason,
        traceId
      });
    }

    const signedData = await signedRes.json();
    traceSessionAndLog({
      status: "initializing",
      transport: "websocket",
      eventName: "session_websocket_issued",
      quota
    });
    return new Response(
      JSON.stringify({
        success: true,
        traceId,
        connectionType: "websocket",
        signedUrl: signedData.signed_url,
        voiceGender: gender,
        voiceConfig,
        dynamicVariables: preset.dynamicVariables
      }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err) {
    traceSessionAndLog({
      status: "maintenance",
      transport: "maintenance",
      eventName: "session_maintenance",
      level: "error",
      httpStatus: 503,
      reason: "upstream_unavailable"
    });
    return buildMaintenanceResponse({
      status: 503,
      reason: "upstream_unavailable",
      traceId
    });
  }
}

export async function onRequestGet(context) {
  return createAgentSession(context);
}

export async function onRequestPost(context) {
  return createAgentSession(context);
}
