export async function onRequestPost({ params }) {
  return new Response(
    JSON.stringify({
      success: true,
      message: "Panggilan telah diakhiri.",
      status: "disconnected"
    }),
    {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    }
  );
}
