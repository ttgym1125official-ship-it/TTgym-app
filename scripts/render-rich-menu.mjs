// Renders the two pages of the LINE rich menu (2500×1686 each, switched by the
// tabs at the top):
//   public/liff/richmenu-main.png … メインメニュー
//   public/liff/richmenu-sub.png  … サポートメニュー
// The tap areas that match this layout live in scripts/setup-rich-menu.mjs —
// keep the two in sync (TAB_H / ROW_H there).
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

export const TABS = ["メインメニュー", "サポートメニュー"];

async function loadChromium() {
  try {
    return (await import("playwright")).chromium;
  } catch (e) {
    const globalRoot = execSync("npm root -g").toString().trim();
    return createRequire(path.join(globalRoot, "noop.js"))("playwright").chromium;
  }
}

const icon = (d, color = "#111814") => `<svg viewBox="0 0 24 24" width="64" height="64" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICONS = {
  goal: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
  reserve: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16M9 15l2 2 4-4"/>',
  condition: '<path d="M3 12h4l2-6 4 12 2-6h6"/>',
  online: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3"/>',
  recipe: '<path d="M6 13a6 6 0 1 1 12 0v6H6z"/><path d="M6 16h12M9 4.5A3 3 0 0 1 15 4.5"/>',
  items: '<path d="M10 3h4v3l3 3v11a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V9l3-3z"/><path d="M7 12h10M10 16h4"/>',
  beforeafter: '<rect x="3" y="4" width="8" height="16" rx="1.5"/><rect x="13" y="4" width="8" height="16" rx="1.5"/><path d="M7 9v6M17 9v6"/>',
  textbook: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20v3H6.5A2.5 2.5 0 0 1 4 20.5z"/><path d="M9 7.5h7M9 11h5"/>',
  kick: '<path d="M7 4h7a4 4 0 0 1 4 4v6a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V6a2 2 0 0 1 2-2z"/><path d="M5 10h13M10 4v6"/><path d="M8 17v3h7v-3"/>',
  team: '<circle cx="9" cy="8" r="3.5"/><circle cx="17" cy="9" r="2.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M15.5 14.5c3 0 6 1.6 6 5"/>',
};

const tile = ({ key, eyebrow, label, sub = "", span = 2, dark = false, size = 84, tight = false }) => `
  <div class="tile${dark ? " dark" : ""}" style="grid-column: span ${span}">
    <div class="ic">${icon(ICONS[key], dark ? "#E2BB66" : "#111814")}</div>
    <div class="eb">${eyebrow}</div>
    <div class="lb" style="font-size:${size}px${tight ? "; letter-spacing: -0.06em; white-space: nowrap" : ""}">${label}</div>
    ${sub ? `<div class="sub">${sub}</div>` : ""}
  </div>`;

// 1つのタイルを上下2つのボタンに分けたもの（アイコン左・文字右）
const half = ({ key, eyebrow, label, dark = false }) => `
  <div class="half${dark ? " dark" : ""}">
    <div class="ic">${icon(ICONS[key], dark ? "#E2BB66" : "#111814")}</div>
    <div><div class="eb">${eyebrow}</div><div class="lb">${label}</div></div>
  </div>`;

const tabs = active => `<div class="tabs">${TABS.map((t, i) => `<div class="tab${i === active ? " on" : ""}">${t}</div>`).join("")}</div>`;

const STYLE = `
  * { box-sizing: border-box; margin: 0; }
  body { width: 2500px; height: 1686px; background: #E4E1DA; font-family: "Hiragino Sans", "Noto Sans CJK JP", "Noto Sans JP", sans-serif; color: #111814; }
  .tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; padding: 14px 14px 0; height: 150px; }
  .tab { border-radius: 26px 26px 0 0; display: grid; place-items: center; font-size: 50px; font-weight: 800; letter-spacing: 0.18em; color: #8E8A82; background: #D6D2CA; }
  .tab.on { background: #111814; color: #fff; box-shadow: inset 0 -8px 0 #C9A86A; }
  .grid { display: grid; gap: 14px; padding: 14px; height: 1536px; grid-template-columns: repeat(6, 1fr); grid-template-rows: 1fr 0.92fr; }
  .tile { background: #fff; border-radius: 26px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
  .tile.dark { background: linear-gradient(135deg, #1D2420, #0F1411); color: #fff; }
  .tile.dark .ic { background: rgba(226, 187, 102, 0.14); }
  .tile.dark .eb { color: #E2BB66; }
  .hero { grid-column: span 4; flex-direction: row; justify-content: space-between; padding: 0 90px 0 120px; text-align: left; }
  .eyebrow { font-size: 38px; letter-spacing: 0.22em; font-weight: 700; }
  .title { font-size: 150px; font-weight: 800; margin-top: 18px; letter-spacing: 0.02em; }
  .desc { font-size: 40px; margin-top: 18px; color: #333; }
  .cta { display: inline-flex; align-items: center; gap: 22px; margin-top: 46px; background: #111814; color: #fff; border-radius: 999px; padding: 26px 54px; font-size: 44px; font-weight: 700; }
  .logo img { width: 520px; height: 520px; }
  .ic { width: 128px; height: 128px; border-radius: 50%; background: #F3F1EC; display: grid; place-items: center; }
  .eb { font-size: 32px; letter-spacing: 0.24em; margin-top: 22px; color: #555; font-weight: 600; }
  .lb { font-weight: 800; margin-top: 8px; line-height: 1.22; }
  .sub { font-size: 38px; color: #666; margin-top: 14px; }
  .tile.dark .sub { color: #B9B4A8; }
  .split { display: grid; grid-template-rows: 1fr 1fr; gap: 14px; }
  .half { background: #fff; border-radius: 26px; display: flex; align-items: center; gap: 30px; padding: 0 34px; }
  .half.dark { background: linear-gradient(135deg, #1D2420, #0F1411); color: #fff; }
  .half .ic { width: 112px; height: 112px; flex-shrink: 0; }
  .half.dark .ic { background: rgba(226, 187, 102, 0.14); }
  .half .eb { margin-top: 0; font-size: 28px; }
  .half.dark .eb { color: #E2BB66; }
  .half .lb { font-size: 62px; margin-top: 4px; }
`;

const page = (active, body) => `<!doctype html><html><head><meta charset="utf-8"><style>${STYLE}</style></head><body>${tabs(active)}<div class="grid">${body}</div></body></html>`;

const MAIN = page(0, `
  <div class="tile hero">
    <div>
      <div class="eyebrow">TODAY'S NUTRITION</div>
      <div class="title">今日の栄養</div>
      <div class="desc">写真を送るだけで、AIが栄養を分析</div>
      <div class="cta">ダッシュボードを開く <span>→</span></div>
    </div>
    <div class="logo"><img src="data:image/png;base64,${logo}"></div>
  </div>
  ${tile({ key: "goal", eyebrow: "GOAL & MY GROWTH", label: "目標設定<br>MY成長・測定結果", size: 84, sub: "目標・成長・レポート・会員ランク" })}
  ${tile({ key: "reserve", eyebrow: "RESERVATION", label: "予約", size: 128 })}
  ${tile({ key: "condition", eyebrow: "CONDITION & TRAINING", label: "体調・トレーニング<br>自己管理", size: 84 })}
  ${tile({ key: "online", eyebrow: "ONLINE SUPPORT", label: "オンライン<br>トレーニングサポート", size: 78 })}
`);

const SUB = page(1, `
  ${tile({ key: "recipe", eyebrow: "RECIPE & RESTAURANT", label: "レシピ・おすすめ店", span: 3, size: 112 })}
  ${tile({ key: "items", eyebrow: "TTGYM RECOMMEND", label: "TTGYMオススメ<br>健康アイテム", span: 3, size: 108 })}
  ${tile({ key: "beforeafter", eyebrow: "BEFORE / AFTER", label: "ビフォーアフター", size: 98, tight: true })}
  ${tile({ key: "textbook", eyebrow: "TTGYM TEXTBOOK", label: "TTGYM<br>教科書", size: 104 })}
  <div class="split" style="grid-column: span 2">
    ${half({ key: "team", eyebrow: "TEAM TOP", label: "TEAM TOP<br>メンバー参加申込み", dark: true })}
    ${half({ key: "kick", eyebrow: "KICKBOXING", label: "キックボクシング<br>体験申込み" })}
  </div>
`);

const chromium = await loadChromium();
const browser = await chromium.launch();
const pg = await browser.newPage({ viewport: { width: 2500, height: 1686 } });
for (const [name, html] of [["richmenu-main", MAIN], ["richmenu-sub", SUB]]) {
  await pg.setContent(html);
  await pg.waitForTimeout(300);
  const out = path.join(root, "public", "liff", `${name}.png`);
  await pg.screenshot({ path: out });
  console.log(`wrote ${out}`);
}
await browser.close();
