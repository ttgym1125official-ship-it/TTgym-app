// メンバーシップ（ランクとポイント）の定義と計算。公式アプリ(App.jsx)と
// LINE版の目標設定ページ(api/nutrition.js → src/liff/Goal.jsx)で共通。

export const TIERS = [
  { name: "Black", min: 0, color: "#3A3A3A" },
  { name: "Bronze", min: 30, color: "#A97142" },
  { name: "Silver", min: 60, color: "#B8B2A7" },
  { name: "Emerald", min: 150, color: "#4E8C6E" },
  { name: "Gold", min: 240, color: "#D4AF37" },
  { name: "Platinum", min: 360, color: "#DCE3E6" },
];

export const POINT_RULES = [
  "パーソナルトレーニング1回 → +2pt",
  "自宅トレーニング3回 → +1pt",
  "月次測定記録更新 → +3pt",
  "直近2日で記録が無い日 → -1pt(0が下限)",
];

// sessions: [{date, personalTraining}] / workouts: [{date}] / monthly: 月次測定の件数ぶんの配列
// activeDates: 何か記録がある日付(YYYY-MM-DD)の Set / recentDates: 直近2日の日付(今日・昨日)
export function computePoints({ sessions = [], workouts = [], monthlyCount = 0, activeDates, recentDates, adjustment = 0 }) {
  const missedDays = recentDates.filter(d => !activeDates.has(d)).length;
  const personalPoints = sessions.filter(s => s.personalTraining).length * 2;
  const homeTrainingDays = [...new Set(workouts.map(w => w.date))].filter(date => {
    const s = sessions.find(x => x.date === date);
    return !(s && s.personalTraining);
  }).length;
  const homePoints = Math.floor(homeTrainingDays / 3);
  const basePoints = personalPoints + homePoints + monthlyCount * 3;
  const emeraldMin = TIERS.find(t => t.name === "Emerald").min;
  const autoPoints = basePoints >= emeraldMin ? basePoints : Math.max(0, basePoints - missedDays);
  return Math.max(0, autoPoints + adjustment);
}

export function tierFor(points) {
  let idx = 0;
  TIERS.forEach((t, i) => { if (points >= t.min) idx = i; });
  return { tierIdx: idx, tier: TIERS[idx], nextTier: TIERS[idx + 1] || null };
}
