// 元々ある顧客情報のスプレッドシート（Google スプレッドシート / CSV）を読んで、カルテの顧客と突き合わせる。
// 列の名前はお店ごとに違うので、見出しの言葉から「名前」「残り回数」などの列を自動で見つける
// （設定画面で手動で選び直せる）。

export const SHEET_FIELDS = [
  { key: "name", label: "名前", words: ["氏名", "お名前", "名前", "顧客名", "会員名", "name"] },
  { key: "furigana", label: "フリガナ", words: ["フリガナ", "ふりがな", "カナ", "よみ"] },
  { key: "memberNo", label: "会員番号", words: ["会員番号", "顧客番号", "会員no", "会員id", "no.", "id"] },
  { key: "age", label: "年齢", words: ["年齢", "歳", "age"] },
  { key: "birthdate", label: "生年月日", words: ["生年月日", "誕生日", "birthday"] },
  { key: "tickets", label: "残り回数券", words: ["残り回数", "残回数", "残り", "回数券", "チケット", "残数"] },
  { key: "goal", label: "目標", words: ["目標", "目的", "ゴール", "goal"] },
  { key: "phone", label: "電話番号", words: ["電話", "携帯", "tel", "phone"] },
  { key: "plan", label: "プラン", words: ["プラン", "コース", "契約", "メニュー"] },
  { key: "startDate", label: "入会日", words: ["入会日", "開始日", "契約日", "入会"] },
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
  return { headerIdx, headers, columns };
}

export const normName = s => String(s || "").normalize("NFKC").replace(/[\s　・]+/g, "").toLowerCase();
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

// シートの1行 → { rowKey, name, furigana, age, birthdate, tickets, goal, phone, plan, startDate, raw }
export function sheetRecords(sheet) {
  if (!sheet?.rows?.length) return [];
  const { headerIdx = 0, columns = {} } = sheet;
  const headers = sheet.rows[headerIdx] || [];
  const at = (r, key) => (columns[key] != null ? String(r[columns[key]] ?? "").trim() : "");
  const seen = new Map();
  const out = [];
  for (const r of sheet.rows.slice(headerIdx + 1)) {
    const name = at(r, "name");
    if (!name) continue;
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
      plan: at(r, "plan"),
      startDate: toIsoDate(at(r, "startDate")),
      raw: Object.fromEntries(headers.map((h, i) => [String(h || `列${i + 1}`).trim(), String(r[i] ?? "").trim()]).filter(([, v]) => v)),
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
