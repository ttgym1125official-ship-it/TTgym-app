// デモモード用のサンプルデータ（参考画面と同じ数値になるようにしてある）。

import { NUTRIENT_KEYS } from "./nutrients.js";

const TOTAL_N = {
  vitA: 168, vitB1: 0.44, vitB2: 0.47, vitB6: 0.73, vitB12: 0.75, vitC: 30, vitD: 0.6, vitE: 2.7,
  vitK: 174, folate: 119, niacin: 24.4, pantothenic: 2.89, biotin: 13.4,
  calcium: 71, iron: 4.38, zinc: 6.22, magnesium: 101, potassium: 1504, phosphorus: 507,
  copper: 0.49, manganese: 1.54, selenium: 48, iodine: 6, chromium: 3.35, molybdenum: 134,
  saturatedFat: 7.16, n3: 0.84, n6: 4.99, monoFat: 14.8, transFat: 0, cholesterol: 196,
  fiber: 8.62, solubleFiber: 1.98, insolubleFiber: 6.64, salt: 2.71, sugar: 105,
};

const ITEMS = [
  ["赤飯（小豆ご飯）", "ドーム型1盛・200g", 200, 372, 8.6, 1.2, 81.4],
  ["ジャークチキン（鶏もも皮つき焼き）", "1切れ大・150g", 150, 330, 34.8, 21.2, 0.2],
  ["ジャークチキンの下味（スパイス・塩・油）", "適量・8g", 8, 35, 0.2, 3.4, 1.0],
  ["グリーンサラダ（リーフレタス）", "1盛・60g", 60, 10, 0.8, 0.1, 1.9],
  ["ミニトマト", "1個・10g", 10, 3, 0.1, 0, 0.7],
  ["和風ドレッシング", "大さじ1・15g", 15, 27, 0.5, 2.1, 2.4],
  ["フライドポテト（皮つき）", "3切れ・70g", 70, 107, 1.6, 3.4, 18.0],
  ["野菜のピクルス（かぶ・ルッコラ等）", "小鉢分・35g", 35, 24, 5.0, 0.1, 8.4],
];

function jstDate(offsetDays = 0) {
  return new Date(Date.now() + 9 * 3600 * 1000 + offsetDays * 86400000).toISOString().slice(0, 10);
}

export function makeDemoData() {
  const totalKcal = ITEMS.reduce((s, it) => s + it[3], 0);
  const items = ITEMS.map(([name, amount, grams, kcal, p, f, c], i) => ({
    id: `demo-item-${i}`, name, amount, grams, kcal, p, f, c,
    n: Object.fromEntries(NUTRIENT_KEYS.map(k => [k, (TOTAL_N[k] * kcal) / totalKcal])),
  }));
  return {
    profile: { sex: "male", age: 27, height: 180, weight: 82, bodyFat: 14, bmr: null, activity: "veryHigh", goal: "gain", targetWeight: 78 },
    meals: [{ id: "demo-meal", date: jstDate(0), time: "08:25", label: "食事", title: "赤飯・ジャークチキン ほか6品", hasImage: false, items }],
    weights: [{ id: "demo-w", date: jstDate(0), weight: 82, bodyFat: 14 }],
  };
}
