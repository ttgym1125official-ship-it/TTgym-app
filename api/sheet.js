// Vercel Serverless Function — 顧客カルテ（/karte）が、元々ある顧客情報の Google スプレッドシートを読むための中継。
// ブラウザから直接 Google を読むと CORS で止まることがあるので、サーバーで CSV を取ってきて返すだけ。
//
// GET /api/sheet?url=<スプレッドシートのURL>
//   - 普通の共有リンク（https://docs.google.com/spreadsheets/d/<ID>/edit#gid=<シートID>）
//     → 「リンクを知っている全員が閲覧可」にしておく必要がある
//   - 「ウェブに公開」のリンク（https://docs.google.com/spreadsheets/d/e/<公開ID>/pub?...）
// 返り値: text/csv（読めなかったときは { error } の JSON）

function csvUrl(raw) {
  let u;
  try { u = new URL(String(raw || "")); } catch (e) { return null; }
  if (u.protocol !== "https:" || u.hostname !== "docs.google.com") return null;
  const gid = (u.hash.match(/gid=(\d+)/) || [])[1] || u.searchParams.get("gid") || "";
  const pub = u.pathname.match(/^\/spreadsheets\/d\/e\/([\w-]+)/);
  if (pub) return `https://docs.google.com/spreadsheets/d/e/${pub[1]}/pub?output=csv${gid ? `&gid=${gid}` : ""}`;
  const id = u.pathname.match(/^\/spreadsheets\/d\/([\w-]+)/);
  if (id) return `https://docs.google.com/spreadsheets/d/${id[1]}/export?format=csv${gid ? `&gid=${gid}` : ""}`;
  return null;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") {
    res.status(405).end();
    return;
  }
  const url = csvUrl(req.query.url);
  if (!url) {
    res.status(400).json({ error: "Google スプレッドシートのURLを入れてください" });
    return;
  }
  try {
    const r = await fetch(url, { redirect: "follow" });
    const type = r.headers.get("content-type") || "";
    // 共有されていないと、ログイン画面（HTML）が返ってくる
    if (!r.ok || type.includes("text/html")) {
      res.status(403).json({ error: "シートを読めませんでした。共有を「リンクを知っている全員（閲覧者）」にするか、「ウェブに公開」してください" });
      return;
    }
    const text = await r.text();
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.status(200).send(text);
  } catch (e) {
    res.status(502).json({ error: `シートの読み込みに失敗しました: ${e.message}` });
  }
}
