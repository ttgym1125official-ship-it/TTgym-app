// セッションで選べるメニュー（はじめから入っているもの）。
// お店独自のメニューはカルテの「設定」から追加でき、global:karteMenus に保存される。
// unit: "reps"（回数）か "sec"（秒）。load: 重量を入れる種目か
// unit: "reps"（回数）か "sec"（秒）。load: 重量を入れる種目か。
// group: カテゴリの中の小見出し。mobility: 「秒（分・回も選べる）× セット」を ＋− で増やす種目（モビリティだけ）
export const MENU_CATEGORIES = [
  { key: "care", label: "ストレッチ/ケア" },
  { key: "core", label: "コア/腹筋" },
  { key: "lower", label: "下半身" },
  { key: "upper", label: "上半身" },
  { key: "kick", label: "キックボクシング" },
  { key: "cardio", label: "有酸素" },
  // サーキット: 上の種目を組み合わせて名前を付けて保存しておき、押すと今日の内容に入る（global:karteCircuits）
  { key: "circuit", label: "サーキット" },
];

const MOBILITY = "モビリティトレーニング";
const TRUNK = "体幹";
const ABS = "腹筋トレーニング（屈曲・回旋）";

export const DEFAULT_MENUS = [
  { cat: "care", name: "調整", load: false, unit: "sec" },
  { cat: "care", name: "ストレッチ", load: false, unit: "sec" },
  { cat: "care", group: MOBILITY, mobility: true, name: "足関節（足首）", load: false, unit: "sec" },
  { cat: "care", group: MOBILITY, mobility: true, name: "股関節", load: false, unit: "sec" },
  { cat: "care", group: MOBILITY, mobility: true, name: "胸椎（背中）", load: false, unit: "sec" },
  { cat: "care", group: MOBILITY, mobility: true, name: "肩甲胸郭関節（肩甲骨）", load: false, unit: "sec" },
  { cat: "care", group: MOBILITY, mobility: true, name: "肩関節（肩甲上腕関節）", load: false, unit: "sec" },
  { cat: "care", group: MOBILITY, mobility: true, name: "頸椎上部（首の付け根）", load: false, unit: "sec" },
  { cat: "care", name: "筋膜リリース", load: false, unit: "sec" },
  { cat: "core", group: TRUNK, name: "プランク（フロントプランク）", load: false, unit: "sec" },
  { cat: "core", group: TRUNK, name: "サイドプランク", load: false, unit: "sec" },
  { cat: "core", group: TRUNK, name: "バードドッグ", load: false },
  { cat: "core", group: TRUNK, name: "デッドバグ", load: false },
  { cat: "core", group: TRUNK, name: "ベアクロール（四つん這い移動）", load: false },
  { cat: "core", group: TRUNK, name: "ホローボディホールド", load: false, unit: "sec" },
  { cat: "core", group: ABS, name: "クランチ", load: false },
  { cat: "core", group: ABS, name: "レッグレイズ（リバースクランチ）", load: false },
  { cat: "core", group: ABS, name: "バイシクルクランチ", load: false },
  { cat: "core", group: ABS, name: "ロシアンツイスト", load: false },
  { cat: "core", group: ABS, name: "Vシット（V字腹筋）", load: false },
  { cat: "core", group: ABS, name: "マウンテンクライマー", load: false },
  { cat: "lower", name: "スクワット", load: true },
  { cat: "lower", name: "ブルガリアンスクワット", load: true },
  { cat: "lower", name: "デッドリフト", load: true },
  { cat: "lower", name: "ルーマニアンデッドリフト", load: true },
  { cat: "lower", name: "ヒップスラスト", load: true },
  { cat: "lower", name: "ランジ", load: true },
  { cat: "lower", name: "レッグプレス", load: true },
  { cat: "lower", name: "レッグカール", load: true },
  { cat: "lower", name: "アブダクション", load: true },
  { cat: "upper", name: "ベンチプレス", load: true },
  { cat: "upper", name: "ダンベルプレス", load: true },
  { cat: "upper", name: "ラットプルダウン", load: true },
  { cat: "upper", name: "シーテッドロー", load: true },
  { cat: "upper", name: "ショルダープレス", load: true },
  { cat: "upper", name: "サイドレイズ", load: true },
  { cat: "upper", name: "アームカール", load: true },
  { cat: "upper", name: "トライセプスエクステンション", load: true },
  { cat: "upper", name: "腕立て伏せ", load: false },
  { cat: "kick", name: "ミット打ち", load: false, unit: "sec" },
  { cat: "kick", name: "シャドー", load: false, unit: "sec" },
  { cat: "kick", name: "サンドバッグ", load: false, unit: "sec" },
  { cat: "kick", name: "ミドルキック", load: false },
  { cat: "kick", name: "コンビネーション", load: false },
  { cat: "cardio", name: "バイク", load: false, unit: "sec" },
  { cat: "cardio", name: "トレッドミル", load: false, unit: "sec" },
  { cat: "cardio", name: "縄跳び", load: false, unit: "sec" },
  { cat: "cardio", name: "HIIT", load: false, unit: "sec" },
];

// 当日の体調（セッションの最初に聞く）
export const DAY_CONDITIONS = [
  { n: 5, label: "絶好調", color: "#2E9E6A" },
  { n: 4, label: "良い", color: "#7DC59D" },
  { n: 3, label: "普通", color: "#A8A59D" },
  { n: 2, label: "疲れ気味", color: "#C9973A" },
  { n: 1, label: "不調", color: "#C8624A" },
];

// 気になる部位（痛み・張り）
export const BODY_PARTS = ["首", "肩", "背中", "腰", "股関節", "膝", "足首", "手首", "肘"];
