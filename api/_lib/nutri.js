// LINE食事記録（TTGYM 健康ダッシュボード）のサーバー側共通処理。
// api/line-webhook.js と api/nutrition.js から読み込む（_lib 配下は Vercel の関数にはならない）。
//
// データは既存アプリと同じ Supabase kv_store に、LINEユーザーごとに保存する:
//   nutri:<LINE userId>                 → { profile, meals, weights, water, goal }
//   nutri_img:<LINE userId>:<meal id>   → 食事写真のサムネイル(dataURL)
//   nutri_photo:<LINE userId>:<slot> → ビフォーアフター写真(dataURL)。slot は before|before_side|before_back|after|…
//   profile_photo:<アプリ会員ID>:<slot> → 連携済みの人の横・後ろの写真（正面は profile の beforePhoto/afterPhoto）
// 公式アプリと連携済み（line_user:<LINE userId> がある）の人は、目標・ビフォーアフター写真を
// アプリのプロフィール（profile:<id>）に読み書きして、アプリ側と同じものを表示する。

import crypto from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { NUTRIENTS, NUTRIENT_KEYS, calcTargets, sumMeals, buildAdvice, fmt } from "../../src/liff/nutrients.js";
import { computePoints } from "../../src/membership.js";
import { LIFF_ID } from "../../src/lineConfig.js";

const SUPABASE_URL = "https://udfbnjatqjdswokuoqoo.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable__rOCDCsWxALHCdQbYfGcBg_7TPateU2";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export async function kvGet(key) {
  const { data, error } = await supabase.from("kv_store").select("value").eq("key", key).maybeSingle();
  if (error || !data) return null;
  return data.value;
}

export async function kvSet(key, value) {
  const { error } = await supabase
    .from("kv_store")
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw error;
}

export async function kvDelete(key) {
  await supabase.from("kv_store").delete().eq("key", key);
}

// ── アプリ連携（line_user:<LINE userId> → アプリのプロフィールID）──
// 連携済みの人は、体重（成長タブの growth）と水分（water）はアプリのデータを正として読み書きし、
// 食事は LINE で記録したものをアプリの meals にも "line-" 付きのIDで書き写す。
// アプリで記録した食事は "app-" 付きのIDでダッシュボードにも表示する。
const SALT_PER_MG_SODIUM = 1 / 393.4; // ナトリウム(mg) → 食塩相当量(g)

function appMealToLine(m) {
  const n = Object.fromEntries(NUTRIENT_KEYS.map(k => [k, 0]));
  Object.assign(n, {
    fiber: Number(m.fiber) || 0, sugar: Number(m.sugar) || 0, salt: (Number(m.sodium) || 0) * SALT_PER_MG_SODIUM,
    potassium: Number(m.potassium) || 0, vitA: Number(m.vitaminA) || 0, vitC: Number(m.vitaminC) || 0,
    calcium: Number(m.calcium) || 0, iron: Number(m.iron) || 0,
  });
  return {
    id: `app-${m.id}`, source: "app", date: m.date, time: m.time || "12:00", label: "食事", title: m.name || "食事", hasImage: false,
    items: [{ id: `app-${m.id}-0`, name: m.name || "食事", amount: "アプリで記録", kcal: Number(m.calories) || 0, p: Number(m.protein) || 0, f: Number(m.fat) || 0, c: Number(m.carb) || 0, n }],
  };
}

function lineMealToApp(m) {
  const t = sumMeals([m]);
  return {
    id: `line-${m.id}`, source: "line", date: m.date, time: m.time, name: m.title,
    calories: Math.round(t.kcal), protein: round1(t.p), fat: round1(t.f), carb: round1(t.c),
    fiber: round1(t.n.fiber), sugar: round1(t.n.sugar), sodium: Math.round(t.n.salt / SALT_PER_MG_SODIUM),
    potassium: Math.round(t.n.potassium), vitaminA: Math.round(t.n.vitA), vitaminC: Math.round(t.n.vitC),
    calcium: Math.round(t.n.calcium), iron: round1(t.n.iron), warning: false,
  };
}

const round1 = v => Math.round((Number(v) || 0) * 10) / 10;
const appKey = (pid, k) => `data:${pid}:${k}`;

// アプリ未連携の人も、体調・トレーニング・成長などのページ（/liff/condition など）を使えるように、
// アプリと同じ形のデータを data:line_<LINE userId>:<key> に持つ。連携したらアプリ会員側へ移す
export const virtualId = lineUserId => `line_${lineUserId}`;
export const APP_DATA_KEYS = ["meals", "water", "conditions", "growth", "workouts", "monthly", "sessions", "personalLogs", "comments"];

async function migrateVirtual(lineUserId, pid) {
  const from = virtualId(lineUserId);
  await Promise.all(APP_DATA_KEYS.map(async k => {
    const src = parseJson(await kvGet(appKey(from, k)), null);
    if (!src) return;
    const dst = parseJson(await kvGet(appKey(pid, k)), null);
    let merged;
    if (Array.isArray(src)) {
      const have = new Set((dst || []).map(x => x.id));
      merged = [...(dst || []), ...src.filter(x => !have.has(x.id) && !(k === "meals" && String(x.id).startsWith("line-")))];
    } else {
      merged = { ...(dst || {}) };
      for (const [d, v] of Object.entries(src)) merged[d] = (Number(merged[d]) || 0) + (Number(v) || 0);
    }
    await kvSet(appKey(pid, k), JSON.stringify(merged));
    await kvDelete(appKey(from, k)); // 二重に移さないように消す
  }));
}

export async function loadUser(lineUserId) {
  const [raw, pid] = await Promise.all([kvGet(`nutri:${lineUserId}`), kvGet(`line_user:${lineUserId}`)]);
  const data = parseJson(raw, {});
  const appId = pid || virtualId(lineUserId);
  const user = {
    profile: data.profile || null, meals: data.meals || [], weights: data.weights || [],
    water: data.water || {}, goal: data.goal || {}, pid: pid || null, appId, syncedTo: data.syncedTo || null,
    line: data.line || null, followedAt: data.followedAt || null, unfollowedAt: data.unfollowedAt || null,
  };
  // アプリと連携した直後は、未連携の間に使っていた分をアプリ会員へ移す
  if (pid && user.syncedTo === virtualId(lineUserId)) await migrateVirtual(lineUserId, pid);

  const [mealsRaw, growthRaw, waterRaw] = await Promise.all(["meals", "growth", "water"].map(k => kvGet(appKey(appId, k))));
  const appMeals = parseJson(mealsRaw, []).filter(m => !String(m.id).startsWith("line-")).map(appMealToLine);
  const growth = parseJson(growthRaw, []);
  const appWater = parseJson(waterRaw, {});
  // 一度もどこにも同期していない人だけ、LINE側（nutri:）に付けていた体重・水分を移す
  const firstSync = !user.syncedTo;
  user.meals = [...user.meals.filter(m => m.source !== "app"), ...appMeals];
  user._appMealIds = appMeals.map(m => m.id);
  const growthWeights = growth.filter(g => g.weight || g.bodyFat).map(g => ({ id: g.id, date: g.date, weight: g.weight ?? null, bodyFat: g.bodyFat ?? null }));
  const growthDates = new Set(growthWeights.map(w => w.date));
  user.weights = [...growthWeights, ...(firstSync ? user.weights.filter(w => !growthDates.has(w.date)) : [])];
  user._growthIds = growth.map(g => g.id);
  if (firstSync) {
    const merged = { ...appWater };
    for (const [d, ml] of Object.entries(user.water)) merged[d] = (merged[d] || 0) + ml;
    user.water = merged;
  } else {
    user.water = appWater;
  }
  user._waterDates = Object.keys(appWater);
  return user;
}

export async function saveUser(lineUserId, data) {
  // 連携を外したとき（pid: null で保存）は、LINE専用のデータ置き場に切り替える
  const appId = data.pid || virtualId(lineUserId);
  const switched = data.appId && data.appId !== appId;
  await kvSet(`nutri:${lineUserId}`, JSON.stringify({
    // 未連携の人の体重・水分は、念のためLINE側にも控えを残す
    profile: data.profile, meals: data.meals.filter(m => m.source !== "app"), weights: data.pid ? [] : data.weights,
    water: data.pid ? {} : data.water || {}, goal: data.goal || {}, syncedTo: appId,
    line: data.line || null, followedAt: data.followedAt || null, unfollowedAt: data.unfollowedAt || null,
  }));
  await syncToApp(switched ? { ...data, appId, _appMealIds: [], _growthIds: [], _waterDates: [] } : { ...data, appId });
}

// アプリ側の配列は、アプリを開いている間に追加された分を消さないよう、最新を読み直してから差分だけ反映する
async function syncToApp(user) {
  const pid = user.appId;
  const [mealsRaw, growthRaw, waterRaw] = await Promise.all(["meals", "growth", "water"].map(k => kvGet(appKey(pid, k))));

  const keptAppIds = new Set(user.meals.filter(m => m.source === "app").map(m => m.id));
  const removedAppIds = new Set((user._appMealIds || []).filter(id => !keptAppIds.has(id)));
  const appMeals = parseJson(mealsRaw, [])
    .filter(m => !String(m.id).startsWith("line-") && !removedAppIds.has(`app-${m.id}`));
  const lineMeals = user.meals.filter(m => m.source !== "app").map(lineMealToApp);

  const keptWeightIds = new Set(user.weights.map(w => w.id));
  const removedGrowthIds = new Set((user._growthIds || []).filter(id => !keptWeightIds.has(id)));
  const allGrowth = parseJson(growthRaw, []);
  // 同じ日の記録を体重だけ上書きしたときに、アプリで入れた筋量・体脂肪率が消えないよう引き継ぐ
  const replaced = Object.fromEntries(allGrowth.filter(g => removedGrowthIds.has(g.id)).map(g => [g.date, g]));
  const growth = allGrowth.filter(g => !removedGrowthIds.has(g.id));
  const growthIds = new Set(growth.map(g => g.id));
  for (const w of user.weights) {
    if (!growthIds.has(w.id)) {
      const prev = replaced[w.date] || {};
      growth.push({ id: w.id, date: w.date, weight: w.weight ?? null, bodyFat: w.bodyFat ?? prev.bodyFat ?? null, muscleMass: prev.muscleMass ?? null });
    }
  }

  const water = { ...parseJson(waterRaw, {}), ...user.water };
  for (const d of user._waterDates || []) if (!(d in user.water)) delete water[d];

  await Promise.all([
    kvSet(appKey(pid, "meals"), JSON.stringify([...appMeals, ...lineMeals].sort((a, b) => (`${b.date} ${b.time}` > `${a.date} ${a.time}` ? 1 : -1)))),
    kvSet(appKey(pid, "growth"), JSON.stringify(growth)),
    kvSet(appKey(pid, "water"), JSON.stringify(water)),
  ]);
}

// アプリのプロフィールから、プロフィール登録画面の初期値（年齢・体重・体脂肪率）を作る
export async function appProfileHints(pid) {
  if (!pid) return null;
  const [pRaw, gRaw] = await Promise.all([kvGet(`profile:${pid}`), kvGet(appKey(pid, "growth"))]);
  const p = parseJson(pRaw, {});
  const latest = [...parseJson(gRaw, [])].sort((a, b) => (a.date < b.date ? 1 : -1));
  let age = null;
  if (p.birthdate) {
    const b = new Date(`${p.birthdate}T00:00:00Z`), now = new Date();
    age = now.getUTCFullYear() - b.getUTCFullYear() - (now < new Date(Date.UTC(now.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate())) ? 1 : 0);
  }
  return {
    name: p.name || null, age,
    weight: latest.find(g => g.weight)?.weight ?? null,
    bodyFat: latest.find(g => g.bodyFat)?.bodyFat ?? null,
    targetWeight: p.targetWeight ?? null,
  };
}

// アプリを「このLINEの人」として開くための使い捨てトークン（10分有効）。
// 連携済みならプロフィールIDを、未連携ならLINEユーザーIDを渡し、アプリ側で登録後に自動で連携する
export async function createAppLoginToken(lineUserId, pid) {
  const token = crypto.randomBytes(18).toString("base64url");
  await kvSet(`app_login:${token}`, JSON.stringify({ lineUserId, pid: pid || null, exp: Date.now() + 10 * 60 * 1000 }));
  return token;
}

function parseJson(raw, fallback) {
  try { return raw ? JSON.parse(raw) : fallback; } catch (e) { return fallback; }
}

// ── 目標・ビフォーアフター・メンバーシップ ──
const GOAL_FIELDS = ["goal", "targetWeight", "targetBodyFat", "afterMonths"];

export async function linkedProfileId(lineUserId) {
  return kvGet(`line_user:${lineUserId}`);
}

// ビフォーアフター写真: 正面は従来どおり（アプリの beforePhoto / afterPhoto と共通）、横・後ろは別キー
export const PHOTO_SLOTS = ["before", "before_side", "before_back", "after", "after_side", "after_back"];
const photoKey = (lineUserId, pid, slot) => (pid ? `profile_photo:${pid}:${slot}` : `nutri_photo:${lineUserId}:${slot}`);

export async function loadGoal(lineUserId, user) {
  const pid = await linkedProfileId(lineUserId);
  // 連携前にLINEだけで登録した写真は、連携後も（アプリ側が空なら）そのまま見せる
  const read = async s => (await kvGet(photoKey(lineUserId, pid, s))) || (pid ? await kvGet(photoKey(lineUserId, null, s)) : null) || null;
  const extra = async slots => Object.fromEntries(await Promise.all(slots.map(async s => [s, await read(s)])));
  if (pid) {
    const p = parseJson(await kvGet(`profile:${pid}`), {});
    return {
      linked: true,
      goal: { goal: p.goal || "", targetWeight: p.targetWeight ?? null, targetBodyFat: p.targetBodyFat ?? null, afterMonths: p.afterMonths || "" },
      photos: {
        ...(await extra(["before_side", "before_back", "after_side", "after_back"])),
        before: p.beforePhoto || (await read("before")),
        after: p.afterPhoto || (await read("after")),
      },
    };
  }
  const g = user.goal || {};
  return {
    linked: false,
    goal: { goal: g.goal || "", targetWeight: g.targetWeight ?? user.profile?.targetWeight ?? null, targetBodyFat: g.targetBodyFat ?? null, afterMonths: g.afterMonths || "" },
    photos: await extra(PHOTO_SLOTS),
  };
}

export async function saveGoal(lineUserId, user, patch) {
  const clean = Object.fromEntries(Object.entries(patch).filter(([k]) => GOAL_FIELDS.includes(k)));
  const pid = await linkedProfileId(lineUserId);
  if (pid) {
    const p = parseJson(await kvGet(`profile:${pid}`), { id: pid });
    await kvSet(`profile:${pid}`, JSON.stringify({ ...p, ...clean }));
  } else {
    user.goal = { ...(user.goal || {}), ...clean };
    await saveUser(lineUserId, user);
  }
  if ("targetWeight" in clean && user.profile) {
    user.profile = { ...user.profile, targetWeight: clean.targetWeight };
    await saveUser(lineUserId, user);
  }
}

export async function savePhoto(lineUserId, slot, dataUrl) {
  const pid = await linkedProfileId(lineUserId);
  if (pid && (slot === "before" || slot === "after")) {
    const p = parseJson(await kvGet(`profile:${pid}`), { id: pid });
    await kvSet(`profile:${pid}`, JSON.stringify({ ...p, [slot === "before" ? "beforePhoto" : "afterPhoto"]: dataUrl }));
  } else if (dataUrl) {
    await kvSet(photoKey(lineUserId, pid, slot), dataUrl);
  } else {
    await kvDelete(photoKey(lineUserId, pid, slot));
  }
}

// アプリ連携済みならアプリの記録（パーソナル・自宅トレーニング・月次測定・スタッフ調整）も含めて、
// アプリと同じ式で計算する。LINEだけの人は、体組成を記録した月を「月次測定」として数える。
export async function computeMembership(lineUserId, user) {
  const now = jstNow();
  const yesterday = new Date(Date.parse(`${now.date}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
  const recentDates = [now.date, yesterday];
  const lineDates = [...user.meals.map(m => m.date), ...user.weights.map(w => w.date), ...Object.keys(user.water || {})];
  const pid = await linkedProfileId(lineUserId);
  if (pid) {
    const keys = ["meals", "conditions", "workouts", "growth", "sessions", "monthly"];
    const [profileRaw, ...raws] = await Promise.all([kvGet(`profile:${pid}`), ...keys.map(k => kvGet(`data:${pid}:${k}`))]);
    const d = Object.fromEntries(keys.map((k, i) => [k, parseJson(raws[i], [])]));
    const activeDates = new Set([...d.meals, ...d.conditions, ...d.workouts, ...d.growth].map(x => x.date).concat(lineDates));
    const points = computePoints({
      sessions: d.sessions, workouts: d.workouts, monthlyCount: d.monthly.length, activeDates, recentDates,
      adjustment: parseJson(profileRaw, {}).pointAdjustment || 0,
    });
    return { points, linked: true };
  }
  const months = new Set(user.weights.map(w => w.date.slice(0, 7)));
  const points = computePoints({ monthlyCount: months.size, activeDates: new Set(lineDates), recentDates });
  return { points, linked: false };
}

// ── 日付（日本時間）──
export function jstNow() {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const iso = d.toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16), hour: d.getUTCHours() };
}

export function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ── LINE Messaging API ──
const LINE_API = "https://api.line.me/v2/bot";

async function lineFetch(path, body) {
  const res = await fetch(`${LINE_API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}` },
    body: JSON.stringify(body),
  });
  return res.ok;
}

export async function reply(replyToken, messages, fallbackUserId) {
  const msgs = (Array.isArray(messages) ? messages : [messages]).map(m =>
    typeof m === "string" ? { type: "text", text: m.slice(0, 4900) } : m,
  );
  const ok = await lineFetch("/message/reply", { replyToken, messages: msgs });
  // 解析に時間がかかって reply token が失効した場合だけ push で送り直す
  if (!ok && fallbackUserId) await lineFetch("/message/push", { to: fallbackUserId, messages: msgs });
  if (fallbackUserId) await appendLog(fallbackUserId, msgs.map(m => ({ from: "bot", text: m.type === "text" ? m.text : `［${m.altText || m.type}］` })));
}

export async function push(lineUserId, text) {
  return lineFetch("/message/push", { to: lineUserId, messages: [{ type: "text", text: String(text).slice(0, 4900) }] });
}

// ── 管理画面向け: LINEのプロフィールとやりとりの記録 ──
// line_log:<LINE userId> に直近100件（{ at, from: "user"|"bot"|"staff"|"system", text }）を残す
export async function appendLog(lineUserId, entries) {
  try {
    const at = new Date().toISOString();
    const log = parseJson(await kvGet(`line_log:${lineUserId}`), []);
    const next = [...log, ...entries.map(e => ({ at, ...e, text: String(e.text || "").slice(0, 1500) }))].slice(-100);
    await kvSet(`line_log:${lineUserId}`, JSON.stringify(next));
  } catch (e) { /* 記録に失敗しても返信は続ける */ }
}

export async function fetchLineProfile(lineUserId) {
  try {
    const res = await fetch(`${LINE_API}/profile/${lineUserId}`, { headers: { Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}` } });
    if (!res.ok) return null;
    const p = await res.json();
    return { displayName: p.displayName || "", pictureUrl: p.pictureUrl || null, fetchedAt: new Date().toISOString() };
  } catch (e) {
    return null;
  }
}

// LINEの表示名・アイコンを7日に1回取り直して保存する（管理画面の一覧に使う）
export async function refreshLineProfile(lineUserId, user) {
  const stale = !user.line?.fetchedAt || Date.now() - Date.parse(user.line.fetchedAt) > 7 * 86400000;
  if (!stale) return;
  const line = await fetchLineProfile(lineUserId);
  if (line) {
    user.line = line;
    await saveUser(lineUserId, user);
  }
}

export async function showLoading(lineUserId, seconds = 60) {
  try { await lineFetch("/chat/loading/start", { chatId: lineUserId, loadingSeconds: seconds }); } catch (e) { /* 表示できなくても処理は続ける */ }
}

async function fetchLineContent(messageId, preview) {
  const url = `https://api-data.line.me/v2/bot/message/${messageId}/content${preview ? "/preview" : ""}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}` } });
  if (!res.ok) throw new Error(`LINE content ${res.status}`);
  const mediaType = (res.headers.get("content-type") || "image/jpeg").split(";")[0];
  const data = Buffer.from(await res.arrayBuffer()).toString("base64");
  return { mediaType, data };
}

export async function fetchLineImage(messageId) {
  const full = await fetchLineContent(messageId, false);
  let thumb = null;
  try { thumb = await fetchLineContent(messageId, true); } catch (e) { thumb = null; }
  return { full, thumb: thumb || full };
}

export function liffUrl(path = "") {
  const id = process.env.LIFF_ID || process.env.VITE_LIFF_ID || LIFF_ID;
  return `https://liff.line.me/${id}${path}`;
}

// ── Claude による食事・体組成の解析 ──
const anthropic = new Anthropic();

const NUM = { type: "number" };
const ITEM_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["name", "amount", "grams", "kcal", "p", "f", "c", "n"],
  properties: {
    name: { type: "string" },
    amount: { type: "string" },
    grams: NUM, kcal: NUM, p: NUM, f: NUM, c: NUM,
    n: {
      type: "object",
      additionalProperties: false,
      required: NUTRIENT_KEYS,
      properties: Object.fromEntries(NUTRIENT_KEYS.map(k => [k, NUM])),
    },
  },
};

const RESULT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["intent", "title", "mealLabel", "items", "basisNote", "comment", "suggestions", "closing", "weight", "bodyFat", "replyText"],
  properties: {
    intent: { type: "string", enum: ["meal", "correction", "body", "other"] },
    title: { type: "string" },
    mealLabel: { type: "string", enum: ["朝食", "昼食", "夕食", "間食", "食事"] },
    items: { type: "array", items: ITEM_SCHEMA },
    basisNote: { type: "string" },
    comment: { type: "string" },
    suggestions: { type: "array", items: { type: "string" } },
    closing: { type: "string" },
    weight: NUM,
    bodyFat: NUM,
    replyText: { type: "string" },
  },
};

const NUTRIENT_GUIDE = NUTRIENTS.map(d => `${d.key}=${d.name}(${d.unit})`).join(", ");

const SYSTEM_PROMPT = `あなたはパーソナルジム「TTGYM」の公式LINEで、お客様の食事記録と栄養管理をサポートする管理栄養士です。
お客様から届いた写真や文章を読み取り、指定のJSON形式だけで答えてください。

## intent の判定
- meal: 食事・飲み物の写真、または「昼食 牛丼並と味噌汁」のように食べたものを伝える文章
- correction: 直前に記録した食事への訂正（「エビじゃなくてイカ」「ご飯は半分」「ドレッシングなし」など）
- body: 体重計・体組成計の画面の写真、または「体重 64.5」「体脂肪 15%」のような体の数値
- other: 上記以外（質問・あいさつ・雑談など）

## meal / correction のとき
- 料理を品目ごとに分け、それぞれの重さ(g)を写真の見た目や一般的な盛り付け量から見積もってください。
  ドレッシング・ソース・下味の油や調味料も、使われていそうなら独立した品目にします。
- name は「赤飯（小豆ご飯）」「ジャークチキン（鶏もも皮つき焼き）」のように、料理名（食品成分表での食品名）の形にします。
- amount は「ドーム型1盛・200g」「1切れ大・150g」「大さじ1・15g」のように、量の目安と重さを「・」でつなげます。
- 各品目の kcal・たんぱく質p(g)・脂質f(g)・炭水化物c(g) と、n に次の36項目の量を、日本食品標準成分表（八訂 増補2023年）の値と見積もった重さから計算してください。
  コンビニ・チェーン店の商品とわかる場合は、各社の栄養成分表示の値を優先してください。
  ${NUTRIENT_GUIDE}
  sugar は糖質(利用可能炭水化物)、salt は食塩相当量です。含まれない栄養素は 0 にします。
- correction のときは、直前の食事の内容に訂正を反映した「食事全体」の items を出し直してください。
- title は「赤飯・ジャークチキン ほか6品」のように主な2品＋残りの品数（2品以下なら品名だけ）。
- mealLabel は時刻と内容から判断（はっきりしなければ「食事」）。
- basisNote は「鶏もも150g、赤飯200g、ポテト3切れ、ドレッシング大さじ1で計算しています。量が違っていたら教えてください。」の形。
- comment は、この食事を含めた今日の累計を見て、よく摂れている点を1〜2文でほめる（例:「朝からタンパク質、鉄、亜鉛がしっかり摂れていて好スタートです！」）。
- suggestions は次の食事の提案を2〜3個。「鮭おにぎり2個＋さば缶か焼き鮭（ビタミンD、炭水化物）」のように、食べ物と補える栄養素をかっこで書く。
- closing は残りの量に触れたひとこと（例:「間食もうまく使っていきましょう。」）。
- weight と bodyFat は 0、replyText は空文字。

## body のとき
- weight に体重(kg)、bodyFat に体脂肪率(%)を入れます（読み取れない方は 0）。items は空配列、その他の文字列は空文字。

## other のとき
- replyText に、TTGYMのスタッフとして2〜3文の短く親しみやすい返事を書きます。
  食事の記録方法を聞かれたら「食事の写真を送るか、『昼食 牛丼並と味噌汁』のように送ると記録できます」と案内します。
  あなたが答えられない内容（予約・料金など）は「スタッフから改めてご連絡します」と伝えます。
- items は空配列、weight と bodyFat は 0、その他の文字列は空文字。`;

function summarizeForPrompt(meals) {
  return meals.map(m => `${m.time} ${m.title}: ${m.items.map(i => `${i.name}（${i.amount}）`).join("、")}`).join("\n") || "（まだ記録なし）";
}

// images: [{ mediaType, data }] / text: お客様の文章
export async function analyzeMessage({ images = [], text = "", todayMeals = [], lastMeal = null, targets, now }) {
  const totals = sumMeals(todayMeals);
  const context = [
    `現在: ${now.date} ${now.time}（日本時間）`,
    targets
      ? `1日の目標: ${targets.kcal}kcal / たんぱく質${targets.p}g / 脂質${targets.f}g / 炭水化物${targets.c}g`
      : "1日の目標: 未登録（一般的な成人の目安で考えてください）",
    `今日これまでの記録（この投稿より前）: 合計 ${Math.round(totals.kcal)}kcal, P${fmt(totals.p)}g, F${fmt(totals.f)}g, C${fmt(totals.c)}g\n${summarizeForPrompt(todayMeals)}`,
    lastMeal ? `直前に記録した食事: ${lastMeal.date} ${lastMeal.time} ${lastMeal.title}\n${lastMeal.items.map(i => `- ${i.name}（${i.amount}）`).join("\n")}` : "直前に記録した食事: なし",
  ].join("\n\n");

  const content = [
    ...images.map(img => ({ type: "image", source: { type: "base64", media_type: img.mediaType, data: img.data } })),
    { type: "text", text: `${context}\n\nお客様からの投稿: ${text ? `「${text}」` : "（写真のみ）"}` },
  ];

  try {
    const stream = anthropic.beta.messages.stream({
      model: "claude-opus-5-5",
      max_tokens: 32000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: RESULT_SCHEMA } },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content }],
    });
    const message = await stream.finalMessage();
    if (message.stop_reason === "refusal") throw new Error("refusal");
    return JSON.parse(message.content.find(b => b.type === "text").text);
  } catch (e) {
    // 1回目が失敗したら（モデルの混雑・設定の違いなど）、構造化出力なしの普通の呼び出しでやり直す
    const first = e?.message || String(e);
    try {
      return await analyzePlain(content);
    } catch (e2) {
      throw new Error(`AI解析に失敗: ${first} / 再試行: ${e2?.message || e2}`);
    }
  }
}

// 予備: JSONの形を文章で指示して、返ってきた文字列からJSONを取り出す
async function analyzePlain(content) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 8000,
      system: `${SYSTEM_PROMPT}

## 出力形式
次のJSONスキーマに合うJSONオブジェクトだけを出力してください（前後に説明文やコードブロックは付けない）。
${JSON.stringify(RESULT_SCHEMA)}`,
      messages: [{ role: "user", content }],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `API error (${res.status})`);
  const text = (data.content || []).map(b => b.text || "").join("");
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  const r = JSON.parse(json);
  return {
    intent: ["meal", "correction", "body", "other"].includes(r.intent) ? r.intent : "other",
    title: r.title || "", mealLabel: r.mealLabel || "食事", items: Array.isArray(r.items) ? r.items : [],
    basisNote: r.basisNote || "", comment: r.comment || "", suggestions: Array.isArray(r.suggestions) ? r.suggestions : [],
    closing: r.closing || "", weight: Number(r.weight) || 0, bodyFat: Number(r.bodyFat) || 0, replyText: r.replyText || "",
  };
}

// 手入力・お店メニューの品目（名前とPFCは確定）に、36項目の栄養素だけをAIで見積もる。
// 失敗したら 0 のまま（カロリー・PFCは入力どおり記録される）
const ESTIMATE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: { items: { type: "array", items: { type: "object", additionalProperties: false, required: ["n"], properties: { n: ITEM_SCHEMA.properties.n } } } },
};

export async function estimateNutrients(items) {
  try {
    const list = items.map((it, i) => `${i + 1}. ${it.name}${it.amount ? `（${it.amount}）` : ""}: ${Math.round(it.kcal)}kcal, P${it.p}g, F${it.f}g, C${it.c}g`).join("\n");
    const stream = anthropic.beta.messages.stream({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: ESTIMATE_SCHEMA } },
      system: `あなたは管理栄養士です。食品名とカロリー・PFCから、日本食品標準成分表（八訂 増補2023年）をもとに各品目の栄養素量を見積もり、同じ順番で items に入れてください。\n${NUTRIENT_GUIDE}\nsugar は糖質、salt は食塩相当量です。`,
      messages: [{ role: "user", content: list }],
    });
    const message = await stream.finalMessage();
    if (message.stop_reason === "refusal") return items;
    const out = JSON.parse(message.content.find(b => b.type === "text").text).items || [];
    return items.map((it, i) => ({ ...it, n: out[i]?.n || it.n }));
  } catch (e) {
    return items;
  }
}

export function normalizeItems(items) {
  return (items || []).map(it => ({
    id: newId(),
    name: String(it.name || "").slice(0, 80),
    amount: String(it.amount || "").slice(0, 60),
    grams: Number(it.grams) || 0,
    kcal: Math.max(0, Number(it.kcal) || 0),
    p: Math.max(0, Number(it.p) || 0),
    f: Math.max(0, Number(it.f) || 0),
    c: Math.max(0, Number(it.c) || 0),
    n: Object.fromEntries(NUTRIENT_KEYS.map(k => [k, Math.max(0, Number(it.n?.[k]) || 0)])),
  }));
}

// ── 返信メッセージ ──
const pct = (v, t) => (t ? Math.round((v / t) * 100) : 0);

export function buildMealReply({ result, meal, user, isCorrection }) {
  const targets = calcTargets(user.profile);
  const todays = user.meals.filter(m => m.date === meal.date);
  const t = sumMeals(todays);
  const lines = [];
  const head = isCorrection ? "内容を直して記録し直しました" : "を記録しました";
  lines.push(
    isCorrection
      ? `${meal.title}の${head}（約${Math.round(sumMeals([meal]).kcal)}kcal、タンパク質${fmt(sumMeals([meal]).p)}g）。`
      : `${meal.title}${head}（約${Math.round(sumMeals([meal]).kcal)}kcal、タンパク質${fmt(sumMeals([meal]).p)}g）。`,
  );
  if (result.basisNote) lines.push("", result.basisNote);

  if (!targets) {
    lines.push("", `今日の累計: ${Math.round(t.kcal)}kcal（P${fmt(t.p)}g・F${fmt(t.f)}g・C${fmt(t.c)}g）`);
    lines.push("", "メニューの「目標設定」から体の情報を登録すると、目標に対する過不足もお伝えできます。");
    return lines.join("\n");
  }

  lines.push(
    "",
    "今日の累計",
    `・カロリー ${Math.round(t.kcal)}/${targets.kcal}kcal（${pct(t.kcal, targets.kcal)}%）`,
    `・タンパク質 ${fmt(t.p)}/${targets.p}g（${pct(t.p, targets.p)}%）`,
    `・脂質 ${fmt(t.f)}/${targets.f}g（${pct(t.f, targets.f)}%）`,
    `・炭水化物 ${fmt(t.c)}/${targets.c}g（${pct(t.c, targets.c)}%）`,
  );
  const good = NUTRIENTS
    .filter(d => d.kind === "target" && ["iron", "zinc", "calcium", "vitD", "vitC", "fiber"].includes(d.key))
    .map(d => ({ d, p: pct(t.n[d.key], targets.n[d.key]) }))
    .filter(x => x.p >= 50)
    .slice(0, 2);
  if (good.length) lines.push(`・${good.map(x => `${x.d.name === "鉄" ? "鉄分" : x.d.name} ${x.p}%`).join("、")}`);
  if (result.comment) lines.push("", result.comment);

  const lows = NUTRIENTS
    .filter(d => d.kind === "target")
    .map(d => ({ d, p: pct(t.n[d.key], targets.n[d.key]) }))
    .filter(x => x.p < 50)
    .sort((a, b) => a.p - b.p)
    .slice(0, 3);
  if (lows.length) {
    lines.push("", "不足しそうなのはこのあたりです。", ...lows.map(x => `・${x.d.name} ${x.p}%`));
  }
  if (result.suggestions?.length) lines.push("", "次の食事の提案", ...result.suggestions.map(s => `・${s}`));

  const remainK = Math.max(0, Math.round((targets.kcal - t.kcal) / 10) * 10);
  const remainP = Math.max(0, Math.round(targets.p - t.p));
  lines.push("", `残りは約${remainK}kcal、タンパク質は約${remainP}gです。${result.closing || ""}`);
  return lines.join("\n");
}

export function dashboardButton(label = "今日の栄養を見る") {
  const url = liffUrl("");
  if (!url) return null;
  return {
    type: "template",
    altText: label,
    template: { type: "buttons", text: "グラフと36項目の栄養素はダッシュボードで確認できます", actions: [{ type: "uri", label, uri: url }] },
  };
}

export { buildAdvice, calcTargets, sumMeals };
