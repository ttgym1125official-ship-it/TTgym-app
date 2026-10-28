// リッチメニューから開く、LINEの中だけで完結するページ。
//   /liff/condition   体調・トレーニング管理（アプリの体調管理・トレーニングタブ）
//   /liff/growth      My成長・測定結果（アプリの成長・レポート・コメントタブ）
//   /liff/online      オンライントレーニングサポート（配信・食事プログラム・トレーニングプログラム）
//   /liff/recipe      レシピ・おすすめ店
//   /liff/beforeafter ビフォーアフター
// 体調・成長のページ（Care.jsx）は、アプリと同じ記録（data:<会員ID>:<key>）を読み書きするので、
// アプリ・管理画面・LINEのダッシュボードと同じ内容が見える（未連携の人は line_<LINE userId> に保存）。
import React, { Suspense, lazy, useEffect, useMemo, useState } from "react";
import {
  Activity, ArrowLeft, Camera, ChefHat, ChevronDown, ChevronRight, LoaderCircle,
  MapPin, MessageCircle, Play, Sparkles, TrendingUp, Utensils,
} from "lucide-react";
import { fetchData, fetchGoal, post, isDemo, openDashboard, openPage, closeOrBack } from "./api.js";
import { Header, Toast } from "./ui.jsx";
import { publishedRecipes, recipeImage } from "../recipes.js";
import { STORE_CHAINS, STORE_MENU } from "../storeMenu.js";
import foodProgram from "./content/foodProgram.json";
import trainingProgram from "./content/trainingProgram.json";
import { BA_CASES, caseImage } from "./content/beforeAfter.js";
import { BeforeAfterPhotos } from "./BeforeAfterPhotos.jsx";

// 体調・成長のページの中身（入力フォームなど）は開いたときだけ読み込む
const Care = lazy(() => import("./Care.jsx"));

export const PAGES = {
  condition: { eb: "CONDITION & TRAINING", title: "体調・トレーニング管理", sub: "毎日の体調と、トレーニングの記録をここで。トレーナーも同じ記録を見てサポートします。", Icon: Activity, tabs: [["condition", "体調管理"], ["training", "トレーニング"]] },
  growth: { eb: "MY GROWTH", title: "My成長・測定結果", sub: "体重・体組成の変化、毎月のレポート、トレーナーからのコメントをまとめて確認できます。", Icon: TrendingUp, tabs: [["growth", "成長"], ["report", "レポート"], ["comments", "コメント"]] },
  online: { eb: "ONLINE SUPPORT", title: "オンライントレーニングサポート", sub: "ライブ配信・2週間食事プログラム・目的別トレーニングプログラムで、ジムの外でも一緒に。", Icon: Play, tabs: [["live", "配信"], ["food", "食事プログラム"], ["training", "トレーニング"]] },
  recipe: { eb: "RECIPE & SHOPS", title: "レシピ・おすすめ店", sub: "毎週土曜に届くボディメイクレシピと、TTGYMおすすめのお店・外食メニュー。", Icon: ChefHat, tabs: [["recipe", "レシピ"], ["shops", "おすすめ店"]] },
  beforeafter: { eb: "BEFORE & AFTER", title: "ビフォーアフター", sub: "あなたの変化の記録と、TTGYMでトレーニングされた会員様の変化の一例です。", Icon: Sparkles, tabs: null },
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

  let body;
  if (page === "condition" || page === "growth") {
    body = <Suspense fallback={<Spinner />}><Care page={page} tab={tab} toast={flash} /></Suspense>;
  } else if (page === "online") {
    body = tab === "live" ? <Live /> : tab === "food" ? <FoodProgram /> : <TrainingProgram />;
  } else if (page === "recipe") {
    body = tab === "recipe" ? <Recipes /> : <Shops />;
  } else {
    body = <BeforeAfter toast={flash} />;
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
async function loadStores() {
  if (isDemo) return [{ id: "demo", name: "（例）サラダ専門店 GREEN", area: "広尾", genre: "サラダ・ボウル", comment: "鶏むね＋玄米のボウルがおすすめ。\nドレッシングは別添えで。", url: "" }];
  await import("../storage.js");
  try {
    const r = await window.storage.get("global:recommendedStores", true);
    return r ? JSON.parse(r.value) : [];
  } catch (e) {
    return [];
  }
}

// チェーン店ごとに、たんぱく質が多く脂質が控えめなメニューを3つ
function chainPicks(chain) {
  return STORE_MENU.filter(m => m.name.startsWith(`${chain}:`))
    .map(m => ({ ...m, score: m.protein * 4 - m.fat * 2 - m.calories / 100 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

function Shops() {
  const [stores, setStores] = useState(null);
  const [chain, setChain] = useState(STORE_CHAINS[0]);
  useEffect(() => { loadStores().then(setStores); }, []);
  return (
    <>
      <div className="lf-sec" style={{ marginTop: 0 }}><h2>おすすめのお店</h2></div>
      {stores === null ? <Spinner /> : stores.length === 0 ? (
        <div className="lf-card lf-hint" style={{ lineHeight: 1.8 }}>おすすめのお店は準備中です。もうしばらくお待ちください。</div>
      ) : stores.map(s => (
        <div key={s.id} className="lf-card lf-store" style={{ marginBottom: 12 }}>
          {s.photo && <img src={s.photo} alt={s.name} />}
          <div style={{ minWidth: 0 }}>
            <div className="nm">{s.name}</div>
            {(s.area || s.genre) && <div className="meta"><MapPin size={12} style={{ verticalAlign: -1 }} /> {[s.area, s.genre].filter(Boolean).join(" ・ ")}</div>}
            {s.comment && <div className="cm">{s.comment}</div>}
            {s.url && <a href={s.url} target="_blank" rel="noopener noreferrer">お店の情報を見る →</a>}
          </div>
        </div>
      ))}

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
function BeforeAfter({ toast }) {
  const [g, setG] = useState(null);
  useEffect(() => { fetchGoal().then(setG).catch(() => setG({ photos: {}, goal: {} })); }, []);
  return (
    <>
      <div className="lf-sec" style={{ marginTop: 0 }}><h2>あなたのビフォーアフター</h2></div>
      <div className="lf-card">
        {g ? (
          <BeforeAfterPhotos photos={g.photos || {}} afterMonths={g.goal?.afterMonths} toast={toast}
            onChange={(slot, url) => setG(prev => ({ ...prev, photos: { ...prev.photos, [slot]: url } }))} />
        ) : <Spinner />}
        <p className="lf-hint" style={{ margin: "14px 0 0", lineHeight: 1.8 }}>写真はあなたとTTGYMのスタッフだけが見られます。経過月数は「目標設定」で変更できます。</p>
      </div>

      <div className="lf-sec"><h2>会員様の変化</h2></div>
      <p className="lf-hint" style={{ margin: "-6px 2px 14px", lineHeight: 1.8 }}>TTGYMでトレーニングされた会員様の変化の一例です。写真はすべてご本人の同意のもと掲載しています。</p>
      {BA_CASES.map(c => {
        const heading = c.tags.find(t => t === "MEN'S RESULT" || t === "MORE RESULTS");
        return (
          <React.Fragment key={c.no}>
            <div className="lf-card lf-case">
              <img src={caseImage(c)} alt={`Case ${c.no}`} loading="lazy" />
              <div className="cap">
                <div className="no">CASE {String(c.no).padStart(2, "0")}</div>
                <div className="tags">{c.tags.filter(t => t !== heading).map(t => <span key={t}>{t}</span>)}</div>
              </div>
            </div>
            {heading && <div className="lf-divider">{heading}</div>}
          </React.Fragment>
        );
      })}
      <div className="lf-cta">
        <h3>あなたも変わりませんか？</h3>
        <p>まずはLINEから無料カウンセリングにお申し込みください。<br />トレーナーが丁寧にお応えします。</p>
        <button onClick={closeOrBack}><MessageCircle size={16} style={{ verticalAlign: -3, marginRight: 6 }} />LINEで相談する</button>
      </div>
    </>
  );
}

