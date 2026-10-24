// Vercel Serverless Function — 健康ダッシュボード(LIFF, src/liff)のデータAPI。
//
// LIFFで取得したアクセストークンを "Authorization: Bearer <token>" で受け取り、
// LINEのAPIで検証してから、そのLINEユーザーのデータだけを読み書きする。
//
// Vercel environment variables:
//   LINE_LOGIN_CHANNEL_ID (推奨) — LIFFアプリを作った「LINEログイン」チャネルのチャネルID。
//                                  設定すると、他のチャネルで発行されたトークンを拒否する。
//
// GET  /api/nutrition?action=data             → { profile, meals, weights, targets }
// GET  /api/nutrition?action=image&meal=<id>  → 食事写真
// POST /api/nutrition { action: "profile", profile }
// POST /api/nutrition { action: "deleteItem", mealId, itemId }
// POST /api/nutrition { action: "deleteMeal", mealId }
// POST /api/nutrition { action: "addWeight", date, weight, bodyFat }
// POST /api/nutrition { action: "deleteWeight", id }

import { loadUser, saveUser, kvGet, kvDelete, newId, calcTargets } from "./_lib/nutri.js";

async function verifyLineUser(req) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return null;
  const v = await fetch(`https://api.line.me/oauth2/v2.1/verify?access_token=${encodeURIComponent(token)}`);
  if (!v.ok) return null;
  const info = await v.json();
  const channelId = process.env.LINE_LOGIN_CHANNEL_ID;
  if (channelId && String(info.client_id) !== String(channelId)) return null;
  if (!(info.expires_in > 0)) return null;
  const p = await fetch("https://api.line.me/v2/profile", { headers: { Authorization: `Bearer ${token}` } });
  if (!p.ok) return null;
  const profile = await p.json();
  return profile.userId || null;
}

const num = (v, min, max) => {
  const x = Number(v);
  return Number.isFinite(x) && x >= min && x <= max ? x : null;
};

function cleanProfile(input) {
  const p = input || {};
  const profile = {
    sex: p.sex === "female" ? "female" : "male",
    age: num(p.age, 10, 100),
    height: num(p.height, 100, 230),
    weight: num(p.weight, 25, 250),
    bodyFat: num(p.bodyFat, 2, 70),
    bmr: num(p.bmr, 500, 5000),
    activity: ["low", "normal", "high", "veryHigh"].includes(p.activity) ? p.activity : "normal",
    goal: ["lose", "keep", "gain"].includes(p.goal) ? p.goal : "keep",
    targetWeight: num(p.targetWeight, 25, 250),
    updatedAt: new Date().toISOString(),
  };
  if (!profile.age || !profile.height || !profile.weight) return null;
  return profile;
}

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(typeof c === "string" ? Buffer.from(c) : c);
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch (e) { return {}; }
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const userId = await verifyLineUser(req);
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  if (req.method === "GET") {
    const action = req.query?.action || "data";
    if (action === "image") {
      const value = await kvGet(`nutri_img:${userId}:${req.query.meal}`);
      const m = /^data:([^;]+);base64,(.+)$/.exec(value || "");
      if (!m) {
        res.status(404).end();
        return;
      }
      res.setHeader("Content-Type", m[1]);
      res.status(200).send(Buffer.from(m[2], "base64"));
      return;
    }
    const user = await loadUser(userId);
    res.status(200).json({ ...user, targets: calcTargets(user.profile) });
    return;
  }

  if (req.method !== "POST") {
    res.status(405).end();
    return;
  }

  const body = await readJson(req);
  const user = await loadUser(userId);

  switch (body.action) {
    case "profile": {
      const profile = cleanProfile(body.profile);
      if (!profile) {
        res.status(400).json({ error: "年齢・身長・体重を入力してください" });
        return;
      }
      user.profile = profile;
      // 登録時の体重・体脂肪率をその日の体組成記録にも残す
      const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
      if (!user.weights.some(w => w.date === today)) {
        user.weights.push({ id: newId(), date: today, weight: profile.weight, bodyFat: profile.bodyFat });
      }
      break;
    }
    case "deleteItem":
      user.meals = user.meals
        .map(m => (m.id === body.mealId ? { ...m, items: m.items.filter(i => i.id !== body.itemId) } : m))
        .filter(m => m.items.length > 0);
      if (!user.meals.some(m => m.id === body.mealId)) await kvDelete(`nutri_img:${userId}:${body.mealId}`);
      break;
    case "deleteMeal":
      user.meals = user.meals.filter(m => m.id !== body.mealId);
      await kvDelete(`nutri_img:${userId}:${body.mealId}`);
      break;
    case "addWeight": {
      const date = /^\d{4}-\d{2}-\d{2}$/.test(body.date || "") ? body.date : null;
      const weight = num(body.weight, 25, 250);
      if (!date || !weight) {
        res.status(400).json({ error: "日付と体重を入力してください" });
        return;
      }
      user.weights = [...user.weights.filter(w => w.date !== date), { id: newId(), date, weight, bodyFat: num(body.bodyFat, 2, 70) }];
      break;
    }
    case "deleteWeight":
      user.weights = user.weights.filter(w => w.id !== body.id);
      break;
    default:
      res.status(400).json({ error: "unknown action" });
      return;
  }

  await saveUser(userId, user);
  res.status(200).json({ ...user, targets: calcTargets(user.profile) });
}
