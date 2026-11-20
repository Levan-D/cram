// Renders the app icon SVG to assets/icon.png (256×256) using Electron's own Chromium.
// Run with: npm run icon. electron-builder converts the PNG to .ico for the Windows exe.
import { app, BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SIZE = 256;

// "Cram": an overstuffed notebook (pages bulging, sheets and sticky tabs poking out, an elastic
// band holding it shut) on the app's blue tile, in the app's orange accent.
const sheet = (x, y, rot) => `
    <g transform="rotate(${rot} ${x + 50} ${y + 60})" filter="url(#sheet-shadow)">
      <rect x="${x}" y="${y}" width="100" height="120" rx="6" fill="#ffffff"/>
      <rect x="${x + 14}" y="${y + 16}" width="56" height="6" rx="3" fill="#9fb3dc"/>
      <rect x="${x + 14}" y="${y + 30}" width="70" height="6" rx="3" fill="#c9d5ee"/>
    </g>`;

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 256 256">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#5b84d6"/>
      <stop offset="1" stop-color="#2c4f9c"/>
    </linearGradient>
    <linearGradient id="cover" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f7b552"/>
      <stop offset="1" stop-color="#e08a1e"/>
    </linearGradient>
    <linearGradient id="pages" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#fffdf6"/>
      <stop offset="1" stop-color="#efe8d6"/>
    </linearGradient>
    <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="6" stdDeviation="7" flood-color="#0b1a3a" flood-opacity="0.35"/>
    </filter>
    <filter id="sheet-shadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#0b1a3a" flood-opacity="0.25"/>
    </filter>
  </defs>
  <rect x="8" y="8" width="240" height="240" rx="56" fill="url(#bg)"/>
  ${sheet(76, 34, -16)}
  ${sheet(98, 30, 11)}
  <g filter="url(#shadow)">
    <rect x="62" y="70" width="136" height="150" rx="12" fill="#b8640f"/>
    <path d="M60 64 H184 Q212 68 214 142 Q212 214 184 218 H60 Z" fill="url(#pages)"/>
    <path d="M186 74 Q207 80 208 142 Q207 204 186 210" fill="none" stroke="#d9cfb6" stroke-width="3"/>
    <path d="M186 90 Q200 96 201 142 Q200 188 186 194" fill="none" stroke="#d9cfb6" stroke-width="3"/>
    <rect x="196" y="88" width="30" height="16" rx="4" fill="#ffd84d" transform="rotate(8 211 96)"/>
    <rect x="200" y="124" width="30" height="16" rx="4" fill="#4fc1b0"/>
    <rect x="194" y="164" width="30" height="16" rx="4" fill="#ff7a9a" transform="rotate(-9 209 172)"/>
    <rect x="44" y="60" width="140" height="156" rx="14" fill="url(#cover)"/>
    <rect x="44" y="60" width="22" height="156" rx="11" fill="#c46f12"/>
    <rect x="80" y="96" width="78" height="34" rx="7" fill="#fffdf6"/>
    <rect x="90" y="106" width="46" height="6" rx="3" fill="#2c4f9c"/>
    <rect x="90" y="117" width="58" height="5" rx="2.5" fill="#9fb3dc"/>
    <path d="M166 62 Q173 138 166 214" fill="none" stroke="#24304d" stroke-width="10" stroke-linecap="round"/>
    <path d="M118 212 h16 v32 l-8 -8 l-8 8 z" fill="#e04f5f"/>
  </g>
</svg>`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: SIZE,
    height: SIZE,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: { offscreen: true },
  });
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(
    `<html><body style="margin:0;background:transparent;overflow:hidden">${svg}</body></html>`));
  await new Promise((r) => setTimeout(r, 300));
  const image = await win.webContents.capturePage({ x: 0, y: 0, width: SIZE, height: SIZE });
  const png = image.resize({ width: SIZE, height: SIZE }).toPNG();
  fs.mkdirSync(path.join(root, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(root, 'assets', 'icon.png'), png);
  fs.writeFileSync(path.join(root, 'assets', 'icon.svg'), svg.trim() + '\n');
  console.log(`wrote assets/icon.png (${png.length} bytes)`);
  app.exit(0);
});
