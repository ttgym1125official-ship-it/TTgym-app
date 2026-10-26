// Vercel Serverless Function (Node.js runtime) — receives events from the
// TTGYM LINE Official Account (Messaging API). Food photos / "昼食 牛丼並と味噌汁"
// style messages, corrections to the last meal, and weight / body-composition
// readings are recorded for the 健康ダッシュボード (LIFF, src/liff) — see
// handleNutrition below and api/_lib/nutri.js. Everything else either (a) links a LINE
// user to an app profile via a one-time code the customer types into LINE
// (shown to them in the app's 設定 screen — see LineLinkSection in App.jsx;
// unlinked customers get no automatic reply unless they send a code or ask
// about 連携), or (b) answers a free-form question about that customer's own recorded
// data, using the same Supabase kv_store the rest of the app reads/writes.
//
// Required Vercel environment variables (Project Settings → Environment
// Variables — set these directly there; never commit real values to git):
//   LINE_CHANNEL_SECRET        — LINE Developers Console → チャネル → Messaging API設定
//   LINE_CHANNEL_ACCESS_TOKEN  — same tab, "チャネルアクセストークン(長期)" → 発行
//   ANTHROPIC_API_KEY          — a server-side Anthropic API key (separate from
//                                 any key a customer enters inside the app itself)
//   LIFF_ID                    — LIFF app ID of the 健康ダッシュボード (same value as
//                                 VITE_LIFF_ID); used for the "ダッシュボードを開く" links
//
// Then, in LINE Developers Console → Messaging API設定:
//   - Webhook URL: https://<your-domain>/api/line-webhook, then 検証 to confirm
//   - Webhookの利用: オン
// And in LINE Official Account Manager → 設定 → 応答設定:
//   - 応答メッセージ: オフ (otherwise LINE's own canned auto-reply fires too)
//   - Webhook: オン

import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  loadUser, saveUser, jstNow, newId, reply, showLoading, fetchLineImage, analyzeMessage,
  normalizeItems, buildMealReply, dashboardButton, liffUrl, calcTargets, kvSet as nutriKvSet,
} from "./_lib/nutri.js";

// Same public project URL/publishable key already embedded in the client
// bundle (src/supabaseClient.js) — this one is meant to be public, so
// duplicating it here needs no secret handling.
const SUPABASE_URL = "https://udfbnjatqjdswokuoqoo.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable__rOCDCsWxALHCdQbYfGcBg_7TPateU2";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function kvGet(key) {
  const { data, error } = await supabase.from("kv_store").select("value").eq("key", key).maybeSingle();
  if (error || !data) return null;
  return data.value;
}

async function kvSet(key, value) {
  const { error } = await supabase
    .from("kv_store")
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw error;
}

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  return Buffer.concat(chunks);
}

function verifySignature(rawBody, signatureHeader, channelSecret) {
  if (!signatureHeader || !channelSecret) return false;
  const expected = crypto.createHmac("sha256", channelSecret).update(rawBody).digest("base64");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
  } catch (e) {
    return false; // e.g. length mismatch
  }
}

async function replyToLine(replyToken, text) {
  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({ replyToken, messages: [{ type: "text", text: String(text).slice(0, 4900) }] }),
  });
}

async function callClaudeText(prompt) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 700,
      messages: [{ role: "user", content: [{ type: "text", text: prompt }] }],
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || `API error (${response.status})`);
  return (data.content || []).map(b => b.text || "").join("\n").trim();
}

function safeJson(value, fallback) {
  try { return JSON.parse(value); } catch (e) { return fallback; }
}

// Keeps the prompt small: the customer is asking about recent activity, not
// their entire history, so older entries are dropped before building context.
function recent(list, days) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return (list || []).filter(item => {
    const d = new Date(`${item.date || item.createdAt || ""}T00:00:00`);
    return !isNaN(d.getTime()) && d.getTime() >= cutoff;
  });
}

async function answerFromData(profileId, question) {
  const [profileRaw, mealsRaw, workoutsRaw, sessionsRaw, conditionsRaw, growthRaw] = await Promise.all([
    kvGet(`profile:${profileId}`),
    kvGet(`data:${profileId}:meals`),
    kvGet(`data:${profileId}:workouts`),
    kvGet(`data:${profileId}:sessions`),
    kvGet(`data:${profileId}:conditions`),
    kvGet(`data:${profileId}:growth`),
  ]);
  const profile = safeJson(profileRaw, {});
  const context = {
    お客様名: profile.name || null,
    目標: {
      カロリー: profile.targetCalories, タンパク質: profile.targetProtein,
      脂質: profile.targetFat, 炭水化物: profile.targetCarb,
    },
    直近30日の食事記録: recent(safeJson(mealsRaw, []), 30),
    直近30日のトレーニング記録: recent(safeJson(workoutsRaw, []), 30),
    直近30日のセッション記録: recent(safeJson(sessionsRaw, []), 30),
    直近30日の体調記録: recent(safeJson(conditionsRaw, []), 30),
    直近の体組成記録: safeJson(growthRaw, []).slice(0, 10),
  };
  const prompt = `あなたはTTGYMというパーソナルジムの公式LINEアカウントとして、お客様からの質問にLINEのトーク画面で返信します。
以下はこのお客様のアプリ内の記録データ(JSON)です:
${JSON.stringify(context)}

お客様からの質問:「${question}」

このデータだけを根拠に、日本語で簡潔に(LINEのトーク吹き出しに収まる程度、目安200文字以内)答えてください。データに答えがない場合は、正直に「記録が見つかりませんでした」のように伝えてください。数値は分かりやすく整理して答えてください。絵文字は使わなくて構いません。`;
  return await callClaudeText(prompt);
}

// ── 健康ダッシュボード（食事・体重の記録）──

function welcomeMessage() {
  const dashboard = liffUrl("");
  const profile = liffUrl("/profile");
  const buttons = [
    profile && { type: "button", style: "primary", color: "#111814", height: "md", action: { type: "uri", label: "プロフィールを登録する", uri: profile } },
    dashboard && { type: "button", style: "secondary", color: "#E6E3DC", height: "md", margin: "sm", action: { type: "uri", label: "今日の栄養を見る", uri: dashboard } },
  ].filter(Boolean);
  return {
    type: "flex",
    altText: "TTGYMへようこそ。食事の写真を送るだけで、栄養を品目ごとに分析します。",
    contents: {
      type: "bubble",
      header: {
        type: "box", layout: "vertical", backgroundColor: "#111814", paddingAll: "20px",
        contents: [
          { type: "text", text: "TTGYM", color: "#C9A86A", size: "xs", weight: "bold" },
          { type: "text", text: "強い身体は、\n毎日の食事から。", color: "#FFFFFF", size: "lg", weight: "bold", wrap: true, margin: "md" },
        ],
      },
      body: {
        type: "box", layout: "vertical", spacing: "sm", paddingAll: "20px",
        contents: [
          { type: "text", text: "TTGYMの公式LINEでは、トレーニングと合わせて毎日の食事と体をサポートします。", size: "sm", wrap: true, color: "#333333" },
          { type: "text", text: "・食事の写真を送るだけで、栄養を品目ごとに分析\n・今日の栄養・週の推移・体重をこのLINEで確認\n・「体重 64.5」と送れば体重も記録", size: "sm", wrap: true, color: "#333333", margin: "md" },
          { type: "text", text: "まずはプロフィールを登録して、あなた専用の目標を作りましょう。", size: "xs", wrap: true, color: "#888888", margin: "md" },
        ],
      },
      footer: buttons.length ? { type: "box", layout: "vertical", paddingAll: "16px", contents: buttons } : undefined,
    },
  };
}

function parseBodyText(text) {
  const t = text.normalize("NFKC");
  const w = t.match(/体重\s*[:：]?\s*(\d{2,3}(?:\.\d+)?)/);
  const f = t.match(/体脂肪(?:率)?\s*[:：]?\s*(\d{1,2}(?:\.\d+)?)/);
  if (!w && !f) return null;
  return { weight: w ? Number(w[1]) : 0, bodyFat: f ? Number(f[1]) : 0 };
}

// 「水 500ml」「お水500」「水分 1.5L」「水 コップ1杯」など
function parseWaterText(text) {
  const t = text.normalize("NFKC").replace(/\s/g, "");
  const m = t.match(/^(?:水|お水|水分|飲んだ水)[:：]?(\d+(?:\.\d+)?)(ml|mL|ミリ|cc|l|L|リットル)?$/);
  if (m) {
    const v = Number(m[1]);
    const ml = /^(l|L|リットル)$/.test(m[2] || "") || (!m[2] && v < 10) ? v * 1000 : v;
    return ml > 0 && ml <= 5000 ? Math.round(ml) : null;
  }
  const cup = t.match(/^(?:水|お水|水分)(?:コップ)?(\d+)杯$/);
  return cup ? Number(cup[1]) * 200 : null;
}

async function recordBody(lineUserId, user, replyToken, weight, bodyFat) {
  const now = jstNow();
  const entry = { id: newId(), date: now.date, weight: weight || null, bodyFat: bodyFat || null };
  if (!entry.weight) {
    const last = [...user.weights].sort((a, b) => (a.date < b.date ? 1 : -1)).find(x => x.weight);
    entry.weight = last?.weight || user.profile?.weight || null;
  }
  user.weights = [...user.weights.filter(x => x.date !== now.date), entry];
  if (entry.weight && user.profile) user.profile = { ...user.profile, weight: entry.weight };
  await saveUser(lineUserId, user);
  const parts = [entry.weight && `体重 ${entry.weight}kg`, entry.bodyFat && `体脂肪率 ${entry.bodyFat}%`].filter(Boolean);
  const msgs = [`${parts.join("、")}を記録しました。推移はダッシュボードの「履歴 → 体重」で確認できます。`];
  const btn = dashboardButton("体重の推移を見る");
  if (btn) msgs.push(btn);
  await reply(replyToken, msgs, lineUserId);
}

// リッチメニューのリンク未設定のタイルは、この言葉をメッセージとして送る。
// スタッフがチャットで手動対応できるよう、AIは返事をしない
const MENU_WORDS = new Set(["予約", "オススメ健康ショップ", "TEAM TOPメンバー参加申込み"]);

// 戻り値 true = このメッセージは食事/体重の記録として処理した（または意図的に何もしない）
async function handleNutrition(event, lineUserId, replyToken, linkedProfileId) {
  const isImage = event.message.type === "image";
  const text = isImage ? "" : (event.message.text || "").trim();
  if (MENU_WORDS.has(text)) return true;
  const user = await loadUser(lineUserId);

  if (!isImage) {
    const waterMl = parseWaterText(text);
    if (waterMl) {
      const now = jstNow();
      user.water = { ...user.water, [now.date]: (user.water[now.date] || 0) + waterMl };
      await saveUser(lineUserId, user);
      await reply(replyToken, `お水 ${waterMl}ml を記録しました（今日の合計 ${user.water[now.date].toLocaleString("ja-JP")}ml）。`, lineUserId);
      return true;
    }
    const body = parseBodyText(text);
    if (body && text.length <= 30) {
      await recordBody(lineUserId, user, replyToken, body.weight, body.bodyFat);
      return true;
    }
  }

  await showLoading(lineUserId);
  const now = jstNow();
  let images = [];
  let thumb = null;
  if (isImage) {
    const img = await fetchLineImage(event.message.id);
    images = [img.full];
    thumb = img.thumb;
  }
  const todayMeals = user.meals.filter(m => m.date === now.date);
  const lastMeal = [...user.meals].sort((a, b) => (`${a.date} ${a.time}` < `${b.date} ${b.time}` ? 1 : -1))[0] || null;
  const result = await analyzeMessage({ images, text, todayMeals, lastMeal, targets: calcTargets(user.profile), now });

  if (result.intent === "body") {
    await recordBody(lineUserId, user, replyToken, result.weight, result.bodyFat);
    return true;
  }

  if ((result.intent === "meal" || result.intent === "correction") && result.items?.length) {
    const isCorrection = result.intent === "correction" && lastMeal;
    let meal;
    if (isCorrection) {
      meal = { ...lastMeal, title: result.title || lastMeal.title, items: normalizeItems(result.items) };
      user.meals = user.meals.map(m => (m.id === lastMeal.id ? meal : m));
    } else {
      meal = {
        id: newId(), date: now.date, time: now.time, label: result.mealLabel || "食事",
        title: result.title || "食事", hasImage: !!thumb, note: text, items: normalizeItems(result.items),
      };
      user.meals = [...user.meals, meal];
      if (thumb) await nutriKvSet(`nutri_img:${lineUserId}:${meal.id}`, `data:${thumb.mediaType};base64,${thumb.data}`);
    }
    await saveUser(lineUserId, user);
    const msgs = [buildMealReply({ result, meal, user, isCorrection: !!isCorrection })];
    const btn = dashboardButton();
    if (btn) msgs.push(btn);
    await reply(replyToken, msgs, lineUserId);
    return true;
  }

  if (isImage) {
    await reply(replyToken, "写真から食事を読み取れませんでした。料理がはっきり写るように撮るか、「昼食 牛丼並と味噌汁」のように文章で送ってください。", lineUserId);
    return true;
  }

  // 雑談・質問: アプリ連携済みなら下の既存の Q&A に任せる。未連携なら AI の短い返事を返す
  if (linkedProfileId) return false;
  if (result.replyText) await reply(replyToken, result.replyText, lineUserId);
  return true;
}

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(200).send("OK");
    return;
  }

  const rawBody = await readRawBody(req);
  const signature = req.headers["x-line-signature"];
  if (!verifySignature(rawBody, signature, process.env.LINE_CHANNEL_SECRET)) {
    res.status(401).send("invalid signature");
    return;
  }

  let body;
  try {
    body = JSON.parse(rawBody.toString("utf8"));
  } catch (e) {
    res.status(200).send("OK");
    return;
  }

  const events = body.events || [];
  for (const event of events) {
    try {
      if (event.type === "follow") {
        if (event.replyToken) await reply(event.replyToken, [welcomeMessage()]);
        continue;
      }
      const msgType = event.message?.type;
      if (event.type !== "message" || (msgType !== "text" && msgType !== "image")) continue;
      const lineUserId = event.source?.userId;
      const replyToken = event.replyToken;
      const text = msgType === "text" ? (event.message.text || "").trim() : "";
      if (!lineUserId || !replyToken) continue;

      const linkedProfileId = await kvGet(`line_user:${lineUserId}`);
      const normalized = text.normalize("NFKC").toUpperCase().replace(/\s/g, "");
      const isLinkCode = !linkedProfileId && /^[A-Z0-9]{6}$/.test(normalized);
      const asksLink = !linkedProfileId && /連携/.test(text);

      if (!isLinkCode && !asksLink) {
        if (await handleNutrition(event, lineUserId, replyToken, linkedProfileId)) continue;
      }

      if (!linkedProfileId) {
        // Not linked yet: only the 6-character linking code (from the app's
        // 設定 screen) or a question about 連携 reach here.
        if (isLinkCode) {
          const profileId = await kvGet(`line_link_code:${normalized}`);
          if (profileId) {
            await kvSet(`line_user:${lineUserId}`, profileId);
            const profileRaw = await kvGet(`profile:${profileId}`);
            const profile = safeJson(profileRaw, {});
            await kvSet(`profile:${profileId}`, JSON.stringify({ ...profile, lineUserId }));
            await replyToLine(replyToken, "連携が完了しました!これからLINEでお気軽に「今週の食事の合計カロリーは?」のように話しかけてください。");
          } else {
            await replyToLine(replyToken, "連携コードが見つかりませんでした。TTGYMアプリの「設定」画面に表示されている6文字のコードを、もう一度そのまま送ってください。");
          }
        } else if (asksLink) {
          await replyToLine(replyToken, "TTGYMアプリの「設定」画面(右上の歯車)に表示されている連携コード(6文字)を、このトークにそのまま送ってください。送るだけで連携が完了します。");
        }
        continue;
      }

      const answer = await answerFromData(linkedProfileId, text);
      await replyToLine(replyToken, answer || "うまく答えられませんでした。もう一度お試しください。");
    } catch (e) {
      try {
        if (event.replyToken) await replyToLine(event.replyToken, "エラーが発生しました。しばらくしてからもう一度お試しください。");
      } catch (e2) {
        // give up silently — LINE will not retry indefinitely and we've
        // already responded 200 below so the webhook itself won't be
        // marked as failing.
      }
    }
  }

  res.status(200).send("OK");
}
