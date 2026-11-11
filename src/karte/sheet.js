// 元々ある顧客情報のスプレッドシート（Google スプレッドシート / CSV）を読んで、カルテの顧客と突き合わせる。
// 列の名前はお店ごとに違うので、見出しの言葉から「名前」「残り回数」などの列を自動で見つける
// （設定画面で手動で選び直せる）。

export const SHEET_FIELDS = [
  { key: "name", label: "名前", words: ["氏名", "お名前", "名前", "顧客名", "会員名", "お客様名", "お客様氏名", "name"] },
  { key: "furigana", label: "フリガナ", words: ["フリガナ", "ふりがな", "カナ", "よみ"] },
  { key: "memberNo", label: "会員番号", words: ["会員番号", "顧客番号", "会員no", "会員id", "no.", "id"] },
  { key: "age", label: "年齢", words: ["年齢", "歳", "age"] },
  { key: "birthdate", label: "生年月日", words: ["生年月日", "誕生日", "birthday"] },
  { key: "tickets", label: "残り回数券", words: ["残り回数", "残回数", "残り", "残数", "残り回数券", "チケット残"] },
  { key: "goal", label: "目標", words: ["目標", "目的", "ゴール", "goal"] },
  { key: "phone", label: "電話番号", words: ["電話", "携帯", "tel", "phone"] },
  { key: "plan", label: "プラン", words: ["プラン", "コース", "契約", "メニュー"] },
  { key: "startDate", label: "入会日", words: ["入会日", "開始日", "契約日", "入会"] },
  { key: "nextReserve", label: "次の予約", words: ["次の予約", "次回予約", "次回"] },
  { key: "lastVisit", label: "最終来店日", words: ["最後来た日", "最後来店日", "最終来店日", "最終来店", "前回来店", "来店日", "来た日"] },
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
// ticketsNextToName: 回数券のタブのように、名前のすぐ右が残り回数のとき（見出しが読めなくても数字の列なら残り回数とみなす）
export function detectColumns(rows, { ticketsNextToName = false } = {}) {
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
  if (ticketsNextToName && columns.tickets == null && columns.name != null && !used.has(columns.name + 1)) {
    const i = columns.name + 1;
    const filled = body.filter(r => String(r[columns.name] ?? "").trim());
    const nums = filled.filter(r => /^\d{1,3}$/.test(String(r[i] ?? "").normalize("NFKC").trim())).length;
    if (nums >= Math.max(1, filled.length * 0.5)) { columns.tickets = i; used.add(i); }
  }
  return { headerIdx, headers, columns };
}

// 名前の比べ方: 空白・「⭐︎」「✕」などの記号・（案件）のような括弧書きを外す
export const normName = s => String(s || "").normalize("NFKC").replace(/[(（][^)）]*[)）]/g, "").replace(/[^\p{L}\p{N}]+/gu, "").toLowerCase();
// 表示用: 前後の空白だけ外す（⭐︎や✕はシートの印なのでそのまま見せる）
const cleanName = s => String(s || "").replace(/^[\s　]+|[\s　]+$/g, "");

// No. のない行のうち、区切りの行（「VIP 週1回 4/30」「解約」「幽霊部員」など）の見分け方。
// それ以外の No. のない行（解約した人・番号なしで書いた人）はお客様として扱う
const SECTION_RE = /VIP|会員|週|回|名$|不定期|マーカー|案件|部員|解約|休会|退会|見込み|通い放題|更新|回数券|月額|\d/i;
// 「案件」の人はカルテに出さない
const isProject = (name, section, r) => /案件/.test(name) || /案件/.test(section) || r.some(c => String(c).trim() === "案件");
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
// past: 来店日のように必ず過去の日付（今日より後になるなら去年）
function toIsoDateLoose(v, { past = false } = {}) {
  const full = toIsoDate(v);
  if (full) return full;
  const m = String(v || "").normalize("NFKC").match(/^(\d{1,2})\/(\d{1,2})$/);
  if (!m) {
    // 「24/11/16」= 2024年11月16日
    const y2 = String(v || "").normalize("NFKC").match(/^(\d{2})\/(\d{1,2})\/(\d{1,2})$/);
    return y2 ? `20${y2[1]}-${y2[2].padStart(2, "0")}-${y2[3].padStart(2, "0")}` : null;
  }
  const now = new Date();
  let y = now.getFullYear();
  const t = Date.UTC(y, Number(m[1]) - 1, Number(m[2]));
  if (past ? t > now.getTime() + 86400000 : t - now.getTime() > 200 * 86400000) y--;
  else if (!past && now.getTime() - t > 200 * 86400000) y++;
  return `${y}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

// シートの1行 → { rowKey, name, furigana, age, birthdate, tickets, goal, phone, plan, startDate, raw }
// tab: { kind: "ticket" | "monthly", label } どのタブの人か（月額のタブは No. が回数券と重なるので行キーに付ける）
export function sheetRecords(sheet, tab = { kind: "ticket", label: "回数券" }) {
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
    // 「見込み」「3/25 更新」のような見出しの行は飛ばす（区切りは変えない）
    if (hasNo && !at(r, "memberNo") && /^(見込み|.*更新)$/.test(name.normalize("NFKC").trim())) continue;
    if (hasNo && !at(r, "memberNo") && SECTION_RE.test(name.normalize("NFKC"))) {
      // 「VIP　週1回　4 /30」「A会員　月1~2回　( 4 /40)」「不定期VIP　4名」→ 人数の部分を外す
      section = name.normalize("NFKC").replace(/\s*\(?\s*\d+\s*\/\s*\d+\s*\)?\s*$/, "").replace(/\s*\d+名$/, "").replace(/\s+/g, " ").trim();
      continue;
    }
    if (isProject(name, section, r)) continue;
    // 行を見分けるキー: 会員番号があればそれ、なければ名前（同じ名前が続いたら連番）。月額のタブは頭に monthly:
    let rowKey = (tab.kind === "monthly" ? "monthly:" : "") + (at(r, "memberNo") ? `no:${at(r, "memberNo")}` : `name:${normName(name)}`);
    const n = (seen.get(rowKey) || 0) + 1;
    seen.set(rowKey, n);
    if (n > 1) rowKey += `#${n}`;
    out.push({
      rowKey,
      order: out.length, // シートでの並び順
      kind: tab.kind,
      tabLabel: tab.label,
      section,
      name: cleanName(name),
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
      lastVisit: toIsoDateLoose(at(r, "lastVisit"), { past: true }),
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
