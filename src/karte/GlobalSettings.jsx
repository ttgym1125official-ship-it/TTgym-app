// 顧客カルテの設定に出す「公式LINE・アプリ全体の設定」。管理画面（/admin）と同じ部品をそのまま使う
// （リッチメニュー・おすすめのお店・健康アイテム・週刊レシピの配信・サプリの購入リンク）
import "../storage.js"; // 管理画面の部品が使う window.storage
import React, { useEffect, useState } from "react";
import { KeyBox, RichMenuBox, ListBox, RecipeBroadcastStatus } from "../admin/LinePanel.jsx";
import { SupplementLinksEditor } from "../AdminDashboard.jsx";

const KEY = "ttgym_line_admin_key";
const hasKeyNow = () => { try { return !!window.localStorage.getItem(KEY); } catch (e) { return false; } };

export default function GlobalSettings() {
  const [hasKey, setHasKey] = useState(hasKeyNow());
  useEffect(() => { const t = setInterval(() => setHasKey(hasKeyNow()), 1500); return () => clearInterval(t); }, []);
  return (
    <div className="kt-dark">
      <KeyBox />
      <RichMenuBox hasKey={hasKey} />
      <ListBox kind="stores" />
      <ListBox kind="items" />
      <div style={{ fontSize: 12, color: "#8A8578", margin: "14px 0 6px" }}>週刊レシピのLINE配信</div>
      <RecipeBroadcastStatus />
      <SupplementLinksEditor />
    </div>
  );
}
