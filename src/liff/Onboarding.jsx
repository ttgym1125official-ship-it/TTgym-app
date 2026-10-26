import React, { useState } from "react";
import { Check, ChevronLeft, Dumbbell, Monitor, MoveHorizontal, PersonStanding, TrendingDown, TrendingUp, Zap } from "lucide-react";
import { ACTIVITY, GOALS, calcTargets } from "./nutrients.js";
import { comma } from "./ui.jsx";

const ACTIVITY_ICON = { low: Monitor, normal: PersonStanding, high: Dumbbell, veryHigh: Zap };
const GOAL_ICON = { lose: TrendingDown, keep: MoveHorizontal, gain: TrendingUp };

const STEPS = [
  { eyebrow: "STEP 1 · ABOUT YOU", title: "あなたについて\n教えてください", lead: "性別と年齢から、基礎代謝を計算します。" },
  { eyebrow: "STEP 2 · BODY", title: "いまの体の数値を\n入力してください", lead: "体脂肪率と基礎代謝は任意です。体組成計の値があれば入れると、目標値がより正確になります（基礎代謝は空欄なら自動計算）。" },
  { eyebrow: "STEP 3 · ACTIVITY", title: "ふだんの活動量は\nどれに近いですか？", lead: "1日の消費カロリーの計算に使います。" },
  { eyebrow: "STEP 4 · GOAL", title: "目指すゴールを\n選んでください", lead: "カロリーとタンパク質の目標が変わります。" },
];

function Radio({ on }) {
  return <span className={`lf-radio${on ? " on" : ""}`}>{on && <Check size={16} strokeWidth={3} />}</span>;
}

function NumField({ label, unit, value, onChange, optional }) {
  return (
    <label className="lf-field">
      <div className="lab">{label}{optional && <span className="lf-opt-tag">任意</span>}</div>
      <div className="in">
        <input inputMode="decimal" placeholder="—" value={value ?? ""} onChange={e => onChange(e.target.value.replace(/[^\d.]/g, ""))} />
        <span className="u">{unit}</span>
      </div>
    </label>
  );
}

export default function Onboarding({ initial, onSave, onDone }) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(null);
  const [p, setP] = useState(() => ({
    sex: initial?.sex || "male",
    age: initial?.age ?? "",
    height: initial?.height ?? "",
    weight: initial?.weight ?? "",
    bodyFat: initial?.bodyFat ?? "",
    bmr: initial?.bmr ?? "",
    activity: initial?.activity || "",
    goal: initial?.goal || "",
    targetWeight: initial?.targetWeight ?? "",
  }));
  const set = (k, v) => setP(prev => ({ ...prev, [k]: v }));

  const valid = [
    Number(p.age) >= 10 && Number(p.age) <= 100,
    Number(p.height) >= 100 && Number(p.weight) >= 25,
    !!p.activity,
    !!p.goal,
  ][step];

  const submit = async () => {
    setSaving(true);
    setError("");
    try {
      const profile = {
        ...p,
        age: Number(p.age), height: Number(p.height), weight: Number(p.weight),
        bodyFat: p.bodyFat ? Number(p.bodyFat) : null, bmr: p.bmr ? Number(p.bmr) : null,
        targetWeight: p.targetWeight ? Number(p.targetWeight) : null,
      };
      await onSave(profile);
      setSaved(calcTargets(profile));
    } catch (e) {
      setError(e.message || "保存できませんでした");
    } finally {
      setSaving(false);
    }
  };

  if (saved) {
    return (
      <div className="lf"><div className="lf-wrap lf-ob">
        <div className="lf-result">
          <img src="/liff/logo.png" alt="TTGYM" style={{ width: 72, height: 72 }} />
          <div className="lf-ob-eyebrow" style={{ marginTop: 24 }}>YOUR DAILY TARGET</div>
          <div className="kc">{comma(saved.kcal)}<small>kcal</small></div>
          <div className="lf-card" style={{ marginTop: 26, display: "grid", gridTemplateColumns: "repeat(3,1fr)", textAlign: "center" }}>
            {[["たんぱく質", saved.p], ["脂質", saved.f], ["炭水化物", saved.c]].map(([l, v]) => (
              <div key={l}><div style={{ fontSize: 13, color: "var(--sub)", fontWeight: 700 }}>{l}</div><div style={{ fontSize: 24, fontWeight: 800, marginTop: 4 }}>{v}<small style={{ fontSize: 13, color: "var(--sub)" }}>g</small></div></div>
            ))}
          </div>
          <p className="lead" style={{ marginTop: 24 }}>目標を設定しました。<br />LINEで食事の写真を送ると、この目標に対する過不足をお伝えします。</p>
          <button className="lf-primary" onClick={onDone}>ダッシュボードを見る</button>
        </div>
      </div></div>
    );
  }

  const s = STEPS[step];
  return (
    <div className="lf"><div className="lf-wrap lf-ob" style={{ paddingBottom: 0 }}>
      <div className="lf-ob-top">
        <div>{step > 0 && <button onClick={() => setStep(step - 1)} aria-label="戻る"><ChevronLeft size={28} /></button>}</div>
        <div className="brand"><img src="/liff/logo.png" alt="" /><span>TTGYM</span></div>
        <div className="cnt">{step + 1} / 4</div>
      </div>
      <div className="lf-ob-prog">{STEPS.map((_, i) => <div key={i} className={i <= step ? "on" : ""} />)}</div>

      <div className="lf-ob-eyebrow">{s.eyebrow}</div>
      <h1>{s.title}</h1>
      <p className="lead">{s.lead}</p>

      {step === 0 && (
        <>
          <div className="glab">性別</div>
          <div className="lf-sex">
            {[["male", "男性"], ["female", "女性"]].map(([v, l]) => (
              <button key={v} className={`lf-sexbtn${p.sex === v ? " on" : ""}`} onClick={() => set("sex", v)}>{l}<Radio on={p.sex === v} /></button>
            ))}
          </div>
          <NumField label="年齢" unit="歳" value={p.age} onChange={v => set("age", v)} />
        </>
      )}

      {step === 1 && (
        <>
          <div className="lf-grid2">
            <NumField label="身長" unit="cm" value={p.height} onChange={v => set("height", v)} />
            <NumField label="体重" unit="kg" value={p.weight} onChange={v => set("weight", v)} />
          </div>
          <div className="glab">わかれば入力<span className="lf-opt-tag">任意</span></div>
          <div className="lf-grid2">
            <NumField label="体脂肪率" unit="%" value={p.bodyFat} onChange={v => set("bodyFat", v)} />
            <NumField label="基礎代謝" unit="kcal" value={p.bmr} onChange={v => set("bmr", v)} />
          </div>
        </>
      )}

      {step === 2 && Object.entries(ACTIVITY).map(([id, a]) => {
        const Icon = ACTIVITY_ICON[id];
        return (
          <button key={id} className={`lf-choice${p.activity === id ? " on" : ""}`} onClick={() => set("activity", id)}>
            <span className="ic"><Icon size={24} /></span>
            <span><div className="t">{a.label}</div><div className="d">{a.desc}</div></span>
            <Radio on={p.activity === id} />
          </button>
        );
      })}

      {step === 3 && (
        <>
          {Object.entries(GOALS).map(([id, g]) => {
            const Icon = GOAL_ICON[id];
            return (
              <button key={id} className={`lf-choice${p.goal === id ? " on" : ""}`} onClick={() => set("goal", id)}>
                <span className="ic"><Icon size={24} /></span>
                <span><div className="t">{g.label}</div><div className="d">{g.desc}</div></span>
                <Radio on={p.goal === id} />
              </button>
            );
          })}
          <div style={{ marginTop: 20 }}><NumField label="目標体重" unit="kg" optional value={p.targetWeight} onChange={v => set("targetWeight", v)} /></div>
        </>
      )}

      {error && <p style={{ color: "var(--red-text)", fontSize: 14, marginTop: 16 }}>{error}</p>}
      <div className="lf-ob-bottom">
        <button className="lf-primary" disabled={!valid || saving} onClick={() => (step < 3 ? setStep(step + 1) : submit())}>
          {step < 3 ? "次へ" : saving ? "計算中…" : "目標を計算する"}
        </button>
        <p>入力内容は栄養目標の計算にのみ使用します</p>
      </div>
    </div></div>
  );
}
