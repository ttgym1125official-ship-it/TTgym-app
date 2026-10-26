// Creates the two-page TTGYM rich menu on the LINE Official Account
// (public/liff/richmenu-main.png / richmenu-sub.png, switched with the tabs at
// the top via rich menu aliases) and makes the main page the default for every
// friend. Run it again after changing the images or the links — it replaces
// the previous menus.
//
// Usually run from GitHub Actions: "Set up LINE rich menu" (Run workflow).
// Locally:
//   LINE_CHANNEL_ACCESS_TOKEN=... LIFF_ID=... node scripts/setup-rich-menu.mjs
//
// Optional links (if unset, tapping sends the tile's name as a message so staff
// can answer it from the chat):
//   RESERVE_URL, ONLINE_SUPPORT_URL, SHOP_URL, TEAMTOP_URL
//   APP_URL (default https://t-tgym-app.vercel.app) — TTGYMアプリ。体調・トレーニング管理 /
//           レシピ・おすすめ店 / My成長・測定結果 はアプリの該当タブを開く

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const liffId = process.env.LIFF_ID;
if (!token || !liffId) {
  console.error("LINE_CHANNEL_ACCESS_TOKEN と LIFF_ID を設定してください");
  process.exit(1);
}

const env = k => process.env[k]?.trim() || "";
const appUrl = (env("APP_URL") || "https://t-tgym-app.vercel.app").replace(/\/+$/, "");
const liff = p => ({ type: "uri", uri: `https://liff.line.me/${liffId}${p}` });
const linkOr = (url, text) => (url ? { type: "uri", uri: url } : { type: "message", text });
// openExternalBrowser=1: アプリはログイン状態を保つため、LINE内ブラウザではなく普段のブラウザで開く
const app = tab => ({ type: "uri", uri: `${appUrl}/?tab=${tab}&openExternalBrowser=1` });

const ALIAS = { main: "ttgym-main", sub: "ttgym-sub" };
const MENU_NAMES = { main: "TTGYM main", sub: "TTGYM sub" };

// Matches the layout drawn by scripts/render-rich-menu.mjs:
// tabs y 0–150, upper row y 150–949, lower row y 949–1686
const TAB_H = 150, ROW1_END = 949;
const box = (x, y, width, height, action) => ({ bounds: { x, y, width, height }, action });
const tabAreas = [
  box(0, 0, 1250, TAB_H, { type: "richmenuswitch", richMenuAliasId: ALIAS.main, data: "tab=main" }),
  box(1250, 0, 1250, TAB_H, { type: "richmenuswitch", richMenuAliasId: ALIAS.sub, data: "tab=sub" }),
];
const lower = (a, b, c) => [
  box(0, ROW1_END, 833, 1686 - ROW1_END, a),
  box(833, ROW1_END, 834, 1686 - ROW1_END, b),
  box(1667, ROW1_END, 833, 1686 - ROW1_END, c),
];

const MENUS = {
  main: [
    ...tabAreas,
    box(0, TAB_H, 1664, ROW1_END - TAB_H, liff("")),
    box(1664, TAB_H, 836, ROW1_END - TAB_H, liff("/goal")),
    ...lower(linkOr(env("RESERVE_URL"), "予約"), app("condition"), linkOr(env("ONLINE_SUPPORT_URL"), "オンライントレーニングサポート")),
  ],
  sub: [
    ...tabAreas,
    box(0, TAB_H, 1250, ROW1_END - TAB_H, app("recipe")),
    box(1250, TAB_H, 1250, ROW1_END - TAB_H, app("growth")),
    ...lower(liff("/goal"), linkOr(env("SHOP_URL"), "オススメ健康ショップ"), linkOr(env("TEAMTOP_URL"), "TEAM TOPメンバー参加申込み")),
  ],
};

async function line(method, url, body, headers = { "Content-Type": "application/json" }) {
  const res = await fetch(url, { method, headers: { Authorization: `Bearer ${token}`, ...headers }, body });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status} ${text}`);
  return text ? JSON.parse(text) : {};
}

const API = "https://api.line.me/v2/bot";
const { richmenus: before = [] } = await line("GET", `${API}/richmenu/list`);

const created = {};
for (const key of ["main", "sub"]) {
  const { richMenuId } = await line("POST", `${API}/richmenu`, JSON.stringify({
    size: { width: 2500, height: 1686 },
    selected: true,
    name: MENU_NAMES[key],
    chatBarText: "メニュー",
    areas: MENUS[key],
  }));
  await line(
    "POST",
    `https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`,
    readFileSync(path.join(root, "public", "liff", `richmenu-${key}.png`)),
    { "Content-Type": "image/png" },
  );
  created[key] = richMenuId;
  console.log(`created ${key}: ${richMenuId}`);
}

// Point the aliases (used by the tabs) at the new menus
for (const key of ["main", "sub"]) {
  const body = JSON.stringify({ richMenuId: created[key] });
  try {
    await line("POST", `${API}/richmenu/alias/${ALIAS[key]}`, body);
  } catch (e) {
    await line("POST", `${API}/richmenu/alias`, JSON.stringify({ richMenuAliasId: ALIAS[key], richMenuId: created[key] }));
  }
}

await line("POST", `${API}/user/all/richmenu/${created.main}`);
console.log("set main as the default rich menu");

// Remove menus left over from earlier runs (including the old single-page "TTGYM main")
for (const m of before) {
  if (!Object.values(created).includes(m.richMenuId) && m.name?.startsWith("TTGYM")) {
    await line("DELETE", `${API}/richmenu/${m.richMenuId}`).catch(() => {});
    console.log(`deleted old ${m.name} ${m.richMenuId}`);
  }
}
