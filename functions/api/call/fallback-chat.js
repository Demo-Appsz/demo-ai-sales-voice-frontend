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

function buildReply(message, voiceGender) {
  const lower = (message || "").toLowerCase();
  const isRouf = voiceGender === "male";
  const name = isRouf ? "Mas Rouf" : "Jasmin";

  const prov2024 = findProvince(DATA_2024_SORTED, lower);
  const prov2025 = findProvince(DATA_2025_SORTED, lower);

  // Check identity
  if (lower.includes("siapa kamu") || lower.includes("dengan siapa") || lower.includes("namamu") || lower.includes("nama kamu")) {
    return isRouf
      ? "Saya Mas Rouf, Kepala Pusat Data dan Informasi. Ada data pendidikan atau hal strategis apa yang ingin kita diskusikan?"
      : "Saya Jasmin, asisten virtual layanan pelanggan. Ada yang bisa saya bantu hari ini?";
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

  if (lower.includes("halo") || lower.includes("hai") || lower.includes("selamat")) {
    return `Halo! Dengan ${name} di sini. Silakan tanyakan data lembaga 2024, data pesantren 2025 per provinsi, atau topik lain yang ingin didiskusikan.`;
  }

  return isRouf
    ? `Baik, terkait hal tersebut, dari sudut pandang Kapus Datin fokus utama kita adalah memastikan data terintegrasi, akurat, dan siap dipakai untuk pengambilan keputusan. Apakah Anda ingin mengecek angka spesifik provinsi tertentu dari dataset 2024 atau 2025?`
    : `Baik, saya ${name} siap membantu. Untuk informasi lebih spesifik, Anda bisa menanyakan rincian data lembaga tahun 2024 atau pondok pesantren tahun 2025 berdasarkan nama provinsinya.`;
}

export async function onRequestPost({ request }) {
  try {
    const body = await request.json().catch(() => ({}));
    const reply = buildReply(body.message || "", body.voiceGender || "female");
    return new Response(JSON.stringify({ success: true, reply }), {
      status: 200,
      headers: CORS_HEADERS
    });
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
