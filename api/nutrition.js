// Vercel Serverless Function — 健康ダッシュボード(LIFF, src/liff)のデータAPI。
//
// LIFFで取得したアクセストークンを "Authorization: Bearer <token>" で受け取り、
// LINEのAPIで検証してから、そのLINEユーザーのデータだけを読み書きする。
//
// Vercel environment variables:
//   LINE_LOGIN_CHANNEL_ID (推奨) — LIFFアプリを作った「LINEログイン」チャネルのチャネルID。
//                                  設定すると、他のチャネルで発行されたトークンを拒否する。
//
// GET  /api/nutrition?action=data             → { profile, meals, weights, water, targets }
// GET  /api/nutrition?action=image&meal=<id>  → 食事写真
// GET  /api/nutrition?action=goal             → { goal, photos, linked, points }（目標設定ページ）
// POST /api/nutrition { action: "profile", profile }
// POST /api/nutrition { action: "deleteItem", mealId, itemId }
// POST /api/nutrition { action: "deleteMeal", mealId }
// POST /api/nutrition { action: "addWeight", date, weight, bodyFat }
// POST /api/nutrition { action: "deleteWeight", id }
// POST /api/nutrition { action: "addMeal", date, time, label, items: [{ name, amount, kcal, p, f, c }] }
// POST /api/nutrition { action: "water", date, ml }        ml は加算量（マイナスで取り消し）
// POST /api/nutrition { action: "goal", goal: { goal, targetWeight, targetBodyFat, afterMonths } }
// POST /api/nutrition { action: "photo", which: "before"|"after", dataUrl }

import {
  loadUser, saveUser, kvGet, kvDelete, newId, calcTargets, normalizeItems, estimateNutrients,
  loadGoal, saveGoal, savePhoto, computeMembership,
} from "./_lib/nutri.js";

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
    if (action === "goal") {
      const [goal, membership] = await Promise.all([loadGoal(userId, user), computeMembership(userId, user)]);
      res.status(200).json({ ...goal, points: membership.points });
      return;
    }
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
    case "addMeal": {
      const date = /^\d{4}-\d{2}-\d{2}$/.test(body.date || "") ? body.date : null;
      const raw = (Array.isArray(body.items) ? body.items : []).slice(0, 20).filter(i => String(i.name || "").trim());
      if (!date || !raw.length) {
        res.status(400).json({ error: "メニュー名を入力してください" });
        return;
      }
      const items = await estimateNutrients(normalizeItems(raw));
      const time = /^\d{2}:\d{2}$/.test(body.time || "") ? body.time : "12:00";
      const title = items.length > 2 ? `${items[0].name}・${items[1].name} ほか${items.length - 2}品` : items.map(i => i.name).join("・");
      user.meals.push({
        id: newId(), date, time, label: ["朝食", "昼食", "夕食", "間食", "食事"].includes(body.label) ? body.label : "食事",
        title, hasImage: false, manual: true, items,
      });
      break;
    }
    case "water": {
      const date = /^\d{4}-\d{2}-\d{2}$/.test(body.date || "") ? body.date : null;
      const ml = num(body.ml, -5000, 5000);
      if (!date || ml == null) {
        res.status(400).json({ error: "量を指定してください" });
        return;
      }
      const next = Math.max(0, (user.water[date] || 0) + ml);
      if (next) user.water[date] = next; else delete user.water[date];
      break;
    }
    case "goal": {
      const g = body.goal || {};
      const patch = {};
      if ("goal" in g) patch.goal = String(g.goal || "").slice(0, 2000);
      if ("targetWeight" in g) patch.targetWeight = num(g.targetWeight, 25, 250);
      if ("targetBodyFat" in g) patch.targetBodyFat = num(g.targetBodyFat, 2, 70);
      if ("afterMonths" in g) patch.afterMonths = String(g.afterMonths ?? "").replace(/[^\d]/g, "").slice(0, 3);
      await saveGoal(userId, user, patch);
      res.status(200).json({ ok: true });
      return;
    }
    case "photo": {
      const which = body.which === "after" ? "after" : "before";
      const dataUrl = body.dataUrl ? String(body.dataUrl) : null;
      if (dataUrl && (!/^data:image\/(jpeg|png|webp);base64,/.test(dataUrl) || dataUrl.length > 3_000_000)) {
        res.status(400).json({ error: "画像を読み込めませんでした" });
        return;
      }
      await savePhoto(userId, which, dataUrl);
      res.status(200).json({ ok: true });
      return;
    }
    default:
      res.status(400).json({ error: "unknown action" });
      return;
  }

  await saveUser(userId, user);
  res.status(200).json({ ...user, targets: calcTargets(user.profile) });
}
