const CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

const DATA_2024 = [
  { p: "Aceh", min: 433, mtsn: 109, man: 69, smptkn: 0, smtkn: 0, smakn_kr: 0, smakn_kt: 0, uin: 1, uiii: 0, uhn: 0, iain: 3, iakn: 0, iahn: 0, stain: 1, stakn: 0, stakatn: 0, stahn: 0, stabn: 0, total: 616 },
  { p: "Sumatera Utara", min: 125, mtsn: 60, man: 42, smptkn: 0, smtkn: 0, smakn_kr: 0, smakn_kt: 1, uin: 2, uiii: 0, uhn: 0, iain: 0, iakn: 1, iahn: 0, stain: 1, stakn: 0, stakatn: 0, stahn: 0, stabn: 0, total: 232 },
  { p: "Sumatera Barat", min: 62, mtsn: 112, man: 48, smptkn: 0, smtkn: 0, smakn_kr: 0, smakn_kt: 0, uin: 3, uiii: 0, uhn: 0, iain: 0, iakn: 0, iahn: 0, stain: 0, stakn: 0, stakatn: 0, stahn: 0, stabn: 0, total: 225 },
  { p: "Riau", min: 19, mtsn: 42, man: 23, smptkn: 0, smtkn: 0, smakn_kr: 0, smakn_kt: 0, uin: 1, uiii: 0, uhn: 0, iain: 0, iakn: 0, iahn: 0, stain: 1, stakn: 0, stakatn: 0, stahn: 0, stabn: 0, total: 86 },
  { p: "Jambi", min: 37, mtsn: 65, man: 31, smptkn: 0, smtkn: 0, smakn_kr: 0, smakn_kt: 0, uin: 1, uiii: 0, uhn: 0, iain: 1, iakn: 0, iahn: 0, stain: 0, stakn: 0, stakatn: 0, stahn: 0, stabn: 0, total: 135 },
  { p: "Sumatera Selatan", min: 37, mtsn: 35, man: 22, smptkn: 0, smtkn: 0, smakn_kr: 0, smakn_kt: 0, uin: 1, uiii: 0, uhn: 0, iain: 0, iakn: 0, iahn: 0, stain: 0, stakn: 0, stakatn: 0, stahn: 0, stabn: 0, total: 95 },
  { p: "Bengkulu", min: 41, mtsn: 32, man: 15, smptkn: 0, smtkn: 0, smakn_kr: 0, smakn_kt: 0, uin: 1, uiii: 0, uhn: 0, iain: 1, iakn: 0, iahn: 0, stain: 0, stakn: 0, stakatn: 0, stahn: 0, stabn: 0, total: 90 },
  { p: "Lampung", min: 52, mtsn: 24, man: 18, smptkn: 0, smtkn: 0, smakn_kr: 0, smakn_kt: 0, uin: 1, uiii: 0, uhn: 0, iain: 1, iakn: 0, iahn: 0, stain: 0, stakn: 0, stakatn: 0, stahn: 0, stabn: 0, total: 96 },
  { p: "Kep. Bangka Belitung", aliases: ["bangka belitung", "babel", "kepulauan bangka belitung"], min: 12, mtsn: 11, man: 5, smptkn: 0, smtkn: 0, smakn_kr: 0, smakn_kt: 0, uin: 0, uiii: 0, uhn: 0, iain: 1, iakn: 0, iahn: 0, stain: 0, stakn: 0, stakatn: 0, stahn: 0, stabn: 0, total: 29 },
  { p: "Kepulauan Riau", aliases: ["kepri"], min: 10, mtsn: 9, man: 7, smptkn: 0, smtkn: 0, smakn_kr: 0, smakn_kt: 0, uin: 0, uiii: 0, uhn: 0, iain: 0, iakn: 0, iahn: 0, stain: 1, stakn: 0, stakatn: 0, stahn: 0, stabn: 0, total: 27 },
  { p: "DKI Jakarta", aliases: ["jakarta"], min: 22, mtsn: 42, man: 22, smptkn: 0, smtkn: 0, smakn_kr: 0, smakn_kt: 0, uin: 1, uiii: 0, uhn: 0, iain: 0, iakn: 0, iahn: 0, stain: 0, stakn: 0, stakatn: 0, stahn: 0, stabn: 0, total: 87 },
  { p: "Jawa Barat", aliases: ["jabar"], min: 91, mtsn: 161, man: 77, smptkn: 0, smtkn: 0, smakn_kr: 0, smakn_kt: 0, uin: 1, uiii: 1, uhn: 0, iain: 1, iakn: 0, iahn: 0, stain: 0, stakn: 0, stakatn: 0, stahn: 0, stabn: 0, total: 332 },
  { p: "Jawa Tengah", aliases: ["jateng"], min: 114, mtsn: 129, man: 65, smptkn: 0, smtkn: 0, smakn_kr: 0, smakn_kt: 0, uin: 5, uiii: 0, uhn: 0, iain: 1, iakn: 0, iahn: 0, stain: 0, stakn: 0, stakatn: 0, stahn: 1, stabn: 1, total: 316 },
  { p: "DI Yogyakarta", aliases: ["yogyakarta", "jogja", "daerah istimewa yogyakarta", "diy"], min: 21, mtsn: 35, man: 15, smptkn: 0, smtkn: 0, smakn_kr: 0, smakn_kt: 0, uin: 1, uiii: 0, uhn: 0, iain: 0, iakn: 0, iahn: 0, stain: 0, stakn: 0, stakatn: 0, stahn: 0, stabn: 0, total: 72 },
  { p: "Jawa Timur", aliases: ["jatim"], min: 146, mtsn: 198, man: 91, smptkn: 0, smtkn: 0, smakn_kr: 0, smakn_kt: 0, uin: 4, uiii: 0, uhn: 0, iain: 3, iakn: 0, iahn: 0, stain: 0, stakn: 0, stakatn: 0, stahn: 0, stabn: 0, total: 442 },
  { p: "Banten", min: 21, mtsn: 33, man: 22, smptkn: 0, smtkn: 0, smakn_kr: 0, smakn_kt: 0, uin: 1, uiii: 0, uhn: 0, iain: 0, iakn: 0, iahn: 0, stain: 0, stakn: 0, stakatn: 0, stahn: 0, stabn: 1, total: 78 },
  { p: "Bali", min: 17, mtsn: 7, man: 5, smptkn: 0, smtkn: 0, smakn_kr: 0, smakn_kt: 0, uin: 0, uiii: 0, uhn: 1, iain: 0, iakn: 0, iahn: 0, stain: 0, stakn: 0, stakatn: 0, stahn: 1, stabn: 0, total: 31 },
  { p: "Nusa Tenggara Barat", aliases: ["ntb"], min: 26, mtsn: 33, man: 19, smptkn: 0, smtkn: 0, smakn_kr: 0, smakn_kt: 0, uin: 1, uiii: 0, uhn: 0, iain: 0, iakn: 0, iahn: 1, stain: 0, stakn: 0, stakatn: 0, stahn: 0, stabn: 0, total: 80 },
  { p: "Nusa Tenggara Timur", aliases: ["ntt"], min: 36, mtsn: 23, man: 14, smptkn: 0, smtkn: 2, smakn_kr: 2, smakn_kt: 0, uin: 0, uiii: 0, uhn: 0, iain: 0, iakn: 1, iahn: 0, stain: 0, stakn: 0, stakatn: 0, stahn: 0, stabn: 0, total: 78 },
  { p: "Kalimantan Barat", aliases: ["kalbar"], min: 23, mtsn: 29, man: 19, smptkn: 0, smtkn: 0, smakn_kr: 0, smakn_kt: 0, uin: 0, uiii: 0, uhn: 0, iain: 1, iakn: 0, iahn: 0, stain: 0, stakn: 0, stakatn: 1, stahn: 0, stabn: 0, total: 73 },
  { p: "Kalimantan Tengah", aliases: ["kalteng"], min: 36, mtsn: 22, man: 15, smptkn: 0, smtkn: 0, smakn_kr: 0, smakn_kt: 0, uin: 0, uiii: 0, uhn: 0, iain: 1, iakn: 1, iahn: 1, stain: 0, stakn: 0, stakatn: 0, stahn: 0, stabn: 0, total: 76 },
  { p: "Kalimantan Selatan", aliases: ["kalsel"], min: 143, mtsn: 89, man: 42, smptkn: 0, smtkn: 0, smakn_kr: 0, smakn_kt: 0, uin: 1, uiii: 0, uhn: 0, iain: 0, iakn: 0, iahn: 0, stain: 0, stakn: 0, stakatn: 0, stahn: 0, stabn: 0, total: 275 },
  { p: "Kalimantan Timur", aliases: ["kaltim"], min: 10, mtsn: 17, man: 11, smptkn: 0, smtkn: 0, smakn_kr: 0, smakn_kt: 0, uin: 1, uiii: 0, uhn: 0, iain: 0, iakn: 0, iahn: 0, stain: 0, stakn: 0, stakatn: 0, stahn: 0, stabn: 0, total: 39 },
  { p: "Kalimantan Utara", aliases: ["kaltara"], min: 1, mtsn: 3, man: 2, smptkn: 0, smtkn: 0, smakn_kr: 0, smakn_kt: 0, uin: 0, uiii: 0, uhn: 0, iain: 0, iakn: 0, iahn: 0, stain: 0, stakn: 0, stakatn: 0, stahn: 0, stabn: 0, total: 6 },
  { p: "Sulawesi Utara", aliases: ["sulut"], min: 12, mtsn: 17, man: 5, smptkn: 0, smtkn: 0, smakn_kr: 0, smakn_kt: 0, uin: 0, uiii: 0, uhn: 0, iain: 1, iakn: 1, iahn: 0, stain: 0, stakn: 0, stakatn: 0, stahn: 0, stabn: 0, total: 36 },
  { p: "Sulawesi Tengah", aliases: ["sulteng"], min: 22, mtsn: 31, man: 17, smptkn: 0, smtkn: 0, smakn_kr: 0, smakn_kt: 0, uin: 1, uiii: 0, uhn: 0, iain: 0, iakn: 0, iahn: 0, stain: 0, stakn: 0, stakatn: 0, stahn: 0, stabn: 0, total: 71 },
  { p: "Sulawesi Selatan", aliases: ["sulsel"], min: 56, mtsn: 51, man: 32, smptkn: 0, smtkn: 0, smakn_kr: 0, smakn_kt: 0, uin: 1, uiii: 0, uhn: 0, iain: 3, iakn: 1, iahn: 0, stain: 0, stakn: 0, stakatn: 0, stahn: 0, stabn: 0, total: 144 },
  { p: "Sulawesi Tenggara", aliases: ["sultra"], min: 19, mtsn: 45, man: 17, smptkn: 0, smtkn: 0, smakn_kr: 0, smakn_kt: 0, uin: 0, uiii: 0, uhn: 0, iain: 1, iakn: 0, iahn: 0, stain: 0, stakn: 0, stakatn: 0, stahn: 0, stabn: 0, total: 82 },
  { p: "Gorontalo", min: 7, mtsn: 10, man: 6, smptkn: 0, smtkn: 0, smakn_kr: 0, smakn_kt: 0, uin: 0, uiii: 0, uhn: 0, iain: 1, iakn: 0, iahn: 0, stain: 0, stakn: 0, stakatn: 0, stahn: 0, stabn: 0, total: 24 },
  { p: "Sulawesi Barat", aliases: ["sulbar"], min: 6, mtsn: 6, man: 5, smptkn: 0, smtkn: 0, smakn_kr: 0, smakn_kt: 0, uin: 0, uiii: 0, uhn: 0, iain: 0, iakn: 0, iahn: 0, stain: 1, stakn: 0, stakatn: 0, stahn: 0, stabn: 0, total: 18 },
  { p: "Maluku", min: 21, mtsn: 18, man: 10, smptkn: 0, smtkn: 0, smakn_kr: 0, smakn_kt: 0, uin: 0, uiii: 0, uhn: 0, iain: 1, iakn: 1, iahn: 0, stain: 0, stakn: 0, stakatn: 0, stahn: 0, stabn: 0, total: 51 },
  { p: "Maluku Utara", aliases: ["malut"], min: 23, mtsn: 19, man: 12, smptkn: 0, smtkn: 0, smakn_kr: 0, smakn_kt: 0, uin: 0, uiii: 0, uhn: 0, iain: 1, iakn: 0, iahn: 0, stain: 0, stakn: 0, stakatn: 0, stahn: 0, stabn: 0, total: 55 },
  { p: "Papua", min: 3, mtsn: 4, man: 2, smptkn: 0, smtkn: 1, smakn_kr: 0, smakn_kt: 0, uin: 0, uiii: 0, uhn: 0, iain: 1, iakn: 0, iahn: 0, stain: 0, stakn: 1, stakatn: 0, stahn: 0, stabn: 0, total: 12 },
  { p: "Papua Barat", min: 7, mtsn: 4, man: 5, smptkn: 2, smtkn: 3, smakn_kr: 0, smakn_kt: 0, uin: 0, uiii: 0, uhn: 0, iain: 1, iakn: 0, iahn: 0, stain: 0, stakn: 0, stakatn: 0, stahn: 0, stabn: 0, total: 22 },
  { p: "Papua Selatan", min: 0, mtsn: 0, man: 0, smptkn: 0, smtkn: 0, smakn_kr: 0, smakn_kt: 0, uin: 0, uiii: 0, uhn: 0, iain: 0, iakn: 0, iahn: 0, stain: 0, stakn: 0, stakatn: 0, stahn: 0, stabn: 0, total: 0 },
  { p: "Papua Tengah", min: 0, mtsn: 0, man: 0, smptkn: 0, smtkn: 0, smakn_kr: 0, smakn_kt: 0, uin: 0, uiii: 0, uhn: 0, iain: 0, iakn: 0, iahn: 0, stain: 0, stakn: 0, stakatn: 0, stahn: 0, stabn: 0, total: 0 },
  { p: "Papua Pegunungan", min: 0, mtsn: 0, man: 0, smptkn: 0, smtkn: 0, smakn_kr: 0, smakn_kt: 0, uin: 0, uiii: 0, uhn: 0, iain: 0, iakn: 0, iahn: 0, stain: 0, stakn: 0, stakatn: 0, stahn: 0, stabn: 0, total: 0 },
  { p: "Papua Barat Daya", min: 0, mtsn: 0, man: 0, smptkn: 3, smtkn: 0, smakn_kr: 0, smakn_kt: 0, uin: 0, uiii: 0, uhn: 0, iain: 0, iakn: 0, iahn: 0, stain: 0, stakn: 0, stakatn: 0, stahn: 0, stabn: 0, total: 3 }
];

const DATA_2025 = [
  { p: "Aceh", k: 1389, l: 536, total: 1925 },
  { p: "Sumatera Utara", k: 231, l: 207, total: 438 },
  { p: "Sumatera Barat", k: 109, l: 192, total: 301 },
  { p: "Riau", k: 268, l: 274, total: 542 },
  { p: "Jambi", k: 221, l: 257, total: 478 },
  { p: "Sumatera Selatan", k: 353, l: 317, total: 670 },
  { p: "Bengkulu", k: 54, l: 54, total: 108 },
  { p: "Lampung", k: 715, l: 638, total: 1353 },
  { p: "Kepulauan Bangka Belitung", aliases: ["kep. bangka belitung", "bangka belitung", "babel"], k: 55, l: 43, total: 98 },
  { p: "Kepulauan Riau", aliases: ["kepri"], k: 65, l: 71, total: 136 },
  { p: "DKI Jakarta", aliases: ["jakarta"], k: 68, l: 104, total: 172 },
  { p: "Jawa Barat", aliases: ["jabar"], k: 9223, l: 3782, total: 13005 },
  { p: "Jawa Tengah", aliases: ["jateng"], k: 3344, l: 2020, total: 5364 },
  { p: "Daerah Istimewa Yogyakarta", aliases: ["di yogyakarta", "yogyakarta", "jogja", "diy"], k: 218, l: 220, total: 438 },
  { p: "Jawa Timur", aliases: ["jatim"], k: 3282, l: 4065, total: 7347 },
  { p: "Banten", k: 4762, l: 2014, total: 6776 },
  { p: "Bali", k: 47, l: 63, total: 110 },
  { p: "Nusa Tenggara Barat", aliases: ["ntb"], k: 254, l: 704, total: 958 },
  { p: "Nusa Tenggara Timur", aliases: ["ntt"], k: 11, l: 30, total: 41 },
  { p: "Kalimantan Barat", aliases: ["kalbar"], k: 131, l: 242, total: 373 },
  { p: "Kalimantan Tengah", aliases: ["kalteng"], k: 49, l: 66, total: 115 },
  { p: "Kalimantan Selatan", aliases: ["kalsel"], k: 99, l: 234, total: 333 },
  { p: "Kalimantan Timur", aliases: ["kaltim"], k: 106, l: 141, total: 247 },
  { p: "Kalimantan Utara", aliases: ["kaltara"], k: 20, l: 22, total: 42 },
  { p: "Sulawesi Utara", aliases: ["sulut"], k: 15, l: 23, total: 38 },
  { p: "Sulawesi Tengah", aliases: ["sulteng"], k: 50, l: 92, total: 142 },
  { p: "Sulawesi Selatan", aliases: ["sulsel"], k: 128, l: 290, total: 418 },
  { p: "Sulawesi Tenggara", aliases: ["sultra"], k: 59, l: 90, total: 149 },
  { p: "Gorontalo", k: 11, l: 32, total: 43 },
  { p: "Sulawesi Barat", aliases: ["sulbar"], k: 36, l: 76, total: 112 },
  { p: "Maluku", k: 20, l: 14, total: 34 },
  { p: "Maluku Utara", aliases: ["malut"], k: 17, l: 29, total: 46 },
  { p: "Papua", k: 21, l: 34, total: 55 },
  { p: "Papua Barat", k: 10, l: 18, total: 28 },
  { p: "Papua Barat Daya", k: 0, l: 0, total: 0 },
  { p: "Papua Selatan", k: 0, l: 0, total: 0 },
  { p: "Papua Pegunungan", k: 0, l: 0, total: 0 },
  { p: "Papua Tengah", k: 0, l: 0, total: 0 }
];

const DATA_2024_SORTED = [...DATA_2024].sort((a, b) => b.p.length - a.p.length);
const DATA_2025_SORTED = [...DATA_2025].sort((a, b) => b.p.length - a.p.length);

function findProvince(sortedList, text) {
  for (const item of sortedList) {
    if (text.includes(item.p.toLowerCase())) return item;
    for (const a of item.aliases || []) {
      if (text.includes(a.toLowerCase())) return item;
    }
  }
  return null;
}

function detectLanguage(message) {
  const raw = message || "";
  if (/[\u0600-\u06FF\u0750-\u077F]/.test(raw)) return "ar";
  const lower = raw.toLowerCase();
  if (
    /\b(hello|hi|good\s+(morning|afternoon|evening)|how\s+are\s+you|who\s+are\s+you|what\s+is|how\s+many|thank\s+you|thanks|goodbye|bye|end\s+call|close\s+(the\s+)?call|don't\s+close|please|boarding\s+schools|state\s+institutions)\b/i.test(
      lower
    ) &&
    !/\b(apa|siapa|berapa|dengan|bagaimana|tolong|terima\s+kasih|makasih|selamat|tutup|provinsi|tahun|pondok|negeri|kitab|lembaga)\b/i.test(
      lower
    )
  ) {
    return "en";
  }
  return "id";
}

function isClosingIntent(rawMessage, lang) {
  const lower = (rawMessage || "").toLowerCase();
  // Never close when negated or asking a domain question
  if (
    /\b(jangan|jgn|belum|blm|tidak|tdk|gak|ga|nggak|bukan|tanya|jelasin|jelaskan|apa\s+itu|soal|tentang|don't|do\s+not|not\s+yet|wait)\b/i.test(
      lower
    ) ||
    /لا\s*تغلق|لا\s*تنهي|انتظر|ليس\s*بعد/.test(rawMessage || "") ||
    /\btutup\s+(buku|akun|rekening|aplikasi|sistem|laporan|tahun|bulan)\b/.test(lower)
  ) {
    return false;
  }
  if (lang === "ar") {
    return /(مع\s*السلامة|وداعا|إلى\s*اللقاء|أغلق\s*المكالمة|انه\s*المكالمة|أنهِ\s*المكالمة|انتهينا|يكفي\s*هذا)/.test(
      rawMessage || ""
    );
  }
  return /\b(tutup\s*(telepon|panggilan|telpon|call)?|akhiri\s*(telepon|panggilan|telpon|sesi|call)?|matikan\s*(telepon|panggilan|telpon)?|stop\s*(telepon|panggilan|call)|end\s*(the\s+)?call|close\s*(the\s+)?call|hang\s*up|udah\s*(dulu|cukup|selesai)|sudah\s*(cukup|selesai)|cukup\s*(sekian|dulu)|pamit(\s+ya|\s+dulu)?|sampai\s*(jumpa|ketemu)|dadah|bye+|goodbye|see\s+you)\b/i.test(
    lower
  );
}

async function tryWorkersAiReply(message, voiceGender, factualReply, env) {
  if (!env?.AI?.run) return null;
  const isRouf = voiceGender === "male";
  const persona = isRouf
    ? "Kamu Mas Rouf (~50 tahun), Kapus Datin yang hangat, berwibawa, energik, dan fasih multi-bahasa."
    : "Kamu Jasmin, asisten virtual yang hangat, ramah, energik, dan fasih multi-bahasa.";

  try {
    const systemPrompt = `${persona}
ATURAN BAHASA: Selalu jawab dalam BAHASA YANG SAMA dengan bahasa pesan penelepon (Bahasa Arab / العربية jika pesan berbahasa Arab, English jika berbahasa Inggris, Bahasa Indonesia jika berbahasa Indonesia, atau bahasa apa pun yang dipakai penelepon).
Jawab ringkas dan natural seperti di telepon (1-2 kalimat).
Jika penelepon bermaksud mengakhiri telepon atau berpamitan (jangan set true jika dia bilang jangan tutup atau hanya bertanya topik), set "end_call": true.
Fakta data referensi (jika relevan dengan angka provinsi/nasional): ${factualReply}
Keluarkan HANYA JSON valid: {"reply":"...","end_call":true|false}`;

    const aiRes = await env.AI.run("@cf/meta/llama-3.1-8b-instruct-fast", {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message }
      ],
      max_tokens: 220,
      temperature: 0.4
    });

    const raw = typeof aiRes?.response === "string" ? aiRes.response.trim() : "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    if (typeof parsed?.reply === "string" && parsed.reply.trim()) {
      return {
        reply: parsed.reply.trim(),
        shouldEndCall: Boolean(parsed.end_call)
      };
    }
  } catch {}
  return null;
}

function buildResult(message, voiceGender) {
  const lower = (message || "").toLowerCase();
  const lang = detectLanguage(message);
  const isRouf = voiceGender === "male";
  const name = isRouf ? "Mas Rouf" : "Jasmin";

  if (isClosingIntent(message, lang)) {
    if (lang === "ar") {
      return {
        lang,
        shouldEndCall: true,
        reply: isRouf
          ? "حسناً، سأنهي المكالمة الآن. شكراً لتواصلك معنا، إلى اللقاء!"
          : "بكل سرور، سأنهي المكالمة الآن. شكراً لتواصلك، مع السلامة!"
      };
    }
    if (lang === "en") {
      return {
        lang,
        shouldEndCall: true,
        reply: isRouf
          ? "Alright, I'll end the call now. Thank you for speaking with me, goodbye!"
          : "Sure, I'll close the call now. Thanks for reaching out, goodbye!"
      };
    }
    return {
      lang,
      shouldEndCall: true,
      reply: isRouf
        ? "Baik, panggilan ini saya tutup dulu ya. Terima kasih sudah berdiskusi, sampai jumpa!"
        : "Siap, panggilannya aku tutup sekarang ya. Makasih banyak, sampai jumpa!"
    };
  }

  return {
    lang,
    shouldEndCall: false,
    reply: buildReply(message, voiceGender, lower, isRouf, name, lang)
  };
}

function buildReply(message, voiceGender, lowerParam, isRoufParam, nameParam, langParam) {
  const raw = message || "";
  const lower = lowerParam ?? raw.toLowerCase();
  const lang = langParam ?? detectLanguage(raw);
  const isRouf = isRoufParam ?? voiceGender === "male";
  const name = nameParam ?? (isRouf ? "Mas Rouf" : "Jasmin");

  const prov2024 = findProvince(DATA_2024_SORTED, lower);
  const prov2025 = findProvince(DATA_2025_SORTED, lower);

  if (lang === "ar") {
    if (/من\s*أنت|اسمك|تعرف\s*بنفسك/.test(raw)) {
      return isRouf
        ? "أنا مس رؤوف، رئيس مركز البيانات والمعلومات. يسعدني مساعدتك اليوم، كيف يمكنني خدمتك؟"
        : "أهلاً بك! أنا ياسمين، مساعدة خدمة العملاء الخاصة بك. كيف يمكنني مساعدتك اليوم؟";
    }
    if (prov2025 && /معهد|معاهد|2025|إسلامي/.test(raw)) {
      return `في مقاطعة ${prov2025.p} لعام 2025، يبلغ إجمالي المعاهد الإسلامية ${prov2025.total.toLocaleString("en-US")} معهداً، منها ${prov2025.k.toLocaleString("en-US")} لدراسة الكتب التراثية فقط و${prov2025.l.toLocaleString("en-US")} تقدم خدمات تعليمية أخرى.`;
    }
    if (/معهد|معاهد|2025/.test(raw)) {
      return "على المستوى الوطني لعام 2025، يوجد إجمالي 42,435 معهداً إسلامياً في 38 مقاطعة، منها 25,441 لدراسة الكتب فقط و16,994 بخدمات تعليمية أخرى.";
    }
    if (/2024|مؤسس|حكومي|مدارس/.test(raw)) {
      return "في عام 2024 بلغ الإجمالي الوطني 4,134 مؤسسة تعليمية حكومية تابعة لوزارة الشؤون الدينية في 38 مقاطعة، تشمل 1,711 مدرسة ابتدائية و1,525 متوسطة و810 ثانوية و29 جامعة إسلامية.";
    }
    if (/السلام\s*عليكم/.test(raw)) {
      return isRouf
        ? "وعليكم السلام ورحمة الله! أهلاً بك مع مس رؤوف. كيف حالك؟ وما الذي تود مناقشته اليوم؟"
        : "وعليكم السلام! أهلاً بك مع ياسمين. كيف حالك؟ كيف أقدر أساعدك اليوم؟";
    }
    if (/كيف\s*حالك|أخبارك/.test(raw)) {
      return isRouf
        ? "الحمد لله بخير! كيف حالك أنت؟ هل هناك موضوع معين نبدأ به؟"
        : "أنا بخير الحمد لله، شكراً لسؤالك! كيف أقدر أساعدك اليوم؟";
    }
    if (/شكر/.test(raw)) {
      return "على الرحب والسعة! إذا كان لديك أي سؤال آخر فلا تتردد.";
    }
    if (/مرحب|أهلا|صباح\s*الخير|مساء\s*الخير|هلا/.test(raw)) {
      return isRouf
        ? "أهلاً ومرحباً! معك مس رؤوف. ما الذي تود أن نناقشه اليوم؟"
        : "أهلاً بك! أنا ياسمين، كيف أقدر أساعدك اليوم؟";
    }
    return isRouf
      ? "بالتأكيد، تفضل بطرح سؤالك أو الموضوع الذي ترغب بمناقشته وسأجيبك بكل سرور."
      : "بكل سرور، أخبرني بالمزيد عما تبحث عنه حتى أتمكن من مساعدتك.";
  }

  if (lang === "en") {
    if (lower.includes("who are you") || lower.includes("your name")) {
      return isRouf
        ? "Hello! I'm Mas Rouf, Head of the Center for Data and Information (Kapus Datin). How can I assist you or what would you like to discuss today?"
        : "Hello! I'm Jasmin, your Customer Service assistant. How can I help you today?";
    }
    if (lower.includes("kapus datin")) {
      return "Kapus Datin stands for Kepala Pusat Data dan Informasi — the Head of the Data and Information Center, leading integrated data governance, Satu Data, data centers, cybersecurity, and analytics for data-driven policy.";
    }
    if (prov2024 || prov2025) {
      const wants2025 = lower.includes("pesantren") || lower.includes("boarding") || lower.includes("2025");
      const wants2024 = lower.includes("min") || lower.includes("mtsn") || lower.includes("man") || lower.includes("uin") || lower.includes("2024") || lower.includes("state") || lower.includes("institutions");
      if (wants2025 && prov2025) {
        return `In ${prov2025.p} in 2025, there are ${prov2025.total.toLocaleString("en-US")} Islamic boarding schools (pesantren): ${prov2025.k.toLocaleString("en-US")} focusing solely on classical scripture study and ${prov2025.l.toLocaleString("en-US")} offering additional education services.`;
      }
      if (wants2024 && prov2024) {
        return `In ${prov2024.p} in 2024, there are ${prov2024.total} state religious institutions: ${prov2024.min} MIN, ${prov2024.mtsn} MTsN, ${prov2024.man} MAN/MAKN, ${prov2024.uin} UIN, and ${prov2024.iain} IAIN.`;
      }
    }
    if (lower.includes("pesantren") || lower.includes("boarding") || lower.includes("2025")) {
      return "Nationally in 2025, there are 42,435 Islamic boarding schools across 38 provinces, with West Java having the most at 13,005.";
    }
    if (lower.includes("2024") || lower.includes("institutions") || lower.includes("state")) {
      return "Nationally in 2024, there are 4,134 state religious education institutions across 38 provinces, including 1,711 MIN, 1,525 MTsN, 810 MAN/MAKN, 29 UIN, and 24 IAIN.";
    }
    if (lower.includes("how are you")) {
      return isRouf
        ? "Doing great, thank you! How are you doing today, and what would you like to talk about?"
        : "I'm doing great, thanks for asking! How can I help you today?";
    }
    if (lower.includes("thank")) {
      return "You're very welcome! Feel free to ask if there's anything else I can help with.";
    }
    if (/\b(hello|hi|hey|good morning|good afternoon|good evening)\b/i.test(lower)) {
      return isRouf
        ? "Hello! This is Mas Rouf speaking. What would you like to discuss today?"
        : "Hi there, I'm Jasmin! How can I help you today?";
    }
    return isRouf
      ? "Got it — feel free to share what you'd like to check or discuss, and I'll be glad to help."
      : "Sure thing! Tell me a little more about what you're looking for so I can help.";
  }

  // Check identity
  if (lower.includes("siapa kamu") || lower.includes("dengan siapa") || lower.includes("namamu") || lower.includes("nama kamu")) {
    return isRouf
      ? "Saya Mas Rouf, Kepala Pusat Data dan Informasi. Saya siap membantu diskusi seputar tata kelola data, sistem informasi, maupun statistik lembaga. Ada yang bisa saya bantu hari ini?"
      : "Halo, saya Jasmin, asisten layanan pelanggan Anda yang siap membantu menjawab pertanyaan maupun kebutuhan Anda. Ada yang bisa saya bantu hari ini?";
  }

  if (lower.includes("kapus datin")) {
    return "Kapus Datin adalah Kepala Pusat Data dan Informasi, yang memimpin tata kelola data terpadu, integrasi sistem informasi dan Satu Data, infrastruktur pusat data, keamanan siber, serta pemanfaatan analitik dan AI untuk mendukung pengambilan keputusan pimpinan.";
  }

  // Specific province queries
  if (prov2024 || prov2025) {
    const wants2025 = lower.includes("pesantren") || lower.includes("pondok") || lower.includes("kitab") || lower.includes("2025");
    const wants2024 = lower.includes("min") || lower.includes("mtsn") || lower.includes("man") || lower.includes("uin") || lower.includes("iain") || lower.includes("stain") || lower.includes("2024") || lower.includes("negeri");

    if (wants2025 && prov2025) {
      return `Untuk Provinsi ${prov2025.p} pada tahun 2025, total ada ${prov2025.total.toLocaleString("id-ID")} pondok pesantren, terdiri dari ${prov2025.k.toLocaleString("id-ID")} yang hanya menyelenggarakan kajian kitab dan ${prov2025.l.toLocaleString("id-ID")} yang juga menyelenggarakan layanan pendidikan lainnya.`;
    }
    if (wants2024 && prov2024) {
      return `Di Provinsi ${prov2024.p} tahun 2024 tercatat total ${prov2024.total} lembaga negeri, dengan rincian ${prov2024.min} MIN, ${prov2024.mtsn} MTsN, ${prov2024.man} MAN atau MAKN, ${prov2024.uin} UIN, serta ${prov2024.iain} IAIN.`;
    }
    if (prov2024 && prov2025) {
      return `Untuk Provinsi ${prov2024.p}, pada tahun 2024 ada ${prov2024.total} lembaga pendidikan negeri (${prov2024.min} MIN, ${prov2024.mtsn} MTsN, ${prov2024.man} MAN atau MAKN, ${prov2024.uin} UIN), sedangkan tahun 2025 terdapat ${prov2025.total.toLocaleString("id-ID")} pondok pesantren.`;
    }
  }

  // National totals
  if (lower.includes("pesantren") || lower.includes("pondok") || lower.includes("kitab") || lower.includes("2025")) {
    return "Secara nasional pada tahun 2025 tercatat total 42.435 pondok pesantren di 38 provinsi, terdiri dari 25.441 pesantren kajian kitab saja dan 16.994 pesantren dengan layanan pendidikan lainnya. Provinsi terbanyak adalah Jawa Barat dengan 13.005 pesantren.";
  }

  if (lower.includes("min") || lower.includes("mtsn") || lower.includes("man") || lower.includes("uin") || lower.includes("iain") || lower.includes("2024") || lower.includes("negeri") || lower.includes("lembaga")) {
    return "Total nasional tahun 2024 mencapai 4.134 lembaga negeri di 38 provinsi, meliputi 1.711 MIN, 1.525 MTsN, 810 MAN atau MAKN, 29 UIN, 24 IAIN, 5 STAIN, serta perguruan tinggi dan sekolah keagamaan negeri lainnya.";
  }

  // Natural conversational greetings & small talk
  if (lower.includes("assalam")) {
    return isRouf
      ? "Waalaikumsalam! Halo, gimana kabarnya? Ada yang mau kita obrolin hari ini?"
      : "Waalaikumsalam! Halo, ada yang bisa Jasmin bantu hari ini?";
  }

  if (lower.includes("apa kabar") || lower.includes("kabarnya")) {
    return isRouf
      ? "Alhamdulillah baik! Anda sendiri gimana kabarnya? Ada hal yang lagi ingin didiskusikan?"
      : "Baik banget, makasih ya sudah tanya! Kamu sendiri gimana? Ada yang bisa aku bantu hari ini?";
  }

  if (lower.includes("terima kasih") || lower.includes("makasih") || lower.includes("thanks")) {
    return isRouf
      ? "Sama-sama! Kalau masih ada yang ingin ditanyakan lagi, silakan ya."
      : "Sama-sama! Kalau ada yang mau ditanyain lagi, tinggal bilang aja ya.";
  }

  if (
    lower.includes("halo") ||
    lower.includes("hai") ||
    lower.includes("selamat") ||
    /\b(hi|hello|pagi|siang|sore|malam)\b/i.test(lower)
  ) {
    return isRouf
      ? "Halo! Dengan Mas Rouf di sini, Kepala Pusat Data dan Informasi. Ada yang bisa saya bantu atau kita bahas hari ini?"
      : "Halo! Dengan Jasmin di sini, asisten layanan pelanggan Anda. Apa kabar? Ada yang bisa saya bantu hari ini?";
  }

  if (/^(oke|ok|siap|sip|baik|noted|mantap)[.!? ]*$/i.test(lower.trim())) {
    return isRouf
      ? "Siap! Ada lagi yang perlu kita diskusikan?"
      : "Sip! Ada lagi yang mau kamu tanyain?";
  }

  return isRouf
    ? "Baik, coba sampaikan aja poin yang ingin dicek atau didiskusikan, nanti saya bantu jawab semaksimal mungkin."
    : "Boleh, ceritain aja lebih detail apa yang lagi kamu butuhkan ya, biar aku bisa bantu cariin infonya.";
}

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json().catch(() => ({}));
    const message = body.message || "";
    const voiceGender = body.voiceGender || "female";
    const staticResult = buildResult(message, voiceGender);
    const aiResult = await tryWorkersAiReply(message, voiceGender, staticResult.reply, env);
    const { reply, shouldEndCall } = aiResult || staticResult;
    return new Response(
      JSON.stringify({ success: true, reply, shouldEndCall, language: staticResult.lang }),
      {
        status: 200,
        headers: CORS_HEADERS
      }
    );
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: CORS_HEADERS
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, { headers: CORS_HEADERS });
}
