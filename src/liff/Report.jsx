// レポート（「My成長・測定結果」のレポートタブと「目標設定」ページで共通）。
// LINEで送った食事・ダッシュボードの記録（食事・水分・体重）と、アプリと共通の記録
// （体調・トレーニング・成長・月次測定・パーソナル）を全部まとめて、グラフで見せる。
import React, { useEffect, useMemo, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { NUTRIENTS, sumMeals, nutrientStatus, STATUS_LABEL, pfcRatio, fmt } from "./nutrients.js";
import { fetchData, isDemo } from "./api.js";
import { COLORS, addDays, comma, jstToday, md, dayInfo } from "./ui.jsx";
import { WeightChart } from "./History.jsx";
import { waterGoal } from "./MealEntry.jsx";

const STORE_KEYS = ["conditions", "workouts", "sessions", "monthly", "personalLogs", "growth"];

function installMemoryStorage() {
  if (window.storage) return;
  const mem = new Map();
  window.storage = {
    get: async k => (mem.has(k) ? { value: mem.get(k) } : null),
    set: async (k, v) => { mem.set(k, v); return true; },
    list: async () => ({ keys: [...mem.keys()] }),
  };
}

async function loadReportData() {
  const info = await fetchData();
  if (isDemo) installMemoryStorage(); else await import("../storage.js");
  const id = info.memberId || "demo";
  const values = await Promise.all(STORE_KEYS.map(async k => {
    try {
      const r = await window.storage.get(`data:${id}:${k}`, true);
      return r ? JSON.parse(r.value) : [];
    } catch (e) {
      return [];
    }
  }));
  return { ...info, ...Object.fromEntries(STORE_KEYS.map((k, i) => [k, values[i]])) };
}

// ── グラフ ──
const W = 340;

// 日ごとの棒グラフ（目標線つき）
function Bars({ dates, values, target, color = "var(--gold)", unit = "", height = 150 }) {
  const top = 22, bottom = height - 26;
  const max = Math.max(1, target ? target * 1.2 : 0, ...dates.map(d => values[d] || 0));
  const step = (W - 20) / dates.length;
  const bw = Math.min(26, step * 0.62);
  const y = v => bottom - (v / max) * (bottom - top);
  const every = dates.length > 10 ? 5 : 1;
  return (
    <svg viewBox={`0 0 ${W} ${height}`} width="100%">
      {target ? (
        <>
          <line x1="10" x2={W - 10} y1={y(target)} y2={y(target)} stroke="#C9973A" strokeWidth="1.2" strokeDasharray="5 5" />
          <text x={W - 10} y={y(target) - 6} textAnchor="end" fontSize="10.5" fontWeight="700" fill="#B38A4A">目標 {comma(target)}{unit}</text>
        </>
      ) : null}
      {dates.map((d, i) => {
        const v = values[d] || 0;
        const x = 10 + step * i + (step - bw) / 2;
        const showLabel = dates.length <= 10 || i % every === 0 || i === dates.length - 1;
        return (
          <g key={d}>
            <rect x={x} y={v ? y(v) : bottom - 3} width={bw} height={v ? bottom - y(v) : 3} rx={Math.min(6, bw / 3)} fill={v ? color : "#EEEBE4"} />
            {dates.length <= 7 && v > 0 && <text x={x + bw / 2} y={y(v) - 5} textAnchor="middle" fontSize="10" fill="#5E5C57">{comma(v)}</text>}
            {showLabel && <text x={x + bw / 2} y={height - 8} textAnchor="middle" fontSize="11" fontWeight="700" fill="#85837D">{dayInfo(d).d}</text>}
          </g>
        );
      })}
    </svg>
  );
}

// 1〜5のスコアの折れ線（睡眠の質・メンタル・だるさ）
function ScoreLines({ dates, series, height = 170 }) {
  const L = 26, R = 10, top = 12, bottom = height - 26;
  const x = i => L + (dates.length > 1 ? (i / (dates.length - 1)) * (W - L - R) : (W - L - R) / 2);
  const y = v => bottom - ((v - 1) / 4) * (bottom - top);
  const every = dates.length > 10 ? 5 : 1;
  return (
    <svg viewBox={`0 0 ${W} ${height}`} width="100%">
      {[1, 2, 3, 4, 5].map(v => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="#ECE8E0" />
          <text x={L - 8} y={y(v) + 4} textAnchor="end" fontSize="10.5" fill="#A8A59D">{v}</text>
        </g>
      ))}
      {dates.map((d, i) => (dates.length <= 10 || i % every === 0) && <text key={d} x={x(i)} y={height - 8} textAnchor="middle" fontSize="11" fontWeight="700" fill="#85837D">{dayInfo(d).d}</text>)}
      {series.map(s => {
        const pts = dates.map((d, i) => (s.values[d] != null ? [x(i), y(s.values[d])] : null)).filter(Boolean);
        return (
          <g key={s.label}>
            {pts.length > 1 && <polyline points={pts.map(p => p.join(",")).join(" ")} fill="none" stroke={s.color} strokeWidth="2.2" />}
            {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="3.8" fill={s.color} />)}
          </g>
        );
      })}
    </svg>
  );
}

// 横棒（達成率など）
function Meter({ label, pct, sub, color = "var(--green)" }) {
  return (
    <div className="lf-meter">
      <div className="top"><span>{label}</span><b>{pct == null ? "—" : `${pct}%`}</b></div>
      <div className="bar"><i style={{ width: `${Math.min(100, pct || 0)}%`, background: color }} /></div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

function Legend({ items }) {
  return <div className="lf-legend">{items.map(([l, c]) => <span key={l}><i style={{ background: c }} />{l}</span>)}</div>;
}

const Sec = ({ title, meta }) => <div className="lf-sec"><h2>{title}</h2>{meta && <span className="meta">{meta}</span>}</div>;
const signed = (v, digits = 1) => (v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(digits)}`);
const pctOf = (n, d) => (d ? Math.round((n / d) * 100) : null);

// ── レポート本体 ──
export default function ReportPanel({ compact = false }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [period, setPeriod] = useState("week");
  useEffect(() => { loadReportData().then(setData).catch(e => setError(e.message || "読み込めませんでした")); }, []);

  const r = useMemo(() => {
    if (!data) return null;
    const days = period === "week" ? 7 : 30;
    const today = jstToday();
    const from = addDays(today, -(days - 1));
    const dates = Array.from({ length: days }, (_, i) => addDays(from, i));
    const inP = x => x.date >= from && x.date <= today;

    const meals = data.meals.filter(inP);
    const byDay = {};
    for (const m of meals) (byDay[m.date] = byDay[m.date] || []).push(m);
    const dayTotals = Object.fromEntries(Object.entries(byDay).map(([d, ms]) => [d, sumMeals(ms)]));
    const mealDays = Object.keys(dayTotals).length;
    const avg = sumMeals(meals);
    const div = mealDays || 1;
    const avgDay = { kcal: avg.kcal / div, p: avg.p / div, f: avg.f / div, c: avg.c / div, n: Object.fromEntries(Object.entries(avg.n).map(([k, v]) => [k, v / div])) };
    const kcalBy = Object.fromEntries(Object.entries(dayTotals).map(([d, t]) => [d, Math.round(t.kcal)]));
    const pBy = Object.fromEntries(Object.entries(dayTotals).map(([d, t]) => [d, Math.round(t.p)]));

    const water = Object.fromEntries(Object.entries(data.water || {}).filter(([d]) => d >= from && d <= today));
    const waterDays = Object.keys(water).length;

    // 栄養素: 期間の1日平均で判定し、足りないものから
    const t = data.targets;
    const nutri = t && mealDays ? NUTRIENTS.filter(n => t.n[n.key]).map(n => {
      const v = avgDay.n[n.key] || 0;
      return { ...n, v, pct: Math.round((v / t.n[n.key]) * 100), status: nutrientStatus(n, v, t.n[n.key]) };
    }) : [];
    const lacking = nutri.filter(n => n.status === "low" || n.status === "almost").sort((a, b) => a.pct - b.pct);
    const overs = nutri.filter(n => n.status === "over");

    const weights = data.weights.filter(inP).sort((a, b) => a.date.localeCompare(b.date));
    const growth = data.growth.filter(inP).sort((a, b) => a.date.localeCompare(b.date));
    const delta = (list, key) => {
      const l = list.filter(x => x[key] != null);
      return l.length >= 2 ? l[l.length - 1][key] - l[0][key] : null;
    };

    const conds = data.conditions.filter(inP);
    const condBy = key => Object.fromEntries(conds.filter(c => c[key] != null).map(c => [c.date, c[key]]));
    const sleepH = Object.fromEntries(conds.filter(c => c.sleepHours).map(c => [c.date, c.sleepHours]));
    const avgOf = vals => (vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null);

    const works = data.workouts.filter(inP);
    const sessions = data.sessions.filter(inP);
    const workDays = new Set([...works.map(w => w.date), ...sessions.filter(s => s.personalTraining).map(s => s.date)]);
    const workKcal = {};
    for (const w of works) workKcal[w.date] = (workKcal[w.date] || 0) + (w.calories || 0);
    const freq = {};
    for (const w of works) freq[w.exercise] = (freq[w.exercise] || 0) + 1;
    const topEx = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 6);

    // 毎日の記録（食事・水分・体重・体調・トレーニング）の数
    const kinds = d => [byDay[d], water[d], weights.some(w => w.date === d) || growth.some(g => g.date === d), conds.some(c => c.date === d), workDays.has(d)].filter(Boolean).length;
    const activity = Object.fromEntries(dates.map(d => [d, kinds(d)]));

    return {
      days, dates, today, mealDays, avgDay, kcalBy, pBy, water, waterDays, lacking, overs, nutri, t,
      weights, growth, weightDelta: delta(weights, "weight"), fatDelta: delta(weights, "bodyFat"), muscleDelta: delta(growth, "muscleMass"),
      conds, condBy, sleepH, avgSleepH: avgOf(Object.values(sleepH)), avgSleep: avgOf(Object.values(condBy("sleep"))), avgMental: avgOf(Object.values(condBy("mental"))),
      works, sessions, workDays, workKcal, topEx, activity,
      personal: data.personalLogs.filter(inP).sort((a, b) => b.seq - a.seq),
      monthly: data.monthly.filter(inP).sort((a, b) => b.date.localeCompare(a.date)),
      wGoal: waterGoal(data.profile),
    };
  }, [data, period]);

  if (error) return <div className="lf-card lf-hint" style={{ margin: 0 }}>{error}</div>;
  if (!r) return <div className="lf-center" style={{ minHeight: "30vh" }}><LoaderCircle className="lf-spin" size={26} /></div>;
  const ratio = pfcRatio(r.avgDay);
  const recordedDays = Object.values(r.activity).filter(Boolean).length;
  const pfcTarget = r.t ? [["たんぱく質", r.avgDay.p, r.t.p, COLORS.p], ["脂質", r.avgDay.f, r.t.f, COLORS.f], ["炭水化物", r.avgDay.c, r.t.c, COLORS.c]] : [];

  return (
    <>
      <div className="lf-seg" style={compact ? { marginTop: 0 } : undefined}>
        {[["week", "1週間"], ["month", "1ヶ月"]].map(([k, l]) => <button key={k} className={period === k ? "on" : ""} onClick={() => setPeriod(k)}>{l}</button>)}
      </div>

      {/* まとめ */}
      <div className="lf-report-hero">
        <div className="eb">{md(r.dates[0])} 〜 {md(r.today)} のレポート</div>
        <div className="grid">
          <div><b>{recordedDays}<small>/{r.days}日</small></b><span>記録した日</span></div>
          <div><b>{r.mealDays ? comma(r.avgDay.kcal) : "—"}<small>kcal</small></b><span>1日平均カロリー</span></div>
          <div><b>{signed(r.weightDelta)}<small>kg</small></b><span>体重の変化</span></div>
          <div><b>{r.workDays.size}<small>日</small></b><span>トレーニング</span></div>
        </div>
        <div className="heat">
          {r.dates.map(d => <i key={d} title={md(d)} style={{ opacity: r.activity[d] ? 0.25 + r.activity[d] * 0.15 : 1, background: r.activity[d] ? "var(--gold-hero)" : "rgba(255,255,255,0.08)" }} />)}
        </div>
        <div className="heat-cap">毎日の記録（食事・水分・体重・体調・トレーニング）。色が濃いほどたくさん記録した日</div>
      </div>

      {/* 食事 */}
      <Sec title="カロリー" meta={r.mealDays ? `${r.mealDays}日分の食事` : "記録なし"} />
      <div className="lf-card" style={{ padding: "14px 10px 6px" }}>
        <Bars dates={r.dates} values={r.kcalBy} target={r.t?.kcal} unit="kcal" />
      </div>

      {r.mealDays > 0 && (
        <>
          <Sec title="PFCバランス" meta="1日平均" />
          <div className="lf-card">
            <div className="lf-pfcbar">
              <i style={{ width: `${ratio.p}%`, background: COLORS.p }} />
              <i style={{ width: `${ratio.f}%`, background: COLORS.f }} />
              <i style={{ width: `${ratio.c}%`, background: COLORS.c }} />
            </div>
            <Legend items={[[`P ${ratio.p}%`, COLORS.p], [`F ${ratio.f}%`, COLORS.f], [`C ${ratio.c}%`, COLORS.c]]} />
            {pfcTarget.map(([l, v, tg, c]) => <Meter key={l} label={`${l}　${fmt(v)}g / 目標 ${tg}g`} pct={pctOf(v, tg)} color={c} />)}
          </div>

          <Sec title="たんぱく質" meta="日ごと" />
          <div className="lf-card" style={{ padding: "14px 10px 6px" }}>
            <Bars dates={r.dates} values={r.pBy} target={r.t?.p} unit="g" color={COLORS.p} />
          </div>

          {r.nutri.length > 0 && (
            <>
              <Sec title="不足しがちな栄養素" meta={`${r.lacking.length}項目`} />
              <div className="lf-card">
                {r.lacking.length === 0 ? <p className="lf-hint" style={{ margin: 0 }}>期間の平均では、目標に届いていない栄養素はありません。</p>
                  : r.lacking.slice(0, compact ? 5 : 8).map(n => (
                    <Meter key={n.key} label={`${n.name}　${fmt(n.v)}${n.unit}`} pct={n.pct} color={n.status === "low" ? "var(--red)" : "var(--gold)"}
                      sub={`${STATUS_LABEL[n.status]}・おすすめ：${n.adviceFoods || n.foods?.slice(0, 3).join("・")}`} />
                  ))}
                {r.overs.length > 0 && <p className="lf-hint" style={{ margin: "12px 0 0", lineHeight: 1.8 }}>摂りすぎ注意：{r.overs.map(n => `${n.name}（${n.pct}%）`).join("、")}</p>}
              </div>
            </>
          )}
        </>
      )}

      <Sec title="水分" meta={r.waterDays ? `平均 ${comma(Object.values(r.water).reduce((a, b) => a + b, 0) / r.waterDays)}ml` : "記録なし"} />
      <div className="lf-card" style={{ padding: "14px 10px 6px" }}>
        <Bars dates={r.dates} values={r.water} target={r.wGoal} unit="ml" color="var(--blue)" />
      </div>

      {/* 体 */}
      <Sec title="体重・体脂肪率" meta={r.weights.length ? `${r.weights.length}回記録` : "記録なし"} />
      <div className="lf-card" style={{ padding: "14px 10px 6px" }}>
        {r.weights.length >= 2 ? (
          <>
            <WeightChart points={r.weights} from={r.dates[0]} to={r.today} show={{ weight: true, fat: true }} height={data.profile?.height} />
            <Legend items={[["体重", "var(--blue)"], ["体脂肪率", "var(--teal)"]]} />
          </>
        ) : <p className="lf-hint" style={{ margin: "4px 8px 10px" }}>2回以上記録するとグラフになります。</p>}
        <div className="lf-stats" style={{ marginTop: 4 }}>
          {[["体重", r.weightDelta, "kg"], ["体脂肪率", r.fatDelta, "%"], ["骨格筋量", r.muscleDelta, "kg"]].map(([l, v, u]) => (
            <div key={l}><div className="v">{signed(v)}<small>{u}</small></div><div className="l">{l}の変化</div></div>
          ))}
        </div>
      </div>

      {/* 体調 */}
      <Sec title="睡眠・メンタル" meta={r.conds.length ? `${r.conds.length}回記録` : "記録なし"} />
      <div className="lf-card" style={{ padding: "14px 10px 6px" }}>
        {r.conds.length ? (
          <>
            <ScoreLines dates={r.dates} series={[
              { label: "睡眠の質", color: "var(--blue)", values: r.condBy("sleep") },
              { label: "メンタル", color: "var(--green)", values: r.condBy("mental") },
              { label: "起床時のだるさ", color: "var(--red)", values: r.condBy("morningFatigue") },
            ]} />
            <Legend items={[["睡眠の質", "var(--blue)"], ["メンタル", "var(--green)"], ["だるさ", "var(--red)"]]} />
            <div className="lf-stats">
              <div><div className="v">{r.avgSleepH ? r.avgSleepH.toFixed(1) : "—"}<small>時間</small></div><div className="l">平均睡眠時間</div></div>
              <div><div className="v">{r.avgSleep ? r.avgSleep.toFixed(1) : "—"}<small>/5</small></div><div className="l">睡眠の質</div></div>
              <div><div className="v">{r.avgMental ? r.avgMental.toFixed(1) : "—"}<small>/5</small></div><div className="l">メンタル</div></div>
            </div>
          </>
        ) : <p className="lf-hint" style={{ margin: "4px 8px 10px" }}>「体調・トレーニング管理」で記録すると表示されます。</p>}
      </div>

      {r.conds.length > 0 && (
        <>
          <Sec title="習慣の達成率" />
          <div className="lf-card">
            {[["朝、日光を浴びた", "sunAM"], ["湯船に10分以上", "bath10"], ["運動・ストレッチ", "exercise"], ["寝る前のデジタルデトックス", "digitalDetox"]].map(([l, k]) => {
              const n = r.conds.filter(c => c[k]).length;
              return <Meter key={k} label={l} pct={pctOf(n, r.conds.length)} sub={`${n}日 / ${r.conds.length}日`} />;
            })}
            <Meter label="お通じ良好（快調・良好）" pct={pctOf(r.conds.filter(c => c.bowel <= 1).length, r.conds.length)} color="var(--gold)" />
          </div>
        </>
      )}

      {/* トレーニング */}
      <Sec title="トレーニング" meta={`${r.workDays.size}日実施`} />
      <div className="lf-card" style={{ padding: "14px 10px 6px" }}>
        <Bars dates={r.dates} values={r.workKcal} unit="kcal" color="var(--green)" height={130} />
        <p className="lf-hint" style={{ margin: "0 8px 8px" }}>日ごとのトレーニング消費カロリーの目安</p>
        <div className="lf-stats">
          <div><div className="v">{r.works.length}<small>種目</small></div><div className="l">記録した数</div></div>
          <div><div className="v">{r.sessions.filter(s => s.personalTraining).length}<small>回</small></div><div className="l">パーソナル</div></div>
          <div><div className="v">{comma(r.works.reduce((s, w) => s + (w.calories || 0), 0))}<small>kcal</small></div><div className="l">消費の目安</div></div>
        </div>
        {r.topEx.length > 0 && (
          <div style={{ padding: "4px 8px 10px" }}>
            {r.topEx.map(([name, n]) => <Meter key={name} label={name} pct={Math.round((n / r.topEx[0][1]) * 100)} sub={`${n}回`} color="var(--green)" />)}
          </div>
        )}
      </div>

      {r.personal.length > 0 && (
        <>
          <Sec title="パーソナルトレーニング" meta="トレーナーの記録" />
          <div className="lf-card">
            {r.personal.map(p => (
              <div key={p.id} className="lf-log">
                <div><b>第{p.seq}回</b><span>{md(p.date)}</span></div>
                <div className="lf-text">{p.menu}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {r.monthly.length > 0 && (
        <>
          <Sec title="月次測定" />
          <div className="lf-card">
            {r.monthly.map(x => (
              <div key={x.id} className="lf-row">
                <span className="n">{md(x.date)}</span>
                <span className="v">{[x.situps != null && `腹筋 ${x.situps}回`, x.benchMax != null && `BP ${x.benchMax}kg`, x.hipThrust != null && `HT ${x.hipThrust}kg`, x.bridge && "ブリッジ／倒立◎", x.photoSubmitted && "写真提出済", x.note && `メモ：${x.note}`].filter(Boolean).join(" ・ ")}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
