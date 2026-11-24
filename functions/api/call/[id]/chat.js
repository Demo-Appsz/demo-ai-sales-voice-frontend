export async function onRequestPost({ request, params }) {
  try {
    const body = await request.json();
    const userMessage = body.message || "";
    const lower = userMessage.toLowerCase();
    let reply = "";

    if (lower.includes("harga") || lower.includes("biaya") || lower.includes("paket") || lower.includes("price")) {
      reply = "Untuk paket layanan AI kami tersedia mulai dari Paket Starter (Rp 499.000/bulan) untuk UMKM hingga Enterprise dengan integrasi custom CRM dan WhatsApp API. Apakah Anda tertarik mencoba demo uji coba gratis selama 14 hari?";
    } else if (lower.includes("fitur") || lower.includes("bisa apa") || lower.includes("keunggulan")) {
      reply = "Asisten AI kami mampu menangani customer service suara & chat otomatis 24/7, kualifikasi prospek penjualan (leads), integrasi langsung ke sistem CRM, dan analitik sentimen pelanggan secara real-time.";
    } else if (lower.includes("integrasi") || lower.includes("whatsapp") || lower.includes("crm")) {
      reply = "AI kami dapat diintegrasikan dengan mudah ke WhatsApp Business, Telegram, Website Widget, serta CRM seperti Salesforce, HubSpot, atau database internal via Webhook & REST API.";
    } else if (lower.includes("halo") || lower.includes("selamat") || lower.includes("pagi") || lower.includes("siang") || lower.includes("sore") || lower.includes("malam")) {
      reply = "Halo! Senang bisa berbicara dengan Anda. Saya siap membantu menjawab pertanyaan Anda terkait solusi AI Customer Service & Sales untuk bisnis Anda.";
    } else if (lower.includes("terima kasih") || lower.includes("makasih") || lower.includes("thanks")) {
      reply = "Sama-sama! Senang bisa membantu Anda. Jika ada hal lain yang ingin ditanyakan, jangan ragu untuk berbicara kembali ya.";
    } else {
      reply = `Baik, terkait '${userMessage.trim()}', asisten AI kami dapat mengotomatisasi proses tersebut dengan respon cepat di bawah 1 detik dan akurasi tinggi. Apakah ada use case khusus yang ingin Anda terapkan di bisnis Anda?`;
    }

    return new Response(
      JSON.stringify({
        success: true,
        reply,
        transcripts: [
          { speaker: "user", text: userMessage, timestamp: new Date().toISOString() },
          { speaker: "agent", text: reply, timestamp: new Date().toISOString() }
        ]
      }),
      {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      }
    );
  }
}
