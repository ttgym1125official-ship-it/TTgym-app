// 元々ある顧客情報のスプレッドシート（Google スプレッドシート / CSV）を読んで、カルテの顧客と突き合わせる。
// 列の名前はお店ごとに違うので、見出しの言葉から「名前」「残り回数」などの列を自動で見つける
// （設定画面で手動で選び直せる）。

export const SHEET_FIELDS = [
  { key: "name", label: "名前", words: ["氏名", "お名前", "名前", "顧客名", "会員名", "お客様名", "お客様氏名", "name"] },
  { key: "furigana", label: "フリガナ", words: ["フリガナ", "ふりがな", "カナ", "よみ"] },
  { key: "memberNo", label: "会員番号", words: ["会員番号", "顧客番号", "会員no", "会員id", "no.", "id"] },
  { key: "age", label: "年齢", words: ["年齢", "歳", "age"] },
  { key: "birthdate", label: "生年月日", words: ["生年月日", "誕生日", "birthday"] },
  { key: "tickets", label: "残り回数券", words: ["残り回数", "残回数", "残り", "回数券", "チケット", "残数", "残"] },
  { key: "goal", label: "目標", words: ["目標", "目的", "ゴール", "goal"] },
  { key: "phone", label: "電話番号", words: ["電話", "携帯", "tel", "phone"] },
  { key: "plan", label: "プラン", words: ["プラン", "コース", "契約", "メニュー"] },
  { key: "startDate", label: "入会日", words: ["入会日", "開始日", "契約日", "入会"] },
  { key: "nextReserve", label: "次の予約", words: ["次の予約", "次回予約", "次回"] },
  { key: "lastVisit", label: "最終来店日", words: ["最後来店日", "最終来店日", "最終来店", "前回来店", "来店日"] },
];

// RFC 4180 の CSV（ダブルクォート・改行入りのセルに対応）
export function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  const s = String(text || "").replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => String(c).trim() !== ""));
}

const norm = s => String(s || "").normalize("NFKC").toLowerCase().replace(/[\s　]+/g, "");
const MEMBER_NO = /^(no\.?|#|会員)?\d{1,5}$/;
// 漢字・かな・カナだけの2〜12文字（「*井上久良々」のような印つきも）
const looksLikeName = v => /^[*＊※☆★◎○●]?[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}A-Za-zＡ-Ｚａ-ｚー々・ 　]{2,16}[*＊※☆★]?$/u.test(v) && !/[0-9０-９]/.test(v) && !/^(true|false)$/i.test(v) && !NOT_NAMES.test(v.normalize("NFKC").replace(/\s/g, ""));
// 名前と同じ「漢字2〜3文字」になりやすい、名前ではない値
const NOT_NAMES = /^(男性?|女性?|未|済|有|無|あり|なし|新規|継続|退会|休会|会員|VIP|.+[区市都県])$/i;

// 見出しの行（上から5行のうち、名前らしい列がある最初の行）と、各項目の列番号を見つける
export function detectColumns(rows) {
  const nameWords = SHEET_FIELDS[0].words;
  let headerIdx = rows.slice(0, 5).findIndex(r => r.some(c => nameWords.some(w => norm(c).includes(w))));
  if (headerIdx < 0) headerIdx = 0;
  const headers = (rows[headerIdx] || []).map(h => String(h).trim());
  const used = new Set();
  const columns = {};
  for (const f of SHEET_FIELDS) {
    // 完全一致を優先、なければ部分一致
    let idx = headers.findIndex((h, i) => !used.has(i) && f.words.some(w => norm(h) === w));
    if (idx < 0) idx = headers.findIndex((h, i) => !used.has(i) && f.words.some(w => norm(h).includes(w)));
    if (idx >= 0) { columns[f.key] = idx; used.add(idx); }
  }
  // 見出しが「16/60/250」のように名前と分からない列でも、中身から見つける
  // チェックボックスの列はシートの下までずっと FALSE が入っているので、TRUE/FALSE しかない行は数えない
  const body = rows.slice(headerIdx + 1).filter(r => r.some(c => { const v = String(c).trim().toUpperCase(); return v && v !== "TRUE" && v !== "FALSE"; }));
  // 当てはまる値の「種類の数」で比べる（「女性」「男性」や「港区」のように同じ値が並ぶ列を名前と間違えないように）
  const distinct = (i, test) => new Set(body.map(r => String(r[i] ?? "").trim()).filter(test)).size;
  const minN = Math.min(3, Math.max(1, body.length));
  const bestColumn = test => {
    let best = -1, bestN = 0;
    for (let i = 0; i < headers.length || i < (body[0] || []).length; i++) {
      if (used.has(i)) continue;
      const n = distinct(i, test);
      if (n > bestN) { best = i; bestN = n; }
    }
    return bestN >= minN ? best : -1;
  };
  if (columns.memberNo == null) {
    const i = bestColumn(v => MEMBER_NO.test(norm(v)));
    if (i >= 0) { columns.memberNo = i; used.add(i); }
  }
  // 名前は No. のすぐ右にあることが多いので、そこが名前らしければ優先する
  if (columns.name == null && columns.memberNo != null && !used.has(columns.memberNo + 1) && distinct(columns.memberNo + 1, looksLikeName) >= minN) {
    columns.name = columns.memberNo + 1; used.add(columns.name);
  }
  if (columns.name == null) {
    const i = bestColumn(looksLikeName);
    if (i >= 0) { columns.name = i; used.add(i); }
  }
  // それでも見つからなければ、No. の右隣を名前の列とみなす
  if (columns.name == null && columns.memberNo != null && !used.has(columns.memberNo + 1)) columns.name = columns.memberNo + 1;
  return { headerIdx, headers, columns };
}

export const normName = s => String(s || "").normalize("NFKC").replace(/[\s　・*※☆★]+/g, "").toLowerCase();
export const normPhone = s => String(s || "").replace(/\D/g, "");

const toNumber = v => {
  const m = String(v || "").replace(/[０-９．]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
};

// 2026/1/5・2026-01-05・2026年1月5日 → 2026-01-05
export function toIsoDate(v) {
  const m = String(v || "").match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : null;
}

// 「10/30」のような年なしの日付 → 近いほうの年で補う（未来すぎれば去年、過去すぎれば来年）
function toIsoDateLoose(v) {
  const full = toIsoDate(v);
  if (full) return full;
  const m = String(v || "").normalize("NFKC").match(/^(\d{1,2})\/(\d{1,2})$/);
  if (!m) return null;
  const now = new Date();
  let y = now.getFullYear();
  const t = Date.UTC(y, Number(m[1]) - 1, Number(m[2]));
  if (t - now.getTime() > 200 * 86400000) y--;
  else if (now.getTime() - t > 200 * 86400000) y++;
  return `${y}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

// シートの1行 → { rowKey, name, furigana, age, birthdate, tickets, goal, phone, plan, startDate, raw }
export function sheetRecords(sheet) {
  if (!sheet?.rows?.length) return [];
  const { headerIdx = 0, columns = {} } = sheet;
  // 見出しが空・名前と分からない列は、カルテでの表示名に置き換える
  const label = Object.fromEntries(SHEET_FIELDS.map(f => [columns[f.key], f.label]));
  const headers = (sheet.rows[headerIdx] || []).map((h, i) => {
    const t = String(h || "").trim();
    if (i === columns.name || i === columns.memberNo || !t) return label[i] || t;
    return t;
  });
  const at = (r, key) => (columns[key] != null ? String(r[columns[key]] ?? "").trim() : "");
  const seen = new Map();
  const out = [];
  // 会員番号の列があるときは、番号のない行（「VIP 週1回」のような区切りの行）はお客様ではなく、
  // その下のお客様の会員種別として使う
  const hasNo = columns.memberNo != null;
  let section = "";
  for (const r of sheet.rows.slice(headerIdx + 1)) {
    const name = at(r, "name");
    if (!name) continue;
    if (hasNo && !at(r, "memberNo")) {
      // 「VIP　週1回　4 /30」「A会員　月1~2回　( 4 /40)」「不定期VIP　4名」→ 人数の部分を外す
      section = name.normalize("NFKC").replace(/\s*\(?\s*\d+\s*\/\s*\d+\s*\)?\s*$/, "").replace(/\s*\d+名$/, "").replace(/\s+/g, " ").trim();
      continue;
    }
    // 行を見分けるキー: 会員番号があればそれ、なければ名前（同じ名前が続いたら連番）
    let rowKey = at(r, "memberNo") ? `no:${at(r, "memberNo")}` : `name:${normName(name)}`;
    const n = (seen.get(rowKey) || 0) + 1;
    seen.set(rowKey, n);
    if (n > 1) rowKey += `#${n}`;
    out.push({
      rowKey,
      name,
      furigana: at(r, "furigana"),
      memberNo: at(r, "memberNo"),
      age: toNumber(at(r, "age")),
      birthdate: toIsoDate(at(r, "birthdate")),
      tickets: at(r, "tickets") ? toNumber(at(r, "tickets")) : null,
      goal: at(r, "goal"),
      phone: at(r, "phone"),
      plan: at(r, "plan") || section,
      startDate: toIsoDate(at(r, "startDate")),
      nextReserve: at(r, "nextReserve"),
      lastVisit: toIsoDateLoose(at(r, "lastVisit")),
      // チェックボックスは ✓ に、空・未チェックは出さない
      raw: Object.fromEntries(headers.map((h, i) => [String(h || `列${i + 1}`).trim(), String(r[i] ?? "").trim()])
        .filter(([, v]) => v && v.toUpperCase() !== "FALSE").map(([k, v]) => [k, v.toUpperCase() === "TRUE" ? "✓" : v])),
    });
  }
  return out;
}

export async function fetchSheetCsv(url) {
  const res = await fetch(`/api/sheet?url=${encodeURIComponent(url)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `シートを読めませんでした (${res.status})`);
  }
  return res.text();
}
