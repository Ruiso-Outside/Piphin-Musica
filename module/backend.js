// Piphin Música como módulo do Piphin Hub: busca e baixa músicas livres (Creative Commons / domínio público),
// guarda a biblioteca (baixadas + as músicas da própria pessoa), playlists e créditos; a tela toca.
// Com o Hub 1.7.0+, as músicas baixadas entram na Mídia do Hub (com licença e crédito) e os outros módulos usam:
// o Piphin Vídeo, por exemplo, mostra as músicas e lembra o crédito ao exportar.
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const https = require("https");
const crypto = require("crypto");
const src = require("./sources");

const AUDIO_EXT = ["mp3", "m4a", "aac", "ogg", "opus", "flac", "wav", "webm", "wma"];
const MIME = { mp3: "audio/mpeg", m4a: "audio/mp4", aac: "audio/aac", ogg: "audio/ogg", opus: "audio/ogg", flac: "audio/flac", wav: "audio/wav", webm: "audio/webm", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

exports.activate = (ctx) => {
  const LIB = path.join(ctx.dataDir, "biblioteca.json"), COVERS = path.join(ctx.dataDir, "capas"), PREFS = path.join(ctx.dataDir, "prefs.json");
  const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return d; } };
  let lib = readJson(LIB, { tracks: [], playlists: [] });
  let saveTimer = 0;
  const save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => { fs.mkdirSync(ctx.dataDir, { recursive: true }); fs.writeFileSync(LIB, JSON.stringify(lib)); }, 300); };
  const musicDir = () => { const p = readJson(PREFS, {}); return p.folder || path.join(os.homedir(), "Music", "Piphin Música"); };
  const uid = () => crypto.randomBytes(5).toString("hex");
  const changed = () => { save(); ctx.emit("library", publicLib()); syncHub(); };

  // ---------------------------------------------------------------- Mídia do Hub (no Hub antigo, ctx.host.library não existe)
  const hubLib = ctx.host.library || null;
  let syncTimer = 0;
  // só as baixadas por aqui (as músicas da própria pessoa continuam só no Piphin Música)
  function syncHub() {
    if (!hubLib) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      const items = lib.tracks.filter((t) => t.origin === "download" && fs.existsSync(t.path)).map((t) => ({
        path: t.path, kind: "audio", title: t.title, artist: t.artist, album: t.album || undefined, duration: t.duration || undefined,
        sub: "Música baixada", license: t.license || undefined, credit: t.attribution || undefined, videoOk: !!t.videoOk,
        cover: t.coverFile || undefined, tags: (t.genres || []).slice(0, 6), addedAt: t.addedAt }));
      hubLib.sync(items).catch((e) => ctx.log("mídia", e));
    }, 500);
  }
  syncHub();
  ctx.handle("openers", () => (ctx.host.openers ? ctx.host.openers("audio") : []));
  ctx.handle("open-in", (target, id) => {
    const t = lib.tracks.find((x) => x.id === id);
    if (!t) throw new Error("Música não encontrada");
    return ctx.host.openIn(target, { path: t.path, title: t.title });
  });
  // "Abrir no Piphin Música" de outro módulo (ex.: uma música feita no Piphin Som): entra na biblioteca e toca
  let uiWaiting = null;
  ctx.host.on("open-file", async (f) => {
    try {
      addLocal([f.path]);
      const t = lib.tracks.find((x) => x.path.toLowerCase() === String(f.path).toLowerCase());
      if (!t) return;
      if (f.title && t.needsTags) { t.title = f.title; if (f.fromName) t.album = f.fromName; changed(); }
      if (!uiReady) { await ctx.host.focus().catch(() => {}); await new Promise((r) => { uiWaiting = r; setTimeout(r, 20000); }); }
      ctx.emit("play-file", { id: t.id, from: f.fromName });
    } catch (e) { ctx.log("abrir arquivo", e); }
  });

  // ---------------------------------------------------------------- servidor local (a tela toca os arquivos do disco por aqui)
  const token = crypto.randomBytes(16).toString("hex");
  const files = new Map(); let seq = 0, base = "";
  const server = http.createServer((req, res) => {
    const r = /^\/p\/([0-9a-f]+)\/(\d+)/.exec(req.url || "");
    if (r) return r[1] === token && remotes.has(Number(r[2])) ? proxy(remotes.get(Number(r[2])), req, res) : (res.writeHead(404), res.end());
    const m = /^\/m\/([0-9a-f]+)\/(\d+)/.exec(req.url || "");
    const file = m && m[1] === token ? files.get(Number(m[2])) : null;
    if (!file) { res.writeHead(404); return res.end(); }
    let st; try { st = fs.statSync(file); } catch { res.writeHead(404); return res.end(); }
    const head = { "Access-Control-Allow-Origin": "*", "Accept-Ranges": "bytes", "Content-Type": MIME[path.extname(file).slice(1).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store" };
    const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || "");
    let start = 0, end = st.size - 1, code = 200;
    if (range) { start = range[1] ? Number(range[1]) : Math.max(0, st.size - Number(range[2])); end = range[1] && range[2] ? Math.min(Number(range[2]), st.size - 1) : st.size - 1; code = 206; head["Content-Range"] = `bytes ${start}-${end}/${st.size}`; }
    head["Content-Length"] = Math.max(0, end - start + 1);
    res.writeHead(code, head);
    if (req.method === "HEAD") return res.end();
    const s = fs.createReadStream(file, { start, end }); s.pipe(res); res.on("close", () => s.destroy());
  });
  const ready = new Promise((r) => server.listen(0, "127.0.0.1", () => { base = `http://127.0.0.1:${server.address().port}/m/${token}`; r(); }));
  ctx.onStop(() => server.close());
  // ouvir antes de baixar: o som do site passa por aqui (com o cabeçalho que deixa o equalizador funcionar)
  const remotes = new Map(); let rseq = 0;
  function proxy(url, req, res, hops = 0, retried = false) {
    const lib_ = url.startsWith("https:") ? https : http;
    const headers = { "User-Agent": "PiphinMusica/1.0" };
    if (req.headers.range) headers.Range = req.headers.range;
    const up = lib_.get(url, { headers, maxHeaderSize: 512 * 1024, timeout: 30000 }, (u) => {
      if (u.statusCode >= 300 && u.statusCode < 400 && u.headers.location && hops < 6) { u.resume(); return proxy(new URL(u.headers.location, url).toString(), req, res, hops + 1, retried); }
      // o Internet Archive às vezes responde "ocupado" (503): tenta de novo uma vez
      if ((u.statusCode === 503 || u.statusCode === 502) && !retried) { u.resume(); return setTimeout(() => { if (!res.destroyed) proxy(url, req, res, hops, true); }, 1200); }
      const head = { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" };
      for (const k of ["content-type", "content-length", "content-range", "accept-ranges"]) if (u.headers[k]) head[k] = u.headers[k];
      if (u.headers["content-range"] || u.statusCode === 206) head["accept-ranges"] = "bytes";
      res.writeHead(u.statusCode, head); u.pipe(res);
      res.on("close", () => u.destroy());
    });
    up.on("timeout", () => up.destroy());
    up.on("error", () => { if (!res.headersSent) res.writeHead(502); res.end(); });
  }
  const streamUrl = (url) => {
    if (!/^https?:\/\//.test(String(url))) throw new Error("Endereço inválido");
    let id = [...remotes.entries()].find(([, u]) => u === url);
    id = id ? id[0] : ++rseq; remotes.set(id, url);
    if (remotes.size > 500) remotes.delete(remotes.keys().next().value);
    return base.replace("/m/", "/p/") + "/" + id;
  };
  const urlOf = (file) => {
    if (!file) return null;
    let id = [...files.entries()].find(([, f]) => f === file);
    id = id ? id[0] : ++seq; files.set(id, file);
    return `${base}/${id}/${encodeURIComponent(path.basename(file))}`;
  };
  // biblioteca para a tela: cada faixa com o endereço local para tocar (e a capa)
  function publicLib() {
    return { tracks: lib.tracks.map((t) => ({ ...t, src: fs.existsSync(t.path) ? urlOf(t.path) : null, missing: !fs.existsSync(t.path), coverSrc: t.coverFile && fs.existsSync(t.coverFile) ? urlOf(t.coverFile) : t.cover && /^https?:/.test(t.cover) ? t.cover : null })),
      playlists: lib.playlists, folder: musicDir() };
  }

  // ---------------------------------------------------------------- downloads
  function fetchToFile(url, file, onProgress, hops = 0) {
    return new Promise((resolve, reject) => {
      const lib_ = url.startsWith("https:") ? https : http;
      const req = lib_.get(url, { headers: { "User-Agent": "PiphinMusica/1.0" }, maxHeaderSize: 512 * 1024, timeout: 60000 }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && hops < 6) { res.resume(); return resolve(fetchToFile(new URL(res.headers.location, url).toString(), file, onProgress, hops + 1)); }
        if (res.statusCode !== 200) { res.resume(); return reject(new Error(`O site respondeu com erro ${res.statusCode}`)); }
        const total = Number(res.headers["content-length"]) || 0, type = res.headers["content-type"] || "";
        if (/text\/html/i.test(type)) { res.resume(); return reject(new Error("O site não entregou um arquivo de áudio")); }
        let got = 0, last = 0;
        const out = fs.createWriteStream(file + ".parcial");
        res.on("data", (d) => { got += d.length; if (onProgress && Date.now() - last > 200) { last = Date.now(); onProgress(total ? got / total : 0, got); } });
        res.pipe(out);
        out.on("finish", () => out.close(() => { fs.renameSync(file + ".parcial", file); resolve({ bytes: got, type }); }));
        out.on("error", reject);
        res.on("error", (e) => { out.destroy(); fs.rmSync(file + ".parcial", { force: true }); reject(e); });
      });
      req.on("timeout", () => req.destroy(new Error("O download parou de responder")));
      req.on("error", reject);
    });
  }
  const clean = (s) => String(s || "").replace(/[\\/:*?"<>|\x00-\x1f]/g, "").replace(/\s+/g, " ").trim().slice(0, 80) || "Sem nome";
  const downloading = new Map();
  async function download(item) {
    const exists = lib.tracks.find((t) => t.remoteId === item.id);
    if (exists && fs.existsSync(exists.path)) return exists;
    if (downloading.has(item.id)) return downloading.get(item.id);
    const job = (async () => {
      const dir = musicDir(); fs.mkdirSync(dir, { recursive: true });
      let file = path.join(dir, `${clean(item.artist)} - ${clean(item.title)}.${item.ext || "mp3"}`);
      for (let i = 2; fs.existsSync(file); i++) file = path.join(dir, `${clean(item.artist)} - ${clean(item.title)} (${i}).${item.ext || "mp3"}`);
      ctx.emit("download", { id: item.id, pct: 0 });
      await fetchToFile(item.url, file, (pct) => ctx.emit("download", { id: item.id, pct }));
      let coverFile = null;
      if (item.cover) { try { fs.mkdirSync(COVERS, { recursive: true }); coverFile = path.join(COVERS, uid() + ".jpg"); await fetchToFile(item.cover, coverFile); } catch { coverFile = null; } }
      const t = { id: uid(), title: item.title, artist: item.artist, album: item.album || "", duration: item.duration || 0, path: file, cover: item.cover || null, coverFile, origin: "download",
        remoteId: item.id, source: item.source, license: item.license, licenseName: item.licenseName, licenseUrl: item.licenseUrl, pageUrl: item.pageUrl, videoOk: !!item.videoOk,
        attribution: item.attribution || `"${item.title}" de ${item.artist}, ${item.license}${item.licenseUrl ? " (" + item.licenseUrl + ")" : ""}`, genres: item.genres || [], addedAt: new Date().toISOString(), liked: false, plays: 0 };
      lib.tracks.push(t); changed();
      ctx.emit("download", { id: item.id, pct: 1, done: true, track: t.id });
      return t;
    })();
    downloading.set(item.id, job);
    try { return await job; } catch (e) { ctx.emit("download", { id: item.id, error: e.message }); throw e; } finally { downloading.delete(item.id); }
  }

  // ---------------------------------------------------------------- músicas da própria pessoa
  function addLocal(paths) {
    const added = [];
    for (const p of paths) {
      if (!AUDIO_EXT.includes(path.extname(p).slice(1).toLowerCase())) continue;
      if (lib.tracks.some((t) => t.path.toLowerCase() === p.toLowerCase())) continue;
      const name = path.basename(p).replace(/\.[^.]+$/, ""), m = /^(.+?)\s+-\s+(.+)$/.exec(name);
      const t = { id: uid(), title: m ? m[2] : name, artist: m ? m[1] : "", album: path.basename(path.dirname(p)), duration: 0, path: p, cover: null, coverFile: null, origin: "local",
        source: "Seu computador", license: "", addedAt: new Date().toISOString(), liked: false, plays: 0, needsTags: true };
      lib.tracks.push(t); added.push(t.id);
    }
    if (added.length) changed();
    return added;
  }
  function scanFolder(dir, out = [], depth = 0) {
    if (depth > 6 || out.length > 5000) return out;
    let list = []; try { list = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
    for (const e of list) { const p = path.join(dir, e.name); if (e.isDirectory()) scanFolder(p, out, depth + 1); else if (AUDIO_EXT.includes(path.extname(e.name).slice(1).toLowerCase())) out.push(p); }
    return out;
  }

  // ---------------------------------------------------------------- chamadas da tela
  ctx.handle("library", async () => { await ready; return publicLib(); });
  ctx.handle("search", async (source, q, opts = {}) => (source === "archive" ? src.archive(q, opts) : source === "ccmixter" ? src.ccmixter(q, opts) : src.openverse(q, opts)));
  ctx.handle("album", (id) => src.archiveAlbum(String(id).replace(/^ia:/, "")));
  ctx.handle("download", (item) => download(item));
  ctx.handle("stream", async (url) => { await ready; return streamUrl(url); });
  ctx.handle("import-files", async () => {
    const list = await ctx.host.openDialog({ title: "Adicionar músicas", properties: ["openFile", "multiSelections"], filters: [{ name: "Áudio", extensions: AUDIO_EXT }] });
    return list ? addLocal(list) : [];
  });
  ctx.handle("import-folder", async () => {
    const list = await ctx.host.openDialog({ title: "Adicionar uma pasta de músicas", properties: ["openDirectory"] });
    return list && list[0] ? addLocal(scanFolder(list[0])) : [];
  });
  ctx.handle("track-update", (id, patch) => {
    const t = lib.tracks.find((x) => x.id === id); if (!t) return false;
    const allowed = ["title", "artist", "album", "duration", "liked", "plays", "needsTags", "lastPlayed"];
    for (const k of allowed) if (k in patch) t[k] = patch[k];
    if (patch.coverB64) { fs.mkdirSync(COVERS, { recursive: true }); t.coverFile = path.join(COVERS, t.id + "." + (patch.coverExt || "jpg")); fs.writeFileSync(t.coverFile, Buffer.from(patch.coverB64, "base64")); }
    changed(); return true;
  });
  ctx.handle("tracks-remove", (ids, deleteFiles = false) => {
    for (const id of ids) {
      const t = lib.tracks.find((x) => x.id === id); if (!t) continue;
      if (deleteFiles && t.origin === "download") { try { fs.rmSync(t.path, { force: true }); } catch { /* em uso */ } }
      lib.tracks = lib.tracks.filter((x) => x.id !== id);
      for (const p of lib.playlists) p.trackIds = p.trackIds.filter((x) => x !== id);
    }
    changed(); return true;
  });
  ctx.handle("playlist-create", (name, trackIds = []) => { const p = { id: uid(), name: String(name || "Nova playlist").slice(0, 80), trackIds: [...new Set(trackIds)], createdAt: new Date().toISOString() }; lib.playlists.push(p); changed(); return p; });
  ctx.handle("playlist-update", (id, patch) => {
    const p = lib.playlists.find((x) => x.id === id); if (!p) throw new Error("Playlist não encontrada");
    if (patch.name != null) p.name = String(patch.name).slice(0, 80);
    if (Array.isArray(patch.trackIds)) p.trackIds = patch.trackIds.filter((tid) => lib.tracks.some((t) => t.id === tid));
    if (Array.isArray(patch.add)) for (const tid of patch.add) if (!p.trackIds.includes(tid)) p.trackIds.push(tid);
    if (Array.isArray(patch.remove)) p.trackIds = p.trackIds.filter((tid) => !patch.remove.includes(tid));
    changed(); return p;
  });
  ctx.handle("playlist-delete", (id) => { lib.playlists = lib.playlists.filter((x) => x.id !== id); changed(); return true; });
  ctx.handle("playlist-export", async (id) => {
    const p = lib.playlists.find((x) => x.id === id); if (!p) return null;
    const file = await ctx.host.saveDialog({ title: "Exportar playlist", defaultPath: path.join(musicDir(), clean(p.name) + ".m3u8"), filters: [{ name: "Playlist", extensions: ["m3u8", "m3u"] }] });
    if (!file) return null;
    const lines = ["#EXTM3U", ...p.trackIds.map((tid) => lib.tracks.find((t) => t.id === tid)).filter(Boolean).flatMap((t) => [`#EXTINF:${Math.round(t.duration || -1)},${t.artist ? t.artist + " - " : ""}${t.title}`, t.path])];
    fs.writeFileSync(file, lines.join("\r\n") + "\r\n", "utf8");
    return file;
  });
  ctx.handle("playlist-import", async () => {
    const list = await ctx.host.openDialog({ title: "Importar playlist", properties: ["openFile"], filters: [{ name: "Playlist", extensions: ["m3u8", "m3u"] }] });
    if (!list || !list[0]) return null;
    const dir = path.dirname(list[0]);
    const paths = fs.readFileSync(list[0], "utf8").split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#")).map((l) => (path.isAbsolute(l) ? l : path.join(dir, l))).filter((p) => fs.existsSync(p));
    addLocal(paths);
    const ids = paths.map((p) => (lib.tracks.find((t) => t.path.toLowerCase() === p.toLowerCase()) || {}).id).filter(Boolean);
    const pl = { id: uid(), name: path.basename(list[0]).replace(/\.m3u8?$/i, ""), trackIds: ids, createdAt: new Date().toISOString() };
    lib.playlists.push(pl); changed(); return pl;
  });
  ctx.handle("open-folder", () => { fs.mkdirSync(musicDir(), { recursive: true }); return ctx.host.openPath(musicDir()); });
  ctx.handle("show-item", (p) => ctx.host.showItem(p));
  ctx.handle("choose-folder", async () => {
    const list = await ctx.host.openDialog({ title: "Onde salvar as músicas baixadas", properties: ["openDirectory", "createDirectory"], defaultPath: musicDir() });
    if (!list || !list[0]) return null;
    const p = { ...readJson(PREFS, {}), folder: list[0] }; fs.writeFileSync(PREFS, JSON.stringify(p)); return list[0];
  });
  ctx.handle("prefs", (patch) => { let p = readJson(PREFS, {}); if (patch) { p = { ...p, ...patch }; fs.mkdirSync(ctx.dataDir, { recursive: true }); fs.writeFileSync(PREFS, JSON.stringify(p)); } return p; });
  // tocando: fechar a janela do Hub só esconde (a música continua)
  ctx.handle("playing", (on) => ctx.host.keepAlive(!!on, "tocando música").catch(() => {}));

  // ---------------------------------------------------------------- ferramentas para a IA (module.json "tools")
  let uiReady = false; const waiters = [], pending = new Map(); let aiSeq = 0;
  ctx.handle("ui-ready", () => { uiReady = true; waiters.splice(0).forEach((f) => f()); if (uiWaiting) { uiWaiting(); uiWaiting = null; } return true; });
  ctx.handle("ui-unload", () => { uiReady = false; for (const p of pending.values()) p.reject(new Error("A tela do Piphin Música foi fechada")); pending.clear(); return true; });
  ctx.handle("ai-reply", (id, ok, data) => { const p = pending.get(id); if (p) { pending.delete(id); ok ? p.resolve(data) : p.reject(new Error(data)); } return true; });
  async function toUi(name, args) {
    if (!uiReady) { await ctx.host.focus().catch(() => {}); await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error("A tela do Piphin Música não abriu")), 20000); waiters.push(() => { clearTimeout(t); res(); }); }); }
    const id = ++aiSeq;
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { pending.delete(id); reject(new Error("O Piphin Música não respondeu")); }, 60000);
      pending.set(id, { resolve: (v) => { clearTimeout(t); resolve(v); }, reject: (e) => { clearTimeout(t); reject(e); } });
      ctx.emit("ai-call", { id, name, args: args || {} });
    });
  }
  const lastResults = new Map(); // id -> item (para a IA baixar pelo id que viu na busca)
  const brief = (x) => ({ id: x.id, title: x.title, artist: x.artist, album: x.album || undefined, minutes: x.duration ? +(x.duration / 60).toFixed(1) : undefined, license: x.license, can_use_in_videos: x.videoOk, genres: (x.genres || []).slice(0, 4), source: x.source });
  ctx.handle("tool:search_music", async (a = {}) => {
    const q = String(a.query || "").trim() || "music";
    let items = [];
    if (a.source === "archive") { const r = await src.archive(q, { videoOnly: !!a.for_videos }); for (const al of r.albums.slice(0, 3)) { try { items.push(...(await src.archiveAlbum(al.id.slice(3))).tracks.slice(0, 5)); } catch { /* álbum sem mp3 */ } } }
    else if (a.source === "ccmixter") items = (await src.ccmixter(q)).items;
    else items = (await src.openverse(q, { videoOnly: !!a.for_videos })).items;
    if (a.for_videos) items = items.filter((x) => x.videoOk);
    for (const x of items) lastResults.set(x.id, x);
    return { results: items.slice(0, a.limit || 12).map(brief), note: items.length ? "Use download_music com o id para baixar." : "Nada encontrado; tente outras palavras (em inglês costuma achar mais) ou outra fonte." };
  });
  ctx.handle("tool:download_music", async (a = {}) => {
    const ids = Array.isArray(a.ids) ? a.ids : [a.id];
    const out = [];
    for (const id of ids.filter(Boolean)) {
      const item = lastResults.get(id);
      if (!item) throw new Error(`Resultado ${id} não encontrado: faça search_music antes`);
      const t = await download(item);
      out.push({ track_id: t.id, title: t.title, artist: t.artist, file: t.path, license: t.license, credit: t.attribution });
    }
    if (a.playlist) { let p = lib.playlists.find((x) => x.name.toLowerCase() === String(a.playlist).toLowerCase()); if (!p) { p = { id: uid(), name: String(a.playlist), trackIds: [], createdAt: new Date().toISOString() }; lib.playlists.push(p); } for (const o of out) if (!p.trackIds.includes(o.track_id)) p.trackIds.push(o.track_id); changed(); }
    ctx.host.notify("Piphin Música", out.length === 1 ? `A IA baixou "${out[0].title}"` : `A IA baixou ${out.length} músicas`).catch(() => {});
    return { downloaded: out, folder: musicDir() };
  });
  ctx.handle("tool:library_info", () => ({ tracks: lib.tracks.length, downloaded: lib.tracks.filter((t) => t.origin === "download").length, own: lib.tracks.filter((t) => t.origin === "local").length,
    liked: lib.tracks.filter((t) => t.liked).length, playlists: lib.playlists.map((p) => ({ name: p.name, tracks: p.trackIds.length })),
    recent: lib.tracks.slice(-15).reverse().map((t) => ({ track_id: t.id, title: t.title, artist: t.artist, license: t.license || "sua música" })) }));
  ctx.handle("tool:create_playlist", (a = {}) => {
    const find = (q) => { q = String(q).toLowerCase(); return lib.tracks.find((t) => t.id === q) || lib.tracks.find((t) => `${t.artist} ${t.title}`.toLowerCase().includes(q) || t.title.toLowerCase().includes(q)); };
    const ids = (a.tracks || []).map(find).filter(Boolean).map((t) => t.id);
    const p = { id: uid(), name: String(a.name || "Playlist da IA").slice(0, 80), trackIds: [...new Set(ids)], createdAt: new Date().toISOString() };
    lib.playlists.push(p); changed();
    return { playlist: p.name, tracks: p.trackIds.length, not_found: (a.tracks || []).length - p.trackIds.length };
  });
  for (const name of ["play_music", "player_control"]) ctx.handle("tool:" + name, (args) => toUi(name, args));
};
