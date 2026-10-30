import React, { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { ChartNoAxesColumn, Download, Flag, House, LoaderCircle } from "lucide-react";
import "./liff.css";
import { NUTRIENTS } from "./nutrients.js";
import { fetchData, post, isDemo, openDashboard } from "./api.js";
import { Header, Toast, jstToday, jpDate } from "./ui.jsx";
import Today from "./Today.jsx";
import History, { dailyTotals } from "./History.jsx";
import Onboarding from "./Onboarding.jsx";
import Goal from "./Goal.jsx";
import { NameGate, MyGoalCard, needsName, displayName } from "./MyGoal.jsx";

// リッチメニューの各タイルから開くページ（/liff/condition など）。必要なときだけ読み込む
const AppPage = lazy(() => import("./AppPages.jsx"));
const PAGE_NAMES = ["condition", "online", "recipe", "items"];
// 「目標設定・MY成長・測定結果」のタブ（成長・コメントは Care.jsx、レポートは Report.jsx）
const Care = lazy(() => import("./Care.jsx"));
const ReportPanel = lazy(() => import("./Report.jsx"));
const GOAL_TABS = [["goal", "目標"], ["growth", "成長・測定"], ["report", "レポート"], ["comments", "コメント"]];
// ビフォーアフターは TTGYM のビフォーアフターのページ（会員様の変化の例）へそのまま移動する
export const BEFORE_AFTER_URL = "https://claude.ai/artifact/PALnehkVe6vqe72S7kkVz6";

function exportCsv(data) {
  const daily = dailyTotals(data.meals);
  const weights = Object.fromEntries(data.weights.map(w => [w.date, w]));
  const water = data.water || {};
  const dates = [...new Set([...Object.keys(daily), ...Object.keys(weights), ...Object.keys(water)])].sort();
  const head = ["日付", "食事回数", "カロリー(kcal)", "たんぱく質(g)", "脂質(g)", "炭水化物(g)", ...NUTRIENTS.map(d => `${d.name}(${d.unit})`), "体重(kg)", "体脂肪率(%)", "水分(ml)"];
  const r = v => (v == null || v === "" ? "" : Math.round(v * 100) / 100);
  const rows = dates.map(d => {
    const t = daily[d];
    const w = weights[d];
    return [d, t?.count ?? 0, r(t?.kcal), r(t?.p), r(t?.f), r(t?.c), ...NUTRIENTS.map(n => r(t?.n[n.key])), r(w?.weight), r(w?.bodyFat), r(water[d])];
  });
  const csv = "﻿" + [head, ...rows].map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const file = new File([csv], `ttgym-health-${jstToday()}.csv`, { type: "text/csv" });
  if (navigator.canShare?.({ files: [file] })) {
    navigator.share({ files: [file], title: "TTGYM 健康データ" }).catch(() => {});
    return;
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  a.click();
}

// /liff/open?tab=… は以前のリッチメニューのリンク。アプリではなく、LINEの中のページへ案内する
const OLD_TABS = {
  condition: "/condition", training: "/condition?tab=training", growth: "/growth", report: "/growth?tab=report",
  comments: "/growth?tab=comments", recipe: "/recipe", live: "/online", meal: "", status: "/goal",
};

function OpenOld() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const target = OLD_TABS[params.get("tab")] ?? "";
    const demo = params.has("demo") ? `${target.includes("?") ? "&" : "?"}demo=1` : "";
    window.location.replace(`/liff${target}${demo}`);
  }, []);
  return <div className="lf"><div className="lf-center"><LoaderCircle className="lf-spin" size={28} /></div></div>;
}

export default function LiffApp() {
  const path = window.location.pathname.replace(/\/+$/, "");
  if (path.endsWith("/open")) return <OpenOld />;
  if (path.endsWith("/beforeafter")) {
    window.location.replace(BEFORE_AFTER_URL);
    return null;
  }
  const page = PAGE_NAMES.find(n => path.endsWith(`/${n}`));
  if (page) {
    return (
      <Suspense fallback={<div className="lf"><div className="lf-center"><LoaderCircle className="lf-spin" size={28} /></div></div>}>
        <AppPage page={page} />
      </Suspense>
    );
  }
  return <Dashboard path={path} />;
}

function Dashboard({ path }) {
  const isProfilePage = path.endsWith("/profile");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  // /liff/goal（リッチメニューの「目標設定・MY成長」）と以前の /liff/growth は目標タブから開く
  const isGoalPage = path.endsWith("/goal") || path.endsWith("/growth");
  const [view, setView] = useState(isGoalPage ? "goal" : "today");
  const [goalTab, setGoalTab] = useState(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    return GOAL_TABS.some(([k]) => k === t) ? t : path.endsWith("/growth") ? "growth" : "goal";
  });
  const [selected, setSelected] = useState(jstToday());
  const [toast, setToast] = useState("");
  const [editingName, setEditingName] = useState(false);
  const today = jstToday();

  useEffect(() => {
    fetchData().then(setData).catch(e => setError(e.message || "読み込めませんでした"));
  }, []);

  const flash = msg => {
    setToast(msg);
    setTimeout(() => setToast(""), 2200);
  };
  const act = useCallback(async (action, payload, msg) => {
    try {
      setData(await post(action, payload));
      if (msg) flash(msg);
    } catch (e) {
      flash(e.message || "保存できませんでした");
    }
  }, []);

  if (error) return <div className="lf"><div className="lf-center">{error}<br />LINEアプリから開き直してください。</div></div>;
  if (!data) return <div className="lf"><div className="lf-center"><LoaderCircle className="lf-spin" size={28} /></div></div>;

  if (isProfilePage || !data.profile) {
    return (
      <Onboarding
        initial={data.profile || data.hints}
        initialName={displayName(data) || data.hints?.name || ""}
        askName={!data.member?.name}
        onSave={async profile => setData(await post("profile", { profile }))}
        onDone={() => (isProfilePage ? openDashboard() : setView("today"))}
      />
    );
  }

  // 誰の記録か分かるように、名前がまだの人は最初に登録してもらう
  if (needsName(data) || editingName) {
    return (
      <NameGate
        initial={data.profile?.fullName || ""}
        onCancel={editingName ? () => setEditingName(false) : null}
        onSave={async fullName => {
          setData(await post("name", { fullName }));
          setEditingName(false);
          flash("お名前を登録しました");
        }}
      />
    );
  }

  const go = v => { setView(v); window.scrollTo(0, 0); };
  const headerRight = view === "history"
    ? <button className="lf-pill-export" onClick={() => exportCsv(data)}><Download size={18} strokeWidth={2.2} />エクスポート</button>
    : view === "today" && selected !== today
      ? <button className="lf-pill-back" onClick={() => setSelected(today)}>今日に戻る</button>
      : <span className="lf-head-date">{jpDate(today)}</span>;

  return (
    <div className="lf">
      <div className="lf-wrap">
        <Header right={headerRight} />
        {isDemo && <div className="lf-demo">デモ表示中（サンプルデータ）</div>}
        {view === "goal" ? (
          <>
            <div className="lf-page-hero">
              <div className="eb">GOAL & MY GROWTH</div>
              <h1>目標設定<br />MY成長・測定結果</h1>
            </div>
            <div className="lf-seg">
              {GOAL_TABS.map(([k, l]) => <button key={k} className={goalTab === k ? "on" : ""} onClick={() => { setGoalTab(k); window.scrollTo(0, 0); }}>{l}</button>)}
            </div>
            <Suspense fallback={<div className="lf-center" style={{ minHeight: "30vh" }}><LoaderCircle className="lf-spin" size={26} /></div>}>
              {goalTab === "goal" ? <><MyGoalCard data={data} showText={false} onEditName={() => setEditingName(true)} /><Goal data={data} toast={flash} /></>
                : goalTab === "report" ? <ReportPanel compact />
                  : <Care page="growth" tab={goalTab} toast={flash} />}
            </Suspense>
          </>
        ) : view === "today" ? (
          <>
          {selected === today && <MyGoalCard data={data} onEditName={() => setEditingName(true)} onEditGoal={() => { setGoalTab("goal"); go("goal"); }} />}
          <Today
            data={data} today={today} selected={selected} onSelect={setSelected}
            onDeleteItem={(meal, item) => window.confirm(`「${item.name}」を削除しますか？`) && act("deleteItem", { mealId: meal.id, itemId: item.id }, "削除しました")}
            onDeleteMeal={meal => window.confirm("この食事を削除しますか？") && act("deleteMeal", { mealId: meal.id }, "削除しました")}
            onAddMeal={async payload => { setData(await post("addMeal", payload)); flash("記録しました"); }}
            onWater={(date, ml) => act("water", { date, ml })}
          />
          </>
        ) : (
          <History
            data={data}
            onOpenDay={d => { setSelected(d); go("today"); }}
            onAddWeight={v => act("addWeight", v, "記録しました")}
            onDeleteWeight={w => window.confirm("この記録を削除しますか？") && act("deleteWeight", { id: w.id }, "削除しました")}
          />
        )}
      </div>
      <nav className="lf-nav three">
        <button className={view === "today" ? "on" : ""} onClick={() => go("today")}><House size={21} />今日</button>
        <button className={view === "history" ? "on" : ""} onClick={() => go("history")}><ChartNoAxesColumn size={21} />履歴</button>
        <button className={view === "goal" ? "on" : ""} onClick={() => go("goal")}><Flag size={21} />目標</button>
      </nav>
      <Toast text={toast} />
    </div>
  );
}
