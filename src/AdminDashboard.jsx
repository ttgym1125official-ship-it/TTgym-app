import React, { useState, useEffect } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { AlertTriangle, ChevronDown, ChevronRight, Trash2, Lock } from "lucide-react";
import { Logo } from "./logo.jsx";
import { supabase, supabaseConfigured } from "./supabaseClient.js";
import { fileToCompressedDataUrl } from "./imageUtils.js";

const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@500;600;700&family=Noto+Sans+JP:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap');`;

const C = {
  bg: "#0D0D0D", bg2: "#141311", card: "#1A1917", cardBorder: "#2C2A24",
  gold: "#D4AF37", goldDim: "#8C7328", ivory: "#EDEAE0", dim: "#8A8578", danger: "#B2483A",
};

const TIERS = [
  { name: "Black", min: 0, color: "#3A3A3A" },
  { name: "Bronze", min: 30, color: "#A97142" },
  { name: "Silver", min: 60, color: "#B8B2A7" },
  { name: "Emerald", min: 150, color: "#4E8C6E" },
  { name: "Gold", min: 240, color: "#D4AF37" },
  { name: "Platinum", min: 360, color: "#DCE3E6" },
];

function fmtLabel(iso) { const d = new Date(iso + "T00:00:00"); return `${d.getMonth() + 1}/${d.getDate()}`; }
function oneYearAgoISO() { const d = new Date(); d.setFullYear(d.getFullYear() - 1); return d.toISOString().slice(0, 10); }

function calcAge(birthdate) {
  if (!birthdate) return null;
  const b = new Date(birthdate + "T00:00:00");
  if (isNaN(b.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const hasHadBirthdayThisYear = now.getMonth() > b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() >= b.getDate());
  if (!hasHadBirthdayThisYear) age--;
  return age;
}

function isBirthdayToday(birthdate) {
  if (!birthdate) return false;
  const b = new Date(birthdate + "T00:00:00");
  if (isNaN(b.getTime())) return false;
  const now = new Date();
  return now.getMonth() === b.getMonth() && now.getDate() === b.getDate();
}

function computePoints({ meals, conditions, growth, workouts, monthly, sessions }, pointAdjustment = 0) {
  const activeDates = new Set([...meals.map(m => m.date), ...conditions.map(c => c.date), ...workouts.map(w => w.date), ...growth.map(g => g.date)]);
  let missedDays = 0;
  for (let i = 0; i < 2; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    if (!activeDates.has(d.toISOString().slice(0, 10))) missedDays++;
  }
  const personalPoints = sessions.filter(s => s.personalTraining).length * 2;
  const homeTrainingDays = [...new Set(workouts.map(w => w.date))].filter(date => {
    const s = sessions.find(x => x.date === date);
    return !(s && s.personalTraining);
  }).length;
  const homePoints = Math.floor(homeTrainingDays / 3);
  const monthlyPoints = monthly.length * 3;
  const basePoints = personalPoints + homePoints + monthlyPoints;
  const emeraldMin = TIERS.find(t => t.name === "Emerald").min;
  const autoPoints = basePoints >= emeraldMin ? basePoints : Math.max(0, basePoints - missedDays);
  const points = Math.max(0, autoPoints + (pointAdjustment || 0));
  const tier = [...TIERS].reverse().find(t => points >= t.min) || TIERS[0];
  return { points, tier };
}

const COLLECTIONS = ["meals", "water", "conditions", "growth", "workouts", "monthly", "sessions"];
// Trainer-authored records. Kept out of COLLECTIONS so the "1年以上前の記録を削除"
// cleanup (which only prunes COLLECTIONS) never touches them — the customer asked for
// these to be retained permanently.
const PERSISTENT_COLLECTIONS = ["personalLogs", "comments"];

async function loadMemberData(id) {
  const out = {};
  for (const key of [...COLLECTIONS, ...PERSISTENT_COLLECTIONS]) {
    try {
      const r = await window.storage.get(`data:${id}:${key}`, true);
      out[key] = r ? JSON.parse(r.value) : (key === "water" ? {} : []);
    } catch (e) { out[key] = key === "water" ? {} : []; }
  }
  return out;
}

function KPI({ label, value, unit, accent }) {
  return (
    <div style={{ background: C.bg, border: `1px solid ${C.cardBorder}`, borderRadius: 4, padding: "10px 10px", borderTop: `2px solid ${accent || C.goldDim}` }}>
      <div style={{ fontSize: 9.5, color: C.dim, marginBottom: 5 }}>{label}</div>
      <div><span style={{ fontFamily: "'Space Mono', monospace", fontSize: 17, color: C.ivory }}>{value}</span>
        {unit && <span style={{ fontSize: 9.5, color: C.dim, marginLeft: 3 }}>{unit}</span>}</div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: 2, color: C.goldDim, textTransform: "uppercase", marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
        {title}<div style={{ flex: 1, height: 1, background: C.cardBorder }} />
      </div>
      {children}
    </div>
  );
}

function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function PersonalLogEditor({ memberId, logs, onAdded }) {
  const [menu, setMenu] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const sorted = [...(logs || [])].sort((a, b) => b.seq - a.seq);

  async function handleAdd() {
    if (!menu.trim()) return;
    setSaving(true);
    const nextSeq = (logs || []).reduce((max, l) => Math.max(max, l.seq || 0), 0) + 1;
    const entry = { id: newId(), seq: nextSeq, date, menu: menu.trim() };
    const next = [...(logs || []), entry];
    await window.storage.set(`data:${memberId}:personalLogs`, JSON.stringify(next), true).catch(() => {});
    onAdded(entry);
    setMenu("");
    setSaving(false);
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 10, color: C.dim, marginBottom: 8 }}>パーソナルトレーニング記録(全{(logs || []).length}回)</div>
      <div style={{ background: C.bg, border: `1px solid ${C.cardBorder}`, borderRadius: 4, padding: 10, marginBottom: 10 }}>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{
          width: "100%", background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 4,
          padding: "7px 8px", color: C.ivory, fontSize: 12, marginBottom: 8, boxSizing: "border-box",
        }} />
        <textarea
          value={menu} onChange={e => setMenu(e.target.value)} rows={3}
          placeholder="実施したメニューを入力(例: スクワット3x10、ラットプルダウン3x12…)"
          style={{
            width: "100%", background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 4,
            padding: "8px 10px", color: C.ivory, fontSize: 12.5, marginBottom: 8, boxSizing: "border-box", resize: "vertical",
          }}
        />
        <button onClick={handleAdd} disabled={saving || !menu.trim()} style={{
          width: "100%", background: C.gold, color: "#0D0D0D", border: "none", borderRadius: 4,
          padding: "8px 0", fontSize: 12, fontWeight: 700, cursor: "pointer", opacity: (saving || !menu.trim()) ? 0.6 : 1,
        }}>{saving ? "保存中…" : "記録を追加"}</button>
      </div>
      {sorted.length === 0 ? <div style={{ fontSize: 11.5, color: C.dim }}>記録なし</div> : sorted.slice(0, 10).map(l => (
        <div key={l.id} style={{ padding: "6px 0", borderBottom: `1px solid ${C.cardBorder}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
            <span style={{ color: C.gold }}>第{l.seq}回</span>
            <span style={{ color: C.dim }}>{l.date}</span>
          </div>
          <div style={{ fontSize: 12, color: C.ivory, marginTop: 2, whiteSpace: "pre-wrap" }}>{l.menu}</div>
        </div>
      ))}
    </div>
  );
}

const COMMENT_TYPES = [
  { key: "weekly", label: "1週間" },
  { key: "monthly", label: "1ヶ月" },
  { key: "personal", label: "パーソナル" },
];

function TrainerCommentEditor({ memberId, comments, onAdded }) {
  const [activeType, setActiveType] = useState("weekly");
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const list = [...(comments || [])].filter(c => c.type === activeType).sort((a, b) => b.date.localeCompare(a.date));

  async function handleAdd() {
    if (!text.trim()) return;
    setSaving(true);
    const entry = { id: newId(), type: activeType, date: new Date().toISOString().slice(0, 10), text: text.trim() };
    const next = [...(comments || []), entry];
    await window.storage.set(`data:${memberId}:comments`, JSON.stringify(next), true).catch(() => {});
    onAdded(entry);
    setText("");
    setSaving(false);
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 10, color: C.dim, marginBottom: 8 }}>トレーナーコメント</div>
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        {COMMENT_TYPES.map(t => (
          <button key={t.key} onClick={() => setActiveType(t.key)} style={{
            flex: 1, padding: "6px 0", borderRadius: 4, fontSize: 11,
            background: activeType === t.key ? C.gold : "transparent", color: activeType === t.key ? "#0D0D0D" : C.ivory,
            border: `1px solid ${activeType === t.key ? C.gold : C.cardBorder}`, cursor: "pointer",
          }}>{t.label}</button>
        ))}
      </div>
      <div style={{ background: C.bg, border: `1px solid ${C.cardBorder}`, borderRadius: 4, padding: 10, marginBottom: 10 }}>
        <textarea
          value={text} onChange={e => setText(e.target.value)} rows={3} placeholder="コメント・アドバイスを入力"
          style={{
            width: "100%", background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 4,
            padding: "8px 10px", color: C.ivory, fontSize: 12.5, marginBottom: 8, boxSizing: "border-box", resize: "vertical",
          }}
        />
        <button onClick={handleAdd} disabled={saving || !text.trim()} style={{
          width: "100%", background: C.gold, color: "#0D0D0D", border: "none", borderRadius: 4,
          padding: "8px 0", fontSize: 12, fontWeight: 700, cursor: "pointer", opacity: (saving || !text.trim()) ? 0.6 : 1,
        }}>{saving ? "投稿中…" : "投稿する"}</button>
      </div>
      {list.length === 0 ? <div style={{ fontSize: 11.5, color: C.dim }}>まだコメントはありません</div> : list.slice(0, 10).map(c => (
        <div key={c.id} style={{ padding: "6px 0", borderBottom: `1px solid ${C.cardBorder}` }}>
          <div style={{ fontSize: 10, color: C.dim, marginBottom: 2 }}>{c.date}</div>
          <div style={{ fontSize: 12, color: C.ivory, whiteSpace: "pre-wrap" }}>{c.text}</div>
        </div>
      ))}
    </div>
  );
}

function GrowthLogEditor({ memberId, growth, onAdded }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [weight, setWeight] = useState("");
  const [bodyFat, setBodyFat] = useState("");
  const [muscleMass, setMuscleMass] = useState("");
  const [saving, setSaving] = useState(false);
  const sorted = [...(growth || [])].sort((a, b) => b.date.localeCompare(a.date));

  async function handleAdd() {
    if (!weight && !bodyFat && !muscleMass) return;
    setSaving(true);
    const entry = {
      id: newId(), date,
      weight: weight ? Number(weight) : null,
      bodyFat: bodyFat ? Number(bodyFat) : null,
      muscleMass: muscleMass ? Number(muscleMass) : null,
    };
    // Read the freshest stored value right before writing (rather than the
    // possibly-stale array already held in this screen) so a member who has
    // added their own growth entry since this screen loaded doesn't get overwritten.
    let latest = growth || [];
    try {
      const r = await window.storage.get(`data:${memberId}:growth`, true);
      if (r) latest = JSON.parse(r.value);
    } catch (e) {}
    const next = [...latest, entry];
    await window.storage.set(`data:${memberId}:growth`, JSON.stringify(next), true).catch(() => {});
    onAdded(entry);
    setWeight(""); setBodyFat(""); setMuscleMass("");
    setSaving(false);
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 10, color: C.dim, marginBottom: 8 }}>成長記録(InBody・体重測定)を追加</div>
      <div style={{ background: C.bg, border: `1px solid ${C.cardBorder}`, borderRadius: 4, padding: 10, marginBottom: 10 }}>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{
          width: "100%", background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 4,
          padding: "7px 8px", color: C.ivory, fontSize: 12, marginBottom: 8, boxSizing: "border-box",
        }} />
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          {[["体重kg", weight, setWeight], ["体脂肪%", bodyFat, setBodyFat], ["筋量kg", muscleMass, setMuscleMass]].map(([ph, v, setter]) => (
            <input key={ph} type="number" inputMode="decimal" value={v} onChange={e => setter(e.target.value)} placeholder={ph} style={{
              flex: 1, background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 4,
              padding: "8px 6px", color: C.ivory, fontSize: 12.5, textAlign: "center", boxSizing: "border-box",
            }} />
          ))}
        </div>
        <button onClick={handleAdd} disabled={saving || (!weight && !bodyFat && !muscleMass)} style={{
          width: "100%", background: C.gold, color: "#0D0D0D", border: "none", borderRadius: 4,
          padding: "8px 0", fontSize: 12, fontWeight: 700, cursor: "pointer",
          opacity: (saving || (!weight && !bodyFat && !muscleMass)) ? 0.6 : 1,
        }}>{saving ? "保存中…" : "成長記録を追加"}</button>
      </div>
      {sorted.length === 0 ? <div style={{ fontSize: 11.5, color: C.dim }}>記録なし</div> : sorted.slice(0, 6).map(g => (
        <div key={g.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${C.cardBorder}`, fontSize: 11.5 }}>
          <span style={{ color: C.dim }}>{g.date}</span>
          <span style={{ fontFamily: "'Space Mono', monospace" }}>
            {g.weight != null && `${g.weight}kg `}{g.bodyFat != null && `${g.bodyFat}% `}{g.muscleMass != null && `${g.muscleMass}kg筋`}
          </span>
        </div>
      ))}
    </div>
  );
}

function MonthlyLogEditor({ memberId, monthly, onAdded }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const sorted = [...(monthly || [])].sort((a, b) => b.date.localeCompare(a.date));

  async function handleAdd() {
    if (!note.trim()) return;
    setSaving(true);
    const entry = { id: newId(), date, note: note.trim(), situps: null, benchMax: null, hipThrust: null, bridge: false, photoSubmitted: false };
    let latest = monthly || [];
    try {
      const r = await window.storage.get(`data:${memberId}:monthly`, true);
      if (r) latest = JSON.parse(r.value);
    } catch (e) {}
    const next = [...latest, entry];
    await window.storage.set(`data:${memberId}:monthly`, JSON.stringify(next), true).catch(() => {});
    onAdded(entry);
    setNote("");
    setSaving(false);
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 10, color: C.dim, marginBottom: 8 }}>月次測定を追加(自由記入)</div>
      <div style={{ background: C.bg, border: `1px solid ${C.cardBorder}`, borderRadius: 4, padding: 10, marginBottom: 10 }}>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{
          width: "100%", background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 4,
          padding: "7px 8px", color: C.ivory, fontSize: 12, marginBottom: 8, boxSizing: "border-box",
        }} />
        <textarea
          value={note} onChange={e => setNote(e.target.value)} rows={3} placeholder="測定結果を自由に入力"
          style={{
            width: "100%", background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 4,
            padding: "8px 10px", color: C.ivory, fontSize: 12.5, marginBottom: 8, boxSizing: "border-box", resize: "vertical",
          }}
        />
        <button onClick={handleAdd} disabled={saving || !note.trim()} style={{
          width: "100%", background: C.gold, color: "#0D0D0D", border: "none", borderRadius: 4,
          padding: "8px 0", fontSize: 12, fontWeight: 700, cursor: "pointer", opacity: (saving || !note.trim()) ? 0.6 : 1,
        }}>{saving ? "保存中…" : "月次測定を追加"}</button>
      </div>
      {sorted.length === 0 ? <div style={{ fontSize: 11.5, color: C.dim }}>記録なし</div> : sorted.slice(0, 6).map(m => (
        <div key={m.id} style={{ padding: "6px 0", borderBottom: `1px solid ${C.cardBorder}` }}>
          <div style={{ fontSize: 10.5, color: C.dim, marginBottom: 2 }}>{m.date}</div>
          {m.note && <div style={{ fontSize: 12, color: C.ivory, whiteSpace: "pre-wrap" }}>{m.note}</div>}
        </div>
      ))}
    </div>
  );
}

function GoalAndPhotosEditor({ memberId, profile, onSaved }) {
  const [goal, setGoal] = useState(profile.goal || "");
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState(profile.goal || "");
  const [beforePhoto, setBeforePhoto] = useState(profile.beforePhoto || null);
  const [afterPhoto, setAfterPhoto] = useState(profile.afterPhoto || null);
  const [afterMonths, setAfterMonths] = useState(profile.afterMonths || "");
  const [uploading, setUploading] = useState(null);

  async function persist(patch) {
    try {
      const r = await window.storage.get(`profile:${memberId}`, true);
      const existing = r ? JSON.parse(r.value) : profile;
      const merged = { ...existing, ...patch };
      await window.storage.set(`profile:${memberId}`, JSON.stringify(merged), true);
      onSaved(merged);
    } catch (e) {}
  }

  function saveGoal() {
    setGoal(goalInput);
    setEditingGoal(false);
    persist({ goal: goalInput });
  }

  async function handlePhoto(which, file) {
    if (!file) return;
    setUploading(which);
    try {
      const dataUrl = await fileToCompressedDataUrl(file);
      if (which === "before") setBeforePhoto(dataUrl); else setAfterPhoto(dataUrl);
      await persist(which === "before" ? { beforePhoto: dataUrl } : { afterPhoto: dataUrl });
    } catch (e) {}
    setUploading(null);
  }

  function handleAfterMonthsChange(v) {
    setAfterMonths(v);
    persist({ afterMonths: v });
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 10, color: C.dim, marginBottom: 8 }}>目標</div>
      <div style={{ background: C.bg, border: `1px solid ${C.cardBorder}`, borderRadius: 4, padding: 10, marginBottom: 10 }}>
        {editingGoal ? (
          <>
            <textarea value={goalInput} onChange={e => setGoalInput(e.target.value)} rows={3} placeholder="目標を入力" style={{
              width: "100%", background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 4,
              padding: "8px 10px", color: C.ivory, fontSize: 12.5, marginBottom: 8, boxSizing: "border-box", resize: "vertical",
            }} />
            <button onClick={saveGoal} style={{
              width: "100%", background: C.gold, color: "#0D0D0D", border: "none", borderRadius: 4, padding: "8px 0", fontSize: 12, fontWeight: 700, cursor: "pointer",
            }}>保存する</button>
          </>
        ) : (
          <>
            <div style={{ fontSize: 12.5, color: goal ? C.ivory : C.dim, whiteSpace: "pre-wrap", marginBottom: 8 }}>
              {goal || "まだ目標が設定されていません"}
            </div>
            <button onClick={() => { setGoalInput(goal); setEditingGoal(true); }} style={{
              background: "none", border: `1px solid ${C.cardBorder}`, color: C.dim, borderRadius: 20, padding: "5px 12px", fontSize: 11, cursor: "pointer",
            }}>編集</button>
          </>
        )}
      </div>

      <div style={{ fontSize: 10, color: C.dim, marginBottom: 8 }}>ビフォーアフター写真</div>
      <div style={{ background: C.bg, border: `1px solid ${C.cardBorder}`, borderRadius: 4, padding: 10 }}>
        <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
          {[["before", "ビフォー", beforePhoto], ["after", `アフター${afterMonths ? `(${afterMonths}ヶ月)` : ""}`, afterPhoto]].map(([key, label, photo]) => (
            <label key={key} style={{ flex: 1, textAlign: "center", cursor: "pointer" }}>
              <div style={{ fontSize: 10.5, color: C.dim, marginBottom: 6 }}>{label}</div>
              <div style={{
                width: "100%", aspectRatio: "3 / 4", borderRadius: 4, border: `1px dashed ${C.cardBorder}`,
                background: photo ? `url(${photo}) center / cover` : C.card, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
              }}>
                {!photo && <span style={{ fontSize: 10, color: C.dim }}>{uploading === key ? "アップロード中…" : "タップして選択"}</span>}
              </div>
              <input type="file" accept="image/*" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) handlePhoto(key, f); e.target.value = ""; }} />
            </label>
          ))}
        </div>
        <div style={{ fontSize: 10.5, color: C.dim, marginBottom: 6 }}>アフター経過月数</div>
        <input type="number" value={afterMonths} onChange={e => handleAfterMonthsChange(e.target.value)} placeholder="例: 3" style={{
          width: "100%", background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 4,
          padding: "7px 8px", color: C.ivory, fontSize: 12, boxSizing: "border-box",
        }} />
      </div>
    </div>
  );
}

function PointAdjustmentEditor({ member, onSaved }) {
  const [value, setValue] = useState(member.pointAdjustment || 0);
  const [saving, setSaving] = useState(false);

  async function commit(next) {
    setSaving(true);
    setValue(next);
    try {
      const r = await window.storage.get(`profile:${member.id}`, true);
      const existing = r ? JSON.parse(r.value) : member;
      await window.storage.set(`profile:${member.id}`, JSON.stringify({ ...existing, pointAdjustment: next }), true);
      onSaved(next);
    } catch (e) {}
    setSaving(false);
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 10, color: C.dim, marginBottom: 8 }}>ポイント手動調整(自動計算されたポイントに加減算されます)</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, background: C.bg, border: `1px solid ${C.cardBorder}`, borderRadius: 4, padding: 10 }}>
        {[-10, -1].map(d => (
          <button key={d} disabled={saving} onClick={() => commit(value + d)} style={{
            background: "none", border: `1px solid ${C.cardBorder}`, color: C.ivory, borderRadius: 4,
            padding: "6px 10px", fontSize: 12, cursor: "pointer", opacity: saving ? 0.6 : 1,
          }}>{d}</button>
        ))}
        <div style={{ flex: 1, textAlign: "center", fontFamily: "'Space Mono', monospace", fontSize: 15, color: C.gold }}>
          {value > 0 ? `+${value}` : value}
        </div>
        {[1, 10].map(d => (
          <button key={d} disabled={saving} onClick={() => commit(value + d)} style={{
            background: "none", border: `1px solid ${C.cardBorder}`, color: C.ivory, borderRadius: 4,
            padding: "6px 10px", fontSize: 12, cursor: "pointer", opacity: saving ? 0.6 : 1,
          }}>+{d}</button>
        ))}
      </div>
    </div>
  );
}

function MemberDetail({ member, onMemberUpdated }) {
  const [data, setData] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [blocked, setBlocked] = useState(!!member.blocked);
  const [updatingBlock, setUpdatingBlock] = useState(false);
  const [approved, setApproved] = useState(!!member.approved);
  const [updatingApproval, setUpdatingApproval] = useState(false);
  const [pointAdjustment, setPointAdjustment] = useState(member.pointAdjustment || 0);
  const [profile, setProfile] = useState(member);

  useEffect(() => { setData(null); loadMemberData(member.id).then(setData); }, [member.id]);
  useEffect(() => { onMemberUpdated?.(profile); }, [profile]);

  async function toggleBlock() {
    setUpdatingBlock(true);
    const next = !blocked;
    try {
      const r = await window.storage.get(`profile:${member.id}`, true);
      const existing = r ? JSON.parse(r.value) : member;
      const merged = { ...existing, blocked: next };
      await window.storage.set(`profile:${member.id}`, JSON.stringify(merged), true);
      setBlocked(next);
      setProfile(merged);
    } catch (e) {}
    setUpdatingBlock(false);
  }

  async function approveMember() {
    setUpdatingApproval(true);
    try {
      const r = await window.storage.get(`profile:${member.id}`, true);
      const existing = r ? JSON.parse(r.value) : member;
      const merged = { ...existing, approved: true };
      await window.storage.set(`profile:${member.id}`, JSON.stringify(merged), true);
      setApproved(true);
      setProfile(merged);
    } catch (e) {}
    setUpdatingApproval(false);
  }

  if (!data) return <div style={{ fontSize: 12, color: C.dim, padding: "12px 0" }}>読み込み中…</div>;

  const { tier, points } = computePoints(data, pointAdjustment);
  const latestGrowth = [...data.growth].sort((a, b) => b.date.localeCompare(a.date))[0];
  const recentMeals = [...data.meals].sort((a, b) => (b.date + (b.time || "")).localeCompare(a.date + (a.time || ""))).slice(0, 10);
  const recentWorkouts = [...data.workouts].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
  const weightChart = [...data.growth].filter(g => g.weight).sort((a, b) => a.date.localeCompare(b.date)).slice(-14).map(g => ({ date: fmtLabel(g.date), weight: g.weight }));

  async function handleCleanup() {
    const cutoff = oneYearAgoISO();
    const cleaned = {
      meals: data.meals.filter(m => m.date >= cutoff),
      conditions: data.conditions.filter(c => c.date >= cutoff),
      growth: data.growth.filter(g => g.date >= cutoff),
      workouts: data.workouts.filter(w => w.date >= cutoff),
      monthly: data.monthly.filter(m => m.date >= cutoff),
      sessions: data.sessions.filter(s => s.date >= cutoff),
      water: Object.fromEntries(Object.entries(data.water).filter(([date]) => date >= cutoff)),
    };
    for (const key of COLLECTIONS) {
      await window.storage.set(`data:${member.id}:${key}`, JSON.stringify(cleaned[key]), true).catch(() => {});
    }
    setData(cleaned);
    setConfirmDelete(false);
  }

  const age = calcAge(profile.birthdate);

  return (
    <div style={{ padding: "14px 4px 4px" }}>
      {isBirthdayToday(profile.birthdate) && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8, marginBottom: 16, padding: "10px 12px",
          borderRadius: 6, background: `${C.gold}22`, border: `1px solid ${C.gold}`,
        }}>
          <span style={{ fontSize: 16 }}>🎉</span>
          <span style={{ fontSize: 11.5, color: C.gold }}>本日、{profile.name}様のお誕生日です！</span>
        </div>
      )}

      {!approved && (
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16,
          padding: "10px 12px", borderRadius: 6, background: `${C.gold}18`, border: `1px solid ${C.gold}`,
        }}>
          <span style={{ fontSize: 11.5, color: C.gold }}>承認待ちです。承認するまでお客様アプリは利用できません</span>
          <button onClick={approveMember} disabled={updatingApproval} style={{
            background: C.gold, color: "#0D0D0D", border: "none", borderRadius: 20, padding: "6px 14px",
            fontSize: 11, fontWeight: 700, cursor: "pointer", opacity: updatingApproval ? 0.6 : 1,
          }}>{updatingApproval ? "処理中…" : "承認する"}</button>
        </div>
      )}

      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16,
        padding: "10px 12px", borderRadius: 6, background: blocked ? `${C.danger}22` : "transparent",
        border: `1px solid ${blocked ? C.danger : C.cardBorder}`,
      }}>
        <span style={{ fontSize: 11.5, color: blocked ? C.danger : C.dim }}>
          {blocked ? "現在強制停止しています" : "現在アクセスを許可しています"}
        </span>
        <button onClick={toggleBlock} disabled={updatingBlock} style={{
          background: "none", border: `1px solid ${blocked ? C.gold : C.danger}`, color: blocked ? C.gold : C.danger,
          borderRadius: 20, padding: "5px 12px", fontSize: 11, cursor: "pointer", opacity: updatingBlock ? 0.6 : 1,
        }}>{blocked ? "再開する" : "強制停止する"}</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 8 }}>
        <KPI label="会員ランク" value={tier.name} accent={tier.color} />
        <KPI label="ポイント" value={points} unit="pt" accent={C.gold} />
        <KPI label="年齢" value={age ?? "—"} unit={age != null ? "歳" : ""} accent="#8C5DC9" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
        <KPI label="最新体重" value={latestGrowth?.weight ?? "—"} unit="kg" accent="#4E8C6E" />
        <KPI label="最新体脂肪率" value={latestGrowth?.bodyFat ?? "—"} unit="%" accent="#4E8C6E" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 16 }}>
        <KPI label="食事記録" value={data.meals.length} unit="件" />
        <KPI label="トレーニング記録" value={data.workouts.length} unit="件" />
        <KPI label="月次測定" value={data.monthly.length} unit="件" />
      </div>

      <GoalAndPhotosEditor memberId={member.id} profile={profile} onSaved={setProfile} />

      <PointAdjustmentEditor member={{ ...member, pointAdjustment }} onSaved={setPointAdjustment} />

      <GrowthLogEditor
        memberId={member.id} growth={data.growth}
        onAdded={entry => setData(d => ({ ...d, growth: [...d.growth, entry] }))}
      />

      <MonthlyLogEditor
        memberId={member.id} monthly={data.monthly}
        onAdded={entry => setData(d => ({ ...d, monthly: [...d.monthly, entry] }))}
      />

      {weightChart.length >= 2 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: C.gold, marginBottom: 8 }}>体重推移(kg)</div>
          <div style={{ height: 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={weightChart} margin={{ top: 4, right: 10, left: -14, bottom: 0 }}>
                <CartesianGrid stroke={C.cardBorder} vertical={false} />
                <XAxis dataKey="date" tick={{ fill: C.dim, fontSize: 11 }} axisLine={{ stroke: C.cardBorder }} tickLine={false} />
                <YAxis tick={{ fill: C.dim, fontSize: 11 }} axisLine={false} tickLine={false} domain={["auto", "auto"]} width={30} />
                <Tooltip contentStyle={{ background: C.bg, border: `1px solid ${C.cardBorder}`, fontSize: 12 }} />
                <Line type="monotone" dataKey="weight" stroke={C.gold} strokeWidth={2.5} dot={{ r: 3.5, fill: C.gold }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 10, color: C.dim, marginBottom: 8 }}>食事内容(直近10件)</div>
        {recentMeals.length === 0 ? <div style={{ fontSize: 11.5, color: C.dim }}>記録なし</div> : recentMeals.map(m => {
          const hasExtra = m.fiber != null || m.sugar != null || m.sodium != null || m.potassium != null
            || m.vitaminA != null || m.vitaminC != null || m.calcium != null || m.iron != null;
          return (
            <div key={m.id} style={{ padding: "6px 0", borderBottom: `1px solid ${C.cardBorder}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5 }}>
                <span>{m.name}</span>
                <span style={{ fontFamily: "'Space Mono', monospace", color: C.dim }}>
                  {m.calories}kcal ・P{m.protein} F{m.fat} C{m.carb}
                </span>
              </div>
              {hasExtra && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4, fontFamily: "'Space Mono', monospace", fontSize: 10, color: C.dim }}>
                  {m.fiber != null && <span>食物繊維{m.fiber}g</span>}
                  {m.sugar != null && <span>糖分{m.sugar}g</span>}
                  {m.sodium != null && <span>ナトリウム{m.sodium}mg</span>}
                  {m.potassium != null && <span>カリウム{m.potassium}mg</span>}
                  {m.vitaminA != null && <span>ビタミンA{m.vitaminA}</span>}
                  {m.vitaminC != null && <span>ビタミンC{m.vitaminC}</span>}
                  {m.calcium != null && <span>カルシウム{m.calcium}</span>}
                  {m.iron != null && <span>鉄分{m.iron}</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 10, color: C.dim, marginBottom: 8 }}>トレーニング内容(直近10件)</div>
        {recentWorkouts.length === 0 ? <div style={{ fontSize: 11.5, color: C.dim }}>記録なし</div> : recentWorkouts.map(w => (
          <div key={w.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${C.cardBorder}`, fontSize: 11.5 }}>
            <span>{w.exercise}</span>
            <span style={{ fontFamily: "'Space Mono', monospace", color: C.dim }}>{w.reps}{w.unit === "sec" ? "秒" : "回"}×{w.weight}kg</span>
          </div>
        ))}
      </div>

      <PersonalLogEditor
        memberId={member.id} logs={data.personalLogs}
        onAdded={entry => setData(d => ({ ...d, personalLogs: [...d.personalLogs, entry] }))}
      />

      <TrainerCommentEditor
        memberId={member.id} comments={data.comments}
        onAdded={entry => setData(d => ({ ...d, comments: [...d.comments, entry] }))}
      />

      {!confirmDelete ? (
        <button onClick={() => setConfirmDelete(true)} style={{
          display: "flex", alignItems: "center", gap: 6, background: "none", border: `1px solid ${C.cardBorder}`,
          color: C.dim, borderRadius: 4, padding: "8px 12px", fontSize: 11, cursor: "pointer",
        }}><Trash2 size={13} /> 1年以上前の記録を削除</button>
      ) : (
        <div style={{ border: `1px solid ${C.danger}`, borderRadius: 4, padding: 12 }}>
          <div style={{ fontSize: 11.5, color: C.ivory, marginBottom: 10 }}>1年以上前の全記録を削除します。元に戻せません。よろしいですか?</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={handleCleanup} style={{ flex: 1, background: C.danger, color: "#fff", border: "none", borderRadius: 2, padding: "8px 0", fontSize: 11.5, cursor: "pointer" }}>削除する</button>
            <button onClick={() => setConfirmDelete(false)} style={{ flex: 1, background: "none", border: `1px solid ${C.cardBorder}`, color: C.dim, borderRadius: 2, padding: "8px 0", fontSize: 11.5, cursor: "pointer" }}>キャンセル</button>
          </div>
        </div>
      )}
    </div>
  );
}

function StaffLogin({ onUnlock }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!email.trim() || !password) { setError("メールアドレスとパスワードを入力してください"); return; }
    setLoading(true); setError(null);
    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (signInError) { setError("メールアドレスまたはパスワードが違います"); setLoading(false); return; }
    const { data: staffRow } = await supabase.from("staff_users").select("uid").eq("uid", data.user.id).maybeSingle();
    if (!staffRow) {
      await supabase.auth.signOut();
      setError("このアカウントにはスタッフ権限がありません");
      setLoading(false);
      return;
    }
    onUnlock();
  }

  return (
    <div style={{
      fontFamily: "'Noto Sans JP', sans-serif", background: `linear-gradient(180deg, ${C.bg2}, ${C.bg})`,
      minHeight: "100vh", color: C.ivory, display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
    }}>
      <style>{FONT_IMPORT}</style>
      <div style={{ width: "100%", maxWidth: 320 }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}><Logo height={50} /></div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center", marginBottom: 18 }}>
          <Lock size={15} color={C.goldDim} />
          <span style={{ fontSize: 12, color: C.dim, letterSpacing: 1 }}>スタッフ専用 管理ダッシュボード</span>
        </div>
        <input
          type="email" value={email} onChange={e => { setEmail(e.target.value); setError(null); }}
          placeholder="スタッフのメールアドレス" style={{
            width: "100%", background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 4,
            padding: "10px 12px", color: C.ivory, fontSize: 13, marginBottom: 10, boxSizing: "border-box",
          }}
        />
        <input
          type="password" value={password} onChange={e => { setPassword(e.target.value); setError(null); }}
          placeholder="パスワード" onKeyDown={e => { if (e.key === "Enter") handleLogin(); }} style={{
            width: "100%", background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 4,
            padding: "10px 12px", color: C.ivory, fontSize: 13, marginBottom: 10, boxSizing: "border-box",
          }}
        />
        {error && <div style={{ fontSize: 11.5, color: C.danger, marginBottom: 10 }}>{error}</div>}
        <button
          onClick={handleLogin} disabled={loading}
          style={{ width: "100%", background: C.gold, color: "#0D0D0D", border: "none", borderRadius: 4, padding: "10px 0", fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: loading ? 0.6 : 1 }}
        >{loading ? "確認中…" : "ログイン"}</button>
      </div>
    </div>
  );
}

function Dashboard() {
  const [loaded, setLoaded] = useState(false);
  const [members, setMembers] = useState([]);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const list = await window.storage.list("profile:");
        const keys = list?.keys || [];
        const loadedMembers = [];
        for (const k of keys) {
          try {
            const r = await window.storage.get(k, true);
            if (r) loadedMembers.push(JSON.parse(r.value));
          } catch (e) {}
        }
        loadedMembers.sort((a, b) => (b.lastActivityAt || "").localeCompare(a.lastActivityAt || ""));
        setMembers(loadedMembers);
      } catch (e) { setMembers([]); }
      setLoaded(true);
    })();
  }, []);

  if (!loaded) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <style>{FONT_IMPORT}</style>
        <span style={{ fontFamily: "'Noto Serif JP', serif", color: C.gold, fontSize: 18 }}>読み込み中…</span>
      </div>
    );
  }

  return (
    <div style={{
      fontFamily: "'Noto Sans JP', sans-serif", background: `linear-gradient(180deg, ${C.bg2}, ${C.bg})`,
      minHeight: "100vh", color: C.ivory, padding: "24px 18px 60px", maxWidth: 720, margin: "0 auto",
    }}>
      <style>{`
        ${FONT_IMPORT}
        * { box-sizing: border-box; }
        @media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
      `}</style>

      <div style={{ marginBottom: 20 }}>
        <Logo height={42} />
        <div style={{ fontFamily: "'Noto Serif JP', serif", fontSize: 16, letterSpacing: 2, color: C.ivory, marginTop: 10 }}>管理ダッシュボード</div>
        <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, letterSpacing: 2, color: C.goldDim, marginTop: 4 }}>MEMBER REGISTRY</div>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 4, padding: "12px 14px", marginBottom: 20 }}>
        <AlertTriangle size={16} color={C.goldDim} style={{ flexShrink: 0, marginTop: 1 }} />
        <div style={{ fontSize: 11, lineHeight: 1.7, color: C.dim }}>
          この一覧には、この端末(このブラウザ)で登録・記録された会員のみ表示されます。お客様が各自のスマホでTTGYMを使っている場合、そのデータはお客様の端末にしか保存されず、ここには表示されません。
        </div>
      </div>

      {members.length === 0 && (
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start", background: C.card, border: `1px solid ${C.danger}`, borderRadius: 4, padding: "14px 16px", marginBottom: 20 }}>
          <AlertTriangle size={18} color={C.danger} style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 12, lineHeight: 1.7, color: C.ivory }}>
            登録されている会員が見つかりませんでした。この端末のTTYM本体アプリの「登録」タブでお客様登録を行うと、ここに表示されるようになります。
          </div>
        </div>
      )}

      {members.some(m => isBirthdayToday(m.birthdate)) && (
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start", background: `${C.gold}18`, border: `1px solid ${C.gold}`, borderRadius: 4, padding: "14px 16px", marginBottom: 20 }}>
          <span style={{ fontSize: 18, flexShrink: 0 }}>🎂</span>
          <div style={{ fontSize: 12, lineHeight: 1.9, color: C.ivory }}>
            本日お誕生日の会員がいます: {members.filter(m => isBirthdayToday(m.birthdate)).map(m => m.name).join("、")}
          </div>
        </div>
      )}

      {members.some(m => m.registered && !m.approved && !m.blocked) && (
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start", background: `${C.gold}18`, border: `1px solid ${C.gold}`, borderRadius: 4, padding: "14px 16px", marginBottom: 20 }}>
          <AlertTriangle size={18} color={C.gold} style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 12, lineHeight: 1.9, color: C.ivory }}>
            承認待ちの会員がいます: {members.filter(m => m.registered && !m.approved && !m.blocked).map(m => m.name).join("、")}
          </div>
        </div>
      )}

      <Section title={`登録者一覧(${members.length}名)`}>
        {members.map(m => {
          const isOpen = expandedId === m.id;
          const age = calcAge(m.birthdate);
          const pending = m.registered && !m.approved && !m.blocked;
          return (
            <div key={m.id} style={{ marginBottom: 8 }}>
              <button onClick={() => setExpandedId(isOpen ? null : m.id)} style={{
                width: "100%", display: "flex", alignItems: "center", gap: 12, background: C.card,
                border: `1px solid ${isOpen ? C.gold : C.cardBorder}`, borderRadius: 4, padding: "12px 14px", cursor: "pointer", textAlign: "left",
              }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: m.avatarColor || C.gold, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <span style={{ fontFamily: "'Noto Serif JP', serif", fontSize: 14, color: "#0D0D0D" }}>{(m.name || "?").charAt(0)}</span>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: C.ivory }}>
                    {m.name}<span style={{ color: C.dim, fontSize: 11 }}> ({m.furigana})</span>
                    {age != null && <span style={{ color: C.dim, fontSize: 11 }}> ・{age}歳</span>}
                  </div>
                  <div style={{ fontSize: 10.5, color: C.dim }}>{m.phone || "—"}</div>
                </div>
                {pending && (
                  <span style={{ fontSize: 10, color: C.gold, border: `1px solid ${C.gold}`, borderRadius: 20, padding: "2px 8px", flexShrink: 0 }}>承認待ち</span>
                )}
                {m.blocked && (
                  <span style={{ fontSize: 10, color: C.danger, border: `1px solid ${C.danger}`, borderRadius: 20, padding: "2px 8px", flexShrink: 0 }}>停止中</span>
                )}
                {isOpen ? <ChevronDown size={16} color={C.dim} /> : <ChevronRight size={16} color={C.dim} />}
              </button>
              {isOpen && (
                <div style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderTop: "none", borderRadius: "0 0 4px 4px", padding: "0 14px 14px" }}>
                  <MemberDetail
                    member={m}
                    onMemberUpdated={updated => setMembers(prev => prev.map(x => x.id === updated.id ? updated : x))}
                  />
                </div>
              )}
            </div>
          );
        })}
      </Section>
    </div>
  );
}

export default function AdminDashboard() {
  return <Dashboard />;
}
