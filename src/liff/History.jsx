import React, { useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, List, Plus, X } from "lucide-react";
import { NUTRIENT_KEYS, PFC_RANGE, sumMeals, pfcRatio, fmt } from "./nutrients.js";
import { COLORS, NutrientSection, addDays, dayInfo, md, mdPad, comma, jstToday } from "./ui.jsx";

function dailyTotals(meals) {
  const byDate = {};
  for (const m of meals) (byDate[m.date] ||= []).push(m);
  const out = {};
  for (const [date, ms] of Object.entries(byDate)) out[date] = { ...sumMeals(ms), count: ms.length };
  return out;
}

function average(list) {
  const n = list.length || 1;
  const a = { kcal: 0, p: 0, f: 0, c: 0, n: Object.fromEntries(NUTRIENT_KEYS.map(k => [k, 0])) };
  for (const t of list) {
    a.kcal += t.kcal / n; a.p += t.p / n; a.f += t.f / n; a.c += t.c / n;
    for (const k of NUTRIENT_KEYS) a.n[k] += t.n[k] / n;
  }
  return a;
}

function XLabels({ days, xOf }) {
  return days.map((d, i) => {
    const info = dayInfo(d);
    return (
      <g key={d}>
        <text x={xOf(i)} y={196} textAnchor="middle" fontSize="11" fill="#85837D">{info.wd}</text>
        <text x={xOf(i)} y={214} textAnchor="middle" fontSize="15" fontWeight="800" fill="#111814">{info.d}</text>
      </g>
    );
  });
}

function CalorieChart({ days, daily, target }) {
  const W = 340, top = 20, bottom = 170;
  const xOf = i => 28 + i * ((W - 56) / 6);
  const max = Math.max(target * 1.15, ...days.map(d => daily[d]?.kcal || 0)) || 1;
  const yOf = v => bottom - (v / max) * (bottom - top);
  const pts = days.map((d, i) => daily[d] && { x: xOf(i), y: yOf(daily[d].kcal), v: daily[d].kcal }).filter(Boolean);
  return (
    <svg viewBox={`0 0 ${W} 222`} width="100%">
      {[0.25, 0.5, 0.75].map(f => <line key={f} x1="10" x2={W - 10} y1={bottom - f * (bottom - top) * 1.1} y2={bottom - f * (bottom - top) * 1.1} stroke="#ECE8E0" />)}
      <line x1="10" x2={W - 10} y1={yOf(target)} y2={yOf(target)} stroke="#C9973A" strokeWidth="1.3" strokeDasharray="5 5" />
      <text x={W - 12} y={yOf(target) - 7} textAnchor="end" fontSize="11" fontWeight="700" fill="#C9973A">目標 {comma(target)}</text>
      {pts.length > 1 && <polyline points={pts.map(p => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#C9973A" strokeWidth="2" />}
      {pts.map((p, i) => (
        <g key={i}>
          <text x={p.x} y={p.y - 12} textAnchor="middle" fontSize="11" fill="#5E5C57">{comma(p.v)}</text>
          <circle cx={p.x} cy={p.y} r="4.5" fill="#C9973A" />
        </g>
      ))}
      <XLabels days={days} xOf={xOf} />
    </svg>
  );
}

function PfcChart({ days, daily }) {
  const W = 340, top = 10, bottom = 172;
  const xOf = i => 28 + i * ((W - 56) / 6);
  const max = Math.max(...days.map(d => daily[d]?.kcal || 0)) || 1;
  return (
    <svg viewBox={`0 0 ${W} 222`} width="100%">
      {days.map((d, i) => {
        const t = daily[d];
        if (!t) return <rect key={d} x={xOf(i) - 14} y={bottom - 6} width="28" height="6" rx="3" fill="#EEEBE4" />;
        const kc = [t.p * 4, t.f * 9, t.c * 4];
        const sum = kc.reduce((a, b) => a + b, 0) || 1;
        const h = ((bottom - top) * t.kcal) / max;
        let y = bottom;
        const cols = [COLORS.p, COLORS.f, COLORS.c];
        return (
          <g key={d}>
            <clipPath id={`clip${i}`}><rect x={xOf(i) - 14} y={bottom - h} width="28" height={h} rx="6" /></clipPath>
            <g clipPath={`url(#clip${i})`}>
              {kc.map((v, j) => {
                const sh = (h * v) / sum;
                y -= sh;
                return <rect key={j} x={xOf(i) - 14} y={y} width="28" height={sh} fill={cols[j]} />;
              })}
            </g>
          </g>
        );
      })}
      <XLabels days={days} xOf={xOf} />
    </svg>
  );
}

function WeightChart({ points, from, to, show, height }) {
  const W = 340, H = 240, L = 54, R = 48, top = 14, bottom = 200;
  const [tip, setTip] = useState(null);
  const ref = useRef(null);
  const t0 = new Date(`${from}T00:00:00Z`).getTime();
  const t1 = new Date(`${to}T00:00:00Z`).getTime();
  const xOf = date => L + ((new Date(`${date}T00:00:00Z`).getTime() - t0) / Math.max(1, t1 - t0)) * (W - L - R);
  const range = (vals, step) => {
    if (!vals.length) return [0, 1];
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const mid = (lo + hi) / 2;
    const half = Math.max((hi - lo) / 2 + step, step * 2);
    return [mid - half, mid + half];
  };
  const ws = points.filter(p => p.weight).map(p => p.weight);
  const fs = points.filter(p => p.bodyFat).map(p => p.bodyFat);
  const [wLo, wHi] = range(ws, 0.2);
  const [fLo, fHi] = range(fs, 0.2);
  const yW = v => bottom - ((v - wLo) / (wHi - wLo)) * (bottom - top);
  const yF = v => bottom - ((v - fLo) / (fHi - fLo)) * (bottom - top);
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const xTicks = ticks.map(f => new Date(t0 + (t1 - t0) * f).toISOString().slice(0, 10));
  const fmt1 = v => String(Math.round(v * 10) / 10);

  const onTap = e => {
    if (!points.length) return;
    const rect = ref.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    let best = points[0];
    for (const p of points) if (Math.abs(xOf(p.date) - x) < Math.abs(xOf(best.date) - x)) best = p;
    setTip(best);
  };
  const line = (key, yOf) => points.filter(p => p[key]).map(p => `${xOf(p.date)},${yOf(p[key])}`).join(" ");

  return (
    <div style={{ position: "relative" }}>
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} width="100%" onClick={onTap}>
        {ticks.map(f => {
          const y = bottom - f * (bottom - top);
          return (
            <g key={f}>
              <line x1={L} x2={W - R} y1={y} y2={y} stroke="#ECE8E0" />
              <text x={L - 6} y={y + 4} textAnchor="end" fontSize="10.5" fill="#A8A59D">{fmt1(wLo + f * (wHi - wLo))} kg</text>
              <text x={W - R + 6} y={y + 4} fontSize="10.5" fill="#A8A59D">{fmt1(fLo + f * (fHi - fLo))} %</text>
            </g>
          );
        })}
        {xTicks.map((d, i) => <text key={i} x={L + (i / 4) * (W - L - R)} y={H - 18} textAnchor="middle" fontSize="10.5" fill="#A8A59D">{mdPad(d)}</text>)}
        {tip && <line x1={xOf(tip.date)} x2={xOf(tip.date)} y1={top} y2={bottom} stroke="#A8A59D" strokeDasharray="3 3" />}
        {show.fat && <polyline points={line("bodyFat", yF)} fill="none" stroke="var(--teal)" strokeWidth="2" />}
        {show.weight && <polyline points={line("weight", yW)} fill="none" stroke="var(--blue)" strokeWidth="2" />}
        {show.fat && points.filter(p => p.bodyFat).map(p => <circle key={`f${p.id}`} cx={xOf(p.date)} cy={yF(p.bodyFat)} r="4.5" fill="var(--teal)" />)}
        {show.weight && points.filter(p => p.weight).map(p => <circle key={`w${p.id}`} cx={xOf(p.date)} cy={yW(p.weight)} r="4.5" fill="var(--blue)" />)}
      </svg>
      {tip && (
        <div style={{
          position: "absolute", top: 0, left: `${Math.min(70, Math.max(10, (xOf(tip.date) / W) * 100 - 12))}%`,
          background: "#111814", color: "#fff", borderRadius: 14, padding: "10px 14px", fontSize: 14, fontWeight: 700, lineHeight: 1.7,
        }}>
          <div style={{ fontSize: 16 }}>{md(tip.date)}</div>
          {tip.weight && <div><span style={{ color: "var(--blue)" }}>●</span> {tip.weight}kg</div>}
          {tip.bodyFat && <div><span style={{ color: "var(--teal)" }}>●</span> {tip.bodyFat}%</div>}
          {tip.weight && height && <div>BMI {fmt1(tip.weight / (height / 100) ** 2)}</div>}
        </div>
      )}
    </div>
  );
}

function WeightSheet({ mode, weights, onClose, onAdd, onDelete }) {
  const [date, setDate] = useState(jstToday());
  const [weight, setWeight] = useState("");
  const [fat, setFat] = useState("");
  return (
    <div className="lf-sheet-bg" onClick={onClose}>
      <div className="lf-sheet" onClick={e => e.stopPropagation()}>
        <h3>{mode === "add" ? "体組成を追加" : "体組成の記録"}<button onClick={onClose}><X size={22} /></button></h3>
        {mode === "add" ? (
          <>
            <label className="lf-field" style={{ marginBottom: 12 }}>
              <div className="lab">日付</div>
              <div className="in"><input type="date" value={date} max={jstToday()} onChange={e => setDate(e.target.value)} style={{ fontSize: 22 }} /></div>
            </label>
            <div className="lf-grid2">
              <label className="lf-field"><div className="lab">体重</div><div className="in"><input inputMode="decimal" placeholder="—" value={weight} onChange={e => setWeight(e.target.value)} /><span className="u">kg</span></div></label>
              <label className="lf-field"><div className="lab">体脂肪率</div><div className="in"><input inputMode="decimal" placeholder="—" value={fat} onChange={e => setFat(e.target.value)} /><span className="u">%</span></div></label>
            </div>
            <button className="lf-primary" disabled={!Number(weight)} onClick={() => onAdd({ date, weight: Number(weight), bodyFat: fat ? Number(fat) : null })}>記録する</button>
          </>
        ) : (
          <div className="lf-card lf-wlist" style={{ padding: "6px 16px" }}>
            {weights.length === 0 && <div style={{ padding: 16, color: "var(--sub)", fontSize: 14 }}>まだ記録がありません</div>}
            {[...weights].sort((a, b) => (a.date < b.date ? 1 : -1)).map(w => (
              <div className="row" key={w.id}>
                <span className="d">{w.date.replace(/-/g, "/")}</span>
                <span className="v">{w.weight ? `${w.weight}kg` : "—"}{w.bodyFat ? ` ・ ${w.bodyFat}%` : ""}</span>
                <button className="lf-x" onClick={() => onDelete(w)}><X size={15} /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const PERIODS = [
  { id: "1m", label: "1か月", days: 30 },
  { id: "3m", label: "3か月", days: 91 },
  { id: "1y", label: "1年", days: 365 },
  { id: "all", label: "全期間", days: null },
];

function WeightTab({ data, onAddWeight, onDeleteWeight }) {
  const [period, setPeriod] = useState("1m");
  const [show, setShow] = useState({ weight: true, fat: true });
  const [sheet, setSheet] = useState(null);
  const today = jstToday();
  const all = [...data.weights].sort((a, b) => (a.date < b.date ? -1 : 1));
  const p = PERIODS.find(x => x.id === period);
  const from = p.days ? addDays(today, -p.days + 1) : (all[0]?.date || addDays(today, -29));
  const pts = all.filter(w => w.date >= from);
  const height = data.profile?.height;
  const latest = [...all].reverse();
  const stat = (key, unit, conv = v => v) => {
    const withV = latest.filter(w => w[key]);
    const cur = withV[0] ? conv(withV[0]) : null;
    const prev = withV[1] ? conv(withV[1]) : null;
    const inRange = pts.filter(w => w[key]).map(conv);
    const avg = inRange.length ? inRange.reduce((a, b) => a + b, 0) / inRange.length : null;
    const r1 = v => (v == null ? "—" : (Math.round(v * 10) / 10).toFixed(1));
    const d = cur != null && prev != null ? Math.round((cur - prev) * 10) / 10 : null;
    return { cur: r1(cur), delta: d == null ? "前回なし" : `前回比 ${d > 0 ? "+" : d < 0 ? "−" : "±"}${Math.abs(d).toFixed(1)}${unit}`, avg: avg == null ? "—" : `平均 ${r1(avg)}${unit ? ` ${unit}` : ""}` };
  };
  const w = stat("weight", "kg", x => x.weight);
  const f = stat("bodyFat", "%", x => x.bodyFat);
  const b = height ? stat("weight", "", x => x.weight / (height / 100) ** 2) : { cur: "—", delta: "前回なし", avg: "—" };

  return (
    <>
      <div className="lf-period">
        {PERIODS.map(x => <button key={x.id} className={period === x.id ? "on" : ""} onClick={() => setPeriod(x.id)}>{x.label}</button>)}
      </div>
      <div className="lf-stats3">
        {[["体重", w, "kg"], ["体脂肪率", f, "%"], ["BMI", b, ""]].map(([lab, s, u]) => (
          <div className="lf-card" key={lab}>
            <div className="lab">{lab}</div>
            <div className="v">{s.cur}{u && <small>{u}</small>}</div>
            <span className="lf-delta">{s.delta}</span>
            <div className="s">{s.avg}</div>
          </div>
        ))}
      </div>
      <div className="lf-card" style={{ marginTop: 16, padding: "20px 16px 8px" }}>
        <div className="lf-body-head">
          <h3>体組成</h3>
          <button className="lf-btn-o" onClick={() => setSheet("list")}><List size={17} />一覧表示</button>
          <button className="lf-btn-d" onClick={() => setSheet("add")}><Plus size={17} />追加</button>
        </div>
        <div className="lf-toggles">
          <button className={show.weight ? "" : "off"} onClick={() => setShow(s => ({ ...s, weight: !s.weight }))}><i style={{ background: "var(--blue)" }} />体重</button>
          <button className={show.fat ? "" : "off"} onClick={() => setShow(s => ({ ...s, fat: !s.fat }))}><i style={{ background: "var(--teal)" }} />体脂肪率</button>
        </div>
        <WeightChart points={pts} from={from} to={today} show={show} height={height} />
      </div>
      <p className="lf-hint" style={{ lineHeight: 1.8 }}>「＋追加」のほか、LINEで「体重 64.5」と送るか、体重計・体組成計の画面を撮って送っても記録されます。</p>
      {sheet && (
        <WeightSheet
          mode={sheet} weights={data.weights} onClose={() => setSheet(null)}
          onAdd={async v => { await onAddWeight(v); setSheet(null); }}
          onDelete={onDeleteWeight}
        />
      )}
    </>
  );
}

export default function History({ data, onOpenDay, onAddWeight, onDeleteWeight }) {
  const [tab, setTab] = useState("kcal");
  const [end, setEnd] = useState(jstToday());
  const today = jstToday();
  const days = Array.from({ length: 7 }, (_, i) => addDays(end, i - 6));
  const daily = useMemo(() => dailyTotals(data.meals), [data.meals]);
  const recorded = days.filter(d => daily[d]);
  const avg = average(recorded.map(d => daily[d]));
  const { targets } = data;
  const ratio = pfcRatio(avg);

  return (
    <>
      {tab !== "weight" && (
        <div className="lf-range">
          <button className="lf-roundbtn" onClick={() => setEnd(addDays(end, -7))}><ChevronLeft size={22} /></button>
          <div className="t">
            <div className="eyebrow">{end === today ? "LAST 7 DAYS" : "7 DAYS"}</div>
            <div className="d">{md(days[0])} – {md(days[6])}</div>
          </div>
          <button className="lf-roundbtn" disabled={end >= today} onClick={() => setEnd(addDays(end, 7) > today ? today : addDays(end, 7))}><ChevronRight size={22} /></button>
        </div>
      )}
      <div className="lf-seg">
        {[["kcal", "カロリー"], ["pfc", "PFC"], ["nutri", "栄養素"], ["weight", "体重"]].map(([id, label]) => (
          <button key={id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {tab === "kcal" && (
        <>
          <div className="lf-stats3">
            <div className="lf-card"><div className="lab">1日平均</div><div className="v">{recorded.length ? comma(avg.kcal) : "—"}<small>kcal</small></div></div>
            <div className="lf-card"><div className="lab">目標</div><div className="v">{comma(targets.kcal)}<small>kcal</small></div></div>
            <div className="lf-card"><div className="lab">平均との差</div><div className="v" style={{ color: "var(--green)" }}>{recorded.length ? `${avg.kcal - targets.kcal < 0 ? "−" : "+"}${comma(Math.abs(avg.kcal - targets.kcal))}` : "—"}</div></div>
          </div>
          <div className="lf-card lf-chart"><CalorieChart days={days} daily={daily} target={targets.kcal} /></div>
        </>
      )}

      {tab === "pfc" && (
        <>
          <div className="lf-stats3">
            {[["p", "たんぱく質"], ["f", "脂質"], ["c", "炭水化物"]].map(([k, lab]) => (
              <div className="lf-card" key={k}>
                <div className="lab">{lab}</div>
                <div className="v">{recorded.length ? ratio[k] : "—"}<small>%</small></div>
                <div className="s">平均 {fmt(avg[k])}g・目安 {PFC_RANGE[k][0]}〜{PFC_RANGE[k][1]}%</div>
              </div>
            ))}
          </div>
          <div className="lf-card lf-chart">
            <PfcChart days={days} daily={daily} />
            <div className="lf-legend">
              <span><i style={{ background: COLORS.p }} />たんぱく質</span>
              <span><i style={{ background: COLORS.f }} />脂質</span>
              <span><i style={{ background: COLORS.c }} />炭水化物</span>
            </div>
          </div>
        </>
      )}

      {tab === "nutri" && (
        <div style={{ marginTop: 22 }}>
          <NutrientSection totals={avg} targets={targets} subtitle="記録した日の1日平均と目標の比較です" countCards={false} />
        </div>
      )}

      {tab === "weight" && <WeightTab data={data} onAddWeight={onAddWeight} onDeleteWeight={onDeleteWeight} />}

      {tab !== "weight" && (
        <>
          <div className="lf-sec"><h2>記録した日</h2><span className="meta">{recorded.length} / 7日</span></div>
          {recorded.length === 0 && <div className="lf-card" style={{ color: "var(--sub)", fontSize: 14 }}>この週の記録はまだありません</div>}
          {[...recorded].reverse().map(d => {
            const t = daily[d];
            return (
              <button key={d} className="lf-card lf-dayrow" onClick={() => onOpenDay(d)}>
                <div className="dt"><b>{md(d)}</b><span>{dayInfo(d).wd}曜日</span></div>
                <div className="kc">
                  <b>{comma(t.kcal)}</b><small>kcal</small>
                  <div>P {fmt(t.p)}g ・ F {fmt(t.f)}g ・ C {fmt(t.c)}g ・ {t.count}食</div>
                </div>
                <ChevronRight size={22} />
              </button>
            );
          })}
        </>
      )}
    </>
  );
}

export { dailyTotals, WeightChart };
