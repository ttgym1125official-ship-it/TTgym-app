// LIFF の初期化とデータAPI(api/nutrition.js)の呼び出し。
// VITE_LIFF_ID が未設定、または URL に ?demo=1 があるときはデモモードで動き、
// サーバーには何も送らずサンプルデータを表示する（デザイン確認用）。

import { calcTargets } from "./nutrients.js";
import { makeDemoData } from "./demoData.js";

const LIFF_ID = import.meta.env.VITE_LIFF_ID;
const LIFF_SDK = "https://static.line-scdn.net/liff/edge/2/sdk.js";

export const isDemo = !LIFF_ID || new URLSearchParams(window.location.search).has("demo");

let liffReady = null;
let demoState = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error("LIFF SDKを読み込めませんでした"));
    document.head.appendChild(s);
  });
}

export function initLiff() {
  if (isDemo) return Promise.resolve();
  if (!liffReady) {
    liffReady = (async () => {
      await loadScript(LIFF_SDK);
      await window.liff.init({ liffId: LIFF_ID });
      if (!window.liff.isLoggedIn()) {
        window.liff.login({ redirectUri: window.location.href });
        await new Promise(() => {}); // ログイン画面へ遷移するまで待つ
      }
    })();
  }
  return liffReady;
}

async function call(method, params) {
  await initLiff();
  const token = window.liff.getAccessToken();
  const url = method === "GET" ? `/api/nutrition?${new URLSearchParams(params)}` : "/api/nutrition";
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(method === "POST" ? { "Content-Type": "application/json" } : {}) },
    body: method === "POST" ? JSON.stringify(params) : undefined,
  });
  if (!res.ok) {
    let msg = `通信エラー (${res.status})`;
    try { msg = (await res.json()).error || msg; } catch (e) { /* JSON以外のエラー */ }
    throw new Error(msg);
  }
  return res;
}

function demo() {
  if (!demoState) demoState = makeDemoData();
  return demoState;
}

function demoResult() {
  const d = demo();
  return { ...d, targets: calcTargets(d.profile) };
}

export async function fetchData() {
  if (isDemo) return demoResult();
  return (await call("GET", { action: "data" })).json();
}

export async function post(action, payload) {
  if (isDemo) {
    const d = demo();
    if (action === "profile") {
      d.profile = { ...payload.profile };
    } else if (action === "deleteItem") {
      d.meals = d.meals
        .map(m => (m.id === payload.mealId ? { ...m, items: m.items.filter(i => i.id !== payload.itemId) } : m))
        .filter(m => m.items.length);
    } else if (action === "deleteMeal") {
      d.meals = d.meals.filter(m => m.id !== payload.mealId);
    } else if (action === "addWeight") {
      d.weights = [...d.weights.filter(w => w.date !== payload.date), { id: String(Date.now()), date: payload.date, weight: Number(payload.weight), bodyFat: payload.bodyFat ? Number(payload.bodyFat) : null }];
    } else if (action === "deleteWeight") {
      d.weights = d.weights.filter(w => w.id !== payload.id);
    } else if (action === "addMeal") {
      await new Promise(r => setTimeout(r, 600));
      const items = payload.items.map((it, i) => ({ id: `${Date.now()}-${i}`, n: {}, ...it }));
      const title = items.length > 2 ? `${items[0].name}・${items[1].name} ほか${items.length - 2}品` : items.map(i => i.name).join("・");
      d.meals = [...d.meals, { id: String(Date.now()), date: payload.date, time: payload.time, label: payload.label, title, hasImage: false, manual: true, items }];
    } else if (action === "water") {
      const next = Math.max(0, (d.water[payload.date] || 0) + payload.ml);
      d.water = { ...d.water, [payload.date]: next };
    } else if (action === "goal") {
      d.goal = { ...d.goal, ...payload.goal };
      return { ok: true };
    } else if (action === "photo") {
      d.photos = { ...d.photos, [payload.which]: payload.dataUrl };
      return { ok: true };
    }
    return demoResult();
  }
  return (await call("POST", { action, ...payload })).json();
}

export async function fetchGoal() {
  if (isDemo) {
    const d = demo();
    return { linked: false, goal: d.goal, photos: d.photos, points: 12 };
  }
  return (await call("GET", { action: "goal" })).json();
}

const imageCache = new Map();
export async function mealImageUrl(mealId) {
  if (isDemo) return null;
  if (!imageCache.has(mealId)) {
    imageCache.set(mealId, call("GET", { action: "image", meal: mealId })
      .then(r => r.blob())
      .then(b => URL.createObjectURL(b))
      .catch(() => null));
  }
  return imageCache.get(mealId);
}

export function closeOrBack() {
  if (!isDemo && window.liff?.isInClient?.()) window.liff.closeWindow();
  else window.history.back();
}

export function openPage(path = "") {
  window.location.href = `/liff${path}${isDemo ? "?demo=1" : ""}`;
}

export function openDashboard() {
  openPage("");
}
