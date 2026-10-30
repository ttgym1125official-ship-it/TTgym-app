// 公式LINEの「体調・トレーニング管理」「My成長・測定結果」の中身。
// 内容と記録の形はTTGYMアプリ（App.jsx の各タブ）と同じで、見た目だけダッシュボードに合わせて作り直したもの。
// 記録は data:<会員ID>:<項目> に保存するので、アプリ・管理画面とそのまま共有される。
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Check, ChevronDown, LoaderCircle, Trash2 } from "lucide-react";
import {
  BOWEL_OPTIONS, SLEEP_LEVELS, FATIGUE_LEVELS, MENTAL_LEVELS, MEAL_AMOUNTS, AGING_NUTRIENTS, AGING_PRINCIPLES,
  REJUVENATION_TARGETS, COMMENT_TYPES, NUTRIENT_FOOD_ADVICE, SODIUM_ADVICE, conditionStatus, workoutCalories,
} from "../careData.js";
import { fileToCompressedDataUrl } from "../imageUtils.js";
import { fetchData, fetchGoal, post, isDemo } from "./api.js";
import { addDays, jstToday, md } from "./ui.jsx";
import { WeightChart } from "./History.jsx";
import ReportPanel from "./Report.jsx";

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const KEYS = ["meals", "water", "conditions", "growth", "workouts", "monthly", "sessions", "personalLogs", "comments"];
const EMPTY = { water: {} };
const num = v => (v === "" || v == null ? null : Number(v));
const signed = v => (v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(1)}`);

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

// ── 共通の部品 ──
function Sec({ title, right, first }) {
  return <div className="lf-sec" style={first ? { marginTop: 0 } : undefined}><h2>{title}</h2>{right}</div>;
}

function CheckRow({ label, on, onClick, note }) {
  return (
    <>
      <button className={`lf-check${on ? " on" : ""}`} onClick={onClick}>
        <span>{label}</span>
        <i>{on && <Check size={15} strokeWidth={3} />}</i>
      </button>
      {note && <div className="lf-check-note">{note}</div>}
    </>
  );
}

function Scale({ levels, value, onChange, caption }) {
  return (
    <>
      <div className="lf-scale">
        {levels.map(l => <button key={l.n} className={value === l.n ? "on" : ""} onClick={() => onChange(l.n)}>{l.n}</button>)}
      </div>
      <div className="lf-scale-cap">{caption}</div>
    </>
  );
}

function Q({ label, children }) {
  return <div className="lf-q"><div className="lab">{label}</div>{children}</div>;
}

const Empty = ({ text }) => <div className="lf-card lf-hint" style={{ margin: 0, textAlign: "center", lineHeight: 1.8 }}>{text}</div>;

// ── データの読み書き ──
// 最新を読み直してから変更して保存する（アプリ・管理画面・LINEのダッシュボードと同時に使っても消えないように）
function useCareData(toast) {
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
    })().catch(e => setError(e.blocked ? "ご利用を停止しています。TTGYMスタッフまでお問い合わせください。" : `${e.message || "読み込めませんでした"}　LINEアプリから開き直してください。`));
  }, []);

  const mutate = async (key, fn, msg) => {
    const { id, linked } = state;
    let latest = state.data[key];
    try {
      const r = await window.storage.get(`data:${id}:${key}`, true);
      if (r) latest = JSON.parse(r.value);
    } catch (e) { /* 読めなければ手元の値を使う */ }
    const next = fn(latest);
    setState(s => ({ ...s, data: { ...s.data, [key]: next } }));
    try {
      await window.storage.set(`data:${id}:${key}`, JSON.stringify(next), true);
      if (linked) {
        const r = await window.storage.get(`profile:${id}`, true);
        if (r) await window.storage.set(`profile:${id}`, JSON.stringify({ ...JSON.parse(r.value), lastActivityAt: new Date().toISOString() }), true);
      }
      if (msg) toast(msg);
    } catch (e) {
      toast("保存できませんでした");
    }
  };
  // トレーナーが管理画面から追加するもの（コメント・成長記録・パーソナル記録）を読み直す
  const refresh = async keys => {
    if (!state) return;
    const rs = await Promise.all(keys.map(k => window.storage.get(`data:${state.id}:${k}`, true).catch(() => null)));
    setState(s => ({ ...s, data: { ...s.data, ...Object.fromEntries(rs.map((r, i) => [keys[i], r ? JSON.parse(r.value) : (EMPTY[keys[i]] ?? [])])) } }));
  };
  return { state, error, mutate, refresh };
}

export default function Care({ page, tab, toast }) {
  const { state, error, mutate, refresh } = useCareData(toast);
  useEffect(() => {
    if (state && ["growth", "report", "comments"].includes(tab)) refresh(["growth", "comments", "personalLogs"]).catch(() => {});
  }, [tab, !!state]);

  if (error) return <Empty text={error} />;
  if (!state) return <div className="lf-center" style={{ minHeight: "30vh" }}><LoaderCircle className="lf-spin" size={26} /></div>;
  const d = state.data;
  if (page === "condition") {
    return tab === "training"
      ? <TrainingView workouts={d.workouts} sessions={d.sessions} mutate={mutate} />
      : <ConditionView conditions={d.conditions} comments={d.comments} mutate={mutate} />;
  }
  if (tab === "report") return <ReportPanel />;
  if (tab === "comments") return <CommentsView comments={d.comments} meals={d.meals} />;
  return <GrowthView growth={d.growth} monthly={d.monthly} mutate={mutate} toast={toast} />;
}

// ── 体調管理 ──
function ConditionView({ conditions, comments, mutate }) {
  const today = jstToday();
  const ex = conditions.find(c => c.date === today);
  const [f, setF] = useState({
    bowel: ex?.bowel ?? 2, sunAM: ex?.sunAM ?? false, bath10: ex?.bath10 ?? false, exercise: ex?.exercise ?? false,
    digitalDetox: ex?.digitalDetox ?? false, sleepHours: ex?.sleepHours ?? "", sleep: ex?.sleep ?? 3,
    preSleepMeal: ex?.preSleepMeal ?? "適量", morningFatigue: ex?.morningFatigue ?? 2, mental: ex?.mental ?? 3,
    mealHoursBeforeSleep: ex?.mealHoursBeforeSleep ?? "", agingChecklist: ex?.agingChecklist ?? {},
  });
  const set = patch => setF(prev => ({ ...prev, ...patch }));
  const status = useMemo(() => conditionStatus(f), [f.sleep, f.mental, f.morningFatigue, f.bowel, f.sleepHours]);
  const entry = v => ({
    ...v, id: ex?.id || uid(), date: today,
    sleepHours: num(v.sleepHours), mealHoursBeforeSleep: num(v.mealHoursBeforeSleep),
  });
  const save = (v, msg) => mutate("conditions", p => [entry(v), ...p.filter(c => c.date !== today)], msg);
  // 抗老化・サプリのチェックは押した時点で保存する（アプリと同じ）
  const toggleAging = key => {
    const next = { ...f, agingChecklist: { ...f.agingChecklist, [key]: !f.agingChecklist[key] } };
    setF(next);
    save(next);
  };
  const conditionComments = comments.filter(c => c.type === "condition").sort((a, b) => b.date.localeCompare(a.date));
  const lv = (list, n) => list.find(l => l.n === n);

  return (
    <>
      <Sec title="今日のコンディション" first right={<span className="lf-head-date" style={{ fontSize: 13 }}>{md(today)}</span>} />
      <div className="lf-card">
        <Q label="お通じの状態">
          <div className="lf-chips">
            {BOWEL_OPTIONS.map((o, i) => <button key={o} className={f.bowel === i ? "on" : ""} onClick={() => set({ bowel: i })}>{o}</button>)}
          </div>
        </Q>
        <Q label="睡眠時間">
          <label className="lf-mini lf-mini-inline"><input inputMode="decimal" placeholder="7.5" value={f.sleepHours} onChange={e => set({ sleepHours: e.target.value })} /><em>時間</em></label>
        </Q>
        <Q label="睡眠の質（神経系回復度）">
          <Scale levels={SLEEP_LEVELS} value={f.sleep} onChange={n => set({ sleep: n })} caption={`${lv(SLEEP_LEVELS, f.sleep)?.label} — ${lv(SLEEP_LEVELS, f.sleep)?.desc}`} />
        </Q>
        <Q label="就寝の何時間前に最後の食事をしましたか？">
          <label className="lf-mini lf-mini-inline"><input inputMode="decimal" placeholder="3" value={f.mealHoursBeforeSleep} onChange={e => set({ mealHoursBeforeSleep: e.target.value })} /><em>時間前</em></label>
        </Q>
        <Q label="睡眠前の食事量">
          <div className="lf-chips eq">
            {MEAL_AMOUNTS.map(o => <button key={o} className={f.preSleepMeal === o ? "on" : ""} onClick={() => set({ preSleepMeal: o })}>{o}</button>)}
          </div>
        </Q>
        <Q label="起床時の身体のだるさ">
          <Scale levels={FATIGUE_LEVELS} value={f.morningFatigue} onChange={n => set({ morningFatigue: n })} caption={lv(FATIGUE_LEVELS, f.morningFatigue)?.label} />
        </Q>
        <Q label="ストレス・メンタルスコア（5が最も良好）">
          <Scale levels={MENTAL_LEVELS} value={f.mental} onChange={n => set({ mental: n })} caption={lv(MENTAL_LEVELS, f.mental)?.label} />
        </Q>
      </div>

      <Sec title="朝の実践チェック" />
      <div className="lf-card">
        <CheckRow label="朝、日光を浴びましたか？" on={f.sunAM} onClick={() => set({ sunAM: !f.sunAM })} />
        <CheckRow label="湯船に10分以上浸かりましたか？" on={f.bath10} onClick={() => set({ bath10: !f.bath10 })} />
        <CheckRow label="運動・ストレッチはできましたか？" on={f.exercise} onClick={() => set({ exercise: !f.exercise })} />
        <CheckRow label="就寝1〜2時間前にデジタルデトックス（スマホ断ち）はできましたか？" on={f.digitalDetox} onClick={() => set({ digitalDetox: !f.digitalDetox })} />
      </div>

      <div className="lf-status">
        <div className="eb">TODAY'S STATUS</div>
        <div className="t">{status.label}</div>
        <p>{status.advice}</p>
        {status.nextStep && <div className="next"><b>次のステップ</b>{status.nextStep}</div>}
      </div>
      <button className="lf-primary" style={{ marginTop: 16 }} onClick={() => save(f, "体調を記録しました")}>今日の記録を保存</button>

      <Sec title="細胞若返り・抗老化チェック" />
      <div className="lf-card">
        {AGING_PRINCIPLES.map(p => <CheckRow key={p.key} label={p.label} note={p.note} on={!!f.agingChecklist[p.key]} onClick={() => toggleAging(p.key)} />)}
      </div>

      {conditionComments.length > 0 && (
        <>
          <Sec title="トレーナーからのコメント" />
          {conditionComments.slice(0, 5).map(c => <CommentCard key={c.id} c={c} />)}
        </>
      )}

      <Sec title="補いたい栄養素（サプリメント）" />
      <details className="lf-card lf-fold">
        <summary>今日摂ったものにチェック<ChevronDown size={18} /></summary>
        <p className="lf-hint" style={{ margin: "0 0 10px", lineHeight: 1.8 }}>食事だけでは摂りにくく、サプリメントなどで補いたい成分です。カッコ内は1日の目安です。</p>
        {["アミノ酸", "ビタミン", "ミネラル", "追加提案"].map(cat => (
          <div key={cat} style={{ marginBottom: 10 }}>
            <div className="lf-cat">{cat}</div>
            {AGING_NUTRIENTS.filter(n => n.category === cat).map(n => (
              <CheckRow key={n.key} label={`${n.label}（${n.range}）`} on={!!f.agingChecklist[n.key]} onClick={() => toggleAging(n.key)} />
            ))}
          </div>
        ))}
      </details>
    </>
  );
}

// ── トレーニング ──
function TrainingView({ workouts, sessions, mutate }) {
  const today = jstToday();
  const ses = sessions.find(s => s.date === today);
  const [personal, setPersonal] = useState(ses?.personalTraining ?? false);
  const [comment, setComment] = useState(ses?.freeComment ?? "");
  const [photo, setPhoto] = useState(ses?.freePhoto ?? null);
  const [busy, setBusy] = useState(false);
  const [w, setW] = useState({ exercise: "", unit: "reps", count: "", weight: "" });
  const photoRef = useRef(null);

  const saveSession = (patch, msg) => mutate("sessions", p => [
    { ...(p.find(x => x.date === today) || {}), id: ses?.id || uid(), date: today, personalTraining: personal, freeComment: comment, freePhoto: photo, ...patch },
    ...p.filter(x => x.date !== today),
  ], msg);
  const addWorkout = () => {
    if (!w.exercise.trim() || !w.count) return;
    const count = Number(w.count), weight = Number(w.weight) || 0;
    mutate("workouts", p => [{ id: uid(), date: today, exercise: w.exercise.trim(), unit: w.unit, reps: count, weight, calories: workoutCalories(w.unit, count, weight) }, ...p], "トレーニングを記録しました");
    setW({ ...w, exercise: "", count: "", weight: "" });
  };
  const grouped = useMemo(() => {
    const map = {};
    for (const x of workouts) (map[x.date] = map[x.date] || []).push(x);
    return Object.entries(map).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 8);
  }, [workouts]);
  const notes = sessions.filter(s => s.freeComment || s.freePhoto).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);

  return (
    <>
      <Sec title="今日のトレーニング" first right={<span className="lf-head-date" style={{ fontSize: 13 }}>{md(today)}</span>} />
      <div className="lf-card">
        <CheckRow label="パーソナルトレーニングを実施した" on={personal} onClick={() => { setPersonal(!personal); saveSession({ personalTraining: !personal }, !personal ? "パーソナルを記録しました" : ""); }} />
        <input className="lf-input" placeholder="種目（例：スクワット）" value={w.exercise} onChange={e => setW({ ...w, exercise: e.target.value })} style={{ marginTop: 8 }} />
        <div className="lf-chips eq" style={{ margin: "10px 0" }}>
          {[["reps", "回数"], ["sec", "秒数"]].map(([k, l]) => <button key={k} className={w.unit === k ? "on" : ""} onClick={() => setW({ ...w, unit: k })}>{l}</button>)}
        </div>
        <div className="lf-grid2" style={{ marginBottom: 12 }}>
          <label className="lf-mini"><span>{w.unit === "reps" ? "回数" : "秒数"}</span><input inputMode="numeric" placeholder="0" value={w.count} onChange={e => setW({ ...w, count: e.target.value })} /><em>{w.unit === "reps" ? "回" : "秒"}</em></label>
          <label className="lf-mini"><span>重量（自重は0）</span><input inputMode="decimal" placeholder="0" value={w.weight} onChange={e => setW({ ...w, weight: e.target.value })} /><em>kg</em></label>
        </div>
        <button className="lf-primary" disabled={!w.exercise.trim() || !w.count} onClick={addWorkout}>記録する</button>
        <p className="lf-hint" style={{ margin: "10px 2px 0" }}>重量と回数から消費カロリーの目安を表示します。</p>
      </div>

      <Sec title="自由記入・写真" />
      <div className="lf-card">
        <p className="lf-hint" style={{ margin: "0 0 10px", lineHeight: 1.8 }}>入力が面倒なときは、今日の内容や感想を書いたり、写真を送るだけでもOKです。トレーナーが確認して返信することもあります。</p>
        <textarea className="lf-textarea" rows={4} placeholder="例：今日は脚トレ。スクワット中心で少しきつかったです。" value={comment} onChange={e => setComment(e.target.value)} />
        <button className="lf-dashed" onClick={() => photoRef.current?.click()}>
          {busy ? <LoaderCircle className="lf-spin" size={18} /> : <Camera size={18} />}{photo ? "写真を変更" : "写真を追加"}
        </button>
        <input ref={photoRef} type="file" accept="image/*" style={{ display: "none" }} onChange={async e => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setBusy(true);
          try { setPhoto(await fileToCompressedDataUrl(file)); } catch (err) { /* 読めない画像は無視 */ }
          setBusy(false);
        }} />
        {photo && <img src={photo} alt="" className="lf-preview" />}
        <button className="lf-primary" style={{ marginTop: 12 }} onClick={() => saveSession({}, "保存しました")}>この内容を保存する</button>
      </div>

      <Sec title="トレーニング履歴" />
      {grouped.length === 0 ? <Empty text="まだ記録がありません" /> : grouped.map(([date, items]) => (
        <div key={date} className="lf-card" style={{ marginBottom: 12 }}>
          <div className="lf-date">{md(date)}</div>
          {items.map(x => (
            <div key={x.id} className="lf-row">
              <span className="n">{x.exercise}</span>
              <span className="v">{x.reps}{x.unit === "sec" ? "秒" : "回"}×{x.weight}kg{x.calories ? ` ・約${x.calories}kcal` : ""}</span>
              <button aria-label="削除" onClick={() => window.confirm("この記録を削除しますか？") && mutate("workouts", p => p.filter(y => y.id !== x.id), "削除しました")}><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
      ))}

      {notes.length > 0 && (
        <>
          <Sec title="コメント・写真の履歴" />
          {notes.map(s => (
            <div key={s.id} className="lf-card" style={{ marginBottom: 12 }}>
              <div className="lf-date">{md(s.date)}</div>
              {s.freeComment && <div className="lf-text">{s.freeComment}</div>}
              {s.freePhoto && <img src={s.freePhoto} alt="" className="lf-preview" />}
            </div>
          ))}
        </>
      )}
    </>
  );
}

// ── 成長 ──
async function readInBody(file) {
  const dataUrl = await fileToCompressedDataUrl(file, 1600, 0.85);
  const [, mediaType, data] = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  const { text } = await post("ai", {
    image: { mediaType, data },
    prompt: `これはInBody(体組成計)の結果用紙の写真です。体重(kg)、体脂肪率(%)、骨格筋量(kg)を読み取ってください。
数字の桁数や小数点の位置を1文字ずつ慎重に確認し、自信が持てない場合は null にしてください。
JSON以外は一切含めず、次の形式のみを返してください: {"weight": number|null, "bodyFat": number|null, "muscleMass": number|null}`,
  });
  const r = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
  const ok = (v, lo, hi) => (Number.isFinite(Number(v)) && Number(v) >= lo && Number(v) <= hi ? String(Number(v)) : "");
  return { weight: ok(r.weight, 20, 300), bodyFat: ok(r.bodyFat, 2, 70), muscle: ok(r.muscleMass, 10, 150) };
}

function GrowthView({ growth, monthly, mutate, toast }) {
  const [goal, setGoal] = useState(null);
  const [v, setV] = useState({ weight: "", bodyFat: "", muscle: "" });
  const [m, setM] = useState({ situps: "", benchMax: "", hipThrust: "", bridge: false, photoSubmitted: false, note: "" });
  const [reading, setReading] = useState(false);
  const fileRef = useRef(null);
  useEffect(() => { fetchGoal().then(g => setGoal(g.goal)).catch(() => {}); }, []);

  const sorted = useMemo(() => [...growth].sort((a, b) => a.date.localeCompare(b.date)), [growth]);
  const first = sorted[0], latest = sorted[sorted.length - 1];
  const today = jstToday();
  const from = sorted.length ? sorted[0].date : addDays(today, -30);
  const points = sorted.filter(g => g.weight || g.bodyFat).map(g => ({ id: g.id, date: g.date, weight: g.weight, bodyFat: g.bodyFat }));

  const save = () => {
    if (!v.weight && !v.bodyFat && !v.muscle) return;
    mutate("growth", p => [{ id: uid(), date: today, weight: num(v.weight), bodyFat: num(v.bodyFat), muscleMass: num(v.muscle) }, ...p], "記録しました");
    setV({ weight: "", bodyFat: "", muscle: "" });
  };
  const saveMonthly = () => {
    const note = m.note.trim();
    if (!m.situps && !m.benchMax && !m.hipThrust && !m.bridge && !m.photoSubmitted && !note) return;
    mutate("monthly", p => [{ id: uid(), date: today, situps: num(m.situps), benchMax: num(m.benchMax), hipThrust: num(m.hipThrust), bridge: m.bridge, photoSubmitted: m.photoSubmitted, note }, ...p], "月次測定を記録しました");
    setM({ situps: "", benchMax: "", hipThrust: "", bridge: false, photoSubmitted: false, note: "" });
  };

  return (
    <>
      {(goal?.targetWeight || goal?.targetBodyFat) && (
        <div className="lf-goalbar">
          <span>目標</span>
          {goal.targetWeight && <b>{goal.targetWeight}<small>kg</small></b>}
          {goal.targetBodyFat && <b>{goal.targetBodyFat}<small>%</small></b>}
        </div>
      )}

      <Sec title="体組成を記録" first={!(goal?.targetWeight || goal?.targetBodyFat)} />
      <div className="lf-card">
        <button className="lf-dashed" style={{ marginTop: 0 }} disabled={reading} onClick={() => fileRef.current?.click()}>
          {reading ? <LoaderCircle className="lf-spin" size={18} /> : <Camera size={18} />}{reading ? "読み取り中…" : "InBody用紙を撮影して自動入力"}
        </button>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={async e => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setReading(true);
          try {
            const r = await readInBody(file);
            if (!r.weight && !r.bodyFat && !r.muscle) toast("数値を読み取れませんでした。手入力してください");
            setV(prev => ({ weight: r.weight || prev.weight, bodyFat: r.bodyFat || prev.bodyFat, muscle: r.muscle || prev.muscle }));
          } catch (err) {
            toast(isDemo ? "デモ表示では読み取りできません" : "読み取りに失敗しました。手入力してください");
          }
          setReading(false);
        }} />
        <div className="lf-mini3">
          {[["weight", "体重", "kg"], ["bodyFat", "体脂肪率", "%"], ["muscle", "骨格筋量", "kg"]].map(([k, l, u]) => (
            <label key={k} className="lf-mini"><span>{l}</span><input inputMode="decimal" placeholder="—" value={v[k]} onChange={e => setV({ ...v, [k]: e.target.value })} /><em>{u}</em></label>
          ))}
        </div>
        <button className="lf-primary" style={{ marginTop: 14 }} disabled={!v.weight && !v.bodyFat && !v.muscle} onClick={save}>記録を保存</button>
      </div>

      {first && latest && first.id !== latest.id && (
        <>
          <Sec title="はじめから今まで" />
          <div className="lf-card lf-change">
            {[["体重", first.weight, latest.weight, "kg"], ["体脂肪率", first.bodyFat, latest.bodyFat, "%"], ["骨格筋量", first.muscleMass, latest.muscleMass, "kg"]].map(([l, a, b, u]) => (
              <div key={l}>
                <div className="l">{l}</div>
                <div className="v">{b ?? "—"}<small>{b != null ? u : ""}</small></div>
                <div className="d">{a ?? "—"} → {b ?? "—"}{a != null && b != null ? `（${signed(b - a)}）` : ""}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {points.length >= 2 && (
        <>
          <Sec title="体重・体脂肪率の推移" />
          <div className="lf-card" style={{ padding: "16px 10px 6px" }}>
            <WeightChart points={points} from={from} to={today} show={{ weight: true, fat: true }} />
            <div className="lf-legend"><span><i style={{ background: "var(--blue)" }} />体重</span><span><i style={{ background: "var(--teal)" }} />体脂肪率</span></div>
          </div>
        </>
      )}

      <Sec title="月次測定" right={<span className="lf-head-date" style={{ fontSize: 13 }}>目安：月1回</span>} />
      <div className="lf-card">
        <div className="lf-mini3">
          {[["situps", "腹筋1分間", "回"], ["benchMax", "ベンチMAX", "kg"], ["hipThrust", "ヒップスラスト10回", "kg"]].map(([k, l, u]) => (
            <label key={k} className="lf-mini"><span>{l}</span><input inputMode="decimal" placeholder="—" value={m[k]} onChange={e => setM({ ...m, [k]: e.target.value })} /><em>{u}</em></label>
          ))}
        </div>
        <div style={{ marginTop: 12 }}>
          <CheckRow label="ブリッジ／倒立ができるようになった" on={m.bridge} onClick={() => setM({ ...m, bridge: !m.bridge })} />
          <CheckRow label="ボディ写真をトレーナーに提出済み" on={m.photoSubmitted} onClick={() => setM({ ...m, photoSubmitted: !m.photoSubmitted })} />
        </div>
        <div style={{ margin: "12px 0 6px", fontSize: 13, fontWeight: 700, color: "var(--sub)" }}>メモ</div>
        <textarea className="lf-textarea" rows={3} placeholder="例：フォームが安定してきた。姿勢・柔軟性・気づいたことなど" value={m.note} onChange={e => setM({ ...m, note: e.target.value })} />
        <button className="lf-primary" style={{ marginTop: 12 }} onClick={saveMonthly}>月次測定を記録</button>
      </div>
      {[...monthly].sort((a, b) => b.date.localeCompare(a.date)).map(x => (
        <div key={x.id} className="lf-card" style={{ marginTop: 12 }}>
          <div className="lf-row" style={{ borderTop: "none", padding: 0 }}>
            <span className="lf-date" style={{ margin: 0 }}>{md(x.date)}</span>
            <span className="v"><MonthlyTags m={x} /></span>
            <button aria-label="削除" onClick={() => window.confirm("この記録を削除しますか？") && mutate("monthly", p => p.filter(y => y.id !== x.id), "削除しました")}><Trash2 size={15} /></button>
          </div>
          {x.note && <div className="lf-text" style={{ marginTop: 8 }}>{x.note}</div>}
        </div>
      ))}

      <Sec title="記録の履歴" />
      {sorted.length === 0 ? <Empty text="まだ記録がありません" /> : (
        <div className="lf-card">
          {[...sorted].reverse().map(g => (
            <div key={g.id} className="lf-row">
              <span className="n">{md(g.date)}</span>
              <span className="v">{[g.weight && `${g.weight}kg`, g.bodyFat && `${g.bodyFat}%`, g.muscleMass && `筋量${g.muscleMass}kg`].filter(Boolean).join(" ・ ")}</span>
              <button aria-label="削除" onClick={() => window.confirm("この記録を削除しますか？") && mutate("growth", p => p.filter(y => y.id !== g.id), "削除しました")}><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function MonthlyTags({ m }) {
  return [
    m.situps != null && `腹筋 ${m.situps}回`, m.benchMax != null && `BP ${m.benchMax}kg`, m.hipThrust != null && `HT ${m.hipThrust}kg`,
    m.bridge && "ブリッジ／倒立◎", m.photoSubmitted && "写真提出済",
  ].filter(Boolean).join(" ・ ");
}

// ── コメント ──
function CommentCard({ c }) {
  return (
    <div className="lf-card lf-comment">
      <div className="lf-date">{md(c.date)}</div>
      <div className="lf-text">{c.text}</div>
    </div>
  );
}

function CommentsView({ comments, meals }) {
  const [links, setLinks] = useState({});
  useEffect(() => { window.storage?.get("global:supplementLinks", true).then(r => setLinks(r ? JSON.parse(r.value) : {})).catch(() => {}); }, []);
  // 直近7日の食事から、不足しがちな栄養素を自動でチェック（アプリと同じ基準）
  const weekly = useMemo(() => {
    const cutoff = addDays(jstToday(), -6);
    const recent = meals.filter(m => m.date >= cutoff);
    if (recent.length < 3) return null;
    const sum = k => recent.reduce((s, m) => s + (m[k] || 0), 0) / 7;
    return { count: recent.length, results: REJUVENATION_TARGETS.map(n => ({ ...n, value: sum(n.key), ok: n.mode === "max" ? sum(n.key) <= n.max : sum(n.key) >= n.min })) };
  }, [meals]);
  const [open, setOpen] = useState("weekly");

  return (
    <>
      <Sec title="今週の栄養アドバイス" first />
      <div className="lf-card">
        {!weekly ? <p className="lf-hint" style={{ margin: 0, lineHeight: 1.8 }}>食事の記録がもう少し増えると、不足しがちな栄養素を自動で分析します。</p>
          : weekly.results.every(r => r.ok) ? <p style={{ margin: 0, lineHeight: 1.8 }}>直近7日間（{weekly.count}件の食事記録）では、主な栄養素はどれも目安の範囲内でした。素晴らしいペースです！</p>
            : weekly.results.filter(r => !r.ok).map(r => (
              <div key={r.key} className="lf-advice-row">
                <div className="t">{r.label}が{r.key === "sodium" ? "やや多め" : "不足気味"}<span className={`lf-badge ${r.key === "sodium" ? "over" : "low"}`}>{r.key === "sodium" ? "多め" : "不足"}</span></div>
                <div className="s">1日平均 {Math.round(r.value * 10) / 10}{r.unit}（目安 {r.key === "sodium" ? `${r.max}${r.unit}未満` : `${r.min}〜${r.max}${r.unit}`}）</div>
                <div className="b">{r.key === "sodium" ? SODIUM_ADVICE : `おすすめ食材：${NUTRIENT_FOOD_ADVICE[r.key] || ""}`}</div>
                {r.key !== "sodium" && links[r.key] && <a href={links[r.key]} target="_blank" rel="noopener noreferrer">サプリを見る →</a>}
              </div>
            ))}
      </div>

      <Sec title="トレーナーからのコメント" />
      {COMMENT_TYPES.map(({ key, label }) => {
        const list = comments.filter(c => c.type === key).sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || "").localeCompare(a.createdAt || ""));
        const on = open === key;
        return (
          <div key={key} className="lf-card lf-fold2" style={{ marginBottom: 12 }}>
            <button onClick={() => setOpen(on ? null : key)}>
              <span>{label.replace("のコメントとアドバイス", "")}</span>
              <em>{list.length}件</em>
              <ChevronDown size={18} style={{ transform: on ? "rotate(180deg)" : "none" }} />
            </button>
            {on && (list.length === 0
              ? <p className="lf-hint" style={{ margin: "4px 0 0" }}>まだコメントはありません</p>
              : list.map(c => <div key={c.id} className="lf-comment-in"><div className="lf-date">{md(c.date)}</div><div className="lf-text">{c.text}</div></div>))}
          </div>
        );
      })}
    </>
  );
}
