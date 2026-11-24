export async function onRequestGet() {
  return new Response(
    JSON.stringify({
      status: "ok",
      service: "ai-sales-customer-service",
      version: "1.0.0",
      platform: "cloudflare-pages"
    }),
    {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    }
  );
}
