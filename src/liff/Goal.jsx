import React, { useEffect, useRef, useState } from "react";
import { Crown, ImagePlus, LoaderCircle, Pencil, Sparkles } from "lucide-react";
import { TIERS, POINT_RULES, tierFor } from "../membership.js";
import { fileToCompressedDataUrl } from "../imageUtils.js";
import { fetchGoal, post, openPage } from "./api.js";
import { ACTIVITY, GOALS } from "./nutrients.js";
import { comma } from "./ui.jsx";

function PhotoSlot({ label, photo, busy, onSelect }) {
  const ref = useRef(null);
  return (
    <div className="lf-photo">
      <div className="lab">{label}</div>
      <button className={`slot${photo ? " has" : ""}`} onClick={() => ref.current?.click()}>
        {busy ? <LoaderCircle className="lf-spin" size={26} />
          : photo ? <img src={photo} alt={label} />
            : <span><ImagePlus size={26} strokeWidth={1.6} /><br />タップして選択</span>}
      </button>
      <input ref={ref} type="file" accept="image/*" style={{ display: "none" }}
        onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onSelect(f); }} />
    </div>
  );
}

function MemberCard({ points }) {
  const { tierIdx, tier, nextTier } = tierFor(points);
  const progress = nextTier ? Math.min(100, ((points - tier.min) / (nextTier.min - tier.min)) * 100) : 100;
  return (
    <>
      <div className="lf-member">
        <div className="eb">TTGYM MEMBER CARD</div>
        <div className="tier" style={{ color: tierIdx === 0 ? "#6E6A63" : tier.color }}>{tier.name.toUpperCase()}</div>
        <div className="pts">POINTS<b>{points}</b></div>
        <Crown className="crown" size={40} strokeWidth={1.4} />
      </div>
      <div className="lf-card" style={{ marginTop: 12 }}>
        <div className="lf-next">
          <span>{nextTier ? `次のランク: ${nextTier.name}` : "最高ランクです"}</span>
          {nextTier && <span>{points} / {nextTier.min}</span>}
        </div>
        <div className="lf-nbar" style={{ marginTop: 12 }}><div className="fill" style={{ width: `${progress}%`, background: "var(--gold)" }} /></div>
      </div>
      <div className="lf-sec"><h2>ポイント獲得ルール</h2></div>
      <div className="lf-card lf-rules">
        {POINT_RULES.map(r => <div key={r}>{r}</div>)}
        <p>※Emerald(150pt)以上に到達すると、以降は減点システムが適用されなくなります。</p>
      </div>
      <div className="lf-sec"><h2>ランク一覧</h2></div>
      {TIERS.map((t, i) => (
        <div key={t.name} className={`lf-card lf-rank${i === tierIdx ? " on" : ""}`}>
          <Crown size={24} color={t.name === "Black" ? "#111814" : t.color} strokeWidth={1.8} />
          <span className="nm">{t.name}</span>
          <span className="min">{t.min}pt〜</span>
          {i === tierIdx && <Sparkles size={20} color="var(--gold)" />}
        </div>
      ))}
    </>
  );
}

export default function Goal({ data, toast }) {
  const [g, setG] = useState(null);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    fetchGoal().then(r => { setG(r); setText(r.goal.goal || ""); }).catch(e => toast(e.message));
  }, []);

  if (!g) return <div className="lf-center" style={{ minHeight: "40vh" }}><LoaderCircle className="lf-spin" size={26} /></div>;

  const save = async patch => {
    setG(prev => ({ ...prev, goal: { ...prev.goal, ...patch } }));
    try { await post("goal", { goal: patch }); } catch (e) { toast(e.message); }
  };
  const onPhoto = async (which, file) => {
    setBusy(which);
    try {
      const dataUrl = await fileToCompressedDataUrl(file);
      await post("photo", { which, dataUrl });
      setG(prev => ({ ...prev, photos: { ...prev.photos, [which]: dataUrl } }));
    } catch (e) {
      toast("写真を保存できませんでした");
    } finally {
      setBusy(null);
    }
  };
  const t = data.targets;
  const p = data.profile;

  return (
    <>
      <div className="lf-sec" style={{ marginTop: 12 }}><h2>目標</h2>{!editing && <button className="lf-btn-o" onClick={() => setEditing(true)}><Pencil size={15} />編集</button>}</div>
      <div className="lf-card">
        {editing ? (
          <>
            <textarea className="lf-textarea" rows={7} placeholder={"例：\n『HYROXアジア一位』\n① ベンチプレス 150kg\n② 体脂肪率10%以下"} value={text} onChange={e => setText(e.target.value)} />
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button className="lf-btn-o" style={{ flex: 1, justifyContent: "center" }} onClick={() => { setText(g.goal.goal || ""); setEditing(false); }}>キャンセル</button>
              <button className="lf-btn-d" style={{ flex: 1, justifyContent: "center" }} onClick={() => { save({ goal: text }); setEditing(false); toast("目標を保存しました"); }}>保存する</button>
            </div>
          </>
        ) : (
          <div className="lf-goaltext">{g.goal.goal || <span style={{ color: "var(--dim)" }}>目指したい姿や数字を書いておきましょう。トレーナーもここを見てサポートします。</span>}</div>
        )}
        <div className="lf-grid2" style={{ marginTop: 18, marginBottom: 0 }}>
          {[["targetWeight", "目標体重", "kg"], ["targetBodyFat", "目標体脂肪率", "%"]].map(([k, l, u]) => (
            <label className="lf-field" key={k} style={{ background: "var(--bg)" }}>
              <div className="lab">{l}</div>
              <div className="in">
                <input inputMode="decimal" placeholder="—" style={{ fontSize: 30 }} defaultValue={g.goal[k] ?? ""}
                  onBlur={e => { const v = e.target.value.replace(/[^\d.]/g, ""); if (String(g.goal[k] ?? "") !== v) save({ [k]: v ? Number(v) : null }); }} />
                <span className="u">{u}</span>
              </div>
            </label>
          ))}
        </div>
      </div>

      <div className="lf-sec"><h2>ビフォーアフター</h2></div>
      <div className="lf-card">
        <div className="lf-grid2" style={{ marginBottom: 14 }}>
          <PhotoSlot label="ビフォー" photo={g.photos.before} busy={busy === "before"} onSelect={f => onPhoto("before", f)} />
          <PhotoSlot label={`アフター${g.goal.afterMonths ? `（${g.goal.afterMonths}ヶ月）` : ""}`} photo={g.photos.after} busy={busy === "after"} onSelect={f => onPhoto("after", f)} />
        </div>
        <label className="lf-mini" style={{ display: "block" }}>
          <span>アフター経過月数</span>
          <input inputMode="numeric" placeholder="例: 3" defaultValue={g.goal.afterMonths || ""}
            onBlur={e => { const v = e.target.value.replace(/[^\d]/g, ""); if (v !== String(g.goal.afterMonths || "")) save({ afterMonths: v }); }} />
          <em>ヶ月</em>
        </label>
      </div>

      <div className="lf-sec"><h2>メンバーシップ</h2></div>
      <MemberCard points={g.points} />
      {!g.linked && <p className="lf-hint" style={{ lineHeight: 1.8 }}>TTGYMアプリと連携すると、パーソナル・自宅トレーニングの記録もポイントに反映されます。</p>}

      <div className="lf-sec"><h2>体の情報・栄養目標</h2><button className="lf-btn-o" onClick={() => openPage("/profile")}><Pencil size={15} />変更する</button></div>
      <div className="lf-card lf-body-sum">
        <div><span>1日の目標</span><b>{comma(t.kcal)} kcal</b></div>
        <div><span>たんぱく質・脂質・炭水化物</span><b>{t.p} / {t.f} / {t.c} g</b></div>
        <div><span>体重・身長</span><b>{p.weight}kg ・ {p.height}cm</b></div>
        <div><span>活動量・ゴール</span><b>{ACTIVITY[p.activity]?.label} ・ {GOALS[p.goal]?.label}</b></div>
      </div>
    </>
  );
}
