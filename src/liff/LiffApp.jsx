import React, { useCallback, useEffect, useState } from "react";
import { ChartNoAxesColumn, Download, Flag, House, LoaderCircle } from "lucide-react";
import "./liff.css";
import { NUTRIENTS } from "./nutrients.js";
import { fetchData, post, isDemo, openDashboard, openApp } from "./api.js";
import { Header, Toast, jstToday, jpDate } from "./ui.jsx";
import Today from "./Today.jsx";
import History, { dailyTotals } from "./History.jsx";
import Onboarding from "./Onboarding.jsx";
import Goal from "./Goal.jsx";

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

// /liff/open?tab=condition … リッチメニューから TTGYMアプリの各タブを開く中継ページ
function OpenApp() {
  const [error, setError] = useState("");
  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get("tab") || "status";
    openApp(tab).catch(e => setError(e.message || "開けませんでした"));
  }, []);
  return (
    <div className="lf"><div className="lf-center">
      {error ? <>{error}<br />LINEアプリから開き直してください。</> : <div><LoaderCircle className="lf-spin" size={28} /><p>TTGYMアプリを開いています…</p></div>}
    </div></div>
  );
}

export default function LiffApp() {
  const path = window.location.pathname.replace(/\/+$/, "");
  if (path.endsWith("/open")) return <OpenApp />;
  return <Dashboard path={path} />;
}

function Dashboard({ path }) {
  const isProfilePage = path.endsWith("/profile");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  // /liff/goal（リッチメニューの「目標設定」「ビフォーアフター」）は目標タブから開く
  const [view, setView] = useState(path.endsWith("/goal") ? "goal" : "today");
  const [selected, setSelected] = useState(jstToday());
  const [toast, setToast] = useState("");
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
        onSave={async profile => setData(await post("profile", { profile }))}
        onDone={() => (isProfilePage ? openDashboard() : setView("today"))}
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
        {view === "goal" ? <Goal data={data} toast={flash} /> : view === "today" ? (
          <Today
            data={data} today={today} selected={selected} onSelect={setSelected}
            onDeleteItem={(meal, item) => window.confirm(`「${item.name}」を削除しますか？`) && act("deleteItem", { mealId: meal.id, itemId: item.id }, "削除しました")}
            onDeleteMeal={meal => window.confirm("この食事を削除しますか？") && act("deleteMeal", { mealId: meal.id }, "削除しました")}
            onAddMeal={async payload => { setData(await post("addMeal", payload)); flash("記録しました"); }}
            onWater={(date, ml) => act("water", { date, ml })}
          />
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
