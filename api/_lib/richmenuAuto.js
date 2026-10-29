// リッチメニューを、サーバーが自分で LINE に登録する。
// 画像（public/liff/richmenu-*.png）やリンク先を変えたら RICHMENU_VERSION を上げる。
// 本番に反映されたあと、公式LINEに誰かがメッセージを送った（Webhook が動いた）ときに、
// 登録済みのバージョンが古ければ新しいメニューに入れ替える（管理画面のボタンを押さなくてよい）。
// 管理画面（/admin → 公式LINE → リッチメニュー）のボタンも registerRichMenu を使う。

import { kvGet, kvSet } from "./nutri.js";
import { setupRichMenu } from "./richmenu.js";
import { LIFF_ID } from "../../src/lineConfig.js";

export const RICHMENU_VERSION = "2026-10-28-goal-growth-items";

const parse = raw => { try { return raw ? JSON.parse(raw) : null; } catch (e) { return null; } };
const clean = v => (/^https?:\/\/\S+$/.test(String(v || "").trim()) ? String(v).trim() : "");

// links を省略すると、前回登録したリンク（予約・オススメ健康ショップ・TEAM TOP）を使う
export async function registerRichMenu({ origin, links }) {
  const saved = parse(await kvGet("line_richmenu:links")) || {};
  const src = links || saved;
  const clean3 = Object.fromEntries(["reserve", "shop", "teamtop"].map(k => [k, clean(src[k])]));
  const created = await setupRichMenu({
    token: process.env.LINE_CHANNEL_ACCESS_TOKEN,
    liffId: process.env.LIFF_ID || process.env.VITE_LIFF_ID || LIFF_ID,
    links: clean3,
    loadImage: async name => {
      // 古い画像がキャッシュから返らないよう、バージョンを付けて取る
      const r = await fetch(`${origin}/liff/${name}?v=${encodeURIComponent(RICHMENU_VERSION)}`);
      if (!r.ok) throw new Error(`画像を読み込めませんでした (${name})`);
      return Buffer.from(await r.arrayBuffer());
    },
  });
  await kvSet("line_richmenu:links", JSON.stringify({ ...clean3, version: RICHMENU_VERSION, updatedAt: new Date().toISOString() }));
  return created;
}

// 登録済みのメニューが古ければ入れ替える。失敗してもメッセージの処理は止めない
export async function ensureRichMenu(origin) {
  try {
    const saved = parse(await kvGet("line_richmenu:links")) || {};
    if (saved.version === RICHMENU_VERSION) return;
    // 同時に何件もメッセージが来ても、入れ替えは1回だけ（2分間は他の処理が入らない）
    const lock = Number(await kvGet("line_richmenu:lock")) || 0;
    if (Date.now() - lock < 120000) return;
    await kvSet("line_richmenu:lock", String(Date.now()));
    await registerRichMenu({ origin });
  } catch (e) {
    console.error("rich menu update failed:", e?.message || e);
  }
}
