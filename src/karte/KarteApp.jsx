// TTGYM 顧客カルテ（/karte）。スタッフがトレーニング中にタブレット・スマホで開く顧客管理表。
// 元々の顧客スプレッドシート（名前・年齢・残り回数など）と、アプリ・公式LINEの記録（目標・体調・
// 体重・写真・自主トレ）を1人1枚のカルテにまとめ、毎回のメニュー・コメント・メモをここで残す。
// データの置き場所は store.js の先頭を参照。/karte?demo=1 でサンプルデータの表示。
import React, { useEffect, useMemo, useRef, useState } from "react";
import { LineChart, Line, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import {
  Search, Settings, RefreshCw, ChevronLeft, Minus, Plus, Check, X, Pencil, Trash2, Camera,
  ArrowDownRight, ArrowUpRight, ClipboardList, History, TrendingUp, Image as ImageIcon, UserRound, RotateCcw, FileSpreadsheet, PanelLeftClose, PanelLeftOpen, CalendarDays, Link2, Utensils, MessageCircle, Send, Award, Cake,
} from "lucide-react";
import "./karte.css";
import {
  loadCustomers, loadDetail, saveSession, deleteSession, saveMeasurement, saveGoal, savePhoto, adjustTickets, updateKarte,
  loadGlobal, saveGlobal, linkSheetRow, sortCustomers, sheetTabs, nameScore, connectToSheet,
  loadToday, updateToday, fetchCalendar, matchEvent, calendarKey, jstToday, newId, isDemo, seedDemo, PHOTO_SLOTS, menuSummary, setsText, circuitExercises,
  nutritionTargets, addMeal, membershipOf, patchProfile, addComment, deleteComment,
  dayNutrients, nutrientTargets, replyTrainingNote, deleteOldRecords,
} from "./store.js";
import { TIERS, POINT_RULES } from "../membership.js";
import { COMMENT_TYPES } from "../careData.js";
import { NUTRIENTS, CATEGORIES, nutrientStatus, STATUS_LABEL, buildAdvice, fmt } from "../liff/nutrients.js";
import { MENU_CATEGORIES, DEFAULT_MENUS, DAY_CONDITIONS, BODY_PARTS } from "./menus.js";
import { SHEET_FIELDS, parseCsv, detectColumns, fetchSheetCsv } from "./sheet.js";
import { fileToCompressedDataUrl } from "../imageUtils.js";
import { SLEEP_LEVELS, FATIGUE_LEVELS, MENTAL_LEVELS, BOWEL_OPTIONS } from "../careData.js";

const LOW_TICKETS = 2;
const STAFF_STORAGE = "ttgym_karte_staff";
const LINE_KEY_STORAGE = "ttgym_line_admin_key"; // 管理画面の「LINE操作キー」と同じ
const LIST_HIDDEN_STORAGE = "ttgym_karte_list_hidden";
const DRAFT_STORAGE = cid => `ttgym_karte_draft:${cid}`; // 記録する前のメモ（タブを移っても・再読み込みしても消えないように）
const lsGet = k => { try { return window.localStorage.getItem(k) || ""; } catch (e) { return ""; } };
const lsSet = (k, v) => { try { window.localStorage.setItem(k, v); } catch (e) {} };

const md = d => (d ? `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}` : "");
const ymd = d => (d ? d.replace(/-/g, "/") : "");
const r1 = v => (v == null || isNaN(v) ? "—" : (Math.round(v * 10) / 10).toString());
const daysAgo = d => (d ? Math.round((Date.parse(`${jstToday()}T00:00:00Z`) - Date.parse(`${d}T00:00:00Z`)) / 86400000) : null);
const ago = d => { const n = daysAgo(d); return n == null ? "" : n === 0 ? "今日" : n === 1 ? "昨日" : n < 31 ? `${n}日前` : `${Math.round(n / 30)}ヶ月前`; };

// 管理画面と同じ /api/line-admin（LINEへの送信・利用停止・アプリ会員との連携）。LINE操作キーが要る
async function lineAdmin(action, payload = {}) {
  const res = await fetch("/api/line-admin", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-admin-key": lsGet(LINE_KEY_STORAGE) },
    body: JSON.stringify({ action, ...payload }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `エラー (${res.status})`);
  return body;
}
const notifyLine = (lineUserId, text) => lineAdmin("push", { lineUserId, text });
const isBirthday = b => !!b && b.slice(5) === jstToday().slice(5);

function Avatar({ c, lg }) {
  return (
    <div className={`kt-av${lg ? " lg" : ""}`} style={{ background: c.avatarColor || undefined }}>
      {c.avatar ? <img src={c.avatar} alt="" /> : (String(c.name || "").match(/\p{L}/u) || ["?"])[0]}
    </div>
  );
}

function Sources({ c }) {
  return (
    <span className="kt-src">
      {c.pid && <i className="app">APP</i>}
      {c.lineUserId && <i className="line">LINE</i>}
      {c.sheet && <i className="sheet">SHEET</i>}
    </span>
  );
}

function Toast({ msg }) {
  if (!msg) return null;
  return <div className="kt-toast" role="status"><Check size={16} />{msg}</div>;
}

// ───────────────────────── 全体 ─────────────────────────
export default function KarteApp() {
  const [state, setState] = useState(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(() => new URLSearchParams(window.location.search).get("c") || null);
  const [showSettings, setShowSettings] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // お客様の名前が並ぶ左の一覧を、ボタン1つで隠す（画面を見られても名前が並ばないように）
  const [listHidden, setListHidden] = useState(() => lsGet(LIST_HIDDEN_STORAGE) === "1");
  const toggleList = () => setListHidden(v => { lsSet(LIST_HIDDEN_STORAGE, v ? "" : "1"); return !v; });
  const [toast, setToast] = useState("");
  const toastTimer = useRef(null);
  const flash = msg => { setToast(msg); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(""), 2400); };

  async function load() {
    try {
      const today = jstToday();
      const [base, menus, staff, calendar, calMap, todayList] = await Promise.all([
        loadCustomers(), loadGlobal("karteMenus", []), loadGlobal("karteStaff", []),
        loadGlobal("karteCalendar", {}), loadGlobal("karteCalendarMap", {}), loadToday(today),
      ]);
      const circuits = await loadGlobal("karteCircuits", []);
      // Google カレンダーの今日の予定（設定でURLを入れたときだけ）
      let events = [], calError = "";
      if (calendar?.url || isDemo) {
        try { events = await fetchCalendar(calendar?.url || "", today); } catch (e) { calError = e.message; }
      }
      setState({ ...base, menus, staff, circuits: circuits || [], calendar: calendar || {}, calMap: calMap || {}, today: todayList, todayDate: today, events, calError });
      setError("");
    } catch (e) {
      setError(`読み込めませんでした: ${e.message}`);
    }
  }
  // シート・LINE・カレンダーを5分ごとに読み直す（画面を開いているときだけ）
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === "visible") load(); }, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    (async () => {
      if (isDemo) seedDemo((await import("./demoData.js")).demoEntries());
      load();
    })();
  }, []);

  // 選んだお客様をURLにも残す（再読み込み・ブックマークで同じ人が開く）
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (selected) q.set("c", selected); else q.delete("c");
    const s = q.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${s ? `?${s}` : ""}`);
  }, [selected]);

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  // 保存のたびに呼ばれる。更新したお客様を一覧の一番上へ
  const patchCustomer = (cid, patch) => setState(s => ({
    ...s,
    customers: sortCustomers(s.customers.map(c => (c.cid === cid ? { ...c, ...patch, touchedAt: new Date().toISOString() } : c))),
  }));
  const current = state?.customers.find(c => c.cid === selected) || null;

  // 本日の予約: 手で追加・外す、カレンダーの予定にお客様を割り当てる（次からは同じ予定名で自動）
  async function addToday(cid, time = "") {
    const next = await updateToday(state.todayDate, t => ({ items: [...(t.items || []).filter(x => x.cid !== cid), { cid, time }] }));
    setState(s => ({ ...s, today: next }));
  }
  async function removeToday(cid) {
    const next = await updateToday(state.todayDate, t => ({ items: (t.items || []).filter(x => x.cid !== cid) }));
    setState(s => ({ ...s, today: next }));
  }
  async function assignEvent(ev, cid) {
    const map = { ...state.calMap, [calendarKey(ev.summary)]: cid || undefined };
    await saveGlobal("karteCalendarMap", map);
    setState(s => ({ ...s, calMap: map }));
  }

  return (
    <div className="kt">
      <header className="kt-head">
        <div className="kt-brand"><img src="/liff/logo.png" alt="" /><b>TTGYM</b><span>顧客カルテ</span></div>
        {isDemo && <span className="kt-demo">デモ表示</span>}
        <div className="sp" />
        <button className="kt-head-btn" onClick={toggleList} aria-pressed={listHidden} title="お客様の一覧を隠す／表示する">
          {listHidden ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}<span className="hide-sm">{listHidden ? "一覧を表示" : "一覧を隠す"}</span>
        </button>
        <button className="kt-head-btn" onClick={refresh} disabled={refreshing} aria-label="最新にする">
          <RefreshCw size={15} className={refreshing ? "spin" : ""} /><span className="hide-sm">{refreshing ? "更新中…" : "更新"}</span>
        </button>
        <button className="kt-head-btn" onClick={() => setShowSettings(true)} aria-label="設定"><Settings size={15} /><span className="hide-sm">設定</span></button>
      </header>

      {error && <div className="kt-welcome"><h2>読み込めませんでした</h2><p>{error}</p><button className="kt-btn" onClick={refresh}>もう一度</button></div>}
      {!state && !error && <div className="kt-loading">読み込み中…</div>}
      {state?.sheetError && (
        <div className="kt-banner"><FileSpreadsheet size={15} />スプレッドシートを読み込めませんでした（前回読んだ内容で表示しています）: {state.sheetError}</div>
      )}
      {state && (
        <div className={`kt-body${current ? " has-sel" : ""}${listHidden ? " list-hidden" : ""}`}>
          {!listHidden && <CustomerList state={state} selected={selected} onSelect={setSelected} onAddToday={addToday} onRemoveToday={removeToday} onAssignEvent={assignEvent} />}
          <main className="kt-main">
            {current ? (
              <CustomerView
                key={current.cid} c={current} state={state}
                onBack={() => setSelected(null)}
                onPatch={patch => patchCustomer(current.cid, patch)}
                onReload={refresh} flash={flash} onSelect={setSelected}
                setMenus={menus => setState(s => ({ ...s, menus }))}
                setCircuits={circuits => setState(s => ({ ...s, circuits }))}
              />
            ) : (
              <Welcome state={state} onSettings={() => setShowSettings(true)} listHidden={listHidden} onShowList={toggleList} onSaved={async msg => { flash(msg); await load(); }} />
            )}
          </main>
        </div>
      )}
      {showSettings && state && (
        <SettingsPanel state={state} onClose={() => setShowSettings(false)} onSaved={async msg => { flash(msg); await load(); }} />
      )}
      <Toast msg={toast} />
    </div>
  );
}

function Welcome({ state, onSettings, listHidden, onShowList, onSaved }) {
  return (
    <div className="kt-welcome">
      <UserRound size={34} />
      <h2>お客様を選んでください</h2>
      <p>左の一覧から選ぶと、今日のメモ・回数券・目標・成長の記録がひと目で分かります。</p>
      {listHidden && <button className="kt-btn" onClick={onShowList} style={{ marginBottom: 14 }}><PanelLeftOpen size={16} />一覧を表示</button>}
      <Notices state={state} />
      <SetupGuide state={state} onSaved={onSaved} onSettings={onSettings} />
      <LinkStatus state={state} onSettings={onSettings} />
    </div>
  );
}

// ───────────────────────── はじめにやること（3つ） ─────────────────────────
// 全部終わったら表示しない。それぞれその場で終わるようにする（設定画面を探さなくていいように）
async function checkLineKey(key) {
  const res = await fetch("/api/line-admin", {
    method: "POST", headers: { "Content-Type": "application/json", "x-admin-key": key }, body: JSON.stringify({ action: "check" }),
  });
  return res.ok;
}

// 名簿の人と公式LINE・アプリの人の組み合わせの候補（似た名前の上位、1人に1つ・名簿の行もかぶらない）
function linkCandidates(state) {
  const taken = new Set(state.customers.filter(x => x.kind !== "sheet" && x.sheet).map(x => x.sheet.rowKey));
  const free = state.sheetRows.filter(r => !taken.has(r.rowKey));
  const pairs = [];
  for (const c of state.customers.filter(x => x.group === "other")) {
    const scored = free.map(r => ({ r, score: Math.max(nameScore(r.name, c.name), nameScore(r.name, c.lineName), nameScore(r.name, c.appName)) }))
      .filter(x => x.score >= 2).sort((a, b) => b.score - a.score);
    // 一番似ている候補が1つに決まるときだけ
    if (scored.length && (scored.length === 1 || scored[0].score > scored[1].score)) pairs.push({ c, r: scored[0].r, score: scored[0].score });
  }
  // 同じ名簿の行に2人が当たったら、どちらも外す（取り違えを防ぐ）
  const count = {};
  for (const p of pairs) count[p.r.rowKey] = (count[p.r.rowKey] || 0) + 1;
  return pairs.filter(p => count[p.r.rowKey] === 1);
}

function SetupGuide({ state, onSaved, onSettings }) {
  const [open, setOpen] = useState(null);
  const [calUrl, setCalUrl] = useState(state.calendar?.url || "");
  const [calMsg, setCalMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState("");
  const [keyOk, setKeyOk] = useState(null);
  const [keyMsg, setKeyMsg] = useState("");
  const candidates = useMemo(() => linkCandidates(state), [state]);
  const [checked, setChecked] = useState(() => Object.fromEntries(candidates.map(p => [p.c.cid, p.score >= 3])));
  const unlinked = state.customers.filter(c => c.group === "other").length;

  // この端末に保存してある LINE操作キー（管理画面で入れたものも同じ）が使えるか
  useEffect(() => {
    const saved = lsGet(LINE_KEY_STORAGE);
    if (!saved || isDemo) { setKeyOk(isDemo ? true : false); return; }
    checkLineKey(saved).then(setKeyOk).catch(() => setKeyOk(false));
  }, []);

  const calDone = !!state.calendar?.url && !state.calError;
  const steps = [
    { key: "cal", done: calDone || isDemo, title: "Googleカレンダーをつなぐ", sub: calDone ? "つながっています" : "今日の予約が自動で出るようになります（2分）" },
    { key: "line", done: unlinked === 0, title: "公式LINEのお客様を名簿とつなぐ", sub: unlinked ? `あと${unlinked}人（候補が分かる人 ${candidates.length}人）` : "全員つながっています" },
    { key: "key", done: keyOk === true, title: "LINEにメッセージを送れるようにする", sub: keyOk ? "この端末から送れます" : keyOk === false ? "LINE操作キーを入れる（1回だけ）" : "確認中…" },
  ];
  if (steps.every(x => x.done)) return null;

  async function saveCal() {
    setBusy(true); setCalMsg("");
    try {
      const events = await fetchCalendar(calUrl.trim(), state.todayDate);
      await saveGlobal("karteCalendar", { url: calUrl.trim() });
      setBusy(false);
      onSaved(`Googleカレンダーをつなぎました（今日の予定 ${events.length}件）`);
    } catch (e) {
      setCalMsg(e.message); setBusy(false);
    }
  }
  async function linkChecked() {
    setBusy(true);
    const list = candidates.filter(p => checked[p.c.cid]);
    for (const p of list) await connectToSheet(p.c, p.r);
    setBusy(false);
    onSaved(`${list.length}人を名簿とつなぎました`);
  }
  async function saveKey() {
    setBusy(true); setKeyMsg("");
    const ok = await checkLineKey(key.trim()).catch(() => false);
    setBusy(false);
    if (ok) { lsSet(LINE_KEY_STORAGE, key.trim()); setKeyOk(true); setKey(""); onSaved("LINE操作キーを保存しました。この端末からLINEに送れます"); }
    else setKeyMsg("キーが違うようです。Vercel の環境変数 ADMIN_API_KEY と同じ文字列を入れてください");
  }

  return (
    <div className="kt-card kt-guide" style={{ textAlign: "left" }}>
      <div className="kt-card-h"><h3>はじめにやること <small>{steps.filter(x => x.done).length}/3 完了</small></h3></div>
      {steps.map((st, i) => (
        <div key={st.key} className={`kt-step${st.done ? " done" : ""}`}>
          <button className="kt-step-h" onClick={() => setOpen(open === st.key ? null : st.key)} disabled={st.done}>
            <i>{st.done ? <Check size={14} /> : i + 1}</i>
            <div><b>{st.title}</b><span>{st.sub}</span></div>
            {!st.done && <span className="kt-link">{open === st.key ? "閉じる" : "やる"}</span>}
          </button>

          {open === "cal" && st.key === "cal" && (
            <div className="kt-step-body">
              <ol className="kt-steps-help">
                <li><a href="https://calendar.google.com/calendar/u/0/r/settings" target="_blank" rel="noreferrer">Googleカレンダーの設定を開く</a>（予約を入れているアカウントで）</li>
                <li>左の「マイカレンダーの設定」から予約用のカレンダーを選ぶ</li>
                <li>下の方の「カレンダーの統合」→「<b>iCal 形式の非公開URL</b>」の横のコピーを押す</li>
                <li>下に貼り付けて「つないで確認」</li>
              </ol>
              <div className="kt-custom" style={{ marginTop: 0 }}>
                <input className="kt-in" value={calUrl} onChange={e => setCalUrl(e.target.value)} placeholder="https://calendar.google.com/calendar/ical/…/basic.ics" />
                <button className="kt-btn sm" onClick={saveCal} disabled={busy || !calUrl.trim()}>{busy ? "確認中…" : "つないで確認"}</button>
              </div>
              {calMsg && <div className="kt-err">{calMsg}</div>}
            </div>
          )}

          {open === "line" && st.key === "line" && (
            <div className="kt-step-body">
              {candidates.length > 0 ? (
                <>
                  <p className="kt-muted" style={{ marginTop: 0 }}>名前が似ている組み合わせです。合っているものにチェックを付けて「つなぐ」を押してください（よく似ているものは最初からチェック済み）。</p>
                  {candidates.map(p => (
                    <label key={p.c.cid} className="kt-pair">
                      <input type="checkbox" checked={!!checked[p.c.cid]} onChange={e => setChecked({ ...checked, [p.c.cid]: e.target.checked })} />
                      <span><b>{p.c.lineName || p.c.name}</b><small>{p.c.lineUserId ? "公式LINE" : "アプリ"}{p.c.lineName && p.c.name !== p.c.lineName ? `・${p.c.name}` : ""}</small></span>
                      <em>→</em>
                      <span><b>{p.r.memberNo} {p.r.name}</b><small>{p.r.tabLabel}{p.r.section ? `・${p.r.section}` : ""}</small></span>
                    </label>
                  ))}
                  <button className="kt-btn gold" style={{ marginTop: 10 }} onClick={linkChecked} disabled={busy || !candidates.some(p => checked[p.c.cid])}>
                    {busy ? "つないでいます…" : `チェックした${candidates.filter(p => checked[p.c.cid]).length}人をつなぐ`}
                  </button>
                </>
              ) : <p className="kt-muted" style={{ marginTop: 0 }}>名前から候補が分かる人はいませんでした。</p>}
              {unlinked > candidates.length && (
                <p className="kt-muted">残りの人（LINEの名前がニックネームの人など）は <button className="kt-link" onClick={onSettings}>設定の「公式LINEのお客様を名簿とつなぐ」</button> で1人ずつ No. を選んでください。</p>
              )}
            </div>
          )}

          {open === "key" && st.key === "key" && (
            <div className="kt-step-body">
              <p className="kt-muted" style={{ marginTop: 0 }}>
                管理画面（/admin）の「LINE操作キー」と同じものです（Vercel の環境変数 <b>ADMIN_API_KEY</b> に入れた文字列）。この端末に1回入れれば、カルテの記録をLINEに送れます。
              </p>
              <div className="kt-custom" style={{ marginTop: 0 }}>
                <input className="kt-in" type="password" value={key} onChange={e => setKey(e.target.value)} placeholder="LINE操作キー" />
                <button className="kt-btn sm" onClick={saveKey} disabled={busy || !key.trim()}>{busy ? "確認中…" : "確認して保存"}</button>
              </div>
              {keyMsg && <div className="kt-err">{keyMsg}</div>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// 今日のお知らせ（誕生日・アプリの承認待ち）。管理画面のトップにあったもの
function Notices({ state }) {
  const birthdays = state.customers.filter(c => isBirthday(c.birthdate));
  const pending = state.customers.filter(c => c.pending);
  if (!birthdays.length && !pending.length) return null;
  return (
    <div style={{ textAlign: "left", marginTop: 14 }}>
      {birthdays.length > 0 && <div className="kt-notice gold"><span><Cake size={15} style={{ verticalAlign: -2 }} /> 今日お誕生日：{birthdays.map(c => `${c.name}様`).join("、")}</span></div>}
      {pending.length > 0 && <div className="kt-notice gold"><span>アプリの承認待ち：{pending.map(c => c.name).join("、")}（カルテの「アプリのアカウント」から承認できます）</span></div>}
    </div>
  );
}

// 連携状況（スプレッドシート・公式LINE・アプリ・Googleカレンダーがどこまでつながっているか）
function LinkStatus({ state, onSettings }) {
  const cs = state.customers;
  const tabs = sheetTabs(state.sheet);
  const inSheet = cs.filter(c => c.group !== "other");
  const lineAll = cs.filter(c => c.lineUserId);
  const lineLinked = lineAll.filter(c => c.group !== "other");
  const appAll = cs.filter(c => c.pid);
  const events = state.events || [];
  const matched = events.filter(ev => matchEvent(ev, cs, state.calMap));
  const Row = ({ ok, title, children }) => (
    <div className={`kt-status-row${ok ? " ok" : ""}`}><i>{ok ? <Check size={14} /> : "!"}</i><div><b>{title}</b><span>{children}</span></div></div>
  );
  return (
    <div className="kt-card kt-status" style={{ textAlign: "left" }}>
      <div className="kt-card-h"><h3>連携状況</h3><button className="kt-link" onClick={onSettings}><Settings size={13} />設定</button></div>
      <Row ok={!state.sheetError && inSheet.length > 0} title="スプレッドシート">
        {tabs.map(t => `${t.label} ${inSheet.filter(c => c.group === t.kind).length}人`).join("・")}
        {tabs[0]?.fetchedAt ? `（${new Date(tabs[0].fetchedAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })} 読み込み・5分ごとに自動で読み直し）` : ""}
        {state.sheetError ? ` ／ ${state.sheetError}` : ""}
      </Row>
      <Row ok={lineAll.length > 0 && lineLinked.length === lineAll.length} title="公式LINE">
        {lineAll.length}人のうち {lineLinked.length}人が名簿（No.）とつながっています
        {lineAll.length > lineLinked.length ? `。残り${lineAll.length - lineLinked.length}人は設定の「公式LINEのお客様を名簿とつなぐ」か一覧の「名簿にいない人」から選べます` : ""}
      </Row>
      <Row ok={appAll.length === 0 || appAll.every(c => c.group !== "other")} title="TTGYMアプリ">
        会員 {appAll.length}人（名簿とつながっている人 {appAll.filter(c => c.group !== "other").length}人）
      </Row>
      <Row ok={!!(state.calendar?.url || isDemo) && !state.calError} title="Googleカレンダー">
        {!(state.calendar?.url || isDemo) ? "まだつながっていません。設定で「iCal形式の非公開URL」を入れると、今日の予定が「本日の予約」に出ます"
          : state.calError ? state.calError : `今日の予定 ${events.length}件（お客様と分かったもの ${matched.length}件）`}
      </Row>
    </div>
  );
}

// ───────────────────────── 一覧 ─────────────────────────
const LIST_TAB_STORAGE = "ttgym_karte_list_tab";
const sectionColor = sec => /VVIP/i.test(sec) ? "#E5484D" : /VIP/i.test(sec) && /不定期/.test(sec) ? "#8BC48A" : /VIP/i.test(sec) ? "#F2C94C"
  : /A会員/.test(sec) ? "#4CC35A" : /マーカー/.test(sec) ? "#D94BC8" : /通い放題/.test(sec) ? "#4A90D9" : /解約|幽霊/.test(sec) ? "#A8A59D" : "#C9C4B8";
const normQ = s => String(s || "").normalize("NFKC").replace(/[\s　]+/g, "").toLowerCase();

function CustomerRow({ c, selected, onSelect, time, extra }) {
  const low = c.tickets != null && c.tickets <= LOW_TICKETS;
  return (
    <div className={`kt-row${selected === c.cid ? " on" : ""}`}>
      <button className="kt-row-main" onClick={() => onSelect(c.cid)}>
        {time != null ? <span className="kt-time">{time || "—"}</span> : <span className="kt-no">{c.memberNo ? c.memberNo.replace(/^no\.?/i, "No.") : ""}</span>}
        <div className="who">
          <div className="nm">{c.name}<Sources c={c} /></div>
          <div className="meta">
            {[c.group === "other" ? "名簿にいない人" : time != null ? c.section : null, c.lastVisit ? `来店 ${ago(c.lastVisit)}` : null, c.sheet?.nextReserve ? `次 ${c.sheet.nextReserve}` : null].filter(Boolean).join(" ・ ")}
          </div>
        </div>
        {c.group === "monthly" ? (
          <div className="kt-tk">
            <em>月額</em>
            {c.monthNo != null ? <><b className="num">{c.monthNo}</b><small>ヶ月目</small></> : <small>—</small>}
          </div>
        ) : (
          <div className={`kt-tk${low ? " low" : ""}`}>
            <em>残り</em>
            {c.tickets != null ? <><b className="num">{c.tickets}</b><small>回</small></> : <small>—</small>}
          </div>
        )}
      </button>
      {extra}
    </div>
  );
}

// 名前を選ぶ（本日の予約への追加・カレンダーの予定への割り当て）
function CustomerPicker({ customers, onPick, onCancel, placeholder = "名前・No.で探す" }) {
  const [q, setQ] = useState("");
  const nq = normQ(q);
  const hits = customers.filter(c => c.group !== "other" || c.lineUserId)
    .filter(c => !nq || [c.name, c.memberNo, c.appName, c.lineName].some(v => normQ(v).includes(nq))).slice(0, 30);
  return (
    <div className="kt-picker">
      <div className="kt-search" style={{ padding: 0 }}>
        <label><Search size={16} /><input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder={placeholder} /><button onClick={onCancel} aria-label="閉じる"><X size={16} /></button></label>
      </div>
      <div className="kt-picker-list">
        {hits.map(c => (
          <button key={c.cid} onClick={() => onPick(c)}>
            <span className="kt-no">{c.memberNo}</span>{c.name}<small>{c.group === "ticket" ? "回数券" : c.group === "monthly" ? "月額" : "LINE"}{c.section ? `・${c.section}` : ""}</small>
          </button>
        ))}
        {hits.length === 0 && <div className="kt-list-empty">見つかりません</div>}
      </div>
    </div>
  );
}

function TodayList({ state, selected, onSelect, onAddToday, onRemoveToday, onAssignEvent }) {
  const [adding, setAdding] = useState(false);
  const [assigning, setAssigning] = useState(null);
  const byCid = Object.fromEntries(state.customers.map(c => [c.cid, c]));
  const events = (state.events || []).map(ev => ({ ev, c: matchEvent(ev, state.customers, state.calMap) }));
  const fromCal = new Set(events.filter(x => x.c).map(x => x.c.cid));
  const manual = (state.today?.items || []).filter(x => byCid[x.cid] && !fromCal.has(x.cid));
  return (
    <div>
      <div className="kt-today-h">
        <span><CalendarDays size={14} />{state.todayDate?.replace(/-/g, "/")}</span>
        {!adding && <button className="kt-btn sm" onClick={() => setAdding(true)}><Plus size={14} />予約を追加</button>}
      </div>
      {adding && <CustomerPicker customers={state.customers} onCancel={() => setAdding(false)} onPick={c => { onAddToday(c.cid); setAdding(false); }} placeholder="予約の人を名前・No.で探す" />}
      {state.calError && <div className="kt-err" style={{ padding: "0 12px 8px" }}>カレンダー: {state.calError}</div>}
      {events.map(({ ev, c }, i) => c ? (
        <CustomerRow key={`ev${i}`} c={c} selected={selected} onSelect={onSelect} time={ev.allDay ? "終日" : ev.start}
          extra={<div className="kt-ev-note"><CalendarDays size={11} />{ev.summary}<button onClick={() => setAssigning(i)}>変更</button></div>} />
      ) : (
        <div key={`ev${i}`} className="kt-row kt-ev-unknown">
          <span className="kt-time">{ev.allDay ? "終日" : ev.start}</span>
          <div className="who"><div className="nm">{ev.summary}</div><div className="meta">カレンダーの予定（お客様が分かりません）</div></div>
          <button className="kt-btn ghost sm" onClick={() => setAssigning(i)}>名前を選ぶ</button>
        </div>
      ))}
      {assigning != null && (
        <CustomerPicker customers={state.customers} onCancel={() => setAssigning(null)}
          onPick={c => { onAssignEvent(events[assigning].ev, c.cid); setAssigning(null); }} placeholder={`「${events[assigning].ev.summary}」は誰？`} />
      )}
      {manual.map(x => (
        <CustomerRow key={x.cid} c={byCid[x.cid]} selected={selected} onSelect={onSelect} time={x.time}
          extra={<button className="kt-row-x" onClick={() => onRemoveToday(x.cid)} aria-label="本日の予約から外す"><X size={15} /></button>} />
      ))}
      {events.length === 0 && manual.length === 0 && !adding && (
        <div className="kt-list-empty">本日の予約はまだありません。<br />「予約を追加」で名前を選ぶか、設定でGoogleカレンダーをつなぐと自動で出ます</div>
      )}
    </div>
  );
}

function CustomerList({ state, selected, onSelect, onAddToday, onRemoveToday, onAssignEvent }) {
  const customers = state.customers;
  const [q, setQ] = useState("");
  const calCids = new Set((state.events || []).map(ev => matchEvent(ev, customers, state.calMap)?.cid).filter(Boolean));
  const todayCount = (state.events || []).length + (state.today?.items || []).filter(x => !calCids.has(x.cid)).length;
  const [tab, setTab] = useState(() => lsGet(LIST_TAB_STORAGE) || (todayCount ? "today" : "ticket"));
  const choose = t => { setTab(t); lsSet(LIST_TAB_STORAGE, t); };
  const others = customers.filter(c => c.group === "other");
  const LIST_TABS = [
    { key: "today", label: "本日の予約", n: todayCount },
    { key: "ticket", label: "回数券", n: customers.filter(c => c.group === "ticket").length },
    { key: "monthly", label: "月額", n: customers.filter(c => c.group === "monthly").length },
    ...(others.length ? [{ key: "other", label: "未連携", n: others.length }] : []),
  ];
  const nq = normQ(q);
  const searched = nq ? customers.filter(c => [c.name, c.memberNo, c.appName, c.lineName, c.phone].some(v => normQ(v).includes(nq))) : null;
  const shown = searched || customers.filter(c => c.group === tab);
  // 区切り（VVIP・VIP・A会員…）ごとに見出しを入れる
  const rows = [];
  let last = null;
  for (const c of shown) {
    const sec = searched ? null : c.group === "other" ? null : c.section || "";
    if (sec != null && sec !== last) { rows.push({ sec }); last = sec; }
    rows.push({ c });
  }
  return (
    <aside className="kt-side">
      <div className="kt-search">
        <label><Search size={17} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="名前・No.で検索" />{q && <button onClick={() => setQ("")} aria-label="消す"><X size={15} /></button>}</label>
      </div>
      {!searched && (
        <div className="kt-groups">
          {LIST_TABS.map(t => (
            <button key={t.key} className={tab === t.key ? "on" : ""} onClick={() => choose(t.key)}>{t.label}<span className="n">{t.n}</span></button>
          ))}
        </div>
      )}
      <div className="kt-list">
        {!searched && tab === "today" ? (
          <TodayList state={state} selected={selected} onSelect={onSelect} onAddToday={onAddToday} onRemoveToday={onRemoveToday} onAssignEvent={onAssignEvent} />
        ) : (
          <>
            {tab === "other" && !searched && <div className="kt-list-note">公式LINE・アプリにいて、名簿の名前と合わなかった人です。選んでカルテの「名簿とつなぐ」（または設定）から No. の人を選ぶと、名簿の名前・No.で表示されます</div>}
            {rows.length === 0 && <div className="kt-list-empty">該当するお客様がいません</div>}
            {rows.map((r, i) => r.sec != null ? (
              <div key={`s${i}`} className="kt-sec" style={{ "--sec": sectionColor(r.sec) }}>{r.sec || "（区切りなし）"}</div>
            ) : (
              <CustomerRow key={r.c.cid} c={r.c} selected={selected} onSelect={onSelect} />
            ))}
          </>
        )}
      </div>
    </aside>
  );
}

// ───────────────────────── 1人のカルテ ─────────────────────────
const TABS = [
  { key: "record", label: "今日の記録", icon: Pencil },
  { key: "overview", label: "カルテ", icon: ClipboardList },
  { key: "meals", label: "食事・栄養", icon: Utensils },
  { key: "growth", label: "成長・測定", icon: TrendingUp },
  { key: "photos", label: "ビフォーアフター", icon: ImageIcon },
  { key: "line", label: "LINE", icon: MessageCircle },
  { key: "history", label: "履歴", icon: History },
];

function CustomerView({ c, state, onBack, onPatch, onReload, flash, setMenus, setCircuits, onSelect }) {
  const [d, setD] = useState(null);
  // 開いたらまず今日の記録（メモ）。トレーニング中にそのまま書き始められるように
  const [tab, setTab] = useState("record");
  const reload = async () => setD(await loadDetail(c));
  useEffect(() => { setD(null); reload(); }, [c.cid]);

  const low = c.tickets != null && c.tickets <= LOW_TICKETS;
  const visits = d ? d.karteSessions.length : null;

  async function changeTickets(delta, setTo) {
    const k = await adjustTickets(c, delta, setTo != null ? "手入力" : delta > 0 ? "手動で追加" : "手動で減らす", setTo);
    onPatch({ tickets: k.tickets, karte: k });
  }

  return (
    <div>
      <button className="kt-back" onClick={onBack}><ChevronLeft size={18} />一覧へ</button>
      <section className="kt-hero">
        <div className="kt-id">
          <Avatar c={c} lg />
          <div style={{ minWidth: 0 }}>
            <div className="kana">
              {c.memberNo && <b className="kt-hero-no">{c.memberNo}</b>}
              {c.group !== "other" && <span>{c.group === "monthly" ? "月額" : "回数券"}{c.section ? `・${c.section}` : ""}</span>}
              {c.furigana && <span>{c.furigana}</span>}
              {c.appName && c.appName !== c.name && <span>（アプリ・LINE: {c.appName}）</span>}
            </div>
            <h1>{c.name} <span style={{ fontSize: 15, fontWeight: 500, color: "var(--sub)" }}>様</span></h1>
            <div className="facts">
              <span><b className="num">{c.age ?? "—"}</b> 歳</span>
              {c.sheet?.nextReserve && <span>次の予約 <b>{c.sheet.nextReserve}</b></span>}
              <span>来店 <b className="num">{visits ?? "…"}</b> 回</span>
              <span>前回 <b>{c.lastVisit ? `${md(c.lastVisit)}（${ago(c.lastVisit)}）` : "—"}</b></span>
              <Sources c={c} />
            </div>
          </div>
        </div>
        {c.group === "monthly" ? <MonthCard c={c} /> : <TicketCard c={c} low={low} onChange={changeTickets} />}
      </section>

      <nav className="kt-tabs">
        {TABS.map(t => (
          <button key={t.key} className={`${tab === t.key ? "on" : ""}${t.key === "record" ? " rec" : ""}`} onClick={() => setTab(t.key)}><t.icon size={15} />{t.label}</button>
        ))}
      </nav>

      {!d ? <div className="kt-loading" style={{ minHeight: 200 }}>読み込み中…</div> : (
        <>
          {tab === "overview" && <OverviewTab c={c} d={d} state={state} onPatch={onPatch} flash={flash} onReload={onReload} onReloadDetail={reload} onSelect={onSelect} goRecord={() => setTab("record")} />}
          {tab === "record" && (
            <RecordTab c={c} d={d} state={state} setMenus={setMenus} setCircuits={setCircuits} flash={flash}
              onSaved={async karte => { onPatch({ tickets: karte.tickets ?? c.tickets, lastVisit: karte.lastVisit, karte }); await reload(); setTab("history"); }} />
          )}
          {tab === "growth" && <GrowthTab c={c} d={d} flash={flash} onSaved={async () => { onPatch({}); await reload(); }} />}
          {tab === "meals" && <MealsTab c={c} d={d} flash={flash} onSaved={async () => { onPatch({}); await reload(); }} />}
          {tab === "line" && <LineTab c={c} d={d} state={state} flash={flash} onReload={async () => { await reload(); await onReload(); }} />}
          {tab === "photos" && <PhotosTab c={c} d={d} flash={flash} onSaved={async () => { onPatch({}); await reload(); }} />}
          {tab === "history" && (
            <HistoryTab d={d} onDeleteOld={async () => {
              if (!window.confirm("1年以上前の記録（食事・体調・成長・トレーニング・月次測定・水分）を削除します。元に戻せません。よろしいですか？\n（トレーナーのコメント・パーソナル記録・カルテの記録は残ります）")) return;
              const cutoff = await deleteOldRecords(c);
              await reload();
              flash(`${ymd(cutoff)}より前の記録を削除しました`);
            }} onDelete={async s => {
              if (!window.confirm(`${ymd(s.date)} の記録を削除しますか？${s.ticketUsed ? "\n（使った回数券は1回戻します）" : ""}`)) return;
              const k = await deleteSession(c, s);
              if (k) onPatch({ tickets: k.tickets, karte: k });
              await reload();
              flash("削除しました");
            }} />
          )}
        </>
      )}
    </div>
  );
}

// 月額の人: 残り回数ではなく「何ヶ月目」（名簿の「何カ月目」の列）
function MonthCard({ c }) {
  return (
    <div className="kt-ticket month">
      <div className="lab">月額 ・ {c.section || "通い放題"}</div>
      <div className="row">
        <div className="big"><b className="num">{c.monthNo ?? "—"}</b><span>ヶ月目</span></div>
      </div>
      <div className="note">
        {[c.sheet?.perWeek ? `週${c.sheet.perWeek}回` : "", c.sheet?.bind ? `縛り ${c.sheet.bind}まで` : ""].filter(Boolean).join(" ・ ") || "名簿の「何カ月目」を表示しています"}
      </div>
    </div>
  );
}

function TicketCard({ c, low, onChange }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState("");
  const sheetVal = c.sheet?.tickets;
  return (
    <div className={`kt-ticket${low ? " low" : ""}`}>
      <div className="lab">残り回数券</div>
      {editing ? (
        <div className="row" style={{ marginTop: 6 }}>
          <input className="kt-in num" style={{ width: 90, color: "var(--ink)" }} inputMode="numeric" value={val} onChange={e => setVal(e.target.value)} autoFocus />
          <div className="steps">
            <button aria-label="保存" onClick={async () => { if (val !== "" && !isNaN(Number(val))) await onChange(0, Math.max(0, Math.round(Number(val)))); setEditing(false); }}><Check size={16} /></button>
            <button aria-label="キャンセル" onClick={() => setEditing(false)}><X size={16} /></button>
          </div>
        </div>
      ) : (
        <div className="row">
          <button className="big" onClick={() => { setVal(c.tickets ?? ""); setEditing(true); }} title="数字を押すと直接入力できます">
            <b className="num">{c.tickets ?? "—"}</b><span>回</span>
          </button>
          <div className="steps">
            <button aria-label="1回減らす" onClick={() => onChange(-1)}><Minus size={16} /></button>
            <button aria-label="1回増やす" onClick={() => onChange(+1)}><Plus size={16} /></button>
          </div>
        </div>
      )}
      <div className="note">
        {low ? "残りわずか。次回の購入をご案内" : "セッションを記録すると自動で1回減ります"}
        {sheetVal != null && sheetVal !== c.tickets && <><br />シートの値: {sheetVal}回</>}
      </div>
    </div>
  );
}

// ───────────────────────── カルテ（概要） ─────────────────────────
function OverviewTab({ c, d, state, onPatch, flash, onReload, onReloadDetail, onSelect, goRecord }) {
  const last = [...d.karteSessions].sort((a, b) => b.date.localeCompare(a.date))[0];
  return (
    <div className="kt-grid">
      <GoalCard c={c} onPatch={onPatch} flash={flash} />
      <NoteCard c={c} onPatch={onPatch} flash={flash} />
      <div className="kt-card wide">
        <div className="kt-card-h"><h3>成長の変化 <small>はじめて測った日 → 最新</small></h3></div>
        <Deltas growth={d.growth} monthly={d.monthly} c={c} />
      </div>
      <div className="kt-card">
        <div className="kt-card-h">
          <h3>前回のセッション {last && <small>{ymd(last.date)}（{ago(last.date)}）</small>}</h3>
          <button className="kt-link" onClick={goRecord}><Pencil size={13} />今日の記録</button>
        </div>
        {last ? <SessionBody s={last} /> : <div className="kt-empty">まだ記録がありません</div>}
      </div>
      <ConditionCard conditions={d.conditions} />
      <SelfTrainingCard workouts={d.workouts} />
      <ReportCard d={d} />
      <TrainingNotesCard c={c} d={d} flash={flash} onSaved={async () => { onPatch({}); await onReloadDetail(); }} />
      <CommentsCard c={c} d={d} flash={flash} onSaved={async () => { onPatch({}); await onReloadDetail(); }} />
      <MembershipCard c={c} d={d} flash={flash} onSaved={onReloadDetail} />
      {c.pid && <AccountCard c={c} d={d} flash={flash} onSaved={async () => { await onReloadDetail(); await onReload(); }} />}
      <SheetCard c={c} state={state} flash={flash} onReload={onReload} onSelect={onSelect} />
    </div>
  );
}

function GoalCard({ c, onPatch, flash }) {
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({ goal: "", targetWeight: "", targetBodyFat: "" });
  const open = () => { setF({ goal: c.goal || "", targetWeight: c.targetWeight ?? "", targetBodyFat: c.targetBodyFat ?? "" }); setEdit(true); };
  async function save() {
    const v = { goal: f.goal.trim(), targetWeight: f.targetWeight === "" ? null : Number(f.targetWeight), targetBodyFat: f.targetBodyFat === "" ? null : Number(f.targetBodyFat) };
    await saveGoal(c, v);
    onPatch(v);
    setEdit(false);
    flash(c.pid || c.lineUserId ? "目標を保存しました（アプリ・LINEにも反映）" : "目標を保存しました");
  }
  return (
    <div className="kt-card">
      <div className="kt-card-h">
        <div className="kt-eb">GOAL · 目標</div>
        {!edit && <button className="kt-link" onClick={open}><Pencil size={13} />編集</button>}
      </div>
      {edit ? (
        <>
          <label className="kt-field"><span>目標</span><textarea className="kt-ta" rows={3} value={f.goal} onChange={e => setF({ ...f, goal: e.target.value })} placeholder="例：結婚式までに−5kg" /></label>
          <div className="kt-row2">
            <label className="kt-field"><span>目標体重(kg)</span><input className="kt-in" inputMode="decimal" value={f.targetWeight} onChange={e => setF({ ...f, targetWeight: e.target.value })} /></label>
            <label className="kt-field"><span>目標体脂肪率(%)</span><input className="kt-in" inputMode="decimal" value={f.targetBodyFat} onChange={e => setF({ ...f, targetBodyFat: e.target.value })} /></label>
          </div>
          <div style={{ display: "flex", gap: 8 }}><button className="kt-btn" onClick={save}>保存</button><button className="kt-btn ghost" onClick={() => setEdit(false)}>キャンセル</button></div>
        </>
      ) : (
        <>
          {c.goal ? <div className="kt-goal kt-pre">{c.goal}</div> : <div className="kt-empty">目標はまだ登録されていません</div>}
          <div className="kt-goal-nums">
            <div><span>目標体重</span><b className="num">{c.targetWeight ?? "—"}<small>kg</small></b></div>
            <div><span>目標体脂肪率</span><b className="num">{c.targetBodyFat ?? "—"}<small>%</small></b></div>
          </div>
        </>
      )}
    </div>
  );
}

// ずっと見えている注意事項（ケガ・好み・家族構成など）。スタッフだけが見る
function NoteCard({ c, onPatch, flash }) {
  const [edit, setEdit] = useState(false);
  const [text, setText] = useState("");
  const note = c.karte?.note || "";
  async function save() {
    const k = await updateKarte(c, x => ({ ...x, note: text.trim(), noteUpdatedAt: new Date().toISOString() }));
    onPatch({ karte: k });
    setEdit(false);
    flash("メモを保存しました");
  }
  return (
    <div className="kt-card kt-memo">
      <div className="kt-card-h">
        <div className="kt-eb">STAFF MEMO · 注意事項</div>
        {!edit && <button className="kt-link" onClick={() => { setText(note); setEdit(true); }}><Pencil size={13} />編集</button>}
      </div>
      {edit ? (
        <>
          <textarea className="kt-ta memo" rows={5} value={text} onChange={e => setText(e.target.value)} placeholder="ケガ・持病、苦手な種目、好きな話題など（お客様には表示されません）" autoFocus />
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}><button className="kt-btn" onClick={save}>保存</button><button className="kt-btn ghost" onClick={() => setEdit(false)}>キャンセル</button></div>
        </>
      ) : note ? <div className="kt-pre">{note}</div> : <div className="kt-empty">ケガや注意点、好みなどを残しておけます（お客様には表示されません）</div>}
    </div>
  );
}

const METRICS = [
  { key: "weight", label: "体重", unit: "kg", src: "growth", better: "down", target: "targetWeight" },
  { key: "bodyFat", label: "体脂肪率", unit: "%", src: "growth", better: "down", target: "targetBodyFat" },
  { key: "muscleMass", label: "筋肉量", unit: "kg", src: "growth", better: "up" },
  { key: "waist", label: "ウエスト", unit: "cm", src: "growth", better: "down" },
  { key: "hip", label: "ヒップ", unit: "cm", src: "growth", better: "down" },
  { key: "situps", label: "腹筋1分", unit: "回", src: "monthly", better: "up" },
  { key: "benchMax", label: "ベンチMAX", unit: "kg", src: "monthly", better: "up" },
  { key: "hipThrust", label: "ヒップスラスト", unit: "kg", src: "monthly", better: "up" },
];

const points = (list, key) => [...list].filter(x => x[key] != null && x[key] !== "" && !isNaN(Number(x[key])))
  .sort((a, b) => a.date.localeCompare(b.date)).map(x => ({ date: x.date, v: Number(x[key]) }));

function Deltas({ growth, monthly, c }) {
  const rows = METRICS.map(m => ({ m, pts: points(m.src === "growth" ? growth : monthly, m.key) })).filter(r => r.pts.length);
  if (!rows.length) return <div className="kt-empty">測定の記録がまだありません。「成長・測定」から追加できます</div>;
  return (
    <div className="kt-deltas">
      {rows.slice(0, 6).map(({ m, pts }) => {
        const first = pts[0], lastP = pts[pts.length - 1];
        const diff = Math.round((lastP.v - first.v) * 10) / 10;
        const dir = diff === 0 || pts.length < 2 ? "flat" : (diff < 0) === (m.better === "down") ? "good" : "bad";
        const target = m.target ? c[m.target] : null;
        return (
          <div key={m.key} className="kt-delta">
            <div className="lab">{m.label}</div>
            <div className="now num">{r1(lastP.v)}<small>{m.unit}</small></div>
            {pts.length > 1 ? (
              <div className={`chg ${dir}`}>{diff < 0 ? <ArrowDownRight size={14} /> : diff > 0 ? <ArrowUpRight size={14} /> : null}{diff > 0 ? "+" : ""}{r1(diff)}{m.unit}</div>
            ) : <div className="chg flat">記録1回</div>}
            <div className="from">{md(first.date)} {r1(first.v)}{m.unit} から{target != null ? ` ・ 目標まで ${r1(Math.abs(lastP.v - target))}${m.unit}` : ""}</div>
          </div>
        );
      })}
    </div>
  );
}

function SessionBody({ s }) {
  const cond = DAY_CONDITIONS.find(x => x.n === s.condition);
  return (
    <>
      {(cond || s.parts?.length > 0) && (
        <div className="kt-sess-h" style={{ marginBottom: 8 }}>
          {cond && <span className="kt-tag" style={{ background: `${cond.color}22`, color: cond.color === "#A8A59D" ? "var(--sub)" : cond.color }}>体調: {cond.label}</span>}
          {(s.parts || []).map(p => <span key={p} className="kt-tag red">{p}に違和感</span>)}
        </div>
      )}
      {s.items?.length > 0 && (
        <div className="kt-items">
          {s.items.map((i, n) => (
            <div key={n} className={i.note ? "has-note" : ""}>
              <span>{i.name}</span><span className="num">{setsText(i)}</span>
              {i.note && <small className="kt-item-note">{i.note}</small>}
            </div>
          ))}
        </div>
      )}
      {s.comment && <div className="kt-say"><small>お客様へのコメント</small><span className="kt-pre">{s.comment}</span></div>}
      {s.memo && <div className="kt-staffmemo"><small>スタッフメモ</small><span className="kt-pre">{s.memo}</span></div>}
    </>
  );
}

function ConditionCard({ conditions }) {
  const sorted = [...conditions].sort((a, b) => b.date.localeCompare(a.date));
  const latest = sorted[0];
  const lv = (levels, n) => levels.find(l => l.n === n)?.label ?? "—";
  const week = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(Date.parse(`${jstToday()}T00:00:00Z`) - (6 - i) * 86400000).toISOString().slice(0, 10);
    const x = conditions.find(cn => cn.date === date);
    return { date, score: x ? (x.sleep || 0) + (x.mental || 0) : null };
  });
  return (
    <div className="kt-card">
      <div className="kt-card-h"><h3>最近の体調 <small>アプリ・公式LINEの記録</small></h3>{latest && <span className="kt-muted">{md(latest.date)}（{ago(latest.date)}）</span>}</div>
      {!latest ? <div className="kt-empty">お客様の体調の記録はまだありません</div> : (
        <>
          <div className="kt-cond">
            <div><span>睡眠</span><b>{lv(SLEEP_LEVELS, latest.sleep)}{latest.sleepHours ? ` ${latest.sleepHours}h` : ""}</b></div>
            <div><span>朝の疲れ</span><b>{lv(FATIGUE_LEVELS, latest.morningFatigue)}</b></div>
            <div><span>メンタル</span><b>{lv(MENTAL_LEVELS, latest.mental)}</b></div>
            <div><span>お通じ</span><b>{BOWEL_OPTIONS[latest.bowel] ?? "—"}</b></div>
          </div>
          <div className="kt-dots" style={{ height: 46 }} aria-label="直近7日の調子（睡眠＋メンタル）">
            {week.map(w => <i key={w.date} title={`${md(w.date)} ${w.score ?? "記録なし"}`} style={{ height: w.score ? `${(w.score / 10) * 100}%` : 6, background: w.score ? undefined : "var(--track)" }} />)}
          </div>
          <div className="kt-dots-lab"><span>{md(week[0].date)}</span><span>直近7日の調子（睡眠＋メンタル）</span><span>今日</span></div>
        </>
      )}
    </div>
  );
}

function SelfTrainingCard({ workouts }) {
  const recent = [...workouts].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  const last30 = new Set(workouts.filter(w => daysAgo(w.date) <= 30).map(w => w.date)).size;
  return (
    <div className="kt-card">
      <div className="kt-card-h"><h3>自主トレ <small>アプリ・公式LINEの記録</small></h3><span className="kt-muted">30日で <b className="num" style={{ color: "var(--ink)" }}>{last30}</b> 日</span></div>
      {recent.length === 0 ? <div className="kt-empty">自主トレの記録はまだありません</div> : (
        <div className="kt-items">
          {recent.map(w => <div key={w.id}><span>{md(w.date)}　{w.exercise}</span><span className="num">{w.reps}{w.unit === "sec" ? "秒" : "回"}{w.weight ? ` × ${w.weight}kg` : ""}</span></div>)}
        </div>
      )}
    </div>
  );
}

// スプレッドシートの行（元の顧客情報）と、公式LINE・アプリとのつなぎ
//   名簿の人 → 公式LINE・アプリのどの人か選ぶ（LINEの名前がニックネームでも、ここでつなげば名簿の名前・No.で動く）
//   名簿にいない人 → 名簿のどの No. の人か選ぶ
function SheetCard({ c, state, flash, onReload, onSelect }) {
  const [linking, setLinking] = useState(false);
  const [busy, setBusy] = useState(false);
  const takenRows = new Set(state.customers.filter(x => x.kind !== "sheet" && x.sheet && x.cid !== c.cid).map(x => x.sheet.rowKey));
  const freeRows = state.sheetRows.filter(r => !takenRows.has(r.rowKey))
    .map(r => ({ r, score: nameScore(r.name, c.appName || c.name) + nameScore(r.name, c.lineName) }))
    .sort((a, b) => b.score - a.score || a.r.order - b.r.order);
  const freePeople = state.customers.filter(x => x.group === "other")
    .map(x => ({ x, score: Math.max(nameScore(x.name, c.name), nameScore(x.lineName, c.name)) }))
    .sort((a, b) => b.score - a.score || a.x.name.localeCompare(b.x.name, "ja"));
  const rowLabel = r => `${r.memberNo || "No.なし"} ${r.name}（${r.tabLabel}${r.section ? `・${r.section}` : ""}）`;

  // 名簿にいない人 → 名簿の行を選ぶ
  async function pickRow(rowKey) {
    setBusy(true);
    const row = state.sheetRows.find(r => r.rowKey === rowKey);
    if (row) await connectToSheet(c, row); else await linkSheetRow(c.cid, null);
    setLinking(false); setBusy(false);
    flash(row ? `${row.memberNo || ""} ${row.name} とつなぎました` : "つなぎを外しました");
    await onReload();
  }
  // 名簿の人 → 公式LINE・アプリの人を選ぶ（選んだ人のカルテに切り替わる）
  async function pickPerson(cid) {
    const person = state.customers.find(x => x.cid === cid);
    if (!person || !c.sheet) return;
    setBusy(true);
    await connectToSheet(person, c.sheet);
    setLinking(false); setBusy(false);
    flash(`公式LINE・アプリの「${person.name}」とつなぎました`);
    await onReload();
    onSelect?.(person.cid);
  }
  async function unlink() {
    setBusy(true);
    await linkSheetRow(c.cid, null);
    setBusy(false);
    flash("名簿とのつなぎを外しました");
    await onReload();
  }

  const lineInfo = c.lineUserId ? `公式LINE: ${c.lineName || c.appName || "つながっています"}` : c.pid ? "アプリ会員" : null;
  return (
    <div className="kt-card">
      <div className="kt-card-h">
        <h3><FileSpreadsheet size={16} />名簿（スプレッドシート）</h3>
        {c.kind === "sheet"
          ? <button className="kt-link" onClick={() => setLinking(v => !v)}><Link2 size={13} />公式LINE・アプリとつなぐ</button>
          : <button className="kt-link" onClick={() => setLinking(v => !v)}><Link2 size={13} />{c.sheet ? "名簿の人を変える" : "名簿とつなぐ"}</button>}
      </div>
      {lineInfo && <div className="kt-muted" style={{ marginBottom: 10 }}>{lineInfo}{c.sheet && c.kind !== "sheet" && <button className="kt-link" style={{ marginLeft: 10 }} onClick={unlink} disabled={busy}>外す</button>}</div>}
      {linking && c.kind === "sheet" && (
        freePeople.length ? (
          <select className="kt-sel" style={{ marginBottom: 12 }} defaultValue="" onChange={e => pickPerson(e.target.value)} disabled={busy}>
            <option value="" disabled>公式LINE・アプリのお客様を選ぶ（似た名前が上）</option>
            {freePeople.map(({ x, score }) => <option key={x.cid} value={x.cid}>{score >= 2 ? "◎ " : ""}{x.name}{x.lineName && x.lineName !== x.name ? `（LINE: ${x.lineName}）` : ""}{x.pid ? "・アプリ" : ""}</option>)}
          </select>
        ) : <div className="kt-empty">名簿とつながっていない公式LINE・アプリのお客様はいません</div>
      )}
      {linking && c.kind !== "sheet" && (
        <select className="kt-sel" style={{ marginBottom: 12 }} value={c.sheet?.rowKey || ""} onChange={e => pickRow(e.target.value)} disabled={busy}>
          <option value="">（名簿とつながない）</option>
          {freeRows.map(({ r, score }) => <option key={r.rowKey} value={r.rowKey}>{score >= 2 ? "◎ " : ""}{rowLabel(r)}</option>)}
        </select>
      )}
      {c.sheet ? (
        <dl className="kt-kv">{Object.entries(c.sheet.raw).map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt><dd>{v}</dd></React.Fragment>)}</dl>
      ) : <div className="kt-empty">名簿に同じ名前の人が見つかりませんでした。「名簿とつなぐ」から No. の人を選んでください（似た名前に◎）</div>}
    </div>
  );
}

// トレーナーコメント（1週間・1ヶ月・パーソナル・体調管理）。アプリ・公式LINEの「コメント」に出る
function CommentsCard({ c, d, flash, onSaved }) {
  const [type, setType] = useState("weekly");
  const [text, setText] = useState("");
  const [sendLine, setSendLine] = useState(!!c.lineUserId && !isDemo);
  const [busy, setBusy] = useState(false);
  const list = [...d.comments].filter(x => x.type === type).sort((a, b) => (b.date + (b.createdAt || "")).localeCompare(a.date + (a.createdAt || "")));
  const label = COMMENT_TYPES.find(t => t.key === type)?.label || "";
  async function save() {
    setBusy(true);
    await addComment(c, type, text.trim());
    let msg = "コメントを保存しました（アプリ・LINEの「コメント」に出ます）";
    if (sendLine && c.lineUserId) {
      try { await notifyLine(c.lineUserId, `【TTGYM】トレーナーから${label}が届きました。\n\n${text.trim()}`); msg = "コメントを保存して、LINEにも送りました"; }
      catch (e) { msg = `コメントを保存しました（LINEは送れませんでした: ${e.message}）`; }
    }
    setText(""); setBusy(false); flash(msg); await onSaved();
  }
  return (
    <div className="kt-card">
      <div className="kt-card-h"><h3><MessageCircle size={16} />トレーナーコメント <small>アプリ・LINEの「コメント」に出ます</small></h3></div>
      <div className="kt-pills" style={{ marginBottom: 10 }}>
        {COMMENT_TYPES.map(t => <button key={t.key} className={`kt-pill${type === t.key ? " on" : ""}`} onClick={() => setType(t.key)}>{t.label.replace(/へ?のコメントとアドバイス$/, "")}<span style={{ opacity: .6 }}>{d.comments.filter(x => x.type === t.key).length}</span></button>)}
      </div>
      <textarea className="kt-ta" rows={3} value={text} onChange={e => setText(e.target.value)} placeholder={`${label}を書く`} />
      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "8px 0 12px", flexWrap: "wrap" }}>
        <button className="kt-btn sm" onClick={save} disabled={busy || !text.trim()}>{busy ? "保存中…" : "保存"}</button>
        {c.lineUserId && <label className="kt-muted" style={{ display: "flex", alignItems: "center", gap: 6 }}><input type="checkbox" checked={sendLine} onChange={e => setSendLine(e.target.checked)} disabled={isDemo} />LINEにも送る</label>}
      </div>
      {list.length === 0 ? <div className="kt-empty">まだありません</div> : list.slice(0, 5).map(x => (
        <div key={x.id} className="kt-comment">
          <div><small>{ymd(x.date)}{x.staff ? `・${x.staff}` : ""}</small><button className="kt-del" onClick={async () => { if (window.confirm("このコメントを消しますか？（アプリ・LINEからも消えます）")) { await deleteComment(c, x.id); await onSaved(); } }}><Trash2 size={12} /></button></div>
          <div className="kt-pre">{x.text}</div>
        </div>
      ))}
    </div>
  );
}

// メンバーシップ（ランク・ポイント）。アプリ会員はポイントの調整もできる（アプリ・LINEの表示と同じ式）
function MembershipCard({ c, d, flash, onSaved }) {
  const m = membershipOf(d);
  const adj = Number(d.profile?.pointAdjustment) || 0;
  async function change(delta) {
    await patchProfile(c.pid, { pointAdjustment: adj + delta });
    flash(`ポイントを${delta > 0 ? "+" : ""}${delta}しました`);
    await onSaved();
  }
  return (
    <div className="kt-card">
      <div className="kt-card-h"><h3><Award size={16} />メンバーシップ</h3>{adj !== 0 && <small className="kt-muted">調整 {adj > 0 ? "+" : ""}{adj}pt</small>}</div>
      <div className="kt-rank">
        <i style={{ background: m.tier.color }} />
        <div><b>{m.tier.name}</b><span><b className="num">{m.points}</b> pt{m.nextTier ? `（${m.nextTier.name}まであと${m.nextTier.min - m.points}pt）` : ""}</span></div>
        {c.pid && (
          <div className="kt-rank-adj">
            <button className="kt-btn ghost sm" onClick={() => change(-1)}>−1</button>
            <button className="kt-btn ghost sm" onClick={() => change(+1)}>+1</button>
            <button className="kt-btn ghost sm" onClick={() => change(+5)}>+5</button>
          </div>
        )}
      </div>
      <div className="kt-tiers">{TIERS.map(t => <span key={t.name} className={t.name === m.tier.name ? "on" : ""} style={{ "--c": t.color }}>{t.name}<small>{t.min}</small></span>)}</div>
      <ul className="kt-rules">{POINT_RULES.map(r => <li key={r}>{r}</li>)}</ul>
    </div>
  );
}

// アプリ会員のアカウント（承認・強制停止・誕生日）
function AccountCard({ c, d, flash, onSaved }) {
  const p = d.profile || {};
  const [busy, setBusy] = useState(false);
  async function set(patch, msg) {
    setBusy(true);
    await patchProfile(c.pid, patch);
    setBusy(false); flash(msg); await onSaved();
  }
  return (
    <div className="kt-card">
      <div className="kt-card-h"><h3><UserRound size={16} />アプリのアカウント</h3></div>
      {isBirthday(p.birthdate) && <div className="kt-notice gold"><Cake size={15} />今日は{c.name}様のお誕生日です</div>}
      {p.registered && !p.approved && (
        <div className="kt-notice gold">承認待ちです。承認するまでアプリは使えません
          <button className="kt-btn sm gold" disabled={busy} onClick={() => set({ approved: true }, "承認しました")}>承認する</button>
        </div>
      )}
      <dl className="kt-kv">
        <dt>アプリの名前</dt><dd>{p.name || "—"}{p.furigana ? `（${p.furigana}）` : ""}</dd>
        <dt>電話番号</dt><dd>{p.phone || "—"}</dd>
        <dt>生年月日</dt><dd>{p.birthdate ? ymd(p.birthdate) : "—"}</dd>
        <dt>状態</dt><dd style={{ color: p.blocked ? "var(--red-text)" : undefined }}>{p.blocked ? "強制停止中（アプリ・公式LINEが使えません）" : p.approved ? "利用中" : "承認待ち"}</dd>
      </dl>
      <div style={{ marginTop: 12 }}>
        {p.blocked
          ? <button className="kt-btn sm" disabled={busy} onClick={() => set({ blocked: false }, "利用を再開しました")}>利用を再開する</button>
          : <button className="kt-btn ghost sm" style={{ color: "var(--red-text)" }} disabled={busy} onClick={() => window.confirm(`${c.name}様のアプリを強制停止しますか？（あとで再開できます）`) && set({ blocked: true }, "強制停止しました")}>強制停止する</button>}
      </div>
    </div>
  );
}

// 1週間・1ヶ月のレポート（体調・トレーニング・食事・水分・体重）。管理画面のレポートと同じ中身
function ReportCard({ d }) {
  const [days, setDays] = useState(7);
  const today = jstToday();
  const dates = Array.from({ length: days }, (_, i) => new Date(Date.parse(`${today}T00:00:00Z`) - (days - 1 - i) * 86400000).toISOString().slice(0, 10));
  const from = dates[0];
  const inP = x => x.date >= from && x.date <= today;
  const avg = xs => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const conds = d.conditions.filter(inP);
  const condBy = Object.fromEntries(conds.map(x => [x.date, x]));
  const workouts = d.workouts.filter(inP);
  const meals = d.meals.filter(inP);
  const kcalBy = {};
  for (const m of meals) kcalBy[m.date] = (kcalBy[m.date] || 0) + m.kcal;
  const waters = dates.map(x => Number(d.water[x]) || 0).filter(Boolean);
  const w = d.growth.filter(g => g.weight != null && inP(g)).sort((a, b) => a.date.localeCompare(b.date));
  const active = new Set([...conds, ...workouts, ...meals, ...d.growth.filter(inP)].map(x => x.date));
  const chart = dates.map(x => ({ date: md(x), 睡眠: condBy[x]?.sleep ?? null, メンタル: condBy[x]?.mental ?? null, だるさ: condBy[x]?.morningFatigue ?? null }));
  const stats = [
    ["記録した日", `${active.size}/${days}`, "日"],
    ["睡眠の質（平均）", r1(avg(conds.map(x => Number(x.sleep)).filter(Boolean))), "/5"],
    ["睡眠時間（平均）", r1(avg(conds.map(x => Number(x.sleepHours)).filter(Boolean))), "時間"],
    ["メンタル（平均）", r1(avg(conds.map(x => Number(x.mental)).filter(Boolean))), "/5"],
    ["朝のだるさ（平均）", r1(avg(conds.map(x => Number(x.morningFatigue)).filter(Boolean))), "/5"],
    ["自主トレ", new Set(workouts.map(x => x.date)).size, "日"],
    ["自主トレの消費", Math.round(workouts.reduce((n, x) => n + (Number(x.calories) || 0), 0)).toLocaleString(), "kcal"],
    ["食事（1日平均）", Object.keys(kcalBy).length ? Math.round(avg(Object.values(kcalBy))).toLocaleString() : "—", "kcal"],
    ["水分（1日平均）", waters.length ? Math.round(avg(waters)).toLocaleString() : "—", "ml"],
    ["体重の変化", w.length >= 2 ? `${w[w.length - 1].weight - w[0].weight > 0 ? "+" : ""}${r1(w[w.length - 1].weight - w[0].weight)}` : "—", "kg"],
  ];
  return (
    <div className="kt-card wide">
      <div className="kt-card-h">
        <h3>レポート <small>アプリ・公式LINE・カルテの記録から</small></h3>
        <div className="kt-pills">{[[7, "1週間"], [30, "1ヶ月"]].map(([n, l]) => <button key={n} className={`kt-pill${days === n ? " on" : ""}`} onClick={() => setDays(n)}>{l}</button>)}</div>
      </div>
      <div className="kt-stats">{stats.map(([l, v, u]) => <div key={l}><span>{l}</span><b className="num">{v}<small>{u}</small></b></div>)}</div>
      {conds.length >= 2 ? (
        <div className="kt-chart" style={{ height: 200, marginTop: 10 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chart} margin={{ top: 10, right: 24, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#ECE8E0" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: "#85837D", fontSize: 11 }} axisLine={{ stroke: "#DED9CE" }} tickLine={false} minTickGap={8} />
              <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} tick={{ fill: "#85837D", fontSize: 11 }} axisLine={false} tickLine={false} width={28} />
              <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #DED9CE", fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="睡眠" stroke="#2F6B4F" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              <Line type="monotone" dataKey="メンタル" stroke="#3D6BD9" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              <Line type="monotone" dataKey="だるさ" stroke="#C9973A" strokeWidth={2} dot={{ r: 3 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : <div className="kt-empty" style={{ marginTop: 8 }}>体調の記録が2日分以上たまると、睡眠・メンタル・だるさのグラフが出ます</div>}
    </div>
  );
}

// お客様が自主トレに書いたメモ・写真（アプリ・LINEの「トレーニング」タブ）。返事を書き足せる
function TrainingNotesCard({ c, d, flash, onSaved }) {
  const notes = [...d.sessions].filter(s => s.freeComment || s.freePhoto).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  const [replying, setReplying] = useState(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  async function send(date) {
    setBusy(true);
    await replyTrainingNote(c, date, text.trim(), lsGet(STAFF_STORAGE));
    setBusy(false); setReplying(null); setText("");
    flash("返事を書きました（アプリ・LINEのトレーニングタブに出ます）");
    await onSaved();
  }
  return (
    <div className="kt-card">
      <div className="kt-card-h"><h3>自主トレのメモ・写真 <small>お客様がアプリ・LINEで書いたもの</small></h3></div>
      {notes.length === 0 ? <div className="kt-empty">まだありません</div> : notes.map(s => (
        <div key={s.date} className="kt-note-item">
          <div className="h"><b>{ymd(s.date)}</b>{s.personalTraining && <span className="kt-tag gold">パーソナル</span>}
            {replying !== s.date && <button className="kt-link" onClick={() => { setReplying(s.date); setText(""); }}>返事を書く</button>}</div>
          {s.freeComment && <div className="kt-pre">{s.freeComment}</div>}
          {s.freePhoto && <img src={s.freePhoto} alt="" />}
          {replying === s.date && (
            <div style={{ marginTop: 8 }}>
              <textarea className="kt-ta" rows={2} value={text} onChange={e => setText(e.target.value)} placeholder="お客様への返事（メモの下に書き足されます）" autoFocus />
              <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                <button className="kt-btn sm" disabled={busy || !text.trim()} onClick={() => send(s.date)}>{busy ? "保存中…" : "書き足す"}</button>
                <button className="kt-btn ghost sm" onClick={() => setReplying(null)}>やめる</button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// その日の栄養素（ビタミン・ミネラル・脂質の質・食物繊維・塩分）と、不足しがちなもの
function NutrientsCard({ d, day }) {
  const meals = d.meals.filter(m => m.date === day);
  const t = dayNutrients(meals);
  const targets = nutrientTargets(d);
  const [open, setOpen] = useState(false);
  const shown = NUTRIENTS.filter(def => t.n[def.key] > 0 || (t.full && targets?.[def.key]));
  const advice = targets && t.full ? buildAdvice(t, { n: targets, p: nutritionTargets(d)?.p || 0 }, 4) : [];
  return (
    <div className="kt-card wide">
      <div className="kt-card-h">
        <h3>栄養素 <small>{ymd(day)}・ビタミン・ミネラル・脂質の質・食物繊維・塩分</small></h3>
        {shown.length > 8 && <button className="kt-link" onClick={() => setOpen(v => !v)}>{open ? "閉じる" : `全部見る（${shown.length}項目）`}</button>}
      </div>
      {meals.length === 0 ? <div className="kt-empty">この日の食事の記録はありません</div> : (
        <>
          {advice.length > 0 && (
            <div className="kt-advice">{advice.map((a, i) => <div key={i} className={a.type}><b>{a.title}</b><span>{a.body}</span></div>)}</div>
          )}
          {!targets && <div className="kt-muted" style={{ marginBottom: 8 }}>目標と比べるには、お客様が公式LINEでプロフィール（性別・年齢・身長・体重）を登録している必要があります。量だけ表示しています。</div>}
          {!t.full && <div className="kt-muted" style={{ marginBottom: 8 }}>アプリで記録した食事は、食物繊維・糖分・塩分・カリウム・ビタミンA/C・カルシウム・鉄の8項目です（公式LINEで記録すると36項目）。</div>}
          {CATEGORIES.map(cat => {
            const defs = shown.filter(x => x.cat === cat.id).slice(0, open ? 99 : 4);
            if (!defs.length) return null;
            return (
              <div key={cat.id} className="kt-ncat">
                <div className="kt-eb">{cat.label}</div>
                {defs.map(def => {
                  const v = t.n[def.key], tg = targets?.[def.key];
                  const st = tg ? nutrientStatus(def, v, tg) : null;
                  return (
                    <div key={def.key} className="kt-nrow">
                      <span>{def.name}</span>
                      <div className="track">{tg ? <i className={st} style={{ width: `${Math.min(100, Math.round((v / tg) * 100))}%` }} /> : null}</div>
                      <b className="num">{fmt(v)}<small>{tg ? ` / ${fmt(tg)}` : ""}{def.unit}</small></b>
                      {st && <em className={st}>{STATUS_LABEL[st]}</em>}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

// ───────────────────────── 食事・栄養 ─────────────────────────
function Bar2({ label, value, target, unit }) {
  const pct = target ? Math.min(100, Math.round((value / target) * 100)) : 0;
  return (
    <div className="kt-nbar">
      <div className="h"><span>{label}</span><b className="num">{Math.round(value).toLocaleString()}<small>{target ? ` / ${Math.round(target).toLocaleString()}` : ""}{unit}</small></b></div>
      <div className="track"><i style={{ width: `${target ? pct : 0}%`, background: target && value > target * 1.1 ? "var(--gold)" : "var(--green)" }} /></div>
    </div>
  );
}

function MealsTab({ c, d, flash, onSaved }) {
  const today = jstToday();
  const [day, setDay] = useState(today);
  const [period, setPeriod] = useState(7);
  const [f, setF] = useState({ name: "", kcal: "", p: "", f: "", c: "", time: "" });
  const [saving, setSaving] = useState(false);
  const targets = nutritionTargets(d);
  const dayMeals = d.meals.filter(m => m.date === day);
  const sum = dayMeals.reduce((a, m) => ({ kcal: a.kcal + m.kcal, p: a.p + m.p, f: a.f + m.f, c: a.c + m.c }), { kcal: 0, p: 0, f: 0, c: 0 });
  const dates = Array.from({ length: period }, (_, i) => new Date(Date.parse(`${today}T00:00:00Z`) - (period - 1 - i) * 86400000).toISOString().slice(0, 10));
  const chart = dates.map(x => ({ date: md(x), iso: x, kcal: Math.round(d.meals.filter(m => m.date === x).reduce((n, m) => n + m.kcal, 0)), water: Number(d.water[x]) || 0 }));
  const logged = chart.filter(x => x.kcal > 0);
  const avgKcal = logged.length ? Math.round(logged.reduce((n, x) => n + x.kcal, 0) / logged.length) : null;
  const waters = chart.filter(x => x.water > 0);
  const shift = n => setDay(new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10));

  async function save() {
    setSaving(true);
    await addMeal(c, { ...f, date: day, name: f.name.trim() });
    setF({ name: "", kcal: "", p: "", f: "", c: "", time: "" });
    setSaving(false); flash("食事を記録しました（アプリ・LINEのダッシュボードにも出ます）"); await onSaved();
  }
  const SRC = { line: ["LINE", "line"], app: ["アプリ", "app"], staff: ["スタッフ", "sheet"] };

  return (
    <div className="kt-grid">
      <div className="kt-card">
        <div className="kt-card-h">
          <h3><Utensils size={16} />{day === today ? "今日" : ymd(day)}の栄養</h3>
          <div className="kt-daynav"><button onClick={() => shift(-1)} aria-label="前の日"><ChevronLeft size={16} /></button><button onClick={() => shift(1)} disabled={day >= today} aria-label="次の日" style={{ transform: "scaleX(-1)" }}><ChevronLeft size={16} /></button></div>
        </div>
        <Bar2 label="カロリー" value={sum.kcal} target={targets?.kcal} unit="kcal" />
        <Bar2 label="たんぱく質" value={sum.p} target={targets?.p} unit="g" />
        <Bar2 label="脂質" value={sum.f} target={targets?.f} unit="g" />
        <Bar2 label="炭水化物" value={sum.c} target={targets?.c} unit="g" />
        <div className="kt-muted" style={{ marginTop: 8 }}>
          水分 <b style={{ color: "var(--ink)" }}>{(Number(d.water[day]) || 0).toLocaleString()}ml</b>
          {targets ? ` ・ 目標は${targets.from === "staff" ? "スタッフが設定" : "公式LINEのプロフィールから計算"}` : " ・ 目標は未設定（下で設定できます）"}
        </div>
      </div>

      <div className="kt-card">
        <div className="kt-card-h"><h3>{ymd(day)} の食事 <small>{dayMeals.length}件</small></h3></div>
        {dayMeals.length === 0 ? <div className="kt-empty">記録なし</div> : dayMeals.map(m => (
          <details key={m.id} className="kt-meal">
            <summary>
              <span className="t">{m.time}</span>
              <span className="n">{m.title}<i className={`kt-src`}><i className={SRC[m.source]?.[1] || "app"}>{SRC[m.source]?.[0] || "アプリ"}</i></i></span>
              <span className="k num">{Math.round(m.kcal)}kcal</span>
            </summary>
            <div className="kt-muted" style={{ padding: "2px 0 6px 52px" }}>P{Math.round(m.p)} F{Math.round(m.f)} C{Math.round(m.c)}g
              {(m.items || []).map((it, k) => <div key={k}>・{it.name}{it.amount ? `（${it.amount}）` : ""} {Math.round(it.kcal || 0)}kcal</div>)}
            </div>
          </details>
        ))}
        <div className="kt-eb" style={{ margin: "14px 0 8px" }}>スタッフが食事を足す</div>
        <input className="kt-in" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="メニュー名（例：鶏むね定食）" style={{ marginBottom: 6 }} />
        <div className="kt-nums" style={{ gridTemplateColumns: "repeat(4, minmax(0,1fr))", marginBottom: 8 }}>
          {[["kcal", "kcal"], ["p", "P g"], ["f", "F g"], ["c", "C g"]].map(([k, u]) => <label key={k}><input inputMode="decimal" value={f[k]} onChange={e => setF({ ...f, [k]: e.target.value })} placeholder="0" /><em>{u}</em></label>)}
        </div>
        <button className="kt-btn sm" onClick={save} disabled={saving || !f.name.trim()}>{saving ? "保存中…" : `${ymd(day)}の食事として記録`}</button>
      </div>

      <div className="kt-card wide">
        <div className="kt-card-h">
          <h3>カロリーの推移 <small>{avgKcal ? `記録した日の平均 ${avgKcal.toLocaleString()}kcal` : ""}{waters.length ? ` ・ 水分の平均 ${Math.round(waters.reduce((n, x) => n + x.water, 0) / waters.length).toLocaleString()}ml` : ""}</small></h3>
          <div className="kt-pills">{[[7, "1週間"], [30, "1ヶ月"]].map(([n, l]) => <button key={n} className={`kt-pill${period === n ? " on" : ""}`} onClick={() => setPeriod(n)}>{l}</button>)}</div>
        </div>
        <div className="kt-chart" style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart} margin={{ top: 16, right: 24, left: 0, bottom: 0 }} onClick={e => e?.activePayload && setDay(e.activePayload[0].payload.iso)}>
              <CartesianGrid stroke="#ECE8E0" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: "#85837D", fontSize: 11 }} axisLine={{ stroke: "#DED9CE" }} tickLine={false} minTickGap={8} />
              <YAxis tick={{ fill: "#85837D", fontSize: 11 }} axisLine={false} tickLine={false} width={44} />
              <Tooltip cursor={{ fill: "#F3F1EC" }} content={({ active, payload }) => active && payload?.length ? (
                <div className="kt-tip"><div style={{ color: "#85837D" }}>{ymd(payload[0].payload.iso)}</div><b className="num">{payload[0].value.toLocaleString()}</b> kcal{payload[0].payload.water ? ` ・ 水分 ${payload[0].payload.water}ml` : ""}</div>
              ) : null} />
              {targets?.kcal && <ReferenceLine y={targets.kcal} stroke="#C9973A" strokeDasharray="5 4" label={{ value: `目標 ${targets.kcal}`, position: "insideTopRight", fill: "#9A7537", fontSize: 11 }} />}
              <Bar dataKey="kcal" fill="#2F6B4F" radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="kt-muted">棒を押すと、その日の食事が上に出ます</div>
      </div>

      <NutrientsCard d={d} day={day} />
      {c.pid && <TargetCard c={c} d={d} flash={flash} onSaved={onSaved} />}
    </div>
  );
}

// アプリ会員の1日の栄養目標（アプリ・LINEのダッシュボードの目標になる）
function TargetCard({ c, d, flash, onSaved }) {
  const p = d.profile || {};
  const [f, setF] = useState({ kcal: p.targetCalories ?? "", p: p.targetProtein ?? "", f: p.targetFat ?? "", c: p.targetCarb ?? "" });
  async function save() {
    const n = v => (v === "" || v == null ? null : Number(v));
    await patchProfile(c.pid, { targetCalories: n(f.kcal), targetProtein: n(f.p), targetFat: n(f.f), targetCarb: n(f.c) });
    flash("栄養目標を保存しました"); await onSaved();
  }
  return (
    <div className="kt-card">
      <div className="kt-card-h"><h3>1日の栄養目標 <small>アプリの目標にも使われます</small></h3></div>
      <div className="kt-nums" style={{ gridTemplateColumns: "repeat(4, minmax(0,1fr))", marginBottom: 8 }}>
        {[["kcal", "kcal"], ["p", "P g"], ["f", "F g"], ["c", "C g"]].map(([k, u]) => <label key={k}><input inputMode="decimal" value={f[k]} onChange={e => setF({ ...f, [k]: e.target.value })} placeholder="—" /><em>{u}</em></label>)}
      </div>
      <button className="kt-btn sm" onClick={save}>保存</button>
    </div>
  );
}

// ───────────────────────── 公式LINE ─────────────────────────
function LineTab({ c, d, state, flash, onReload }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState("");
  const [linkTo, setLinkTo] = useState("");
  const hasKey = !!lsGet(LINE_KEY_STORAGE) || isDemo;
  const n = d.nutri || {};
  const log = d.lineLog || [];
  const linked = c.pid && c.lineUserId;
  const members = state.customers.filter(x => x.pid && !x.lineUserId);
  async function act(label, fn, msg) {
    setBusy(label);
    try { await fn(); flash(msg); await onReload(); } catch (e) { flash(`できませんでした: ${e.message}`); }
    setBusy("");
  }
  if (!c.lineUserId) {
    return (
      <div className="kt-card">
        <div className="kt-card-h"><h3><MessageCircle size={16} />公式LINE</h3></div>
        <div className="kt-empty">この方は公式LINEとまだつながっていません。カルテの「名簿（スプレッドシート）」→「公式LINE・アプリとつなぐ」から選べます。{c.pid ? "アプリの「設定」に出る6文字のコードをLINEに送ってもらっても、つながります。" : ""}</div>
      </div>
    );
  }
  return (
    <div className="kt-grid">
      <div className="kt-card">
        <div className="kt-card-h"><h3><MessageCircle size={16} />公式LINE</h3></div>
        <div className="kt-lineprof">
          <Avatar c={c} />
          <div><b>{n.line?.displayName || "—"}</b><small>{n.profile?.fullName ? `登録名：${n.profile.fullName}` : "フルネーム未登録"}</small></div>
        </div>
        <dl className="kt-kv" style={{ marginTop: 10 }}>
          <dt>友だち追加</dt><dd>{n.followedAt ? ymd(n.followedAt.slice(0, 10)) : "—"}{n.unfollowedAt ? <span style={{ color: "var(--red-text)" }}>（ブロックされています）</span> : ""}</dd>
          {n.profile?.age && <><dt>プロフィール</dt><dd>{[n.profile.sex === "female" ? "女性" : "男性", `${n.profile.age}歳`, n.profile.height && `${n.profile.height}cm`, n.profile.weight && `${n.profile.weight}kg`].filter(Boolean).join("・")}</dd></>}
          <dt>アプリ</dt><dd>{linked ? "連携済み" : "未連携"}</dd>
          <dt>利用</dt><dd style={{ color: d.lineBlocked ? "var(--red-text)" : undefined }}>{d.lineBlocked ? "停止中" : "利用できます"}</dd>
        </dl>
        {!hasKey && <div className="kt-notice gold" style={{ marginTop: 10 }}>送信・停止・連携には「LINE操作キー」が要ります（トップの「はじめにやること」③）</div>}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          {d.lineBlocked
            ? <button className="kt-btn sm" disabled={!hasKey || !!busy} onClick={() => act("unblock", () => lineAdmin("unblock", { lineUserId: c.lineUserId }), "公式LINEの利用を再開しました")}>利用を再開する</button>
            : <button className="kt-btn ghost sm" style={{ color: "var(--red-text)" }} disabled={!hasKey || !!busy} onClick={() => window.confirm("公式LINEの利用を停止しますか？（ダッシュボード・各ページ・トークでの記録が使えなくなります。あとで再開できます）") && act("block", () => lineAdmin("block", { lineUserId: c.lineUserId }), "公式LINEの利用を停止しました")}>利用を停止する</button>}
          {linked && <button className="kt-btn ghost sm" disabled={!hasKey || !!busy} onClick={() => window.confirm("アプリとの連携を解除しますか？") && act("unlink", () => lineAdmin("unlink", { lineUserId: c.lineUserId }), "アプリとの連携を解除しました")}>アプリとの連携を解除</button>}
        </div>
        {!c.pid && members.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div className="kt-eb" style={{ marginBottom: 6 }}>アプリ会員と連携する</div>
            <div className="kt-custom" style={{ marginTop: 0 }}>
              <select className="kt-sel" value={linkTo} onChange={e => setLinkTo(e.target.value)}>
                <option value="">アプリ会員を選ぶ</option>
                {members.map(m => <option key={m.pid} value={m.pid}>{m.name}{m.appName && m.appName !== m.name ? `（${m.appName}）` : ""}</option>)}
              </select>
              <button className="kt-btn sm" disabled={!hasKey || !linkTo || !!busy} onClick={() => act("link", () => lineAdmin("link", { lineUserId: c.lineUserId, profileId: linkTo }), "アプリ会員と連携しました（LINEの記録もアプリへ移ります）")}>連携</button>
            </div>
          </div>
        )}
      </div>

      <div className="kt-card">
        <div className="kt-card-h"><h3>LINEのやりとり <small>直近{Math.min(log.length, 60)}件</small></h3></div>
        <div className="kt-chat">
          {log.length === 0 ? <div className="kt-empty">やりとりの記録はまだありません</div> : log.slice(-60).map((m, i) => m.from === "system"
            ? <div key={i} className="sys">{new Date(m.at).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} {m.text}</div>
            : (
              <div key={i} className={`msg ${m.from === "user" ? "them" : "me"} ${m.from}`}>
                <small>{m.from === "user" ? "お客様" : m.from === "staff" ? "スタッフ" : "自動返信"}・{new Date(m.at).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</small>
                <div>{String(m.text || "").length > 400 ? `${m.text.slice(0, 400)}…` : m.text}</div>
              </div>
            ))}
        </div>
        <textarea className="kt-ta" rows={2} value={text} onChange={e => setText(e.target.value)} placeholder="お客様のLINEにメッセージを送る" style={{ marginTop: 10 }} disabled={!!n.unfollowedAt} />
        <button className="kt-btn sm" style={{ marginTop: 8 }} disabled={!hasKey || !text.trim() || !!busy || !!n.unfollowedAt}
          onClick={() => act("send", async () => { await notifyLine(c.lineUserId, text.trim()); setText(""); }, "LINEで送りました")}>
          <Send size={14} />{busy === "send" ? "送信中…" : "LINEで送る"}
        </button>
        {n.unfollowedAt && <div className="kt-err">ブロックされているため送れません</div>}
      </div>
    </div>
  );
}

// ───────────────────────── 今日の記録 ─────────────────────────
// 記録中の種目: 普通の種目はセットごとに「kg × 回」を入れて「完了」（取り消しもできる）。
// モビリティは「秒 × セット」を ＋− で増やす。どの種目にもメモを書ける
const blankRow = () => ({ weight: "", reps: "", done: false });
// サーキット: { name, exercises: [{ name, value, unit }], rounds（何周）, minutes（何分）, rest（休憩 秒） }。1周ごとに「完了」
function circuitDraft(cc, note = "") {
  return { name: `サーキット：${cc.name}`, cat: "circuit", circuit: cc, note, rows: Array.from({ length: Math.max(1, Number(cc.rounds) || 1) }, () => ({ done: false })) };
}
function toDraftItem(m, prev) {
  if (m.circuit || prev?.circuit) return circuitDraft(m.circuit || prev.circuit);
  const base = { name: m.name, cat: m.cat || prev?.cat, unit: m.unit || prev?.unit || "reps", load: m.load !== false, note: "" };
  if (m.mobility) return { ...base, unit: "sec", load: false, mobility: true, sec: prev?.reps || 30, setCount: prev?.sets || 2, done: false };
  let rows;
  if (prev?.setList?.length) rows = prev.setList.map(x => ({ weight: x.weight ?? "", reps: x.reps ?? "", done: false }));
  else if (prev && (prev.weight != null || prev.reps != null)) rows = Array.from({ length: Math.min(Math.max(Number(prev.sets) || 1, 1), 10) }, () => ({ weight: prev.weight ?? "", reps: prev.reps ?? "", done: false }));
  else rows = [blankRow()];
  return { ...base, rows };
}
function toSavedItem(i) {
  if (i.circuit) {
    // 「完了」を押した周の数（1つも押していなければ予定の周回数）
    const done = (i.rows || []).filter(r => r.done).length;
    return { name: i.name, cat: "circuit", note: (i.note || "").trim(), circuit: { ...i.circuit, rounds: i.rows.length }, roundsDone: done || i.rows.length, sets: done || i.rows.length };
  }
  const base = { name: i.name, cat: i.cat, unit: i.unit, note: (i.note || "").trim() };
  if (i.mobility) return { ...base, unit: "sec", mobility: true, weight: null, reps: Number(i.sec) || null, sets: Number(i.setCount) || null, done: !!i.done };
  const filled = (i.rows || []).filter(r => String(r.weight).trim() !== "" || String(r.reps).trim() !== "");
  const done = filled.filter(r => r.done);
  // 「完了」を押したセットを記録する（1つも押していなければ、入れたセットを全部）
  const setList = (done.length ? done : filled).map(r => ({ weight: r.weight === "" ? null : Number(r.weight), reps: r.reps === "" ? null : Number(r.reps) }));
  const weights = setList.map(x => x.weight).filter(x => x != null);
  return { ...base, setList, sets: setList.length || null, weight: weights.length ? Math.max(...weights) : null, reps: setList[0]?.reps ?? null };
}

function Stepper({ value, onChange, step, min, unit }) {
  const n = Number(value) || 0;
  return (
    <div className="kt-stepper">
      <button onClick={() => onChange(Math.max(min, n - step))} aria-label={`${unit}を減らす`}><Minus size={15} /></button>
      <b className="num">{n}</b><em>{unit}</em>
      <button onClick={() => onChange(n + step)} aria-label={`${unit}を増やす`}><Plus size={15} /></button>
    </div>
  );
}

// サーキットを作る・直す（すでにある種目から選ぶか、新しい名前で足す）
function CircuitBuilder({ allMenus, initial, onSave, onAddOnce, onCancel, onDelete }) {
  const [name, setName] = useState(initial?.name || "");
  const [exercises, setExercises] = useState(initial?.exercises || []);
  const [rounds, setRounds] = useState(initial?.rounds || 3);
  const [minutes, setMinutes] = useState(initial?.minutes || 0);
  const [rest, setRest] = useState(initial?.rest ?? 30);
  const [q, setQ] = useState("");
  const nq = normQ(q);
  const hits = nq ? allMenus.filter(m => m.cat !== "circuit" && normQ(m.name).includes(nq)).slice(0, 12) : [];
  const add = (nm, unit = "reps") => { if (nm.trim()) setExercises([...exercises, { name: nm.trim(), value: unit === "sec" ? 30 : 10, unit }]); setQ(""); };
  const setEx = (k, patch) => setExercises(exercises.map((e, j) => (j === k ? { ...e, ...patch } : e)));
  const move = (k, dir) => { const a = [...exercises]; const j = k + dir; if (j < 0 || j >= a.length) return; [a[k], a[j]] = [a[j], a[k]]; setExercises(a); };
  const cc = { id: initial?.id || newId(), name: name.trim(), exercises, rounds, minutes, rest };
  const ok = name.trim() && exercises.length > 0;
  return (
    <div className="kt-circuit-b">
      <input className="kt-in" value={name} onChange={e => setName(e.target.value)} placeholder="サーキットの名前（例：脂肪燃焼A）" />
      <div className="kt-eb" style={{ margin: "12px 0 6px" }}>種目（上から順番）</div>
      {exercises.length === 0 && <div className="kt-empty">下で種目を探して足してください</div>}
      {exercises.map((e, k) => (
        <div key={k} className="kt-cex">
          <span className="no">{k + 1}</span>
          <b>{e.name}</b>
          <label><input inputMode="numeric" value={e.value} onChange={ev => setEx(k, { value: ev.target.value })} /><em>{e.unit === "sec" ? "秒" : "回"}</em></label>
          <button className="kt-tag" onClick={() => setEx(k, { unit: e.unit === "sec" ? "reps" : "sec" })}>{e.unit === "sec" ? "秒" : "回数"}</button>
          <button onClick={() => move(k, -1)} aria-label="上へ" disabled={k === 0}>↑</button>
          <button onClick={() => move(k, 1)} aria-label="下へ" disabled={k === exercises.length - 1}>↓</button>
          <button onClick={() => setExercises(exercises.filter((_, j) => j !== k))} aria-label="外す"><X size={14} /></button>
        </div>
      ))}
      <div className="kt-custom" style={{ marginTop: 8 }}>
        <input className="kt-in" value={q} onChange={e => setQ(e.target.value)} placeholder="種目を探す（例：スクワット）／ない種目は名前を入れて「新しく追加」" onKeyDown={e => { if (e.key === "Enter" && q.trim() && !hits.length) add(q); }} />
        <button className="kt-btn ghost sm" disabled={!q.trim()} onClick={() => add(q)}><Plus size={14} />新しく追加</button>
      </div>
      {hits.length > 0 && <div className="kt-pills" style={{ marginTop: 6 }}>{hits.map(m => <button key={m.name} className="kt-pill" onClick={() => add(m.name, m.unit || "reps")}><Plus size={13} />{m.name}</button>)}</div>}
      <div className="kt-eb" style={{ margin: "14px 0 6px" }}>回し方</div>
      <div className="kt-mob">
        <Stepper value={rounds} step={1} min={1} unit="周" onChange={setRounds} />
        <Stepper value={minutes} step={1} min={0} unit="分" onChange={setMinutes} />
        <Stepper value={rest} step={10} min={0} unit="秒休憩" onChange={setRest} />
      </div>
      <div className="kt-muted" style={{ margin: "4px 0 12px" }}>分を0にすると「何分」は出しません</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="kt-btn gold sm" disabled={!ok} onClick={() => onSave(cc)}>保存して今日に追加</button>
        <button className="kt-btn ghost sm" disabled={!ok} onClick={() => onAddOnce(cc)}>保存せず今日だけ</button>
        <button className="kt-btn ghost sm" onClick={onCancel}>やめる</button>
        {onDelete && <button className="kt-del" onClick={onDelete}><Trash2 size={13} />このサーキットを消す</button>}
      </div>
    </div>
  );
}

function RecordTab({ c, d, state, setMenus, setCircuits, flash, onSaved }) {
  const allMenus = useMemo(() => [...DEFAULT_MENUS, ...(state.menus || [])], [state.menus]);
  const menuDef = name => allMenus.find(m => m.name === name);
  const draft = useMemo(() => { try { return JSON.parse(lsGet(DRAFT_STORAGE(c.cid)) || "null") || {}; } catch (e) { return {}; } }, [c.cid]);
  const [date, setDate] = useState(draft.date || jstToday());
  const [staff, setStaff] = useState(() => lsGet(STAFF_STORAGE));
  const [cat, setCat] = useState(MENU_CATEGORIES[0].key);
  // 以前の形の下書き（1種目に重量・回数・セットが1つずつ）も今の形に直して読む
  const [items, setItems] = useState(() => (draft.items || []).map(it => (it.rows || it.mobility ? it : toDraftItem(menuDef(it.name) || it, { ...it, weight: it.weight === "" ? null : it.weight, reps: it.reps === "" ? null : it.reps }))));
  const [condition, setCondition] = useState(draft.condition ?? null);
  const [parts, setParts] = useState(draft.parts || []);
  const [comment, setComment] = useState(draft.comment || "");
  const [memo, setMemo] = useState(draft.memo || "");
  const [draftAt, setDraftAt] = useState(draft.at || null);
  const [ticketUsed, setTicketUsed] = useState(c.tickets != null);
  const [sendLine, setSendLine] = useState(!!c.lineUserId && !isDemo);
  const [custom, setCustom] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const last = [...d.karteSessions].sort((a, b) => b.date.localeCompare(a.date))[0];

  // 書いている途中の内容をこの端末に自動で残す（記録したら消す）
  useEffect(() => {
    const empty = !items.length && !comment && !memo && condition == null && !parts.length;
    if (empty) { lsSet(DRAFT_STORAGE(c.cid), ""); return; }
    const t = setTimeout(() => {
      const at = new Date().toISOString();
      lsSet(DRAFT_STORAGE(c.cid), JSON.stringify({ date, items, condition, parts, comment, memo, at }));
      setDraftAt(at);
    }, 500);
    return () => clearTimeout(t);
  }, [date, items, condition, parts, comment, memo]);

  // 種目ごとの前回の数字（選んだときに入れておく）
  const lastOf = name => {
    for (const s of [...d.karteSessions].sort((a, b) => b.date.localeCompare(a.date))) {
      const hit = s.items?.find(i => i.name === name);
      if (hit) return hit;
    }
    return null;
  };
  const toggle = m => {
    if (items.some(i => i.name === m.name)) { setItems(items.filter(i => i.name !== m.name)); return; }
    setItems([...items, toDraftItem(m, lastOf(m.name))]);
  };
  const setItem = (n, patch) => setItems(items.map((x, i) => (i === n ? { ...x, ...patch } : x)));
  const setRow = (n, k, patch) => setItems(items.map((x, i) => (i === n ? { ...x, rows: x.rows.map((r, j) => (j === k ? { ...r, ...patch } : r)) } : x)));
  const addRow = n => setItems(items.map((x, i) => {
    if (i !== n) return x;
    const lastRow = x.rows[x.rows.length - 1];
    return { ...x, rows: [...x.rows, lastRow ? { weight: lastRow.weight, reps: lastRow.reps, done: false } : blankRow()] };
  }));
  const removeRow = (n, k) => setItems(items.map((x, i) => (i === n ? { ...x, rows: x.rows.filter((_, j) => j !== k) } : x)));

  async function addCustom() {
    const name = custom.trim();
    if (!name) return;
    if (!allMenus.some(m => m.name === name)) {
      const next = [...(state.menus || []), { cat, name, load: cat === "lower" || cat === "upper" }];
      await saveGlobal("karteMenus", next);
      setMenus(next);
    }
    toggle({ cat, name, load: cat === "lower" || cat === "upper" });
    setCustom("");
  }

  async function save() {
    setSaving(true); setErr("");
    try {
      lsSet(STAFF_STORAGE, staff);
      const clean = items.map(toSavedItem);
      const { karte } = await saveSession(c, { id: newId(), date, staff, condition, parts, items: clean, comment: comment.trim(), memo: memo.trim(), ticketUsed });
      let msg = "記録しました";
      const menu = menuSummary(clean);
      if (sendLine && c.lineUserId && (comment.trim() || menu)) {
        try {
          const say = comment.trim() ? `\n\n■ トレーナーより\n${comment.trim()}${staff ? `（${staff}）` : ""}` : "";
          await notifyLine(c.lineUserId, `【TTGYM】本日のトレーニングお疲れさまでした！${menu ? `\n\n■ 本日のメニュー\n${menu}` : ""}${say}\n\nリッチメニューの「目標設定・MY成長・測定結果」のレポート・コメントでも見られます。`);
          msg = "記録して、公式LINEにも送りました";
        } catch (e) {
          msg = `記録しました（LINEは送れませんでした: ${e.message}）`;
        }
      }
      lsSet(DRAFT_STORAGE(c.cid), "");
      flash(msg);
      await onSaved(karte);
    } catch (e) {
      setErr(`保存できませんでした: ${e.message}`);
      setSaving(false);
    }
  }

  const menusInCat = allMenus.filter(m => m.cat === cat);
  // サーキット: 保存したもの（global:karteCircuits）を押すと今日の内容に入る
  const [building, setBuilding] = useState(null); // null / "new" / 直すサーキット
  const circuits = state.circuits || [];
  const addCircuit = cc => setItems(list => [...list.filter(i => i.name !== `サーキット：${cc.name}`), circuitDraft(cc)]);
  async function saveCircuit(cc) {
    const next = [...circuits.filter(x => x.id !== cc.id), cc];
    await saveGlobal("karteCircuits", next);
    setCircuits(next); addCircuit(cc); setBuilding(null);
    flash(`サーキット「${cc.name}」を保存して、今日の内容に入れました`);
  }
  async function removeCircuit(cc) {
    if (!window.confirm(`サーキット「${cc.name}」を消しますか？（記録したものは残ります）`)) return;
    const next = circuits.filter(x => x.id !== cc.id);
    await saveGlobal("karteCircuits", next);
    setCircuits(next); setBuilding(null);
  }
  const canSave = items.length > 0 || comment.trim() || memo.trim();

  return (
    <>
    <div className="kt-card kt-memo kt-live" style={{ marginBottom: 16 }}>
      <div className="kt-card-h">
        <div className="kt-eb">TODAY'S MEMO · トレーニング中のメモ<em>スタッフだけが見られます</em></div>
        <span className="kt-muted">{draftAt ? `自動で下書き保存 ${new Date(draftAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}` : "書いた内容は自動で下書き保存されます"}</span>
      </div>
      <div className="kt-live-grid">
        <textarea className="kt-ta memo" rows={6} value={memo} onChange={e => setMemo(e.target.value)} autoFocus
          placeholder="気づいたことをそのまま書いていけます（フォームの癖・会話の内容・次回やることなど）" />
        <div className="kt-live-prev">
          <small>前回のメモ{last ? `（${ymd(last.date)}）` : ""}</small>
          <div className="kt-pre">{last?.memo || c.karte?.note || "—"}</div>
          {last?.memo && c.karte?.note && <><small style={{ marginTop: 10 }}>注意事項</small><div className="kt-pre">{c.karte.note}</div></>}
        </div>
      </div>
    </div>
    <div className="kt-form-grid">
      <div>
        <div className="kt-card" style={{ marginBottom: 16 }}>
          <div className="kt-card-h">
            <h3>メニュー <small>押して選ぶ・もう一度押すと外れます</small></h3>
            {last?.items?.length > 0 && (
              <button className="kt-link" onClick={() => setItems(last.items.map(i => toDraftItem(menuDef(i.name) || { name: i.name, cat: i.cat, unit: i.unit, load: i.weight != null, mobility: i.mobility }, i)))}>
                <RotateCcw size={13} />前回と同じ
              </button>
            )}
          </div>
          <div className="kt-cats">
            {MENU_CATEGORIES.map(k => {
              const n = items.filter(i => i.cat === k.key).length;
              return <button key={k.key} className={cat === k.key ? "on" : ""} onClick={() => setCat(k.key)}>{k.label}{n ? ` (${n})` : ""}</button>;
            })}
          </div>
          {cat === "circuit" ? (
            <div>
              {building ? (
                <CircuitBuilder allMenus={allMenus} initial={building === "new" ? null : building}
                  onSave={saveCircuit} onAddOnce={cc => { addCircuit(cc); setBuilding(null); }} onCancel={() => setBuilding(null)}
                  onDelete={building !== "new" ? () => removeCircuit(building) : null} />
              ) : (
                <>
                  {circuits.length === 0 && <div className="kt-empty">保存したサーキットはまだありません。「新しいサーキット」から作ると、次からは押すだけで入れられます</div>}
                  <div className="kt-circuits">
                    {circuits.map(cc => {
                      const on = items.some(i => i.name === `サーキット：${cc.name}`);
                      return (
                        <div key={cc.id} className={`kt-circuit${on ? " on" : ""}`}>
                          <button className="main" onClick={() => (on ? setItems(items.filter(i => i.name !== `サーキット：${cc.name}`)) : addCircuit(cc))}>
                            <b>{on ? <Check size={15} /> : <Plus size={15} />}{cc.name}</b>
                            <span>{[`${cc.rounds}周`, cc.minutes ? `${cc.minutes}分` : "", cc.rest ? `休憩${cc.rest}秒` : ""].filter(Boolean).join("・")}</span>
                            <small>{circuitExercises(cc)}</small>
                          </button>
                          <button className="edit" onClick={() => setBuilding(cc)} aria-label={`${cc.name}を直す`}><Pencil size={14} /></button>
                        </div>
                      );
                    })}
                  </div>
                  <button className="kt-btn ghost sm" style={{ marginTop: 10 }} onClick={() => setBuilding("new")}><Plus size={14} />新しいサーキット</button>
                </>
              )}
            </div>
          ) : (
          <>
          <div className="kt-menu-grid">
            {menusInCat.map((m, k) => {
              const on = items.some(i => i.name === m.name);
              const head = m.group && m.group !== menusInCat[k - 1]?.group;
              const after = !m.group && menusInCat[k - 1]?.group;
              return (
                <React.Fragment key={m.name}>
                  {head && <div className="kt-menu-group">{m.group}{m.mobility ? <small>秒 × セット</small> : null}</div>}
                  {after && <div className="kt-menu-group sep" />}
                  <button className={`kt-menu-btn${on ? " on" : ""}${m.group ? " sub" : ""}`} onClick={() => toggle(m)}>{on ? <Check size={15} /> : <Plus size={15} color="var(--dim)" />}{m.name}</button>
                </React.Fragment>
              );
            })}
          </div>
          <div className="kt-custom">
            <input className="kt-in" value={custom} onChange={e => setCustom(e.target.value)} placeholder={`「${MENU_CATEGORIES.find(k => k.key === cat).label}」にメニューを追加`} onKeyDown={e => { if (e.key === "Enter") addCustom(); }} />
            <button className="kt-btn ghost sm" onClick={addCustom} disabled={!custom.trim()}><Plus size={14} />追加</button>
          </div>
          </>
          )}
        </div>

        <div className="kt-card">
          <div className="kt-card-h"><h3>今日の内容 <small>{items.length}種目</small></h3></div>
          {items.length === 0 ? <div className="kt-empty">上のメニューを押すと、ここに並びます。前回の重量・回数が入った状態で追加されます</div> : (
            <div className="kt-sel-list">
              {items.map((i, n) => {
                const doneCount = i.mobility ? (i.done ? 1 : 0) : (i.rows || []).filter(r => r.done).length;
                if (i.circuit) return (
                  <div key={i.name} className={`kt-sel-item kt-circuit-item${doneCount && doneCount === i.rows.length ? " all-done" : ""}`}>
                    <div className="top">
                      <b>{i.name}</b>
                      <span className="kt-muted" style={{ fontSize: 12 }}>完了 {doneCount}/{i.rows.length}周</span>
                      <button aria-label="外す" onClick={() => setItems(items.filter((_, x) => x !== n))}><X size={16} /></button>
                    </div>
                    <div className="kt-muted" style={{ marginBottom: 8 }}>
                      {[i.circuit.minutes ? `${i.circuit.minutes}分` : "", i.circuit.rest ? `休憩${i.circuit.rest}秒` : ""].filter(Boolean).join("・")}
                      <ol className="kt-cex-list">{i.circuit.exercises.map((e, k) => <li key={k}>{e.name}<b>{e.value}{e.unit === "sec" ? "秒" : "回"}</b></li>)}</ol>
                    </div>
                    <div className="kt-rounds">
                      {i.rows.map((r, k) => r.done
                        ? <button key={k} className="kt-done on" onClick={() => setRow(n, k, { done: false })}><Check size={14} />{k + 1}周目<small>取り消し</small></button>
                        : <button key={k} className="kt-done" onClick={() => setRow(n, k, { done: true })}>{k + 1}周目 完了</button>)}
                      <button className="kt-addset" onClick={() => setItem(n, { rows: [...i.rows, { done: false }] })}><Plus size={14} />1周追加</button>
                      {i.rows.length > 1 && !i.rows[i.rows.length - 1].done && <button className="kt-addset" style={{ color: "var(--sub)" }} onClick={() => setItem(n, { rows: i.rows.slice(0, -1) })}><Minus size={14} />1周減らす</button>}
                    </div>
                    <input className="kt-in kt-note" value={i.note || ""} onChange={e => setItem(n, { note: e.target.value })} placeholder="このサーキットのメモ（きつかった種目・次回の調整など）" />
                  </div>
                );
                return (
                  <div key={i.name} className={`kt-sel-item${(i.mobility ? i.done : doneCount && doneCount === i.rows.length) ? " all-done" : ""}`}>
                    <div className="top">
                      <b>{i.name}</b>
                      {!i.mobility && <span className="kt-muted" style={{ fontSize: 12 }}>完了 {doneCount}/{i.rows.length}</span>}
                      {!i.mobility && <button onClick={() => setItem(n, { unit: i.unit === "sec" ? "reps" : "sec" })} className="kt-tag" style={{ display: "inline-block" }}>{i.unit === "sec" ? "秒" : "回数"}</button>}
                      <button aria-label="外す" onClick={() => setItems(items.filter((_, x) => x !== n))}><X size={16} /></button>
                    </div>
                    {i.mobility ? (
                      <div className="kt-mob">
                        <Stepper value={i.sec} step={10} min={5} unit="秒" onChange={v => setItem(n, { sec: v })} />
                        <span className="x">×</span>
                        <Stepper value={i.setCount} step={1} min={1} unit="セット" onChange={v => setItem(n, { setCount: v })} />
                        {i.done
                          ? <button className="kt-done on" onClick={() => setItem(n, { done: false })}><Check size={14} />完了<small>取り消し</small></button>
                          : <button className="kt-done" onClick={() => setItem(n, { done: true })}>完了</button>}
                      </div>
                    ) : (
                      <>
                        {i.rows.map((r, k) => (
                          <div key={k} className={`kt-setrow${r.done ? " done" : ""}${i.load ? "" : " noload"}`}>
                            <span className="no">{k + 1}</span>
                            {i.load && <label><input inputMode="decimal" value={r.weight} disabled={r.done} onChange={e => setRow(n, k, { weight: e.target.value })} placeholder="0" aria-label={`${k + 1}セット目の重量`} /><em>kg</em></label>}
                            <label><input inputMode="numeric" value={r.reps} disabled={r.done} onChange={e => setRow(n, k, { reps: e.target.value })} placeholder="0" aria-label={`${k + 1}セット目の${i.unit === "sec" ? "秒数" : "回数"}`} /><em>{i.unit === "sec" ? "秒" : "回"}</em></label>
                            {r.done
                              ? <button className="kt-done on" onClick={() => setRow(n, k, { done: false })}><Check size={14} />完了<small>取り消し</small></button>
                              : <button className="kt-done" onClick={() => setRow(n, k, { done: true })}>完了</button>}
                            {!r.done && i.rows.length > 1 ? <button className="kt-row-x" onClick={() => removeRow(n, k)} aria-label={`${k + 1}セット目を消す`}><X size={14} /></button> : <span />}
                          </div>
                        ))}
                        <button className="kt-addset" onClick={() => addRow(n)}><Plus size={14} />セットを追加{i.load ? "（重量を変えて続ける）" : ""}</button>
                      </>
                    )}
                    <input className="kt-in kt-note" value={i.note || ""} onChange={e => setItem(n, { note: e.target.value })} placeholder="この種目のメモ（フォーム・効いた場所・次回の重量など）" />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div>
        <div className="kt-card" style={{ marginBottom: 16 }}>
          <div className="kt-row2">
            <label className="kt-field"><span>日付</span><input className="kt-in" type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
            <label className="kt-field"><span>担当スタッフ</span>
              {state.staff?.length ? (
                <select className="kt-sel" value={staff} onChange={e => setStaff(e.target.value)}>
                  <option value="">選ぶ</option>
                  {state.staff.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              ) : <input className="kt-in" value={staff} onChange={e => setStaff(e.target.value)} placeholder="名前" />}
            </label>
          </div>
          <div className="kt-field"><span>今日の体調</span>
            <div className="kt-pills">
              {DAY_CONDITIONS.map(x => (
                <button key={x.n} className={`kt-pill${condition === x.n ? " on" : ""}`} onClick={() => setCondition(condition === x.n ? null : x.n)}><i className="dot" style={{ background: x.color }} />{x.label}</button>
              ))}
            </div>
          </div>
          <div className="kt-field" style={{ marginBottom: 0 }}><span>痛み・違和感<em>あれば</em></span>
            <div className="kt-pills">
              {BODY_PARTS.map(p => (
                <button key={p} className={`kt-pill${parts.includes(p) ? " on" : ""}`} onClick={() => setParts(parts.includes(p) ? parts.filter(x => x !== p) : [...parts, p])}>{p}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="kt-card">
          <label className="kt-field"><span>お客様へのコメント<em>アプリ・LINEの「コメント」に届きます</em></span>
            <textarea className="kt-ta" rows={4} value={comment} onChange={e => setComment(e.target.value)} placeholder="今日の良かった点、次回までの宿題など" />
          </label>
          {c.tickets != null && (
            <label className="kt-check"><input type="checkbox" checked={ticketUsed} onChange={e => setTicketUsed(e.target.checked)} />
              <div>回数券を1回使う<small>残り {c.tickets}回 → {ticketUsed ? Math.max(0, c.tickets - 1) : c.tickets}回</small></div>
            </label>
          )}
          {c.lineUserId && (
            <label className="kt-check"><input type="checkbox" checked={sendLine} onChange={e => setSendLine(e.target.checked)} disabled={isDemo} />
              <div>メニューとコメントを公式LINEでも送る<small>{lsGet(LINE_KEY_STORAGE) || isDemo ? "お客様のLINEにメッセージが届きます" : "設定で「LINE操作キー」を入れると送れます"}</small></div>
            </label>
          )}
          <button className="kt-btn gold full" onClick={save} disabled={!canSave || saving} style={{ marginTop: 6 }}>{saving ? "保存中…" : "この内容で記録する"}</button>
          {err && <div className="kt-err">{err}</div>}
        </div>
      </div>
    </div>
    </>
  );
}

// ───────────────────────── 成長・測定 ─────────────────────────
function GrowthTab({ c, d, flash, onSaved }) {
  const available = METRICS.filter(m => points(m.src === "growth" ? d.growth : d.monthly, m.key).length > 0);
  const [metric, setMetric] = useState(available[0]?.key || "weight");
  const m = METRICS.find(x => x.key === metric);
  const data = points(m.src === "growth" ? d.growth : d.monthly, m.key).map(p => ({ ...p, label: md(p.date) }));
  const target = m.target ? c[m.target] : null;
  const empty = { date: jstToday(), weight: "", bodyFat: "", muscleMass: "", waist: "", hip: "", thigh: "", arm: "", situps: "", benchMax: "", hipThrust: "", note: "" };
  const [f, setF] = useState(empty);
  const [saving, setSaving] = useState(false);
  const filled = Object.entries(f).some(([k, v]) => k !== "date" && String(v).trim() !== "");

  async function save() {
    setSaving(true);
    await saveMeasurement(c, f);
    setF(empty);
    setSaving(false);
    flash("測定を記録しました");
    await onSaved();
  }

  const table = [...d.growth].sort((a, b) => b.date.localeCompare(a.date));
  const field = (key, label, unit) => (
    <label className="kt-field" key={key}><span>{label}</span>
      <div className="kt-nums" style={{ gridTemplateColumns: "1fr" }}><label><input inputMode="decimal" value={f[key]} onChange={e => setF({ ...f, [key]: e.target.value })} placeholder="—" /><em>{unit}</em></label></div>
    </label>
  );

  return (
    <div className="kt-grid">
      <div className="kt-card wide">
        <div className="kt-card-h"><h3>変化 <small>はじめて測った日 → 最新</small></h3></div>
        <Deltas growth={d.growth} monthly={d.monthly} c={c} />
      </div>
      <div className="kt-card wide">
        <div className="kt-card-h"><h3>{m.label}の推移 <small>{m.unit}</small></h3></div>
        <div className="kt-metric">
          {METRICS.map(x => {
            const has = available.some(a => a.key === x.key);
            return <button key={x.key} className={`kt-chip${metric === x.key ? " on" : ""}`} onClick={() => setMetric(x.key)} disabled={!has} style={{ opacity: has ? 1 : 0.4 }}>{x.label}</button>;
          })}
        </div>
        {data.length < 2 ? <div className="kt-empty">グラフは2回以上記録すると表示されます</div> : (
          <div className="kt-chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 16, right: 24, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#ECE8E0" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "#85837D", fontSize: 11 }} axisLine={{ stroke: "#DED9CE" }} tickLine={false} minTickGap={16} />
                <YAxis tick={{ fill: "#85837D", fontSize: 11 }} axisLine={false} tickLine={false} width={44} domain={["auto", "auto"]} />
                <Tooltip cursor={{ stroke: "#A8A59D", strokeDasharray: "3 3" }} content={({ active, payload }) => active && payload?.length ? (
                  <div className="kt-tip"><div style={{ color: "#85837D" }}>{ymd(payload[0].payload.date)}</div><b className="num">{r1(payload[0].value)}</b> {m.unit}</div>
                ) : null} />
                {target != null && <ReferenceLine y={target} stroke="#C9973A" strokeDasharray="5 4" label={{ value: `目標 ${target}${m.unit}`, position: "insideTopRight", fill: "#9A7537", fontSize: 11 }} />}
                <Line type="monotone" dataKey="v" stroke="#2F6B4F" strokeWidth={2} dot={{ r: 4, fill: "#2F6B4F", stroke: "#fff", strokeWidth: 2 }} activeDot={{ r: 6, stroke: "#fff", strokeWidth: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="kt-card">
        <div className="kt-card-h"><h3>定期測定を記録</h3></div>
        <label className="kt-field"><span>測定日</span><input className="kt-in" type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} /></label>
        <div className="kt-eb" style={{ margin: "4px 0 8px" }}>体組成（アプリ・LINEの成長グラフに反映）</div>
        <div className="kt-row2">{field("weight", "体重", "kg")}{field("bodyFat", "体脂肪率", "%")}</div>
        <div className="kt-row2">{field("muscleMass", "筋肉量", "kg")}{field("waist", "ウエスト", "cm")}</div>
        <div className="kt-row2">{field("hip", "ヒップ", "cm")}{field("thigh", "太もも", "cm")}</div>
        <div className="kt-eb" style={{ margin: "4px 0 8px" }}>体力テスト（月次測定）</div>
        <div className="kt-row2">{field("situps", "腹筋1分", "回")}{field("benchMax", "ベンチMAX", "kg")}</div>
        <div className="kt-row2">{field("hipThrust", "ヒップスラスト", "kg")}{field("arm", "二の腕", "cm")}</div>
        <label className="kt-field"><span>メモ</span><textarea className="kt-ta" rows={2} value={f.note} onChange={e => setF({ ...f, note: e.target.value })} placeholder="姿勢・柔軟性など" /></label>
        <button className="kt-btn full" onClick={save} disabled={!filled || saving}>{saving ? "保存中…" : "測定を記録する"}</button>
      </div>

      <div className="kt-card">
        <div className="kt-card-h"><h3>測定の記録</h3></div>
        {table.length === 0 && d.monthly.length === 0 ? <div className="kt-empty">記録なし</div> : (
          <div className="kt-table-wrap">
            <table className="kt-table">
              <thead><tr><th>日付</th><th className="r">体重</th><th className="r">体脂肪</th><th className="r">筋肉量</th><th className="r">ウエスト</th></tr></thead>
              <tbody>
                {table.slice(0, 20).map(g => (
                  <tr key={g.id || g.date}>
                    <td>{ymd(g.date)}{g.fromLine && <span className="kt-tag green" style={{ marginLeft: 6 }}>LINE</span>}</td>
                    <td className="r num">{r1(g.weight)}</td><td className="r num">{r1(g.bodyFat)}</td><td className="r num">{r1(g.muscleMass)}</td><td className="r num">{r1(g.waist)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {d.monthly.length > 0 && (
              <table className="kt-table" style={{ marginTop: 16 }}>
                <thead><tr><th>体力テスト</th><th className="r">腹筋1分</th><th className="r">ベンチ</th><th className="r">ヒップスラスト</th></tr></thead>
                <tbody>
                  {[...d.monthly].sort((a, b) => b.date.localeCompare(a.date)).map(x => (
                    <React.Fragment key={x.id}>
                      <tr><td>{ymd(x.date)}</td><td className="r num">{r1(x.situps)}</td><td className="r num">{r1(x.benchMax)}</td><td className="r num">{r1(x.hipThrust)}</td></tr>
                      {x.note && <tr><td colSpan={4} className="kt-muted" style={{ whiteSpace: "normal", paddingTop: 0 }}>{x.note}</td></tr>}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ───────────────────────── ビフォーアフター ─────────────────────────
const ANGLES = [["", "正面"], ["_side", "横"], ["_back", "後ろ"]];

function PhotosTab({ c, d, flash, onSaved }) {
  const [angle, setAngle] = useState("");
  const [busy, setBusy] = useState("");
  const photos = d.photos;
  async function upload(slot, file) {
    if (!file) return;
    setBusy(slot);
    try {
      await savePhoto(c, slot, await fileToCompressedDataUrl(file, 1280, 0.82));
      flash(c.pid || c.lineUserId ? "写真を保存しました（アプリ・LINEにも反映）" : "写真を保存しました");
      await onSaved();
    } catch (e) {
      flash(`保存できませんでした: ${e.message}`);
    }
    setBusy("");
  }
  const Slot = ({ slot, label, after }) => {
    const src = photos[slot];
    const date = photos.dates?.[slot];
    return (
      <div className="kt-ph">
        {src ? <img src={src} alt={`${label}の写真`} /> : (
          <label className="up"><Camera size={26} />{busy === slot ? "保存中…" : "写真を追加"}<input type="file" accept="image/*" onChange={e => upload(slot, e.target.files?.[0])} /></label>
        )}
        <span className={`lab${after ? " after" : ""}`}>{after ? "AFTER" : "BEFORE"}</span>
        {src && <label className="chg"><Camera size={12} />{busy === slot ? "保存中…" : "撮り直す"}<input type="file" accept="image/*" onChange={e => upload(slot, e.target.files?.[0])} /></label>}
        {date && <span className="date">{ymd(date)}</span>}
      </div>
    );
  };
  const w = points(d.growth, "weight"), f = points(d.growth, "bodyFat");
  return (
    <div className="kt-grid">
      <div className="kt-card wide">
        <div className="kt-card-h">
          <h3>ビフォーアフター <small>アプリ・公式LINEで登録した写真も出ます</small></h3>
        </div>
        <div className="kt-angles">
          {ANGLES.map(([k, l]) => <button key={k} className={`kt-chip${angle === k ? " on" : ""}`} onClick={() => setAngle(k)}>{l}</button>)}
        </div>
        <div className="kt-ba">
          <Slot slot={`before${angle}`} label="ビフォー" />
          <Slot slot={`after${angle}`} label="アフター" after />
        </div>
        {(w.length > 1 || f.length > 1) && (
          <div className="kt-goal-nums" style={{ justifyContent: "center" }}>
            {w.length > 1 && <div><span>体重</span><b className="num">{r1(w[0].v)} → {r1(w[w.length - 1].v)}<small>kg</small></b></div>}
            {f.length > 1 && <div><span>体脂肪率</span><b className="num">{r1(f[0].v)} → {r1(f[f.length - 1].v)}<small>%</small></b></div>}
          </div>
        )}
        <div className="kt-thumbs">
          {PHOTO_SLOTS.map(([slot, l]) => (
            <button key={slot} onClick={() => setAngle(slot.replace(/^(before|after)/, ""))} aria-label={`${slot.startsWith("before") ? "ビフォー" : "アフター"} ${l}`}>
              {photos[slot] ? <img src={photos[slot]} alt="" /> : null}
              <span>{slot.startsWith("before") ? "B" : "A"}・{l}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ───────────────────────── 履歴 ─────────────────────────
function HistoryTab({ d, onDelete, onDeleteOld }) {
  const karteIds = new Set(d.karteSessions.map(s => s.id));
  // カルテ以外（管理画面・アプリ）で付いたパーソナル記録・コメントも時系列に並べる
  const others = [
    ...d.personalLogs.filter(l => !karteIds.has(l.id)).map(l => ({ kind: "log", date: l.date, id: l.id, title: `パーソナル 第${l.seq}回`, text: l.menu })),
    ...d.comments.filter(x => !karteIds.has(x.id)).map(x => ({ kind: "comment", date: x.date, id: x.id, title: "トレーナーコメント", text: x.text })),
  ];
  const all = [...d.karteSessions.map(s => ({ kind: "karte", date: s.date, id: s.id, s })), ...others]
    .sort((a, b) => b.date.localeCompare(a.date) || (b.s?.createdAt || "").localeCompare(a.s?.createdAt || ""));
  const total = d.karteSessions.length;
  return (
    <div className="kt-card">
      <div className="kt-card-h"><h3>セッションの履歴 <small>カルテで{total}回記録</small></h3>
        {onDeleteOld && <button className="kt-del" onClick={onDeleteOld}><Trash2 size={13} />1年以上前の記録を削除</button>}</div>
      {all.length === 0 && <div className="kt-empty">まだ記録がありません。「今日の記録」から残せます</div>}
      {all.map(x => (
        <div key={`${x.kind}-${x.id}`} className="kt-sess">
          <div className="kt-sess-h">
            <b>{ymd(x.date)}</b><span className="kt-muted">{ago(x.date)}</span>
            {x.kind === "karte" ? (
              <>
                {x.s.staff && <span className="kt-tag gold">担当 {x.s.staff}</span>}
                {x.s.ticketUsed && <span className="kt-tag">回数券 −1</span>}
                <button className="kt-del" onClick={() => onDelete(x.s)}><Trash2 size={13} />削除</button>
              </>
            ) : <span className="kt-tag">{x.title}</span>}
          </div>
          {x.kind === "karte" ? <SessionBody s={x.s} /> : <div className="kt-pre" style={{ fontSize: 13.5 }}>{x.text}</div>}
        </div>
      ))}
    </div>
  );
}

// ───────────────────────── 設定 ─────────────────────────
// 公式LINE・アプリ全体の設定（管理画面と同じ部品を、開いたときだけ読み込む）
const GlobalSettingsLazy = React.lazy(() => import("./GlobalSettings.jsx"));
function GlobalSettingsCard() {
  const [open, setOpen] = useState(false);
  return (
    <div className="kt-card">
      <div className="kt-card-h">
        <h3><Settings size={16} />公式LINE・アプリ全体の設定</h3>
        <button className="kt-link" onClick={() => setOpen(v => !v)}>{open ? "閉じる" : "開く"}</button>
      </div>
      <p className="kt-muted" style={{ marginTop: 0 }}>リッチメニュー、おすすめのお店・健康アイテム、週刊レシピのLINE配信、サプリの購入リンク（管理画面と同じものです）</p>
      {open && (isDemo ? <div className="kt-empty">デモ表示では開けません</div> : (
        <React.Suspense fallback={<div className="kt-empty">読み込み中…</div>}><GlobalSettingsLazy /></React.Suspense>
      ))}
    </div>
  );
}

// 公式LINE・アプリのお客様のうち、名簿の名前と合わなかった人を、まとめて名簿の No. の人とつなぐ
function LineLinkCard({ state, onSaved }) {
  const [busy, setBusy] = useState("");
  const people = state.customers.filter(c => c.group === "other");
  const taken = new Set(state.customers.filter(x => x.kind !== "sheet" && x.sheet).map(x => x.sheet.rowKey));
  const free = state.sheetRows.filter(r => !taken.has(r.rowKey));
  async function connect(c, rowKey) {
    const row = free.find(r => r.rowKey === rowKey);
    if (!row) return;
    setBusy(c.cid);
    await connectToSheet(c, row);
    setBusy("");
    onSaved(`${c.name} を ${row.memberNo} ${row.name} とつなぎました`);
  }
  return (
    <div className="kt-card">
      <div className="kt-card-h"><h3><Link2 size={16} />公式LINEのお客様を名簿とつなぐ</h3><small className="kt-muted">{people.length}人</small></div>
      <p className="kt-muted" style={{ marginTop: 0 }}>
        LINEの名前（ニックネーム）と名簿の名前が違う人です。名簿の No. の人を選ぶと、それからは名簿の名前・No.で表示され、記録やLINEへの送信もその人として動きます。◎は似た名前の候補です。
      </p>
      {people.length === 0 && <div className="kt-empty">全員つながっています</div>}
      {people.map(c => {
        const opts = free.map(r => ({ r, score: Math.max(nameScore(r.name, c.name), nameScore(r.name, c.lineName)) })).sort((a, b) => b.score - a.score || a.r.order - b.r.order);
        return (
          <div key={c.cid} className="kt-linkrow">
            <Avatar c={c} />
            <div className="who"><b>{c.name}</b><small>{c.lineName && c.lineName !== c.name ? `LINE: ${c.lineName}` : c.lineUserId ? "公式LINE" : "アプリ"}</small></div>
            <select className="kt-sel" defaultValue="" disabled={busy === c.cid} onChange={e => connect(c, e.target.value)}>
              <option value="" disabled>名簿の人を選ぶ</option>
              {opts.map(({ r, score }) => <option key={r.rowKey} value={r.rowKey}>{score >= 2 ? "◎ " : ""}{r.memberNo || "No.なし"} {r.name}（{r.tabLabel}）</option>)}
            </select>
          </div>
        );
      })}
    </div>
  );
}

function SettingsPanel({ state, onClose, onSaved }) {
  const savedTabs = sheetTabs(state.sheet);
  const [tabKind, setTabKind] = useState("ticket");
  const savedTab = savedTabs.find(t => t.kind === tabKind);
  const [url, setUrl] = useState(savedTab.url);
  const [draft, setDraft] = useState(savedTab.rows ? savedTab : null);
  const [calUrl, setCalUrl] = useState(state.calendar?.url || "");
  const chooseTab = k => { const t = savedTabs.find(x => x.kind === k); setTabKind(k); setUrl(t.url); setDraft(t.rows ? t : null); };
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [staff, setStaff] = useState(state.staff || []);
  const [newStaff, setNewStaff] = useState("");
  const [menus, setMenusLocal] = useState(state.menus || []);
  const [lineKey, setLineKey] = useState(lsGet(LINE_KEY_STORAGE));

  function applyRows(rows, source) {
    const det = detectColumns(rows, { ticketsNextToName: tabKind === "ticket" });
    setDraft({ ...savedTab, url: source, fetchedAt: new Date().toISOString(), rows, headerIdx: det.headerIdx, columns: det.columns });
  }
  async function loadUrl() {
    setLoading(true); setErr("");
    try {
      if (isDemo) throw new Error("デモ表示ではシートを読み込めません");
      applyRows(parseCsv(await fetchSheetCsv(url.trim())), url.trim());
    } catch (e) { setErr(e.message); }
    setLoading(false);
  }
  async function loadFile(file) {
    if (!file) return;
    setErr("");
    const buf = await file.arrayBuffer();
    // Excel で保存した CSV は Shift_JIS のことが多い
    let text = new TextDecoder("utf-8").decode(buf);
    if (text.includes("�")) text = new TextDecoder("shift_jis").decode(buf);
    applyRows(parseCsv(text), `ファイル: ${file.name}`);
  }
  async function saveSheet() {
    const tabs = savedTabs.map(t => (t.kind === tabKind ? { ...draft, kind: t.kind, label: t.label, url: draft.url?.startsWith("https://") ? draft.url : t.url, manual: true } : t));
    await saveGlobal("karteSheet", { tabs });
    onSaved(`${savedTab.label}のタブを保存しました`);
  }
  async function saveCalendar() {
    await saveGlobal("karteCalendar", { url: calUrl.trim() });
    onSaved(calUrl.trim() ? "Googleカレンダーをつなぎました" : "Googleカレンダーを外しました");
  }

  const headers = draft ? draft.rows[draft.headerIdx] || [] : [];
  const dataRows = draft ? draft.rows.length - draft.headerIdx - 1 : 0;

  return (
    <div className="kt-modal-bg" onClick={onClose}>
      <div className="kt-modal" onClick={e => e.stopPropagation()}>
        <div className="kt-modal-h"><h2>設定</h2><button onClick={onClose} aria-label="閉じる"><X size={22} /></button></div>

        <LinkStatus state={state} onSettings={() => {}} />

        <LineLinkCard state={state} onSaved={onSaved} />

        <GlobalSettingsCard />

        <div className="kt-card">
          <div className="kt-card-h"><h3><CalendarDays size={16} />Googleカレンダー（本日の予約）</h3></div>
          <ol className="kt-steps-help">
            <li>パソコンで Googleカレンダーを開き、予約を入れているカレンダーの「︙」→「設定と共有」</li>
            <li>下のほうの「カレンダーの統合」にある「<b>iCal 形式の非公開URL</b>」をコピー</li>
            <li>ここに貼り付けて「保存」。今日の予定が「本日の予約」に出ます（予定名にお客様の名前か No. を入れておくと自動でつながります）</li>
          </ol>
          <div className="kt-custom" style={{ marginTop: 0 }}>
            <input className="kt-in" value={calUrl} onChange={e => setCalUrl(e.target.value)} placeholder="https://calendar.google.com/calendar/ical/…/basic.ics" />
            <button className="kt-btn sm" onClick={saveCalendar}>保存</button>
          </div>
          <p className="kt-muted" style={{ marginTop: 8 }}>非公開URLを知っている人は予定を見られるので、外には出さないでください。</p>
        </div>

        <div className="kt-card">
          <div className="kt-card-h"><h3><FileSpreadsheet size={16} />顧客スプレッドシート</h3></div>
          <div className="kt-groups" style={{ margin: "0 0 12px", padding: 0 }}>
            {savedTabs.map(t => <button key={t.kind} className={tabKind === t.kind ? "on" : ""} onClick={() => chooseTab(t.kind)}>{t.label}のタブ</button>)}
          </div>
          <p className="kt-muted" style={{ marginTop: 0 }}>
            「回数券顧客情報」「月額顧客情報」のタブを、カルテを開くたびと5分ごとに自動で読み直しています。列がずれたときだけ、ここで「読み込む」→ 列を選び直して「保存」してください。
          </p>
          <div className="kt-custom" style={{ marginTop: 0 }}>
            <input className="kt-in" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" />
            <button className="kt-btn sm" onClick={loadUrl} disabled={!url.trim() || loading}>{loading ? "読込中…" : "読み込む"}</button>
          </div>
          <div className="kt-muted" style={{ marginTop: 8 }}>
            または CSV ファイルから：<input type="file" accept=".csv,text/csv" onChange={e => loadFile(e.target.files?.[0])} />
          </div>
          {err && <div className="kt-err">{err}</div>}
          {draft && (
            <div style={{ marginTop: 14 }}>
              <div className="kt-muted" style={{ marginBottom: 10 }}><b style={{ color: "var(--ink)" }}>{dataRows}行</b> 読み込みました。列の対応：</div>
              <div className="kt-map">
                {SHEET_FIELDS.map(fd => (
                  <React.Fragment key={fd.key}>
                    <span>{fd.label}</span>
                    <select className="kt-sel" value={draft.columns[fd.key] ?? ""} onChange={e => setDraft({ ...draft, columns: { ...draft.columns, [fd.key]: e.target.value === "" ? undefined : Number(e.target.value) } })}>
                      <option value="">（使わない）</option>
                      {headers.map((h, i) => <option key={i} value={i}>{h || `列${i + 1}`}</option>)}
                    </select>
                  </React.Fragment>
                ))}
              </div>
              <button className="kt-btn gold full" style={{ marginTop: 14 }} onClick={saveSheet} disabled={draft.columns.name == null}>保存してカルテに反映</button>
              <p className="kt-muted" style={{ marginTop: 8 }}>
                名前（または電話番号）が同じお客様に自動でつながります。シートを更新したら、ここでもう一度「読み込む」→「保存」してください。
                残り回数はカルテで増減した値が優先されます（シートには書き戻しません）。
              </p>
            </div>
          )}
        </div>

        <div className="kt-card">
          <div className="kt-card-h"><h3>スタッフ</h3></div>
          <div className="kt-taglist" style={{ marginBottom: 10 }}>
            {staff.map(s => <span key={s}>{s}<button onClick={() => setStaff(staff.filter(x => x !== s))} aria-label={`${s}を外す`}><X size={14} /></button></span>)}
          </div>
          <div className="kt-custom" style={{ marginTop: 0 }}>
            <input className="kt-in" value={newStaff} onChange={e => setNewStaff(e.target.value)} placeholder="スタッフの名前" />
            <button className="kt-btn ghost sm" onClick={() => { if (newStaff.trim() && !staff.includes(newStaff.trim())) setStaff([...staff, newStaff.trim()]); setNewStaff(""); }}>追加</button>
          </div>
          <button className="kt-btn sm" style={{ marginTop: 10 }} onClick={async () => { await saveGlobal("karteStaff", staff); onSaved("スタッフを保存しました"); }}>保存</button>
        </div>

        <div className="kt-card">
          <div className="kt-card-h"><h3>追加したメニュー</h3></div>
          {menus.length === 0 ? <div className="kt-empty">「今日の記録」のメニュー欄から追加できます</div> : (
            <div className="kt-taglist" style={{ marginBottom: 10 }}>
              {menus.map(m => <span key={m.name}>{MENU_CATEGORIES.find(k => k.key === m.cat)?.label}・{m.name}<button onClick={() => setMenusLocal(menus.filter(x => x.name !== m.name))} aria-label={`${m.name}を削除`}><X size={14} /></button></span>)}
            </div>
          )}
          {menus.length !== (state.menus || []).length && <button className="kt-btn sm" onClick={async () => { await saveGlobal("karteMenus", menus); onSaved("メニューを保存しました"); }}>保存</button>}
        </div>

        <div className="kt-card">
          <div className="kt-card-h"><h3>公式LINEへの送信</h3></div>
          <p className="kt-muted" style={{ marginTop: 0 }}>コメントをLINEでも送るための「LINE操作キー」（管理画面と同じもの）。この端末にだけ保存されます。</p>
          <div className="kt-custom" style={{ marginTop: 0 }}>
            <input className="kt-in" type="password" value={lineKey} onChange={e => setLineKey(e.target.value)} placeholder="LINE操作キー" />
            <button className="kt-btn sm" onClick={() => { lsSet(LINE_KEY_STORAGE, lineKey.trim()); onSaved("LINE操作キーを保存しました"); }}>保存</button>
          </div>
        </div>
      </div>
    </div>
  );
}
