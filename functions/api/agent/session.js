const CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

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
        "Assalamu’alaikum warahmatullahi wabarakatuh. Halo, saya Jasmin, Asisten AI Kementerian Agama Republik Indonesia. Ada yang bisa saya bantu hari ini?",
      agent_persona:
        `Anda adalah Jasmin, Asisten AI Digital Kementerian Agama Republik Indonesia yang hangat, ramah, sabar, komunikatif, dan membantu masyarakat mengakses informasi layanan, program, dan informasi publik Kemenag secara mudah. ${CORE_KEMENAG_RULES}`
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

function buildMaintenanceResponse({ status = 503, reason, quota = null }) {
  return new Response(
    JSON.stringify({
      success: false,
      maintenance: true,
      reason,
      ...(quota ? { quota } : {}),
      error: MAINTENANCE_ERROR_MESSAGE
    }),
    { status, headers: CORS_HEADERS }
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
      return buildMaintenanceResponse({
        status: 503,
        reason: "quota_exhausted",
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

    // Secondary ElevenLabs transport: WebSocket signed URL
    const signedRes = await fetchWithTimeout(
      `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`,
      { headers: { "xi-api-key": apiKey } },
      6000
    ).catch(() => null);

    if (!signedRes || !signedRes.ok) {
      const upstreamStatus = signedRes?.status || 503;
      const reason =
        upstreamStatus === 429 ? "concurrency_or_rate_limited" : "upstream_unavailable";
      return buildMaintenanceResponse({
        status: 503,
        reason
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
    return buildMaintenanceResponse({
      status: 503,
      reason: "upstream_unavailable"
    });
  }
}

export async function onRequestGet(context) {
  return createAgentSession(context);
}

export async function onRequestPost(context) {
  return createAgentSession(context);
}
