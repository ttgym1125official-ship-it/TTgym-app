// 体調管理・トレーニング・成長・コメントの内容（質問項目・アドバイス文・目安値）。
// TTGYMアプリ（App.jsx）と公式LINEのページ（src/liff/Care.jsx）で共通。

export const BOWEL_OPTIONS = ["◎ 快調", "○ 良好", "△ 普通", "▽ やや不調", "✕ 不調"];
export const SLEEP_LEVELS = [
  { n: 1, label: "浅い", desc: "何度も目が覚めた" },
  { n: 2, label: "やや浅い", desc: "途中で目が覚めた" },
  { n: 3, label: "普通", desc: "特に問題なく眠れた" },
  { n: 4, label: "やや深い", desc: "ぐっすり眠れた" },
  { n: 5, label: "深い", desc: "熟睡できた" },
];
export const FATIGUE_LEVELS = [
  { n: 1, label: "なし" }, { n: 2, label: "少し" }, { n: 3, label: "普通" },
  { n: 4, label: "強い" }, { n: 5, label: "非常に強い" },
];
export const MENTAL_LEVELS = [
  { n: 1, label: "不調" }, { n: 2, label: "やや不調" }, { n: 3, label: "普通" },
  { n: 4, label: "良好" }, { n: 5, label: "絶好調" },
];
export const MEAL_AMOUNTS = ["少なめ", "適量", "多め"];

// Daily target ranges for cellular rejuvenation / anti-aging, as specified by
// the gym owner. Amino acids and most vitamins/minerals here are typically
// taken as supplements rather than reliably estimated from a meal photo, so
// they're tracked as a self-report checklist rather than an auto-calculated
// number — ticking a box records "摂取した" for that item today.
export const AGING_NUTRIENTS = [
  { key: "glutamine", label: "グルタミン", range: "5〜10g", category: "アミノ酸" },
  { key: "glycine", label: "グリシン", range: "3〜5g", category: "アミノ酸" },
  { key: "nac", label: "NAC", range: "600〜1200mg", category: "アミノ酸" },
  { key: "carnitine", label: "L-カルニチン", range: "500〜1000mg", category: "アミノ酸" },
  { key: "arginine", label: "アルギニン/シトルリン", range: "3〜5g", category: "アミノ酸" },
  { key: "vitaminC", label: "ビタミンC", range: "1000〜3000mg", category: "ビタミン" },
  { key: "vitaminD3", label: "ビタミンD3", range: "2000〜5000IU", category: "ビタミン" },
  { key: "vitaminE", label: "ビタミンE", range: "100〜400mg", category: "ビタミン" },
  { key: "bComplex", label: "ビタミンB群(B1,B2,B6,B12等)", range: "25〜50mg", category: "ビタミン" },
  { key: "magnesium", label: "マグネシウム", range: "400〜600mg", category: "ミネラル" },
  { key: "zinc", label: "亜鉛", range: "15〜30mg", category: "ミネラル" },
  { key: "selenium", label: "セレン", range: "100〜200μg", category: "ミネラル" },
  { key: "silica", label: "シリカ", range: "30〜50mg", category: "ミネラル" },
  // Additional items suggested for a beauty/health(美と健康)focus.
  { key: "omega3", label: "オメガ3(EPA/DHA)", range: "1000〜2000mg", category: "追加提案" },
  { key: "collagen", label: "コラーゲンペプチド", range: "5〜10g", category: "追加提案" },
  { key: "coq10", label: "コエンザイムQ10", range: "100〜200mg", category: "追加提案" },
  { key: "astaxanthin", label: "アスタキサンチン", range: "4〜12mg", category: "追加提案" },
  { key: "biotin", label: "ビオチン", range: "2.5〜5mg", category: "追加提案" },
];

export const AGING_PRINCIPLES = [
  {
    key: "fasting",
    label: "オートファジー:14〜16時間の空腹時間を作れましたか?",
    note: "※毎日行う必要はありません。週に2〜3回など、無理のない範囲で定期的に行いましょう。",
  },
  { key: "mitochondria", label: "ミトコンドリア活性化:高強度トレーニングを行いましたか?" },
  { key: "antiGlycation", label: "抗酸化・抗糖化:血糖値の急上昇や焦げ・揚げ物(AGEs)を避けられましたか?" },
];

// Each pool entry pairs an advice message with a concrete "次のステップ"
// (next step) action, shown together in the score comment card.
export const ADVICE_POOL = {
  ideal: {
    label: "理想的バランス",
    messages: [
      { text: "神経系が最も冴えている状態。高強度トレーニングに最適です。", nextStep: "今日は高強度種目やPRチャレンジからトレーニングを組み立てましょう。" },
      { text: "脳・神経・腸すべてが良いコンディション。今日は自己ベスト更新を狙いましょう。", nextStep: "メインリフトで重量更新にトライし、追い込んだ分は栄養補給を忘れずに。" },
      { text: "回復とパフォーマンスのバランスが取れています。集中力を要する種目から始めるのがおすすめです。", nextStep: "複雑なフォームが必要な種目やスキルトレーニングを優先して取り組みましょう。" },
      { text: "絶好調です。新しい種目やフォームの見直しに挑戦するのに向いています。", nextStep: "新種目の導入やフォーム動画チェックなど、質を高める取り組みに時間を使いましょう。" },
    ],
  },
  sympathetic: {
    label: "交感神経優位",
    messages: [
      { text: "集中力は高いが緊張気味。今日は深い呼吸を意識したセッションを。", nextStep: "セット間に深呼吸を3〜5回入れ、心拍を落ち着かせてから次のセットに入りましょう。" },
      { text: "やや興奮状態です。ウォームアップを長めに取り、徐々に強度を上げましょう。", nextStep: "通常より5分長くウォームアップし、軽負荷から段階的に重量を上げていきましょう。" },
      { text: "頭は冴えていますが力みやすい状態。フォーム確認を丁寧に行いましょう。", nextStep: "鏡や動画でフォームを確認しながら、丁寧に反復回数をこなしましょう。" },
      { text: "交感神経が優位です。トレーニング後のクールダウンをいつもより長めに。", nextStep: "終了後は10分程度のストレッチと呼吸法で副交感神経へ切り替えましょう。" },
    ],
  },
  parasympathetic: {
    label: "副交感神経優位",
    messages: [
      { text: "回復モード。ストレッチや神経系ドリルで整えましょう。", nextStep: "モビリティドリルと軽いストレッチを中心に、20〜30分程度の軽めのセッションにしましょう。" },
      { text: "身体がまだ休息を求めています。軽めの有酸素やモビリティワークが向いています。", nextStep: "ウォーキングや軽いバイクなど、心拍を上げすぎない有酸素を選びましょう。" },
      { text: "無理に追い込まず、可動域を広げるセッションに切り替えるのがおすすめです。", nextStep: "ストレッチポールやヨガなど、可動域改善を目的にしたメニューに変更しましょう。" },
      { text: "リカバリー優先の日。睡眠と栄養の質を今日は特に意識しましょう。", nextStep: "今夜はいつもより30分早く就寝し、タンパク質を意識した夕食を摂りましょう。" },
    ],
  },
  rest: {
    label: "要休息",
    messages: [
      { text: "疲労が蓄積しています。今日は完全休養か、ごく軽いストレッチに留めましょう。", nextStep: "今日はトレーニングを休み、10分程度の軽いストレッチと早めの就寝を心がけましょう。" },
      { text: "心身ともにお疲れのサインです。無理せずしっかり休むことが最大のパフォーマンス投資です。", nextStep: "睡眠時間を普段より1時間多く確保し、栄養と水分補給を優先しましょう。" },
      { text: "オーバーワークのリスクがあります。トレーナーに相談の上、メニューを調整しましょう。", nextStep: "次回来店時にトレーナーへ今週の疲労感を共有し、メニュー強度の調整を相談しましょう。" },
    ],
  },
};

export const REJUVENATION_TARGETS = [
  { key: "vitaminC", label: "ビタミンC", min: 1000, max: 3000, unit: "mg" },
  { key: "fiber", label: "食物繊維", min: 20, max: 25, unit: "g" },
  { key: "potassium", label: "カリウム", min: 3000, max: 3500, unit: "mg" },
  { key: "calcium", label: "カルシウム", min: 650, max: 800, unit: "mg" },
  { key: "iron", label: "鉄分", min: 7.5, max: 10, unit: "mg", note: "男性・非月経時の目安" },
  { key: "vitaminA", label: "ビタミンA", min: 800, max: 900, unit: "μgRAE" },
  { key: "sodium", label: "ナトリウム", max: 2000, unit: "mg", mode: "max", note: "食塩相当量6.5g未満が目安" },
];

export const COMMENT_TYPES = [
  { key: "weekly", label: "1週間のコメントとアドバイス" },
  { key: "monthly", label: "1ヶ月のコメントとアドバイス" },
  { key: "personal", label: "パーソナルのコメントとアドバイス" },
  { key: "condition", label: "体調管理へのコメントとアドバイス" },
];

// Food suggestions shown alongside the auto-generated weekly nutrient-gap
// advice below. Sodium is handled separately (SODIUM_ADVICE) since it's a
// "reduce this" nutrient rather than a "eat/supplement more of this" one.
export const NUTRIENT_FOOD_ADVICE = {
  vitaminC: "赤・黄パプリカ、ブロッコリー、キウイ、いちご、柑橘類など",
  fiber: "玄米・オートミール、ごぼう、きのこ類、海藻類、豆類など",
  potassium: "バナナ、アボカド、ほうれん草、さつまいも、豆類など",
  calcium: "乳製品、小魚(しらす等)、豆腐、小松菜、ごまなど",
  iron: "赤身肉、レバー、ほうれん草、ひじき、あさりなど",
  vitaminA: "にんじん、かぼちゃ、レバー、うなぎ、ほうれん草など",
};
export const SODIUM_ADVICE = "加工食品・外食・漬物を控えめにし、だしや香辛料での減塩、麺類のスープを残すことを意識しましょう。";

// 体調の記録から、今日のコンディションの判定とアドバイスを作る
export function conditionStatus({ sleep, mental, morningFatigue, bowel, sleepHours }) {
  const score = sleep + mental;
  let category;
  if (morningFatigue >= 4 && sleep <= 2) category = "rest";
  else if (score >= 8) category = "ideal";
  else if (score >= 5) category = "sympathetic";
  else category = "parasympathetic";
  const pool = ADVICE_POOL[category];
  const idx = (sleep + mental + morningFatigue + bowel) % pool.messages.length;
  let advice = pool.messages[idx].text;
  let nextStep = pool.messages[idx].nextStep;
  if (bowel >= 3) advice += " 腸内環境のケアもあわせて意識しましょう。";
  if (sleepHours && Number(sleepHours) < 6) advice += " 睡眠時間がやや短めなので、今夜は早めの就寝を。";
  return { label: pool.label, advice, nextStep };
}

// トレーニング1件の消費カロリーの概算（回数×重量、秒数のときは時間から）
export function workoutCalories(unit, count, weight) {
  return unit === "sec" ? Math.round((count / 60) * 8) : Math.round(count * weight * 0.1);
}
