import React, { useState } from "react";
import { ChevronDown } from "lucide-react";
import { CATEGORIES, NUTRIENTS, nutrientStatus, STATUS_LABEL, fmt } from "./nutrients.js";

export const COLORS = {
  p: "#2F6B4F", f: "#C9973A", c: "#8DA88E",
  pHero: "#7DC59D", fHero: "#E2BB66", cHero: "#B8C5B4",
};

const WD = ["日", "月", "火", "水", "木", "金", "土"];

export function jstToday() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}
export function addDays(date, n) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function dayInfo(date) {
  const d = new Date(`${date}T00:00:00Z`);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), wd: WD[d.getUTCDay()] };
}
export function jpDate(date) {
  const i = dayInfo(date);
  return `${i.y}年${i.m}月${i.d}日（${i.wd}）`;
}
export function md(date) {
  const i = dayInfo(date);
  return `${i.m}/${i.d}`;
}
export function mdPad(date) {
  const i = dayInfo(date);
  return `${i.m}/${String(i.d).padStart(2, "0")}`;
}
export const comma = v => Math.round(Number(v) || 0).toLocaleString("ja-JP");

export function Header({ right }) {
  return (
    <div className="lf-head">
      <div className="lf-brand">
        <img src="/liff/logo.png" alt="TTGYM" />
        <span>TTGYM</span>
      </div>
      {right}
    </div>
  );
}

export function Ring({ size, stroke, pct, color, track }) {
  const r = (size - stroke) / 2;
  const len = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, pct));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
      {p > 0 && (
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${len * p} ${len}`} transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      )}
    </svg>
  );
}

const BAR_COLOR = { low: "var(--red)", almost: "var(--gold)", enough: "var(--green)", ok: "var(--green)", much: "var(--brown)", over: "var(--red)" };

export function NutrientRow({ def, value, target, open, onToggle, showDetail = true }) {
  const status = nutrientStatus(def, value, target);
  const width = target > 0 ? Math.min(1, value / (target * 1.5)) : 0;
  const remain = target - value;
  return (
    <div className="lf-nrow">
      <button className={`lf-nhead${open ? " open" : ""}`} onClick={onToggle}>
        <span className="nm">{def.name}</span>
        <span className={`lf-badge ${status}`}>{STATUS_LABEL[status]}</span>
        <span className="vals"><b>{fmt(value)}</b> / {fmt(target)} {def.unit}</span>
        <ChevronDown size={20} strokeWidth={1.8} />
      </button>
      <div className="lf-nbar">
        {width > 0 && <div className="fill" style={{ width: `${Math.max(width * 100, 2.5)}%`, background: BAR_COLOR[status] }} />}
        <div className="tick" />
      </div>
      {open && showDetail && (
        <div className="lf-ndetail">
          <div className="lf-remain">
            {def.kind === "limit"
              ? remain >= 0 ? <>上限まであと <b>{fmt(remain)} {def.unit}</b></> : <>上限を <b>{fmt(-remain)} {def.unit}</b> 超えています。</>
              : remain > 0 ? <>目標まであと <b>{fmt(remain)} {def.unit}</b></> : "今日の目標を満たしています。"}
          </div>
          <div className="lf-glab">はたらき</div>
          <div className="lf-role">{def.role}</div>
          <div className="lf-glab">多く含む食品</div>
          <div className="lf-foods">{def.foods.map(f => <span key={f}>{f}</span>)}</div>
          <div className="lf-tip">{def.tip}</div>
        </div>
      )}
    </div>
  );
}

export function NutrientSection({ totals, targets, subtitle, countCards = true }) {
  const [cat, setCat] = useState("vitamin");
  const [open, setOpen] = useState(null);
  const statuses = NUTRIENTS.map(d => nutrientStatus(d, totals.n[d.key] || 0, targets.n[d.key]));
  const met = statuses.filter(s => s === "enough" || s === "ok" || s === "much").length;
  const low = statuses.filter(s => s === "low").length;
  return (
    <>
      {subtitle && <div className="lf-hint" style={{ margin: "-6px 4px 0" }}>{subtitle}</div>}
      {countCards && (
        <div className="lf-count2">
          <div className="lf-card"><div className="lab">目標を満たしている</div><div className="v" style={{ color: "var(--green)" }}>{met}</div></div>
          <div className="lf-card"><div className="lab">不足している</div><div className="v" style={{ color: "var(--red-text)" }}>{low}</div></div>
        </div>
      )}
      <div className="lf-tabs">
        {CATEGORIES.map(c => (
          <button key={c.id} className={`lf-tab${cat === c.id ? " on" : ""}`} onClick={() => { setCat(c.id); setOpen(null); }}>{c.label}</button>
        ))}
      </div>
      <div className="lf-card lf-nlist">
        {NUTRIENTS.filter(d => d.cat === cat).map(d => (
          <NutrientRow
            key={d.key} def={d} value={totals.n[d.key] || 0} target={targets.n[d.key]}
            open={open === d.key} onToggle={() => setOpen(open === d.key ? null : d.key)}
          />
        ))}
      </div>
      <div className="lf-hint">項目をタップすると、はたらきと多く含む食品が見られます</div>
    </>
  );
}

export function Toast({ text }) {
  return text ? <div className="lf-toast">{text}</div> : null;
}

// 管理画面で利用を停止された人に出す画面
export function BlockedScreen({ message }) {
  return (
    <div className="lf"><div className="lf-wrap">
      <div className="lf-center" style={{ flexDirection: "column", gap: 14, textAlign: "center", lineHeight: 1.8 }}>
        <img src="/liff/logo.png" alt="TTGYM" style={{ width: 64, height: 64 }} />
        <div style={{ fontSize: 17, fontWeight: 800 }}>ご利用を停止しています</div>
        <div style={{ fontSize: 14, color: "var(--sub)" }}>{message || "TTGYMスタッフまでお問い合わせください。"}</div>
      </div>
    </div></div>
  );
}
