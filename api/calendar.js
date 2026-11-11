// Vercel Serverless Function — 顧客カルテ（/karte）の「本日の予約」に、Google カレンダーの予定を出すための中継。
// Google カレンダーの「設定と共有」→「iCal 形式の非公開URL」を、カルテの設定に保存しておく。
//
// GET /api/calendar?url=<iCalのURL>&date=2026-11-11
//   → { date, events: [{ summary, start: "10:00", end: "11:00", allDay, location, description }] }
import { parseIcs, eventsOn } from "./_lib/ics.js";

function icsUrl(raw) {
  let u;
  try { u = new URL(String(raw || "").trim().replace(/^webcal:/, "https:")); } catch (e) { return null; }
  if (u.protocol !== "https:" || u.hostname !== "calendar.google.com" || !u.pathname.startsWith("/calendar/ical/")) return null;
  return u.toString();
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") {
    res.status(405).end();
    return;
  }
  const url = icsUrl(req.query.url);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date || "")) ? req.query.date : new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  if (!url) {
    res.status(400).json({ error: "Googleカレンダーの「iCal形式の非公開URL」を入れてください（https://calendar.google.com/calendar/ical/… で始まるURL）" });
    return;
  }
  try {
    const r = await fetch(url, { redirect: "follow" });
    const text = await r.text();
    if (!r.ok || !text.includes("BEGIN:VCALENDAR")) {
      res.status(403).json({ error: "カレンダーを読めませんでした。「iCal形式の非公開URL」をもう一度コピーしてください" });
      return;
    }
    res.status(200).json({ date, events: eventsOn(parseIcs(text), date) });
  } catch (e) {
    res.status(502).json({ error: `カレンダーの読み込みに失敗しました: ${e.message}` });
  }
}
