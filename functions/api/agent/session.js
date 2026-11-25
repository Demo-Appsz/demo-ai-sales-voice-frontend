const CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

async function createAgentSession({ env }) {
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

  try {
    // Request WebRTC conversation token (lowest latency, noise suppression, echo cancellation)
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
            conversationId: tokenData.conversation_id || null
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
        signedUrl: signedData.signed_url
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
