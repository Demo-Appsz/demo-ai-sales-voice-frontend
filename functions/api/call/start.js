export async function onRequestPost() {
  const callId = "uv-sess-" + crypto.randomUUID().slice(0, 8);
  return new Response(
    JSON.stringify({
      success: true,
      callDetails: {
        callId,
        status: "connected",
        joinUrl: `wss://livekit.demo-sales.ai/join?token=${callId}`
      }
    }),
    {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    }
  );
}
