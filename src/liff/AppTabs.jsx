// /liff/condition と /liff/growth の中身。アプリ（App.jsx）の各タブをそのまま使い、
// 色とカードだけリッチメニュー・ダッシュボードの見た目に合わせる。
import React, { useEffect, useState } from "react";
import {
  ThemeContext, CardSkinContext, setAiProxy,
  ConditionTab, TrainingTab, GrowthTab, ReportTab, TrainerCommentsTab,
} from "../App.jsx";
import { fetchData, post, isDemo } from "./api.js";
import { Spinner } from "./AppPages.jsx";

const LIFF_C = {
  bg: "#F3F1EC", bg2: "#F3F1EC", card: "#FFFFFF", cardShade: "#FFFFFF",
  cardBorder: "#ECE8E0", cardBorderLight: "#F3F1EC",
  gold: "#C9973A", goldDim: "#8C6A3A", goldSoft: "#C9973A22",
  ivory: "#111814", dim: "#85837D", danger: "#C8624A", onAccent: "#111814",
};
const CARD_SKIN = {
  theme: LIFF_C,
  style: { background: "#FFFFFF", border: "1.5px solid #ECE8E0", borderRadius: 22, padding: 18 },
};

const KEYS = ["meals", "water", "conditions", "growth", "workouts", "monthly", "sessions", "personalLogs", "comments"];
const EMPTY = { water: {} };

// デモ表示ではサーバーに保存しない
function installMemoryStorage() {
  if (window.storage) return;
  const mem = new Map();
  window.storage = {
    get: async k => (mem.has(k) ? { value: mem.get(k) } : null),
    set: async (k, v) => { mem.set(k, v); return true; },
    list: async () => ({ keys: [...mem.keys()] }),
  };
}

setAiProxy(async payload => {
  if (isDemo) throw new Error("デモ表示ではAI解析は使えません");
  return (await post("ai", payload)).text;
});

export default function AppTabs({ page, tab, toast }) {
  const [state, setState] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const info = await fetchData();
      if (isDemo) installMemoryStorage(); else await import("../storage.js");
      const id = info.memberId || "demo";
      const values = await Promise.all(KEYS.map(async k => {
        try {
          const r = await window.storage.get(`data:${id}:${k}`, true);
          return r ? JSON.parse(r.value) : (EMPTY[k] ?? []);
        } catch (e) {
          return EMPTY[k] ?? [];
        }
      }));
      setState({ id, linked: !!info.linked, data: Object.fromEntries(KEYS.map((k, i) => [k, values[i]])) });
    })().catch(e => setError(e.message || "読み込めませんでした"));
  }, []);

  // トレーナーのコメント・成長記録は管理画面から追加されるので、タブを開くたびに読み直す
  useEffect(() => {
    if (!state || !["growth", "report", "comments"].includes(tab)) return;
    Promise.all(["growth", "comments", "personalLogs"].map(k => window.storage.get(`data:${state.id}:${k}`, true).catch(() => null)))
      .then(rs => setState(s => ({ ...s, data: { ...s.data, ...Object.fromEntries(rs.map((r, i) => [["growth", "comments", "personalLogs"][i], r ? JSON.parse(r.value) : []])) } })))
      .catch(() => {});
  }, [tab, !!state]);

  if (error) return <div className="lf-card lf-hint">{error}<br />LINEアプリから開き直してください。</div>;
  if (!state) return <Spinner />;
  const { id, data } = state;

  // 最新を読み直してから変更して保存する（LINEのダッシュボード・アプリ・管理画面と同時に使っても消えないように）
  const mutate = async (key, fn, msg) => {
    let latest = data[key];
    try {
      const r = await window.storage.get(`data:${id}:${key}`, true);
      if (r) latest = JSON.parse(r.value);
    } catch (e) { /* 読めなければ手元の値を使う */ }
    const next = fn(latest);
    setState(s => ({ ...s, data: { ...s.data, [key]: next } }));
    try {
      await window.storage.set(`data:${id}:${key}`, JSON.stringify(next), true);
      if (state.linked) {
        const r = await window.storage.get(`profile:${id}`, true);
        if (r) await window.storage.set(`profile:${id}`, JSON.stringify({ ...JSON.parse(r.value), lastActivityAt: new Date().toISOString() }), true);
      }
      if (msg) toast(msg);
    } catch (e) {
      toast("保存できませんでした");
    }
  };

  let content = null;
  if (page === "condition" && tab === "condition") {
    content = <ConditionTab conditions={data.conditions} comments={data.comments} profileId={id}
      onSave={entry => mutate("conditions", p => [entry, ...p.filter(c => c.date !== entry.date)], "体調を記録しました")} />;
  } else if (page === "condition") {
    content = <TrainingTab workouts={data.workouts} sessions={data.sessions}
      onAdd={w => mutate("workouts", p => [w, ...p], "トレーニングを記録しました")}
      onDelete={wid => mutate("workouts", p => p.filter(w => w.id !== wid))}
      onSaveSession={s => mutate("sessions", p => [s, ...p.filter(x => x.date !== s.date)], "セッション情報を記録しました")} />;
  } else if (tab === "growth") {
    content = <GrowthTab growth={data.growth} monthly={data.monthly} profileId={state.linked ? id : null}
      onAdd={g => mutate("growth", p => [g, ...p], "記録しました")}
      onDelete={gid => mutate("growth", p => p.filter(g => g.id !== gid))}
      onAddMonthly={m => mutate("monthly", p => [m, ...p], "月次測定を記録しました")}
      onDeleteMonthly={mid => mutate("monthly", p => p.filter(m => m.id !== mid))} />;
  } else if (tab === "report") {
    content = <ReportTab meals={data.meals} conditions={data.conditions} growth={data.growth} workouts={data.workouts}
      water={data.water} sessions={data.sessions} monthly={data.monthly} personalLogs={data.personalLogs} />;
  } else {
    content = <TrainerCommentsTab comments={data.comments} meals={data.meals} />;
  }

  return (
    <ThemeContext.Provider value={LIFF_C}>
      <CardSkinContext.Provider value={CARD_SKIN}>
        <div className="lf-appbox">{content}</div>
      </CardSkinContext.Provider>
    </ThemeContext.Provider>
  );
}
