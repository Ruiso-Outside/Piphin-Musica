// Piphin Música · fontes de música livre (Creative Commons e domínio público), sem conta nem chave:
//   - Openverse (api.openverse.org): catálogo aberto que reúne Jamendo, ccMixter, Wikimedia e outros, com licença e autor
//   - Internet Archive (archive.org, coleção "netlabels"): álbuns de selos independentes com licença CC
//   - ccMixter (ccmixter.org): músicas por gênero (tags)
// Cada resultado vira o mesmo formato: { id, source, title, artist, album, duration, url, ext, cover, license, licenseUrl, pageUrl, videoOk }
const UA = "PiphinMusica/1.0 (+https://github.com/Ruiso-Outside/Piphin-Musica)";

const cache = new Map(); // url -> { at, data } (10 min): menos espera e menos uso do limite de buscas
// uma nova tentativa quando a rede falha (sites pequenos às vezes recusam a primeira conexão)
async function getJson(url, timeout = 45000) {
  try { return await getJsonOnce(url, timeout); }
  catch (e) { if (/fetch failed|ECONNRESET|socket/i.test(e.message)) { await new Promise((r) => setTimeout(r, 800)); return getJsonOnce(url, timeout); } throw e; }
}
// http/https do Node em vez de fetch: o ccMixter manda cabeçalhos enormes que o fetch recusa
function request(url, timeout, hops = 0) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https:") ? require("https") : require("http");
    const req = lib.get(url, { headers: { "User-Agent": UA, Accept: "application/json" }, maxHeaderSize: 512 * 1024, timeout }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && hops < 5) { res.resume(); return resolve(request(new URL(res.headers.location, url).toString(), timeout, hops + 1)); }
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (d) => (body += d));
      res.on("end", () => resolve({ status: res.statusCode, body }));
      res.on("error", reject);
    });
    req.on("timeout", () => req.destroy(new Error("A fonte demorou demais para responder")));
    req.on("error", (e) => reject(e.message === "A fonte demorou demais para responder" ? e : new Error("fetch failed: " + (e.code || e.message))));
  });
}
async function getJsonOnce(url, timeout) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < 600000) return hit.data;
  const r = await request(url, timeout);
  if (r.status === 429) throw new Error("Muitas buscas seguidas nessa fonte. Espere um minuto e tente de novo.");
  if (r.status < 200 || r.status >= 300) throw new Error(`A fonte respondeu com erro ${r.status}`);
  let data;
  try { data = JSON.parse(r.body); } catch { throw new Error("A fonte respondeu algo inesperado"); }
  cache.set(url, { at: Date.now(), data });
  if (cache.size > 200) cache.delete(cache.keys().next().value);
  return data;
}

// licença -> texto curto, nome completo e se dá para usar em vídeos (com crédito)
function license(code, version = "") {
  const c = String(code || "").toLowerCase().replace(/^cc[- ]?/, "").replace(/\/$/, "");
  const names = { by: "Atribuição", "by-sa": "Atribuição-CompartilhaIgual", "by-nd": "Atribuição-SemDerivações", "by-nc": "Atribuição-NãoComercial",
    "by-nc-sa": "Atribuição-NãoComercial-CompartilhaIgual", "by-nc-nd": "Atribuição-NãoComercial-SemDerivações", cc0: "Domínio público (CC0)", pdm: "Domínio público", "sampling+": "Sampling Plus", "nc-sampling+": "NãoComercial Sampling Plus" };
  const short = c === "cc0" ? "CC0" : c === "pdm" ? "Domínio público" : `CC ${c.toUpperCase()}${version ? " " + version : ""}`;
  // usar como trilha de vídeo é uma adaptação: só licenças sem "NC" e sem "ND" liberam isso
  const videoOk = ["by", "by-sa", "cc0", "pdm"].includes(c);
  return { license: short, licenseName: names[c] || short, videoOk };
}
const ccFromUrl = (u) => { const m = /licenses\/([a-z-]+)\/([\d.]+)/i.exec(u || "") || /publicdomain\/(zero)/i.exec(u || ""); return m ? (m[1] === "zero" ? ["cc0", ""] : [m[1].toLowerCase().replace("by-nd-nc", "by-nc-nd"), m[2] || ""]) : ["", ""]; };
// alguns sites mandam o nome já com códigos HTML ("Wine &amp; Chill")
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const txt = (s) => String(s ?? "").replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => (e[0] === "#" ? String.fromCodePoint(parseInt(e.slice(1).replace(/^x/i, ""), /^#x/i.test(e) ? 16 : 10) || 32) : ENT[e.toLowerCase()] ?? m)).trim();
const secs = (v) => { if (v == null) return 0; if (typeof v === "number") return v; const p = String(v).split(":").map(Number); return p.length > 1 ? p.reduce((a, b) => a * 60 + b, 0) : Number(v) || 0; };

// ---------------------------------------------------------------- Openverse
async function openverse(q, { page = 1, videoOnly = false } = {}) {
  const u = new URL("https://api.openverse.org/v1/audio/");
  u.searchParams.set("q", q || "music"); u.searchParams.set("page", page); u.searchParams.set("page_size", "20"); u.searchParams.set("category", "music");
  if (videoOnly) u.searchParams.set("license", "by,by-sa,cc0,pdm");
  const j = await getJson(u.toString());
  return { total: j.result_count || 0, pages: j.page_count || 1, items: (j.results || []).filter((r) => r.url).map((r) => ({
    id: "ov:" + r.id, source: "Openverse · " + (r.source || r.provider || ""), title: txt(r.title) || "Sem título", artist: txt(r.creator) || "Desconhecido", album: txt(r.audio_set && r.audio_set.title),
    duration: (r.duration || 0) / 1000, url: r.url, ext: /mp3|mp32/i.test(r.filetype || "") ? "mp3" : r.filetype || "mp3", cover: r.thumbnail || (r.audio_set && r.audio_set.thumbnail) || null,
    genres: r.genres || [], pageUrl: r.foreign_landing_url || "", licenseUrl: r.license_url || "", ...license(r.license, r.license_version), attribution: r.attribution || "" })) };
}

// ---------------------------------------------------------------- ccMixter (por gênero)
async function ccmixter(tag, { page = 1 } = {}) {
  const u = `https://ccmixter.org/api/query?f=json&tags=${encodeURIComponent(String(tag || "chill").toLowerCase().replace(/\s+/g, "_"))}&limit=20&offset=${(page - 1) * 20}&sort=rank`;
  const list = await getJson(u);
  return { total: null, pages: list.length === 20 ? page + 1 : page, items: (Array.isArray(list) ? list : []).map((r) => {
    const f = (r.files || []).find((x) => /\.mp3$/i.test(x.download_url || "")) || (r.files || [])[0] || {};
    const [code, ver] = ccFromUrl(r.license_url);
    return { id: "cc:" + r.upload_id, source: "ccMixter", title: txt(r.upload_name), artist: txt(r.user_real_name || r.user_name), album: "", duration: secs(f.file_format_info && f.file_format_info.ps),
      url: f.download_url, ext: "mp3", cover: null, genres: String(r.upload_tags || "").split(",").filter((t) => t && !/^(audio|mp3|media|remix|sample|bpm|trackback|secret|featured|editorial|in_|ccm|contest|attribution|non_commercial|sampling|stereo|44k|48k|vbr|cbr|flac|zip|ccplus|[a-z]+_\d{4}|\d)/i.test(t) && !/_/.test(t)).slice(0, 4),
      pageUrl: r.file_page_url, licenseUrl: r.license_url, ...license(code || "by", ver), attribution: `"${r.upload_name}" de ${r.user_name} (ccMixter), ${r.license_name}` };
  }).filter((x) => x.url) };
}

// ---------------------------------------------------------------- Internet Archive (álbuns de netlabels)
async function archive(q, { page = 1, videoOnly = false } = {}) {
  const lic = videoOnly ? " AND (licenseurl:*licenses/by/* OR licenseurl:*licenses/by-sa/* OR licenseurl:*publicdomain*)" : " AND licenseurl:*creativecommons*";
  const query = `(${q || "music"}) AND collection:netlabels AND mediatype:audio${lic}`;
  const u = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(query)}&fl[]=identifier&fl[]=title&fl[]=creator&fl[]=licenseurl&fl[]=year&rows=20&page=${page}&output=json&sort[]=downloads+desc`;
  const j = await getJson(u);
  const docs = j.response.docs || [];
  return { total: j.response.numFound, pages: Math.ceil(j.response.numFound / 20), albums: docs.map((d) => {
    const [code, ver] = ccFromUrl(d.licenseurl);
    return { id: "ia:" + d.identifier, source: "Internet Archive", title: txt(d.title) || d.identifier, artist: txt(Array.isArray(d.creator) ? d.creator[0] : d.creator) || "Vários", year: d.year,
      cover: `https://archive.org/services/img/${d.identifier}`, pageUrl: `https://archive.org/details/${d.identifier}`, licenseUrl: d.licenseurl, ...license(code, ver) };
  }) };
}
// faixas de um álbum do Internet Archive
async function archiveAlbum(identifier) {
  const j = await getJson(`https://archive.org/metadata/${encodeURIComponent(identifier)}`);
  const md = j.metadata || {}, [code, ver] = ccFromUrl(md.licenseurl);
  const lic = license(code, ver);
  const files = (j.files || []).filter((f) => /^(VBR MP3|MP3|128Kbps MP3|64Kbps MP3)$/i.test(f.format || ""));
  const seen = new Set();
  const tracks = files.filter((f) => { const k = (f.title || f.name).toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
    .map((f, i) => ({ id: `ia:${identifier}/${f.name}`, source: "Internet Archive", title: txt(f.title) || f.name.replace(/\.[^.]+$/, "").replace(/_/g, " "), artist: txt(f.creator || (Array.isArray(md.creator) ? md.creator[0] : md.creator)) || "Vários",
      album: txt(md.title) || identifier, track: Number(f.track) || i + 1, duration: secs(f.length), url: `https://archive.org/download/${encodeURIComponent(identifier)}/${encodeURIComponent(f.name)}`, ext: "mp3",
      cover: `https://archive.org/services/img/${identifier}`, genres: [], pageUrl: `https://archive.org/details/${identifier}`, licenseUrl: md.licenseurl || "", ...lic,
      attribution: `"${f.title || f.name}" de ${f.creator || md.creator || "?"}, álbum "${md.title}" (Internet Archive), ${lic.license}` }))
    .sort((a, b) => a.track - b.track);
  return { album: { id: "ia:" + identifier, title: txt(md.title) || identifier, artist: txt(Array.isArray(md.creator) ? md.creator[0] : md.creator), year: md.year, cover: `https://archive.org/services/img/${identifier}`, pageUrl: `https://archive.org/details/${identifier}`, ...lic }, tracks };
}

module.exports = { openverse, ccmixter, archive, archiveAlbum, license };
