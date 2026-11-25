const CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

const VOICE_PRESETS = {
  female: {
    agentName: "Jasmin",
    voiceId: "qXOoUJU1h7AiwSe4ltRA", // Jasmin (Zulfa - Upbeat Energetic Indonesia)
    stability: 0.35,
    speed: 1.07,
    similarityBoost: 0.78,
    dynamicVariables: {
      agent_name: "Jasmin",
      agent_greeting:
        "Halo! Dengan Jasmin di sini. Ada yang bisa saya bantu atau kita diskusikan hari ini?",
      agent_persona:
        "Anda adalah konsultan Sales dan Layanan Pelanggan virtual yang hangat, komunikatif, dan solutif. Anda membantu menggali kebutuhan penelepon secara natural dan berdiskusi seputar solusi digital, layanan bisnis, maupun pertanyaan umum."
    }
  },
  male: {
    agentName: "Mas Rouf",
    voiceId: "5U7QzveIXT8fIoBXaoUC", // Mas Rouf (Tio - Energetic Sales Indonesia)
    stability: 0.38,
    speed: 1.05,
    similarityBoost: 0.78,
    dynamicVariables: {
      agent_name: "Mas Rouf",
      agent_greeting:
        "Halo! Dengan Mas Rouf, Kapus Datin di sini. Ada yang bisa kita diskusikan hari ini?",
      agent_persona:
        "Anda menjabat sebagai Kapus Datin (Kepala Pusat Data dan Informasi). Anda menguasai secara mendalam tata kelola data dan informasi terpadu, prinsip Satu Data, integrasi dan interoperabilitas sistem lintas unit atau instansi, arsitektur SPBE (Sistem Pemerintahan Berbasis Elektronik) dan layanan digital publik, infrastruktur pusat data (data center) dan cloud, keamanan siber serta perlindungan data, hingga pemanfaatan analitik data dan AI untuk mendukung pengambilan keputusan pimpinan (data-driven policy) serta diseminasi informasi publik. Berbicaralah dengan wibawa seorang pimpinan yang tetap ramah, santai, lugas, dan solutif saat diajak berdiskusi."
    }
  }
};

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
    // Request WebRTC conversation token
    const tokenRes = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${encodeURIComponent(agentId)}`,
      {
        headers: { "xi-api-key": apiKey }
      }
    );

    if (tokenRes.ok) {
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
    const signedRes = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`,
      {
        headers: { "xi-api-key": apiKey }
      }
    );

    if (!signedRes.ok) {
      const errText = await signedRes.text();
      return new Response(
        JSON.stringify({
          success: false,
          error: "Gagal menginisialisasi sesi suara AI",
          details: errText
        }),
        { status: signedRes.status, headers: CORS_HEADERS }
      );
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
  } catch (err) {
    return new Response(
      JSON.stringify({
        success: false,
        error: err.message || "Internal server error"
      }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

export async function onRequestGet(context) {
  return createAgentSession(context);
}

export async function onRequestPost(context) {
  return createAgentSession(context);
}
