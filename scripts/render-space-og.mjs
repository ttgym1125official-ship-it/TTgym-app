// Renders the share card (OGP image) for the space-rental LP to
// public/space/og.png — the image X / Threads / LINE show when the LP link
// is posted.
//
// Usage (needs Playwright + Chromium, not a project dependency):
//   node scripts/render-space-og.mjs

import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadChromium() {
  try {
    return (await import("playwright")).chromium;
  } catch (e) {
    const globalRoot = execSync("npm root -g").toString().trim();
    return createRequire(path.join(globalRoot, "noop.js"))("playwright").chromium;
  }
}

const html = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@500;900&family=Noto+Serif+JP:wght@900&family=Space+Mono:wght@700&display=swap" rel="stylesheet">
<style>
  body { margin:0; width:1200px; height:630px; background:#0D0D0D; color:#FAFAFA; font-family:'Noto Sans JP',sans-serif; position:relative; overflow:hidden; }
  .bg { position:absolute; inset:0; background: radial-gradient(700px 400px at 90% 0%, rgba(212,175,55,.22), transparent 70%), repeating-linear-gradient(135deg, transparent 0 30px, rgba(255,255,255,.03) 30px 31px); }
  .in { position:absolute; inset:64px 72px; display:flex; flex-direction:column; }
  .logo { font-family:'Noto Serif JP',serif; color:#D4AF37; letter-spacing:6px; font-size:30px; font-weight:900; }
  h1 { font-family:'Noto Serif JP',serif; font-weight:900; font-size:84px; line-height:1.2; margin:28px 0 0; }
  h1 em { font-style:normal; color:#D4AF37; }
  .row { margin-top:auto; display:flex; align-items:flex-end; gap:28px; }
  .price { font-family:'Space Mono',monospace; font-size:88px; color:#D4AF37; line-height:1; }
  .price small { font-family:'Noto Sans JP'; font-size:30px; color:#B8B2A7; }
  .chips { display:flex; gap:12px; margin-left:auto; }
  .chip { font-size:26px; font-weight:500; padding:10px 22px; border-radius:99px; border:2px solid #2C2C2C; background:#1C1C1C; }
  .chip.r { border-color:rgba(226,80,75,.6); color:#FFB3B0; }
</style></head><body><div class="bg"></div><div class="in">
  <div class="logo">TTGYM SPACE RENTAL</div>
  <h1>キックボクシングエリア、<br><em>貸します。</em></h1>
  <div class="row"><div class="price">¥3,000<small> /1時間</small></div>
  <div class="chips"><span class="chip">10:00〜14:00</span><span class="chip r">撮影禁止</span></div></div>
</div></body></html>`;

const chromium = await loadChromium();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: path.join(root, "public", "space", "og.png") });
await browser.close();
console.log("wrote public/space/og.png");
