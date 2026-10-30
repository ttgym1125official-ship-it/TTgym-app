import React from "react";
import { createRoot } from "react-dom/client";

const path = window.location.pathname.replace(/\/+$/, "");
const isAdmin = path === "/admin";
// LINE公式アカウントの健康ダッシュボード（LIFF）。/liff と /liff/profile
// LINE内で速く開けるよう、アプリ本体とは別のチャンクで読み込む
const isLiff = path === "/liff" || path.startsWith("/liff/");
// スタッフ用の顧客カルテ（顧客スプレッドシート＋アプリ・公式LINEの記録をまとめた管理表）
const isKarte = path === "/karte";

const root = createRoot(document.getElementById("root"));

if (isLiff) {
  document.body.style.background = "#F3F1EC";
  document.title = "健康ダッシュボード";
  import("./liff/LiffApp.jsx").then(({ default: LiffApp }) => root.render(<LiffApp />));
} else if (isKarte) {
  document.body.style.background = "#F3F1EC";
  document.title = "顧客カルテ | TTGYM";
  import("./karte/KarteApp.jsx").then(({ default: KarteApp }) => root.render(<KarteApp />));
} else {
  import("./storage.js") // installs window.storage before App/AdminDashboard render
    .then(() => Promise.all([import("./App.jsx"), import("./AdminDashboard.jsx")]))
    .then(([{ default: App }, { default: AdminDashboard }]) => root.render(isAdmin ? <AdminDashboard /> : <App />));
}
