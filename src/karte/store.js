// 顧客カルテ（/karte）のデータの読み書き。
// アプリ・公式LINE・管理画面と同じ Supabase の kv_store を使い、同じキーに読み書きするので、
// カルテで付けた記録はアプリ・LINEにもそのまま出る（逆も同じ）。
//
// お客様の見分け方（cid）と記録の置き場所（dataId → data:<dataId>:<項目>）
//   アプリ会員           m:<会員ID>        → <会員ID>
//   公式LINEだけの人     l:<LINE userId>   → line_<LINE userId>（LINEのページと同じ）
//   スプレッドシートだけ s:<行キー>        → sheet_<行キー>
//
// カルテで新しく増えるキー
//   karte:<dataId>                → { tickets, ticketLog, note, noteUpdatedAt, lastVisit, goal(シートだけの人) }
//   data:<dataId>:karteSessions   → 毎回のセッション（メニュー・コメント・スタッフメモ。メモはお客様には見せない）
//   karte_photo:<dataId>:<枠>     → シートだけの人のビフォーアフター写真
//   global:karteSheet             → 読み込んだスプレッドシート { tabs: [{ kind, label, url, rows, headerIdx, columns }] }
//   global:karteToday:<日付>      → 本日の予約に手で追加した人 { items: [{ cid, time }] }
//   global:karteCalendar          → Google カレンダーの iCal URL { url }
//   global:karteCalendarMap       → カレンダーの予定名 → お客様（cid）の覚えた対応
//   global:karteSheetLinks        → { cid: 行キー } 名前で自動で合わなかった人の手動の紐付け
//   global:karteMenus             → 追加したメニュー
//   global:karteStaff             → スタッフの名前
import { supabase } from "../supabaseClient.js";
import { sheetRecords, normName, normPhone, parseCsv, detectColumns, fetchSheetCsv } from "./sheet.js";

// TTGYM の顧客スプレッドシートの「回数券顧客情報」「月額顧客情報」タブ。設定で別のURLを保存したらそちらを使う
const SHEET_BASE = "https://docs.google.com/spreadsheets/d/1QRSPuzpMT3gRgXyuxZbjNHyNeSxHUddZw9_4LSERQEs/edit";
export const DEFAULT_SHEET_TABS = [
  { kind: "ticket", label: "回数券", url: `${SHEET_BASE}#gid=1425518766` },
  { kind: "monthly", label: "月額", url: `${SHEET_BASE}#gid=238812232` },
];
export const DEFAULT_SHEET_URL = DEFAULT_SHEET_TABS[0].url;

const parse = (raw, fb) => { try { return raw ? JSON.parse(raw) : fb; } catch (e) { return fb; } };

// /karte?demo=1 のときは Supabase ではなく、このページの中だけのサンプルデータを使う
const demo = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("demo") ? new Map() : null;
export const isDemo = !!demo;
export const seedDemo = entries => { for (const [k, v] of Object.entries(entries)) demo.set(k, typeof v === "string" ? v : JSON.stringify(v)); };

async function rawGet(key) {
  if (demo) return demo.get(key) ?? null;
  const { data, error } = await supabase.from("kv_store").select("value").eq("key", key).maybeSingle();
  if (error) throw error;
  return data?.value ?? null;
}

async function rawSet(key, value) {
  if (demo) { demo.set(key, value); return; }
  const { error } = await supabase
    .from("kv_store")
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw error;
}

// 前方一致でまとめて読む（1人ずつ読むと人数ぶん待つので）
async function kvPrefix(prefix) {
  if (demo) return [...demo].filter(([k]) => k.startsWith(prefix)).map(([key, value]) => ({ key, value }));
  const out = [];
  const pattern = `${prefix.replace(/[\\%_]/g, c => `\\${c}`)}%`;
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("kv_store").select("key,value").like("key", pattern).range(from, from + 999);
    if (error) throw error;
    out.push(...(data || []).filter(r => r.key.startsWith(prefix)));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export async function kvGet(key, fb = null) {
  return parse(await rawGet(key), fb);
}

export const kvSet = (key, value) => rawSet(key, JSON.stringify(value));

// 最新の値を読んでから書き換える（その間にアプリやLINEから増えた記録を消さないため）
export async function kvUpdate(key, fb, fn) {
  const next = fn(await kvGet(key, fb));
  await kvSet(key, next);
  return next;
}

export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export const jstToday = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

export function calcAge(birthdate) {
  if (!birthdate) return null;
  const b = new Date(`${birthdate}T00:00:00`);
  if (isNaN(b.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) age--;
  return age;
}

const sheetDataId = rowKey => `sheet_${rowKey.replace(/[^\w぀-ヿ一-鿿#-]/g, "_")}`;

// 以前の保存形式（タブ1つ）→ タブの配列
export function sheetTabs(cached) {
  const saved = cached?.tabs || (cached?.rows ? [{ ...cached, kind: "ticket", label: "回数券" }] : []);
  return DEFAULT_SHEET_TABS.map(def => {
    const t = saved.find(x => x.kind === def.kind) || {};
    // タブ指定のないURL（以前の既定）は、決まったタブのURLに直す
    const url = t.url?.startsWith("https://") && t.url.includes("gid=") ? t.url : def.url;
    return { ...t, ...def, url };
  });
}

// カルテを開くたびにスプレッドシートを読み直す（シートで名前や回数を直したら、そのままカルテに出る）。
// 読めなかったタブは前回読んだ内容を使う
async function syncSheet(cached) {
  const tabs = sheetTabs(cached);
  if (demo) return { sheet: { tabs }, error: null };
  const errors = [];
  const next = await Promise.all(tabs.map(async tab => {
    try {
      const rows = parseCsv(await fetchSheetCsv(tab.url));
      const det = detectColumns(rows, { ticketsNextToName: tab.kind === "ticket" });
      // 設定画面で手で選び直した列の対応だけを引き継ぐ（自動判定の結果は毎回やり直す）
      const keep = tab.manual && tab.rows && JSON.stringify(tab.rows[tab.headerIdx]) === JSON.stringify(rows[det.headerIdx]);
      const out = { ...tab, fetchedAt: new Date().toISOString(), rows, headerIdx: keep ? tab.headerIdx : det.headerIdx, columns: keep ? tab.columns : det.columns, manual: !!keep };
      if (rows.length > 1 && out.columns.name == null) errors.push(`${tab.label}: 名前の列が見つかりませんでした（設定で選んでください）`);
      return out;
    } catch (e) {
      errors.push(`${tab.label}: ${e.message}`);
      return tab;
    }
  }));
  const sheet = { tabs: next };
  if (JSON.stringify(next.map(t => [t.url, t.rows, t.columns])) !== JSON.stringify(sheetTabs(cached).map(t => [t.url, t.rows, t.columns]))) {
    await kvSet("global:karteSheet", sheet).catch(() => {});
  }
  return { sheet, error: errors.join(" / ") || null };
}

// 2つの名前がどれくらい似ているか（同じ文字が続く一番長い部分の長さ）。LINEの名前と名簿の名前の候補出しに使う
export function nameScore(a, b) {
  const x = normName(a), y = normName(b);
  if (!x || !y) return 0;
  if (x === y) return 100;
  let best = 0;
  for (let i = 0; i < x.length; i++) for (let j = 0; j < y.length; j++) {
    let k = 0;
    while (x[i + k] && x[i + k] === y[j + k]) k++;
    if (k > best) best = k;
  }
  return best;
}

// ── 一覧 ──
export async function loadCustomers() {
  const [profiles, nutris, lineLinks, kartes, cachedSheet, sheetLinksRaw] = await Promise.all([
    kvPrefix("profile:"), kvPrefix("nutri:"), kvPrefix("line_user:"), kvPrefix("karte:"),
    kvGet("global:karteSheet", null).catch(() => null), kvGet("global:karteSheetLinks", {}).catch(() => ({})),
  ]);
  const { sheet, error: sheetError } = await syncSheet(cachedSheet);
  const sheetLinks = sheetLinksRaw || {};
  const karteBy = Object.fromEntries(kartes.map(r => [r.key.slice("karte:".length), parse(r.value, {})]));
  const pidByLine = Object.fromEntries(lineLinks.map(r => [r.key.slice("line_user:".length), r.value]));
  const lineByPid = Object.fromEntries(Object.entries(pidByLine).map(([l, p]) => [p, l]));
  const nutriBy = Object.fromEntries(nutris.map(r => [r.key.slice("nutri:".length), parse(r.value, {})]));

  const list = [];
  for (const r of profiles) {
    const p = parse(r.value, null);
    if (!p?.id || !p.name) continue;
    const lineUserId = p.lineUserId || lineByPid[p.id] || null;
    const n = lineUserId ? nutriBy[lineUserId] : null;
    list.push({
      cid: `m:${p.id}`, dataId: p.id, kind: "member", pid: p.id, lineUserId,
      name: p.name, furigana: p.furigana || "", phone: p.phone || "", birthdate: p.birthdate || null,
      avatar: n?.line?.pictureUrl || null, avatarColor: p.avatarColor || null,
      goal: p.goal || "", targetWeight: p.targetWeight ?? null, targetBodyFat: p.targetBodyFat ?? null,
      lastActivityAt: p.lastActivityAt || null, blocked: !!p.blocked,
    });
  }
  for (const [lineUserId, n] of Object.entries(nutriBy)) {
    if (pidByLine[lineUserId]) continue; // アプリ会員として上で出している
    const name = n.profile?.fullName || n.line?.displayName;
    if (!name) continue;
    list.push({
      cid: `l:${lineUserId}`, dataId: `line_${lineUserId}`, kind: "line", pid: null, lineUserId,
      name, furigana: "", phone: "", birthdate: null, age: n.profile?.age ?? null,
      lineName: n.line?.displayName || "", avatar: n.line?.pictureUrl || null,
      goal: n.goal?.goal || "", targetWeight: n.goal?.targetWeight ?? n.profile?.targetWeight ?? null, targetBodyFat: n.goal?.targetBodyFat ?? null,
      lastActivityAt: n.followedAt || null, unfollowed: !!n.unfollowedAt,
    });
  }

  // スプレッドシートの行と突き合わせる: 手動の紐付け → 電話番号 → 名前（フリガナ）
  const rows = sheet.tabs.flatMap(t => sheetRecords(t, t));
  const used = new Set();
  const byKey = Object.fromEntries(rows.map(x => [x.rowKey, x]));
  for (const c of list) {
    const k = sheetLinks[c.cid];
    if (k && byKey[k] && !used.has(k)) { c.sheet = byKey[k]; used.add(k); }
  }
  const pick = (c, test) => {
    if (c.sheet) return;
    const hit = rows.find(x => !used.has(x.rowKey) && test(x));
    if (hit) { c.sheet = hit; used.add(hit.rowKey); }
  };
  for (const c of list) if (normPhone(c.phone).length >= 10) pick(c, x => normPhone(x.phone) === normPhone(c.phone));
  for (const c of list) pick(c, x => normName(x.name) === normName(c.name) || (c.furigana && normName(x.furigana) === normName(c.furigana)));
  // LINEの表示名がフルネームと同じ人も
  for (const c of list) if (c.lineName) pick(c, x => normName(x.name) === normName(c.lineName));
  for (const x of rows) {
    if (used.has(x.rowKey)) continue;
    list.push({
      cid: `s:${x.rowKey}`, dataId: sheetDataId(x.rowKey), kind: "sheet", pid: null, lineUserId: null,
      name: x.name, furigana: x.furigana, phone: x.phone, birthdate: x.birthdate, age: x.age,
      goal: "", targetWeight: null, targetBodyFat: null, sheet: x,
    });
  }

  for (const c of list) {
    const k = karteBy[c.dataId] || {};
    c.karte = k;
    if (c.kind === "sheet") { c.goal = k.goal || c.sheet?.goal || ""; c.targetWeight = k.targetWeight ?? null; }
    if (!c.goal && c.sheet?.goal) c.goal = c.sheet.goal;
    if (!c.birthdate && c.sheet?.birthdate) c.birthdate = c.sheet.birthdate;
    c.age = calcAge(c.birthdate) ?? c.age ?? c.sheet?.age ?? null;
    // 名前・フリガナはスプレッドシートの表記を使う（アプリ・LINEの名前は appName に残す）
    if (c.sheet && c.kind !== "sheet") {
      c.appName = c.name;
      c.name = c.sheet.name;
      if (c.sheet.furigana) c.furigana = c.sheet.furigana;
    }
    if (!c.furigana && c.sheet?.furigana) c.furigana = c.sheet.furigana;
    // 残り回数: シートの値が基準。カルテで使った・足した分はシートの値が変わるまでカルテの値を使い、
    // シートの値が書き換わったら（回数券の購入など）シートの値に合わせ直す
    const sheetTickets = c.sheet?.tickets ?? null;
    c.tickets = k.tickets != null && (sheetTickets == null || k.sheetTickets === sheetTickets) ? k.tickets : sheetTickets ?? k.tickets ?? null;
    // 最終来店日: カルテの記録とシートの「最後来店日」の新しいほう
    c.lastVisit = [k.lastVisit || "", c.sheet?.lastVisit || ""].sort().pop() || null;
  }
  // 名簿だけの人として付けていた記録（sheet_…）が残っていたら、つながった先へ移す
  for (const c of list) {
    if (c.kind === "sheet" || !c.sheet) continue;
    const from = sheetDataId(c.sheet.rowKey);
    if (karteBy[from] && !karteBy[from].mergedInto) {
      c.karte = await migrateData(from, c.dataId).catch(() => c.karte);
      karteBy[from].mergedInto = c.dataId;
    }
  }
  for (const c of list) {
    c.touchedAt = c.karte.touchedAt || null;
    c.sheetDataId = c.sheet ? sheetDataId(c.sheet.rowKey) : null;
    // 一覧の分け方: 回数券のタブ・月額のタブ・名簿にいない人（公式LINE・アプリだけ）
    c.group = c.sheet?.kind || "other";
    c.section = c.sheet?.section || "";
    c.memberNo = c.sheet?.memberNo || "";
  }
  sortCustomers(list);
  return { customers: list, sheet, sheetError, sheetRows: rows, sheetLinks };
}

// ── 1人分の記録 ──
const DATA_KEYS = ["growth", "monthly", "conditions", "workouts", "sessions", "personalLogs", "comments", "karteSessions"];

export async function loadDetail(c) {
  const values = await Promise.all(DATA_KEYS.map(k => kvGet(`data:${c.dataId}:${k}`, []).catch(() => [])));
  const d = Object.fromEntries(DATA_KEYS.map((k, i) => [k, Array.isArray(values[i]) ? values[i] : []]));
  // 公式LINEだけの人: LINEで送った体重（nutri:）も成長記録として見せる（同じ日は成長記録を優先）
  if (c.kind === "line") {
    const n = await kvGet(`nutri:${c.lineUserId}`, {}).catch(() => ({}));
    const dates = new Set(d.growth.map(g => g.date));
    d.growth = [...d.growth, ...(n.weights || []).filter(w => !dates.has(w.date)).map(w => ({ ...w, fromLine: true }))];
  }
  d.photos = await loadPhotos(c);
  return d;
}

export const PHOTO_SLOTS = [
  ["before", "前"], ["before_side", "横"], ["before_back", "後ろ"],
  ["after", "前"], ["after_side", "横"], ["after_back", "後ろ"],
];

// 写真の置き場所はアプリ・LINEのページと同じ（src/admin/MemberRecords.jsx と同じ順に探す）
async function loadPhotos(c) {
  const profile = c.pid ? await kvGet(`profile:${c.pid}`, {}).catch(() => ({})) : null;
  const read = key => rawGet(key).catch(() => null);
  const out = {};
  await Promise.all(PHOTO_SLOTS.map(async ([slot]) => {
    let v = null;
    if (c.pid && slot === "before") v = profile?.beforePhoto || null;
    if (c.pid && slot === "after") v = profile?.afterPhoto || null;
    if (!v && c.pid) v = await read(`profile_photo:${c.pid}:${slot}`);
    if (!v && c.lineUserId) v = await read(`nutri_photo:${c.lineUserId}:${slot}`);
    if (!v && c.kind === "sheet") v = await read(`karte_photo:${c.dataId}:${slot}`);
    // 名簿だけの人だったときにカルテで撮った写真
    if (!v && c.sheetDataId && c.sheetDataId !== c.dataId) v = await read(`karte_photo:${c.sheetDataId}:${slot}`);
    out[slot] = v;
  }));
  out.dates = (await kvGet(`karte:${c.dataId}`, {}).catch(() => ({})))?.photoDates || {};
  return out;
}

export async function savePhoto(c, slot, dataUrl) {
  const raw = rawSet;
  if (c.pid && (slot === "before" || slot === "after")) {
    await kvUpdate(`profile:${c.pid}`, { id: c.pid }, p => ({ ...p, [slot === "before" ? "beforePhoto" : "afterPhoto"]: dataUrl }));
  } else if (c.pid) await raw(`profile_photo:${c.pid}:${slot}`, dataUrl);
  else if (c.lineUserId) await raw(`nutri_photo:${c.lineUserId}:${slot}`, dataUrl);
  else await raw(`karte_photo:${c.dataId}:${slot}`, dataUrl);
  await updateKarte(c, k => ({ ...k, photoDates: { ...(k.photoDates || {}), [slot]: jstToday() } }));
}

// カルテで何か更新したら touchedAt を付ける（一覧で一番上に来る）
export const updateKarte = (c, fn) => kvUpdate(`karte:${c.dataId}`, {}, k => ({ ...fn(k), touchedAt: new Date().toISOString() }));

// 一覧の並び: スプレッドシートの並び順（回数券のタブ → 月額のタブ）。
// 名簿にいない人（公式LINE・アプリだけ）は、カルテで更新した順 → 名前順
const GROUP_ORDER = { ticket: 0, monthly: 1, other: 2 };
export function sortCustomers(list) {
  return list.sort((a, b) =>
    (GROUP_ORDER[a.group] ?? 2) - (GROUP_ORDER[b.group] ?? 2)
    || (a.sheet?.order ?? Infinity) - (b.sheet?.order ?? Infinity)
    || (b.touchedAt || "").localeCompare(a.touchedAt || "")
    || a.name.localeCompare(b.name, "ja"));
}


// 目標: アプリ会員は会員プロフィール、LINEだけの人は nutri: の goal（LINEの「わたしの目標」と共通）
export async function saveGoal(c, { goal, targetWeight, targetBodyFat }) {
  const patch = { goal, targetWeight, targetBodyFat };
  if (c.pid) await kvUpdate(`profile:${c.pid}`, { id: c.pid }, p => ({ ...p, ...patch }));
  else if (c.lineUserId) await kvUpdate(`nutri:${c.lineUserId}`, {}, n => ({ ...n, goal: { ...(n.goal || {}), ...patch } }));
  else await updateKarte(c, k => ({ ...k, ...patch }));
  if (c.pid || c.lineUserId) await updateKarte(c, k => k);
}

export async function adjustTickets(c, delta, reason, setTo) {
  return updateKarte(c, k => {
    const before = c.tickets ?? 0;
    const after = setTo != null ? setTo : Math.max(0, before + delta);
    const log = [{ at: new Date().toISOString(), before, after, reason }, ...(k.ticketLog || [])].slice(0, 100);
    return { ...k, tickets: after, sheetTickets: c.sheet?.tickets ?? null, ticketLog: log };
  });
}

// ── セッションの記録 ──
// カルテには全部（スタッフメモ込み）を残し、お客様に見せる分はアプリ・LINEと同じ場所にも書く
//   personalLogs … パーソナルトレーニング記録（第◯回・メニュー）→ アプリ・LINEのレポートに出る
//   comments     … type: "personal" のトレーナーコメント → アプリ・LINEの「コメント」に出る
//   sessions     … その日の personalTraining を付ける → メンバーシップのポイント（+2pt）
export function menuSummary(items) {
  return items.map(i => {
    const parts = [i.weight ? `${i.weight}kg` : "", i.reps ? `${i.reps}${i.unit === "sec" ? "秒" : "回"}` : "", i.sets ? `${i.sets}セット` : ""].filter(Boolean);
    return parts.length ? `${i.name} ${parts.join("×")}` : i.name;
  }).join("\n");
}

export async function saveSession(c, s) {
  const id = s.id || newId();
  const entry = { ...s, id, createdAt: new Date().toISOString() };
  await kvUpdate(`data:${c.dataId}:karteSessions`, [], list => [...list.filter(x => x.id !== id), entry]);
  const summary = menuSummary(s.items);
  if (summary) {
    await kvUpdate(`data:${c.dataId}:personalLogs`, [], list => {
      const prev = list.find(x => x.id === id);
      const seq = prev?.seq || list.reduce((m, l) => Math.max(m, l.seq || 0), 0) + 1;
      return [...list.filter(x => x.id !== id), { id, seq, date: s.date, menu: summary, source: "karte" }];
    });
  }
  if (s.comment) {
    await kvUpdate(`data:${c.dataId}:comments`, [], list => [...list.filter(x => x.id !== id), { id, type: "personal", date: s.date, text: s.comment, staff: s.staff || "" }]);
  }
  await kvUpdate(`data:${c.dataId}:sessions`, [], list => {
    const ex = list.find(x => x.date === s.date);
    return [...list.filter(x => x.date !== s.date), { ...(ex || { id: newId(), date: s.date }), personalTraining: true }];
  });
  let karte = await updateKarte(c, k => ({ ...k, lastVisit: [k.lastVisit || "", s.date].sort().pop() }));
  if (s.ticketUsed && (c.tickets != null || karte.tickets != null)) karte = await adjustTickets(c, -1, `${s.date} セッション`);
  return { entry, karte };
}

export async function deleteSession(c, s) {
  await kvUpdate(`data:${c.dataId}:karteSessions`, [], list => list.filter(x => x.id !== s.id));
  await kvUpdate(`data:${c.dataId}:personalLogs`, [], list => list.filter(x => x.id !== s.id));
  await kvUpdate(`data:${c.dataId}:comments`, [], list => list.filter(x => x.id !== s.id));
  if (s.ticketUsed) return adjustTickets(c, +1, `${s.date} セッション取り消し`);
  return null;
}

// ── 定期測定 ──
// 体重・体脂肪率・筋肉量（と周径）は成長記録（growth）に、体力テストとメモは月次測定（monthly）に入れる
export async function saveMeasurement(c, m) {
  const body = ["weight", "bodyFat", "muscleMass", "waist", "hip", "thigh", "arm"];
  const g = Object.fromEntries(body.map(k => [k, m[k] === "" || m[k] == null ? null : Number(m[k])]));
  if (body.some(k => g[k] != null)) {
    await kvUpdate(`data:${c.dataId}:growth`, [], list => [...list, { id: newId(), date: m.date, ...g, source: "karte" }]);
  }
  const tests = ["situps", "benchMax", "hipThrust"];
  const t = Object.fromEntries(tests.map(k => [k, m[k] === "" || m[k] == null ? null : Number(m[k])]));
  if (tests.some(k => t[k] != null) || m.note) {
    await kvUpdate(`data:${c.dataId}:monthly`, [], list => [...list, { id: newId(), date: m.date, ...t, note: m.note || "", bridge: false, photoSubmitted: false, source: "karte" }]);
  }
  await updateKarte(c, k => k);
}

// ── 共通の設定 ──
export const loadGlobal = (name, fb) => kvGet(`global:${name}`, fb).catch(() => fb);
export const saveGlobal = (name, v) => kvSet(`global:${name}`, v);

// 名簿だけの人（sheet_…）として付けた記録を、公式LINE・アプリのお客様の記録へまとめる
const MERGE_KEYS = ["growth", "monthly", "conditions", "workouts", "sessions", "personalLogs", "comments", "karteSessions"];
export async function migrateData(fromId, toId) {
  if (!fromId || !toId || fromId === toId) return kvGet(`karte:${toId}`, {});
  for (const k of MERGE_KEYS) {
    const src = await kvGet(`data:${fromId}:${k}`, []).catch(() => []);
    if (!Array.isArray(src) || !src.length) continue;
    await kvUpdate(`data:${toId}:${k}`, [], list => {
      const ids = new Set(list.map(x => x.id));
      return [...list, ...src.filter(x => !ids.has(x.id))];
    });
  }
  const from = await kvGet(`karte:${fromId}`, {});
  const merged = await kvUpdate(`karte:${toId}`, {}, to => ({
    ...from, ...Object.fromEntries(Object.entries(to).filter(([, v]) => v != null && v !== "")),
    note: [to.note, from.note].filter(Boolean).join("\n"),
    ticketLog: [...(to.ticketLog || []), ...(from.ticketLog || [])].slice(0, 100),
    lastVisit: [to.lastVisit || "", from.lastVisit || ""].sort().pop() || null,
  }));
  await kvSet(`karte:${fromId}`, { ...from, mergedInto: toId });
  return merged;
}

// 公式LINE・アプリのお客様（cid）を名簿の行（rowKey）とつなぐ。名簿だけの人として付けた記録も移す
export async function connectToSheet(customer, row) {
  await linkSheetRow(customer.cid, row.rowKey);
  await migrateData(sheetDataId(row.rowKey), customer.dataId);
}

// ── 本日の予約 ──
export const loadToday = date => kvGet(`global:karteToday:${date}`, { items: [] }).catch(() => ({ items: [] }));
export const updateToday = (date, fn) => kvUpdate(`global:karteToday:${date}`, { items: [] }, fn);

// Google カレンダーのその日の予定（/api/calendar 経由）
export async function fetchCalendar(url, date) {
  if (demo) return (await import("./demoData.js")).demoCalendar();
  const res = await fetch(`/api/calendar?url=${encodeURIComponent(url)}&date=${date}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `カレンダーを読めませんでした (${res.status})`);
  return body.events || [];
}

// 予定のタイトル → お客様。覚えた対応 → 名前がまるごと入っている → 「No.12」が入っている、の順
export const calendarKey = summary => normName(summary);
export function matchEvent(ev, customers, map = {}) {
  const key = calendarKey(ev.summary);
  if (map[key]) return customers.find(c => c.cid === map[key]) || null;
  const text = normName(ev.summary);
  const hits = customers.filter(c => c.group !== "other" && normName(c.name).length >= 2 && text.includes(normName(c.name)));
  if (hits.length) return hits.sort((a, b) => normName(b.name).length - normName(a.name).length)[0];
  const no = String(ev.summary).normalize("NFKC").match(/no\.?\s*(\d+)/i);
  if (no) {
    const byNo = customers.filter(c => normName(c.memberNo) === `no${no[1]}`);
    if (byNo.length === 1) return byNo[0];
  }
  const others = customers.filter(c => normName(c.name).length >= 2 && text.includes(normName(c.name)));
  return others[0] || null;
}

export async function linkSheetRow(cid, rowKey) {
  return kvUpdate("global:karteSheetLinks", {}, links => {
    const next = Object.fromEntries(Object.entries(links).filter(([k, v]) => k !== cid && v !== rowKey));
    if (rowKey) next[cid] = rowKey;
    return next;
  });
}
