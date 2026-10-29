// LINEのリッチメニュー（2ページ・タブ切り替え）を作成して、全員のデフォルトにする。
// scripts/setup-rich-menu.mjs（手元・GitHub Actions）と api/line-admin.js（管理画面のボタン）から使う。
// 画像は public/liff/richmenu-main.png / richmenu-sub.png（scripts/render-rich-menu.mjs で作成）。
//
// links（空ならタイル名をメッセージとして送り、スタッフがチャットで対応する）: reserve, textbook（TTGYM教科書）,
//   teamtop（TEAM TOPメンバー参加申込み）, kickboxing（キックボクシング体験申込み）
// それ以外のタイルは LINE の中で開くページ（src/liff）:
//   今日の栄養 /liff、目標設定・MY成長・測定結果 /liff/goal、体調・トレーニング自己管理 /liff/condition、
//   オンライントレーニングサポート /liff/online、レシピ・おすすめ店 /liff/recipe、
//   TTGYMオススメ健康アイテム /liff/items
// ビフォーアフターは TTGYM のビフォーアフターのページ（BEFORE_AFTER_URL）を直接開く

export const BEFORE_AFTER_URL = "https://claude.ai/artifact/PALnehkVe6vqe72S7kkVz6";

export async function setupRichMenu({ token, liffId, links = {}, loadImage, log = () => {} }) {
  const liff = p => ({ type: "uri", uri: `https://liff.line.me/${liffId}${p}` });
  const linkOr = (url, text) => (url ? { type: "uri", uri: url } : { type: "message", text });
  const ALIAS = { main: "ttgym-main", sub: "ttgym-sub" };
  const MENU_NAMES = { main: "TTGYM main", sub: "TTGYM sub" };

  // Matches the layout drawn by scripts/render-rich-menu.mjs:
  // tabs y 0–150, upper row y 150–949, lower row y 949–1686
  const TAB_H = 150, ROW1_END = 949, SPLIT = Math.round((ROW1_END + 1686) / 2);
  const box = (x, y, width, height, action) => ({ bounds: { x, y, width, height }, action });
  const tabAreas = [
    box(0, 0, 1250, TAB_H, { type: "richmenuswitch", richMenuAliasId: ALIAS.main, data: "tab=main" }),
    box(1250, 0, 1250, TAB_H, { type: "richmenuswitch", richMenuAliasId: ALIAS.sub, data: "tab=sub" }),
  ];
  const lower = (a, b, c) => [
    box(0, ROW1_END, 833, 1686 - ROW1_END, a),
    box(833, ROW1_END, 834, 1686 - ROW1_END, b),
    box(1667, ROW1_END, 833, 1686 - ROW1_END, c),
  ];

  const MENUS = {
    main: [
      ...tabAreas,
      box(0, TAB_H, 1664, ROW1_END - TAB_H, liff("")),
      box(1664, TAB_H, 836, ROW1_END - TAB_H, liff("/goal")),
      ...lower(linkOr(links.reserve, "予約"), liff("/condition"), liff("/online")),
    ],
    sub: [
      ...tabAreas,
      box(0, TAB_H, 1250, ROW1_END - TAB_H, liff("/recipe")),
      box(1250, TAB_H, 1250, ROW1_END - TAB_H, liff("/items")),
      box(0, ROW1_END, 833, 1686 - ROW1_END, { type: "uri", uri: BEFORE_AFTER_URL }),
      box(833, ROW1_END, 834, 1686 - ROW1_END, linkOr(links.textbook, "TTGYM教科書")),
      // 右下は上下2つのボタン（TEAM TOP・キックボクシング体験）
      box(1667, ROW1_END, 833, SPLIT - ROW1_END, linkOr(links.teamtop, "TEAM TOPメンバー参加申込み")),
      box(1667, SPLIT, 833, 1686 - SPLIT, linkOr(links.kickboxing, "キックボクシング体験申込み")),
    ],
  };

  async function line(method, url, body, headers = { "Content-Type": "application/json" }) {
    const res = await fetch(url, { method, headers: { Authorization: `Bearer ${token}`, ...headers }, body });
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${url} → ${res.status} ${text}`);
    return text ? JSON.parse(text) : {};
  }

  const API = "https://api.line.me/v2/bot";
  const { richmenus: before = [] } = await line("GET", `${API}/richmenu/list`);

  const created = {};
  for (const key of ["main", "sub"]) {
    const { richMenuId } = await line("POST", `${API}/richmenu`, JSON.stringify({
      size: { width: 2500, height: 1686 },
      selected: true,
      name: MENU_NAMES[key],
      chatBarText: "メニュー",
      areas: MENUS[key],
    }));
    await line(
      "POST",
      `https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`,
      await loadImage(`richmenu-${key}.png`),
      { "Content-Type": "image/png" },
    );
    created[key] = richMenuId;
    log(`created ${key}: ${richMenuId}`);
  }

  // Point the aliases (used by the tabs) at the new menus
  for (const key of ["main", "sub"]) {
    const body = JSON.stringify({ richMenuId: created[key] });
    try {
      await line("POST", `${API}/richmenu/alias/${ALIAS[key]}`, body);
    } catch (e) {
      await line("POST", `${API}/richmenu/alias`, JSON.stringify({ richMenuAliasId: ALIAS[key], richMenuId: created[key] }));
    }
  }

  await line("POST", `${API}/user/all/richmenu/${created.main}`);
  log("set main as the default rich menu");

  // Remove menus left over from earlier runs (including the old single-page "TTGYM main")
  for (const m of before) {
    if (!Object.values(created).includes(m.richMenuId) && m.name?.startsWith("TTGYM")) {
      await line("DELETE", `${API}/richmenu/${m.richMenuId}`).catch(() => {});
      log(`deleted old ${m.name} ${m.richMenuId}`);
    }
  }
  return created;
}
