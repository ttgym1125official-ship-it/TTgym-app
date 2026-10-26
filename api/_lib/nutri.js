// LINE食事記録（TTGYM 健康ダッシュボード）のサーバー側共通処理。
// api/line-webhook.js と api/nutrition.js から読み込む（_lib 配下は Vercel の関数にはならない）。
//
// データは既存アプリと同じ Supabase kv_store に、LINEユーザーごとに保存する:
//   nutri:<LINE userId>                 → { profile, meals, weights, water, goal }
//   nutri_img:<LINE userId>:<meal id>   → 食事写真のサムネイル(dataURL)
//   nutri_photo:<LINE userId>:before|after → ビフォーアフター写真(dataURL)
// 公式アプリと連携済み（line_user:<LINE userId> がある）の人は、目標・ビフォーアフター写真を
// アプリのプロフィール（profile:<id>）に読み書きして、アプリ側と同じものを表示する。

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { NUTRIENTS, NUTRIENT_KEYS, calcTargets, sumMeals, buildAdvice, fmt } from "../../src/liff/nutrients.js";
import { computePoints } from "../../src/membership.js";

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

export async function loadUser(lineUserId) {
  const raw = await kvGet(`nutri:${lineUserId}`);
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch (e) { data = {}; }
  return {
    profile: data.profile || null, meals: data.meals || [], weights: data.weights || [],
    water: data.water || {}, goal: data.goal || {},
  };
}

export async function saveUser(lineUserId, data) {
  await kvSet(`nutri:${lineUserId}`, JSON.stringify({
    profile: data.profile, meals: data.meals, weights: data.weights, water: data.water || {}, goal: data.goal || {},
  }));
}

function parseJson(raw, fallback) {
  try { return raw ? JSON.parse(raw) : fallback; } catch (e) { return fallback; }
}

// ── 目標・ビフォーアフター・メンバーシップ ──
const GOAL_FIELDS = ["goal", "targetWeight", "targetBodyFat", "afterMonths"];

export async function linkedProfileId(lineUserId) {
  return kvGet(`line_user:${lineUserId}`);
}

export async function loadGoal(lineUserId, user) {
  const pid = await linkedProfileId(lineUserId);
  if (pid) {
    const p = parseJson(await kvGet(`profile:${pid}`), {});
    return {
      linked: true,
      goal: { goal: p.goal || "", targetWeight: p.targetWeight ?? null, targetBodyFat: p.targetBodyFat ?? null, afterMonths: p.afterMonths || "" },
      photos: { before: p.beforePhoto || null, after: p.afterPhoto || null },
    };
  }
  const [before, after] = await Promise.all([kvGet(`nutri_photo:${lineUserId}:before`), kvGet(`nutri_photo:${lineUserId}:after`)]);
  const g = user.goal || {};
  return {
    linked: false,
    goal: { goal: g.goal || "", targetWeight: g.targetWeight ?? user.profile?.targetWeight ?? null, targetBodyFat: g.targetBodyFat ?? null, afterMonths: g.afterMonths || "" },
    photos: { before: before || null, after: after || null },
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

export async function savePhoto(lineUserId, which, dataUrl) {
  const pid = await linkedProfileId(lineUserId);
  if (pid) {
    const p = parseJson(await kvGet(`profile:${pid}`), { id: pid });
    await kvSet(`profile:${pid}`, JSON.stringify({ ...p, [which === "before" ? "beforePhoto" : "afterPhoto"]: dataUrl }));
  } else if (dataUrl) {
    await kvSet(`nutri_photo:${lineUserId}:${which}`, dataUrl);
  } else {
    await kvDelete(`nutri_photo:${lineUserId}:${which}`);
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
  const id = process.env.LIFF_ID || process.env.VITE_LIFF_ID;
  return id ? `https://liff.line.me/${id}${path}` : null;
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
  const textBlock = message.content.find(b => b.type === "text");
  return JSON.parse(textBlock.text);
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
