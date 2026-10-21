// Desenha o ícone do Piphin Música: icons/musica.png (256). Uso: npm run icon (usa o Electron do Piphin Hub).
const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  await win.loadURL("about:blank");
  const b64 = await win.webContents.executeJavaScript(`(() => {
    const s = 256, c = document.createElement("canvas"); c.width = c.height = s;
    const g = c.getContext("2d");
    g.beginPath(); g.roundRect(8, 8, 240, 240, 56);
    const bg = g.createLinearGradient(0, 0, s, s); bg.addColorStop(0, "#3b0a2a"); bg.addColorStop(1, "#0d0a14");
    g.fillStyle = bg; g.fill();
    g.lineWidth = 3; g.strokeStyle = "rgba(236,72,153,.6)"; g.stroke();
    const grad = g.createLinearGradient(60, 210, 200, 50); grad.addColorStop(0, "#db2777"); grad.addColorStop(.55, "#ec4899"); grad.addColorStop(1, "#a855f7");
    // disco atrás
    g.save(); g.globalAlpha = .35; g.strokeStyle = "#f9a8d4"; g.lineWidth = 2;
    for (const r of [92, 78, 64]) { g.beginPath(); g.arc(128, 128, r, -0.4, 1.2); g.stroke(); g.beginPath(); g.arc(128, 128, r, 2.7, 4.3); g.stroke(); }
    g.restore();
    // nota dupla
    g.save(); g.shadowColor = "#ec4899"; g.shadowBlur = 22; g.fillStyle = grad; g.strokeStyle = grad; g.lineCap = "round"; g.lineJoin = "round";
    g.beginPath(); g.ellipse(94, 178, 26, 20, -0.35, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(176, 160, 26, 20, -0.35, 0, Math.PI * 2); g.fill();
    g.lineWidth = 12; g.beginPath(); g.moveTo(116, 172); g.lineTo(116, 72); g.lineTo(198, 56); g.lineTo(198, 154); g.stroke();
    g.lineWidth = 20; g.beginPath(); g.moveTo(116, 82); g.lineTo(198, 66); g.stroke();
    g.restore();
    // seta de download
    g.save(); g.fillStyle = "#fff"; g.shadowColor = "rgba(0,0,0,.5)"; g.shadowBlur = 10;
    g.beginPath(); g.arc(198, 204, 30, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#db2777"; g.beginPath(); g.moveTo(192, 186); g.lineTo(204, 186); g.lineTo(204, 202); g.lineTo(214, 202); g.lineTo(198, 220); g.lineTo(182, 202); g.lineTo(192, 202); g.closePath(); g.fill();
    g.restore();
    return c.toDataURL("image/png").split(",")[1];
  })()`);
  fs.mkdirSync(path.join(__dirname, "..", "icons"), { recursive: true });
  fs.writeFileSync(path.join(__dirname, "..", "icons", "musica.png"), Buffer.from(b64, "base64"));
  console.log("ícone: icons/musica.png");
  app.quit();
});
