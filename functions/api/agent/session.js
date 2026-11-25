const CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

const VOICE_PRESETS = {
  female: {
    voiceId: "qXOoUJU1h7AiwSe4ltRA", // Zulfa - Upbeat Energetic Indonesia (female)
    stability: 0.35,
    speed: 1.07,
    similarityBoost: 0.78
  },
  male: {
    voiceId: "5U7QzveIXT8fIoBXaoUC", // Tio - Energetic Sales Indonesia (male)
    stability: 0.38,
    speed: 1.05,
    similarityBoost: 0.78
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

  const voiceConfig = VOICE_PRESETS[gender] || VOICE_PRESETS.female;

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
            voiceConfig
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
        voiceConfig
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
