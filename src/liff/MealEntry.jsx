import React, { useMemo, useState } from "react";
import { Droplet, LoaderCircle, Minus, Plus, Search, X } from "lucide-react";
import { STORE_MENU, STORE_CHAINS } from "../storeMenu.js";
import { fmt } from "./nutrients.js";
import { COLORS, comma } from "./ui.jsx";

const LABELS = ["朝食", "昼食", "夕食", "間食"];

function defaultLabel() {
  const h = new Date(Date.now() + 9 * 3600 * 1000).getUTCHours();
  if (h < 10) return "朝食";
  if (h < 15) return "昼食";
  if (h < 17) return "間食";
  return "夕食";
}

function nowTime() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(11, 16);
}

export function AddMealSheet({ date, onClose, onSubmit }) {
  const [mode, setMode] = useState("store");
  const [label, setLabel] = useState(defaultLabel());
  const [cart, setCart] = useState([]);
  const [chain, setChain] = useState("all");
  const [q, setQ] = useState("");
  const [form, setForm] = useState({ name: "", kcal: "", p: "", f: "", c: "" });
  const [saving, setSaving] = useState(false);

  const list = useMemo(() => STORE_MENU.filter(m =>
    (chain === "all" || m.name.startsWith(`${chain}:`)) && (!q || m.name.includes(q))), [chain, q]);

  const autoKcal = Math.round((Number(form.p) || 0) * 4 + (Number(form.f) || 0) * 9 + (Number(form.c) || 0) * 4);
  const addManual = () => {
    if (!form.name.trim()) return;
    setCart(c => [...c, {
      name: form.name.trim(), amount: "", kcal: Number(form.kcal) || autoKcal,
      p: Number(form.p) || 0, f: Number(form.f) || 0, c: Number(form.c) || 0,
    }]);
    setForm({ name: "", kcal: "", p: "", f: "", c: "" });
  };
  const addStore = m => setCart(c => [...c, { name: m.name.replace(": ", " "), amount: "1人前", kcal: m.calories, p: m.protein, f: m.fat, c: m.carb }]);
  const total = cart.reduce((t, i) => ({ kcal: t.kcal + i.kcal, p: t.p + i.p, f: t.f + i.f, c: t.c + i.c }), { kcal: 0, p: 0, f: 0, c: 0 });

  const submit = async () => {
    setSaving(true);
    try {
      await onSubmit({ date, time: nowTime(), label, items: cart });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="lf-sheet-bg" onClick={saving ? undefined : onClose}>
      <div className="lf-sheet" onClick={e => e.stopPropagation()}>
        <h3>食事を追加<button onClick={onClose} disabled={saving}><X size={22} /></button></h3>
        <div className="lf-seg" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <button className={mode === "store" ? "on" : ""} onClick={() => setMode("store")}>お店から選ぶ</button>
          <button className={mode === "manual" ? "on" : ""} onClick={() => setMode("manual")}>自分で入力</button>
        </div>
        <div className="lf-labels">
          {LABELS.map(l => <button key={l} className={label === l ? "on" : ""} onClick={() => setLabel(l)}>{l}</button>)}
        </div>

        {mode === "store" ? (
          <>
            <div className="lf-search"><Search size={18} /><input placeholder="メニューを検索" value={q} onChange={e => setQ(e.target.value)} /></div>
            <div className="lf-tabs" style={{ margin: "12px -20px" }}>
              {["all", ...STORE_CHAINS].map(c => (
                <button key={c} className={`lf-tab${chain === c ? " on" : ""}`} style={{ padding: "9px 16px", fontSize: 13.5 }} onClick={() => setChain(c)}>{c === "all" ? "すべて" : c}</button>
              ))}
            </div>
            <div className="lf-card lf-store">
              {list.map(m => (
                <button key={m.name} className="row" onClick={() => addStore(m)}>
                  <div>
                    <div className="nm">{m.name.split(": ")[1] || m.name}<span>{m.name.split(": ")[0]}</span></div>
                    <div className="pfc">{comma(m.calories)}kcal ・ P{fmt(m.protein)} F{fmt(m.fat)} C{fmt(m.carb)}</div>
                  </div>
                  <Plus size={20} />
                </button>
              ))}
              {list.length === 0 && <div style={{ padding: 16, color: "var(--sub)", fontSize: 14 }}>見つかりませんでした</div>}
            </div>
          </>
        ) : (
          <div className="lf-card" style={{ padding: 16 }}>
            <label className="lf-mini" style={{ display: "block" }}>
              <span>メニュー名</span>
              <input placeholder="例: プロテイン、サラダチキン" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </label>
            <div className="lf-mini4">
              {[["p", "たんぱく質", "g"], ["f", "脂質", "g"], ["c", "炭水化物", "g"], ["kcal", "カロリー", "kcal"]].map(([k, l, u]) => (
                <label className="lf-mini" key={k}>
                  <span>{l}</span>
                  <input inputMode="decimal" placeholder={k === "kcal" && autoKcal ? String(autoKcal) : "0"} value={form[k]}
                    onChange={e => setForm({ ...form, [k]: e.target.value.replace(/[^\d.]/g, "") })} />
                  <em>{u}</em>
                </label>
              ))}
            </div>
            <p className="lf-hint" style={{ margin: "8px 0 12px" }}>カロリーは空欄ならPFCから自動で計算します</p>
            <button className="lf-btn-o" style={{ width: "100%", justifyContent: "center" }} disabled={!form.name.trim()} onClick={addManual}><Plus size={17} />この品目を追加</button>
          </div>
        )}

        {cart.length > 0 && (
          <div className="lf-card lf-cart">
            {cart.map((i, idx) => (
              <div className="row" key={idx}>
                <div className="nm">{i.name}</div>
                <div className="kc">{comma(i.kcal)}kcal</div>
                <button className="lf-x" onClick={() => setCart(c => c.filter((_, j) => j !== idx))}><X size={14} /></button>
              </div>
            ))}
            <div className="sum">
              合計 <b>{comma(total.kcal)}</b> kcal
              <span className="lf-chip"><i style={{ background: COLORS.p }}>P</i>{fmt(total.p)}g</span>
              <span className="lf-chip"><i style={{ background: COLORS.f }}>F</i>{fmt(total.f)}g</span>
              <span className="lf-chip"><i style={{ background: COLORS.c }}>C</i>{fmt(total.c)}g</span>
            </div>
          </div>
        )}
        <div className="lf-sheet-foot">
          <button className="lf-primary" disabled={!cart.length || saving} onClick={submit}>
            {saving ? <><LoaderCircle className="lf-spin" size={20} style={{ verticalAlign: -4, marginRight: 8 }} />栄養素を計算中…</> : `${label}を記録する${cart.length ? `（${cart.length}品）` : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}

export function waterGoal(profile) {
  const w = Number(profile?.weight);
  return w ? Math.max(1500, Math.round((w * 35) / 100) * 100) : 2000;
}

export function WaterCard({ ml, goal, onAdd }) {
  const pct = Math.min(1, ml / goal);
  return (
    <div className="lf-card lf-water">
      <div className="top">
        <span className="ic"><Droplet size={22} /></span>
        <div style={{ flex: 1 }}>
          <div className="t">水分</div>
          <div className="v"><b>{comma(ml)}</b> / {comma(goal)} ml</div>
        </div>
        <button className="lf-x" aria-label="200ml 取り消す" disabled={ml <= 0} onClick={() => onAdd(-Math.min(200, ml))}><Minus size={15} /></button>
      </div>
      <div className="bar"><div style={{ width: `${pct * 100}%` }} /></div>
      <div className="btns">
        {[200, 350, 500].map(v => <button key={v} onClick={() => onAdd(v)}>+{v}ml</button>)}
      </div>
      <p className="lf-hint" style={{ margin: "10px 0 0" }}>LINEで「水 500ml」と送っても記録できます（目安は体重×35ml）</p>
    </div>
  );
}
