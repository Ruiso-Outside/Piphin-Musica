// Piphin Música · o player: fila, aleatório/repetir, volume, equalizador (Web Audio) e teclas de mídia do Windows.
// Tudo toca por http://127.0.0.1 (arquivos do disco e, antes de baixar, o som dos sites), então o equalizador funciona sempre.
"use strict";
const Player = (() => {
  const audio = new Audio();
  audio.crossOrigin = "anonymous";
  audio.preload = "auto";
  const BANDS = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
  const PRESETS = {
    "Normal": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    "Mais grave": [6, 5, 4, 2, 0, 0, 0, 0, 0, 0],
    "Mais agudo": [0, 0, 0, 0, 0, 1, 2, 4, 5, 6],
    "Voz": [-3, -2, -1, 1, 3, 4, 4, 3, 1, 0],
    "Rock": [5, 4, 2, 0, -1, -1, 1, 3, 4, 5],
    "Pop": [-1, 1, 3, 4, 3, 0, -1, -1, 1, 2],
    "Eletrônica": [6, 5, 2, 0, -2, 1, 0, 2, 4, 5],
    "Clássica": [3, 2, 1, 0, 0, 0, -1, -1, 2, 3],
    "Fone pequeno": [4, 4, 3, 1, 0, 0, 0, 1, 2, 2],
  };
  let ctx = null, filters = [], gain = null;
  const st = { queue: [], order: [], pos: -1, shuffle: false, repeat: "off", volume: 0.8, muted: false, eq: PRESETS.Normal.slice(), eqName: "Normal", eqOn: true, loading: false };
  const listeners = new Set();
  const emit = (what) => listeners.forEach((f) => f(what));

  function graph() {
    if (ctx) return;
    ctx = new AudioContext();
    const srcNode = ctx.createMediaElementSource(audio);
    filters = BANDS.map((f, i) => { const b = ctx.createBiquadFilter(); b.type = i === 0 ? "lowshelf" : i === BANDS.length - 1 ? "highshelf" : "peaking"; b.frequency.value = f; b.Q.value = 1.1; return b; });
    gain = ctx.createGain();
    // limitador leve: o equalizador com reforço não estoura o som
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -3; comp.knee.value = 4; comp.ratio.value = 12; comp.attack.value = 0.003; comp.release.value = 0.15;
    let n = srcNode; for (const f of filters) { n.connect(f); n = f; }
    n.connect(gain); gain.connect(comp); comp.connect(ctx.destination);
    applyEq(); applyVol();
  }
  function applyEq() { filters.forEach((f, i) => (f.gain.value = st.eqOn ? st.eq[i] : 0)); }
  function applyVol() {
    const v = st.muted ? 0 : st.volume * st.volume; // curva mais natural para o ouvido
    if (gain) { gain.gain.value = v; audio.volume = 1; } else audio.volume = v;
  }
  const cur = () => (st.pos >= 0 ? st.queue[st.order[st.pos]] : null);
  function makeOrder(keepIdx) {
    const idx = st.queue.map((_, i) => i);
    if (st.shuffle) {
      for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
      if (keepIdx != null) { idx.splice(idx.indexOf(keepIdx), 1); idx.unshift(keepIdx); }
    }
    st.order = idx;
    st.pos = keepIdx != null ? st.order.indexOf(keepIdx) : -1;
  }
  async function load(play = true) {
    const it = cur(); if (!it) return;
    st.loading = true; emit("track");
    try {
      graph(); if (ctx.state === "suspended") await ctx.resume();
      const src = it.src || (it.resolve ? (it.src = await it.resolve()) : null);
      if (it !== cur()) return; // trocou de música enquanto carregava
      if (!src) throw new Error("Arquivo não encontrado");
      audio.src = src;
      if (play) await audio.play();
      it.onStart && it.onStart();
    } catch (e) { if (it === cur()) { st.loading = false; emit("track"); emit({ error: `Não deu para tocar "${it.title}": ${e.message}` }); } return; }
    st.loading = false; emit("track"); media();
  }
  function media() {
    const it = cur(); if (!("mediaSession" in navigator) || !it) return;
    navigator.mediaSession.metadata = new MediaMetadata({ title: it.title, artist: it.artist || "", album: it.album || "", artwork: it.cover ? [{ src: it.cover, sizes: "512x512" }] : [] });
  }
  if ("mediaSession" in navigator) {
    const ms = navigator.mediaSession;
    ms.setActionHandler("play", () => api.resume());
    ms.setActionHandler("pause", () => api.pause());
    ms.setActionHandler("previoustrack", () => api.prev());
    ms.setActionHandler("nexttrack", () => api.next());
    ms.setActionHandler("seekto", (d) => { audio.currentTime = d.seekTime; });
  }
  audio.addEventListener("ended", () => {
    if (st.repeat === "one") { audio.currentTime = 0; audio.play(); return; }
    if (st.pos < st.order.length - 1) { st.pos++; load(); }
    else if (st.repeat === "all" && st.order.length) { if (st.shuffle) makeOrder(); st.pos = 0; load(); }
    else { emit("state"); emit("ended"); }
  });
  for (const ev of ["play", "pause"]) audio.addEventListener(ev, () => { emit("state"); if ("mediaSession" in navigator) navigator.mediaSession.playbackState = audio.paused ? "paused" : "playing"; });
  audio.addEventListener("timeupdate", () => emit("time"));
  audio.addEventListener("loadedmetadata", () => { emit("time"); const it = cur(); if (it && it.onDuration && isFinite(audio.duration)) it.onDuration(audio.duration); });
  audio.addEventListener("error", () => { const it = cur(); if (it && audio.src) emit({ error: `Não deu para tocar "${it.title}" (arquivo com problema ou sem internet)` }); });

  const api = {
    BANDS, PRESETS, state: st, audio, on: (f) => listeners.add(f), current: cur,
    get playing() { return !audio.paused && !audio.ended; },
    // items: [{ key, title, artist, album, cover, src | resolve(), onStart, onDuration }]
    playList(items, start = 0, { shuffle } = {}) {
      if (!items.length) return;
      st.queue = items.slice(); if (shuffle != null) st.shuffle = shuffle;
      makeOrder(st.shuffle && shuffle ? Math.floor(Math.random() * items.length) : start);
      emit("queue"); load();
    },
    playNext(items) { // "tocar em seguida"
      if (!cur()) return api.playList(items);
      const base = st.queue.length; st.queue.push(...items);
      st.order.splice(st.pos + 1, 0, ...items.map((_, i) => base + i)); emit("queue");
    },
    enqueue(items) {
      if (!cur()) return api.playList(items);
      const base = st.queue.length; st.queue.push(...items); st.order.push(...items.map((_, i) => base + i)); emit("queue");
    },
    jump(p) { if (p >= 0 && p < st.order.length) { st.pos = p; load(); } },
    removeAt(p) {
      if (p === st.pos || p < 0 || p >= st.order.length) return;
      st.order.splice(p, 1); if (p < st.pos) st.pos--; emit("queue");
    },
    upcoming() { return st.order.slice(st.pos + 1).map((i, k) => ({ item: st.queue[i], pos: st.pos + 1 + k })); },
    toggle() { if (!cur()) return; audio.paused ? api.resume() : api.pause(); },
    async resume() { if (!cur()) return; graph(); if (ctx.state === "suspended") await ctx.resume(); if (!audio.src) return load(); await audio.play().catch(() => {}); },
    pause() { audio.pause(); },
    next() { if (st.pos < st.order.length - 1) { st.pos++; load(); } else if (st.repeat === "all" && st.order.length) { st.pos = 0; load(); } },
    prev() { if (audio.currentTime > 3 || st.pos <= 0) { audio.currentTime = 0; return; } st.pos--; load(); },
    seek(frac) { if (isFinite(audio.duration)) audio.currentTime = frac * audio.duration; },
    setShuffle(on) { const keep = st.pos >= 0 ? st.order[st.pos] : null; st.shuffle = on; makeOrder(keep); emit("queue"); emit("state"); },
    cycleRepeat() { st.repeat = { off: "all", all: "one", one: "off" }[st.repeat]; emit("state"); },
    setVolume(v) { st.volume = Math.max(0, Math.min(1, v)); st.muted = false; applyVol(); emit("volume"); },
    toggleMute() { st.muted = !st.muted; applyVol(); emit("volume"); },
    setEq(values, name = "Personalizado") { st.eq = values.slice(); st.eqName = name; applyEq(); emit("eq"); },
    setEqOn(on) { st.eqOn = on; applyEq(); emit("eq"); },
    // a biblioteca mudou: atualiza capa/nome do que está na fila
    patch(key, data) { for (const it of st.queue) if (it.key === key) Object.assign(it, data); if (cur() && cur().key === key) { emit("track"); media(); } },
  };
  return api;
})();
