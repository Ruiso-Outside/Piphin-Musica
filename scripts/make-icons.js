// Gera web/icons.css: os ícones do editor (Lucide, licença ISC) no mesmo formato do Piphin UI (<i class="i i-brush">).
// O kit do Hub só traz os ícones do próprio Hub; o editor precisa de vários outros (player, playlists, downloads...).
// Usa o lucide-static do Piphin Hub (..\Hub\node_modules) ou deste projeto, se instalado.
const fs = require("fs");
const path = require("path");

const roots = [path.join(__dirname, "..", "node_modules", "lucide-static"), path.join(__dirname, "..", "..", "Hub", "node_modules", "lucide-static")];
const LUCIDE = roots.find((r) => fs.existsSync(path.join(r, "icons")));
if (!LUCIDE) throw new Error("lucide-static não encontrado (rode npm install no Piphin Hub ou aqui)");
const OUT = path.join(__dirname, "..", "web", "icons.css");

const NAMES = `
play pause skip-back skip-forward shuffle repeat repeat-1 volume-2 volume-1 volume-x heart list-music music music-2 disc-3 library search download download-cloud check plus minus x trash-2 pencil folder-open folder-plus file-music upload import list-plus listx grip-vertical sliders-horizontal radio globe external-link info circle-check badge-check copyright creative-commons sparkles headphones clock loader-circle ellipsis-vertical arrow-up-down chevron-right chevron-down house compass star scroll-text copy refresh-cw wand-sparkles bot
`.split(/\s+/).filter(Boolean);

const css = [`/* Piphin Música · ícones (Lucide ${require(path.join(LUCIDE, "package.json")).version}, ISC) · gerado por scripts/make-icons.js */`,
  `.i { display: inline-block; width: 1.15em; height: 1.15em; flex: none; vertical-align: -0.2em; background: currentColor;`,
  `  -webkit-mask: var(--i) center / contain no-repeat; mask: var(--i) center / contain no-repeat; }`];
const missing = [];
for (const name of [...new Set(NAMES)]) {
  const file = path.join(LUCIDE, "icons", name + ".svg");
  if (!fs.existsSync(file)) { missing.push(name); continue; }
  const svg = fs.readFileSync(file, "utf8").replace(/<!--[\s\S]*?-->/g, "").replace(/\s*class="[^"]*"/, "")
    .replace(/stroke="currentColor"/, 'stroke="#000"').replace(/\s+/g, " ").trim();
  css.push(`.i-${name} { --i: url("data:image/svg+xml,${encodeURIComponent(svg).replace(/'/g, "%27")}"); }`);
}
fs.writeFileSync(OUT, css.join("\n") + "\n");
console.log(`ícones: ${new Set(NAMES).size - missing.length} em ${path.relative(process.cwd(), OUT)}` + (missing.length ? ` · faltam no Lucide: ${missing.join(", ")}` : ""));
