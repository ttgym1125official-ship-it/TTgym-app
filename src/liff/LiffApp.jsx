import React, { useCallback, useEffect, useState } from "react";
import { ChartNoAxesColumn, Download, House, LoaderCircle } from "lucide-react";
import "./liff.css";
import { NUTRIENTS } from "./nutrients.js";
import { fetchData, post, isDemo, openDashboard } from "./api.js";
import { Header, Toast, jstToday, jpDate } from "./ui.jsx";
import Today from "./Today.jsx";
import History, { dailyTotals } from "./History.jsx";
import Onboarding from "./Onboarding.jsx";

function exportCsv(data) {
  const daily = dailyTotals(data.meals);
  const weights = Object.fromEntries(data.weights.map(w => [w.date, w]));
  const dates = [...new Set([...Object.keys(daily), ...Object.keys(weights)])].sort();
  const head = ["日付", "食事回数", "カロリー(kcal)", "たんぱく質(g)", "脂質(g)", "炭水化物(g)", ...NUTRIENTS.map(d => `${d.name}(${d.unit})`), "体重(kg)", "体脂肪率(%)"];
  const r = v => (v == null || v === "" ? "" : Math.round(v * 100) / 100);
  const rows = dates.map(d => {
    const t = daily[d];
    const w = weights[d];
    return [d, t?.count ?? 0, r(t?.kcal), r(t?.p), r(t?.f), r(t?.c), ...NUTRIENTS.map(n => r(t?.n[n.key])), r(w?.weight), r(w?.bodyFat)];
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

export default function LiffApp() {
  const isProfilePage = window.location.pathname.replace(/\/+$/, "").endsWith("/profile");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [view, setView] = useState("today");
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
        initial={data.profile}
        onSave={async profile => setData(await post("profile", { profile }))}
        onDone={() => (isProfilePage ? openDashboard() : setView("today"))}
      />
    );
  }

  const headerRight = view === "history"
    ? <button className="lf-pill-export" onClick={() => exportCsv(data)}><Download size={18} strokeWidth={2.2} />エクスポート</button>
    : selected !== today
      ? <button className="lf-pill-back" onClick={() => setSelected(today)}>今日に戻る</button>
      : <span className="lf-head-date">{jpDate(today)}</span>;

  return (
    <div className="lf">
      <div className="lf-wrap">
        <Header right={headerRight} />
        {isDemo && <div className="lf-demo">デモ表示中（サンプルデータ）</div>}
        {view === "today" ? (
          <Today
            data={data} today={today} selected={selected} onSelect={setSelected}
            onDeleteItem={(meal, item) => window.confirm(`「${item.name}」を削除しますか？`) && act("deleteItem", { mealId: meal.id, itemId: item.id }, "削除しました")}
            onDeleteMeal={meal => window.confirm("この食事を削除しますか？") && act("deleteMeal", { mealId: meal.id }, "削除しました")}
          />
        ) : (
          <History
            data={data}
            onOpenDay={d => { setSelected(d); setView("today"); window.scrollTo(0, 0); }}
            onAddWeight={v => act("addWeight", v, "記録しました")}
            onDeleteWeight={w => window.confirm("この記録を削除しますか？") && act("deleteWeight", { id: w.id }, "削除しました")}
          />
        )}
      </div>
      <nav className="lf-nav">
        <button className={view === "today" ? "on" : ""} onClick={() => { setView("today"); window.scrollTo(0, 0); }}><House size={22} />今日</button>
        <button className={view === "history" ? "on" : ""} onClick={() => { setView("history"); window.scrollTo(0, 0); }}><ChartNoAxesColumn size={22} />履歴</button>
      </nav>
      <Toast text={toast} />
    </div>
  );
}
