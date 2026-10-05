// Vercel Cron Job (see "crons" in vercel.json) — runs daily at 08:00 JST
// (23:00 UTC) and, whenever a recipe's publishAt has just passed (normally
// Saturday), broadcasts that 週刊 Body Make Recipe to every
// friend of the TTGYM LINE Official Account: the recipe card image, then the
// title, nutrition and TTGYM's Point as text.
//
// Required Vercel environment variables:
//   LINE_CHANNEL_ACCESS_TOKEN — same one api/line-webhook.js uses
//   CRON_SECRET (optional)    — if set, Vercel sends it as
//                                "Authorization: Bearer <CRON_SECRET>" and other
//                                callers are rejected. Without it the endpoint is
//                                open, which is harmless: it only ever sends the
//                                already-due vol, and each vol at most once.
//
// .github/workflows/weekly-recipe-backup.yml calls this endpoint as well, as a
// backup in case the Vercel cron does not fire; a failure there shows up as a
// failed GitHub Actions run (and a notification email to the repo owner).
//
// Each broadcast counts one message per friend against the LINE plan's
// monthly quota. A vol is only ever sent once (tracked in kv_store under
// `recipe_broadcast:vol<N>`), so a duplicate or retried cron call is a no-op.

import { createClient } from "@supabase/supabase-js";
import { publishedRecipes, recipeImage, recipeMessageText } from "../src/recipes.js";

const SUPABASE_URL = "https://udfbnjatqjdswokuoqoo.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable__rOCDCsWxALHCdQbYfGcBg_7TPateU2";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Don't send a recipe that went live more than this long ago (e.g. after the
// cron was paused for a while) — the customers would get a stale week.
const MAX_LATENESS_MS = 2 * 24 * 60 * 60 * 1000;

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

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    res.status(401).send("unauthorized");
    return;
  }

  const now = new Date();
  // `?vol=N` sends that (already published) vol even if it is past
  // MAX_LATENESS — used to catch up a week that failed to go out.
  const requestedVol = Number(req.query?.vol);
  const recipe = requestedVol
    ? publishedRecipes(now).find(r => r.vol === requestedVol)
    : publishedRecipes(now)[0];
  if (!recipe || (!requestedVol && now.getTime() - new Date(recipe.publishAt).getTime() > MAX_LATENESS_MS)) {
    res.status(200).json({ sent: false, reason: requestedVol ? `vol.${requestedVol} is not published` : "no recipe due this week" });
    return;
  }

  const sentKey = `recipe_broadcast:vol${recipe.vol}`;
  if (await kvGet(sentKey)) {
    res.status(200).json({ sent: false, reason: `vol.${recipe.vol} already sent` });
    return;
  }

  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL || req.headers.host;
  const image = path => ({ type: "image", originalContentUrl: `https://${host}${path}`, previewImageUrl: `https://${host}${path}` });
  const response = await fetch("https://api.line.me/v2/bot/message/broadcast", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
      "X-Line-Retry-Key": crypto.randomUUID(),
    },
    body: JSON.stringify({
      messages: [
        image(recipeImage(recipe)),
        { type: "text", text: recipeMessageText(recipe) },
      ],
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    console.error(`weekly-recipe: LINE broadcast of vol.${recipe.vol} failed`, response.status, detail);
    res.status(502).json({ sent: false, vol: recipe.vol, status: response.status, detail });
    return;
  }

  await kvSet(sentKey, now.toISOString());
  res.status(200).json({ sent: true, vol: recipe.vol });
}
