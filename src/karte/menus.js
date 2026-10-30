// セッションで選べるメニュー（はじめから入っているもの）。
// お店独自のメニューはカルテの「設定」から追加でき、global:karteMenus に保存される。
// unit: "reps"（回数）か "sec"（秒）。load: 重量を入れる種目か
export const MENU_CATEGORIES = [
  { key: "lower", label: "下半身" },
  { key: "upper", label: "上半身" },
  { key: "core", label: "体幹" },
  { key: "kick", label: "キックボクシング" },
  { key: "cardio", label: "有酸素" },
  { key: "care", label: "ストレッチ・ケア" },
];

export const DEFAULT_MENUS = [
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
  { cat: "core", name: "プランク", load: false, unit: "sec" },
  { cat: "core", name: "サイドプランク", load: false, unit: "sec" },
  { cat: "core", name: "クランチ", load: false },
  { cat: "core", name: "レッグレイズ", load: false },
  { cat: "core", name: "デッドバグ", load: false },
  { cat: "core", name: "ドローイン", load: false, unit: "sec" },
  { cat: "kick", name: "ミット打ち", load: false, unit: "sec" },
  { cat: "kick", name: "シャドー", load: false, unit: "sec" },
  { cat: "kick", name: "サンドバッグ", load: false, unit: "sec" },
  { cat: "kick", name: "ミドルキック", load: false },
  { cat: "kick", name: "コンビネーション", load: false },
  { cat: "cardio", name: "バイク", load: false, unit: "sec" },
  { cat: "cardio", name: "トレッドミル", load: false, unit: "sec" },
  { cat: "cardio", name: "縄跳び", load: false, unit: "sec" },
  { cat: "cardio", name: "HIIT", load: false, unit: "sec" },
  { cat: "care", name: "ストレッチ", load: false, unit: "sec" },
  { cat: "care", name: "筋膜リリース", load: false, unit: "sec" },
  { cat: "care", name: "姿勢改善エクササイズ", load: false },
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
