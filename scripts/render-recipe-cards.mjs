// Renders each recipe in src/recipes.js to public/recipes/vol<N>.png — the
// card image shown in the app's レシピ tab and sent as the image message in
// the Saturday LINE broadcast.
//
// Usage (needs Playwright + Chromium, not a project dependency):
//   node scripts/render-recipe-cards.mjs          # only cards that don't exist yet
//   node scripts/render-recipe-cards.mjs --all    # re-render every card

import { existsSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RECIPES } from "../src/recipes.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "public", "recipes");
const all = process.argv.includes("--all");

async function loadChromium() {
  try {
    return (await import("playwright")).chromium;
  } catch (e) {
    const globalRoot = execSync("npm root -g").toString().trim();
    return createRequire(path.join(globalRoot, "noop.js"))("playwright").chromium;
  }
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const fmt = n => (Number.isInteger(n) ? String(n) : n.toFixed(1));

function cardHtml(r) {
  const n = r.nutrition;
  const total = n.p * 4 + n.f * 9 + n.c * 4;
  const pct = v => ((v / total) * 100).toFixed(1);
  const ingredients = r.ingredients
    .map(line => {
      const m = line.match(/^【(.+?)】(.*)$/);
      return m
        ? `<div class="ing"><span class="ing-tag">${esc(m[1])}</span>${esc(m[2])}</div>`
        : `<div class="ing">${esc(line)}</div>`;
    })
    .join("");
  const steps = r.steps
    .map((s, i) => `<div class="step"><div class="num">${i + 1}</div><div>${esc(s.replace(/（※.*?）/g, ""))}</div></div>`)
    .join("");
  const titleSize = r.title.length <= 9 ? 84 : r.title.length <= 12 ? 68 : 58;

  return `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@600;700;900&family=Noto+Sans+JP:wght@400;500;700&family=Space+Mono:wght@700&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { width: 1080px; height: 1350px; background: #0D0D0D; color: #EDEAE0; font-family: 'Noto Sans JP', sans-serif; }
  .card { position: relative; width: 1080px; height: 1350px; padding: 64px 72px 56px; overflow: hidden;
    background: radial-gradient(ellipse at 85% -10%, #3A3220 0%, transparent 55%), linear-gradient(160deg, #141310 0%, #0A0A09 100%); }
  .frame { position: absolute; inset: 24px; border: 1.5px solid #8C7328; border-radius: 6px; pointer-events: none; }
  .eyebrow { font-family: 'Space Mono', monospace; font-size: 22px; letter-spacing: 6px; color: #D4AF37; display: flex; align-items: center; gap: 18px; }
  .eyebrow .line { flex: 1; height: 1.5px; background: linear-gradient(90deg, #8C7328, transparent); }
  .vol { font-family: 'Space Mono', monospace; font-size: 26px; color: #8A8578; margin-top: 18px; letter-spacing: 3px; }
  h1 { font-family: 'Noto Serif JP', serif; font-weight: 900; font-size: 84px; line-height: 1.15; margin-top: 6px;
    background: linear-gradient(135deg, #F3DC8A 0%, #D4AF37 50%, #A8872B 100%); -webkit-background-clip: text; color: transparent; }
  .chips { display: flex; gap: 16px; margin-top: 28px; }
  .chip { border: 1.5px solid #D4AF37; border-radius: 999px; padding: 10px 26px; font-size: 26px; font-weight: 700; color: #EDEAE0; }
  .chip b { color: #D4AF37; font-family: 'Space Mono', monospace; font-size: 30px; margin-left: 6px; }
  .chip.solid { background: linear-gradient(135deg, #E4C158, #D4AF37 45%, #8C7328); color: #0D0D0D; border: none; }
  .chip.solid b { color: #0D0D0D; }
  .label { font-family: 'Space Mono', monospace; font-size: 20px; letter-spacing: 4px; color: #D4AF37; margin: 40px 0 16px; display: flex; align-items: center; gap: 14px; }
  .label .line { flex: 1; height: 1px; background: #332C1E; }
  .ing { font-size: 24px; line-height: 1.7; color: #EDEAE0; }
  .ing-tag { display: inline-block; font-size: 19px; color: #0D0D0D; background: #D4AF37; border-radius: 4px; padding: 0 10px; margin-right: 12px; font-weight: 700; }
  .step { display: flex; gap: 18px; font-size: 23px; line-height: 1.6; margin-bottom: 12px; }
  .num { flex: none; width: 38px; height: 38px; border-radius: 50%; border: 1.5px solid #D4AF37; color: #D4AF37;
    font-family: 'Space Mono', monospace; font-size: 20px; display: flex; align-items: center; justify-content: center; margin-top: 1px; }
  .pfc { display: flex; gap: 14px; }
  .pfc div { flex: 1; background: #17150F; border: 1px solid #332C1E; border-radius: 10px; padding: 14px 0; text-align: center; font-size: 20px; color: #8A8578; }
  .pfc b { display: block; font-family: 'Space Mono', monospace; font-size: 34px; color: #EDEAE0; margin-top: 2px; }
  .pfc b small { font-size: 20px; color: #8A8578; margin-left: 2px; }
  .bar { display: flex; height: 10px; border-radius: 5px; overflow: hidden; margin-top: 14px; }
  .footer { position: absolute; left: 72px; right: 72px; bottom: 50px; display: flex; justify-content: space-between; align-items: baseline;
    font-family: 'Space Mono', monospace; font-size: 20px; color: #8A8578; letter-spacing: 3px; }
  .footer .brand { font-family: 'Noto Serif JP', serif; font-weight: 700; font-size: 34px; color: #D4AF37; letter-spacing: 8px; }
</style></head><body><div class="card"><div class="frame"></div>
  <div class="eyebrow">WEEKLY BODY MAKE RECIPE<div class="line"></div></div>
  <div class="vol">VOL.${r.vol}</div>
  <h1 style="font-size:${titleSize}px">${esc(r.title)}</h1>
  <div class="chips">
    <div class="chip">調理<b>${r.minutes}</b>分</div>
    <div class="chip"><b>${n.kcal}</b>kcal</div>
    <div class="chip solid">P<b>${fmt(n.p)}</b>g</div>
  </div>
  <div class="label">INGREDIENTS ／ 1人分<div class="line"></div></div>
  ${ingredients}
  <div class="label">HOW TO<div class="line"></div></div>
  ${steps}
  <div class="label">NUTRITION<div class="line"></div></div>
  <div class="pfc">
    <div>タンパク質<b>${fmt(n.p)}<small>g</small></b></div>
    <div>脂質<b>${fmt(n.f)}<small>g</small></b></div>
    <div>炭水化物<b>${fmt(n.c)}<small>g</small></b></div>
  </div>
  <div class="bar"><div style="width:${pct(n.p * 4)}%;background:#D4AF37"></div><div style="width:${pct(n.f * 9)}%;background:#8C7328"></div><div style="width:${pct(n.c * 4)}%;background:#4A4436"></div></div>
  <div class="footer"><div class="brand">TTGYM</div><div>EVERY SATURDAY 8:00</div></div>
</div></body></html>`;
}

mkdirSync(outDir, { recursive: true });
const chromium = await loadChromium();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
for (const r of RECIPES) {
  const file = path.join(outDir, `vol${r.vol}.png`);
  if (!all && existsSync(file)) continue;
  await page.setContent(cardHtml(r), { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  const overflow = await page.evaluate(() => {
    const footer = document.querySelector(".footer").getBoundingClientRect();
    const bar = document.querySelector(".bar").getBoundingClientRect();
    return bar.bottom > footer.top - 24;
  });
  if (overflow) console.warn(`! vol.${r.vol}: content overlaps the footer — shorten the steps`);
  await page.screenshot({ path: file, type: "png" });
  console.log(`wrote public/recipes/vol${r.vol}.png`);
}
await browser.close();
