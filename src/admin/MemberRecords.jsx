// 管理画面で、アプリと公式LINEの記録（体調・トレーニング・成長・月次測定・食事・水分・
// ビフォーアフター写真）をまとめて見る欄。会員詳細と、公式LINE一覧の「未連携」の人の両方で使う。
// 未連携の人は data:line_<LINEのuserId>:<項目> に、連携済みの人は data:<会員ID>:<項目> に保存されている。
import React, { useEffect, useMemo, useState } from "react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend } from "recharts";
import { conditionStatus, BOWEL_OPTIONS } from "../careData.js";

const C = {
  bg: "#0D0D0D", card: "#1A1917", cardBorder: "#2C2A24", line: "#06C755",
  gold: "#D4AF37", goldDim: "#8C7328", ivory: "#EDEAE0", dim: "#8A8578", danger: "#B2483A",
};
const KEYS = ["meals", "water", "conditions", "growth", "workouts", "monthly", "sessions", "personalLogs"];
const PHOTO_SLOTS = [
  ["before", "ビフォー 前"], ["before_side", "ビフォー 横"], ["before_back", "ビフォー 後ろ"],
  ["after", "アフター 前"], ["after_side", "アフター 横"], ["after_back", "アフター 後ろ"],
];

const parse = (raw, fb) => { try { return raw ? JSON.parse(raw) : fb; } catch (e) { return fb; } };
const jstToday = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
const addDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const md = d => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
const avg = xs => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const r1 = v => (v == null ? "—" : (Math.round(v * 10) / 10).toLocaleString());
const r0 = v => (v == null ? "—" : Math.round(v).toLocaleString());

async function loadRecords(memberId) {
  const values = await Promise.all(KEYS.map(k => window.storage.get(`data:${memberId}:${k}`, true).catch(() => null)));
  return Object.fromEntries(KEYS.map((k, i) => [k, parse(values[i]?.value, k === "water" ? {} : [])]));
}

// 連携済み: 前の2枚は会員プロフィール、横・後ろは profile_photo:<会員ID>:<枠>。
// どちらも無ければ、連携前にLINEで登録した nutri_photo:<LINEのuserId>:<枠> を見る（LINE側の表示と同じ順）。
async function loadPhotos(pid, lineUserId, profile) {
  const read = async key => (await window.storage.get(key, true).catch(() => null))?.value || null;
  const out = {};
  for (const [slot] of PHOTO_SLOTS) {
    let v = null;
    if (pid && slot === "before") v = profile?.beforePhoto || null;
    if (pid && slot === "after") v = profile?.afterPhoto || null;
    if (!v && pid) v = await read(`profile_photo:${pid}:${slot}`);
    if (!v && lineUserId) v = await read(`nutri_photo:${lineUserId}:${slot}`);
    out[slot] = v;
  }
  return out;
}

const Label = ({ children }) => <div style={{ fontSize: 10.5, color: C.gold, margin: "14px 0 6px" }}>{children}</div>;
const Empty = () => <div style={{ fontSize: 11.5, color: C.dim }}>記録なし</div>;
const row = { display: "flex", justifyContent: "space-between", gap: 10, padding: "6px 0", borderBottom: `1px solid ${C.cardBorder}`, fontSize: 11.5 };
const mono = { fontFamily: "'Space Mono', monospace", color: C.dim };
const tip = { background: C.bg, border: `1px solid ${C.cardBorder}`, fontSize: 12 };
const axis = { fill: C.dim, fontSize: 10.5 };

function Kpi({ label, value, unit }) {
  return (
    <div style={{ background: C.bg, border: `1px solid ${C.cardBorder}`, borderRadius: 4, padding: "8px 8px" }}>
      <div style={{ fontSize: 9.5, color: C.dim, marginBottom: 4 }}>{label}</div>
      <div><span style={{ fontFamily: "'Space Mono', monospace", fontSize: 15, color: C.ivory }}>{value}</span>
        {unit && <span style={{ fontSize: 9.5, color: C.dim, marginLeft: 2 }}>{unit}</span>}</div>
    </div>
  );
}

function Report({ d, profile }) {
  const [period, setPeriod] = useState("week");
  const r = useMemo(() => {
    const days = period === "week" ? 7 : 30;
    const today = jstToday();
    const from = addDays(today, -(days - 1));
    const dates = Array.from({ length: days }, (_, i) => addDays(from, i));
    const inP = x => x.date >= from && x.date <= today;
    const meals = d.meals.filter(inP);
    const kcalByDay = {}, pByDay = {};
    for (const m of meals) {
      kcalByDay[m.date] = (kcalByDay[m.date] || 0) + (Number(m.calories) || 0);
      pByDay[m.date] = (pByDay[m.date] || 0) + (Number(m.protein) || 0);
    }
    const mealDays = Object.keys(kcalByDay);
    const waters = dates.map(x => Number(d.water?.[x]) || 0).filter(Boolean);
    const conds = d.conditions.filter(inP);
    const workouts = d.workouts.filter(inP);
    const condBy = Object.fromEntries(conds.map(c => [c.date, c]));
    const weights = [...d.growth].filter(g => g.weight != null).sort((a, b) => a.date.localeCompare(b.date));
    const wIn = weights.filter(inP);
    const active = new Set([...mealDays, ...conds.map(c => c.date), ...workouts.map(w => w.date), ...d.growth.filter(inP).map(g => g.date), ...dates.filter(x => d.water?.[x])]);
    return {
      activeDays: active.size, days,
      kcal: avg(mealDays.map(x => kcalByDay[x])), protein: avg(mealDays.map(x => pByDay[x])),
      water: avg(waters),
      trainingDays: new Set(workouts.map(w => w.date)).size,
      trainingKcal: workouts.reduce((n, w) => n + (Number(w.calories) || 0), 0),
      sleep: avg(conds.map(c => Number(c.sleep)).filter(Boolean)),
      mental: avg(conds.map(c => Number(c.mental)).filter(Boolean)),
      fatigue: avg(conds.map(c => Number(c.morningFatigue)).filter(Boolean)),
      weightDiff: wIn.length >= 2 ? Number(wIn[wIn.length - 1].weight) - Number(wIn[0].weight) : null,
      kcalChart: dates.map(x => ({ date: md(x), kcal: Math.round(kcalByDay[x] || 0) })),
      condChart: dates.map(x => ({ date: md(x), 睡眠: condBy[x]?.sleep ?? null, メンタル: condBy[x]?.mental ?? null, だるさ: condBy[x]?.morningFatigue ?? null })),
      weightChart: weights.slice(-20).map(g => ({ date: md(g.date), weight: Number(g.weight) })),
    };
  }, [d, period]);
  const target = Number(profile?.targetCalories) || null;

  return (
    <div>
      <div style={{ display: "flex", gap: 6, margin: "4px 0 8px" }}>
        {[["week", "1週間"], ["month", "1ヶ月"]].map(([k, l]) => (
          <button key={k} onClick={() => setPeriod(k)} style={{
            background: period === k ? C.gold : "none", color: period === k ? "#0D0D0D" : C.dim, fontWeight: period === k ? 700 : 400,
            border: `1px solid ${period === k ? C.gold : C.cardBorder}`, borderRadius: 20, padding: "4px 12px", fontSize: 11, cursor: "pointer",
          }}>{l}</button>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginBottom: 6 }}>
        <Kpi label="記録した日" value={`${r.activeDays}/${r.days}`} unit="日" />
        <Kpi label="平均摂取" value={r0(r.kcal)} unit="kcal" />
        <Kpi label="平均たんぱく質" value={r1(r.protein)} unit="g" />
        <Kpi label="平均水分" value={r0(r.water)} unit="ml" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginBottom: 10 }}>
        <Kpi label="トレーニング" value={r.trainingDays} unit={`日・${r0(r.trainingKcal)}kcal`} />
        <Kpi label="睡眠の質" value={r1(r.sleep)} unit="/5" />
        <Kpi label="メンタル" value={r1(r.mental)} unit="/5" />
        <Kpi label="体重の変化" value={r.weightDiff == null ? "—" : `${r.weightDiff > 0 ? "+" : ""}${r1(r.weightDiff)}`} unit="kg" />
      </div>

      <div style={{ fontSize: 10, color: C.dim, marginBottom: 4 }}>摂取カロリー（日ごと）</div>
      <div style={{ height: 150 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={r.kcalChart} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={C.cardBorder} vertical={false} />
            <XAxis dataKey="date" tick={axis} axisLine={{ stroke: C.cardBorder }} tickLine={false} interval={period === "week" ? 0 : 4} />
            <YAxis tick={axis} axisLine={false} tickLine={false} width={40} />
            <Tooltip contentStyle={tip} cursor={{ fill: "#ffffff0a" }} />
            {target && <ReferenceLine y={target} stroke={C.gold} strokeDasharray="4 4" />}
            <Bar dataKey="kcal" name="kcal" fill={C.gold} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={{ fontSize: 10, color: C.dim, margin: "10px 0 4px" }}>体調（1〜5）</div>
      <div style={{ height: 160 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={r.condChart} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={C.cardBorder} vertical={false} />
            <XAxis dataKey="date" tick={axis} axisLine={{ stroke: C.cardBorder }} tickLine={false} interval={period === "week" ? 0 : 4} />
            <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} tick={axis} axisLine={false} tickLine={false} width={24} />
            <Tooltip contentStyle={tip} />
            <Legend wrapperStyle={{ fontSize: 10.5 }} />
            <Line type="monotone" dataKey="睡眠" stroke="#6C8EBF" strokeWidth={2} dot={{ r: 2.5 }} connectNulls />
            <Line type="monotone" dataKey="メンタル" stroke="#4E8C6E" strokeWidth={2} dot={{ r: 2.5 }} connectNulls />
            <Line type="monotone" dataKey="だるさ" stroke="#B2483A" strokeWidth={2} dot={{ r: 2.5 }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {r.weightChart.length >= 2 && (
        <>
          <div style={{ fontSize: 10, color: C.dim, margin: "10px 0 4px" }}>体重（kg・全期間）</div>
          <div style={{ height: 150 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={r.weightChart} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={C.cardBorder} vertical={false} />
                <XAxis dataKey="date" tick={axis} axisLine={{ stroke: C.cardBorder }} tickLine={false} />
                <YAxis tick={axis} axisLine={false} tickLine={false} domain={["auto", "auto"]} width={40} />
                <Tooltip contentStyle={tip} />
                <Line type="monotone" dataKey="weight" name="体重" stroke={C.gold} strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}

// memberId: data:<memberId>:* の ID（会員ID か line_<LINEのuserId>）
// pid: 連携済みの会員ID（未連携なら null）。lineUserId: 公式LINEの userId（あれば）
// showWorkouts: 会員詳細には別に一覧があるので、未連携の人のときだけ true にする（食事はどちらも別に一覧がある）
export function MemberRecords({ memberId, pid = null, lineUserId = null, profile = null, showWorkouts = false }) {
  const [d, setD] = useState(null);
  const [photos, setPhotos] = useState(null);
  const reload = () => {
    loadRecords(memberId).then(setD);
    loadPhotos(pid, lineUserId, profile).then(setPhotos);
  };
  useEffect(reload, [memberId, pid, lineUserId, profile?.beforePhoto, profile?.afterPhoto]);

  if (!d) return <div style={{ fontSize: 11.5, color: C.dim }}>読み込み中…</div>;

  const conditions = [...d.conditions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
  const growth = [...d.growth].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
  const monthly = [...d.monthly].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  const workouts = [...d.workouts].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
  const anyPhoto = photos && Object.values(photos).some(Boolean);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 10.5, color: C.dim }}>アプリ・公式LINEの記録をまとめて表示しています</div>
        <button onClick={reload} style={{ background: "none", border: `1px solid ${C.cardBorder}`, color: C.dim, borderRadius: 20, padding: "4px 10px", fontSize: 10.5, cursor: "pointer" }}>再読み込み</button>
      </div>

      <Label>レポート</Label>
      <Report d={d} profile={profile} />

      <Label>体調の記録（直近10日）</Label>
      {conditions.length === 0 ? <Empty /> : conditions.map(c => {
        const s = c.sleep && c.mental ? conditionStatus({ sleep: Number(c.sleep), mental: Number(c.mental), morningFatigue: Number(c.morningFatigue) || 3, bowel: Number(c.bowel) || 0, sleepHours: c.sleepHours }) : null;
        return (
          <div key={c.id || c.date} style={row}>
            <span>{md(c.date)} {s && <span style={{ color: C.gold, marginLeft: 6 }}>{s.label}</span>}</span>
            <span style={mono}>
              睡眠{c.sleepHours != null ? `${c.sleepHours}h・` : ""}質{c.sleep ?? "—"} メンタル{c.mental ?? "—"} だるさ{c.morningFatigue ?? "—"}
              {c.bowel != null && BOWEL_OPTIONS[c.bowel] ? ` 便通${BOWEL_OPTIONS[c.bowel].slice(0, 1)}` : ""}
            </span>
          </div>
        );
      })}

      {showWorkouts && (
        <>
          <Label>トレーニング（直近10件）</Label>
          {workouts.length === 0 ? <Empty /> : workouts.map(w => (
            <div key={w.id} style={row}>
              <span>{md(w.date)} {w.exercise}</span>
              <span style={mono}>{w.reps}{w.unit === "sec" ? "秒" : "回"}×{w.weight}kg{w.calories ? `・${w.calories}kcal` : ""}</span>
            </div>
          ))}
        </>
      )}

      <Label>成長・測定（体重・体脂肪・筋肉量）</Label>
      {growth.length === 0 ? <Empty /> : growth.map(g => (
        <div key={g.id || g.date} style={row}>
          <span>{md(g.date)}</span>
          <span style={mono}>
            {g.weight != null ? `${g.weight}kg` : ""}{g.bodyFat != null ? `・体脂肪${g.bodyFat}%` : ""}{g.muscleMass != null ? `・筋肉${g.muscleMass}kg` : ""}
          </span>
        </div>
      ))}
      {monthly.length > 0 && (
        <>
          <Label>月次測定</Label>
          {monthly.map(m => (
            <React.Fragment key={m.id || m.date}>
            <div style={row}>
              <span>{md(m.date)}</span>
              <span style={mono}>
                {m.situps != null ? `腹筋${m.situps}回 ` : ""}{m.benchMax != null ? `ベンチ${m.benchMax}kg ` : ""}{m.hipThrust != null ? `ヒップ${m.hipThrust}kg ` : ""}{m.bridge ? "ブリッジ○ " : ""}{m.photoSubmitted ? "写真提出○" : ""}
              </span>
            </div>
            {m.note && <div style={{ fontSize: 11, color: C.ivory, whiteSpace: "pre-wrap", lineHeight: 1.6, padding: "4px 0 6px", borderBottom: `1px solid ${C.cardBorder}` }}>メモ：{m.note}</div>}
            </React.Fragment>
          ))}
        </>
      )}

      <Label>ビフォーアフター写真（前・横・後ろ）</Label>
      {!photos ? <div style={{ fontSize: 11.5, color: C.dim }}>読み込み中…</div> : !anyPhoto ? <Empty /> : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, maxWidth: 420 }}>
          {PHOTO_SLOTS.map(([slot, label]) => (
            <div key={slot} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 10, color: C.dim, marginBottom: 4 }}>{label}</div>
              {photos[slot] ? (
                <div style={{ width: "100%", aspectRatio: "3 / 4", borderRadius: 4, background: `url(${photos[slot]}) center / cover`, border: `1px solid ${C.cardBorder}` }} />
              ) : (
                <div style={{ width: "100%", aspectRatio: "3 / 4", borderRadius: 4, border: `1px dashed ${C.cardBorder}`, display: "grid", placeItems: "center", fontSize: 10, color: C.dim }}>未登録</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
