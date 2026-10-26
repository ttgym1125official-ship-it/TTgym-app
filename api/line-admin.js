// Vercel Serverless Function — 管理画面（/admin の「公式LINE」）からの操作。
// 読み取りは管理画面が kv_store を直接読むので、ここは LINE への送信と連携の付け外しだけ。
//
// Required Vercel environment variable:
//   ADMIN_API_KEY — 管理画面で一度入力する「LINE操作キー」。未設定なら全て拒否する
//
// POST /api/line-admin  (header: x-admin-key)
//   { action: "check" }                                  → キーの確認
//   { action: "push", lineUserId, text }                 → お客様のLINEにメッセージを送る
//   { action: "link", lineUserId, profileId }            → LINEの人とアプリ会員を連携（記録も同期）
//   { action: "unlink", lineUserId }                     → 連携を外す（体重・水分はLINE側にも残す）

import { loadUser, saveUser, kvGet, kvSet, kvDelete, push, appendLog } from "./_lib/nutri.js";
import crypto from "node:crypto";

function authorized(req) {
  const key = process.env.ADMIN_API_KEY;
  const given = String(req.headers["x-admin-key"] || "");
  if (!key || !given) return false;
  const a = Buffer.from(key), b = Buffer.from(given);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const parse = raw => { try { return raw ? JSON.parse(raw) : null; } catch (e) { return null; } };

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.status(405).end();
    return;
  }
  if (!authorized(req)) {
    res.status(401).json({ error: process.env.ADMIN_API_KEY ? "LINE操作キーが違います" : "Vercelに ADMIN_API_KEY が設定されていません" });
    return;
  }
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const lineUserId = String(body.lineUserId || "");
  if (body.action !== "check" && !/^U[0-9a-f]{32}$/.test(lineUserId)) {
    res.status(400).json({ error: "LINEユーザーIDが正しくありません" });
    return;
  }

  switch (body.action) {
    case "check":
      res.status(200).json({ ok: true });
      return;

    case "push": {
      const text = String(body.text || "").trim();
      if (!text) {
        res.status(400).json({ error: "メッセージを入力してください" });
        return;
      }
      const ok = await push(lineUserId, text);
      if (!ok) {
        res.status(502).json({ error: "送信できませんでした（ブロックされているか、今月の送信上限に達している可能性があります）" });
        return;
      }
      await appendLog(lineUserId, [{ from: "staff", text }]);
      res.status(200).json({ ok: true });
      return;
    }

    case "link": {
      const profileId = String(body.profileId || "");
      const profile = parse(await kvGet(`profile:${profileId}`));
      if (!profile) {
        res.status(404).json({ error: "会員が見つかりません" });
        return;
      }
      await kvSet(`line_user:${lineUserId}`, profileId);
      await kvSet(`profile:${profileId}`, JSON.stringify({ ...profile, lineUserId }));
      // LINEだけで付けていた記録をアプリ側へ移す（初回同期）
      await saveUser(lineUserId, await loadUser(lineUserId));
      await appendLog(lineUserId, [{ from: "system", text: `スタッフがアプリ会員「${profile.name || profileId}」と連携` }]);
      res.status(200).json({ ok: true });
      return;
    }

    case "unlink": {
      const user = await loadUser(lineUserId);
      const pid = user.pid;
      if (pid) {
        const profile = parse(await kvGet(`profile:${pid}`));
        if (profile) {
          const { lineUserId: _drop, ...rest } = profile;
          await kvSet(`profile:${pid}`, JSON.stringify(rest));
        }
        await kvDelete(`line_user:${lineUserId}`);
        // 連携中にアプリ側で持っていた体重・水分を、LINE側のデータとして残す
        await saveUser(lineUserId, { ...user, pid: null, meals: user.meals.filter(m => m.source !== "app") });
        await appendLog(lineUserId, [{ from: "system", text: "スタッフがアプリ会員との連携を解除" }]);
      }
      res.status(200).json({ ok: true });
      return;
    }

    default:
      res.status(400).json({ error: "unknown action" });
  }
}
