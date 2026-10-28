// Creates the two-page TTGYM rich menu on the LINE Official Account and makes the
// main page the default for every friend (see api/_lib/richmenu.js).
// The 管理画面 (/admin → 公式LINE → リッチメニュー) has a button that does the same.
//
// Locally / GitHub Actions ("Set up LINE rich menu"):
//   LINE_CHANNEL_ACCESS_TOKEN=... node scripts/setup-rich-menu.mjs
// Optional: LIFF_ID (default src/lineConfig.js), RESERVE_URL, SHOP_URL, TEAMTOP_URL

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setupRichMenu } from "../api/_lib/richmenu.js";
import { LIFF_ID } from "../src/lineConfig.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
if (!token) {
  console.error("LINE_CHANNEL_ACCESS_TOKEN を設定してください");
  process.exit(1);
}
const env = k => process.env[k]?.trim() || "";

await setupRichMenu({
  token,
  liffId: env("LIFF_ID") || LIFF_ID,
  links: { reserve: env("RESERVE_URL"), shop: env("SHOP_URL"), teamtop: env("TEAMTOP_URL") },
  loadImage: name => readFileSync(path.join(root, "public", "liff", name)),
  log: console.log,
});
