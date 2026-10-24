// Creates the TTGYM rich menu (public/liff/richmenu.png) on the LINE Official
// Account and makes it the default menu for every friend. Run it again after
// changing the image or the links — it replaces the previous default menu.
//
// Usually run from GitHub Actions: "Set up LINE rich menu" (Run workflow).
// Locally:
//   LINE_CHANNEL_ACCESS_TOKEN=... LIFF_ID=... node scripts/setup-rich-menu.mjs
//
// Optional links for the bottom row (if unset, tapping sends that word as a
// message so staff can answer it from the chat):
//   EVENT_URL, SHOP_URL, LINE_BASIC_ID (e.g. @123abcde → 友人を紹介 opens LINE's share screen)

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

const linkOr = (url, text) => (url ? { type: "uri", uri: url } : { type: "message", text });
const basicId = process.env.LINE_BASIC_ID?.trim();

// Matches the grid drawn by scripts/render-rich-menu.mjs
const AREAS = [
  { bounds: { x: 0, y: 0, width: 1664, height: 878 }, action: { type: "uri", uri: `https://liff.line.me/${liffId}` } },
  { bounds: { x: 1664, y: 0, width: 836, height: 878 }, action: { type: "uri", uri: `https://liff.line.me/${liffId}/profile` } },
  { bounds: { x: 0, y: 878, width: 833, height: 808 }, action: linkOr(process.env.EVENT_URL, "イベント") },
  { bounds: { x: 833, y: 878, width: 834, height: 808 }, action: linkOr(basicId && `https://line.me/R/nv/recommendOA/${encodeURIComponent(basicId)}`, "友人を紹介") },
  { bounds: { x: 1667, y: 878, width: 833, height: 808 }, action: linkOr(process.env.SHOP_URL, "ショップ") },
];

async function line(method, url, body, headers = { "Content-Type": "application/json" }) {
  const res = await fetch(url, { method, headers: { Authorization: `Bearer ${token}`, ...headers }, body });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status} ${text}`);
  return text ? JSON.parse(text) : {};
}

const previous = await line("GET", "https://api.line.me/v2/bot/user/all/richmenu").catch(() => ({}));

const { richMenuId } = await line("POST", "https://api.line.me/v2/bot/richmenu", JSON.stringify({
  size: { width: 2500, height: 1686 },
  selected: true,
  name: "TTGYM main",
  chatBarText: "TTGYM",
  areas: AREAS,
}));
console.log(`created ${richMenuId}`);

await line(
  "POST",
  `https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`,
  readFileSync(path.join(root, "public", "liff", "richmenu.png")),
  { "Content-Type": "image/png" },
);
await line("POST", `https://api.line.me/v2/bot/user/all/richmenu/${richMenuId}`);
console.log("set as default rich menu");

if (previous.richMenuId && previous.richMenuId !== richMenuId) {
  await line("DELETE", `https://api.line.me/v2/bot/richmenu/${previous.richMenuId}`).catch(() => {});
  console.log(`deleted previous ${previous.richMenuId}`);
}
