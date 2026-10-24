// Renders the LINE rich menu image to public/liff/richmenu.png (2500×1686).
// The tap areas that match this layout live in scripts/setup-rich-menu.mjs —
// keep the two in sync (see AREAS there).
//
// Usage (needs Playwright + Chromium, not a project dependency):
//   node scripts/render-rich-menu.mjs

import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const logo = readFileSync(path.join(root, "scripts", "ttgym-logo-source.png")).toString("base64");

async function loadChromium() {
  try {
    return (await import("playwright")).chromium;
  } catch (e) {
    const globalRoot = execSync("npm root -g").toString().trim();
    return createRequire(path.join(globalRoot, "noop.js"))("playwright").chromium;
  }
}

const icon = d => `<svg viewBox="0 0 24 24" width="64" height="64" fill="none" stroke="#111814" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICONS = {
  goal: icon('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>'),
  event: icon('<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16M8 14h2M12 14h2M8 17h2"/>'),
  invite: icon('<circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-6 7-6s7 2 7 6M19 8v6M16 11h6"/>'),
  shop: icon('<path d="M6 7h12l-1 13H7L6 7z"/><path d="M9 7a3 3 0 0 1 6 0"/>'),
};

const small = (key, eyebrow, label, sub = "") => `
  <div class="tile small">
    <div class="ic">${ICONS[key]}</div>
    <div class="eb">${eyebrow}</div>
    <div class="lb">${label}</div>
    ${sub ? `<div class="sub">${sub}</div>` : ""}
  </div>`;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; }
  body { width: 2500px; height: 1686px; background: #E4E1DA; font-family: "Hiragino Sans", "Noto Sans CJK JP", "Noto Sans JP", sans-serif; color: #111814; }
  .grid { display: grid; gap: 14px; padding: 14px; width: 2500px; height: 1686px;
    grid-template-columns: repeat(6, 1fr); grid-template-rows: 1fr 0.92fr; }
  .tile { background: #fff; border-radius: 26px; display: flex; flex-direction: column; align-items: center; justify-content: center; }
  .hero { grid-column: span 4; flex-direction: row; justify-content: space-between; padding: 0 110px 0 120px; }
  .goal { grid-column: span 2; }
  .small { grid-column: span 2; }
  .eyebrow { font-size: 38px; letter-spacing: 0.22em; font-weight: 700; }
  .title { font-size: 150px; font-weight: 800; margin-top: 18px; letter-spacing: 0.02em; }
  .desc { font-size: 40px; margin-top: 18px; color: #333; }
  .cta { display: inline-flex; align-items: center; gap: 22px; margin-top: 46px; background: #111814; color: #fff; border-radius: 999px; padding: 26px 54px; font-size: 44px; font-weight: 700; }
  .logo { display: flex; flex-direction: column; align-items: center; }
  .logo img { width: 560px; height: 560px; }
  .ic { width: 150px; height: 150px; border-radius: 50%; background: #F3F1EC; display: grid; place-items: center; }
  .eb { font-size: 30px; letter-spacing: 0.28em; margin-top: 30px; color: #555; font-weight: 600; }
  .lb { font-size: 84px; font-weight: 800; margin-top: 10px; }
  .sub { font-size: 34px; color: #777; margin-top: 12px; }
</style></head><body><div class="grid">
  <div class="tile hero">
    <div>
      <div class="eyebrow">TODAY'S NUTRITION</div>
      <div class="title">今日の栄養</div>
      <div class="desc">写真を送るだけで、AIが栄養を分析</div>
      <div class="cta">ダッシュボードを開く <span>→</span></div>
    </div>
    <div class="logo"><img src="data:image/png;base64,${logo}"></div>
  </div>
  <div class="tile goal">
    <div class="ic">${ICONS.goal}</div>
    <div class="eb">GOAL</div>
    <div class="lb">目標設定</div>
    <div class="sub">プロフィール・体の情報</div>
  </div>
  ${small("event", "EVENT", "イベント")}
  ${small("invite", "INVITE", "友人を紹介")}
  ${small("shop", "ONLINE SHOP", "ショップ")}
</div></body></html>`;

const chromium = await loadChromium();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 2500, height: 1686 } });
await page.setContent(html);
await page.waitForTimeout(300);
const out = path.join(root, "public", "liff", "richmenu.png");
await page.screenshot({ path: out });
await browser.close();
console.log(`wrote ${out}`);
