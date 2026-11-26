export async function onRequestPost({ request, env }) {
  try {
    const apiKey = env?.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Server configuration missing" }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    const body = await request.json();
    const text = body.text || "";

    if (!text.trim()) {
      return new Response(JSON.stringify({ error: "Text is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const voiceId =
      body.voiceId ||
      (body.voiceGender === "male" ? "zmqLb9Ysr8fUvDD7hXK8" : "qXOoUJU1h7AiwSe4ltRA");

    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg"
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_v4_turbo",
        voice_settings: {
          stability: 0.40,
          similarity_boost: 0.78,
          speed: body.voiceGender === "male" ? 1.04 : 1.05
        }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      return new Response(JSON.stringify({ error: "TTS API error", details: errText }), {
        status: response.status,
        headers: { "Content-Type": "application/json" }
      });
    }

    const audioBuffer = await response.arrayBuffer();

    return new Response(audioBuffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=3600",
        "Access-Control-Allow-Origin": "*"
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
