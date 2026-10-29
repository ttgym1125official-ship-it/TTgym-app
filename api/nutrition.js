// Vercel Serverless Function — 健康ダッシュボード(LIFF, src/liff)のデータAPI。
//
// LIFFで取得したアクセストークンを "Authorization: Bearer <token>" で受け取り、
// LINEのAPIで検証してから、そのLINEユーザーのデータだけを読み書きする。
//
// LIFFアプリを作った「LINEログイン」チャネルのチャネルID（src/lineConfig.js、環境変数
// LINE_LOGIN_CHANNEL_ID で上書き可）と一致しないトークンは拒否する。
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
// POST /api/nutrition { action: "photo", which: "before"|"before_side"|"before_back"|"after"|…, dataUrl }
// POST /api/nutrition { action: "ai", prompt, image?: { mediaType, data }, maxTokens?, webSearch? } → { text }
//   （LINE内の体調・成長ページのAI機能用。アプリではお客様のAPIキーで直接呼んでいるものを、サーバーのキーで代わりに呼ぶ）
// POST /api/nutrition { action: "appLink", tab }          → { url }（TTGYMアプリをこのLINEの人として開くURL）

import {
  loadUser, saveUser, kvGet, kvDelete, newId, calcTargets, normalizeItems, estimateNutrients,
  loadGoal, saveGoal, savePhoto, PHOTO_SLOTS, computeMembership, appProfileHints, createAppLoginToken,
} from "./_lib/nutri.js";
import { LINE_LOGIN_CHANNEL_ID } from "../src/lineConfig.js";
import { ensureRichMenu } from "./_lib/richmenuAuto.js";

const APP_TABS = ["status", "condition", "meal", "training", "growth", "report", "comments", "recipe", "live"];

// レスポンスには内部用の項目（_appMealIds など）を含めない
function view(user) {
  const { profile, meals, weights, water, goal, pid } = user;
  // memberId: アプリと同じ形の記録（体調・トレーニングなど）の置き場（未連携なら line_<LINE userId>）
  return { profile, meals, weights, water, goal, linked: !!pid, memberId: user.appId, targets: calcTargets(profile) };
}

async function verifyLineUser(req) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return null;
  const v = await fetch(`https://api.line.me/oauth2/v2.1/verify?access_token=${encodeURIComponent(token)}`);
  if (!v.ok) return null;
  const info = await v.json();
  const channelId = process.env.LINE_LOGIN_CHANNEL_ID || LINE_LOGIN_CHANNEL_ID;
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
  // リッチメニューが古ければ入れ替える（ダッシュボードや各ページを開いたときにも。Webhook が届かない場合のため）
  if (req.method === "GET") await ensureRichMenu(`https://${req.headers["x-forwarded-host"] || req.headers.host}`);

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
    // アプリと連携した直後の初回は、LINEだけで記録していた分をアプリ側へ移しておく
    if (user.syncedTo !== user.appId) await saveUser(userId, user);
    if (action === "goal") {
      const [goal, membership] = await Promise.all([loadGoal(userId, user), computeMembership(userId, user)]);
      res.status(200).json({ ...goal, points: membership.points });
      return;
    }
    res.status(200).json({ ...view(user), hints: user.profile ? null : await appProfileHints(user.pid) });
    return;
  }

  if (req.method !== "POST") {
    res.status(405).end();
    return;
  }

  const body = await readJson(req);
  const user = await loadUser(userId);

  switch (body.action) {
    case "ai": {
      const prompt = String(body.prompt || "").slice(0, 20000);
      const img = body.image && /^image\/(jpeg|png|webp|gif)$/.test(body.image.mediaType) ? body.image : null;
      if (!prompt || (img && String(img.data || "").length > 4_000_000)) {
        res.status(400).json({ error: "画像が大きすぎます" });
        return;
      }
      const apiBody = {
        model: "claude-sonnet-5",
        max_tokens: Math.min(Number(body.maxTokens) || 1000, 4000),
        messages: [{ role: "user", content: [...(img ? [{ type: "image", source: { type: "base64", media_type: img.mediaType, data: img.data } }] : []), { type: "text", text: prompt }] }],
      };
      if (body.webSearch) apiBody.tools = [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }];
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
        body: JSON.stringify(apiBody),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        res.status(502).json({ error: data?.error?.message || `AI error (${r.status})` });
        return;
      }
      res.status(200).json({ text: (data.content || []).map(b => b.text || "").join("\n") });
      return;
    }
    case "appLink": {
      const tab = APP_TABS.includes(body.tab) ? body.tab : "status";
      const token = await createAppLoginToken(userId, user.pid);
      res.status(200).json({ url: `/?tab=${tab}&login=${token}` });
      return;
    }
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
      const which = PHOTO_SLOTS.includes(body.which) ? body.which : "before";
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
  res.status(200).json(view(user));
}
