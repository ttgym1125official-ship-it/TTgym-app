// リッチメニューから開く、LINEの中だけで完結するページ。
//   /liff/condition   体調・トレーニング管理（アプリの体調管理・トレーニングタブ）
//   /liff/growth      My成長・測定結果（アプリの成長・レポート・コメントタブ）
//   /liff/online      オンライントレーニングサポート（配信・食事プログラム・トレーニングプログラム）
//   /liff/recipe      レシピ・おすすめ店
//   /liff/beforeafter ビフォーアフター（TTGYMのビフォーアフターのページへそのまま移動）
// 体調・成長のページ（Care.jsx）は、アプリと同じ記録（data:<会員ID>:<key>）を読み書きするので、
// アプリ・管理画面・LINEのダッシュボードと同じ内容が見える（未連携の人は line_<LINE userId> に保存）。
import React, { Suspense, lazy, useEffect, useMemo, useState } from "react";
import {
  Activity, ArrowLeft, Camera, ChefHat, ChevronDown, ChevronRight, LoaderCircle,
  MapPin, Phone, Play, Sparkles, Utensils,
} from "lucide-react";
import { isDemo, openDashboard, closeOrBack, checkAccess } from "./api.js";
import { Header, Toast, BlockedScreen } from "./ui.jsx";
import { publishedRecipes, recipeImage } from "../recipes.js";
import { STORE_CHAINS, STORE_MENU } from "../storeMenu.js";
import { AGING_NUTRIENTS } from "../careData.js";
import { STORES, STORES_COVER } from "./content/stores.js";
import foodProgram from "./content/foodProgram.json";
import trainingProgram from "./content/trainingProgram.json";

// 体調・成長のページの中身（入力フォームなど）は開いたときだけ読み込む
const Care = lazy(() => import("./Care.jsx"));

export const PAGES = {
  condition: { eb: "CONDITION & TRAINING", title: "体調・トレーニング\n自己管理", sub: "毎日の体調と、トレーニングの記録をここで。トレーナーも同じ記録を見てサポートします。", Icon: Activity, tabs: [["condition", "体調管理"], ["training", "トレーニング"]] },
  items: { eb: "TTGYM RECOMMEND", title: "TTGYMオススメ\n健康アイテム", sub: "トレーナーが実際に選んでいる、からだづくりに役立つアイテムとサプリメントの目安。", Icon: Sparkles, tabs: null },
  online: { eb: "ONLINE SUPPORT", title: "オンライントレーニング\nサービス", sub: "ライブ配信・2週間食事プログラム・目的別トレーニングプログラムで、ジムの外でも一緒に。", Icon: Play, tabs: [["live", "配信"], ["food", "食事プログラム"], ["training", "トレーニング"]] },
  recipe: { eb: "RECIPE & SHOPS", title: "レシピ・おすすめ店", sub: "毎週土曜に届くボディメイクレシピと、TTGYMおすすめのお店・外食メニュー。", Icon: ChefHat, tabs: [["recipe", "レシピ"], ["shops", "おすすめ店"]] },
};

function Shell({ page, tab, onTab, children, toast }) {
  const p = PAGES[page];
  return (
    <div className="lf">
      <div className="lf-wrap">
        <Header right={<button className="lf-pill-back" onClick={openDashboard}>ダッシュボード</button>} />
        {isDemo && <div className="lf-demo">デモ表示中（サンプルデータ）</div>}
        <div className="lf-page-hero">
          <div className="eb">{p.eb}</div>
          <h1>{p.title}</h1>
          <p>{p.sub}</p>
        </div>
        {p.tabs && (
          <div className="lf-seg">
            {p.tabs.map(([k, l]) => <button key={k} className={tab === k ? "on" : ""} onClick={() => { onTab(k); window.scrollTo(0, 0); }}>{l}</button>)}
          </div>
        )}
        {!p.tabs && <div style={{ height: 8 }} />}
        {children}
        <div className="lf-page-foot">
          <button className="lf-sublink" onClick={closeOrBack}><ArrowLeft size={16} />LINEのトークに戻る</button>
        </div>
      </div>
      <Toast text={toast} />
    </div>
  );
}

const Spinner = () => <div className="lf-center" style={{ minHeight: "30vh" }}><LoaderCircle className="lf-spin" size={26} /></div>;

export default function AppPage({ page }) {
  const p = PAGES[page];
  const initial = new URLSearchParams(window.location.search).get("tab");
  const [tab, setTab] = useState(p.tabs?.some(([k]) => k === initial) ? initial : p.tabs?.[0][0]);
  const [toast, setToast] = useState("");
  const flash = msg => { setToast(msg); setTimeout(() => setToast(""), 2200); };
  useEffect(() => { document.title = p.title; }, [p]);
  const [blocked, setBlocked] = useState(false);
  useEffect(() => { checkAccess().then(ok => setBlocked(!ok)); }, []);
  if (blocked) return <BlockedScreen />;

  let body;
  if (page === "items") {
    body = <Items />;
  } else if (page === "condition") {
    body = <Suspense fallback={<Spinner />}><Care page={page} tab={tab} toast={flash} /></Suspense>;
  } else if (page === "online") {
    body = tab === "live" ? <Live /> : tab === "food" ? <FoodProgram /> : <TrainingProgram />;
  } else {
    body = tab === "recipe" ? <Recipes /> : <Shops />;
  }
  return <Shell page={page} tab={tab} onTab={setTab} toast={toast}>{body}</Shell>;
}

// ── オンライントレーニングサポート ──
const IG_LIVE = "https://www.instagram.com/self.mobility?stkn=MXBzNW85b3FhcW45cg==";
const IG_OFFICIAL = "https://www.instagram.com/ttgym_official?stkn=aHF2eGZmM2Rrdmxh&utm_source=qr";

function Live() {
  return (
    <>
      <div className="lf-live">
        <a className="dark" href={IG_LIVE} target="_blank" rel="noopener noreferrer">
          <span className="ic"><Play size={24} /></span>
          <span><div className="t">トレーニングLive配信</div><div className="s">一緒にトレーニングLive配信を開催中。セルフケア（ストレッチ＆モビリティ）の動画も毎日実践できます。</div></span>
          <ChevronRight className="go" size={20} />
        </a>
        <a href={IG_OFFICIAL} target="_blank" rel="noopener noreferrer">
          <span className="ic"><Camera size={22} /></span>
          <span><div className="t">トレーニング解説</div><div className="s">TTGYM公式Instagramのトレーニング動画</div></span>
          <ChevronRight className="go" size={20} />
        </a>
      </div>
      <div className="lf-card" style={{ marginTop: 12, fontSize: 14, lineHeight: 1.85 }}>
        トレーニングのプログラムが何百種類以上観れますので、ぜひチェックしてください！
        食事は「食事プログラム」、メニューは目的に合わせて「トレーニング」タブのプログラムを組み合わせると効果的です。
      </div>
    </>
  );
}

function FoodProgram() {
  const [t, setT] = useState(foodProgram[0].id);
  const cur = foodProgram.find(x => x.id === t);
  return (
    <>
      <div className="lf-tabs" style={{ marginTop: 0 }}>
        {foodProgram.map(x => <button key={x.id} className={`lf-tab${x.id === t ? " on" : ""}`} onClick={() => setT(x.id)}>{x.label}</button>)}
      </div>
      {/* 内容は TTGYM が作成した食事プログラム（src/liff/content/foodProgram.json） */}
      <div className="lf-rich" dangerouslySetInnerHTML={{ __html: cur.html }} />
    </>
  );
}

function TrainingProgram() {
  return (
    <div className="lf-rich">
      <div dangerouslySetInnerHTML={{ __html: trainingProgram.svg }} />
      <div dangerouslySetInnerHTML={{ __html: trainingProgram.intro }} />
      <div dangerouslySetInnerHTML={{ __html: trainingProgram.ig }} />
      <div dangerouslySetInnerHTML={{ __html: trainingProgram.programs }} />
    </div>
  );
}

// ── TTGYMオススメ健康アイテム ──
function Items() {
  const [items, setItems] = useState(null);
  useEffect(() => {
    loadGlobalList("global:recommendedItems", [{ id: "demo", name: "（例）ホエイプロテイン", category: "プロテイン", comment: "トレーニング後30分以内に1杯。", url: "" }]).then(setItems);
  }, []);
  const cats = ["アミノ酸", "ビタミン", "ミネラル", "追加提案"];
  return (
    <>
      <div className="lf-sec" style={{ marginTop: 22 }}><h2>おすすめアイテム</h2></div>
      {items === null ? <Spinner /> : items.length === 0 ? (
        <div className="lf-card lf-hint" style={{ margin: 0, lineHeight: 1.8 }}>おすすめアイテムは準備中です。もうしばらくお待ちください。</div>
      ) : items.map(it => (
        <div key={it.id} className="lf-card lf-store2">
          {it.photo && <img src={it.photo} alt={it.name} loading="lazy" />}
          <div className="body">
            {it.category && <div className="area">{it.category}</div>}
            <div className="nm">{it.name}</div>
            {it.comment && <div className="cm">{it.comment}</div>}
            {it.url && <div className="acts"><a href={it.url} target="_blank" rel="noopener noreferrer">くわしく見る・購入する</a></div>}
          </div>
        </div>
      ))}

      <div className="lf-sec"><h2>補いたい栄養素の目安</h2></div>
      <div className="lf-card">
        <p className="lf-hint" style={{ margin: "0 0 6px", lineHeight: 1.8 }}>食事だけでは摂りにくく、サプリメントなどで補いたい成分です（1日の目安）。体調管理のページで、摂ったものをチェックできます。</p>
        {cats.map(cat => (
          <div key={cat} style={{ marginTop: 10 }}>
            <div className="lf-cat">{cat}</div>
            {AGING_NUTRIENTS.filter(n => n.category === cat).map(n => (
              <div key={n.key} className="lf-row"><span className="n">{n.label}</span><span className="v">{n.range}</span></div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}

// ── レシピ・おすすめ店 ──
const fmt1 = n => (Number.isInteger(n) ? String(n) : Number(n).toFixed(1));

function Recipes() {
  const recipes = useMemo(() => publishedRecipes(), []);
  const [open, setOpen] = useState(recipes[0]?.vol ?? null);
  if (!recipes.length) return <div className="lf-card lf-hint">最初のレシピは今週土曜 朝8:00に公開されます。</div>;
  return (
    <>
      <p className="lf-hint" style={{ margin: "0 2px 12px", lineHeight: 1.8 }}>毎週土曜 朝8:00に新しいレシピが届きます（このトークにも配信されます）。</p>
      {recipes.map(r => {
        const on = open === r.vol;
        const n = r.nutrition;
        return (
          <div key={r.vol} className="lf-card lf-recipe">
            <button onClick={() => setOpen(on ? null : r.vol)}>
              <span className="vol">vol.{r.vol}</span>
              <span style={{ flex: 1, minWidth: 0 }}><div className="t">{r.title}</div><div className="s">{n.kcal}kcal ・ P{fmt1(n.p)}g ・ {r.minutes}分{r.tag ? ` ・ ${r.tag}` : ""}</div></span>
              <ChevronDown size={18} style={{ color: "var(--sub)", transform: on ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
            </button>
            {on && (
              <div className="body">
                <img src={recipeImage(r)} alt={r.title} loading="lazy" />
                <h4>材料（1人分）</h4>
                {r.ingredients.map((l, i) => <div key={i}>{l}</div>)}
                <h4>作り方</h4>
                {r.steps.map((s, i) => <div key={i} style={{ display: "flex", gap: 8, marginBottom: 4 }}><b style={{ color: "var(--gold-text)" }}>{i + 1}.</b><span>{s}</span></div>)}
                <h4>栄養成分（1人分）</h4>
                <div>エネルギー {n.kcal}kcal / P {fmt1(n.p)}g / F {fmt1(n.f)}g / C {fmt1(n.c)}g<br /><span style={{ color: "var(--sub)", fontSize: 12.5 }}>（糖質 {fmt1(n.sugar)}g / 食物繊維 {fmt1(n.fiber)}g）</span></div>
                <div className="pt">
                  <b style={{ marginTop: 0, color: "var(--gold-text)" }}>TTGYM's Point</b>
                  <b>このレシピの良さ</b>{r.point.good}
                  <b>こんな人におすすめ</b>{r.point.forWho}
                  <b>摂れる栄養とカラダへの効果</b>{r.point.nutrition}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

// 管理画面（公式LINE → おすすめのお店）で登録したお店。global:recommendedStores
// 管理画面（公式LINE → おすすめのお店／健康アイテム）で追加したもの
async function loadGlobalList(key, demo) {
  if (isDemo) return demo;
  await import("../storage.js");
  try {
    const r = await window.storage.get(key, true);
    return r ? JSON.parse(r.value) : [];
  } catch (e) {
    return [];
  }
}

const CIRCLED = "⓪①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";

function StoreCard({ s }) {
  const map = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${s.name} ${s.address || s.area || ""}`)}`;
  return (
    <div className="lf-card lf-store2">
      {s.photo && <img src={s.photo} alt={s.name} loading="lazy" />}
      <div className="body">
        <div className="area">{s.no ? `${CIRCLED[s.no] || s.no} ` : ""}{[s.area, s.genre].filter(Boolean).join(" ・ ")}</div>
        <div className="nm">{s.name}</div>
        {s.comment && <div className="cm">{s.comment}</div>}
        {(s.address || s.tel) && (
          <div className="info">
            {s.address && <div><MapPin size={13} />{s.address}</div>}
            {s.tel && <div><Phone size={13} /><a href={`tel:${s.tel.replace(/[^\d]/g, "")}`}>{s.tel}</a></div>}
          </div>
        )}
        <div className="acts">
          <a href={map} target="_blank" rel="noopener noreferrer">地図を見る</a>
          {s.url && <a href={s.url} target="_blank" rel="noopener noreferrer">お店の情報</a>}
        </div>
      </div>
    </div>
  );
}

// チェーン店ごとに、たんぱく質が多く脂質が控えめなメニューを3つ
function chainPicks(chain) {
  return STORE_MENU.filter(m => m.name.startsWith(`${chain}:`))
    .map(m => ({ ...m, score: m.protein * 4 - m.fat * 2 - m.calories / 100 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

function Shops() {
  const [added, setAdded] = useState([]);
  const [area, setArea] = useState("すべて");
  const [chain, setChain] = useState(STORE_CHAINS[0]);
  const all = [...STORES, ...added];
  const areas = [...new Set(all.map(s => s.area).filter(Boolean))];
  const shown = area === "すべて" ? all : all.filter(s => s.area === area);
  useEffect(() => { loadGlobalList("global:recommendedStores", []).then(setAdded); }, []);
  return (
    <>
      <img className="lf-store-cover" src={STORES_COVER.image} alt={`${STORES_COVER.title}　${STORES_COVER.text}`} />
      <div className="lf-sec"><h2>おすすめのお店</h2><span className="meta">{shown.length}店</span></div>
      <div className="lf-tabs" style={{ marginTop: 0 }}>
        {["すべて", ...areas].map(a => <button key={a} className={`lf-tab${a === area ? " on" : ""}`} onClick={() => setArea(a)}>{a}</button>)}
      </div>
      {shown.map(s => <StoreCard key={s.id} s={s} />)}

      <div className="lf-sec"><h2>外食のおすすめメニュー</h2></div>
      <div className="lf-tabs" style={{ marginTop: 0 }}>
        {STORE_CHAINS.map(c => <button key={c} className={`lf-tab${c === chain ? " on" : ""}`} onClick={() => setChain(c)}>{c}</button>)}
      </div>
      <div className="lf-card">
        {chainPicks(chain).map(m => (
          <div key={m.name} className="lf-pick">
            <div style={{ minWidth: 0 }}><div className="n">{m.name.split(": ")[1]}</div>{m.note && <div className="nt">{m.note}</div>}</div>
            <div className="v"><b>P{fmt1(m.protein)}g</b><br />{m.calories}kcal ・ F{fmt1(m.fat)}</div>
          </div>
        ))}
        <p className="lf-hint" style={{ margin: "12px 0 0", lineHeight: 1.8 }}>ダッシュボードの「お店から選ぶ」から、このまま食事に記録できます。</p>
      </div>
      <div style={{ textAlign: "center", marginTop: 14 }}>
        <button className="lf-sublink" onClick={() => openDashboard()}><Utensils size={16} />ダッシュボードで記録する</button>
      </div>
    </>
  );
}

// ── ビフォーアフター ──

