// お名前（フルネーム）の登録画面と、「わたしの目標」カード。
// 「今日の栄養」と「目標設定」を開いたときに、誰の記録か・どんな目標を立てたかがすぐ分かるようにする。
// アプリ会員と連携済みの人は、アプリの会員名をそのまま使う（ここでは聞かない）。
import React, { useState } from "react";
import { Pencil, UserRound } from "lucide-react";
import { GOALS } from "./nutrients.js";
import { comma } from "./ui.jsx";

// 表示に使う名前（連携済みはアプリの会員名を優先）
export const displayName = data => data?.member?.name || data?.profile?.fullName || "";
// 名前の登録が必要か（プロフィール登録済みで、名前がまだない人）
export const needsName = data => !!data?.profile && !displayName(data);

export function NameField({ value, onChange, autoFocus }) {
  return (
    <label className="lf-field lf-name-field">
      <div className="lab">お名前（フルネーム）</div>
      <div className="in">
        <input value={value} onChange={e => onChange(e.target.value)} placeholder="例：山田 太郎" autoComplete="name" autoFocus={autoFocus} />
      </div>
    </label>
  );
}

export const validName = v => String(v || "").replace(/[\s　]+/g, "").length >= 2;

// 1画面だけの名前登録（登録済みの人の変更にも使う）
export function NameGate({ initial = "", onSave, onCancel }) {
  const [name, setName] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const submit = async () => {
    setSaving(true);
    setError("");
    try {
      await onSave(name.trim());
    } catch (e) {
      setError(e.message || "保存できませんでした");
      setSaving(false);
    }
  };
  return (
    <div className="lf"><div className="lf-wrap lf-ob">
      <div className="lf-ob-top">
        <div />
        <div className="brand"><img src="/liff/logo.png" alt="" /><span>TTGYM</span></div>
        <div />
      </div>
      <div className="lf-ob-eyebrow" style={{ marginTop: 18 }}>YOUR NAME</div>
      <h1>{onCancel ? "お名前を\n変更します" : "はじめに、お名前を\n教えてください"}</h1>
      <p className="lead">食事や体調の記録が誰のものか、トレーナーが確認するために使います。フルネームで入力してください。</p>
      <NameField value={name} onChange={setName} autoFocus />
      {error && <p style={{ color: "var(--red-text)", fontSize: 14, marginTop: 16 }}>{error}</p>}
      <div className="lf-ob-bottom">
        <button className="lf-primary" disabled={!validName(name) || saving} onClick={submit}>{saving ? "保存中…" : "登録する"}</button>
        {onCancel && <button className="lf-name-cancel" onClick={onCancel}>キャンセル</button>}
      </div>
    </div></div>
  );
}

// 「わたしの目標」カード（今日の栄養・目標設定の一番上）
// showText: 目標タブでは下に目標の文章があるので false にする
export function MyGoalCard({ data, onEditName, onEditGoal, showText = true }) {
  const name = displayName(data);
  const p = data.profile || {};
  const goalText = data.member ? data.member.goal : data.goal?.goal;
  const targetWeight = data.member?.targetWeight ?? data.goal?.targetWeight ?? p.targetWeight ?? null;
  const goal = GOALS[p.goal];
  return (
    <div className="lf-mygoal">
      <div className="who">
        <UserRound size={18} />
        <b>{name ? `${name} 様` : "お名前未登録"}</b>
        {onEditName && !data.member && <button onClick={onEditName} aria-label="名前を変更"><Pencil size={14} />変更</button>}
      </div>
      <div className="eb">MY GOAL · わたしの目標</div>
      {showText && (goalText ? <div className="txt">{goalText}</div> : <div className="txt empty">目標はまだ書かれていません</div>)}
      <div className="nums">
        <div><span>ゴール</span><b>{goal?.label || "—"}</b></div>
        <div><span>目標体重</span><b>{targetWeight != null ? `${targetWeight}kg` : "—"}</b></div>
        <div><span>1日の目標</span><b>{data.targets?.kcal ? `${comma(data.targets.kcal)}kcal` : "—"}</b></div>
      </div>
      {onEditGoal && <button className="edit" onClick={onEditGoal}>目標を見る・変更する</button>}
    </div>
  );
}
