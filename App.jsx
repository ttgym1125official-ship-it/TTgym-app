import React, { useState, useEffect, useMemo, useRef } from "react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import {
  Utensils, Activity, TrendingUp, Dumbbell, Crown, Droplet, Camera,
  Plus, X, Trash2, Moon, Brain, Play, ChevronRight, Sparkles, BarChart3, Settings, MessageSquare
} from "lucide-react";
import { Logo } from "./logo.jsx";
import { getApiKey, setApiKey } from "./apiKey.js";
import { getMemberId, supabaseConfigured } from "./supabaseClient.js";
import { fileToCompressedDataUrl } from "./imageUtils.js";

const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@500;600;700&family=Noto+Sans+JP:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap');`;

const C = {
  bg: "#0D0D0D",
  bg2: "#141311",
  card: "#1A1917",
  cardBorder: "#2C2A24",
  cardBorderLight: "#3A3627",
  gold: "#D4AF37",
  goldDim: "#8C7328",
  goldSoft: "#D4AF3722",
  ivory: "#EDEAE0",
  dim: "#8A8578",
  danger: "#B2483A",
};

const TIERS = [
  { name: "Black", min: 0, color: "#3A3A3A" },
  { name: "Bronze", min: 30, color: "#A97142" },
  { name: "Silver", min: 60, color: "#B8B2A7" },
  { name: "Emerald", min: 150, color: "#4E8C6E" },
  { name: "Gold", min: 240, color: "#D4AF37" },
  { name: "Platinum", min: 360, color: "#DCE3E6" },
];

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function todayISO() { return new Date().toISOString().slice(0, 10); }

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
function nowTime() { return new Date().toTimeString().slice(0, 5); }
function fmtLabel(iso) { const d = new Date(iso + "T00:00:00"); return `${d.getMonth() + 1}/${d.getDate()}`; }

// Coerces a value to a finite number, or null when it isn't one — keeps
// bad/missing model output from silently becoming NaN or "undefined" in the UI.
function toNum(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Vision responses are instructed to return pure JSON, but occasionally wrap it in a
// stray sentence or markdown fence anyway. Try a direct parse first, then fall back to
// slicing out the outermost {...} span before giving up.
function extractJsonObject(text) {
  const cleaned = text.replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end === -1 || end < start) {
      throw new Error("AIの応答からJSONを取得できませんでした");
    }
    return JSON.parse(cleaned.slice(start, end + 1));
  }
}

async function callClaudeVisionOnce(base64Data, mediaType, prompt, apiKey) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 1000,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: base64Data } },
          { type: "text", text: prompt },
        ],
      }],
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || `API error (${response.status})`);
  }
  const text = (data.content || []).map(b => b.text || "").join("\n");
  return extractJsonObject(text);
}

async function callClaudeVision(base64Data, mediaType, prompt) {
  const apiKey = getApiKey();
  if (!apiKey) {
    const err = new Error("API_KEY_MISSING");
    err.code = "API_KEY_MISSING";
    throw err;
  }
  try {
    return await callClaudeVisionOnce(base64Data, mediaType, prompt, apiKey);
  } catch (err) {
    // One silent retry — covers transient network hiccups and the occasional
    // response that wraps its JSON in commentary badly enough that extraction fails.
    try {
      return await callClaudeVisionOnce(base64Data, mediaType, prompt, apiKey);
    } catch (err2) {
      err2.code = err2.code || "ANALYSIS_FAILED";
      throw err2;
    }
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result.split(",")[1]);
    r.onerror = () => reject(new Error("read failed"));
    r.readAsDataURL(file);
  });
}

/* ---------------- shared UI ---------------- */

function SectionLabel({ children }) {
  return (
    <div style={{
      fontFamily: "'Space Mono', monospace", fontSize: 10.5, letterSpacing: 2,
      color: C.goldDim, textTransform: "uppercase", marginBottom: 10,
      display: "flex", alignItems: "center", gap: 8,
    }}>
      {children}
      <div style={{ flex: 1, height: 1, background: C.cardBorder }} />
    </div>
  );
}

function Card({ children, style }) {
  return (
    <div style={{
      background: `linear-gradient(155deg, ${C.card} 0%, #201E19 100%)`,
      border: `1px solid ${C.cardBorder}dd`, borderRadius: 14,
      padding: 16, marginBottom: 12, boxShadow: "0 6px 18px -10px rgba(0,0,0,0.6)",
      ...style,
    }}>{children}</div>
  );
}

function GoldButton({ children, onClick, disabled, variant = "solid" }) {
  const solid = variant === "solid";
  return (
    <button onClick={onClick} disabled={disabled} style={{
      width: "100%", padding: "13px 0", borderRadius: 9, cursor: disabled ? "default" : "pointer",
      fontFamily: "'Noto Sans JP', sans-serif", fontWeight: 600, fontSize: 13.5, letterSpacing: 1,
      background: solid ? (disabled ? C.cardBorder : `linear-gradient(135deg, #E4C158 0%, ${C.gold} 45%, ${C.goldDim} 100%)`) : "transparent",
      color: solid ? (disabled ? C.dim : "#0D0D0D") : C.gold,
      border: solid ? "none" : `1px solid ${C.goldDim}`,
      opacity: disabled ? 0.6 : 1,
      boxShadow: solid && !disabled ? "0 4px 14px -4px rgba(212,175,55,0.45)" : "none",
      transition: "opacity 0.15s ease, transform 0.1s ease",
    }}>{children}</button>
  );
}

function TabButton({ active, onClick, icon: Icon, label }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, background: "none", border: "none", cursor: "pointer",
      display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
      padding: "10px 0 8px", color: active ? C.gold : C.dim,
    }}>
      <Icon size={19} strokeWidth={active ? 2.2 : 1.6} />
      <span style={{ fontFamily: "'Noto Sans JP', sans-serif", fontSize: 9.5, fontWeight: active ? 600 : 400 }}>{label}</span>
      <div style={{ width: active ? 14 : 0, height: 1.5, background: C.gold, transition: "width 0.2s ease" }} />
    </button>
  );
}

function EmptyState({ text }) {
  return <div style={{ textAlign: "center", color: C.dim, fontSize: 12.5, padding: "24px 10px" }}>{text}</div>;
}

function BirthdayOverlay({ name, onClose }) {
  const confetti = useMemo(() => Array.from({ length: 40 }, (_, i) => ({
    left: Math.random() * 100,
    delay: Math.random() * 2,
    duration: 2.5 + Math.random() * 2,
    color: [C.gold, "#F0D77A", "#EDEAE0", "#8C7328"][i % 4],
    size: 6 + Math.random() * 6,
    rotate: Math.random() * 360,
  })), []);

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 60, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center",
      background: `radial-gradient(ellipse 90% 70% at 50% 30%, #3A2F10 0%, ${C.bg2} 55%, ${C.bg} 100%)`,
      overflow: "hidden", cursor: "pointer",
    }}>
      {confetti.map((c, i) => (
        <div key={i} style={{
          position: "absolute", top: -20, left: `${c.left}%`, width: c.size, height: c.size * 1.6,
          background: c.color, borderRadius: 2, opacity: 0.9,
          animation: `confettiFall ${c.duration}s linear ${c.delay}s infinite`,
          transform: `rotate(${c.rotate}deg)`,
        }} />
      ))}
      <div style={{ fontSize: 46, animation: "birthdayPop 1s cubic-bezier(0.34, 1.56, 0.64, 1)", position: "relative" }}>🎉🎂🎉</div>
      <div style={{
        fontFamily: "'Noto Serif JP', serif", fontSize: 20, color: C.gold, marginTop: 18, lineHeight: 1.9,
        animation: "splashFadeIn 0.9s ease 0.2s both", textShadow: "0 0 20px rgba(212,175,55,0.5)", position: "relative",
      }}>
        【{name}様<br />お誕生日おめでとうございます！
      </div>
      <div style={{
        fontSize: 14, color: C.ivory, marginTop: 14, lineHeight: 2, maxWidth: 320,
        animation: "splashFadeIn 0.9s ease 0.4s both", position: "relative",
      }}>
        TTGYMを選んで頂き誠にありがとうございます！<br />
        これからも全力でサポート致します！<br />
        引き続き宜しくお願い致します！】
      </div>
      <div style={{ fontSize: 11, color: C.dim, marginTop: 28, position: "relative" }}>(タップして閉じる)</div>
    </div>
  );
}

/* ---------------- App ---------------- */

export default function App() {
  const [tab, setTab] = useState("status");
  const [loaded, setLoaded] = useState(false);
  const [profileId, setProfileId] = useState(null);
  const [meals, setMeals] = useState([]);
  const [water, setWater] = useState({});
  const [conditions, setConditions] = useState([]);
  const [growth, setGrowth] = useState([]);
  const [workouts, setWorkouts] = useState([]);
  const [monthly, setMonthly] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [personalLogs, setPersonalLogs] = useState([]);
  const [comments, setComments] = useState([]);
  const [pointAdjustment, setPointAdjustment] = useState(0);
  const [toast, setToast] = useState(null);
  const [splashPhase, setSplashPhase] = useState("visible");
  const [authPhase, setAuthPhase] = useState("checking");
  const [regName, setRegName] = useState("");
  const [regFurigana, setRegFurigana] = useState("");
  const [regBirthdate, setRegBirthdate] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [regAddress, setRegAddress] = useState("");
  const [authError, setAuthError] = useState(null);
  const [birthdayOverlay, setBirthdayOverlay] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState("");

  useEffect(() => { setApiKeyInput(getApiKey()); }, []);

  useEffect(() => {
    const t1 = setTimeout(() => setSplashPhase("fading"), 3500);
    const t2 = setTimeout(() => setSplashPhase("gone"), 4000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  useEffect(() => {
    (async () => {
      let id = null;
      if (supabaseConfigured) {
        try { id = await getMemberId(); } catch (e) { id = null; }
      }
      if (!id) {
        try {
          const r = await window.storage.get("myProfileId");
          id = r ? r.value : null;
        } catch (e) { id = null; }
        if (!id) {
          id = uid();
          try { await window.storage.set("myProfileId", id); } catch (e) {}
        }
      }
      setProfileId(id);

      let p = null;
      try {
        const r = await window.storage.get(`profile:${id}`, true);
        if (r) p = JSON.parse(r.value);
      } catch (e) {}

      if (p) setPointAdjustment(p.pointAdjustment || 0);

      if (!p || !p.registered) {
        setAuthPhase("register");
      } else if (p.blocked) {
        setAuthPhase("blocked");
      } else if (!p.approved) {
        setAuthPhase("pending");
      } else {
        setAuthPhase("ready");
      }

      const keys = ["meals", "water", "conditions", "growth", "workouts", "monthly", "sessions", "personalLogs", "comments"];
      const setters = [setMeals, setWater, setConditions, setGrowth, setWorkouts, setMonthly, setSessions, setPersonalLogs, setComments];
      const defaults = [[], {}, [], [], [], [], [], [], []];
      for (let i = 0; i < keys.length; i++) {
        try {
          const r = await window.storage.get(`data:${id}:${keys[i]}`, true);
          setters[i](r ? JSON.parse(r.value) : defaults[i]);
        } catch (e) { setters[i](defaults[i]); }
      }
      setLoaded(true);
    })();
  }, []);

  // personalLogs, comments, pointAdjustment, and growth entries added by a trainer are all
  // written from the admin app, not by this app, so re-fetch them (instead of auto-saving)
  // whenever the member views a tab that shows them, to pick up anything the trainer has
  // added since the app was opened. Growth is also re-fetched here (rather than only on
  // "growth") so a member who opens the growth tab and adds their own entry appends on top
  // of the latest data instead of a possibly-stale copy that would silently drop a trainer's entry.
  useEffect(() => {
    if (!loaded || !profileId || !["status", "report", "comments", "growth"].includes(tab)) return;
    (async () => {
      try {
        const r = await window.storage.get(`profile:${profileId}`, true);
        if (r) setPointAdjustment(JSON.parse(r.value).pointAdjustment || 0);
      } catch (e) {}
      try {
        const r = await window.storage.get(`data:${profileId}:personalLogs`, true);
        setPersonalLogs(r ? JSON.parse(r.value) : []);
      } catch (e) {}
      try {
        const r = await window.storage.get(`data:${profileId}:comments`, true);
        setComments(r ? JSON.parse(r.value) : []);
      } catch (e) {}
      try {
        const r = await window.storage.get(`data:${profileId}:growth`, true);
        setGrowth(r ? JSON.parse(r.value) : []);
      } catch (e) {}
    })();
  }, [tab, loaded, profileId]);

  useEffect(() => { if (loaded && profileId) window.storage.set(`data:${profileId}:monthly`, JSON.stringify(monthly), true).catch(() => {}); }, [monthly, loaded, profileId]);
  useEffect(() => { if (loaded && profileId) window.storage.set(`data:${profileId}:sessions`, JSON.stringify(sessions), true).catch(() => {}); }, [sessions, loaded, profileId]);

  useEffect(() => { if (loaded && profileId) window.storage.set(`data:${profileId}:meals`, JSON.stringify(meals), true).catch(() => {}); }, [meals, loaded, profileId]);
  useEffect(() => { if (loaded && profileId) window.storage.set(`data:${profileId}:water`, JSON.stringify(water), true).catch(() => {}); }, [water, loaded, profileId]);
  useEffect(() => { if (loaded && profileId) window.storage.set(`data:${profileId}:conditions`, JSON.stringify(conditions), true).catch(() => {}); }, [conditions, loaded, profileId]);
  useEffect(() => { if (loaded && profileId) window.storage.set(`data:${profileId}:growth`, JSON.stringify(growth), true).catch(() => {}); }, [growth, loaded, profileId]);
  useEffect(() => { if (loaded && profileId) window.storage.set(`data:${profileId}:workouts`, JSON.stringify(workouts), true).catch(() => {}); }, [workouts, loaded, profileId]);

  useEffect(() => {
    if (!loaded || !profileId) return;
    (async () => {
      try {
        const r = await window.storage.get(`profile:${profileId}`, true);
        const existing = r ? JSON.parse(r.value) : {};
        await window.storage.set(`profile:${profileId}`, JSON.stringify({ ...existing, id: profileId, lastActivityAt: new Date().toISOString() }), true);
      } catch (e) {}
    })();
  }, [meals, water, conditions, growth, workouts, monthly, sessions, loaded, profileId]);

  // While waiting on staff approval, poll periodically for the admin having
  // approved (or blocked) the account — there's no push channel to this app.
  useEffect(() => {
    if (authPhase !== "pending" || !profileId) return;
    const interval = setInterval(async () => {
      try {
        const r = await window.storage.get(`profile:${profileId}`, true);
        if (!r) return;
        const p = JSON.parse(r.value);
        if (p.blocked) setAuthPhase("blocked");
        else if (p.approved) setAuthPhase("ready");
      } catch (e) {}
    }, 6000);
    return () => clearInterval(interval);
  }, [authPhase, profileId]);

  useEffect(() => {
    if (authPhase !== "ready" || !profileId) return;
    (async () => {
      try {
        const r = await window.storage.get(`profile:${profileId}`, true);
        if (!r) return;
        const p = JSON.parse(r.value);
        if (!p.birthdate || !isBirthdayToday(p.birthdate)) return;
        const today = todayISO();
        if (p.lastBirthdayCelebratedOn === today) return;
        setBirthdayOverlay({ name: p.name || "お客様" });
        await patchProfile(profileId, { lastBirthdayCelebratedOn: today });
      } catch (e) {}
    })();
  }, [authPhase, profileId]);

  async function handleRegisterSubmit() {
    if (!regName.trim() || !regFurigana.trim() || !regBirthdate || !regPhone.trim() || !regAddress.trim()) {
      setAuthError("全ての項目を入力してください");
      return;
    }
    setAuthError(null);
    await patchProfile(profileId, {
      name: regName.trim(), furigana: regFurigana.trim(), birthdate: regBirthdate,
      phone: regPhone.trim(), address: regAddress.trim(),
      registered: true, approved: false, blocked: false,
    });
    setAuthPhase("pending");
  }

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(null), 1800); }

  const activeDates = new Set([
    ...meals.map(m => m.date), ...conditions.map(c => c.date), ...workouts.map(w => w.date), ...growth.map(g => g.date),
  ]);
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
  const points = Math.max(0, autoPoints + pointAdjustment);
  const tierIdx = [...TIERS].reverse().find(t => points >= t.min)?.name === undefined ? 0
    : TIERS.findIndex(t => t.name === [...TIERS].reverse().find(tt => points >= tt.min).name);
  const tier = TIERS[tierIdx];
  const nextTier = TIERS[tierIdx + 1];

  function handleSaveApiKey() {
    setApiKey(apiKeyInput.trim());
    setShowSettings(false);
    showToast("APIキーを保存しました");
  }

  return (
    <div style={{
      fontFamily: "'Noto Sans JP', sans-serif",
      background: `radial-gradient(ellipse 120% 40% at 50% 0%, #221F16 0%, ${C.bg2} 45%, ${C.bg} 100%)`,
      minHeight: "100vh", color: C.ivory, display: "flex", flexDirection: "column",
      maxWidth: 480, margin: "0 auto", position: "relative",
    }}>
      <style>{`
        ${FONT_IMPORT}
        * { box-sizing: border-box; }
        input, select, textarea { font-family: 'Noto Sans JP', sans-serif; }
        input:focus, textarea:focus { outline: 1px solid ${C.gold}; outline-offset: 1px; }
        button:focus-visible { outline: 1px solid ${C.gold}; outline-offset: 2px; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-thumb { background: ${C.cardBorder}; border-radius: 4px; }
        @keyframes shine { 0% { background-position: -150% 0; } 100% { background-position: 250% 0; } }
        @keyframes sheetUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes splashFadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes popIn { 0% { opacity: 0; transform: scale(0.4); } 60% { opacity: 1; transform: scale(1.06); } 100% { transform: scale(1); } }
        @keyframes confettiFall { 0% { transform: translateY(-20px) rotate(0deg); opacity: 0.9; } 100% { transform: translateY(110vh) rotate(360deg); opacity: 0; } }
        @keyframes birthdayPop { 0% { opacity: 0; transform: scale(0.3) rotate(-8deg); } 60% { opacity: 1; transform: scale(1.15) rotate(4deg); } 100% { transform: scale(1) rotate(0deg); } }
        @media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
      `}</style>

      {splashPhase !== "gone" && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 50, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", gap: 18,
          background: `radial-gradient(ellipse 90% 60% at 50% 40%, #2A2410 0%, ${C.bg2} 55%, ${C.bg} 100%)`,
          opacity: splashPhase === "fading" ? 0 : 1, transition: "opacity 0.5s ease",
          pointerEvents: splashPhase === "fading" ? "none" : "auto",
        }}>
          <Logo height={90} style={{
            animation: "splashFadeIn 0.7s ease",
            filter: "drop-shadow(0 4px 16px rgba(212,175,55,0.35))",
          }} />
          <div style={{
            fontFamily: "'Noto Serif JP', serif", fontSize: 16, color: C.gold, letterSpacing: 1,
            animation: "splashFadeIn 0.9s ease 0.15s both",
          }}>一緒に頑張っていきましょ!</div>
        </div>
      )}

      {birthdayOverlay && <BirthdayOverlay name={birthdayOverlay.name} onClose={() => setBirthdayOverlay(null)} />}

      {authPhase === "blocked" && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 40, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", gap: 14, padding: 24, textAlign: "center",
          background: `linear-gradient(180deg, ${C.bg2}, ${C.bg})`,
        }}>
          <Logo height={56} style={{ marginBottom: 8 }} />
          <div style={{ fontFamily: "'Noto Serif JP', serif", fontSize: 16, color: C.ivory }}>ご利用を停止しています</div>
          <div style={{ fontSize: 12.5, color: C.dim, lineHeight: 1.8, maxWidth: 280 }}>
            現在このアカウントはご利用いただけません。詳しくはジムまでお問い合わせください。
          </div>
        </div>
      )}

      {authPhase === "register" && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 40, overflowY: "auto", display: "flex", flexDirection: "column",
          alignItems: "center", padding: "40px 24px",
          background: `linear-gradient(180deg, ${C.bg2}, ${C.bg})`,
        }}>
          <Logo height={60} style={{ marginBottom: 8 }} />
          <div style={{ fontSize: 12.5, color: C.dim, marginBottom: 24, textAlign: "center", lineHeight: 1.8 }}>
            ご利用の前に、お客様情報のご登録をお願いいたします。<br />全ての項目が必須です。
          </div>
          <div style={{ width: "100%", maxWidth: 300 }}>
            <div style={{ fontSize: 10.5, color: C.dim, marginBottom: 6 }}>お名前(フルネーム)</div>
            <input value={regName} onChange={e => setRegName(e.target.value)} placeholder="山田 太郎" style={{
              width: "100%", padding: "10px 12px", marginBottom: 12, borderRadius: 8,
              border: `1px solid ${C.cardBorder}`, background: C.card, color: C.ivory, fontSize: 13, boxSizing: "border-box",
            }} />
            <div style={{ fontSize: 10.5, color: C.dim, marginBottom: 6 }}>ふりがな</div>
            <input value={regFurigana} onChange={e => setRegFurigana(e.target.value)} placeholder="やまだ たろう" style={{
              width: "100%", padding: "10px 12px", marginBottom: 12, borderRadius: 8,
              border: `1px solid ${C.cardBorder}`, background: C.card, color: C.ivory, fontSize: 13, boxSizing: "border-box",
            }} />
            <div style={{ fontSize: 10.5, color: C.dim, marginBottom: 6 }}>生年月日</div>
            <input type="date" value={regBirthdate} onChange={e => setRegBirthdate(e.target.value)} style={{
              width: "100%", padding: "10px 12px", marginBottom: 12, borderRadius: 8,
              border: `1px solid ${C.cardBorder}`, background: C.card, color: C.ivory, fontSize: 13, boxSizing: "border-box",
            }} />
            <div style={{ fontSize: 10.5, color: C.dim, marginBottom: 6 }}>電話番号</div>
            <input type="tel" value={regPhone} onChange={e => setRegPhone(e.target.value)} style={{
              width: "100%", padding: "10px 12px", marginBottom: 12, borderRadius: 8,
              border: `1px solid ${C.cardBorder}`, background: C.card, color: C.ivory, fontSize: 13, boxSizing: "border-box",
            }} />
            <div style={{ fontSize: 10.5, color: C.dim, marginBottom: 6 }}>住所</div>
            <input value={regAddress} onChange={e => setRegAddress(e.target.value)} style={{
              width: "100%", padding: "10px 12px", marginBottom: 16, borderRadius: 8,
              border: `1px solid ${C.cardBorder}`, background: C.card, color: C.ivory, fontSize: 13, boxSizing: "border-box",
            }} />
            {authError && <div style={{ color: C.danger, fontSize: 12, marginBottom: 12, textAlign: "center" }}>{authError}</div>}
            <GoldButton onClick={handleRegisterSubmit}>登録する</GoldButton>
          </div>
        </div>
      )}

      {authPhase === "pending" && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 40, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", gap: 14, padding: 24, textAlign: "center",
          background: `linear-gradient(180deg, ${C.bg2}, ${C.bg})`,
        }}>
          <Logo height={56} style={{ marginBottom: 8 }} />
          <div style={{ fontFamily: "'Noto Serif JP', serif", fontSize: 16, color: C.gold }}>ご登録ありがとうございます</div>
          <div style={{ fontSize: 12.5, color: C.dim, lineHeight: 1.8, maxWidth: 280 }}>
            現在スタッフが内容を確認しています。承認が完了すると自動的にご利用いただけるようになりますので、しばらくお待ちください。
          </div>
        </div>
      )}

      {authPhase === "ready" && (
        <>
      <div style={{ padding: "22px 20px 16px", borderBottom: `1px solid ${C.cardBorder}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <Logo height={46} style={{ filter: "drop-shadow(0 2px 6px rgba(212,175,55,0.25))" }} />
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, letterSpacing: 3, color: C.goldDim, marginTop: 6 }}>MEMBERS ONLY</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={() => setShowSettings(true)} aria-label="設定" style={{
              background: "none", border: `1px solid ${C.cardBorder}`, borderRadius: "50%",
              width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", color: C.dim,
            }}>
              <Settings size={14} />
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: 6, border: `1px solid ${tier.color}`, borderRadius: 20, padding: "5px 12px" }}>
              <Crown size={13} color={tier.color} />
              <span style={{ fontSize: 11, color: tier.color, letterSpacing: 1 }}>{tier.name.toUpperCase()}</span>
            </div>
          </div>
        </div>
      </div>

      {showSettings && (
        <div onClick={() => setShowSettings(false)} style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 30,
          display: "flex", alignItems: "flex-end", justifyContent: "center",
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            width: "100%", maxWidth: 480, background: C.card, border: `1px solid ${C.goldDim}`,
            borderBottom: "none", borderRadius: "12px 12px 0 0", padding: 20,
            animation: "sheetUp 0.22s ease",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <span style={{ fontFamily: "'Noto Serif JP', serif", fontSize: 16, color: C.gold }}>設定</span>
              <button onClick={() => setShowSettings(false)} style={{ background: "none", border: "none", color: C.dim, cursor: "pointer" }}><X size={18} /></button>
            </div>
            <div style={{ fontSize: 11.5, color: C.dim, marginBottom: 8 }}>Anthropic APIキー(食事写真・InBody用紙のAI解析に使用)</div>
            <input type="password" value={apiKeyInput} onChange={e => setApiKeyInput(e.target.value)} placeholder="sk-ant-..." style={{
              width: "100%", padding: "10px 12px", marginBottom: 10, borderRadius: 8,
              border: `1px solid ${C.cardBorder}`, background: C.bg, color: C.ivory, fontSize: 13,
            }} />
            <div style={{ fontSize: 10.5, color: C.dim, marginBottom: 16, lineHeight: 1.6 }}>
              このキーはこの端末のブラウザ内(localStorage)にのみ保存されます。画像解析の際、この端末からAnthropic社のAPIへ直接送信されます。console.anthropic.comで発行できます。
            </div>
            <GoldButton onClick={handleSaveApiKey}>保存する</GoldButton>
          </div>
        </div>
      )}

      <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 90px" }}>
        {tab === "meal" && <MealTab meals={meals} water={water}
          onAddMeal={m => { setMeals(p => [m, ...p]); showToast("食事を記録しました"); }}
          onDeleteMeal={id => setMeals(p => p.filter(m => m.id !== id))}
          onAddWater={ml => setWater(p => ({ ...p, [todayISO()]: (p[todayISO()] || 0) + ml }))}
        />}
        {tab === "condition" && <ConditionTab conditions={conditions}
          onSave={entry => { setConditions(p => [entry, ...p.filter(c => c.date !== entry.date)]); showToast("体調を記録しました"); }}
        />}
        {tab === "growth" && <GrowthTab growth={growth}
          onAdd={g => { setGrowth(p => [g, ...p]); showToast("記録しました"); }}
          onDelete={id => setGrowth(p => p.filter(g => g.id !== id))}
          monthly={monthly}
          onAddMonthly={m => { setMonthly(p => [m, ...p]); showToast("月次測定を記録しました"); }}
          onDeleteMonthly={id => setMonthly(p => p.filter(m => m.id !== id))}
        />}
        {tab === "training" && <TrainingTab workouts={workouts}
          onAdd={w => { setWorkouts(p => [w, ...p]); showToast("トレーニングを記録しました"); }}
          onDelete={id => setWorkouts(p => p.filter(w => w.id !== id))}
          sessions={sessions}
          onSaveSession={s => { setSessions(p => [s, ...p.filter(x => x.date !== s.date)]); showToast("セッション情報を記録しました"); }}
        />}
        {tab === "status" && <StatusTab tier={tier} nextTier={nextTier} points={points} tierIdx={tierIdx} profileId={profileId} stats={{
          mealCount: meals.length,
          conditionCount: conditions.length,
          workoutCount: workouts.length,
          monthlyCount: monthly.length,
          latestWeight: [...growth].sort((a, b) => b.date.localeCompare(a.date)).find(g => g.weight)?.weight,
          latestBodyFat: [...growth].sort((a, b) => b.date.localeCompare(a.date)).find(g => g.bodyFat)?.bodyFat,
        }} />}
        {tab === "report" && <ReportTab meals={meals} conditions={conditions} growth={growth} workouts={workouts} water={water} sessions={sessions} monthly={monthly} personalLogs={personalLogs} />}
        {tab === "comments" && <TrainerCommentsTab comments={comments} />}
        {tab === "live" && <LiveStreamTab />}
      </div>

      {toast && (
        <div style={{
          position: "absolute", bottom: 76, left: "50%", transform: "translateX(-50%)",
          background: C.gold, color: "#0D0D0D", padding: "8px 16px", borderRadius: 8,
          fontSize: 12.5, fontWeight: 600, letterSpacing: 0.5, boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
        }}>{toast}</div>
      )}

      <div style={{
        position: "sticky", bottom: 0, display: "flex",
        background: `linear-gradient(180deg, ${C.card} 0%, #17150F 100%)`,
        borderTop: `1px solid ${C.cardBorder}`, borderRadius: "16px 16px 0 0",
        maxWidth: 480, width: "100%", boxShadow: "0 -8px 20px -12px rgba(0,0,0,0.7)",
      }}>
        <TabButton active={tab === "status"} onClick={() => setTab("status")} icon={Crown} label="登録" />
        <TabButton active={tab === "condition"} onClick={() => setTab("condition")} icon={Brain} label="体調" />
        <TabButton active={tab === "meal"} onClick={() => setTab("meal")} icon={Utensils} label="食事" />
        <TabButton active={tab === "training"} onClick={() => setTab("training")} icon={Dumbbell} label="トレーニング" />
        <TabButton active={tab === "growth"} onClick={() => setTab("growth")} icon={TrendingUp} label="成長" />
        <TabButton active={tab === "report"} onClick={() => setTab("report")} icon={BarChart3} label="レポート" />
        <TabButton active={tab === "comments"} onClick={() => setTab("comments")} icon={MessageSquare} label="コメント" />
        <TabButton active={tab === "live"} onClick={() => setTab("live")} icon={Play} label="配信" />
      </div>
        </>
      )}
    </div>
  );
}

/* ---------------- Meal Tab ---------------- */

const PRESETS = [
  { name: "TTスムージー", calories: 400, protein: 12, fat: 22, carb: 45, fiber: 4.8, sugar: 18.5, satFat: 14.1, monoFat: 1.2, polyFat: 4.5, transFat: 0.0, cholesterol: 0, sodium: 28, potassium: 520, vitaminA: 115, vitaminC: 78, calcium: 85, iron: 1.8 },
];

const PROGRAM_DAYS = [
  { day: 1, week: 1, title: "デトックス&リセット期", calories: 1420, protein: 72, fat: 42, carb: 188, fiber: 13.8, sugar: 74.0, satFat: 17.3, monoFat: 5.9, polyFat: 10.5, transFat: 0.0, cholesterol: 63, sodium: 2378, potassium: 1680, vitaminA: 162, vitaminC: 91, calcium: 385, iron: 6.5, extraPartial: false,
    breakfast: "白湯(1杯)+TTデトックススムージー", lunch: "十割そば、大根おろし、なめこ、あおさと豆腐の味噌汁", dinner: "焼き鮭、わかめと豆腐の味噌汁、冷奴1/2丁" },
  { day: 2, week: 1, title: "デトックス&リセット期", calories: 1450, protein: 78, fat: 48, carb: 176, fiber: 17.1, sugar: 68.2, satFat: 25.7, monoFat: 16.3, polyFat: 12.4, transFat: 0.0, cholesterol: 282, sodium: 2158, potassium: 2080, vitaminA: 413, vitaminC: 120, calcium: 340, iron: 7.8, extraPartial: false,
    breakfast: "白湯(1杯)+TTデトックススムージー", lunch: "玄米120g、納豆、めかぶ、椎茸の味噌汁、ゆで卵1個", dinner: "豚肉の生姜焼き(ロース120g)、ほうれん草の味噌汁、千切りキャベツ" },
  { day: 3, week: 1, title: "デトックス&リセット期", calories: 1300, protein: 65, fat: 40, carb: 170,
    breakfast: "白湯(1杯)+TTデトックススムージー", lunch: "アジの開き、生野菜サラダ(岩塩・レモン)、干し椎茸の味噌汁", dinner: "真鯛のムニエル、大根ステーキ、あさり汁" },
  { day: 4, week: 1, title: "デトックス&リセット期(夜・超軽量日)", calories: 1480, protein: 82, fat: 52, carb: 171,
    breakfast: "白湯(1杯)+TTデトックススムージー", lunch: "玄米150g、豚肉と白菜の重ね蒸し、刺身盛り合わせ、きくらげの味噌汁", dinner: "あさり汁、冷奴1/2丁のみ" },
  { day: 5, week: 1, title: "デトックス&リセット期", calories: 1430, protein: 75, fat: 48, carb: 174,
    breakfast: "白湯(1杯)+TTデトックススムージー", lunch: "とろろ十割そば、舞茸の味噌汁、温泉卵", dinner: "カツオのたたき(7切れ)、厚揚げ焼き、海藻サラダ、豆腐の味噌汁" },
  { day: 6, week: 1, title: "デトックス&リセット期(夜・超軽量日)", calories: 1390, protein: 75, fat: 52, carb: 155,
    breakfast: "白湯(1杯)+TTデトックススムージー", lunch: "玄米おにぎり1個、具だくさん豚汁、豆腐ハンバーグ、キノコソテー", dinner: "キャベツと生姜のスープのみ" },
  { day: 7, week: 1, title: "リセット日", calories: 1050, protein: 42, fat: 28, carb: 155,
    breakfast: "梅流し(大根と梅干しの煮汁)", lunch: "茹で大根、玄米粥120g、納豆", dinner: "しじみの味噌汁、冷奴、温泉卵" },
  { day: 8, week: 2, title: "血管クレンズ", calories: 1780, protein: 115, fat: 55, carb: 206, fiber: 8.3, sugar: 61.5, satFat: 7.4, monoFat: 9.7, polyFat: 4.9, transFat: 0.0, cholesterol: 553, sodium: 1740, potassium: 1190, vitaminA: 255, vitaminC: 77, calcium: 140, iron: 4.7, extraPartial: true,
    breakfast: "玄米150g、卵2個のTKG、あおさ汁、ブルーベリー20粒", lunch: "鶏もも肉の生姜焼き150g、ブロッコリーとトマトのサラダ", dinner: "鯖の塩焼き、玄米150g、冷奴、わかめ味噌汁" },
  { day: 9, week: 2, title: "消化酵素ブースト", calories: 1720, protein: 118, fat: 52, carb: 195,
    breakfast: "キウイ1個、ゆで卵2個、納豆、玄米120g", lunch: "玄米150g、銀だら西京焼き、椎茸の味噌汁、小松菜お浸し", dinner: "豚しゃぶサラダ(トマトスライス1個分)、わかめ味噌汁、冷奴" },
  { day: 10, week: 2, title: "抗酸化リカバリー", calories: 1810, protein: 125, fat: 58, carb: 202, fiber: 5.2, sugar: 58.5, satFat: 3.8, monoFat: 4.6, polyFat: 2.2, transFat: 0.0, cholesterol: 420, sodium: 450, potassium: 620, vitaminA: 155, vitaminC: 10, calcium: 75, iron: 2.8, extraPartial: true,
    breakfast: "山芋と卵2個のオーブン焼き、玄米150g、ブルーベリー15粒", lunch: "玄米親子丼(鶏100g・卵2個)、冷やしトマト", dinner: "カツオのたたき7切れ、納豆、ワカメ味噌汁、玄米120g" },
  { day: 11, week: 2, title: "腸内環境とビタミン", calories: 1750, protein: 108, fat: 48, carb: 221,
    breakfast: "キウイ1個、ゆで卵2個、玄米150g、あさり味噌汁", lunch: "鮭ときのこの玄米炊き込みご飯(1.5膳)、トマトとワカメの酢の物", dinner: "鶏つくね塩焼き150g、枝豆、しじみ汁、冷奴" },
  { day: 12, week: 2, title: "鉄分とリコピン", calories: 1880, protein: 135, fat: 68, carb: 182, fiber: 6.8, sugar: 55.0, satFat: 4.8, monoFat: 5.5, polyFat: 0.9, transFat: 0.2, cholesterol: 134, sodium: 680, potassium: 1250, vitaminA: 82, vitaminC: 75, calcium: 65, iron: 6.2, extraPartial: true,
    breakfast: "納豆玄米150g、しらす、ゆで卵1個、ブルーベリー20粒", lunch: "牛赤身ステーキ200g、ブロッコリー、トマト煮込み、玄米150g", dinner: "焼き鳥(塩)5本、塩昆布キャベツ、もずくレモン" },
  { day: 13, week: 2, title: "スーパーフード補給", calories: 1790, protein: 112, fat: 56, carb: 209, fiber: 6.1, sugar: 53.5, satFat: 2.2, monoFat: 6.1, polyFat: 2.8, transFat: 0.0, cholesterol: 75, sodium: 920, potassium: 910, vitaminA: 45, vitaminC: 22, calcium: 48, iron: 2.4, extraPartial: true,
    breakfast: "卵3個のオムレツ、さつまいも150g、キウイ1個、あおさ汁", lunch: "特製海鮮丼(玄米150g、マグロ・タイ等)、トマトとアボカドの和え物", dinner: "蓮根の鶏肉はさみ焼き、もずく酢、豆腐の味噌汁" },
  { day: 14, week: 2, title: "トータルコンディショニング", calories: 1760, protein: 118, fat: 48, carb: 214,
    breakfast: "梨1/2個、ブルーベリー15粒、素焼きナッツ、ゆで卵2個、玄米120g", lunch: "十割そば、舞茸のホイル焼き、温泉卵2個、冷やしトマト", dinner: "鯛のあら汁、玄米150g、小松菜お浸し、納豆、冷奴、キウイ1個" },
];

const INGREDIENT_CATEGORIES = [
  { key: "carb", label: "炭水化物" },
  { key: "fat", label: "脂質" },
  { key: "protein", label: "タンパク質" },
  { key: "dish", label: "料理" },
  { key: "store", label: "お店" },
];

const INGREDIENTS = {
  carb: [
    { name: "白米", calories: 315, protein: 2.5, fat: 0.5, carb: 75, fiber: 1.5, sugar: 35.6, satFat: 0.09, monoFat: 0.08, polyFat: 0.11, transFat: 0.0, cholesterol: 0, sodium: 1, potassium: 29, vitaminA: 0, vitaminC: 0, calcium: 3, iron: 0.1 },
    { name: "玄米", calories: 370, protein: 3.5, fat: 2, carb: 77, fiber: 1.4, sugar: 34.2, satFat: 0.38, monoFat: 0.38, polyFat: 0.45, transFat: 0.0, cholesterol: 0, sodium: 1, potassium: 95, vitaminA: 0, vitaminC: 0, calcium: 7, iron: 0.6 },
    { name: "オートミール", calories: 400, protein: 15, fat: 7, carb: 70, fiber: 9.4, sugar: 59.7, satFat: 1.02, monoFat: 1.95, polyFat: 2.14, transFat: 0.0, cholesterol: 0, sodium: 3, potassium: 260, vitaminA: 0, vitaminC: 0, calcium: 47, iron: 3.9 },
    { name: "さつまいも", calories: 130, protein: 1.5, fat: 0.2, carb: 130, fiber: 2.3, sugar: 30.3, satFat: 0.05, monoFat: 0.01, polyFat: 0.08, transFat: 0.0, cholesterol: 0, sodium: 10, potassium: 490, vitaminA: 1, vitaminC: 20, calcium: 20, iron: 0.6 },
    { name: "ジャガイモ", calories: 80, protein: 2.5, fat: 0.2, carb: 20, fiber: 1.3, sugar: 16.3, satFat: 0.02, monoFat: 0.0, polyFat: 0.05, transFat: 0.0, cholesterol: 0, sodium: 1, potassium: 410, vitaminA: 0, vitaminC: 35, calcium: 3, iron: 0.4 },
    { name: "餅", calories: 250, protein: 3, fat: 1, carb: 50, fiber: 0.8, sugar: 49.5, satFat: 0.13, monoFat: 0.13, polyFat: 0.19, transFat: 0.0, cholesterol: 0, sodium: 2, potassium: 23, vitaminA: 0, vitaminC: 0, calcium: 2, iron: 0.2 },
    { name: "バナナ", calories: 100, protein: 1.5, fat: 0.5, carb: 23, fiber: 1.1, sugar: 21.4, satFat: 0.12, monoFat: 0.02, polyFat: 0.08, transFat: 0.0, cholesterol: 0, sodium: 0, potassium: 360, vitaminA: 5, vitaminC: 16, calcium: 6, iron: 0.3 },
    { name: "りんご", calories: 60, protein: 0.5, fat: 0.1, carb: 15, fiber: 1.4, sugar: 14.1, satFat: 0.02, monoFat: 0.01, polyFat: 0.04, transFat: 0.0, cholesterol: 0, sodium: 0, potassium: 120, vitaminA: 2, vitaminC: 4, calcium: 3, iron: 0.1 },
    { name: "マンゴー", calories: 70, protein: 1.0, fat: 0.4, carb: 15, fiber: 1.3, sugar: 15.6, satFat: 0.08, monoFat: 0.07, polyFat: 0.05, transFat: 0.0, cholesterol: 0, sodium: 1, potassium: 170, vitaminA: 61, vitaminC: 20, calcium: 15, iron: 0.2 },
    { name: "パイナップル", calories: 60, protein: 1, fat: 0.1, carb: 15 },
    { name: "キウイ", calories: 70, protein: 1.5, fat: 0.5, carb: 15, fiber: 2.6, sugar: 10.8, satFat: 0.04, monoFat: 0.04, polyFat: 0.23, transFat: 0.0, cholesterol: 0, sodium: 1, potassium: 300, vitaminA: 4, vitaminC: 71, calcium: 33, iron: 0.3 },
    { name: "グレープフルーツ", calories: 40, protein: 1, fat: 0.1, carb: 40 },
    { name: "いちご", calories: 35, protein: 1, fat: 0.3, carb: 35, fiber: 1.4, sugar: 7.1, satFat: 0.02, monoFat: 0.02, polyFat: 0.11, transFat: 0.0, cholesterol: 0, sodium: 1, potassium: 170, vitaminA: 1, vitaminC: 62, calcium: 17, iron: 0.3 },
    { name: "雑穀米(炊き上がり)", calories: 150, protein: 3.2, fat: 1.0, carb: 33.3 },
    { name: "蕎麦(ゆで)", calories: 130, protein: 4.8, fat: 0.9, carb: 26.0 },
    { name: "うどん(ゆで)", calories: 95, protein: 2.6, fat: 0.4, carb: 20.8 },
  ],
  fat: [
    { name: "アボカド", calories: 190, protein: 2.5, fat: 20, carb: 9, fiber: 5.6, sugar: 0.9, satFat: 2.8, monoFat: 10.2, polyFat: 2.2, transFat: 0.0, cholesterol: 0, sodium: 7, potassium: 720, vitaminA: 7, vitaminC: 15, calcium: 9, iron: 0.7 },
    { name: "ひまわりの種", calories: 600, protein: 20, fat: 52, carb: 23 },
    { name: "アーモンド", calories: 616, protein: 25, fat: 52, carb: 12, fiber: 10.1, sugar: 9.6, satFat: 3.8, monoFat: 32.1, polyFat: 12.3, transFat: 0.0, cholesterol: 0, sodium: 1, potassium: 770, vitaminA: 0, vitaminC: 0, calcium: 240, iron: 3.7 },
    { name: "くるみ", calories: 700, protein: 15, fat: 70, carb: 15 },
    { name: "オリーブオイル", calories: 900, protein: 0, fat: 100, carb: 0, fiber: 0.0, sugar: 0.0, satFat: 14.0, monoFat: 73.0, polyFat: 10.5, transFat: 0.0, cholesterol: 0, sodium: 0, potassium: 0, vitaminA: 0, vitaminC: 0, calcium: 0, iron: 0.0 },
    { name: "ごま油", calories: 900, protein: 0, fat: 100, carb: 0 },
  ],
  protein: [
    { name: "鯖(さば)", calories: 211, protein: 20.6, fat: 16.8, carb: 0 },
    { name: "鰯(いわし)", calories: 217, protein: 19.8, fat: 13.9, carb: 0 },
    { name: "鰹(カツオ)", calories: 200, protein: 25, fat: 4, carb: 0 },
    { name: "鱈(タラ)", calories: 100, protein: 20, fat: 2, carb: 0 },
    { name: "鮪(マグロ)", calories: 165, protein: 30, fat: 5, carb: 0 },
    { name: "鮭(シャケ)", calories: 127, protein: 22.5, fat: 4.5, carb: 0, fiber: 0.0, sugar: 0.1, satFat: 0.74, monoFat: 1.53, polyFat: 1.34, transFat: 0.0, cholesterol: 63, sodium: 53, potassium: 350, vitaminA: 12, vitaminC: 0, calcium: 7, iron: 0.5 },
    { name: "サーモン", calories: 223, protein: 19.6, fat: 17, carb: 0 },
    { name: "鰻(うなぎ)", calories: 300, protein: 20.7, fat: 25.8, carb: 0 },
    { name: "秋刀魚(さんま)", calories: 232, protein: 19.3, fat: 19, carb: 0 },
    { name: "鯛(たい)", calories: 186, protein: 22.7, fat: 12, carb: 0 },
    { name: "鯵(あじ)", calories: 268, protein: 24, fat: 18.6, carb: 3.5 },
    { name: "鰆(さわら)", calories: 184, protein: 23.6, fat: 10.8, carb: 0 },
    { name: "ほっけ", calories: 179, protein: 23.1, fat: 10.9, carb: 0 },
    { name: "鱒(マス)", calories: 146, protein: 20.9, fat: 7.4, carb: 0.6 },
    { name: "鰤(ブリ)", calories: 260, protein: 26.2, fat: 20.4, carb: 0 },
    { name: "カジキ", calories: 202, protein: 27.5, fat: 11.1, carb: 0 },
    { name: "フグ", calories: 125, protein: 20, fat: 5, carb: 0 },
    { name: "鮎(あゆ)", calories: 180, protein: 9.5, fat: 17.5, carb: 0 },
    { name: "イカ", calories: 127, protein: 21.4, fat: 1.8, carb: 7.7 },
    { name: "タコ", calories: 61, protein: 13.4, fat: 0.9, carb: 0 },
    { name: "帆立(ホタテ)", calories: 66, protein: 13.5, fat: 0.9, carb: 0 },
    { name: "牡蠣(かき)", calories: 58, protein: 6.9, fat: 2.2, carb: 4.9 },
    { name: "サザエ", calories: 91, protein: 21.3, fat: 0.4, carb: 1 },
    { name: "ハマグリ", calories: 70, protein: 13.3, fat: 1, carb: 2.8 },
    { name: "つぶ貝", calories: 197, protein: 25.2, fat: 0.6, carb: 22.8 },
    { name: "カニ", calories: 65, protein: 15, fat: 0.6, carb: 0 },
    { name: "アワビ", calories: 74, protein: 14.6, fat: 0.4, carb: 3.3 },
    { name: "赤貝", calories: 70, protein: 13.5, fat: 0.3, carb: 3.5 },
    { name: "ホッキ貝", calories: 66, protein: 11.1, fat: 1.1, carb: 3.8 },
    { name: "馬肉", calories: 110, protein: 20.1, fat: 2.5, carb: 0.3 },
    { name: "牛ヒレ", calories: 133, protein: 20.5, fat: 4.8, carb: 0.3 },
    { name: "牛もも", calories: 182, protein: 21.2, fat: 9.6, carb: 0.5, fiber: 0.0, sugar: 0.2, satFat: 1.72, monoFat: 2.01, polyFat: 0.18, transFat: 0.1, cholesterol: 67, sodium: 51, potassium: 340, vitaminA: 1, vitaminC: 0, calcium: 4, iron: 2.7 },
    { name: "牛肩・赤身", calories: 130, protein: 20.4, fat: 4.6, carb: 0.1 },
    { name: "牛リブロース・赤身", calories: 174, protein: 21.1, fat: 8.9, carb: 0.4 },
    { name: "牛ランプ・赤身", calories: 121, protein: 21.6, fat: 3, carb: 0.5 },
    { name: "牛ハツ", calories: 142, protein: 16.5, fat: 7.6, carb: 0.1 },
    { name: "牛レバー", calories: 132, protein: 19.6, fat: 3.7, carb: 3.7 },
    { name: "牛スジ", calories: 155, protein: 28.3, fat: 4.9, carb: 0 },
    { name: "鶏ささみ", calories: 105, protein: 23, fat: 0.8, carb: 0, fiber: 0.0, sugar: 0.0, satFat: 0.24, monoFat: 0.22, polyFat: 0.22, transFat: 0.0, cholesterol: 67, sodium: 43, potassium: 360, vitaminA: 3, vitaminC: 0, calcium: 3, iron: 0.2 },
    { name: "鶏もも", calories: 107, protein: 14.3, fat: 3.28, carb: 0 },
    { name: "鶏胸", calories: 108, protein: 22.3, fat: 1.5, carb: 0, fiber: 0.0, sugar: 0.0, satFat: 0.51, monoFat: 0.58, polyFat: 0.38, transFat: 0.0, cholesterol: 67, sodium: 42, potassium: 350, vitaminA: 4, vitaminC: 0, calcium: 4, iron: 0.3 },
    { name: "卵", calories: 142, protein: 12.2, fat: 10.2, carb: 0.4, fiber: 0.0, sugar: 0.2, satFat: 2.87, monoFat: 3.86, polyFat: 1.47, transFat: 0.0, cholesterol: 420, sodium: 140, potassium: 130, vitaminA: 150, vitaminC: 0, calcium: 51, iron: 1.8 },
    { name: "納豆", calories: 184, protein: 16.5, fat: 10, carb: 12.1 },
    { name: "大豆", calories: 163, protein: 14.8, fat: 9.8, carb: 8.4 },
    { name: "枝豆", calories: 118, protein: 11.5, fat: 6.1, carb: 8.9 },
    { name: "豆腐", calories: 72, protein: 6.6, fat: 4.2, carb: 1.6, fiber: 1.1, sugar: 0.4, satFat: 0.61, monoFat: 0.77, polyFat: 2.22, transFat: 0.0, cholesterol: 0, sodium: 7, potassium: 110, vitaminA: 0, vitaminC: 0, calcium: 93, iron: 1.5 },
    { name: "ブロッコリー", calories: 43.6, protein: 3, fat: 0.4, carb: 7, fiber: 4.3, sugar: 0.9, satFat: 0.07, monoFat: 0.01, polyFat: 0.22, transFat: 0.0, cholesterol: 0, sodium: 17, potassium: 210, vitaminA: 72, vitaminC: 55, calcium: 43, iron: 0.9 },
    { name: "アスパラガス", calories: 21, protein: 2.6, fat: 0.2, carb: 3.9 },
    { name: "えんどう豆", calories: 310, protein: 21.7, fat: 2.3, carb: 60.4 },
    { name: "芽キャベツ", calories: 51, protein: 5.3, fat: 0.1, carb: 9.8 },
    { name: "味噌", calories: 268, protein: 7.5, fat: 2.3, carb: 54.4 },
    { name: "豚ヒレ肉", calories: 115, protein: 22.2, fat: 1.9, carb: 0.2 },
    { name: "豚もも肉(脂身なし)", calories: 119, protein: 21.5, fat: 3.4, carb: 0.2 },
    { name: "豚ロース肉(脂身なし)", calories: 140, protein: 21.1, fat: 5.6, carb: 0.3 },
    { name: "ギリシャヨーグルト(無糖)", calories: 60, protein: 10.0, fat: 0.0, carb: 4.8 },
    { name: "ちくわ", calories: 117, protein: 12.2, fat: 2.0, carb: 12.5 },
  ],
  dish: [
    { name: "卵かけご飯(TKG)", calories: 318, protein: 8.7, fat: 6.3, carb: 55.8, note: "白米150g+生卵1個+醤油少々" },
    { name: "納豆ご飯", calories: 348, protein: 11.1, fat: 5.5, carb: 62.1, note: "白米150g+納豆1パック50g" },
    { name: "鶏胸肉とブロッコリーのサラダ", calories: 143, protein: 24.7, fat: 1.8, carb: 5.6, note: "皮なし鶏胸肉100g+ブロッコリー80g(ノンオイル)" },
    { name: "具だくさん味噌汁", calories: 50, protein: 3.0, fat: 1.2, carb: 6.5, note: "豆腐、わかめ、大根など一般的な具材" },
    { name: "豚汁", calories: 120, protein: 7.5, fat: 6.0, carb: 9.0, note: "豚もも肉20g、根菜類、豆腐など" },
    { name: "サバの塩焼き定食", calories: 610, protein: 28.5, fat: 19.5, carb: 65.0, note: "白米150g+サバ塩焼き100g+味噌汁+小鉢" },
    { name: "シャケの定食", calories: 490, protein: 29.0, fat: 7.5, carb: 64.5, note: "白米150g+焼き鮭100g+味噌汁+小鉢" },
    { name: "親子丼", calories: 550, protein: 30.0, fat: 11.5, carb: 75.0, note: "鶏肉と卵でPは高め。ご飯の量でCが変動しやすい" },
    { name: "鰻重", calories: 720, protein: 26.5, fat: 25.0, carb: 90.0, note: "良質な脂質だが炭水化物も高め" },
    { name: "麻婆豆腐定食", calories: 780, protein: 28.0, fat: 28.0, carb: 95.0, note: "挽き肉と油で脂質が高め" },
    { name: "天津飯", calories: 650, protein: 16.5, fat: 15.0, carb: 105.0, note: "餡の片栗粉とご飯でCが高め" },
    { name: "餃子定食", calories: 750, protein: 22.0, fat: 24.0, carb: 102.0, note: "餃子の餡と皮で高カロリー" },
    { name: "青椒肉絲定食", calories: 710, protein: 24.0, fat: 22.0, carb: 96.0, note: "肉と野菜のバランスは良いが炒め油の脂質あり" },
    { name: "唐揚げ定食", calories: 880, protein: 35.0, fat: 36.0, carb: 98.0, note: "揚げ物のため脂質が高い。減量中は注意" },
    { name: "トンカツ定食(ロース)", calories: 950, protein: 33.0, fat: 45.0, carb: 96.0, note: "ロース肉の脂身+揚げ油でかなりの高脂質" },
    { name: "牛丼(並盛)", calories: 680, protein: 20.0, fat: 24.0, carb: 91.0, note: "バラ肉使用で見た目以上に脂質が高い" },
    { name: "ヒレカツ定食", calories: 780, protein: 36.0, fat: 24.0, carb: 98.0, note: "ロースカツより脂質は控えめ" },
    { name: "高級洋食コース(全10品)", calories: 1250, protein: 55.0, fat: 68.0, carb: 90.0, note: "アミューズ〜デザート全10品。バターやソースで脂質が高め" },
    { name: "高級和食コース(懐石全10品)", calories: 850, protein: 48.0, fat: 22.0, carb: 110.0, note: "先付〜甘味まで。品数が多く糖質が増えやすい" },
    { name: "高級中華コース(全10品)", calories: 1500, protein: 65.0, fat: 75.0, carb: 140.0, note: "高級食材・炒め物・麺飯・点心など。ハイカロリー" },
    { name: "高級寿司(全10品)", calories: 580, protein: 32.0, fat: 10.0, carb: 85.0, note: "つまみ+握り+汁物など。通常より低C・低脂質" },
    { name: "高級焼肉(全10品)", calories: 1100, protein: 58.0, fat: 78.0, carb: 55.0, note: "希少部位や上質な脂で高脂質" },
    { name: "コブサラダ", calories: 320, protein: 12.5, fat: 25.0, carb: 8.5, note: "野菜、アボカド、ゆで卵、鶏肉、チーズ等にコブドレッシング。Pは摂れるが脂質は高め" },
    { name: "グリーンサラダ", calories: 85, protein: 1.2, fat: 6.2, carb: 5.0, note: "レタス・キャベツ・きゅうり・トマト等にドレッシング大さじ1。カロリーと脂質の大半はドレッシング由来" },
    { name: "火鍋(麻辣・白湯/〆なし)", calories: 420, protein: 26.0, fat: 28.0, carb: 14.0, note: "豚肉・ラム肉・野菜・豆腐など。ラー油等で脂質は高めだが糖質は低い" },
  ],
  store: [
    { name: "大戸屋: チキンかあさん煮定食", calories: 870, protein: 32.5, fat: 28.5, carb: 115.0, note: "大戸屋の超定番。揚げたチキンを煮込むため脂質はやや高め" },
    { name: "大戸屋: しまほっけの炭火焼き定食", calories: 550, protein: 37.0, fat: 12.0, carb: 72.0, note: "減量中の神メニュー。超高タンパク・低脂質" },
    { name: "大戸屋: 鶏と野菜の黒酢あん定食", calories: 805, protein: 28.5, fat: 26.0, carb: 112.0, note: "人気NO.1。根菜が豊富で炭水化物が高め" },
    { name: "大戸屋: すけそう鱈と野菜の黒酢あん定食", calories: 735, protein: 21.0, fat: 22.0, carb: 110.0, note: "鶏肉版よりカロリー・脂質控えめ" },
    { name: "大戸屋: 炭火焼きチキンの葱ソース定食", calories: 715, protein: 34.5, fat: 21.0, carb: 91.0, note: "揚げずに炭火焼きで脂質抑えめ・高タンパク" },
    { name: "大戸屋: 沖目鯛の醤油麹漬け炭火焼き定食", calories: 590, protein: 29.0, fat: 16.0, carb: 73.0, note: "良質な脂質とタンパク質がしっかり摂れる魚定食" },
    { name: "大戸屋: ばくだん丼", calories: 395, protein: 21.5, fat: 7.5, carb: 61.0, note: "マグロ・納豆・とろろ・オクラ。超低脂質・高タンパク" },
    { name: "大戸屋: 豚と野菜の塩麹炒め定食", calories: 710, protein: 26.5, fat: 22.0, carb: 98.0, note: "黒酢あんより糖質やや抑えめ" },
    { name: "大戸屋: 炭火焼きバジルチキンサラダ定食", calories: 620, protein: 32.0, fat: 18.5, carb: 78.0, note: "野菜も摂れるヘルシーメニュー" },
    { name: "大戸屋: チキン南蛮定食", calories: 990, protein: 36.5, fat: 49.0, carb: 98.0, note: "タルタルと甘酢で脂質は最高クラス" },
    { name: "大戸屋: もろみポークの炭火焼き定食", calories: 820, protein: 28.0, fat: 29.5, carb: 93.0, note: "麹漬け豚肉のジューシーな脂質" },
    { name: "大戸屋: ひじき入り手ごねハンバーグ定食", calories: 730, protein: 25.0, fat: 24.0, carb: 95.0, note: "ひじき・豆腐入りで脂質控えめ" },
    { name: "大戸屋: 豚肩ロースの生姜焼き定食", calories: 850, protein: 29.0, fat: 31.0, carb: 96.0, note: "肩ロース使用で脂質やや高め" },
    { name: "大戸屋: 梅しそ巻きチキンカツ定食", calories: 810, protein: 31.5, fat: 24.5, carb: 102.0, note: "揚げ物のため衣と油でC・F共にしっかりある" },
    { name: "大戸屋: 四元豚のロースかつ定食", calories: 910, protein: 34.0, fat: 38.0, carb: 97.0, note: "王道とんかつ。バルクアップやチート向けのガッツリ系" },
    { name: "大戸屋: 特選三元豚のヒレかつ定食", calories: 790, protein: 38.5, fat: 22.0, carb: 99.0, note: "ロースかつより脂質大幅抑えめ。揚げ物でPをしっかり盛りたい時に優秀" },
    { name: "大戸屋: 香味唐揚げ定食", calories: 895, protein: 39.0, fat: 32.5, carb: 101.0, note: "スパイスの効いたジューシーな唐揚げ。Pはかなり高い" },
    { name: "大戸屋: 炭火焼きうな重", calories: 820, protein: 33.5, fat: 28.0, carb: 102.0, note: "ちょっと贅沢な期間限定・定番メニュー。良質な脂質と高いP・C" },
    { name: "大戸屋: たらと豆腐のあごだし麻辣煮込み定食", calories: 615, protein: 24.0, fat: 15.0, carb: 88.0, note: "低脂質なたら・豆腐メインのヘルシー寄り煮込み" },
    { name: "大戸屋: 大戸屋風たぬきうどん", calories: 410, protein: 11.5, fat: 8.5, carb: 68.0, note: "単品。消化が良く軽めに済ませたい時の定番" },
    { name: "大戸屋: ばくだん小鉢", calories: 165, protein: 11.5, fat: 3.5, carb: 18.0, note: "ばくだん丼の具材単品。Cを自分で調整したい時のサイド" },
    { name: "大戸屋: 麦みそ汁", calories: 75, protein: 3.5, fat: 1.5, carb: 11.0, note: "味噌汁を麦みそ汁に変更した場合のスープ単品の目安" },
    { name: "大戸屋: たっぷり野菜の麦みそ汁", calories: 140, protein: 5.5, fat: 3.5, carb: 19.0, note: "具だくさんな野菜みそ汁。食物繊維が豊富" },
    { name: "大戸屋: ミニ鶏の黒酢あん", calories: 380, protein: 11.0, fat: 15.0, carb: 46.0, note: "単品ミニサイズ。P・Cを少し足したい調整用" },
    { name: "大戸屋: ミニしまほっけ", calories: 160, protein: 21.0, fat: 7.5, carb: 0.5, note: "魚の純粋なPをサイドでスマートに補給できる" },
    { name: "やよい軒: しょうが焼定食", calories: 660, protein: 25.0, fat: 22.0, carb: 88.0, note: "定番。日常使いしやすいバランス" },
    { name: "やよい軒: から揚げ定食(4個)", calories: 790, protein: 36.0, fat: 30.0, carb: 92.0, note: "Pは高いが揚げ物で脂質もしっかり" },
    { name: "やよい軒: カットステーキ定食", calories: 620, protein: 28.0, fat: 17.0, carb: 86.0, note: "赤身肉中心で脂質を抑えたいトレーニーに人気" },
    { name: "やよい軒: チキン南蛮定食", calories: 940, protein: 35.0, fat: 46.0, carb: 95.0, note: "タルタル+揚げ鶏で脂質が高い" },
    { name: "やよい軒: 味噌かつ定食", calories: 910, protein: 32.0, fat: 38.0, carb: 108.0, note: "濃いめの味噌ダレでご飯が進むガッツリ系" },
    { name: "やよい軒: 肉豆腐定食", calories: 580, protein: 24.0, fat: 18.0, carb: 78.0, note: "やよい軒の中ではかなりヘルシー" },
    { name: "やよい軒: サバの塩焼定食", calories: 690, protein: 31.0, fat: 26.0, carb: 85.0, note: "サバの良質な脂質が摂れる定番魚定食" },
    { name: "やよい軒: ミックスとじ定食", calories: 870, protein: 34.0, fat: 32.0, carb: 110.0, note: "カツ・エビフライ・牛肉を卵とじ。揚げ物と卵で脂質・P共に高い" },
    { name: "やよい軒: 和風ハンバーグ定食", calories: 690, protein: 26.0, fat: 21.0, carb: 94.0, note: "おろしポン酢で脂質・カロリー控えめ" },
    { name: "やよい軒: サバの味噌煮定食", calories: 670, protein: 26.0, fat: 23.0, carb: 89.0, note: "甘めの味噌ダレとサバの良質な脂質" },
    { name: "やよい軒: 肉野菜炒め定食", calories: 610, protein: 19.5, fat: 21.0, carb: 84.0, note: "野菜たっぷりでヘルシー。Pはやや控えめ" },
    { name: "やよい軒: コク旨ちゃんぽん", calories: 480, protein: 21.0, fat: 15.0, carb: 65.0, note: "単品。野菜と太麺でCがメイン" },
    { name: "やよい軒: 特から揚げ定食(6個)", calories: 960, protein: 49.0, fat: 41.0, carb: 96.0, note: "Pが約50g摂れる圧倒的バルク飯" },
    { name: "やよい軒: なす味噌と焼魚の定食", calories: 790, protein: 32.0, fat: 29.0, carb: 98.0, note: "品数が多い分脂質は高め" },
    { name: "やよい軒: 地鶏阿波尾鶏の親子丼", calories: 610, protein: 32.0, fat: 12.0, carb: 86.0, note: "鶏肉と卵でPが非常に高く、丼物の中では優秀なPFC" },
    { name: "やよい軒: コク旨ちゃんぽんとから揚げの定食", calories: 890, protein: 39.0, fat: 35.0, carb: 98.0, note: "ちゃんぽん+から揚げ+ご飯の超満腹セット。CもFもMAXクラス" },
    { name: "やよい軒: ロースとんかつ定食", calories: 860, protein: 31.0, fat: 34.0, carb: 98.0, note: "プレーンなとんかつ。大戸屋ロースかつとほぼ同等のパワー" },
    { name: "やよい軒: 宮崎チキン南蛮とエビフライの定食", calories: 1040, protein: 38.0, fat: 52.0, carb: 102.0, note: "やよい軒最強カロリー。脂質50g超のチート飯" },
    { name: "やよい軒: 鉄板カルビ焼肉定食", calories: 780, protein: 24.0, fat: 32.0, carb: 91.0, note: "脂身が多く見た目以上に脂質が強め" },
    { name: "やよい軒: お肉2倍カットステーキ定食", calories: 810, protein: 48.0, fat: 28.0, carb: 88.0, note: "肉2倍のパワープレート。Pを約50g近く摂れるガチ筋トレ飯" },
    { name: "やよい軒: 地鶏阿波尾鶏の親子丼定食", calories: 780, protein: 36.0, fat: 14.5, carb: 112.0, note: "親子丼に味噌汁・小鉢がついた定食。Pは35g超で優秀" },
    { name: "やよい軒: 鉄板牛カルビ焼肉定食(お肉1.5倍)", calories: 960, protein: 31.0, fat: 45.0, carb: 98.0, note: "カルビ肉を増量したパワーメニュー。増量期向け" },
    { name: "やよい軒: ミニすき焼き", calories: 195, protein: 8.5, fat: 11.0, carb: 13.5, note: "サイドメニュー。甘辛いタレの糖質とバラ肉の脂質" },
    { name: "やよい軒: いかから揚げ", calories: 160, protein: 11.0, fat: 8.0, carb: 10.0, note: "サイド用。低脂質に抑えつつPを10g以上プラス" },
    { name: "やよい軒: フライドポテト", calories: 240, protein: 3.5, fat: 11.0, carb: 30.0, note: "サイドの定番。炭水化物と揚げ油の脂質がメイン" },
    { name: "やよい軒: 玉子焼き", calories: 150, protein: 9.0, fat: 11.0, carb: 4.0, note: "人気サイド。卵の良質なPとFを手軽に追加できる" },
    { name: "なかよし: 若鳥のみぞれ和え定食", calories: 760, protein: 32.0, fat: 22.0, carb: 105.0, note: "揚げた鶏肉をおろしポン酢でさっぱり。土鍋ごはんで炭水化物が進む" },
    { name: "なかよし: 肉じゃが定食", calories: 680, protein: 24.0, fat: 16.0, carb: 108.0, note: "じゃがいもと土鍋ごはんで炭水化物がやや高め" },
    { name: "なかよし: サバの味噌煮定食", calories: 710, protein: 30.0, fat: 21.0, carb: 98.0, note: "サバ由来の良質な脂質が摂れる優秀メニュー" },
    { name: "なかよし: チキン南蛮定食", calories: 910, protein: 36.0, fat: 42.0, carb: 102.0, note: "手作りタルタルと土鍋ごはんで満足度・脂質共に高い" },
    { name: "なかよし: 縞ほっけの炭火焼き定食", calories: 580, protein: 38.0, fat: 13.0, carb: 75.0, note: "低脂質・高タンパクでトレーニーの味方" },
    { name: "なかよし: 豚肉と茄子の味噌炒め定食", calories: 790, protein: 26.0, fat: 29.0, carb: 108.0, note: "茄子が油を吸うため脂質は高め" },
    { name: "なかよし: 鶏の唐揚げみぞれ和え定食", calories: 780, protein: 33.0, fat: 24.0, carb: 106.0, note: "から揚げをおろしポン酢でさっぱりと" },
    { name: "なかよし: 豚肉と生姜の甘辛炒め定食", calories: 720, protein: 25.5, fat: 23.0, carb: 101.0, note: "王道の生姜焼きスタイル" },
    { name: "なかよし: 特製タレのユッケ風マグロ丼", calories: 510, protein: 26.0, fat: 8.5, carb: 79.0, note: "マグロ赤身ベースで非常に低脂質" },
    { name: "なかよし: 鶏肉と白菜のトロトロ煮定食", calories: 690, protein: 29.5, fat: 15.5, carb: 101.0, note: "揚げ物ではないため肉メニューの中では低脂質" },
    { name: "なかよし: 特製出汁のタレカツ定食", calories: 920, protein: 34.0, fat: 39.0, carb: 106.0, note: "出汁カツが乗ったガッツリ系" },
    { name: "なかよし: ぶりの照り焼き定食", calories: 680, protein: 31.0, fat: 18.0, carb: 95.0, note: "良質な魚の油(オメガ3)をしっかり補給" },
    { name: "なかよし: 肉豆腐とろろ定食", calories: 640, protein: 25.0, fat: 15.0, carb: 98.0, note: "するっと食べられて低脂質。減量期向き" },
    { name: "なかよし: 季節の天ぷら盛り合わせ定食", calories: 840, protein: 22.0, fat: 28.0, carb: 112.0, note: "衣が油を吸うため脂質と炭水化物が同時に高い" },
    { name: "すき家: 牛丼(並盛)", calories: 730, protein: 22.9, fat: 25.0, carb: 103.0, note: "すき家の王道。バラ肉の脂質はやや高めだがPも20g以上摂れる" },
    { name: "すき家: ねぎ玉牛丼(並盛)", calories: 836, protein: 26.6, fat: 33.3, carb: 104.9, note: "人気NO.1トッピング。卵黄でPアップも脂質も上昇" },
    { name: "すき家: とろ〜り3種のチーズ牛丼(並盛)", calories: 911, protein: 32.5, fat: 40.5, carb: 104.1, note: "チーズたっぷりのガッツリ系バルク飯" },
    { name: "すき家: お食事サラダ 牛", calories: 251, protein: 16.4, fat: 17.5, carb: 7.7, note: "ご飯の代わりに野菜を使った超低糖質メニュー" },
    { name: "すき家: 高菜明太マヨ牛丼(並盛)", calories: 843, protein: 24.3, fat: 34.3, carb: 105.8, note: "人気ジャンク系。明太マヨの分だけ脂質が高め" },
    { name: "すき家: まぐろユッケ丼(並盛)", calories: 647, protein: 29.5, fat: 15.6, carb: 94.7, note: "牛肉より圧倒的に低脂質・高タンパクな優秀丼" },
    { name: "すき家: 牛カレー(並盛)", calories: 785, protein: 25.1, fat: 22.8, carb: 116.7, note: "ルー・ご飯・牛バラ肉で炭水化物が非常に高いガッツリ系" },
    { name: "鳥貴族: もも貴族焼(たれ/2本)", calories: 260, protein: 23.0, fat: 13.0, carb: 11.5, note: "トリキの看板メニュー。2本でP23gは優秀" },
    { name: "鳥貴族: むね貴族焼(塩/2本)", calories: 170, protein: 26.0, fat: 6.0, carb: 1.5, note: "塩で糖質を抑えた圧倒的低脂質・高タンパク" },
    { name: "鳥貴族: ちからこぶ(塩/2本)", calories: 155, protein: 21.0, fat: 7.5, carb: 0.5, note: "手羽元の一部。むね肉に並ぶ高タンパク・低脂質" },
    { name: "鳥貴族: とり雑炊", calories: 205, protein: 11.5, fat: 3.5, carb: 30.0, note: "締めの定番。カロリー・脂質ともに低い" },
    { name: "鳥貴族: つくね(たれ/2本)", calories: 198, protein: 15.5, fat: 10.0, carb: 9.5, note: "人気串。もも肉よりPは下がるがバランス良い" },
    { name: "鳥貴族: かわ(塩/2本)", calories: 320, protein: 11.0, fat: 30.0, carb: 0.5, note: "鶏皮はほぼ脂質の塊。減量中は要注意" },
    { name: "鳥貴族: ささみ塩昆布焼(2本)", calories: 135, protein: 24.5, fat: 1.5, carb: 2.0, note: "トリキ最強クラスの低脂質・高タンパク串" },
    { name: "鳥貴族: トリキのから揚げ", calories: 310, protein: 19.5, fat: 21.0, carb: 10.0, note: "ジューシーな鶏もも肉の唐揚げ" },
    { name: "なか卯: 親子丼(並盛)", calories: 620, protein: 28.5, fat: 14.0, carb: 91.0, note: "こだわりの卵と鶏肉で抜群のPFCバランス" },
    { name: "なか卯: カツ丼(並盛)", calories: 835, protein: 33.5, fat: 31.0, carb: 101.0, note: "揚げたカツを卵でとじ、親子丼より脂質アップ" },
    { name: "なか卯: 鶏唐丼(並盛)", calories: 790, protein: 31.0, fat: 25.5, carb: 104.0, note: "から揚げが乗ったボリューム系" },
    { name: "なか卯: はいからうどん(並/単品)", calories: 380, protein: 10.5, fat: 5.5, carb: 70.0, note: "京風出汁のシンプルなうどん" },
    { name: "なか卯: 和風牛丼(並盛)", calories: 690, protein: 22.0, fat: 21.5, carb: 98.0, note: "すき家より甘めの出汁が特徴" },
    { name: "なか卯: 特製かき揚げ丼(並盛)", calories: 815, protein: 14.0, fat: 31.0, carb: 115.0, note: "衣の油とご飯でFとCが高くPは低め" },
    { name: "なか卯: すだちおろしうどん(並/冷・単品)", calories: 360, protein: 9.0, fat: 1.0, carb: 76.5, note: "脂質がほぼゼロで純粋にカーボを補給できる" },
    { name: "サイゼリヤ: ミラノ風ドリア", calories: 520, protein: 16.0, fat: 23.0, carb: 62.0, note: "サイゼの絶対王者。ホワイト+ミートソースでFはそこそこ" },
    { name: "サイゼリヤ: 若鶏のディアボラ風", calories: 515, protein: 28.0, fat: 41.0, carb: 8.0, note: "皮の脂でFは高いが超低糖質・高タンパク" },
    { name: "サイゼリヤ: 辛味チキン(4本)", calories: 300, protein: 17.5, fat: 22.0, carb: 3.0, note: "皮付き手羽先。脂質メインで糖質はほぼゼロ" },
    { name: "サイゼリヤ: 小エビのサラダ", calories: 115, protein: 5.5, fat: 8.0, carb: 5.0, note: "カロリーの大半はドレッシング由来" },
    { name: "サイゼリヤ: ラムのランプステーキ", calories: 340, protein: 23.0, fat: 26.0, carb: 1.5, note: "L-カルニチン豊富なラム肉。筋トレ民に人気" },
    { name: "サイゼリヤ: チキンのシーザーサラダ", calories: 215, protein: 11.5, fat: 15.0, carb: 6.5, note: "蒸し鶏でPが高め。ドレッシングとチーズで脂質はそこそこ" },
    { name: "サイゼリヤ: バッファローモッツァレラのピザ", calories: 550, protein: 21.0, fat: 24.0, carb: 60.0, note: "チーズの脂質と生地の炭水化物がメイン" },
    { name: "サイゼリヤ: タラコソースシシリー風", calories: 565, protein: 16.5, fat: 21.0, carb: 74.0, note: "たらこソースの脂質とパスタ麺の炭水化物" },
    { name: "サイゼリヤ: ハンバーグステーキ", calories: 360, protein: 18.0, fat: 26.0, carb: 11.0, note: "牛肉の脂質がメイン。ライスなしなら糖質を抑えられる" },
    { name: "すき家: 牛丼(メガ盛)", calories: 1458, protein: 49.6, fat: 56.4, carb: 188.0, note: "超大ボリューム。Pは約50g摂れるがCとFもMAXクラス" },
    { name: "すき家: とろ火豚丼(並盛)", calories: 712, protein: 24.5, fat: 22.1, carb: 103.8, note: "牛丼とほぼ同等のPFCバランスで日常使いしやすい" },
    { name: "すき家: とりそぼろ丼(並盛)", calories: 598, protein: 29.8, fat: 11.8, carb: 93.2, note: "肉丼系の中では脂質が低くPが高めで優秀" },
    { name: "すき家: 旨だし生姜豚丼(並盛)", calories: 732, protein: 25.1, fat: 23.5, carb: 104.5, note: "生姜のアクセントが効いた豚丼" },
    { name: "すき家: キムチ牛丼(並盛)", calories: 758, protein: 24.3, fat: 25.3, carb: 106.1, note: "定番トッピング牛丼。PFCは通常の牛丼に近い" },
    { name: "すき家: おろしポン酢牛丼(並盛)", calories: 748, protein: 23.6, fat: 25.1, carb: 105.1, note: "さっぱり系だが牛バラ肉ベースで脂質はしっかりある" },
    { name: "すき家: 鮭定食(みそ汁付)", calories: 574, protein: 27.2, fat: 11.2, carb: 88.3, note: "低脂質・高タンパクに抑えたい時の超優秀メニュー" },
    { name: "鳥貴族: きも(たれ/2本)", calories: 168, protein: 18.5, fat: 5.5, carb: 11.0, note: "鶏レバー。非常に低脂質・高タンパクな優秀串" },
    { name: "鳥貴族: ハート(たれ/2本)", calories: 195, protein: 16.0, fat: 12.5, carb: 4.5, note: "鶏ハツ。適度な脂質としっかりしたPのバランス" },
    { name: "鳥貴族: 三角(塩/2本)", calories: 290, protein: 12.0, fat: 26.5, carb: 0.2, note: "ぼんじり。ほとんどが脂質で減量中は避けるのが無難" },
    { name: "鳥貴族: カマンベールコロッケ", calories: 285, protein: 7.0, fat: 18.5, carb: 22.5, note: "チーズの脂質と衣・じゃがいもの炭水化物がメイン" },
    { name: "鳥貴族: ピーチチ(塩/2本)", calories: 160, protein: 24.0, fat: 6.5, carb: 0.5, note: "むね肉の部位。超低脂質・高タンパクでトレーニーに人気" },
    { name: "鳥貴族: せせり(塩/2本)", calories: 210, protein: 18.0, fat: 14.5, carb: 0.5, note: "鶏の首肉。Pが高くジューシーな脂質もある" },
    { name: "鳥貴族: なんこつ", calories: 54, protein: 11.5, fat: 0.5, carb: 0.2, note: "ヤゲン軟骨。圧倒的低カロリー・低脂質でダイエットの味方" },
    { name: "なか卯: 特製親子丼(ミニ)", calories: 385, protein: 18.5, fat: 8.5, carb: 58.5, note: "PFCを細かく調整したい時に便利なミニサイズ" },
    { name: "なか卯: 特製かき揚げうどん(並/単品)", calories: 595, protein: 13.0, fat: 20.0, carb: 91.0, note: "かき揚げの衣の油で脂質が大幅アップ" },
    { name: "なか卯: 牛とじ丼(並盛)", calories: 795, protein: 31.0, fat: 26.5, carb: 108.0, note: "卵で閉じることでPが30gを突破するガッツリ飯" },
    { name: "なか卯: 特製親子丼(大盛)", calories: 730, protein: 35.5, fat: 16.5, carb: 115.0, note: "ボリュームアップ版。Pも35g超のバルク飯" },
    { name: "なか卯: 牛肉うどん(並/単品)", calories: 495, protein: 17.5, fat: 11.0, carb: 76.0, note: "うどんより肉の分だけPと脂質がプラス" },
    { name: "なか卯: こだわり卵のプリン", calories: 175, protein: 5.0, fat: 9.0, carb: 18.5, note: "人気デザート。糖質と脂質は多め" },
    { name: "サイゼリヤ: バッファローモッツァレラ", calories: 175, protein: 11.5, fat: 14.0, carb: 1.0, note: "水牛チーズ。超低糖質でPを手軽に確保できる" },
    { name: "サイゼリヤ: チキンジョージア風", calories: 630, protein: 32.0, fat: 52.0, carb: 9.0, note: "Pは高いがソースとチーズの脂質が強烈" },
    { name: "サイゼリヤ: 辛味チキン(Wサイズ/8本)", calories: 600, protein: 35.0, fat: 44.0, carb: 6.0, note: "辛味チキン2倍のバケツサイズ" },
    { name: "サイゼリヤ: イカの墨入りスパゲッティ", calories: 585, protein: 19.5, fat: 21.0, carb: 79.5, note: "ペペロンチーノよりPが高くなる" },
    { name: "サイゼリヤ: フリウリ風フリコ", calories: 345, protein: 13.0, fat: 22.0, carb: 24.0, note: "ポテトとチーズの炭水化物・脂質がメイン" },
    { name: "サイゼリヤ: ポップコーンシュリンプ", calories: 215, protein: 7.0, fat: 14.5, carb: 13.5, note: "衣付きで揚げているため脂質と炭水化物がある" },
    { name: "サイゼリヤ: エスカルゴのオーブン焼き", calories: 225, protein: 6.0, fat: 21.0, carb: 2.5, note: "発酵バターとオイルで脂質が非常に高い" },
    { name: "サイゼリヤ: イタリアンハンバーグ", calories: 550, protein: 24.5, fat: 41.0, carb: 14.0, note: "チーズの分だけPと脂質が大幅アップ" },
    { name: "サイゼリヤ: カルボナーラ", calories: 615, protein: 19.5, fat: 28.0, carb: 71.0, note: "パスタの中でも特に脂質が高い" },
    { name: "サイゼリヤ: ペペロンチーノ", calories: 515, protein: 11.5, fat: 21.0, carb: 70.0, note: "シンプルなパスタ。オリーブオイルの脂質がメイン" },
  ],
};

const STORE_CHAINS = ["大戸屋", "やよい軒", "なかよし", "すき家", "鳥貴族", "なか卯", "サイゼリヤ"];

function MealTab({ meals, water, onAddMeal, onDeleteMeal, onAddWater }) {
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState(null);
  const [preview, setPreview] = useState(null);
  const [showIngredients, setShowIngredients] = useState(false);
  const [showProgram, setShowProgram] = useState(false);
  const [expandedDay, setExpandedDay] = useState(null);
  const [ingCategory, setIngCategory] = useState("carb");
  const [ingChain, setIngChain] = useState("all");
  const [selectedIng, setSelectedIng] = useState(null);
  const [ingGrams, setIngGrams] = useState("100");
  const fileRef = useRef(null);
  const today = todayISO();
  const todaysMeals = meals.filter(m => m.date === today);
  const todaysWater = water[today] || 0;

  const dayTotals = useMemo(() => {
    const t = todaysMeals.reduce((acc, m) => ({
      calories: acc.calories + (m.calories || 0),
      protein: acc.protein + (m.protein || 0),
      fat: acc.fat + (m.fat || 0),
      carb: acc.carb + (m.carb || 0),
    }), { calories: 0, protein: 0, fat: 0, carb: 0 });
    const pGrams = t.protein, fGrams = t.fat, cGrams = t.carb;
    const pCal = pGrams * 4, fCal = fGrams * 9, cCal = cGrams * 4;
    const totalCal = pCal + fCal + cCal || 1;
    return {
      ...t, pGrams, fGrams, cGrams,
      pPct: (pCal / totalCal) * 100, fPct: (fCal / totalCal) * 100, cPct: (cCal / totalCal) * 100,
    };
  }, [todaysMeals]);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setAnalyzing(true);
    try {
      const b64 = await fileToBase64(file);
      const result = await callClaudeVision(b64, file.type || "image/jpeg",
        `この食事の写真を分析してください。料理名、推定カロリー(kcal)、タンパク質(g)、脂質(g)、炭水化物(g)を算出してください。
あわせて、五大栄養素の観点から次の項目も可能な範囲で推定してください: 食物繊維(g)、糖分(g)、ナトリウム(mg)、カリウム(mg)、ビタミンA(%DV目安)、ビタミンC(%DV目安)、カルシウム(%DV目安)、鉄分(%DV目安)。写真から正確に判断できない項目は null にしてください。
小麦・グルテンや超加工食品が含まれると判断した場合は warning を true にし、warningItem に該当食材名、alternative にラグジュアリーで前向きなトーンの日本語の代替提案(例:「これを十割蕎麦に置き換えると、さらに神経伝達と腸内環境が覚醒します」のような文体)を入れてください。含まれない場合は warning: false, warningItem: null, alternative: null としてください。
JSON以外の文字列(前置き、コードブロック記号など)は一切含めず、次の形式のJSONのみを返してください:
{"name": string, "calories": number, "protein": number, "fat": number, "carb": number, "fiber": number|null, "sugar": number|null, "sodium": number|null, "potassium": number|null, "vitaminA": number|null, "vitaminC": number|null, "calcium": number|null, "iron": number|null, "warning": boolean, "warningItem": string|null, "alternative": string|null}`);
      const safe = {
        name: typeof result.name === "string" && result.name.trim() ? result.name.trim() : "食事",
        calories: toNum(result.calories) ?? 0,
        protein: toNum(result.protein) ?? 0,
        fat: toNum(result.fat) ?? 0,
        carb: toNum(result.carb) ?? 0,
        fiber: toNum(result.fiber),
        sugar: toNum(result.sugar),
        sodium: toNum(result.sodium),
        potassium: toNum(result.potassium),
        vitaminA: toNum(result.vitaminA),
        vitaminC: toNum(result.vitaminC),
        calcium: toNum(result.calcium),
        iron: toNum(result.iron),
        warning: !!result.warning,
        warningItem: typeof result.warningItem === "string" ? result.warningItem : null,
        alternative: typeof result.alternative === "string" ? result.alternative : null,
      };
      setPreview({ ...safe, id: uid(), date: today, time: nowTime() });
    } catch (err) {
      if (err.code === "API_KEY_MISSING") {
        setError("APIキーが未設定です。画面右上の⚙アイコンから設定してください。");
      } else {
        setError("解析に失敗しました。もう一度お試しください。");
      }
    } finally {
      setAnalyzing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div>
      <SectionLabel>AI 食事解析</SectionLabel>
      <Card>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button onClick={() => fileRef.current?.click()} style={{
            flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
            background: "none", border: `1px dashed ${C.cardBorderLight}`, borderRadius: 10,
            padding: "18px 0", color: C.gold, cursor: "pointer",
          }}>
            <Camera size={22} />
            <span style={{ fontSize: 12.5 }}>{analyzing ? "解析中…" : "食事の写真を撮影・選択"}</span>
          </button>
          <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{ display: "none" }} />
        </div>
        {error && <div style={{ color: C.danger, fontSize: 12, marginTop: 10 }}>{error}</div>}
      </Card>

      {preview && (
        <Card style={{ borderColor: C.goldDim }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ fontWeight: 600, fontSize: 15 }}>{preview.name}</div>
            <button onClick={() => setPreview(null)} style={{ background: "none", border: "none", color: C.dim, cursor: "pointer" }}><X size={16} /></button>
          </div>
          <div style={{ display: "flex", gap: 14, marginTop: 10, fontFamily: "'Space Mono', monospace", fontSize: 12.5 }}>
            <span>{preview.calories} kcal</span><span style={{ color: C.dim }}>P {preview.protein}g</span>
            <span style={{ color: C.dim }}>F {preview.fat}g</span><span style={{ color: C.dim }}>C {preview.carb}g</span>
          </div>
          {preview.warning && (
            <div style={{ marginTop: 12, padding: 12, background: C.goldSoft, borderLeft: `2px solid ${C.gold}`, borderRadius: 2 }}>
              <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 11.5, color: C.gold, marginBottom: 4 }}>
                <Sparkles size={13} /> {preview.warningItem} を検知
              </div>
              <div style={{ fontSize: 12.5, color: C.ivory, lineHeight: 1.6 }}>{preview.alternative}</div>
            </div>
          )}
          {(preview.fiber != null || preview.sugar != null || preview.sodium != null || preview.potassium != null
            || preview.vitaminA != null || preview.vitaminC != null || preview.calcium != null || preview.iron != null) && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.cardBorder}` }}>
              <div style={{ fontSize: 10.5, color: C.dim, marginBottom: 6 }}>その他の栄養素(参考値)</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, fontFamily: "'Space Mono', monospace", fontSize: 11, color: C.dim }}>
                {preview.fiber != null && <span>食物繊維 {preview.fiber}g</span>}
                {preview.sugar != null && <span>糖分 {preview.sugar}g</span>}
                {preview.sodium != null && <span>ナトリウム {preview.sodium}mg</span>}
                {preview.potassium != null && <span>カリウム {preview.potassium}mg</span>}
                {preview.vitaminA != null && <span>ビタミンA {preview.vitaminA}%</span>}
                {preview.vitaminC != null && <span>ビタミンC {preview.vitaminC}%</span>}
                {preview.calcium != null && <span>カルシウム {preview.calcium}%</span>}
                {preview.iron != null && <span>鉄分 {preview.iron}%</span>}
              </div>
            </div>
          )}
          <div style={{ fontSize: 10.5, color: C.dim, marginTop: 10, lineHeight: 1.5 }}>
            ※AIによる画像からの推定値です。分量の誤差はご了承のうえ、参考値としてご利用ください。その他の栄養素はカロリー/PFC以上に誤差が大きくなります。
          </div>
          <div style={{ marginTop: 12 }}>
            <GoldButton onClick={() => { onAddMeal(preview); setPreview(null); }}>タイムラインに記録</GoldButton>
          </div>
        </Card>
      )}

      <SectionLabel>定番メニュー</SectionLabel>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 4 }}>
        {PRESETS.map(p => (
          <button key={p.name} onClick={() => setPreview({ ...p, id: uid(), date: today, time: nowTime(), warning: false })} style={{
            display: "flex", justifyContent: "space-between", alignItems: "center", background: C.card,
            border: `1px solid ${C.cardBorder}`, borderRadius: 10, padding: "12px 14px", cursor: "pointer", color: C.ivory,
          }}>
            <span style={{ fontSize: 13 }}>{p.name}</span>
            <span style={{ display: "flex", alignItems: "center", gap: 6, color: C.gold }}>
              <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 11 }}>{p.calories}kcal</span><Plus size={14} />
            </span>
          </button>
        ))}
      </div>
      <button onClick={() => setShowProgram(true)} style={{
        width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        background: "none", border: `1px solid ${C.goldDim}`, borderRadius: 10, color: C.gold,
        padding: "11px 0", fontSize: 12.5, cursor: "pointer", marginBottom: 8,
      }}>
        <Sparkles size={14} /> 2週間プログラムを見る
      </button>
      <button onClick={() => setShowIngredients(true)} style={{
        width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        background: "none", border: `1px solid ${C.goldDim}`, borderRadius: 10, color: C.gold,
        padding: "11px 0", fontSize: 12.5, cursor: "pointer", marginBottom: 4,
      }}>
        <Utensils size={14} /> 食材データベースを見る
      </button>

      {showProgram && (
        <div onClick={() => { setShowProgram(false); setExpandedDay(null); }} style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 20,
          display: "flex", alignItems: "flex-end", justifyContent: "center",
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            width: "100%", maxWidth: 480, maxHeight: "78vh", background: C.card,
            borderTop: `1px solid ${C.goldDim}`, borderRadius: "12px 12px 0 0",
            display: "flex", flexDirection: "column", animation: "sheetUp 0.22s ease",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 16px 10px", borderBottom: `1px solid ${C.cardBorder}` }}>
              <span style={{ fontFamily: "'Noto Serif JP', serif", fontSize: 16, color: C.gold }}>2週間プログラム</span>
              <button onClick={() => { setShowProgram(false); setExpandedDay(null); }} style={{ background: "none", border: "none", color: C.dim, cursor: "pointer" }}><X size={18} /></button>
            </div>
            <div style={{ overflowY: "auto", padding: "12px 16px 20px" }}>
              {[1, 2].map(weekNum => (
                <div key={weekNum} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 11, color: C.goldDim, marginBottom: 8, letterSpacing: 1 }}>
                    第{weekNum}週: {weekNum === 1 ? "デトックス&リセット期" : "栄養充填&アルカリ性ボディメイク期"}
                  </div>
                  {PROGRAM_DAYS.filter(d => d.week === weekNum).map(d => {
                    const isOpen = expandedDay === d.day;
                    return (
                      <div key={d.day} style={{ marginBottom: 6 }}>
                        <button onClick={() => setExpandedDay(isOpen ? null : d.day)} style={{
                          width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
                          background: isOpen ? C.goldSoft : C.bg, border: `1px solid ${isOpen ? C.gold : C.cardBorder}`,
                          borderRadius: 10, padding: "10px 12px", cursor: "pointer", color: C.ivory, textAlign: "left",
                        }}>
                          <span style={{ fontSize: 12.5 }}>{d.day}日目: {d.title}</span>
                          <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: C.dim, flexShrink: 0, marginLeft: 8 }}>{d.calories}kcal</span>
                        </button>
                        {isOpen && (
                          <div style={{ padding: "10px 12px", background: C.bg, borderLeft: `2px solid ${C.gold}`, marginTop: 2, fontSize: 12, lineHeight: 1.8, color: C.ivory }}>
                            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: C.dim, marginBottom: 6 }}>
                              P{d.protein}g F{d.fat}g C{d.carb}g
                            </div>
                            <div><span style={{ color: C.gold }}>朝食: </span>{d.breakfast}</div>
                            <div><span style={{ color: C.gold }}>昼食: </span>{d.lunch}</div>
                            <div><span style={{ color: C.gold }}>夜食: </span>{d.dinner}</div>
                            {d.fiber != null && (
                              <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.cardBorder}` }}>
                                <div style={{ fontSize: 10, color: C.dim, marginBottom: 4 }}>
                                  その他の栄養素{d.extraPartial ? "(判明分のみ)" : ""}
                                </div>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, fontFamily: "'Space Mono', monospace", fontSize: 10.5, color: C.dim }}>
                                  <span>食物繊維{d.fiber}g</span><span>糖分{d.sugar}g</span>
                                  <span>ナトリウム{d.sodium}mg</span><span>カリウム{d.potassium}mg</span>
                                  <span>ビタミンA{d.vitaminA}</span><span>ビタミンC{d.vitaminC}</span>
                                  <span>カルシウム{d.calcium}</span><span>鉄分{d.iron}</span>
                                </div>
                              </div>
                            )}
                            <div style={{ marginTop: 10 }}>
                              <GoldButton onClick={() => {
                                setPreview({
                                  id: uid(), date: today, time: nowTime(), warning: false,
                                  name: `${d.day}日目: ${d.title}`,
                                  calories: d.calories, protein: d.protein, fat: d.fat, carb: d.carb,
                                  fiber: d.fiber ?? null, sugar: d.sugar ?? null, sodium: d.sodium ?? null,
                                  potassium: d.potassium ?? null, vitaminA: d.vitaminA ?? null,
                                  vitaminC: d.vitaminC ?? null, calcium: d.calcium ?? null, iron: d.iron ?? null,
                                });
                                setShowProgram(false);
                                setExpandedDay(null);
                              }}>この日の献立を記録に追加</GoldButton>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showIngredients && (
        <div onClick={() => setShowIngredients(false)} style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 20,
          display: "flex", alignItems: "flex-end", justifyContent: "center",
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            width: "100%", maxWidth: 480, maxHeight: "78vh", background: C.card,
            borderTop: `1px solid ${C.goldDim}`, borderRadius: "12px 12px 0 0",
            display: "flex", flexDirection: "column", animation: "sheetUp 0.22s ease",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 16px 10px", borderBottom: `1px solid ${C.cardBorder}` }}>
              <span style={{ fontFamily: "'Noto Serif JP', serif", fontSize: 16, color: C.gold }}>食材データベース</span>
              <button onClick={() => setShowIngredients(false)} style={{ background: "none", border: "none", color: C.dim, cursor: "pointer" }}><X size={18} /></button>
            </div>
            <div style={{ display: "flex", gap: 6, padding: "10px 16px" }}>
              {INGREDIENT_CATEGORIES.map(c => (
                <button key={c.key} onClick={() => { setIngCategory(c.key); setSelectedIng(null); setIngChain("all"); }} style={{
                  flex: 1, padding: "8px 0", borderRadius: 8, fontSize: 12,
                  background: ingCategory === c.key ? C.gold : "transparent",
                  color: ingCategory === c.key ? "#0D0D0D" : C.ivory,
                  border: `1px solid ${ingCategory === c.key ? C.gold : C.cardBorder}`, cursor: "pointer",
                }}>{c.label}</button>
              ))}
            </div>
            {ingCategory === "store" && (
              <div style={{ display: "flex", gap: 6, padding: "0 16px 10px", flexWrap: "wrap" }}>
                {["all", ...STORE_CHAINS].map(chain => (
                  <button key={chain} onClick={() => setIngChain(chain)} style={{
                    padding: "6px 12px", borderRadius: 20, fontSize: 11.5,
                    background: ingChain === chain ? C.gold : "transparent",
                    color: ingChain === chain ? "#0D0D0D" : C.dim,
                    border: `1px solid ${ingChain === chain ? C.gold : C.cardBorder}`, cursor: "pointer",
                  }}>{chain === "all" ? "全て" : chain}</button>
                ))}
              </div>
            )}
            <div style={{ overflowY: "auto", padding: "4px 16px 20px" }}>
              {INGREDIENTS[ingCategory]
                .filter(ing => ingCategory !== "store" || ingChain === "all" || ing.name.startsWith(ingChain + ":"))
                .map(ing => {
                const isSelected = selectedIng?.name === ing.name;
                const isDish = ingCategory === "dish" || ingCategory === "store";
                return (
                  <div key={ing.name} style={{ marginBottom: 6 }}>
                    <button onClick={() => { setSelectedIng(isSelected ? null : ing); setIngGrams(isDish ? "1" : "100"); }} style={{
                      width: "100%", display: "flex", flexDirection: "column", alignItems: "stretch",
                      background: isSelected ? C.goldSoft : C.bg, border: `1px solid ${isSelected ? C.gold : C.cardBorder}`,
                      borderRadius: 10, padding: "10px 12px", cursor: "pointer", color: C.ivory, textAlign: "left",
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 12.5 }}>{ing.name}</span>
                        <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: C.dim, flexShrink: 0, marginLeft: 8 }}>
                          {ing.calories}kcal/{isDish ? "人前" : "100g"}
                        </span>
                      </div>
                      {ing.note && <div style={{ fontSize: 10.5, color: C.dim, marginTop: 4, lineHeight: 1.5 }}>{ing.note}</div>}
                    </button>
                    {isSelected && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 4px 4px" }}>
                        <input type="number" step={isDish ? "0.5" : "1"} value={ingGrams} onChange={e => setIngGrams(e.target.value)} style={{
                          width: 70, padding: "8px 8px", borderRadius: 8, border: `1px solid ${C.cardBorder}`,
                          background: C.bg, color: C.ivory, fontSize: 12.5, textAlign: "center",
                        }} />
                        <span style={{ fontSize: 11.5, color: C.dim }}>{isDish ? "人前" : "g"}</span>
                        <div style={{ flex: 1 }}>
                          <GoldButton onClick={() => {
                            const q = Number(ingGrams) || 0;
                            const factor = isDish ? q : q / 100;
                            const qtyLabel = isDish ? `${q}人前` : `${q}g`;
                            setPreview({
                              id: uid(), date: today, time: nowTime(), warning: false,
                              name: `${ing.name} ${qtyLabel}`,
                              calories: Math.round(ing.calories * factor),
                              protein: Math.round(ing.protein * factor * 10) / 10,
                              fat: Math.round(ing.fat * factor * 10) / 10,
                              carb: Math.round(ing.carb * factor * 10) / 10,
                              fiber: ing.fiber != null ? Math.round(ing.fiber * factor * 10) / 10 : null,
                              sugar: ing.sugar != null ? Math.round(ing.sugar * factor * 10) / 10 : null,
                              sodium: ing.sodium != null ? Math.round(ing.sodium * factor) : null,
                              potassium: ing.potassium != null ? Math.round(ing.potassium * factor) : null,
                              vitaminA: ing.vitaminA != null ? Math.round(ing.vitaminA * factor) : null,
                              vitaminC: ing.vitaminC != null ? Math.round(ing.vitaminC * factor * 10) / 10 : null,
                              calcium: ing.calcium != null ? Math.round(ing.calcium * factor) : null,
                              iron: ing.iron != null ? Math.round(ing.iron * factor * 10) / 10 : null,
                            });
                            setShowIngredients(false);
                            setSelectedIng(null);
                          }}>この内容で記録に追加</GoldButton>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Droplet size={16} color={C.gold} />
            <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 18 }}>{todaysWater}<span style={{ fontSize: 11, color: C.dim }}> ml</span></span>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {[200, 350, 500].map(ml => (
              <button key={ml} onClick={() => onAddWater(ml)} style={{
                background: "none", border: `1px solid ${C.goldDim}`, color: C.gold, borderRadius: 8,
                padding: "6px 10px", fontSize: 11.5, cursor: "pointer",
              }}>+{ml}</button>
            ))}
          </div>
        </div>
        <div style={{ height: 4, background: C.cardBorder, borderRadius: 8, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${Math.min(100, (todaysWater / 2000) * 100)}%`, background: C.gold }} />
        </div>
      </Card>

      <SectionLabel>本日のタイムライン</SectionLabel>
      {todaysMeals.length > 0 && (
        <Card style={{ borderColor: C.goldDim }}>
          <div style={{ fontSize: 11, color: C.dim, marginBottom: 10 }}>本日の合計</div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div>
              <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 26, color: C.gold }}>{dayTotals.calories}</span>
              <span style={{ fontSize: 11, color: C.dim, marginLeft: 4 }}>kcal</span>
            </div>
            <div style={{ display: "flex", gap: 14, fontFamily: "'Space Mono', monospace", fontSize: 12.5 }}>
              <span>P <span style={{ color: C.ivory }}>{dayTotals.protein}g</span></span>
              <span>F <span style={{ color: C.ivory }}>{dayTotals.fat}g</span></span>
              <span>C <span style={{ color: C.ivory }}>{dayTotals.carb}g</span></span>
            </div>
          </div>
          <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", marginTop: 12, background: C.cardBorder }}>
            {dayTotals.pGrams > 0 && <div style={{ width: `${dayTotals.pPct}%`, background: C.gold }} />}
            {dayTotals.fGrams > 0 && <div style={{ width: `${dayTotals.fPct}%`, background: "#B8B2A7" }} />}
            {dayTotals.cGrams > 0 && <div style={{ width: `${dayTotals.cPct}%`, background: "#7A8B5C" }} />}
          </div>
        </Card>
      )}
      {todaysMeals.length === 0 ? <EmptyState text="まだ記録がありません" /> : todaysMeals.map(m => (
        <Card key={m.id}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>{m.name}</div>
              <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: C.dim, marginTop: 4 }}>
                {m.time} · {m.calories}kcal · P{m.protein} F{m.fat} C{m.carb}
              </div>
              <ExtraNutrients item={m} />
            </div>
            <button onClick={() => onDeleteMeal(m.id)} style={{ background: "none", border: "none", color: C.dim, cursor: "pointer" }}><Trash2 size={14} /></button>
          </div>
        </Card>
      ))}
    </div>
  );
}

function ExtraNutrients({ item }) {
  const hasExtra = item.fiber != null || item.sugar != null || item.sodium != null || item.potassium != null
    || item.vitaminA != null || item.vitaminC != null || item.calcium != null || item.iron != null;
  if (!hasExtra) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6, fontFamily: "'Space Mono', monospace", fontSize: 10, color: C.dim }}>
      {item.fiber != null && <span>食物繊維{item.fiber}g</span>}
      {item.sugar != null && <span>糖分{item.sugar}g</span>}
      {item.sodium != null && <span>ナトリウム{item.sodium}mg</span>}
      {item.potassium != null && <span>カリウム{item.potassium}mg</span>}
      {item.vitaminA != null && <span>ビタミンA{item.vitaminA}</span>}
      {item.vitaminC != null && <span>ビタミンC{item.vitaminC}</span>}
      {item.calcium != null && <span>カルシウム{item.calcium}</span>}
      {item.iron != null && <span>鉄分{item.iron}</span>}
    </div>
  );
}

/* ---------------- Condition Tab ---------------- */

const BOWEL_OPTIONS = ["◎ 快調", "○ 良好", "△ 普通", "▽ やや不調", "✕ 不調"];
const SLEEP_LEVELS = [
  { n: 1, label: "浅い", desc: "何度も目が覚めた" },
  { n: 2, label: "やや浅い", desc: "途中で目が覚めた" },
  { n: 3, label: "普通", desc: "特に問題なく眠れた" },
  { n: 4, label: "やや深い", desc: "ぐっすり眠れた" },
  { n: 5, label: "深い", desc: "熟睡できた" },
];
const FATIGUE_LEVELS = [
  { n: 1, label: "なし" }, { n: 2, label: "少し" }, { n: 3, label: "普通" },
  { n: 4, label: "強い" }, { n: 5, label: "非常に強い" },
];
const MENTAL_LEVELS = [
  { n: 1, label: "不調" }, { n: 2, label: "やや不調" }, { n: 3, label: "普通" },
  { n: 4, label: "良好" }, { n: 5, label: "絶好調" },
];
const MEAL_AMOUNTS = ["少なめ", "適量", "多め"];

const ADVICE_POOL = {
  ideal: {
    label: "理想的バランス",
    messages: [
      "神経系が最も冴えている状態。高強度トレーニングに最適です。",
      "脳・神経・腸すべてが良いコンディション。今日は自己ベスト更新を狙いましょう。",
      "回復とパフォーマンスのバランスが取れています。集中力を要する種目から始めるのがおすすめです。",
      "絶好調です。新しい種目やフォームの見直しに挑戦するのに向いています。",
    ],
  },
  sympathetic: {
    label: "交感神経優位",
    messages: [
      "集中力は高いが緊張気味。今日は深い呼吸を意識したセッションを。",
      "やや興奮状態です。ウォームアップを長めに取り、徐々に強度を上げましょう。",
      "頭は冴えていますが力みやすい状態。フォーム確認を丁寧に行いましょう。",
      "交感神経が優位です。トレーニング後のクールダウンをいつもより長めに。",
    ],
  },
  parasympathetic: {
    label: "副交感神経優位",
    messages: [
      "回復モード。ストレッチや神経系ドリルで整えましょう。",
      "身体がまだ休息を求めています。軽めの有酸素やモビリティワークが向いています。",
      "無理に追い込まず、可動域を広げるセッションに切り替えるのがおすすめです。",
      "リカバリー優先の日。睡眠と栄養の質を今日は特に意識しましょう。",
    ],
  },
  rest: {
    label: "要休息",
    messages: [
      "疲労が蓄積しています。今日は完全休養か、ごく軽いストレッチに留めましょう。",
      "心身ともにお疲れのサインです。無理せずしっかり休むことが最大のパフォーマンス投資です。",
      "オーバーワークのリスクがあります。トレーナーに相談の上、メニューを調整しましょう。",
    ],
  },
};

function CheckToggle({ label, checked, onToggle }) {
  return (
    <button onClick={onToggle} style={{
      display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%",
      background: checked ? C.goldSoft : "transparent", border: `1px solid ${checked ? C.gold : C.cardBorder}`,
      borderRadius: 8, padding: "10px 12px", cursor: "pointer", marginBottom: 8, color: C.ivory,
    }}>
      <span style={{ fontSize: 12.5 }}>{label}</span>
      <span style={{
        width: 16, height: 16, borderRadius: "50%", border: `1px solid ${checked ? C.gold : C.dim}`,
        background: checked ? C.gold : "transparent", flexShrink: 0,
      }} />
    </button>
  );
}

function ConditionTab({ conditions, onSave }) {
  const today = todayISO();
  const existing = conditions.find(c => c.date === today);
  const [bowel, setBowel] = useState(existing?.bowel ?? 2);
  const [sunAM, setSunAM] = useState(existing?.sunAM ?? false);
  const [bath10, setBath10] = useState(existing?.bath10 ?? false);
  const [exercise, setExercise] = useState(existing?.exercise ?? false);
  const [sleepHours, setSleepHours] = useState(existing?.sleepHours ?? "");
  const [sleep, setSleep] = useState(existing?.sleep ?? 3);
  const [preSleepMeal, setPreSleepMeal] = useState(existing?.preSleepMeal ?? "適量");
  const [morningFatigue, setMorningFatigue] = useState(existing?.morningFatigue ?? 2);
  const [mental, setMental] = useState(existing?.mental ?? 3);

  const status = useMemo(() => {
    const score = sleep + mental;
    let category;
    if (morningFatigue >= 4 && sleep <= 2) category = "rest";
    else if (score >= 8) category = "ideal";
    else if (score >= 5) category = "sympathetic";
    else category = "parasympathetic";

    const pool = ADVICE_POOL[category];
    const idx = (sleep + mental + morningFatigue + bowel) % pool.messages.length;
    let advice = pool.messages[idx];
    if (bowel >= 3) advice += " 腸内環境のケアもあわせて意識しましょう。";
    if (sleepHours && Number(sleepHours) < 6) advice += " 睡眠時間がやや短めなので、今夜は早めの就寝を。";

    return { label: pool.label, advice };
  }, [sleep, mental, morningFatigue, bowel, sleepHours]);

  return (
    <div>
      <SectionLabel>ブレイン&ガット ダッシュボード</SectionLabel>
      <Card>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: C.dim, marginBottom: 8 }}>お通じの状態</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {BOWEL_OPTIONS.map((opt, i) => (
              <button key={i} onClick={() => setBowel(i)} style={{
                padding: "8px 10px", borderRadius: 8, fontSize: 12,
                background: bowel === i ? C.gold : "transparent",
                color: bowel === i ? "#0D0D0D" : C.ivory,
                border: `1px solid ${bowel === i ? C.gold : C.cardBorder}`, cursor: "pointer",
              }}>{opt}</button>
            ))}
          </div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: C.dim, marginBottom: 8 }}>朝の実践チェック</div>
          <CheckToggle label="朝、日光を浴びましたか?" checked={sunAM} onToggle={() => setSunAM(v => !v)} />
          <CheckToggle label="湯船に10分以上浸かりましたか?" checked={bath10} onToggle={() => setBath10(v => !v)} />
          <CheckToggle label="運動・ストレッチはできましたか?" checked={exercise} onToggle={() => setExercise(v => !v)} />
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: C.dim, marginBottom: 8 }}>睡眠時間</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="number" step="0.5" inputMode="decimal" placeholder="7.5" value={sleepHours}
              onChange={e => setSleepHours(e.target.value)} style={{
                width: 90, padding: "9px 10px", borderRadius: 8, border: `1px solid ${C.cardBorder}`,
                background: C.bg, color: C.ivory, fontSize: 13, textAlign: "center",
              }} />
            <span style={{ fontSize: 12, color: C.dim }}>時間</span>
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: C.dim, marginBottom: 8 }}>睡眠の質(神経系回復度)</div>
          <div style={{ display: "flex", gap: 6 }}>
            {SLEEP_LEVELS.map(l => (
              <button key={l.n} onClick={() => setSleep(l.n)} style={{
                flex: 1, padding: "8px 2px", borderRadius: 8,
                background: sleep === l.n ? C.gold : "transparent",
                color: sleep === l.n ? "#0D0D0D" : C.ivory,
                border: `1px solid ${sleep === l.n ? C.gold : C.cardBorder}`, cursor: "pointer",
              }}>
                <div style={{ fontSize: 12, fontFamily: "'Space Mono', monospace" }}>{l.n}</div>
              </button>
            ))}
          </div>
          <div style={{
            fontSize: 10.5, color: sleep === 3 ? C.gold : C.dim, marginTop: 6, textAlign: "center",
            transition: "color 0.15s ease",
          }}>
            {SLEEP_LEVELS.find(l => l.n === sleep)?.label} — {SLEEP_LEVELS.find(l => l.n === sleep)?.desc}
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: C.dim, marginBottom: 8 }}>睡眠前の食事量</div>
          <div style={{ display: "flex", gap: 6 }}>
            {MEAL_AMOUNTS.map(opt => (
              <button key={opt} onClick={() => setPreSleepMeal(opt)} style={{
                flex: 1, padding: "8px 0", borderRadius: 8, fontSize: 12,
                background: preSleepMeal === opt ? C.gold : "transparent",
                color: preSleepMeal === opt ? "#0D0D0D" : C.ivory,
                border: `1px solid ${preSleepMeal === opt ? C.gold : C.cardBorder}`, cursor: "pointer",
              }}>{opt}</button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: C.dim, marginBottom: 8 }}>起床時の身体のだるさ</div>
          <div style={{ display: "flex", gap: 6 }}>
            {FATIGUE_LEVELS.map(l => (
              <button key={l.n} onClick={() => setMorningFatigue(l.n)} style={{
                flex: 1, padding: "8px 2px", borderRadius: 8,
                background: morningFatigue === l.n ? C.gold : "transparent",
                color: morningFatigue === l.n ? "#0D0D0D" : C.ivory,
                border: `1px solid ${morningFatigue === l.n ? C.gold : C.cardBorder}`, cursor: "pointer",
              }}>
                <div style={{ fontSize: 12, fontFamily: "'Space Mono', monospace" }}>{l.n}</div>
              </button>
            ))}
          </div>
          <div style={{ fontSize: 10.5, color: C.dim, marginTop: 6, textAlign: "center" }}>
            {FATIGUE_LEVELS.find(l => l.n === morningFatigue)?.label}
          </div>
        </div>

        <div style={{ marginBottom: 6 }}>
          <div style={{ fontSize: 12, color: C.dim, marginBottom: 8 }}>ストレス・メンタルスコア(5が最も良好)</div>
          <div style={{ display: "flex", gap: 6 }}>
            {MENTAL_LEVELS.map(l => (
              <button key={l.n} onClick={() => setMental(l.n)} style={{
                flex: 1, padding: "8px 2px", borderRadius: 8,
                background: mental === l.n ? C.gold : "transparent",
                color: mental === l.n ? "#0D0D0D" : C.ivory,
                border: `1px solid ${mental === l.n ? C.gold : C.cardBorder}`, cursor: "pointer",
              }}>
                <div style={{ fontSize: 12, fontFamily: "'Space Mono', monospace" }}>{l.n}</div>
              </button>
            ))}
          </div>
          <div style={{ fontSize: 10.5, color: C.dim, marginTop: 6, textAlign: "center" }}>
            {MENTAL_LEVELS.find(l => l.n === mental)?.label}
          </div>
        </div>
      </Card>

      <Card style={{ borderColor: C.goldDim }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <Activity size={15} color={C.gold} />
          <span style={{ fontSize: 13, color: C.gold, fontWeight: 600 }}>{status.label}</span>
        </div>
        <div style={{ fontSize: 12.5, color: C.dim, lineHeight: 1.6 }}>{status.advice}</div>
      </Card>

      <GoldButton onClick={() => onSave({
        id: existing?.id || uid(), date: today, bowel, sleep, mental,
        sunAM, bath10, exercise, sleepHours: sleepHours ? Number(sleepHours) : null,
        preSleepMeal, morningFatigue,
      })}>
        本日の記録を保存
      </GoldButton>
    </div>
  );
}

/* ---------------- Growth Tab ---------------- */

function GrowthTab({ growth, onAdd, onDelete, monthly, onAddMonthly, onDeleteMonthly }) {
  const [weight, setWeight] = useState("");
  const [bodyFat, setBodyFat] = useState("");
  const [muscle, setMuscle] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);
  const [situps, setSitups] = useState("");
  const [benchMax, setBenchMax] = useState("");
  const [hipThrust, setHipThrust] = useState("");
  const [bridge, setBridge] = useState(false);
  const [photoSubmitted, setPhotoSubmitted] = useState(false);

  const sortedMonthly = useMemo(() => [...(monthly || [])].sort((a, b) => b.date.localeCompare(a.date)), [monthly]);

  function handleSaveMonthly() {
    if (!situps && !benchMax && !hipThrust && !bridge && !photoSubmitted) return;
    onAddMonthly({
      id: uid(), date: todayISO(),
      situps: situps ? Number(situps) : null,
      benchMax: benchMax ? Number(benchMax) : null,
      hipThrust: hipThrust ? Number(hipThrust) : null,
      bridge, photoSubmitted,
    });
    setSitups(""); setBenchMax(""); setHipThrust(""); setBridge(false); setPhotoSubmitted(false);
  }

  const sorted = useMemo(() => [...growth].sort((a, b) => a.date.localeCompare(b.date)), [growth]);
  const chartData = sorted.map(g => ({ date: fmtLabel(g.date), weight: g.weight, bodyFat: g.bodyFat, muscle: g.muscleMass }));
  const first = sorted[0];
  const latest = sorted[sorted.length - 1];

  function handleSave() {
    if (!weight && !bodyFat && !muscle) return;
    onAdd({
      id: uid(), date: todayISO(),
      weight: weight ? Number(weight) : null,
      bodyFat: bodyFat ? Number(bodyFat) : null,
      muscleMass: muscle ? Number(muscle) : null,
    });
    setWeight(""); setBodyFat(""); setMuscle("");
  }

  async function handleOCR(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setAnalyzing(true);
    try {
      const b64 = await fileToBase64(file);
      const result = await callClaudeVision(b64, file.type || "image/jpeg",
        `これはInBody(体組成計)の結果用紙の写真です。体重(kg)、体脂肪率(%)、骨格筋量(kg)を読み取ってください。
数字の桁数や小数点の位置を1文字ずつ慎重に確認し、印字がかすれている・反射している・自信が持てない場合は無理に数値を作らず null にしてください。誤った数値を返すよりも null の方が望ましいです。
JSON以外は一切含めず、次の形式のみを返してください: {"weight": number|null, "bodyFat": number|null, "muscleMass": number|null}`);
      const w = toNum(result.weight);
      const bf = toNum(result.bodyFat);
      const mm = toNum(result.muscleMass);
      const validWeight = w !== null && w >= 20 && w <= 300 ? w : null;
      const validBodyFat = bf !== null && bf >= 2 && bf <= 70 ? bf : null;
      const validMuscle = mm !== null && mm >= 10 && mm <= 150 ? mm : null;
      if (validWeight !== null) setWeight(String(validWeight));
      if (validBodyFat !== null) setBodyFat(String(validBodyFat));
      if (validMuscle !== null) setMuscle(String(validMuscle));

      const anyOutOfRange = (w !== null && validWeight === null) || (bf !== null && validBodyFat === null) || (mm !== null && validMuscle === null);
      const anyRead = validWeight !== null || validBodyFat !== null || validMuscle !== null;
      if (!anyRead) {
        setError("数値を読み取れませんでした。手入力してください。");
      } else if (anyOutOfRange) {
        setError("一部の数値は読み取り結果が不自然だったため反映していません。該当項目は手入力で確認してください。");
      }
    } catch (err) {
      if (err.code === "API_KEY_MISSING") {
        setError("APIキーが未設定です。画面右上の⚙アイコンから設定してください。");
      } else {
        setError("読み取りに失敗しました。手入力してください。");
      }
    } finally {
      setAnalyzing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div>
      <SectionLabel>InBody 連携</SectionLabel>
      <Card>
        <button onClick={() => fileRef.current?.click()} style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          background: "none", border: `1px dashed ${C.cardBorderLight}`, borderRadius: 10,
          padding: "14px 0", color: C.gold, cursor: "pointer", marginBottom: 12,
        }}>
          <Camera size={17} /><span style={{ fontSize: 12.5 }}>{analyzing ? "読み取り中…" : "InBody用紙を撮影して自動入力"}</span>
        </button>
        <input ref={fileRef} type="file" accept="image/*" onChange={handleOCR} style={{ display: "none" }} />
        {error && <div style={{ color: C.danger, fontSize: 12, marginBottom: 10 }}>{error}</div>}
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          {[["体重kg", weight, setWeight], ["体脂肪%", bodyFat, setBodyFat], ["筋量kg", muscle, setMuscle]].map(([ph, v, setter]) => (
            <input key={ph} type="number" inputMode="decimal" placeholder={ph} value={v} onChange={e => setter(e.target.value)} style={{
              flex: 1, padding: "10px 8px", borderRadius: 8, border: `1px solid ${C.cardBorder}`,
              background: C.bg, color: C.ivory, fontSize: 13, textAlign: "center",
            }} />
          ))}
        </div>
        <GoldButton onClick={handleSave}>記録を保存</GoldButton>
      </Card>

      {first && latest && first.id !== latest.id && (
        <Card>
          <SectionLabel>ビフォーアフター</SectionLabel>
          <div style={{ display: "flex", justifyContent: "space-around", textAlign: "center" }}>
            {[["体重", first.weight, latest.weight, "kg"], ["体脂肪率", first.bodyFat, latest.bodyFat, "%"], ["骨格筋量", first.muscleMass, latest.muscleMass, "kg"]].map(([label, a, b, unit]) => (
              <div key={label}>
                <div style={{ fontSize: 10.5, color: C.dim, marginBottom: 6 }}>{label}</div>
                <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 13 }}>
                  <span style={{ color: C.dim }}>{a ?? "—"}</span> → <span style={{ color: C.gold }}>{b ?? "—"}{unit}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {chartData.length >= 2 && (
        <>
          {[
            { key: "weight", label: "体重", unit: "kg", color: C.gold },
            { key: "bodyFat", label: "体脂肪率", unit: "%", color: "#B8B2A7" },
            { key: "muscle", label: "筋量", unit: "kg", color: "#7A8B5C" },
          ].map(metric => {
            const hasData = chartData.some(d => d[metric.key] != null);
            if (!hasData) return null;
            return (
              <Card key={metric.key} style={{ height: 190, padding: "14px 8px 6px" }}>
                <div style={{ fontSize: 11.5, color: metric.color, marginBottom: 4, paddingLeft: 6 }}>{metric.label}({metric.unit})</div>
                <ResponsiveContainer width="100%" height="88%">
                  <LineChart data={chartData} margin={{ top: 4, right: 14, left: -14, bottom: 0 }}>
                    <CartesianGrid stroke={C.cardBorder} vertical={false} />
                    <XAxis dataKey="date" tick={{ fill: C.dim, fontSize: 11 }} axisLine={{ stroke: C.cardBorder }} tickLine={false} />
                    <YAxis tick={{ fill: C.dim, fontSize: 11 }} axisLine={false} tickLine={false} domain={["auto", "auto"]} width={36} />
                    <Tooltip contentStyle={{ background: C.bg, border: `1px solid ${C.cardBorder}`, fontSize: 12 }} />
                    <Line type="monotone" dataKey={metric.key} stroke={metric.color} strokeWidth={2.5} dot={{ r: 3.5, fill: metric.color }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </Card>
            );
          })}
        </>
      )}

      <SectionLabel>月次測定(目安: 月1回)</SectionLabel>
      <Card>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10.5, color: C.dim, marginBottom: 6 }}>腹筋1分間回数</div>
            <input type="number" placeholder="回" value={situps} onChange={e => setSitups(e.target.value)} style={{
              width: "100%", padding: "9px 8px", borderRadius: 8, border: `1px solid ${C.cardBorder}`, background: C.bg, color: C.ivory, fontSize: 13, textAlign: "center",
            }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10.5, color: C.dim, marginBottom: 6 }}>ベンチプレスMAX(kg)</div>
            <input type="number" placeholder="kg" value={benchMax} onChange={e => setBenchMax(e.target.value)} style={{
              width: "100%", padding: "9px 8px", borderRadius: 8, border: `1px solid ${C.cardBorder}`, background: C.bg, color: C.ivory, fontSize: 13, textAlign: "center",
            }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10.5, color: C.dim, marginBottom: 6 }}>ヒップスラスト10回(kg)</div>
            <input type="number" placeholder="kg" value={hipThrust} onChange={e => setHipThrust(e.target.value)} style={{
              width: "100%", padding: "9px 8px", borderRadius: 8, border: `1px solid ${C.cardBorder}`, background: C.bg, color: C.ivory, fontSize: 13, textAlign: "center",
            }} />
          </div>
        </div>
        <button onClick={() => setBridge(v => !v)} style={{
          display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%",
          background: bridge ? C.goldSoft : "transparent", border: `1px solid ${bridge ? C.gold : C.cardBorder}`,
          borderRadius: 8, padding: "10px 12px", cursor: "pointer", marginBottom: 8, color: C.ivory,
        }}>
          <span style={{ fontSize: 12.5 }}>ブリッジ/倒立ができるようになった</span>
          <span style={{ width: 16, height: 16, borderRadius: "50%", border: `1px solid ${bridge ? C.gold : C.dim}`, background: bridge ? C.gold : "transparent" }} />
        </button>
        <button onClick={() => setPhotoSubmitted(v => !v)} style={{
          display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%",
          background: photoSubmitted ? C.goldSoft : "transparent", border: `1px solid ${photoSubmitted ? C.gold : C.cardBorder}`,
          borderRadius: 8, padding: "10px 12px", cursor: "pointer", marginBottom: 12, color: C.ivory,
        }}>
          <span style={{ fontSize: 12.5 }}>ボディ写真をトレーナーに提出済み</span>
          <span style={{ width: 16, height: 16, borderRadius: "50%", border: `1px solid ${photoSubmitted ? C.gold : C.dim}`, background: photoSubmitted ? C.gold : "transparent" }} />
        </button>
        <div style={{ fontSize: 10.5, color: C.dim, marginBottom: 12, lineHeight: 1.5 }}>
          ※写真データ自体の保存には対応していません。トレーナーへの提出有無のみ記録します。
        </div>
        <GoldButton onClick={handleSaveMonthly}>月次測定を記録</GoldButton>
      </Card>

      {sortedMonthly.length > 0 && (
        <>
          <SectionLabel>月次測定の履歴</SectionLabel>
          {sortedMonthly.map(m => (
            <Card key={m.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: C.dim }}>{m.date}</span>
                <button onClick={() => onDeleteMonthly(m.id)} style={{ background: "none", border: "none", color: C.dim, cursor: "pointer" }}><Trash2 size={13} /></button>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, fontFamily: "'Space Mono', monospace", fontSize: 12 }}>
                {m.situps !== null && <span>腹筋 {m.situps}回</span>}
                {m.benchMax !== null && <span style={{ color: C.dim }}>BP {m.benchMax}kg</span>}
                {m.hipThrust !== null && <span style={{ color: C.dim }}>HT {m.hipThrust}kg</span>}
                {m.bridge && <span style={{ color: C.gold }}>ブリッジ/倒立◎</span>}
                {m.photoSubmitted && <span style={{ color: C.gold }}>写真提出済</span>}
              </div>
              {m.note && (
                <div style={{ fontSize: 12, color: C.ivory, marginTop: 8, whiteSpace: "pre-wrap", lineHeight: 1.7 }}>{m.note}</div>
              )}
            </Card>
          ))}
        </>
      )}

      <SectionLabel>履歴</SectionLabel>
      {sorted.length === 0 ? <EmptyState text="記録がありません" /> : [...sorted].reverse().map(g => (
        <Card key={g.id}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: C.dim }}>{g.date}</span>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 12.5, display: "flex", gap: 10 }}>
              {g.weight && <span>{g.weight}kg</span>}
              {g.bodyFat && <span style={{ color: C.dim }}>{g.bodyFat}%</span>}
              {g.muscleMass && <span style={{ color: C.dim }}>{g.muscleMass}kg筋</span>}
            </div>
            <button onClick={() => onDelete(g.id)} style={{ background: "none", border: "none", color: C.dim, cursor: "pointer" }}><Trash2 size={13} /></button>
          </div>
        </Card>
      ))}
    </div>
  );
}

/* ---------------- Training Tab ---------------- */

const DRILLS = [
  { name: "前庭感覚リセット", duration: "1:30", tier: 0 },
  { name: "視覚トラッキング・ドリル", duration: "2:00", tier: 0 },
  { name: "体性感覚アクティベーション", duration: "1:45", tier: 1 },
  { name: "神経系フルシークエンス", duration: "2:00", tier: 3 },
];

function TrainingTab({ workouts, onAdd, onDelete, sessions, onSaveSession }) {
  const [exercise, setExercise] = useState("");
  const [unit, setUnit] = useState("reps");
  const [reps, setReps] = useState("");
  const [weight, setWeight] = useState("");

  const today = todayISO();
  const existingSession = (sessions || []).find(s => s.date === today);
  const [personalTraining, setPersonalTraining] = useState(existingSession?.personalTraining ?? false);

  const grouped = useMemo(() => {
    const map = {};
    for (const w of workouts) { (map[w.date] = map[w.date] || []).push(w); }
    return Object.entries(map).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 8);
  }, [workouts]);

  function handleSave() {
    if (!exercise.trim() || !reps || !weight) return;
    const r = Number(reps), w = Number(weight);
    const calories = unit === "sec"
      ? Math.round((r / 60) * 8)
      : Math.round(r * w * 0.1);
    onAdd({ id: uid(), date: today, exercise: exercise.trim(), unit, reps: r, weight: w, calories });
    setExercise(""); setReps(""); setWeight("");
  }

  function handleSaveSession() {
    onSaveSession({
      id: existingSession?.id || uid(), date: today,
      personalTraining,
    });
  }

  return (
    <div>
      <SectionLabel>本日のセッション情報</SectionLabel>
      <Card>
        <button onClick={() => setPersonalTraining(v => !v)} style={{
          display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%",
          background: personalTraining ? C.goldSoft : "transparent", border: `1px solid ${personalTraining ? C.gold : C.cardBorder}`,
          borderRadius: 8, padding: "10px 12px", cursor: "pointer", marginBottom: 12, color: C.ivory,
        }}>
          <span style={{ fontSize: 12.5 }}>パーソナルトレーニングを実施した</span>
          <span style={{ width: 16, height: 16, borderRadius: "50%", border: `1px solid ${personalTraining ? C.gold : C.dim}`, background: personalTraining ? C.gold : "transparent" }} />
        </button>
        <GoldButton onClick={handleSaveSession}>セッション情報を保存</GoldButton>
      </Card>

      <SectionLabel>本日のトレーニング</SectionLabel>
      <Card>
        <input placeholder="種目" value={exercise} onChange={e => setExercise(e.target.value)} style={{
          width: "100%", padding: "10px 12px", marginBottom: 8, borderRadius: 8, border: `1px solid ${C.cardBorder}`, background: C.bg, color: C.ivory, fontSize: 13,
        }} />
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          {[["reps", "回数"], ["sec", "秒数"]].map(([key, label]) => (
            <button key={key} onClick={() => setUnit(key)} style={{
              flex: 1, padding: "7px 0", borderRadius: 8, fontSize: 11.5,
              background: unit === key ? C.gold : "transparent", color: unit === key ? "#0D0D0D" : C.ivory,
              border: `1px solid ${unit === key ? C.gold : C.cardBorder}`, cursor: "pointer",
            }}>{label}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input type="number" placeholder={unit === "reps" ? "回数" : "秒数"} value={reps} onChange={e => setReps(e.target.value)} style={{
            flex: 1, padding: "10px 12px", borderRadius: 8, border: `1px solid ${C.cardBorder}`, background: C.bg, color: C.ivory, fontSize: 13,
          }} />
          <input type="number" placeholder="重量(kg)" value={weight} onChange={e => setWeight(e.target.value)} style={{
            flex: 1, padding: "10px 12px", borderRadius: 8, border: `1px solid ${C.cardBorder}`, background: C.bg, color: C.ivory, fontSize: 13,
          }} />
        </div>
        <div style={{ fontSize: 10, color: C.dim, marginBottom: 8 }}>※記録すると重量・回数から消費カロリーを概算して自動で表示します</div>
        <GoldButton onClick={handleSave}>記録する</GoldButton>
      </Card>

      <SectionLabel>履歴</SectionLabel>
      {grouped.length === 0 ? <EmptyState text="記録がありません" /> : grouped.map(([date, items]) => (
        <Card key={date}>
          <div style={{ fontSize: 11.5, color: C.goldDim, marginBottom: 8 }}>{date}</div>
          {items.map(w => (
            <div key={w.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <span style={{ fontSize: 12.5 }}>{w.exercise}</span>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 11.5, color: C.dim }}>
                  {w.reps}{w.unit === "sec" ? "秒" : "回"}×{w.weight}kg{w.calories ? ` ・約${w.calories}kcal` : ""}
                </span>
                <button onClick={() => onDelete(w.id)} style={{ background: "none", border: "none", color: C.dim, cursor: "pointer" }}><Trash2 size={12} /></button>
              </div>
            </div>
          ))}
        </Card>
      ))}
    </div>
  );
}

/* ---------------- Status Tab ---------------- */

async function patchProfile(profileId, patch) {
  try {
    const r = await window.storage.get(`profile:${profileId}`, true);
    const existing = r ? JSON.parse(r.value) : { id: profileId };
    const merged = { ...existing, ...patch };
    await window.storage.set(`profile:${profileId}`, JSON.stringify(merged), true);
    return merged;
  } catch (e) { return null; }
}

function PhotoSlot({ label, photo, uploading, onSelect }) {
  const inputRef = useRef(null);
  return (
    <div style={{ flex: 1, textAlign: "center" }}>
      <div style={{ fontSize: 10.5, color: C.dim, marginBottom: 6 }}>{label}</div>
      <div onClick={() => inputRef.current?.click()} style={{
        width: "100%", aspectRatio: "3 / 4", borderRadius: 8, border: `1px dashed ${C.cardBorder}`,
        background: photo ? `url(${photo}) center / cover` : C.bg, display: "flex", alignItems: "center", justifyContent: "center",
        cursor: "pointer", overflow: "hidden",
      }}>
        {!photo && <span style={{ fontSize: 10.5, color: C.dim, padding: "0 6px" }}>{uploading ? "アップロード中…" : "タップして選択"}</span>}
      </div>
      <input
        ref={inputRef} type="file" accept="image/*" style={{ display: "none" }}
        onChange={e => { const f = e.target.files?.[0]; if (f) onSelect(f); e.target.value = ""; }}
      />
    </div>
  );
}

function GoalAndPhotos({ profileId }) {
  const [loaded, setLoaded] = useState(false);
  const [goal, setGoal] = useState("");
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState("");
  const [beforePhoto, setBeforePhoto] = useState(null);
  const [afterPhoto, setAfterPhoto] = useState(null);
  const [afterMonths, setAfterMonths] = useState("");
  const [uploading, setUploading] = useState(null);

  useEffect(() => {
    if (!profileId) return;
    (async () => {
      try {
        const r = await window.storage.get(`profile:${profileId}`, true);
        if (r) {
          const p = JSON.parse(r.value);
          setGoal(p.goal || ""); setGoalInput(p.goal || "");
          setBeforePhoto(p.beforePhoto || null);
          setAfterPhoto(p.afterPhoto || null);
          setAfterMonths(p.afterMonths || "");
        }
      } catch (e) {}
      setLoaded(true);
    })();
  }, [profileId]);

  function saveGoal() {
    setGoal(goalInput);
    setEditingGoal(false);
    patchProfile(profileId, { goal: goalInput });
  }

  async function handlePhoto(which, file) {
    setUploading(which);
    try {
      const dataUrl = await fileToCompressedDataUrl(file);
      if (which === "before") setBeforePhoto(dataUrl); else setAfterPhoto(dataUrl);
      await patchProfile(profileId, which === "before" ? { beforePhoto: dataUrl } : { afterPhoto: dataUrl });
    } catch (e) {}
    setUploading(null);
  }

  function handleAfterMonthsChange(v) {
    setAfterMonths(v);
    patchProfile(profileId, { afterMonths: v });
  }

  if (!loaded) return null;

  return (
    <>
      <SectionLabel>目標</SectionLabel>
      <Card>
        {editingGoal ? (
          <>
            <textarea
              value={goalInput} onChange={e => setGoalInput(e.target.value)} rows={3} placeholder="目標を入力(例: 3ヶ月で-5kg、ベンチプレス80kg など)"
              style={{
                width: "100%", padding: "9px 10px", marginBottom: 10, borderRadius: 8, border: `1px solid ${C.cardBorder}`,
                background: C.bg, color: C.ivory, fontSize: 13, boxSizing: "border-box", resize: "vertical",
              }}
            />
            <GoldButton onClick={saveGoal}>保存する</GoldButton>
          </>
        ) : (
          <>
            <div style={{ fontSize: 13, color: goal ? C.ivory : C.dim, whiteSpace: "pre-wrap", marginBottom: 10, lineHeight: 1.7 }}>
              {goal || "まだ目標が設定されていません"}
            </div>
            <button onClick={() => { setGoalInput(goal); setEditingGoal(true); }} style={{
              background: "none", border: `1px solid ${C.cardBorder}`, color: C.dim, borderRadius: 20, padding: "5px 12px", fontSize: 11, cursor: "pointer",
            }}>編集</button>
          </>
        )}
      </Card>

      <SectionLabel>ビフォーアフター</SectionLabel>
      <Card>
        <div style={{ display: "flex", gap: 10 }}>
          <PhotoSlot label="ビフォー" photo={beforePhoto} uploading={uploading === "before"} onSelect={f => handlePhoto("before", f)} />
          <PhotoSlot label={`アフター${afterMonths ? `(${afterMonths}ヶ月)` : ""}`} photo={afterPhoto} uploading={uploading === "after"} onSelect={f => handlePhoto("after", f)} />
        </div>
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 10.5, color: C.dim, marginBottom: 6 }}>アフター経過月数</div>
          <input
            type="number" value={afterMonths} onChange={e => handleAfterMonthsChange(e.target.value)} placeholder="例: 3"
            style={{
              width: "100%", padding: "9px 10px", borderRadius: 8, border: `1px solid ${C.cardBorder}`,
              background: C.bg, color: C.ivory, fontSize: 13, boxSizing: "border-box",
            }}
          />
        </div>
      </Card>
    </>
  );
}

function StatusTab({ tier, nextTier, points, tierIdx, stats, profileId }) {
  const progress = nextTier ? Math.min(100, ((points - tier.min) / (nextTier.min - tier.min)) * 100) : 100;
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [profile, setProfile] = useState(null);
  const [name, setName] = useState("");
  const [furigana, setFurigana] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");

  useEffect(() => {
    if (!profileId) return;
    (async () => {
      try {
        const r = await window.storage.get(`profile:${profileId}`, true);
        if (r) {
          const p = JSON.parse(r.value);
          setProfile(p);
          setName(p.name || ""); setFurigana(p.furigana || ""); setBirthdate(p.birthdate || "");
          setPhone(p.phone || ""); setAddress(p.address || "");
        } else { setEditing(true); }
      } catch (e) { setEditing(true); }
      setLoaded(true);
    })();
  }, [profileId]);

  async function saveProfile() {
    const merged = await patchProfile(profileId, {
      name: name.trim(), furigana: furigana.trim(), birthdate, phone: phone.trim(), address: address.trim(),
    });
    if (merged) setProfile(merged);
    setEditing(false);
  }

  return (
    <div>
      <GoalAndPhotos profileId={profileId} />

      <SectionLabel>メンバーシップ</SectionLabel>
      <div style={{
        borderRadius: 8, padding: "28px 22px", marginBottom: 18, position: "relative", overflow: "hidden",
        background: `linear-gradient(135deg, #1A1917 0%, #232019 50%, #1A1917 100%)`,
        border: `1px solid ${tier.color}`,
      }}>
        <div style={{
          position: "absolute", top: 0, left: "-150%", width: "80%", height: "100%",
          background: `linear-gradient(100deg, transparent, ${tier.color}33, transparent)`,
          animation: "shine 3.5s ease-in-out infinite",
        }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", position: "relative" }}>
          <div>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, color: C.dim, letterSpacing: 2 }}>TTGYM MEMBER CARD</div>
            <div style={{ fontFamily: "'Noto Serif JP', serif", fontSize: 22, color: tier.color, marginTop: 6, letterSpacing: 1 }}>{tier.name.toUpperCase()}</div>
          </div>
          <Crown size={26} color={tier.color} />
        </div>
        <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: C.dim, marginTop: 24, position: "relative" }}>
          POINTS &nbsp; {points}
        </div>
      </div>

      {nextTier && (
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: C.dim, marginBottom: 8 }}>
            <span>次のランク: {nextTier.name}</span>
            <span>{points} / {nextTier.min}</span>
          </div>
          <div style={{ height: 4, background: C.cardBorder, borderRadius: 8, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${progress}%`, background: nextTier.color }} />
          </div>
        </Card>
      )}

      <SectionLabel>ポイント獲得ルール</SectionLabel>
      <Card>
        <div style={{ fontSize: 12, color: C.ivory, lineHeight: 2 }}>
          パーソナルトレーニング1回 → +2pt<br />
          自宅トレーニング3回 → +1pt<br />
          月次測定記録更新 → +3pt<br />
          直近2日で記録が無い日 → -1pt(0が下限)
        </div>
        <div style={{ fontSize: 10.5, color: C.dim, marginTop: 10, lineHeight: 1.6 }}>
          ※Emerald(150pt)以上に到達すると、以降は減点システムが適用されなくなります。
        </div>
      </Card>

      <SectionLabel>ランク一覧</SectionLabel>
      {TIERS.map((t, i) => (
        <div key={t.name} style={{
          display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", marginBottom: 6,
          background: i === tierIdx ? C.goldSoft : C.card, border: `1px solid ${i === tierIdx ? C.gold : C.cardBorder}`, borderRadius: 10,
        }}>
          <Crown size={15} color={t.color} />
          <span style={{ fontSize: 12.5, flex: 1 }}>{t.name}</span>
          <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: C.dim }}>{t.min}pt〜</span>
          {i <= tierIdx && <Sparkles size={13} color={C.gold} />}
        </div>
      ))}

      <SectionLabel>お客様登録</SectionLabel>
      {loaded && !editing && profile && (
        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 4 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, color: C.ivory }}>{profile.name}</div>
              <div style={{ fontSize: 11, color: C.dim }}>{profile.furigana}</div>
            </div>
            <button onClick={() => setEditing(true)} style={{ background: "none", border: `1px solid ${C.cardBorder}`, color: C.dim, borderRadius: 20, padding: "5px 12px", fontSize: 11, cursor: "pointer" }}>編集</button>
          </div>
          <div style={{ fontSize: 11.5, color: C.dim, marginTop: 10, lineHeight: 1.9 }}>
            生年月日: {profile.birthdate || "—"}<br />
            電話番号: {profile.phone || "—"}<br />
            住所: {profile.address || "—"}
          </div>
        </Card>
      )}

      {loaded && editing && (
        <Card>
          <div style={{ fontSize: 10.5, color: C.dim, marginBottom: 6 }}>お名前</div>
          <input value={name} onChange={e => setName(e.target.value)} style={{
            width: "100%", padding: "9px 10px", marginBottom: 10, borderRadius: 8, border: `1px solid ${C.cardBorder}`, background: C.bg, color: C.ivory, fontSize: 13,
          }} />
          <div style={{ fontSize: 10.5, color: C.dim, marginBottom: 6 }}>ふりがな</div>
          <input value={furigana} onChange={e => setFurigana(e.target.value)} style={{
            width: "100%", padding: "9px 10px", marginBottom: 10, borderRadius: 8, border: `1px solid ${C.cardBorder}`, background: C.bg, color: C.ivory, fontSize: 13,
          }} />
          <div style={{ fontSize: 10.5, color: C.dim, marginBottom: 6 }}>生年月日</div>
          <input type="date" value={birthdate} onChange={e => setBirthdate(e.target.value)} style={{
            width: "100%", padding: "9px 10px", marginBottom: 10, borderRadius: 8, border: `1px solid ${C.cardBorder}`, background: C.bg, color: C.ivory, fontSize: 13,
          }} />
          <div style={{ fontSize: 10.5, color: C.dim, marginBottom: 6 }}>電話番号</div>
          <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} style={{
            width: "100%", padding: "9px 10px", marginBottom: 10, borderRadius: 8, border: `1px solid ${C.cardBorder}`, background: C.bg, color: C.ivory, fontSize: 13,
          }} />
          <div style={{ fontSize: 10.5, color: C.dim, marginBottom: 6 }}>住所</div>
          <input value={address} onChange={e => setAddress(e.target.value)} style={{
            width: "100%", padding: "9px 10px", marginBottom: 16, borderRadius: 8, border: `1px solid ${C.cardBorder}`, background: C.bg, color: C.ivory, fontSize: 13,
          }} />
          <GoldButton onClick={saveProfile}>登録する</GoldButton>
        </Card>
      )}
    </div>
  );
}

/* ---------------- Report Tab ---------------- */

function dateNDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - (n - 1));
  return d.toISOString().slice(0, 10);
}

function StatBox({ label, value, unit }) {
  return (
    <div style={{ flex: 1, textAlign: "center" }}>
      <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 20, color: C.gold }}>{value}</div>
      <div style={{ fontSize: 10, color: C.dim, marginTop: 4 }}>{label}{unit ? ` (${unit})` : ""}</div>
    </div>
  );
}

function ReportTab({ meals, conditions, growth, workouts, water, sessions, monthly, personalLogs }) {
  const [period, setPeriod] = useState("week");
  const days = period === "week" ? 7 : 30;
  const cutoff = dateNDaysAgo(days);

  const periodMeals = meals.filter(m => m.date >= cutoff);
  const periodConditions = conditions.filter(c => c.date >= cutoff);
  const periodGrowth = [...growth].filter(g => g.date >= cutoff).sort((a, b) => a.date.localeCompare(b.date));
  const periodWorkouts = workouts.filter(w => w.date >= cutoff);
  const periodWaterEntries = Object.entries(water || {}).filter(([date]) => date >= cutoff);
  const periodSessions = (sessions || []).filter(s => s.date >= cutoff);
  const periodMonthly = [...(monthly || [])].filter(m => m.date >= cutoff).sort((a, b) => b.date.localeCompare(a.date));
  const periodPersonalLogs = [...(personalLogs || [])].filter(p => p.date >= cutoff).sort((a, b) => b.seq - a.seq);

  const activityByDate = useMemo(() => {
    if (period !== "month") return [];
    const map = {};
    for (let i = 0; i < days; i++) {
      const d = new Date(); d.setDate(d.getDate() - i);
      map[d.toISOString().slice(0, 10)] = { meal: 0, condition: 0, training: 0, growth: 0 };
    }
    for (const m of periodMeals) if (map[m.date]) map[m.date].meal = 1;
    for (const c of periodConditions) if (map[c.date]) map[c.date].condition = 1;
    for (const w of periodWorkouts) if (map[w.date]) map[w.date].training = 1;
    for (const g of periodGrowth) if (map[g.date]) map[g.date].growth = 1;
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0])).map(([date, v]) => ({
      date: fmtLabel(date), total: v.meal + v.condition + v.training + v.growth,
    }));
  }, [period, periodMeals, periodConditions, periodWorkouts, periodGrowth, days]);

  const calorieByDate = useMemo(() => {
    const map = {};
    for (let i = 0; i < days; i++) {
      const d = new Date(); d.setDate(d.getDate() - i);
      map[d.toISOString().slice(0, 10)] = 0;
    }
    for (const m of periodMeals) map[m.date] = (map[m.date] || 0) + (m.calories || 0);
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0])).map(([date, cal]) => ({ date: fmtLabel(date), calories: cal }));
  }, [periodMeals, days]);

  const loggedMealDays = new Set(periodMeals.map(m => m.date)).size;
  const totalCalories = periodMeals.reduce((s, m) => s + (m.calories || 0), 0);
  const avgCalories = loggedMealDays ? Math.round(totalCalories / loggedMealDays) : 0;

  const avgSleep = periodConditions.length ? (periodConditions.reduce((s, c) => s + (c.sleep || 0), 0) / periodConditions.length).toFixed(1) : "—";
  const avgMental = periodConditions.length ? (periodConditions.reduce((s, c) => s + (c.mental || 0), 0) / periodConditions.length).toFixed(1) : "—";
  const sunDays = periodConditions.filter(c => c.sunAM).length;
  const bathDays = periodConditions.filter(c => c.bath10).length;
  const exerciseDays = periodConditions.filter(c => c.exercise).length;
  const goodBowelRate = periodConditions.length ? Math.round((periodConditions.filter(c => c.bowel <= 1).length / periodConditions.length) * 100) : null;
  const avgFatigue = periodConditions.length ? (periodConditions.reduce((s, c) => s + (c.morningFatigue || 0), 0) / periodConditions.length).toFixed(1) : "—";
  const sleepHoursLogged = periodConditions.filter(c => c.sleepHours);
  const avgSleepHours = sleepHoursLogged.length ? (sleepHoursLogged.reduce((s, c) => s + c.sleepHours, 0) / sleepHoursLogged.length).toFixed(1) : "—";

  const waterLoggedDays = periodWaterEntries.length;
  const totalWater = periodWaterEntries.reduce((s, [, ml]) => s + ml, 0);
  const avgWater = waterLoggedDays ? Math.round(totalWater / waterLoggedDays) : 0;

  const totalMinutes = periodSessions.reduce((s, x) => s + (x.durationMinutes || 0), 0);
  const totalSessionCalories = periodSessions.reduce((s, x) => s + (x.calories || 0), 0);
  const sessionDays = new Set(periodWorkouts.map(w => w.date)).size;
  const exerciseList = [...new Set(periodWorkouts.map(w => w.exercise))];

  const weightChange = periodGrowth.length >= 2
    ? (periodGrowth[periodGrowth.length - 1].weight - periodGrowth[0].weight)
    : null;
  const bodyFatEntries = periodGrowth.filter(g => g.bodyFat != null);
  const muscleEntries = periodGrowth.filter(g => g.muscleMass != null);
  const bodyFatChange = bodyFatEntries.length >= 2 ? (bodyFatEntries[bodyFatEntries.length - 1].bodyFat - bodyFatEntries[0].bodyFat) : null;
  const muscleChange = muscleEntries.length >= 2 ? (muscleEntries[muscleEntries.length - 1].muscleMass - muscleEntries[0].muscleMass) : null;
  const growthChartData = periodGrowth.map(g => ({ date: fmtLabel(g.date), weight: g.weight, bodyFat: g.bodyFat, muscle: g.muscleMass }));

  return (
    <div>
      <SectionLabel>期間</SectionLabel>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {[["week", "1週間"], ["month", "1ヶ月"]].map(([key, label]) => (
          <button key={key} onClick={() => setPeriod(key)} style={{
            flex: 1, padding: "9px 0", borderRadius: 8, fontSize: 12.5,
            background: period === key ? C.gold : "transparent",
            color: period === key ? "#0D0D0D" : C.ivory,
            border: `1px solid ${period === key ? C.gold : C.cardBorder}`, cursor: "pointer",
          }}>{label}</button>
        ))}
      </div>

      {period === "month" && (
        <>
          <SectionLabel>月間 全記録アクティビティ</SectionLabel>
          <Card style={{ height: 210 }}>
            <div style={{ fontSize: 10.5, color: C.dim, marginBottom: 8 }}>1日ごとに記録したカテゴリ数(食事・体調・トレーニング・成長、最大4)</div>
            <div style={{ height: 160 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={activityByDate} margin={{ top: 4, right: 10, left: -14, bottom: 0 }}>
                  <CartesianGrid stroke={C.cardBorder} vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: C.dim, fontSize: 11 }} axisLine={{ stroke: C.cardBorder }} tickLine={false} interval={4} />
                  <YAxis tick={{ fill: C.dim, fontSize: 11 }} axisLine={false} tickLine={false} domain={[0, 4]} allowDecimals={false} width={24} />
                  <Tooltip contentStyle={{ background: C.bg, border: `1px solid ${C.cardBorder}`, fontSize: 12 }} />
                  <Line type="monotone" dataKey="total" stroke={C.gold} strokeWidth={2.5} dot={{ r: 3, fill: C.gold }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </>
      )}

      <SectionLabel>食事・水分</SectionLabel>
      <Card>
        <div style={{ display: "flex", marginBottom: 10 }}>
          <StatBox label="記録日数" value={loggedMealDays} unit="日" />
          <StatBox label="平均カロリー" value={avgCalories} unit="kcal" />
          <StatBox label="平均水分" value={avgWater} unit="ml" />
        </div>
        <div style={{ display: "flex", marginBottom: 14 }}>
          <div style={{ flex: 1 }} />
          <StatBox label="合計カロリー" value={totalCalories} unit="kcal" />
          <StatBox label="合計水分" value={totalWater} unit="ml" />
        </div>
        <div style={{ height: 190 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={calorieByDate} margin={{ top: 4, right: 10, left: -14, bottom: 0 }}>
              <CartesianGrid stroke={C.cardBorder} vertical={false} />
              <XAxis dataKey="date" tick={{ fill: C.dim, fontSize: 11 }} axisLine={{ stroke: C.cardBorder }} tickLine={false}
                interval={period === "month" ? 4 : 0} />
              <YAxis tick={{ fill: C.dim, fontSize: 11 }} axisLine={false} tickLine={false} width={30} />
              <Tooltip contentStyle={{ background: C.bg, border: `1px solid ${C.cardBorder}`, fontSize: 12 }} />
              <Line type="monotone" dataKey="calories" stroke={C.gold} strokeWidth={2.5} dot={{ r: 3, fill: C.gold }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {periodMeals.length > 0 && (
        <Card>
          <div style={{ fontSize: 10.5, color: C.dim, marginBottom: 10 }}>食事記録({period === "week" ? "1週間分" : "1ヶ月分"})</div>
          <div style={{ maxHeight: 260, overflowY: "auto" }}>
            {[...periodMeals].sort((a, b) => (b.date + (b.time || "")).localeCompare(a.date + (a.time || ""))).map(m => (
              <div key={m.id} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "8px 0", borderBottom: `1px solid ${C.cardBorder}`,
              }}>
                <div>
                  <div style={{ fontSize: 12, color: C.ivory }}>{m.name}</div>
                  <div style={{ fontSize: 10, color: C.dim }}>{m.date} {m.time || ""}</div>
                  <ExtraNutrients item={m} />
                </div>
                <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: C.dim, textAlign: "right" }}>
                  {m.calories}kcal<br />P{m.protein} F{m.fat} C{m.carb}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <SectionLabel>体調</SectionLabel>
      <Card>
        <div style={{ display: "flex", marginBottom: 12 }}>
          <StatBox label="記録回数" value={periodConditions.length} unit="回" />
          <StatBox label="平均睡眠の質" value={avgSleep} unit="/5" />
          <StatBox label="平均睡眠時間" value={avgSleepHours} unit="h" />
        </div>
        <div style={{ display: "flex", marginBottom: 12 }}>
          <StatBox label="平均メンタル" value={avgMental} unit="/5" />
          <StatBox label="起床時だるさ" value={avgFatigue} unit="/5" />
          <StatBox label="お通じ良好率" value={goodBowelRate !== null ? goodBowelRate : "—"} unit={goodBowelRate !== null ? "%" : ""} />
        </div>
        <div style={{ display: "flex" }}>
          <StatBox label="朝日光を浴びた日" value={sunDays} unit="日" />
          <StatBox label="湯船10分以上の日" value={bathDays} unit="日" />
          <StatBox label="運動/ストレッチの日" value={exerciseDays} unit="日" />
        </div>
      </Card>

      <SectionLabel>成長(インボディ)</SectionLabel>
      <Card>
        <div style={{ display: "flex", marginBottom: 14 }}>
          <StatBox label="記録回数" value={periodGrowth.length} unit="回" />
          <StatBox label="体重の変化" value={weightChange !== null ? (weightChange > 0 ? `+${weightChange.toFixed(1)}` : weightChange.toFixed(1)) : "—"} unit="kg" />
        </div>
        <div style={{ display: "flex", marginBottom: growthChartData.length >= 2 ? 14 : 0 }}>
          <StatBox label="体脂肪率の変化" value={bodyFatChange !== null ? (bodyFatChange > 0 ? `+${bodyFatChange.toFixed(1)}` : bodyFatChange.toFixed(1)) : "—"} unit="%" />
          <StatBox label="骨格筋量の変化" value={muscleChange !== null ? (muscleChange > 0 ? `+${muscleChange.toFixed(1)}` : muscleChange.toFixed(1)) : "—"} unit="kg" />
        </div>
        {growthChartData.length >= 2 && (
          <div style={{ height: 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={growthChartData} margin={{ top: 4, right: 10, left: -14, bottom: 0 }}>
                <CartesianGrid stroke={C.cardBorder} vertical={false} />
                <XAxis dataKey="date" tick={{ fill: C.dim, fontSize: 11 }} axisLine={{ stroke: C.cardBorder }} tickLine={false} />
                <YAxis tick={{ fill: C.dim, fontSize: 11 }} axisLine={false} tickLine={false} domain={["auto", "auto"]} width={30} />
                <Tooltip contentStyle={{ background: C.bg, border: `1px solid ${C.cardBorder}`, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="weight" name="体重" stroke={C.gold} strokeWidth={2.5} dot={{ r: 3, fill: C.gold }} connectNulls />
                <Line type="monotone" dataKey="bodyFat" name="体脂肪率" stroke="#B8B2A7" strokeWidth={2} dot={{ r: 3, fill: "#B8B2A7" }} connectNulls />
                <Line type="monotone" dataKey="muscle" name="筋量" stroke="#7A8B5C" strokeWidth={2} dot={{ r: 3, fill: "#7A8B5C" }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        <div style={{ fontSize: 10, color: C.dim, marginTop: 10 }}>※体重・体脂肪率・筋量は成長タブでInBody画像解析または手入力した最新データを反映しています</div>
      </Card>

      {period === "month" && periodMonthly.length > 0 && (
        <>
          <SectionLabel>月次測定</SectionLabel>
          {periodMonthly.map(m => (
            <Card key={m.id}>
              <div style={{ fontSize: 11.5, color: C.dim, marginBottom: 6 }}>{m.date}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, fontFamily: "'Space Mono', monospace", fontSize: 12 }}>
                {m.situps !== null && <span>腹筋 {m.situps}回</span>}
                {m.benchMax !== null && <span style={{ color: C.dim }}>BP {m.benchMax}kg</span>}
                {m.hipThrust !== null && <span style={{ color: C.dim }}>HT {m.hipThrust}kg</span>}
                {m.bridge && <span style={{ color: C.gold }}>ブリッジ/倒立◎</span>}
                {m.photoSubmitted && <span style={{ color: C.gold }}>写真提出済</span>}
              </div>
              {m.note && (
                <div style={{ fontSize: 12, color: C.ivory, marginTop: 8, whiteSpace: "pre-wrap", lineHeight: 1.7 }}>{m.note}</div>
              )}
            </Card>
          ))}
        </>
      )}

      <SectionLabel>トレーニング</SectionLabel>
      <Card>
        <div style={{ display: "flex", marginBottom: exerciseList.length ? 14 : 0 }}>
          <StatBox label="実施日数" value={sessionDays} unit="日" />
          <StatBox label="合計時間" value={totalMinutes} unit="分" />
          <StatBox label="消費カロリー" value={totalSessionCalories} unit="kcal" />
        </div>
        {exerciseList.length > 0 && (
          <div>
            <div style={{ fontSize: 10.5, color: C.dim, marginBottom: 8 }}>期間中に行った種目</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {exerciseList.map(name => (
                <span key={name} style={{
                  fontSize: 11.5, color: C.ivory, background: C.bg, border: `1px solid ${C.cardBorder}`,
                  borderRadius: 20, padding: "4px 10px",
                }}>{name}</span>
              ))}
            </div>
          </div>
        )}
      </Card>

      {periodWorkouts.length > 0 && (
        <Card>
          <div style={{ fontSize: 10.5, color: C.dim, marginBottom: 10 }}>トレーニング記録({period === "week" ? "1週間分" : "1ヶ月分"})</div>
          <div style={{ maxHeight: 260, overflowY: "auto" }}>
            {[...periodWorkouts].sort((a, b) => b.date.localeCompare(a.date)).map(w => (
              <div key={w.id} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "8px 0", borderBottom: `1px solid ${C.cardBorder}`,
              }}>
                <div>
                  <div style={{ fontSize: 12, color: C.ivory }}>{w.exercise}</div>
                  <div style={{ fontSize: 10, color: C.dim }}>{w.date}</div>
                </div>
                <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: C.dim, textAlign: "right" }}>
                  {w.reps}{w.unit === "sec" ? "秒" : "回"}×{w.weight}kg{w.calories ? ` ・約${w.calories}kcal` : ""}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {periodPersonalLogs.length > 0 && (
        <>
          <SectionLabel>パーソナルトレーニング</SectionLabel>
          <Card>
            <div style={{ fontSize: 10.5, color: C.dim, marginBottom: 10 }}>トレーナーによる記録({period === "week" ? "1週間分" : "1ヶ月分"})</div>
            <div style={{ maxHeight: 260, overflowY: "auto" }}>
              {periodPersonalLogs.map(p => (
                <div key={p.id} style={{ padding: "8px 0", borderBottom: `1px solid ${C.cardBorder}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span style={{ fontSize: 12, color: C.gold }}>第{p.seq}回</span>
                    <span style={{ fontSize: 10, color: C.dim }}>{p.date}</span>
                  </div>
                  <div style={{ fontSize: 12, color: C.ivory, marginTop: 3, whiteSpace: "pre-wrap" }}>{p.menu}</div>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

/* ---------------- Trainer Comments Tab ---------------- */

const COMMENT_TYPES = [
  { key: "weekly", label: "1週間のコメントとアドバイス" },
  { key: "monthly", label: "1ヶ月のコメントとアドバイス" },
  { key: "personal", label: "パーソナルのコメントとアドバイス" },
];

function LiveStreamTab() {
  const liveUrl = "https://www.instagram.com/self.mobility?igsh=MXZvaTBlcGxpM2ttYQ%3D%3D&utm_source=qr";
  return (
    <div>
      <SectionLabel>ライブ配信</SectionLabel>
      <Card>
        <div style={{ fontSize: 12.5, color: C.ivory, lineHeight: 1.8, marginBottom: 14 }}>
          毎週 火曜7:00〜/土曜8:00〜<br />
          一緒にトレーニングLive配信を開催中<br /><br />
          トレーニングのプログラムが何百種類以上観れますのでぜひチェックしてください!
        </div>
        <GoldButton onClick={() => window.open(liveUrl, "_blank")}>Instagramを開く</GoldButton>
      </Card>
    </div>
  );
}

function TrainerCommentsTab({ comments }) {
  return (
    <div>
      {COMMENT_TYPES.map(({ key, label }) => {
        const list = [...(comments || [])].filter(c => c.type === key).sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || "").localeCompare(a.createdAt || ""));
        return (
          <div key={key} style={{ marginBottom: 20 }}>
            <SectionLabel>{label}</SectionLabel>
            {list.length === 0 ? (
              <Card><EmptyState text="まだトレーナーからのコメントはありません" /></Card>
            ) : (
              list.map(c => (
                <Card key={c.id}>
                  <div style={{ fontSize: 10, color: C.dim, marginBottom: 6 }}>{c.date}</div>
                  <div style={{ fontSize: 13, color: C.ivory, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{c.text}</div>
                </Card>
              ))
            )}
          </div>
        );
      })}
    </div>
  );
}

