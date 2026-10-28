// 管理画面（/admin）の公式LINE連携パーツ。
//  - LinePanel: 公式LINEで記録しているお客様の一覧と詳細（食事・体重・水分・目標・やりとり）、
//               メッセージ送信、アプリ会員との連携
//  - MemberLineBox: 会員詳細に出す、その会員のLINEのやりとりとメッセージ送信
//  - notifyLine: トレーナーコメントなどをLINEに送る
//  - RecipeBroadcastStatus: 週刊レシピのLINE配信状況
//  - ListBox: LINEのページに出すおすすめのお店（global:recommendedStores）・健康アイテム（global:recommendedItems）
// データの読み取りは他の管理画面と同じく kv_store を直接読む。送信と連携の付け外しだけ
// api/line-admin.js（ADMIN_API_KEY が必要）を通す。
import React, { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Send } from "lucide-react";
import { calcTargets, sumMeals, buildAdvice, fmt } from "../liff/nutrients.js";
import { RECIPES } from "../recipes.js";
import { fileToCompressedDataUrl } from "../imageUtils.js";

// AdminDashboard.jsx と同じ配色
const C = {
  bg: "#0D0D0D", card: "#1A1917", cardBorder: "#2C2A24", line: "#06C755",
  gold: "#D4AF37", goldDim: "#8C7328", ivory: "#EDEAE0", dim: "#8A8578", danger: "#B2483A",
};
const KEY_STORAGE = "ttgym_line_admin_key";

const parse = (raw, fb) => { try { return raw ? JSON.parse(raw) : fb; } catch (e) { return fb; } };
const jstDate = (iso = new Date().toISOString()) => new Date(Date.parse(iso) + 9 * 3600 * 1000).toISOString().slice(0, 10);
const jstTime = iso => new Date(Date.parse(iso) + 9 * 3600 * 1000).toISOString().slice(5, 16).replace("T", " ").replace("-", "/");

function getKey() { try { return window.localStorage.getItem(KEY_STORAGE) || ""; } catch (e) { return ""; } }

async function adminCall(action, payload = {}) {
  const res = await fetch("/api/line-admin", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-admin-key": getKey() },
    body: JSON.stringify({ action, ...payload }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `エラー (${res.status})`);
  return body;
}

export async function notifyLine(lineUserId, text) {
  return adminCall("push", { lineUserId, text });
}

async function loadLog(lineUserId) {
  const r = await window.storage.get(`line_log:${lineUserId}`, true).catch(() => null);
  return parse(r?.value, []);
}

const small = { fontSize: 10, color: C.dim };
const btn = (primary) => ({
  background: primary ? C.gold : "transparent", color: primary ? "#0D0D0D" : C.ivory, border: `1px solid ${primary ? C.gold : C.cardBorder}`,
  borderRadius: 4, padding: "7px 12px", fontSize: 11.5, fontWeight: primary ? 700 : 400, cursor: "pointer",
});
const input = { width: "100%", background: C.bg, border: `1px solid ${C.cardBorder}`, borderRadius: 4, padding: "8px 10px", color: C.ivory, fontSize: 12.5, boxSizing: "border-box" };

function KeyBox() {
  const [key, setKey] = useState(getKey());
  const [status, setStatus] = useState(getKey() ? "saved" : "");
  const save = async () => {
    try { window.localStorage.setItem(KEY_STORAGE, key.trim()); } catch (e) {}
    try { await adminCall("check"); setStatus("ok"); } catch (e) { setStatus(e.message); }
  };
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
      <input type="password" value={key} onChange={e => setKey(e.target.value)} placeholder="LINE操作キー（ADMIN_API_KEY）" style={{ ...input, flex: 1 }} />
      <button onClick={save} style={btn(true)}>保存</button>
      <span style={{ fontSize: 10.5, color: status === "ok" ? C.line : status === "saved" ? C.dim : C.danger, minWidth: 60 }}>
        {status === "ok" ? "✓ 有効" : status === "saved" ? "保存済み" : status}
      </span>
    </div>
  );
}

function SendBox({ lineUserId, onSent, disabled }) {
  const [text, setText] = useState("");
  const [state, setState] = useState("");
  const send = async () => {
    setState("sending");
    try {
      await adminCall("push", { lineUserId, text: text.trim() });
      setText("");
      setState("sent");
      onSent?.();
    } catch (e) {
      setState(e.message);
    }
  };
  return (
    <div style={{ marginTop: 8 }}>
      <textarea rows={2} value={text} onChange={e => setText(e.target.value)} placeholder="お客様のLINEにメッセージを送る" style={{ ...input, resize: "vertical" }} />
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
        <button onClick={send} disabled={disabled || !text.trim() || state === "sending"} style={{ ...btn(true), display: "inline-flex", alignItems: "center", gap: 6, opacity: disabled || !text.trim() ? 0.5 : 1 }}>
          <Send size={13} />{state === "sending" ? "送信中…" : "LINEで送る"}
        </button>
        <span style={{ fontSize: 10.5, color: state === "sent" ? C.line : C.danger }}>{state === "sent" ? "送信しました" : state === "sending" ? "" : state}</span>
      </div>
      {disabled && <div style={{ ...small, marginTop: 4 }}>送信するには上の「LINE操作キー」を保存してください</div>}
    </div>
  );
}

function ChatLog({ log }) {
  if (!log.length) return <div style={{ fontSize: 11.5, color: C.dim }}>やりとりの記録はまだありません</div>;
  return (
    <div style={{ maxHeight: 320, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6, padding: "4px 0" }}>
      {log.slice(-40).map((m, i) => {
        if (m.from === "system") return <div key={i} style={{ ...small, textAlign: "center" }}>{jstTime(m.at)} {m.text}</div>;
        const mine = m.from !== "user";
        return (
          <div key={i} style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "85%" }}>
            <div style={{ ...small, textAlign: mine ? "right" : "left", marginBottom: 2 }}>
              {m.from === "user" ? "お客様" : m.from === "staff" ? "スタッフ" : "自動返信"} ・{jstTime(m.at)}
            </div>
            <div style={{
              fontSize: 11.5, lineHeight: 1.6, whiteSpace: "pre-wrap", padding: "7px 10px", borderRadius: 10,
              background: m.from === "user" ? "#2A2925" : m.from === "staff" ? `${C.gold}30` : `${C.line}22`, color: C.ivory,
            }}>{m.text.length > 400 ? `${m.text.slice(0, 400)}…` : m.text}</div>
          </div>
        );
      })}
    </div>
  );
}

function Avatar({ line, size = 36 }) {
  if (line?.pictureUrl) return <img src={line.pictureUrl} alt="" style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />;
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: C.line, display: "grid", placeItems: "center", flexShrink: 0, color: "#fff", fontSize: 12, fontWeight: 700 }}>
      {(line?.displayName || "L").charAt(0)}
    </div>
  );
}

const SubLabel = ({ children }) => <div style={{ fontSize: 10, color: C.dim, margin: "14px 0 6px" }}>{children}</div>;

function LineUserDetail({ u, members, onChanged, hasKey }) {
  const [log, setLog] = useState(null);
  const [linkTo, setLinkTo] = useState("");
  const [busy, setBusy] = useState("");
  useEffect(() => { loadLog(u.id).then(setLog); }, [u.id]);

  const targets = calcTargets(u.data.profile);
  const today = jstDate();
  const todays = (u.data.meals || []).filter(m => m.date === today);
  const t = sumMeals(todays);
  const advice = targets ? buildAdvice(t, targets, 3) : [];
  const recent = [...(u.data.meals || [])].sort((a, b) => (`${b.date} ${b.time}` > `${a.date} ${a.time}` ? 1 : -1)).slice(0, 8);
  const weights = [...(u.data.weights || [])].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 6);
  const p = u.data.profile;
  const member = members.find(m => m.id === u.pid);

  const act = async (action, payload, label) => {
    setBusy(label);
    try { await adminCall(action, payload); await onChanged(); } catch (e) { alert(e.message); }
    setBusy("");
  };

  return (
    <div style={{ padding: "4px 4px 8px" }}>
      <SubLabel>アプリ会員との連携</SubLabel>
      {u.pid ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12 }}>
          <span style={{ color: C.line }}>✓ 連携済み：{member?.name || u.pid}</span>
          <button style={btn(false)} disabled={!hasKey || !!busy} onClick={() => window.confirm("連携を解除しますか？") && act("unlink", { lineUserId: u.id }, "unlink")}>連携を解除</button>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8 }}>
          <select value={linkTo} onChange={e => setLinkTo(e.target.value)} style={{ ...input, flex: 1 }}>
            <option value="">会員を選んで連携…</option>
            {members.filter(m => m.registered && !m.lineUserId).map(m => <option key={m.id} value={m.id}>{m.name}（{m.furigana || "—"}）</option>)}
          </select>
          <button style={btn(true)} disabled={!hasKey || !linkTo || !!busy} onClick={() => act("link", { lineUserId: u.id, profileId: linkTo }, "link")}>{busy === "link" ? "連携中…" : "連携する"}</button>
        </div>
      )}
      {!u.pid && <div style={{ ...small, marginTop: 4, lineHeight: 1.6 }}>連携すると、LINEの食事・体重・水分がアプリと共有され、会員詳細にも表示されます。</div>}

      <SubLabel>プロフィール・目標</SubLabel>
      {p ? (
        <div style={{ fontSize: 12, lineHeight: 1.9 }}>
          {p.sex === "female" ? "女性" : "男性"}・{p.age}歳・{p.height}cm・{p.weight}kg{p.bodyFat ? `・体脂肪${p.bodyFat}%` : ""}
          <br /><span style={{ color: C.gold }}>目標 {targets?.kcal?.toLocaleString()}kcal（P{targets?.p} F{targets?.f} C{targets?.c}g）</span>
          {u.data.goal?.goal && <div style={{ whiteSpace: "pre-wrap", color: C.ivory, marginTop: 4, fontSize: 11.5 }}>「{u.data.goal.goal}」</div>}
        </div>
      ) : <div style={{ fontSize: 11.5, color: C.dim }}>プロフィール未登録</div>}

      <SubLabel>今日の栄養（{todays.length}食）</SubLabel>
      {todays.length ? (
        <div style={{ fontSize: 12, lineHeight: 1.8 }}>
          {Math.round(t.kcal).toLocaleString()}kcal ・P{fmt(t.p)} F{fmt(t.f)} C{fmt(t.c)}
          {targets && <span style={{ color: C.dim }}>（目標の{Math.round((t.kcal / targets.kcal) * 100)}%）</span>}
          {advice.map((a, i) => <div key={i} style={{ fontSize: 11, color: C.dim }}>・{a.title}</div>)}
        </div>
      ) : <div style={{ fontSize: 11.5, color: C.dim }}>記録なし</div>}
      {u.data.water?.[today] ? <div style={{ fontSize: 11.5, marginTop: 4 }}>水分 {u.data.water[today].toLocaleString()}ml</div> : null}

      <SubLabel>最近の食事</SubLabel>
      {recent.length === 0 ? <div style={{ fontSize: 11.5, color: C.dim }}>記録なし</div> : recent.map(m => {
        const mt = sumMeals([m]);
        return (
          <details key={m.id} style={{ padding: "6px 0", borderBottom: `1px solid ${C.cardBorder}` }}>
            <summary style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, cursor: "pointer", listStyle: "none" }}>
              <span>{m.date.slice(5).replace("-", "/")} {m.time} {m.title}</span>
              <span style={{ fontFamily: "'Space Mono', monospace", color: C.dim }}>{Math.round(mt.kcal)}kcal・P{fmt(mt.p)}</span>
            </summary>
            {(m.items || []).map(i => (
              <div key={i.id} style={{ fontSize: 10.5, color: C.dim, padding: "2px 0 0 10px" }}>{i.name}（{i.amount}） {Math.round(i.kcal)}kcal</div>
            ))}
          </details>
        );
      })}

      {weights.length > 0 && (
        <>
          <SubLabel>体重・体脂肪率</SubLabel>
          <div style={{ fontSize: 11.5, lineHeight: 1.8 }}>
            {weights.map(w => <span key={w.id} style={{ marginRight: 12 }}>{w.date.slice(5).replace("-", "/")} {w.weight ? `${w.weight}kg` : ""}{w.bodyFat ? `・${w.bodyFat}%` : ""}</span>)}
          </div>
        </>
      )}

      <SubLabel>LINEのやりとり</SubLabel>
      {log ? <ChatLog log={log} /> : <div style={{ fontSize: 11.5, color: C.dim }}>読み込み中…</div>}
      <SendBox lineUserId={u.id} disabled={!hasKey || !!u.data.unfollowedAt} onSent={() => loadLog(u.id).then(setLog)} />
      {u.data.unfollowedAt && <div style={{ fontSize: 10.5, color: C.danger, marginTop: 4 }}>ブロックされているため送信できません</div>}
    </div>
  );
}

// リッチメニュー（2ページ）をLINEに登録・作り直す。リンク未定のタイルは空欄でOK
const MENU_LINKS = [
  ["reserve", "予約"],
  ["shop", "オススメ健康ショップ"],
  ["teamtop", "TEAM TOPメンバー参加申込み"],
];

function RichMenuBox({ hasKey }) {
  const [links, setLinks] = useState({});
  const [state, setState] = useState("");
  useEffect(() => {
    window.storage.get("line_richmenu:links", true).then(r => setLinks(parse(r?.value, {}))).catch(() => {});
  }, []);
  const run = async () => {
    setState("sending");
    try {
      await adminCall("richmenu", { links });
      setState("done");
    } catch (e) {
      setState(e.message);
    }
  };
  return (
    <details style={{ background: C.bg, border: `1px solid ${C.cardBorder}`, borderRadius: 4, padding: "8px 10px", marginBottom: 12 }}>
      <summary style={{ fontSize: 12, cursor: "pointer" }}>リッチメニュー（LINEのトーク画面下のメニュー）</summary>
      <div style={{ ...small, lineHeight: 1.7, margin: "8px 0" }}>
        リンク先が決まっていないタイルは空欄のままでOKです（押すとタイル名がメッセージで届き、スタッフが対応できます）。
        {links.updatedAt && <><br />前回の登録: {jstTime(links.updatedAt)}</>}
      </div>
      {MENU_LINKS.map(([k, label]) => (
        <div key={k} style={{ marginBottom: 6 }}>
          <div style={small}>{label}</div>
          <input value={links[k] || ""} onChange={e => setLinks({ ...links, [k]: e.target.value })} placeholder="https://..." style={input} />
        </div>
      ))}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
        <button onClick={run} disabled={!hasKey || state === "sending"} style={{ ...btn(true), opacity: hasKey ? 1 : 0.5 }}>
          {state === "sending" ? "登録中…" : links.updatedAt ? "この内容で作り直す" : "LINEに登録する"}
        </button>
        <span style={{ fontSize: 10.5, color: state === "done" ? C.line : C.danger }}>{state === "done" ? "✓ 登録しました。LINEのトーク画面を開き直すと反映されます" : state === "sending" ? "" : state}</span>
      </div>
    </details>
  );
}

// LINEのページに出す一覧（kv_store に保存）。
//  - おすすめのお店（/liff/recipe）: global:recommendedStores。src/liff/content/stores.js のお店の後ろに並ぶ
//  - TTGYMオススメ健康アイテム（/liff/items）: global:recommendedItems
const LISTS = {
  stores: {
    key: "global:recommendedStores", title: "おすすめのお店（LINEの「レシピ・おすすめ店」ページ）", addLabel: "お店を追加（麻布十番の5店はすでに表示されています）",
    fields: [["name", "店名"], ["area", "エリア（例: 麻布十番）"], ["genre", "ジャンル（例: 定食・サラダ）"], ["address", "住所"], ["tel", "電話番号"], ["url", "お店のページ（https://…）"]],
    comment: "おすすめのポイント（例: 鶏むねのグリル定食がおすすめ。ご飯は少なめで）",
  },
  items: {
    key: "global:recommendedItems", title: "TTGYMオススメ健康アイテム（LINEのページ）", addLabel: "アイテムを追加",
    fields: [["name", "アイテム名"], ["category", "種類（例: プロテイン・サプリ）"], ["url", "購入ページ（https://…）"]],
    comment: "おすすめのポイント・飲み方（例: トレーニング後30分以内に1杯）",
  },
};

function ListBox({ kind }) {
  const cfg = LISTS[kind];
  const [stores, setStores] = useState([]);
  const [draft, setDraft] = useState({});
  const [state, setState] = useState("");
  useEffect(() => {
    window.storage.get(cfg.key, true).then(r => setStores(parse(r?.value, []))).catch(() => {});
  }, []);
  const save = async next => {
    setState("saving");
    try {
      await window.storage.set(cfg.key, JSON.stringify(next), true);
      setStores(next);
      setState("saved");
    } catch (e) {
      setState("保存できませんでした");
    }
  };
  const add = () => {
    if (!draft.name?.trim()) return;
    const url = /^https?:\/\/\S+$/.test((draft.url || "").trim()) ? draft.url.trim() : "";
    save([...stores, { ...draft, name: draft.name.trim(), url, id: Date.now().toString(36) }]);
    setDraft({});
  };
  const move = (i, d) => {
    const next = [...stores];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    save(next);
  };
  return (
    <details style={{ background: C.bg, border: `1px solid ${C.cardBorder}`, borderRadius: 4, padding: "8px 10px", marginBottom: 12 }}>
      <summary style={{ fontSize: 12, cursor: "pointer" }}>{cfg.title}・{stores.length}件</summary>
      {stores.map((st, i) => (
        <div key={st.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${C.cardBorder}`, fontSize: 12 }}>
          {st.photo && <img src={st.photo} alt="" style={{ width: 36, height: 36, objectFit: "cover", borderRadius: 4 }} />}
          <span style={{ flex: 1, minWidth: 0 }}>{st.name}<span style={small}> {[st.area, st.genre].filter(Boolean).join(" ・ ")}</span></span>
          <button style={btn(false)} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
          <button style={btn(false)} disabled={i === stores.length - 1} onClick={() => move(i, 1)}>↓</button>
          <button style={btn(false)} onClick={() => window.confirm(`「${st.name}」を消しますか？`) && save(stores.filter(x => x.id !== st.id))}>削除</button>
        </div>
      ))}
      <div style={{ ...small, margin: "10px 0 6px" }}>{cfg.addLabel}</div>
      {cfg.fields.map(([k, label]) => (
        <input key={k} value={draft[k] || ""} placeholder={label} onChange={e => setDraft({ ...draft, [k]: e.target.value })} style={{ ...input, marginBottom: 6 }} />
      ))}
      <textarea rows={3} value={draft.comment || ""} placeholder={cfg.comment} onChange={e => setDraft({ ...draft, comment: e.target.value })} style={{ ...input, resize: "vertical", marginBottom: 6 }} />
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <label style={{ ...btn(false), display: "inline-block" }}>
          {draft.photo ? "写真を変更" : "写真を選ぶ（任意）"}
          <input type="file" accept="image/*" style={{ display: "none" }} onChange={async e => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) setDraft({ ...draft, photo: await fileToCompressedDataUrl(f, 480, 0.8) });
          }} />
        </label>
        {draft.photo && <img src={draft.photo} alt="" style={{ width: 36, height: 36, objectFit: "cover", borderRadius: 4 }} />}
        <button style={btn(true)} disabled={!draft.name?.trim() || state === "saving"} onClick={add}>追加する</button>
        <span style={{ fontSize: 10.5, color: state === "saved" ? C.line : C.danger }}>{state === "saved" ? "✓ 保存しました" : state === "saving" ? "" : state}</span>
      </div>
    </details>
  );
}

export function LinePanel({ members }) {
  const [users, setUsers] = useState(null);
  const [open, setOpen] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [hasKey, setHasKey] = useState(!!getKey());

  async function load() {
    const list = await window.storage.list("nutri:").catch(() => ({ keys: [] }));
    const out = [];
    for (const k of list.keys || []) {
      const id = k.slice("nutri:".length);
      const [d, link, log] = await Promise.all([
        window.storage.get(k, true).catch(() => null),
        window.storage.get(`line_user:${id}`, true).catch(() => null),
        window.storage.get(`line_log:${id}`, true).catch(() => null),
      ]);
      const lastLog = parse(log?.value, []).filter(x => x.from === "user").slice(-1)[0];
      out.push({ id, data: parse(d?.value, {}), pid: link?.value || null, lastAt: lastLog?.at || null });
    }
    out.sort((a, b) => (b.lastAt || "").localeCompare(a.lastAt || ""));
    setUsers(out);
  }
  useEffect(() => { load(); }, []);
  useEffect(() => {
    const t = setInterval(() => setHasKey(!!getKey()), 1500);
    return () => clearInterval(t);
  }, []);

  const today = jstDate();
  const stats = useMemo(() => {
    if (!users) return null;
    return {
      total: users.filter(u => !u.data.unfollowedAt).length,
      unlinked: users.filter(u => !u.pid && !u.data.unfollowedAt).length,
      activeToday: users.filter(u => u.lastAt && jstDate(u.lastAt) === today).length,
      mealsToday: users.reduce((n, u) => n + (u.data.meals || []).filter(m => m.date === today).length, 0),
    };
  }, [users]);

  const shown = users ? (showAll ? users : users.slice(0, 15)) : [];

  return (
    <div style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 4, padding: "14px 14px 10px", marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ background: C.line, color: "#fff", fontWeight: 800, fontSize: 10, padding: "3px 7px", borderRadius: 4 }}>LINE</span>
          <span style={{ fontSize: 13, color: C.ivory }}>公式LINE・健康ダッシュボード</span>
        </div>
        <button onClick={load} style={{ ...btn(false), padding: "4px 10px", fontSize: 10.5 }}>更新</button>
      </div>
      <KeyBox />
      <RichMenuBox hasKey={hasKey} />
      <ListBox kind="stores" />
      <ListBox kind="items" />
      {stats && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginBottom: 12 }}>
          {[["利用者", stats.total, "人"], ["アプリ未連携", stats.unlinked, "人"], ["今日の利用", stats.activeToday, "人"], ["今日の食事記録", stats.mealsToday, "件"]].map(([l, v, u]) => (
            <div key={l} style={{ background: C.bg, border: `1px solid ${C.cardBorder}`, borderRadius: 4, padding: "8px 8px" }}>
              <div style={small}>{l}</div>
              <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 18, color: C.gold }}>{v}<span style={{ fontSize: 10, color: C.dim }}>{u}</span></div>
            </div>
          ))}
        </div>
      )}
      {!users ? <div style={{ fontSize: 12, color: C.dim }}>読み込み中…</div> : users.length === 0 ? (
        <div style={{ fontSize: 11.5, color: C.dim, lineHeight: 1.7 }}>まだ公式LINEで記録しているお客様はいません。友だち追加や食事の送信があると、ここに表示されます。</div>
      ) : shown.map(u => {
        const member = members.find(m => m.id === u.pid);
        const isOpen = open === u.id;
        const name = u.data.line?.displayName || "（名前未取得）";
        const todayKcal = sumMeals((u.data.meals || []).filter(m => m.date === today)).kcal;
        return (
          <div key={u.id} style={{ marginBottom: 6 }}>
            <button onClick={() => setOpen(isOpen ? null : u.id)} style={{
              width: "100%", display: "flex", alignItems: "center", gap: 10, background: C.bg, cursor: "pointer", textAlign: "left",
              border: `1px solid ${isOpen ? C.line : C.cardBorder}`, borderRadius: 4, padding: "9px 10px", color: C.ivory,
            }}>
              <Avatar line={u.data.line} size={32} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5 }}>
                  {name}
                  {member && <span style={{ fontSize: 10.5, color: C.line }}> ・会員: {member.name}</span>}
                  {u.data.unfollowedAt && <span style={{ fontSize: 10, color: C.danger }}> ・ブロック中</span>}
                </div>
                <div style={small}>
                  {u.lastAt ? `最終 ${jstTime(u.lastAt)}` : "メッセージなし"}
                  {todayKcal ? ` ・今日 ${Math.round(todayKcal).toLocaleString()}kcal` : ""}
                  {!u.data.profile && " ・プロフィール未登録"}
                </div>
              </div>
              {!u.pid && <span style={{ fontSize: 9.5, color: C.gold, border: `1px solid ${C.goldDim}`, borderRadius: 20, padding: "2px 7px", flexShrink: 0 }}>未連携</span>}
              {isOpen ? <ChevronDown size={15} color={C.dim} /> : <ChevronRight size={15} color={C.dim} />}
            </button>
            {isOpen && (
              <div style={{ border: `1px solid ${C.cardBorder}`, borderTop: "none", padding: "0 10px 10px" }}>
                <LineUserDetail u={u} members={members} hasKey={hasKey} onChanged={load} />
              </div>
            )}
          </div>
        );
      })}
      {users && users.length > 15 && (
        <button onClick={() => setShowAll(!showAll)} style={{ ...btn(false), width: "100%", marginTop: 6 }}>{showAll ? "閉じる" : `すべて表示（${users.length}人）`}</button>
      )}
    </div>
  );
}

// 会員詳細の中に出す「公式LINE」欄
export function MemberLineBox({ member }) {
  const [log, setLog] = useState(null);
  const lineUserId = member.lineUserId;
  useEffect(() => { if (lineUserId) loadLog(lineUserId).then(setLog); }, [lineUserId]);
  if (!lineUserId) {
    return <div style={{ fontSize: 11, color: C.dim, lineHeight: 1.7 }}>公式LINEとは未連携です。上の「公式LINE」一覧からお客様を選んで連携するか、お客様にアプリの連携コードをLINEへ送ってもらってください。</div>;
  }
  return (
    <div>
      <div style={{ fontSize: 11, color: C.line, marginBottom: 6 }}>✓ 公式LINEと連携済み（LINEの食事・体重・水分はこの会員の記録に反映されています）</div>
      {log ? <ChatLog log={log} /> : <div style={{ fontSize: 11.5, color: C.dim }}>読み込み中…</div>}
      <SendBox lineUserId={lineUserId} disabled={!getKey()} onSent={() => loadLog(lineUserId).then(setLog)} />
    </div>
  );
}

export function RecipeBroadcastStatus() {
  const [sent, setSent] = useState({});
  useEffect(() => {
    (async () => {
      const out = {};
      for (const r of RECIPES) {
        const v = await window.storage.get(`recipe_broadcast:vol${r.vol}`, true).catch(() => null);
        if (v) out[r.vol] = v.value;
      }
      setSent(out);
    })();
  }, []);
  const now = Date.now();
  const list = [...RECIPES].sort((a, b) => b.vol - a.vol).slice(0, 8);
  return (
    <div style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 4, padding: "10px 14px", marginBottom: 20 }}>
      {list.map(r => {
        const due = Date.parse(r.publishAt) <= now;
        const at = sent[r.vol];
        return (
          <div key={r.vol} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 11.5, padding: "6px 0", borderBottom: `1px solid ${C.cardBorder}` }}>
            <span>vol.{r.vol} {r.title}</span>
            <span style={{ flexShrink: 0, color: at ? C.line : due ? C.danger : C.dim }}>
              {at ? `✓ 配信済み ${jstTime(at)}` : due ? "未配信（予定時刻を過ぎています）" : `予定 ${jstTime(new Date(r.publishAt).toISOString())}`}
            </span>
          </div>
        );
      })}
    </div>
  );
}
