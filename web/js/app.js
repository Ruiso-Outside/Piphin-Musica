// Piphin Música · telas: descobrir (fontes livres), biblioteca, curtidas, playlists, créditos, fila e equalizador.
"use strict";
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const call = async (ch, ...a) => { const r = await piphin.invoke(ch, ...a); if (!r.ok) throw new Error(r.error); return r.data; };
const tm = (s) => { s = Math.max(0, Math.round(s || 0)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = String(s % 60).padStart(2, "0"); return h ? `${h}:${String(m).padStart(2, "0")}:${x}` : `${m}:${x}`; };
const total = (list) => { const s = list.reduce((a, t) => a + (t.duration || 0), 0); return s >= 3600 ? `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min` : `${Math.round(s / 60)} min`; };
const plural = (n, a, b) => `${n.toLocaleString("pt-BR")} ${n === 1 ? a : b}`;

const GENRES = [["Lo-fi", "lofi"], ["Relaxante", "chill"], ["Eletrônica", "electronic"], ["Rock", "rock"], ["Piano", "piano"], ["Jazz", "jazz"], ["Hip hop", "hip hop"], ["Acústica", "acoustic"],
  ["Trilha épica", "epic cinematic"], ["Ambiente", "ambient"], ["Clássica", "classical"], ["Games 8-bit", "chiptune"], ["Reggae", "reggae"], ["Funk", "funk"], ["Folk", "folk"], ["Metal", "metal"]];
const SOURCES = { openverse: ["Openverse", "Junta Jamendo, ccMixter, Wikimedia e outros sites de música livre"], ccmixter: ["ccMixter", "Comunidade de remixes e trilhas; busca por gênero"], archive: ["Internet Archive", "Álbuns inteiros de selos independentes (netlabels)"] };

const S = {
  view: "explore", lib: { tracks: [], playlists: [], folder: "" },
  ex: { source: "openverse", q: "", videoOnly: false, items: [], albums: [], page: 1, pages: 1, loading: false, error: "", searched: false },
  album: null, albumFrom: null, libF: { origin: "all", q: "", sort: "added" }, dl: new Map(), queueOpen: false, prefs: {},
};
const byId = (id) => S.lib.tracks.find((t) => t.id === id);
const byRemote = (rid) => S.lib.tracks.find((t) => t.remoteId === rid && !t.missing);

// ---------------------------------------------------------------- avisos, janelas e menus
function toast(text, kind = "") { const el = document.createElement("div"); el.className = "toast " + kind; el.textContent = text; $("#toasts").appendChild(el); setTimeout(() => el.remove(), 4200); }
const modal = $("#modal"), box = $("#modalBox");
const openModal = (html, cls = "") => { box.className = "modal-box " + cls; box.innerHTML = html; modal.hidden = false; };
const closeModal = () => { modal.hidden = true; box.innerHTML = ""; };
modal.addEventListener("mousedown", (e) => { if (e.target === modal) closeModal(); });
const confirmBox = (title, text, yes = "Continuar", danger = false) => new Promise((resolve) => {
  openModal(`<h3>${esc(title)}</h3><p>${text}</p><div class="modal-actions"><button class="btn" data-n>Cancelar</button><button class="btn ${danger ? "danger solid" : "primary"}" data-y>${esc(yes)}</button></div>`);
  box.querySelector("[data-y]").onclick = () => { closeModal(); resolve(true); };
  box.querySelector("[data-n]").onclick = () => { closeModal(); resolve(false); };
});
const ask = (title, label, value = "", yes = "Salvar") => new Promise((resolve) => {
  openModal(`<h3>${esc(title)}</h3><label class="field"><span>${esc(label)}</span><input id="askIn" maxlength="80" value="${esc(value)}"></label><div class="modal-actions"><button class="btn" data-n>Cancelar</button><button class="btn primary" data-y>${esc(yes)}</button></div>`);
  const inp = $("#askIn"); inp.focus(); inp.select();
  const ok = () => { const v = inp.value.trim(); closeModal(); resolve(v || null); };
  box.querySelector("[data-y]").onclick = ok; inp.onkeydown = (e) => { if (e.key === "Enter") ok(); if (e.key === "Escape") { closeModal(); resolve(null); } };
  box.querySelector("[data-n]").onclick = () => { closeModal(); resolve(null); };
});
const guard = (fn) => async (...a) => { try { return await fn(...a); } catch (e) { toast(e.message, "err"); } };
const menu = $("#menu");
function showMenu(anchor, items) {
  menu.innerHTML = items.map((it, i) => (it === "-" ? `<hr>` : it.head ? `<div class="mh">${esc(it.head)}</div>` : `<button data-i="${i}" class="${it.danger ? "danger" : ""}"><i class="i i-${it.icon || "dot"}"></i>${esc(it.label)}</button>`)).join("");
  menu.hidden = false;
  const r = anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : { left: anchor.x, right: anchor.x, top: anchor.y, bottom: anchor.y };
  const mw = menu.offsetWidth, mh = menu.offsetHeight;
  menu.style.left = Math.max(8, Math.min(innerWidth - mw - 8, r.right - mw)) + "px";
  menu.style.top = (r.bottom + mh + 8 > innerHeight ? Math.max(8, r.top - mh - 4) : r.bottom + 4) + "px";
  menu.onclick = (e) => { const b = e.target.closest("[data-i]"); if (!b) return; hideMenu(); guard(items[b.dataset.i].fn)(); };
}
const hideMenu = () => { menu.hidden = true; };
document.addEventListener("mousedown", (e) => { if (!menu.hidden && !menu.contains(e.target)) hideMenu(); });
// capa que não carregou: fica o ícone
document.addEventListener("error", (e) => { if (e.target.tagName === "IMG" && e.target.classList.contains("ci")) e.target.remove(); }, true);
const coverHtml = (src, cls = "") => `<div class="cover ${cls}"><i class="i i-music"></i>${src ? `<img class="ci" loading="lazy" src="${esc(src)}" alt="">` : ""}</div>`;

// ---------------------------------------------------------------- dados
piphin.on("library", (lib) => {
  S.lib = lib;
  // nome, capa e tags novas também na fila do player
  for (const it of Player.state.queue) { const t = it.trackId && byId(it.trackId); if (t) Object.assign(it, { title: t.title, artist: t.artist, album: t.album, cover: t.coverSrc, src: t.src || it.src }); }
  renderSide(); if (["library", "liked", "credits"].includes(S.view) || S.view.startsWith("pl:")) render(); else refreshRows(); refreshNow(); readTags(); });
piphin.on("download", (d) => {
  if (d.error) { S.dl.delete(d.id); toast(`Download falhou: ${d.error}`, "err"); }
  else if (d.done) S.dl.delete(d.id); else S.dl.set(d.id, d.pct);
  refreshRows();
});
async function loadLib() { S.lib = await call("library"); renderSide(); render(); readTags(); }

// lê nome, artista, álbum, duração e capa das músicas da própria pessoa (tags do arquivo)
let tagBusy = false;
async function readTags() {
  if (tagBusy || typeof Mediabunny === "undefined") return;
  tagBusy = true;
  try {
    for (;;) {
      const t = S.lib.tracks.find((x) => x.needsTags && x.src);
      if (!t) break;
      const patch = { needsTags: false };
      try {
        const input = new Mediabunny.Input({ source: new Mediabunny.UrlSource(t.src), formats: Mediabunny.ALL_FORMATS });
        const tags = await input.getMetadataTags().catch(() => ({}));
        patch.duration = await input.computeDuration().catch(() => 0);
        if (tags.title) patch.title = tags.title;
        if (tags.artist || tags.albumArtist) patch.artist = tags.artist || tags.albumArtist;
        if (tags.album) patch.album = tags.album;
        const img = (tags.images || []).find((i) => i.kind === "coverFront") || (tags.images || [])[0];
        if (img && img.data && img.data.length < 4e6) {
          let s = ""; const b = img.data; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
          patch.coverB64 = btoa(s); patch.coverExt = /png/.test(img.mimeType || "") ? "png" : "jpg";
        }
        input.dispose && input.dispose();
      } catch { /* arquivo sem tags: fica o nome do arquivo */ }
      t.needsTags = false;
      await call("track-update", t.id, patch).catch(() => {});
    }
  } finally { tagBusy = false; }
}

// ---------------------------------------------------------------- tocar
const libItem = (t) => ({ key: "t:" + t.id, trackId: t.id, title: t.title, artist: t.artist, album: t.album, cover: t.coverSrc, src: t.src,
  onStart: () => { const x = byId(t.id); call("track-update", t.id, { plays: ((x && x.plays) || 0) + 1, lastPlayed: new Date().toISOString() }).catch(() => {}); },
  onDuration: (d) => { const x = byId(t.id); if (x && !x.duration) call("track-update", t.id, { duration: d }).catch(() => {}); } });
const remoteItem = (x) => { const t = byRemote(x.id); return t ? libItem(t) : { key: "r:" + x.id, remote: x, title: x.title, artist: x.artist, album: x.album, cover: x.cover, resolve: () => call("stream", x.url) }; };
const playable = (list) => list.filter((t) => t.src && !t.missing);
function playTracks(list, id, opts) {
  const ok = playable(list); if (!ok.length) return toast("Nenhuma música para tocar aqui", "warn");
  Player.playList(ok.map(libItem), Math.max(0, ok.findIndex((t) => t.id === id)), opts);
}
Player.on((w) => {
  if (w && w.error) return toast(w.error, "err");
  if (w === "track" || w === "state") { refreshNow(); refreshRows(); if (S.queueOpen) renderQueue(); }
  if (w === "state") call("playing", Player.playing).catch(() => {});
  if (w === "queue" && S.queueOpen) renderQueue();
  if (w === "time") refreshTime();
  if (w === "volume") refreshVol();
  if (w === "eq") { savePrefs(); if (!modal.hidden && $("#eqBands")) renderEqBody(); }
  if (w === "volume" || w === "state") savePrefs();
});
let prefTimer = 0;
function savePrefs() {
  clearTimeout(prefTimer);
  prefTimer = setTimeout(() => { const p = Player.state; call("prefs", { volume: p.volume, shuffle: p.shuffle, repeat: p.repeat, eq: p.eq, eqName: p.eqName, eqOn: p.eqOn }).catch(() => {}); }, 500);
}

// ---------------------------------------------------------------- barra do player
function refreshNow() {
  const it = Player.current();
  $("#npTitle").textContent = it ? it.title : "Nada tocando";
  $("#npArtist").textContent = it ? it.artist || "Artista desconhecido" : "Escolha uma música para ouvir";
  $("#npCover").innerHTML = `<i class="i i-music"></i>${it && it.cover ? `<img class="ci" src="${esc(it.cover)}" alt="">` : ""}`;
  const t = it && it.trackId && byId(it.trackId);
  $("#npLike").hidden = !t;
  $("#npLike").classList.toggle("on", !!(t && t.liked));
  $("#play").innerHTML = Player.state.loading ? `<span class="spin"></span>` : `<i class="i i-${Player.playing ? "pause" : "play"}"></i>`;
  $("#shuffle").classList.toggle("on", Player.state.shuffle);
  $("#repeat").classList.toggle("on", Player.state.repeat !== "off");
  $("#repeat").innerHTML = `<i class="i i-${Player.state.repeat === "one" ? "repeat-1" : "repeat"}"></i>`;
  $("#repeat").title = { off: "Repetir: desligado", all: "Repetir: tudo", one: "Repetir: esta música" }[Player.state.repeat];
  $("#eqBtn").classList.toggle("on", Player.state.eqOn && Player.state.eqName !== "Normal");
  $("#queueBtn").classList.toggle("on", S.queueOpen);
}
let seeking = false;
function refreshTime() {
  const a = Player.audio, d = isFinite(a.duration) ? a.duration : 0;
  $("#tCur").textContent = tm(a.currentTime); $("#tDur").textContent = tm(d);
  if (!seeking) { $("#seek").value = d ? (a.currentTime / d) * 1000 : 0; }
  $("#seek").style.setProperty("--p", (d ? (a.currentTime / d) * 100 : 0) + "%");
}
function refreshVol() {
  const v = Player.state.muted ? 0 : Player.state.volume;
  $("#vol").value = Math.round(v * 100); $("#vol").style.setProperty("--p", v * 100 + "%");
  $("#mute").innerHTML = `<i class="i i-${v === 0 ? "volume-x" : v < 0.5 ? "volume-1" : "volume-2"}"></i>`;
}
$("#play").onclick = () => Player.toggle();
$("#next").onclick = () => Player.next();
$("#prev").onclick = () => Player.prev();
$("#shuffle").onclick = () => Player.setShuffle(!Player.state.shuffle);
$("#repeat").onclick = () => Player.cycleRepeat();
$("#mute").onclick = () => Player.toggleMute();
$("#vol").oninput = (e) => Player.setVolume(e.target.value / 100);
$("#seek").oninput = (e) => { seeking = true; const d = Player.audio.duration; if (isFinite(d)) $("#tCur").textContent = tm((e.target.value / 1000) * d); };
$("#seek").onchange = (e) => { Player.seek(e.target.value / 1000); seeking = false; };
$("#npLike").onclick = guard(async () => { const it = Player.current(); const t = it && byId(it.trackId); if (t) await call("track-update", t.id, { liked: !t.liked }); });
$("#queueBtn").onclick = () => { S.queueOpen = !S.queueOpen; $("#queue").hidden = !S.queueOpen; renderQueue(); refreshNow(); };
$("#eqBtn").onclick = () => openEq();
document.addEventListener("keydown", (e) => {
  if (e.target.closest("input, textarea, select") || !modal.hidden) return;
  if (e.code === "Space") { e.preventDefault(); Player.toggle(); }
  else if (e.ctrlKey && e.key === "ArrowRight") Player.next();
  else if (e.ctrlKey && e.key === "ArrowLeft") Player.prev();
  else if (e.ctrlKey && e.key.toLowerCase() === "f") { e.preventDefault(); const i = $("#q") || $("#libQ"); if (i) i.focus(); }
});

// ---------------------------------------------------------------- fila
function renderQueue() {
  if (!S.queueOpen) return;
  const it = Player.current(), next = Player.upcoming();
  $("#queue").innerHTML = `<div class="q-head"><b>Fila</b><button class="btn icon ghost xs" data-qclose><i class="i i-x"></i></button></div>
    ${it ? `<div class="q-label">Tocando agora</div>${qRow(it, -1, true)}` : `<div class="faint pad">Nada tocando.</div>`}
    ${next.length ? `<div class="q-label">A seguir · ${next.length}</div>${next.slice(0, 200).map((n) => qRow(n.item, n.pos)).join("")}` : it ? `<div class="faint pad">Fim da fila.</div>` : ""}`;
  $("[data-qclose]").onclick = () => $("#queueBtn").click();
  $$("#queue [data-qpos]").forEach((r) => {
    r.ondblclick = () => Player.jump(Number(r.dataset.qpos));
    const x = r.querySelector("[data-qrm]"); if (x) x.onclick = (e) => { e.stopPropagation(); Player.removeAt(Number(r.dataset.qpos)); };
  });
}
const qRow = (it, pos, now) => `<div class="q-row ${now ? "now" : ""}" data-qpos="${pos}" title="${now ? "" : "Duplo clique para tocar"}">${coverHtml(it.cover, "xs")}<div class="tt"><b>${esc(it.title)}</b><span>${esc(it.artist || "")}</span></div>${now ? "" : `<button class="btn icon ghost xs" data-qrm title="Tirar da fila"><i class="i i-x"></i></button>`}</div>`;

// ---------------------------------------------------------------- equalizador
function openEq() {
  openModal(`<div class="eq-top"><h3>Equalizador</h3><label class="swl"><span class="switch"><input type="checkbox" id="eqOn" ${Player.state.eqOn ? "checked" : ""}><span></span></span>Ligado</label></div>
    <div class="chips eq-presets" id="eqPresets"></div><div class="eq-bands" id="eqBands"></div>
    <p class="faint">Mexa nas barras para reforçar (para cima) ou diminuir (para baixo) os graves, médios e agudos.</p>
    <div class="modal-actions"><button class="btn primary" data-y>Pronto</button></div>`, "eq-box");
  renderEqBody();
  $("#eqOn").onchange = (e) => Player.setEqOn(e.target.checked);
  box.querySelector("[data-y]").onclick = closeModal;
}
function renderEqBody() {
  const st = Player.state;
  $("#eqPresets").innerHTML = Object.keys(Player.PRESETS).map((n) => `<button class="chip ${st.eqName === n ? "active" : ""}" data-pre="${esc(n)}">${esc(n)}</button>`).join("");
  $$("#eqPresets [data-pre]").forEach((b) => (b.onclick = () => Player.setEq(Player.PRESETS[b.dataset.pre], b.dataset.pre)));
  if ($("#eqBands").childElementCount) { $$("#eqBands input").forEach((r, i) => { r.value = st.eq[i]; r.nextElementSibling.textContent = (st.eq[i] > 0 ? "+" : "") + st.eq[i]; }); return; }
  $("#eqBands").innerHTML = Player.BANDS.map((f, i) => `<div class="band"><input type="range" min="-12" max="12" step="1" value="${st.eq[i]}" data-b="${i}" orient="vertical"><span class="db">${(st.eq[i] > 0 ? "+" : "") + st.eq[i]}</span><span class="hz">${f >= 1000 ? f / 1000 + "k" : f}</span></div>`).join("");
  $$("#eqBands input").forEach((r) => (r.oninput = () => { const v = Player.state.eq.slice(); v[r.dataset.b] = Number(r.value); Player.setEq(v); }));
}

// ---------------------------------------------------------------- barra lateral
function renderSide() {
  $$(".side [data-view]").forEach((b) => b.classList.toggle("active", b.dataset.view === S.view || (S.view === "album" && b.dataset.view === "explore")));
  $("#pls").innerHTML = S.lib.playlists.length ? S.lib.playlists.map((p) => `<button class="pl ${S.view === "pl:" + p.id ? "active" : ""}" data-pl="${p.id}"><i class="i i-list-music"></i><span>${esc(p.name)}</span><em>${p.trackIds.length}</em></button>`).join("")
    : `<div class="faint pad">Crie playlists com o <b>+</b> acima ou arraste músicas para cá.</div>`;
  $$("#pls [data-pl]").forEach((b) => {
    b.onclick = () => go("pl:" + b.dataset.pl);
    b.ondragover = (e) => { if (e.dataTransfer.types.includes("text/x-track")) { e.preventDefault(); b.classList.add("drop"); } };
    b.ondragleave = () => b.classList.remove("drop");
    b.ondrop = guard(async (e) => { e.preventDefault(); b.classList.remove("drop"); const ids = JSON.parse(e.dataTransfer.getData("text/x-track")); await addToPlaylist(b.dataset.pl, ids); });
  });
}
$$(".side [data-view]").forEach((b) => (b.onclick = () => go(b.dataset.view)));
$("#newPl").onclick = guard(async () => { const n = await ask("Nova playlist", "Nome", "Minha playlist", "Criar"); if (n) { const p = await call("playlist-create", n); go("pl:" + p.id); } });
$("#importPl").onclick = guard(async () => { const p = await call("playlist-import"); if (p) { toast(`Playlist "${p.name}" importada com ${plural(p.trackIds.length, "música", "músicas")}`, "ok"); go("pl:" + p.id); } });
async function addToPlaylist(plId, ids) {
  const p = S.lib.playlists.find((x) => x.id === plId); if (!p) return;
  const fresh = ids.filter((id) => !p.trackIds.includes(id));
  await call("playlist-update", plId, { add: fresh });
  toast(fresh.length ? `Adicionada${fresh.length > 1 ? "s" : ""} a "${p.name}"` : `Já estava em "${p.name}"`, fresh.length ? "ok" : "");
}
function go(view) { S.view = view; hideMenu(); renderSide(); render(); $("#content").scrollTop = 0; if (view === "explore" && !S.ex.searched) search(); }

// ---------------------------------------------------------------- telas
function render() {
  const v = S.view;
  const html = v === "explore" ? explore() : v === "album" ? albumView() : v === "library" ? library() : v === "liked" ? liked() : v === "credits" ? credits() : v.startsWith("pl:") ? playlistView(v.slice(3)) : "";
  // a biblioteca muda sozinha (downloads, contagem de vezes tocadas): mantém rolagem e o campo em que a pessoa digita
  const c = $("#content"), top = c.scrollTop, fid = document.activeElement && c.contains(document.activeElement) ? document.activeElement.id : "";
  const sel = fid && document.activeElement.selectionStart;
  c.innerHTML = html;
  bind();
  c.scrollTop = top;
  if (fid && $("#" + fid)) { const f = $("#" + fid); f.focus(); if (sel != null && f.setSelectionRange) f.setSelectionRange(sel, sel); }
}

// ---- descobrir
function explore() {
  const e = S.ex;
  return `<section class="hero">
      <div class="hero-text"><h1>Música livre para baixar</h1><p>Milhares de músicas de artistas que liberam o download de graça (Creative Commons e domínio público). Ouça antes, baixe com um clique e use os créditos quando precisar.</p></div>
      <form class="searchbar" id="sform"><i class="i i-search"></i><input id="q" placeholder="Procure um estilo, clima, instrumento ou artista (em inglês acha mais)" value="${esc(e.q)}" autocomplete="off"><button class="btn primary">Buscar</button></form>
      <div class="opts">
        <div class="seg" id="srcSeg">${Object.entries(SOURCES).map(([k, [n, d]]) => `<button class="${e.source === k ? "active" : ""}" data-src="${k}" title="${esc(d)}">${esc(n)}</button>`).join("")}</div>
        <label class="swl" title="Mostra só músicas que a licença deixa usar em vídeos do YouTube, TikTok etc. (dando o crédito)"><span class="switch"><input type="checkbox" id="videoOnly" ${e.videoOnly ? "checked" : ""} ${e.source === "ccmixter" ? "disabled" : ""}><span></span></span>Só as que posso usar em vídeos</label>
      </div>
      <div class="chips">${GENRES.map(([n, q]) => `<button class="chip ${e.q === q ? "active" : ""}" data-genre="${esc(q)}">${esc(n)}</button>`).join("")}</div>
    </section>
    <section class="results">${results()}</section>`;
}
function results() {
  const e = S.ex;
  if (e.loading && !e.items.length && !e.albums.length) return `<div class="loading"><span class="spin"></span><div><b>Procurando em ${esc(SOURCES[e.source][0])}...</b><span class="faint">As fontes abertas às vezes levam alguns segundos.</span></div></div>`;
  if (e.error) return `<div class="empty-box"><i class="i i-globe"></i><b>Não deu para buscar agora</b><span>${esc(e.error)}</span><button class="btn" data-act="retry"><i class="i i-refresh-cw"></i>Tentar de novo</button></div>`;
  if (!e.searched) return "";
  const list = e.source === "archive" ? e.albums : e.items;
  if (!list.length) return `<div class="empty-box"><i class="i i-search"></i><b>Nada encontrado</b><span>Tente outras palavras (em inglês costuma achar mais) ou outra fonte.</span></div>`;
  const more = e.page < e.pages ? `<div class="more"><button class="btn" data-act="more" ${e.loading ? "disabled" : ""}>${e.loading ? `<span class="spin"></span>` : `<i class="i i-chevron-down"></i>`}Carregar mais</button></div>` : "";
  if (e.source === "archive") return `<div class="grid">${e.albums.map(albumCard).join("")}</div>${more}`;
  return `<div class="rlist">${e.items.map(resultRow).join("")}</div>${more}`;
}
const licBadge = (x) => x.videoOk ? `<span class="lic ok" title="${esc(x.licenseName)}: pode usar em vídeos e projetos, dando o crédito"><i class="i i-badge-check"></i>${esc(x.license)}</span>`
  : `<span class="lic" title="${esc(x.licenseName)}: grátis para ouvir e compartilhar${/NC/.test(x.license) ? "; não pode usar para ganhar dinheiro" : ""}${/ND/.test(x.license) ? "; não pode modificar nem usar como trilha" : ""}">${esc(x.license)}</span>`;
const albumCard = (a) => `<button class="acard" data-album="${esc(a.id)}">${coverHtml(a.cover, "lg")}<b>${esc(a.title)}</b><span>${esc(a.artist || "")}${a.year ? " · " + esc(a.year) : ""}</span>${licBadge(a)}</button>`;
function resultRow(x) {
  const t = byRemote(x.id), it = Player.current(), on = it && (it.key === "r:" + x.id || (t && it.key === "t:" + t.id)), pct = S.dl.get(x.id);
  const dl = t ? `<button class="btn sm ghost done" data-act="dl-show" title="Já está na sua biblioteca"><i class="i i-circle-check"></i>Baixada</button>`
    : pct != null ? `<div class="dlp" title="Baixando"><div style="width:${Math.round(pct * 100)}%"></div><span>${Math.round(pct * 100)}%</span></div>`
    : `<button class="btn sm" data-act="dl"><i class="i i-download"></i>Baixar</button>`;
  return `<div class="rrow ${on ? "playing" : ""}" data-rid="${esc(x.id)}">
    <button class="cbtn" data-act="rplay" title="Ouvir">${coverHtml(x.cover)}<span class="ov"><i class="i i-${on && Player.playing ? "pause" : "play"}"></i></span></button>
    <div class="tt"><b>${esc(x.title)}</b><span>${esc(x.artist)}${x.album ? ` · ${esc(x.album)}` : ""}</span></div>
    <div class="tags">${(x.genres || []).slice(0, 3).map((g) => `<span>${esc(g)}</span>`).join("")}</div>
    ${licBadge(x)}<span class="dur">${x.duration ? tm(x.duration) : ""}</span>${dl}
    <button class="btn icon ghost xs" data-act="rmenu"><i class="i i-ellipsis-vertical"></i></button></div>`;
}
function albumView() {
  if (!S.album) return `<div class="loading"><span class="spin"></span><b>Abrindo o álbum...</b></div>`;
  const { album: a, tracks } = S.album;
  const done = tracks.filter((x) => byRemote(x.id)).length;
  return `<button class="btn ghost sm back" data-act="back"><i class="i i-chevron-right flip"></i>Voltar</button>
    <section class="phead">${coverHtml(a.cover, "xl")}<div class="ph-text"><span class="kind">Álbum · Internet Archive</span><h1>${esc(a.title)}</h1>
      <p>${esc(a.artist || "")}${a.year ? " · " + esc(a.year) : ""} · ${plural(tracks.length, "música", "músicas")} · ${total(tracks)} · ${licBadge(a)}</p>
      <div class="ph-acts"><button class="btn primary" data-act="aplay" ${tracks.length ? "" : "disabled"}><i class="i i-play"></i>Ouvir</button>
      <button class="btn" data-act="adl" ${!tracks.length || done === tracks.length ? "disabled" : ""}><i class="i i-download"></i>${done === tracks.length && tracks.length ? "Álbum baixado" : done ? `Baixar o resto (${tracks.length - done})` : "Baixar o álbum"}</button>
      <a class="btn ghost" href="${esc(a.pageUrl)}" target="_blank"><i class="i i-external-link"></i>Página</a></div></div></section>
    ${tracks.length ? `<div class="rlist">${tracks.map(resultRow).join("")}</div>` : `<div class="empty-box"><i class="i i-disc-3"></i><b>Este álbum não tem MP3 para baixar</b></div>`}`;
}

// ---- biblioteca
function trackTable(list, { playlist } = {}) {
  if (!list.length) return "";
  const it = Player.current();
  return `<div class="tlist">${list.map((t, i) => {
    const on = it && it.key === "t:" + t.id;
    return `<div class="trow ${on ? "playing" : ""} ${t.missing ? "missing" : ""}" data-tid="${t.id}" draggable="true" title="${t.missing ? "Arquivo não encontrado: " + esc(t.path) : "Duplo clique para tocar"}">
      <span class="num"><em>${i + 1}</em><button class="ib" data-act="tplay"><i class="i i-${on && Player.playing ? "pause" : "play"}"></i></button></span>
      ${coverHtml(t.coverSrc, "sm")}<div class="tt"><b>${esc(t.title)}</b><span>${esc(t.artist || "Artista desconhecido")}</span></div>
      <span class="alb">${esc(t.album || "")}</span>
      <span class="org">${t.origin === "download" ? licBadge(t) : `<span class="lic own"><i class="i i-folder-open"></i>Sua</span>`}</span>
      <button class="ib heart ${t.liked ? "on" : ""}" data-act="like" title="${t.liked ? "Descurtir" : "Curtir"}"><i class="i i-heart"></i></button>
      <span class="dur">${t.duration ? tm(t.duration) : ""}</span>
      ${playlist ? `<button class="ib" data-act="plrm" title="Tirar da playlist"><i class="i i-minus"></i></button>` : ""}
      <button class="ib" data-act="tmenu"><i class="i i-ellipsis-vertical"></i></button></div>`;
  }).join("")}</div>`;
}
function libList() {
  const f = S.libF, q = f.q.toLowerCase();
  let list = S.lib.tracks.filter((t) => (f.origin === "all" || t.origin === f.origin) && (!q || `${t.title} ${t.artist} ${t.album}`.toLowerCase().includes(q)));
  const by = { added: (a, b) => (b.addedAt || "").localeCompare(a.addedAt || ""), title: (a, b) => a.title.localeCompare(b.title, "pt-BR"), artist: (a, b) => (a.artist || "").localeCompare(b.artist || "", "pt-BR") || a.title.localeCompare(b.title, "pt-BR"), plays: (a, b) => (b.plays || 0) - (a.plays || 0) };
  return list.slice().sort(by[f.sort]);
}
function library() {
  const all = S.lib.tracks, list = libList(), f = S.libF;
  const n = { all: all.length, download: all.filter((t) => t.origin === "download").length, local: all.filter((t) => t.origin === "local").length };
  return `<section class="lhead"><div><h1>Biblioteca</h1><p class="muted">${plural(all.length, "música", "músicas")} · ${total(all)}</p></div><div class="grow"></div>
      <button class="btn" data-act="addfiles"><i class="i i-file-music"></i>Adicionar músicas</button>
      <button class="btn" data-act="addfolder"><i class="i i-folder-plus"></i>Adicionar pasta</button></section>
    <div class="lbar"><div class="seg">${[["all", "Todas"], ["download", "Baixadas"], ["local", "Minhas"]].map(([k, l]) => `<button class="${f.origin === k ? "active" : ""}" data-origin="${k}">${l} <em>${n[k]}</em></button>`).join("")}</div>
      <div class="search mini"><i class="i i-search"></i><input id="libQ" placeholder="Filtrar" value="${esc(f.q)}"></div>
      <select id="libSort">${[["added", "Mais recentes"], ["title", "Nome"], ["artist", "Artista"], ["plays", "Mais tocadas"]].map(([k, l]) => `<option value="${k}" ${f.sort === k ? "selected" : ""}>${l}</option>`).join("")}</select>
      <div class="grow"></div>
      <button class="btn sm ghost" data-act="playall" ${list.length ? "" : "disabled"}><i class="i i-play"></i>Tocar</button>
      <button class="btn sm ghost" data-act="shuffleall" ${list.length ? "" : "disabled"}><i class="i i-shuffle"></i>Aleatório</button></div>
    <div id="libRows">${list.length ? trackTable(list) : all.length ? `<div class="empty-box"><i class="i i-search"></i><b>Nada com esse filtro</b></div>` : emptyLib()}</div>
    <p class="folder faint"><i class="i i-folder-open"></i>As músicas baixadas ficam em <a href="#" data-act="openfolder">${esc(S.lib.folder)}</a> · <a href="#" data-act="choosefolder">mudar</a></p>`;
}
const emptyLib = () => `<div class="empty-box big"><i class="i i-headphones"></i><b>Sua biblioteca está vazia</b><span>Baixe músicas livres em <b>Descobrir</b> ou adicione as músicas que você já tem no computador (MP3, M4A, FLAC, OGG, WAV...).</span>
  <div class="row"><button class="btn primary" data-act="goexplore"><i class="i i-compass"></i>Descobrir músicas</button><button class="btn" data-act="addfolder"><i class="i i-folder-plus"></i>Adicionar uma pasta</button></div></div>`;
function liked() {
  const list = S.lib.tracks.filter((t) => t.liked);
  return `<section class="phead">${`<div class="cover xl liked-cover"><i class="i i-heart"></i></div>`}<div class="ph-text"><span class="kind">Playlist</span><h1>Curtidas</h1><p>${plural(list.length, "música", "músicas")} · ${total(list)}</p>
      <div class="ph-acts"><button class="btn primary" data-act="playall" ${list.length ? "" : "disabled"}><i class="i i-play"></i>Tocar</button><button class="btn" data-act="shuffleall" ${list.length ? "" : "disabled"}><i class="i i-shuffle"></i>Aleatório</button></div></div></section>
    ${list.length ? trackTable(list) : `<div class="empty-box"><i class="i i-heart"></i><b>Nenhuma curtida ainda</b><span>Clique no coração das músicas que você mais gosta.</span></div>`}`;
}
function plCover(list) {
  const c = [...new Set(list.map((t) => t.coverSrc).filter(Boolean))].slice(0, 4);
  if (c.length >= 4) return `<div class="cover xl mosaic">${c.map((s) => `<img class="ci" src="${esc(s)}" alt="">`).join("")}</div>`;
  return coverHtml(c[0], "xl");
}
const plTracks = (p) => p.trackIds.map(byId).filter(Boolean);
function playlistView(id) {
  const p = S.lib.playlists.find((x) => x.id === id);
  if (!p) return `<div class="empty-box"><b>Playlist não encontrada</b></div>`;
  const list = plTracks(p);
  return `<section class="phead">${plCover(list)}<div class="ph-text"><span class="kind">Playlist</span><h1>${esc(p.name)}</h1><p>${plural(list.length, "música", "músicas")} · ${total(list)}</p>
      <div class="ph-acts"><button class="btn primary" data-act="playall" ${list.length ? "" : "disabled"}><i class="i i-play"></i>Tocar</button><button class="btn" data-act="shuffleall" ${list.length ? "" : "disabled"}><i class="i i-shuffle"></i>Aleatório</button>
      <button class="btn ghost" data-act="plrename"><i class="i i-pencil"></i>Renomear</button><button class="btn ghost" data-act="plexport" ${list.length ? "" : "disabled"}><i class="i i-upload"></i>Exportar</button><button class="btn ghost danger" data-act="pldelete"><i class="i i-trash-2"></i>Apagar</button></div></div></section>
    ${list.length ? trackTable(list, { playlist: true }) + `<p class="faint center">Arraste as músicas para mudar a ordem.</p>` : `<div class="empty-box"><i class="i i-list-plus"></i><b>Playlist vazia</b><span>Use o menu <b>⋮</b> de uma música (ou arraste a música para o nome da playlist ao lado) para adicionar.</span></div>`}`;
}
function credits() {
  const list = S.lib.tracks.filter((t) => t.origin === "download");
  return `<section class="lhead"><div><h1>Créditos</h1><p class="muted">As músicas livres pedem que você dê o crédito ao autor quando usar (por exemplo na descrição de um vídeo). Copie daqui.</p></div><div class="grow"></div>
      <button class="btn" data-act="copyall" ${list.length ? "" : "disabled"}><i class="i i-copy"></i>Copiar todos</button></section>
    <div class="legend"><div><span class="lic ok"><i class="i i-badge-check"></i>CC BY / BY-SA / CC0</span> pode usar em vídeos e projetos, até para ganhar dinheiro, dando o crédito (BY-SA: o projeto tem que manter a mesma licença).</div>
      <div><span class="lic">CC BY-NC</span> grátis, mas não pode usar em nada que dê dinheiro (vídeo monetizado, anúncio, venda).</div>
      <div><span class="lic">CC BY-ND</span> só para ouvir e compartilhar como está: não pode virar trilha de vídeo nem ser editada.</div></div>
    ${list.length ? `<div class="credits">${list.map((t) => `<div class="cred" data-tid="${t.id}">${coverHtml(t.coverSrc, "sm")}<div class="tt"><b>${esc(t.title)} · ${esc(t.artist)}</b><code>${esc(t.attribution)}</code>
      <span class="links">${licBadge(t)}${t.licenseUrl ? `<a href="${esc(t.licenseUrl)}" target="_blank">Ler a licença</a>` : ""}${t.pageUrl ? `<a href="${esc(t.pageUrl)}" target="_blank">Página da música</a>` : ""}</span></div>
      <button class="btn sm" data-act="copy"><i class="i i-copy"></i>Copiar</button></div>`).join("")}</div>`
    : `<div class="empty-box"><i class="i i-creative-commons"></i><b>Nenhuma música baixada ainda</b><span>Os créditos das músicas que você baixar aparecem aqui.</span></div>`}`;
}

// atualiza só as linhas (download, tocando) sem perder a rolagem
function refreshRows() {
  if (S.view === "explore" || S.view === "album") {
    $$(".rrow").forEach((r) => { const list = S.view === "album" ? S.album && S.album.tracks : S.ex.items; const x = list && list.find((i) => i.id === r.dataset.rid); if (x) { r.outerHTML = resultRow(x); } });
    if (S.view === "album") { const h = $(".phead"); if (h && S.album) { const tmp = document.createElement("div"); tmp.innerHTML = albumView(); h.replaceWith(tmp.querySelector(".phead")); } }
    bind();
  } else {
    const it = Player.current();
    $$(".trow").forEach((r) => { const on = it && it.key === "t:" + r.dataset.tid; r.classList.toggle("playing", !!on); const b = r.querySelector("[data-act=tplay] i"); if (b) b.className = `i i-${on && Player.playing ? "pause" : "play"}`; });
  }
}

// ---------------------------------------------------------------- busca
let searchSeq = 0;
async function search(more = false) {
  const e = S.ex, my = ++searchSeq;
  if (!more) { e.page = 1; e.items = []; e.albums = []; if (!e.q) e.q = "chill"; }
  e.loading = true; e.error = ""; e.searched = true; if (S.view === "explore") render();
  try {
    const r = await call("search", e.source, e.q, { page: e.page, videoOnly: e.videoOnly });
    if (my !== searchSeq) return;
    e.pages = r.pages || 1;
    if (e.source === "archive") e.albums.push(...r.albums); else e.items.push(...r.items.filter((x) => !e.items.some((y) => y.id === x.id)));
  } catch (err) { if (my === searchSeq) e.error = err.message; }
  if (my !== searchSeq) return;
  e.loading = false; if (S.view === "explore") render();
}
async function openAlbum(id) {
  S.album = null; S.view = "album"; renderSide(); render(); $("#content").scrollTop = 0;
  try { S.album = await call("album", id); } catch (e) { toast(e.message, "err"); S.view = "explore"; }
  render();
}
async function download(x) {
  if (S.dl.has(x.id) || byRemote(x.id)) return;
  if (!x.videoOk && !S.prefs.ncNoticeSeen) {
    S.prefs.ncNoticeSeen = true; call("prefs", { ncNoticeSeen: true }).catch(() => {});
    toast(`"${x.title}" é ${x.license}: grátis para ouvir, mas veja em Créditos o que essa licença permite.`, "info");
  }
  S.dl.set(x.id, 0); refreshRows();
  try { await call("download", x); toast(`"${x.title}" baixada`, "ok"); } catch { S.dl.delete(x.id); refreshRows(); }
}

// ---------------------------------------------------------------- cliques
function trackMenu(anchor, t, ctx = {}) {
  const pls = S.lib.playlists;
  showMenu(anchor, [
    { label: "Tocar em seguida", icon: "list-plus", fn: () => { Player.playNext([libItem(t)]); toast("Vai tocar em seguida"); } },
    { label: "Adicionar à fila", icon: "list-music", fn: () => { Player.enqueue([libItem(t)]); toast("Adicionada à fila"); } },
    "-", { head: "Adicionar à playlist" },
    ...pls.slice(0, 12).map((p) => ({ label: p.name, icon: "list-music", fn: () => addToPlaylist(p.id, [t.id]) })),
    { label: "Nova playlist...", icon: "plus", fn: async () => { const n = await ask("Nova playlist", "Nome", t.artist || "Minha playlist", "Criar"); if (n) { await call("playlist-create", n, [t.id]); toast(`Playlist "${n}" criada`, "ok"); } } },
    "-",
    { label: "Editar informações", icon: "pencil", fn: () => editTrack(t) },
    { label: "Mostrar no Explorer", icon: "folder-open", fn: () => call("show-item", t.path) },
    ...(t.pageUrl ? [{ label: "Abrir a página da música", icon: "external-link", fn: () => window.open(t.pageUrl) }] : []),
    ...(t.attribution ? [{ label: "Copiar crédito", icon: "copy", fn: () => copy(t.attribution) }] : []),
    "-",
    ...(ctx.playlist ? [{ label: "Tirar desta playlist", icon: "minus", fn: () => call("playlist-update", ctx.playlist, { remove: [t.id] }) }] : []),
    { label: "Remover da biblioteca", icon: "trash-2", danger: true, fn: () => removeTracks([t]) },
  ]);
}
async function removeTracks(list) {
  const dl = list.filter((t) => t.origin === "download");
  const text = dl.length ? `Tira da biblioteca e de todas as playlists. A música baixada também é apagada do computador.` : `Tira da biblioteca e de todas as playlists. O arquivo continua no seu computador.`;
  if (!(await confirmBox(list.length === 1 ? `Remover "${list[0].title}"?` : `Remover ${list.length} músicas?`, text, "Remover", true))) return;
  await call("tracks-remove", list.map((t) => t.id), true);
}
function editTrack(t) {
  openModal(`<h3>Editar informações</h3><div class="form">
    <label class="field"><span>Nome</span><input id="etT" maxlength="120" value="${esc(t.title)}"></label>
    <label class="field"><span>Artista</span><input id="etA" maxlength="120" value="${esc(t.artist)}"></label>
    <label class="field"><span>Álbum</span><input id="etL" maxlength="120" value="${esc(t.album)}"></label></div>
    <p class="faint">Muda só como aparece aqui no Piphin Música (o arquivo não é alterado).</p>
    <div class="modal-actions"><button class="btn" data-n>Cancelar</button><button class="btn primary" data-y>Salvar</button></div>`);
  box.querySelector("[data-n]").onclick = closeModal;
  box.querySelector("[data-y]").onclick = guard(async () => { await call("track-update", t.id, { title: $("#etT").value.trim() || t.title, artist: $("#etA").value.trim(), album: $("#etL").value.trim() }); closeModal(); });
}
async function copy(text) {
  try { await navigator.clipboard.writeText(text); } catch { const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove(); }
  toast("Copiado", "ok");
}
const viewTracks = () => S.view === "library" ? libList() : S.view === "liked" ? S.lib.tracks.filter((t) => t.liked) : S.view.startsWith("pl:") ? plTracks(S.lib.playlists.find((p) => p.id === S.view.slice(3)) || { trackIds: [] }) : [];

function bind() {
  const c = $("#content");
  const sf = $("#sform"); if (sf) sf.onsubmit = (e) => { e.preventDefault(); S.ex.q = $("#q").value.trim(); search(); };
  $$("[data-src]", c).forEach((b) => (b.onclick = () => { S.ex.source = b.dataset.src; if (b.dataset.src === "ccmixter") S.ex.videoOnly = false; S.ex.q = $("#q").value.trim() || S.ex.q; search(); }));
  $$("[data-genre]", c).forEach((b) => (b.onclick = () => { S.ex.q = b.dataset.genre; search(); }));
  const vo = $("#videoOnly"); if (vo) vo.onchange = () => { S.ex.videoOnly = vo.checked; search(); };
  $$("[data-origin]", c).forEach((b) => (b.onclick = () => { S.libF.origin = b.dataset.origin; render(); }));
  const lq = $("#libQ"); if (lq) lq.oninput = () => { S.libF.q = lq.value; const list = libList(); $("#libRows").innerHTML = list.length ? trackTable(list) : `<div class="empty-box"><i class="i i-search"></i><b>Nada com esse filtro</b></div>`; bindRows(); };
  const ls = $("#libSort"); if (ls) ls.onchange = () => { S.libF.sort = ls.value; render(); };
  bindRows();
}
function bindRows() {
  const c = $("#content");
  // arrastar: para uma playlist ao lado, ou para mudar a ordem dentro da playlist
  $$(".trow", c).forEach((r) => {
    r.ondragstart = (e) => { e.dataTransfer.setData("text/x-track", JSON.stringify([r.dataset.tid])); e.dataTransfer.effectAllowed = "copyMove"; r.classList.add("dragging"); };
    r.ondragend = () => r.classList.remove("dragging");
    if (S.view.startsWith("pl:")) {
      r.ondragover = (e) => { if (!e.dataTransfer.types.includes("text/x-track")) return; e.preventDefault(); const after = e.offsetY > r.offsetHeight / 2; r.classList.toggle("drop-a", after); r.classList.toggle("drop-b", !after); };
      r.ondragleave = () => r.classList.remove("drop-a", "drop-b");
      r.ondrop = guard(async (e) => {
        e.preventDefault(); const after = r.classList.contains("drop-a"); r.classList.remove("drop-a", "drop-b");
        const [id] = JSON.parse(e.dataTransfer.getData("text/x-track")); const p = S.lib.playlists.find((x) => x.id === S.view.slice(3));
        if (!p || id === r.dataset.tid) return;
        const ids = p.trackIds.filter((x) => x !== id); ids.splice(ids.indexOf(r.dataset.tid) + (after ? 1 : 0), 0, id);
        await call("playlist-update", p.id, { trackIds: ids });
      });
    }
    r.ondblclick = (e) => { if (!e.target.closest("button")) playTracks(viewTracks(), r.dataset.tid); };
    r.oncontextmenu = (e) => { e.preventDefault(); const t = byId(r.dataset.tid); if (t) trackMenu({ x: e.clientX, y: e.clientY }, t, { playlist: S.view.startsWith("pl:") ? S.view.slice(3) : null }); };
  });
}
$("#content").addEventListener("click", guard(async (e) => {
  const a = e.target.closest("[data-act], [data-album]"); if (!a) return;
  if (a.tagName === "A" && a.dataset.act) e.preventDefault();
  if (a.dataset.album) return openAlbum(a.dataset.album.slice(3));
  const act = a.dataset.act, row = a.closest("[data-tid], [data-rid]");
  const t = row && row.dataset.tid ? byId(row.dataset.tid) : null;
  const rlist = S.view === "album" ? (S.album ? S.album.tracks : []) : S.ex.items;
  const x = row && row.dataset.rid ? rlist.find((i) => i.id === row.dataset.rid) : null;
  switch (act) {
    case "retry": return search();
    case "more": S.ex.page++; return search(true);
    case "back": S.view = "explore"; renderSide(); return render();
    case "rplay": {
      const it = Player.current();
      if (it && (it.key === "r:" + x.id || (byRemote(x.id) && it.key === "t:" + byRemote(x.id).id))) return Player.toggle();
      return Player.playList(rlist.map(remoteItem), rlist.indexOf(x));
    }
    case "dl": return download(x);
    case "dl-show": { const lt = byRemote(x.id); S.libF = { origin: "all", q: lt ? lt.title : "", sort: "added" }; return go("library"); }
    case "rmenu": return showMenu(a, [
      { label: "Ouvir", icon: "play", fn: () => Player.playList(rlist.map(remoteItem), rlist.indexOf(x)) },
      { label: "Adicionar à fila", icon: "list-music", fn: () => { Player.enqueue([remoteItem(x)]); toast("Adicionada à fila"); } },
      { label: "Baixar", icon: "download", fn: () => download(x) },
      ...(x.pageUrl ? [{ label: "Abrir a página da música", icon: "external-link", fn: () => window.open(x.pageUrl) }] : []),
      ...(x.licenseUrl ? [{ label: "Ler a licença", icon: "scroll-text", fn: () => window.open(x.licenseUrl) }] : []),
      { label: "Copiar crédito", icon: "copy", fn: () => copy(x.attribution || `"${x.title}" de ${x.artist}, ${x.license}`) },
    ]);
    case "aplay": return Player.playList(S.album.tracks.map(remoteItem), 0);
    case "adl": { for (const tr of S.album.tracks) if (!byRemote(tr.id)) await download(tr); return; }
    case "tplay": { const it = Player.current(); if (it && it.key === "t:" + t.id) return Player.toggle(); return playTracks(viewTracks(), t.id); }
    case "like": return call("track-update", t.id, { liked: !t.liked });
    case "tmenu": return trackMenu(a, t, { playlist: S.view.startsWith("pl:") ? S.view.slice(3) : null });
    case "plrm": return call("playlist-update", S.view.slice(3), { remove: [t.id] });
    case "playall": return playTracks(viewTracks(), null, { shuffle: false });
    case "shuffleall": return playTracks(viewTracks(), null, { shuffle: true });
    case "addfiles": { const ids = await call("import-files"); if (ids.length) toast(`${plural(ids.length, "música adicionada", "músicas adicionadas")}`, "ok"); return; }
    case "addfolder": { toast("Procurando músicas na pasta..."); const ids = await call("import-folder"); toast(ids.length ? `${plural(ids.length, "música adicionada", "músicas adicionadas")}` : "Nenhuma música nova nessa pasta", ids.length ? "ok" : ""); if (S.view !== "library") go("library"); return; }
    case "openfolder": return call("open-folder");
    case "choosefolder": { const f = await call("choose-folder"); if (f) { S.lib.folder = f; render(); toast("As próximas músicas baixadas vão para essa pasta", "ok"); } return; }
    case "goexplore": return go("explore");
    case "plrename": { const p = S.lib.playlists.find((y) => y.id === S.view.slice(3)); const n = await ask("Renomear playlist", "Nome", p.name); if (n) await call("playlist-update", p.id, { name: n }); return; }
    case "plexport": { const f = await call("playlist-export", S.view.slice(3)); if (f) toast("Playlist exportada (.m3u8): abre em outros players também", "ok"); return; }
    case "pldelete": { const p = S.lib.playlists.find((y) => y.id === S.view.slice(3)); if (await confirmBox(`Apagar "${p.name}"?`, "Só a playlist é apagada; as músicas continuam na biblioteca.", "Apagar", true)) { await call("playlist-delete", p.id); go("library"); } return; }
    case "copy": return copy(t.attribution);
    case "copyall": return copy(S.lib.tracks.filter((y) => y.origin === "download").map((y) => y.attribution).join("\n"));
  }
}));

// ---------------------------------------------------------------- IA (ferramentas do module.json)
const AI = {
  async play_music(a) {
    let list = S.lib.tracks.filter((t) => !t.missing), what = "a biblioteca";
    if (a.playlist) { const p = S.lib.playlists.find((x) => x.name.toLowerCase() === a.playlist.toLowerCase()) || S.lib.playlists.find((x) => x.name.toLowerCase().includes(a.playlist.toLowerCase())); if (!p) throw new Error(`Não existe playlist "${a.playlist}". Playlists: ${S.lib.playlists.map((x) => x.name).join(", ") || "nenhuma"}`); list = plTracks(p); what = `a playlist "${p.name}"`; go("pl:" + p.id); }
    else if (a.liked) { list = list.filter((t) => t.liked); what = "as curtidas"; }
    if (a.query) { const q = a.query.toLowerCase(); list = list.filter((t) => `${t.title} ${t.artist} ${t.album}`.toLowerCase().includes(q)); what = `"${a.query}"`; }
    list = playable(list);
    if (!list.length) throw new Error(S.lib.tracks.length ? "Nenhuma música combina com isso na biblioteca" : "A biblioteca está vazia: use search_music e download_music antes");
    playTracks(list, list[0].id, { shuffle: !!a.shuffle });
    const it = Player.current();
    return { playing: it && { title: it.title, artist: it.artist }, from: what, tracks: list.length };
  },
  async player_control(a) {
    if (a.action === "pause") Player.pause();
    else if (a.action === "resume") await Player.resume();
    else if (a.action === "next") Player.next();
    else if (a.action === "previous") Player.prev();
    else if (a.action === "volume") Player.setVolume((a.volume ?? 80) / 100);
    await new Promise((r) => setTimeout(r, 300));
    const it = Player.current();
    return { playing: Player.playing, track: it ? { title: it.title, artist: it.artist } : null, position: tm(Player.audio.currentTime), duration: tm(Player.audio.duration), volume: Math.round(Player.state.volume * 100), queue_left: Player.upcoming().length };
  },
};
piphin.on("ai-call", async ({ id, name, args }) => {
  try { const data = await AI[name](args || {}); toast(`A IA usou: ${name.replace(/_/g, " ")}`, "info"); piphin.invoke("ai-reply", id, true, data); }
  catch (e) { piphin.invoke("ai-reply", id, false, e.message); }
});
window.addEventListener("beforeunload", () => { piphin.invoke("ui-unload"); Player.pause(); });

// ---------------------------------------------------------------- início
(async () => {
  S.prefs = await call("prefs").catch(() => ({}));
  const p = S.prefs, st = Player.state;
  if (p.volume != null) st.volume = p.volume;
  if (p.shuffle) st.shuffle = true;
  if (p.repeat) st.repeat = p.repeat;
  if (Array.isArray(p.eq)) { st.eq = p.eq; st.eqName = p.eqName || "Personalizado"; }
  if (p.eqOn === false) st.eqOn = false;
  Player.setVolume(st.volume); refreshNow(); refreshTime();
  await loadLib().catch((e) => toast(e.message, "err"));
  go(S.lib.tracks.length ? "library" : "explore");
  piphin.invoke("ui-ready");
})();
