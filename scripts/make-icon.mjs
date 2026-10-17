// Renders the app icon SVG to assets/icon.png (256×256) using Electron's own Chromium.
// Run with: npm run icon. electron-builder converts the PNG to .ico for the Windows exe.
import { app, BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SIZE = 256;

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 256 256">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#5b84d6"/>
      <stop offset="1" stop-color="#2c4f9c"/>
    </linearGradient>
    <linearGradient id="page" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="1" stop-color="#e9eef8"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="6" stdDeviation="7" flood-color="#0b1a3a" flood-opacity="0.35"/>
    </filter>
  </defs>
  <rect x="8" y="8" width="240" height="240" rx="56" fill="url(#bg)"/>
  <g filter="url(#shadow)">
    <path d="M78 46h72l40 40v118a12 12 0 0 1-12 12H78a12 12 0 0 1-12-12V58a12 12 0 0 1 12-12z" fill="url(#page)"/>
    <path d="M150 46v28a12 12 0 0 0 12 12h28z" fill="#c5d3ee"/>
  </g>
  <rect x="88" y="104" width="60" height="10" rx="5" fill="#2c4f9c"/>
  <rect x="88" y="128" width="80" height="8" rx="4" fill="#9fb3dc"/>
  <rect x="88" y="148" width="72" height="8" rx="4" fill="#9fb3dc"/>
  <rect x="88" y="168" width="52" height="8" rx="4" fill="#9fb3dc"/>
  <circle cx="176" cy="180" r="22" fill="#f0a23b"/>
  <path d="M167 180l6 6 12-13" fill="none" stroke="#ffffff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
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
