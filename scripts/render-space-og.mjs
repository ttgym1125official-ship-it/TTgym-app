// Renders the share card (OGP image) for the private-gym rental LP to
// public/space/og.png — the image X / Threads / LINE show when the LP link
// is posted.
//
// Usage (needs Playwright + Chromium, not a project dependency):
//   node scripts/render-space-og.mjs

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
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

const photo = "data:image/jpeg;base64," + readFileSync(path.join(root, "public", "space", "img", "bag.jpg")).toString("base64");

const html = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@500;900&family=Montserrat:wght@800&display=swap" rel="stylesheet">
<style>
  body { margin:0; width:1200px; height:630px; background:#111; color:#fff; font-family:'Noto Sans JP',sans-serif; position:relative; overflow:hidden; }
  .ph { position:absolute; right:0; top:0; width:560px; height:630px; background:url(${photo}) center/cover; }
  .ph::after { content:""; position:absolute; inset:0; background:linear-gradient(90deg,#111 0%,rgba(17,17,17,.3) 45%,rgba(17,17,17,0) 100%); }
  .giant { position:absolute; left:-10px; bottom:-40px; font-family:'Montserrat'; font-weight:800; font-size:240px; color:rgba(255,255,255,.06); line-height:1; }
  .in { position:absolute; left:72px; top:64px; bottom:64px; width:760px; display:flex; flex-direction:column; }
  .brand { font-family:'Montserrat'; font-weight:800; font-size:34px; letter-spacing:4px; }
  h1 { font-weight:900; font-size:82px; line-height:1.28; margin:26px 0 0; letter-spacing:2px; }
  .row { margin-top:auto; display:flex; gap:14px; }
  .chip { font-size:30px; font-weight:900; padding:12px 26px; background:linear-gradient(90deg,#4A7CF0,#8EA5E6); }
  .chip.k { background:#fff; color:#111; }
</style></head><body><div class="ph"></div><div class="giant">PRIVATE</div><div class="in">
  <div class="brand">TTGYM</div>
  <h1>このジム、<br>まるごと貸切。</h1>
  <div class="row"><span class="chip">1時間 ¥5,000</span><span class="chip k">最大8名</span><span class="chip k">9:00–14:00</span></div>
</div></body></html>`;

const chromium = await loadChromium();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: path.join(root, "public", "space", "og.png") });
await browser.close();
console.log("wrote public/space/og.png");
