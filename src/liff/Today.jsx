import React, { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Camera, Flame, Plus, Utensils, X } from "lucide-react";
import { sumMeals, sumItems, pfcRatio, pfcBalanceLabel, buildAdvice, PFC_RANGE, fmt } from "./nutrients.js";
import { mealImageUrl } from "./api.js";
import { COLORS, Ring, NutrientSection, addDays, dayInfo, jpDate, comma } from "./ui.jsx";
import { AddMealSheet, WaterCard, waterGoal } from "./MealEntry.jsx";

function WeekStrip({ today, selected, onSelect, kcalByDate, targetKcal }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  return (
    <div className="lf-week">
      {days.map(date => {
        const info = dayInfo(date);
        const sel = date === selected;
        const pct = targetKcal ? (kcalByDate[date] || 0) / targetKcal : 0;
        return (
          <button key={date} className={`lf-day${sel ? " sel" : ""}`} onClick={() => onSelect(date)}>
            <span className="wd">{info.wd}</span>
            <span className="ring">
              <Ring size={38} stroke={3.5} pct={pct} color={sel ? "var(--gold-hero)" : "var(--green)"} track={sel ? "#2C3530" : "#E9E6DF"} />
              <span className="num">{info.d}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function HeroRing({ totals, target }) {
  const size = 140, stroke = 13, r = (size - stroke) / 2, len = 2 * Math.PI * r;
  const segs = [
    { v: totals.p * 4, color: COLORS.pHero },
    { v: totals.f * 9, color: COLORS.fHero },
    { v: totals.c * 4, color: COLORS.cHero },
  ];
  const macroSum = segs.reduce((s, x) => s + x.v, 0) || 1;
  const filled = Math.min(1, target ? totals.kcal / target : 0);
  const gap = filled > 0.05 ? 3 : 0;
  let offset = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
      {segs.map((s, i) => {
        const l = (len * filled * s.v) / macroSum;
        const el = l > gap ? (
          <circle
            key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color} strokeWidth={stroke}
            strokeDasharray={`${l - gap} ${len}`} strokeDashoffset={-offset} transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ) : null;
        offset += l;
        return el;
      })}
    </svg>
  );
}

function Hero({ date, totals, targets, mealCount }) {
  const remain = targets.kcal - totals.kcal;
  const pfc = [
    { k: "p", label: "たんぱく質", color: COLORS.pHero, v: totals.p, t: targets.p },
    { k: "f", label: "脂質", color: COLORS.fHero, v: totals.f, t: targets.f },
    { k: "c", label: "炭水化物", color: COLORS.cHero, v: totals.c, t: targets.c },
  ];
  return (
    <div className="lf-hero">
      <div className="lf-hero-date">{jpDate(date)}</div>
      <div className="lf-hero-main">
        <div className="lf-hero-ring">
          <HeroRing totals={totals} target={targets.kcal} />
          <div className="c">
            <div className="big">{comma(totals.kcal)}</div>
            <div className="of">/ {comma(targets.kcal)} kcal</div>
          </div>
        </div>
        <div className="lf-hero-side">
          <div className="ato">{remain >= 0 ? "あと" : "目標を超えて"}</div>
          <div className="rem">{comma(Math.abs(remain))} kcal</div>
          <div className="row"><span>達成率</span><b>{Math.round((totals.kcal / targets.kcal) * 100)}%</b></div>
          <div className="row"><span>食事</span><b>{mealCount}回</b></div>
        </div>
      </div>
      <div className="lf-hero-pfc">
        {pfc.map(x => {
          const pct = x.t ? Math.round((x.v / x.t) * 100) : 0;
          return (
            <div key={x.k}>
              <div className="lab"><i style={{ background: x.color }} />{x.label}<em>{pct}%</em></div>
              <div className="val">{fmt(x.v)}<small>/ {x.t}g</small></div>
              <div className="bar"><div style={{ width: `${Math.min(100, pct)}%`, background: x.color }} /></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PfcBalance({ totals }) {
  const ratio = pfcRatio(totals);
  const bal = pfcBalanceLabel(ratio);
  const rows = [
    { k: "p", label: "たんぱく質", color: COLORS.p },
    { k: "f", label: "脂質", color: COLORS.f },
    { k: "c", label: "炭水化物", color: COLORS.c },
  ];
  return (
    <>
      <div className="lf-sec"><h2>PFCバランス</h2><span className={`lf-badge ${bal.tone}`} style={{ fontSize: 14, padding: "8px 16px" }}>{bal.label}</span></div>
      <div className="lf-card">
        <div className="lf-pfcbar">
          {rows.map(r => <div key={r.k} style={{ flex: Math.max(ratio[r.k], 1), background: r.color }} />)}
        </div>
        <div className="lf-pfc3">
          {rows.map(r => (
            <div key={r.k}>
              <div className="lab"><i style={{ background: r.color }} />{r.label}</div>
              <div className="pct">{ratio[r.k]}%</div>
              <div className="rng">目安 {PFC_RANGE[r.k][0]}〜{PFC_RANGE[r.k][1]}%</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function MealImage({ meal }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let alive = true;
    if (meal.hasImage) mealImageUrl(meal.id).then(u => { if (alive) setUrl(u); });
    return () => { alive = false; };
  }, [meal.id, meal.hasImage]);
  if (url) return <img className="lf-meal-img" src={url} alt="" />;
  return <div className="lf-meal-img"><Utensils size={34} strokeWidth={1.5} /></div>;
}

function MealCard({ meal, onDeleteItem, onDeleteMeal }) {
  const t = sumItems(meal.items);
  return (
    <div className="lf-card" style={{ padding: 16, marginBottom: 14 }}>
      <div className="lf-meal-top">
        <MealImage meal={meal} />
        <div style={{ minWidth: 0, paddingTop: 4 }}>
          <div className="lf-meal-title">{meal.title}</div>
          <div className="lf-meal-time">{meal.time}・{meal.label || "食事"}</div>
          <div className="lf-meal-kcal"><Flame size={22} fill="#D8B26A" color="#D8B26A" /><b>{comma(t.kcal)}</b><span>kcal</span></div>
          <div className="lf-chips">
            <span className="lf-chip"><i style={{ background: COLORS.p }}>P</i>{fmt(t.p)}g</span>
            <span className="lf-chip"><i style={{ background: COLORS.f }}>F</i>{fmt(t.f)}g</span>
            <span className="lf-chip"><i style={{ background: COLORS.c }}>C</i>{fmt(t.c)}g</span>
          </div>
        </div>
      </div>
      <div className="lf-items">
        {meal.items.map(it => (
          <div className="lf-item" key={it.id}>
            <div className="nm">{it.name}{it.amount ? `（${it.amount}）` : ""}</div>
            <div className="kc">{comma(it.kcal)}kcal</div>
            <button className="lf-x" aria-label="この品目を削除" onClick={() => onDeleteItem(meal, it)}><X size={15} strokeWidth={2.2} /></button>
          </div>
        ))}
        <div className="lf-salt">塩分 {fmt(t.n.salt)}g</div>
      </div>
      <div className="lf-meal-foot">
        <p>違うときは、LINEで「エビじゃなくてイカ」のように送ると直せます</p>
        <button className="lf-meal-del" onClick={() => onDeleteMeal(meal)}>この食事を削除</button>
      </div>
    </div>
  );
}

function Advice({ totals, targets }) {
  const items = buildAdvice(totals, targets);
  if (!items.length) return null;
  return (
    <>
      <div className="lf-sec"><h2>アドバイス</h2></div>
      <div className="lf-card">
        {items.map((a, i) => (
          <div className="lf-adv" key={i}>
            <div className="ic">{a.type === "over" ? <ArrowUp size={22} /> : <ArrowDown size={22} />}</div>
            <div><div className="t">{a.title}</div><div className="b">{a.body}</div></div>
          </div>
        ))}
      </div>
    </>
  );
}

function Empty({ onAdd }) {
  return (
    <div className="lf-card lf-empty">
      <div className="icon"><Camera size={34} strokeWidth={1.8} /></div>
      <h3>今日の記録はまだありません</h3>
      <p>食事を送ると、栄養バランスが<br />ここに表示されます。</p>
      <div className="lf-step"><i>1</i>LINEで食事の写真を送る</div>
      <div className="lf-step"><i>2</i>または「昼食 牛丼並と味噌汁」と送る</div>
      <div className="lf-step"><i>3</i>品目ごとに重さを見積もって記録します</div>
      <button className="lf-btn-o" style={{ marginTop: 18 }} onClick={onAdd}><Plus size={17} />お店から選ぶ・自分で入力</button>
    </div>
  );
}

export default function Today({ data, today, selected, onSelect, onDeleteItem, onDeleteMeal, onAddMeal, onWater }) {
  const [adding, setAdding] = useState(false);
  const { targets } = data;
  const kcalByDate = {};
  for (const m of data.meals) kcalByDate[m.date] = (kcalByDate[m.date] || 0) + sumItems(m.items).kcal;
  const meals = data.meals.filter(m => m.date === selected).sort((a, b) => (a.time < b.time ? -1 : 1));
  const totals = sumMeals(meals);

  return (
    <>
      <WeekStrip today={today} selected={selected} onSelect={onSelect} kcalByDate={kcalByDate} targetKcal={targets.kcal} />
      {meals.length === 0 ? <Empty onAdd={() => setAdding(true)} /> : (
        <>
          <Hero date={selected} totals={totals} targets={targets} mealCount={meals.length} />
          <PfcBalance totals={totals} />
          <div className="lf-sec">
            <h2>食事</h2>
            <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span className="meta">{meals.length}件</span>
              <button className="lf-btn-d" onClick={() => setAdding(true)}><Plus size={17} />追加</button>
            </span>
          </div>
          {meals.map(m => <MealCard key={m.id} meal={m} onDeleteItem={onDeleteItem} onDeleteMeal={onDeleteMeal} />)}
          <div className="lf-sec"><h2>水分</h2></div>
          <WaterCard ml={data.water?.[selected] || 0} goal={waterGoal(data.profile)} onAdd={ml => onWater(selected, ml)} />
          <div className="lf-sec"><h2>栄養素</h2><span className="meta">36項目</span></div>
          <NutrientSection totals={totals} targets={targets} />
          <Advice totals={totals} targets={targets} />
          <p className="lf-note">
            栄養素は写真・文章から品目ごとに重さを見積もり、日本食品標準成分表（八訂 増補2023年）とコンビニ各社の栄養成分表示の値をもとにAIが推定しています。目標値は日本人の食事摂取基準（2025年版）とプロフィール（性別・年齢・体格・活動量・目標）から計算しています。
          </p>
        </>
      )}
      {meals.length === 0 && (
        <>
          <div className="lf-sec"><h2>水分</h2></div>
          <WaterCard ml={data.water?.[selected] || 0} goal={waterGoal(data.profile)} onAdd={ml => onWater(selected, ml)} />
        </>
      )}
      {adding && <AddMealSheet date={selected} onClose={() => setAdding(false)} onSubmit={onAddMeal} />}
    </>
  );
}
