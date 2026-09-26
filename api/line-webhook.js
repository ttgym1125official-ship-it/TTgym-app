// Vercel Serverless Function (Node.js runtime) — receives events from the
// TTGYM LINE Official Account (Messaging API) and either (a) links a LINE
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
//
// Then, in LINE Developers Console → Messaging API設定:
//   - Webhook URL: https://<your-domain>/api/line-webhook, then 検証 to confirm
//   - Webhookの利用: オン
// And in LINE Official Account Manager → 設定 → 応答設定:
//   - 応答メッセージ: オフ (otherwise LINE's own canned auto-reply fires too)
//   - Webhook: オン

import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

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
      if (event.type !== "message" || event.message?.type !== "text") continue;
      const lineUserId = event.source?.userId;
      const replyToken = event.replyToken;
      const text = (event.message.text || "").trim();
      if (!lineUserId || !replyToken) continue;

      const linkedProfileId = await kvGet(`line_user:${lineUserId}`);
      if (!linkedProfileId) {
        // Not linked yet. Stay silent on ordinary messages so staff can
        // reply to them by hand from LINE Official Account Manager's chat —
        // only answer when the customer sends what looks like their
        // 6-character linking code (from the app's 設定 screen) or asks
        // about 連携 in words.
        const normalized = text.normalize("NFKC").toUpperCase().replace(/\s/g, "");
        if (/^[A-Z0-9]{6}$/.test(normalized)) {
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
        } else if (/連携/.test(text)) {
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
