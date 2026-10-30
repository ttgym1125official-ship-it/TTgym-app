// /karte?demo=1 のサンプルデータ（Supabase には書かない）
import { jstToday } from "./store.js";

const day = n => new Date(Date.parse(`${jstToday()}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

// 写真の代わりの人型シルエット（before は少しふっくら）
function silhouette(width, tone, label) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400"><rect width="300" height="400" fill="${tone}"/>
<circle cx="150" cy="80" r="34" fill="#fff" opacity=".85"/>
<rect x="${150 - width / 2}" y="122" width="${width}" height="150" rx="${width / 3}" fill="#fff" opacity=".85"/>
<rect x="${150 - width / 2 + 6}" y="262" width="${width / 2 - 10}" height="118" rx="16" fill="#fff" opacity=".85"/>
<rect x="${150 + 4}" y="262" width="${width / 2 - 10}" height="118" rx="16" fill="#fff" opacity=".85"/>
<text x="150" y="388" font-size="16" text-anchor="middle" fill="#fff" font-family="sans-serif">${label}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function series(n, start, end, every, extra = () => ({})) {
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    const wobble = Math.sin(i * 1.7) * 0.25;
    return { id: `g${i}`, date: day(-(n - 1 - i) * every), weight: Math.round((start.w + (end.w - start.w) * t + wobble) * 10) / 10, bodyFat: Math.round((start.f + (end.f - start.f) * t + wobble / 2) * 10) / 10, muscleMass: Math.round((start.m + (end.m - start.m) * t) * 10) / 10, ...extra(t) };
  });
}

const conditions = n => Array.from({ length: n }, (_, i) => ({
  id: `c${i}`, date: day(-i), sleep: [4, 3, 4, 2, 5, 3, 4][i % 7], mental: [4, 4, 3, 3, 5, 4, 4][i % 7],
  morningFatigue: [2, 3, 2, 4, 1, 2, 2][i % 7], bowel: [1, 1, 2, 2, 0, 1, 1][i % 7], sleepHours: [7, 6.5, 7, 5.5, 8, 6, 7][i % 7],
}));

const session = (i, date, items, comment, memo, cond, staff = "田中") => ({
  id: `s${i}`, date, staff, condition: cond, parts: memo.includes("腰") ? ["腰"] : [], items, comment, memo, ticketUsed: true, createdAt: `${date}T10:00:00Z`,
});

export function demoEntries() {
  const sato = "demo_sato", suzuki = "demo_suzuki";
  const satoSessions = [
    session(1, day(-56), [{ name: "スクワット", cat: "lower", weight: 30, reps: 10, sets: 3 }, { name: "ラットプルダウン", cat: "upper", weight: 25, reps: 12, sets: 3 }, { name: "プランク", cat: "core", reps: 30, unit: "sec", sets: 2 }], "初回お疲れさまでした！フォームがとても丁寧です。", "膝が内に入りやすい。お尻の意識を声かけ。", 3),
    session(2, day(-35), [{ name: "スクワット", cat: "lower", weight: 35, reps: 10, sets: 3 }, { name: "ヒップスラスト", cat: "lower", weight: 30, reps: 12, sets: 3 }, { name: "ラットプルダウン", cat: "upper", weight: 27.5, reps: 12, sets: 3 }], "スクワットの重量アップ！お尻にしっかり効いていました。", "仕事が忙しく睡眠不足とのこと。", 2),
    session(3, day(-14), [{ name: "スクワット", cat: "lower", weight: 40, reps: 10, sets: 3 }, { name: "ヒップスラスト", cat: "lower", weight: 40, reps: 12, sets: 3 }, { name: "ミット打ち", cat: "kick", reps: 180, unit: "sec", sets: 3 }], "キックボクシングも初挑戦。パンチのキレが良かったです！", "腰に少し張りあり。デッドリフトは次回様子見。", 4),
    session(4, day(-3), [{ name: "スクワット", cat: "lower", weight: 42.5, reps: 10, sets: 3 }, { name: "ヒップスラスト", cat: "lower", weight: 45, reps: 10, sets: 3 }, { name: "ショルダープレス", cat: "upper", weight: 5, reps: 12, sets: 3 }, { name: "プランク", cat: "core", reps: 60, unit: "sec", sets: 2 }], "体脂肪率がスタートから−4%！ウエストも引き締まってきました。この調子です。", "次回はデッドリフト再開OK。目標まであと2kg。", 5),
  ];
  return {
    [`profile:${sato}`]: {
      id: sato, name: "佐藤 美咲", furigana: "サトウ ミサキ", birthdate: "1992-04-18", phone: "090-1111-2222", avatarColor: "#C9973A",
      goal: "結婚式までに−5kg。二の腕とお腹まわりをすっきりさせたい", targetWeight: 55, targetBodyFat: 24, lineUserId: "Udemo1", approved: true, lastActivityAt: `${day(0)}T09:00:00Z`,
      beforePhoto: silhouette(120, "#B8C5B4", "BEFORE"), afterPhoto: silhouette(96, "#8DA88E", "AFTER"),
    },
    [`line_user:Udemo1`]: sato,
    [`nutri:Udemo1`]: { line: { displayName: "みさき", pictureUrl: null }, profile: { fullName: "佐藤 美咲" }, meals: [], weights: [], water: {} },
    [`data:${sato}:growth`]: series(12, { w: 61.2, f: 31.5, m: 22.8 }, { w: 57.1, f: 27.3, m: 23.6 }, 7, t => ({ waist: Math.round((76 - 6 * t) * 10) / 10 })),
    [`data:${sato}:monthly`]: [
      { id: "m1", date: day(-56), situps: 18, benchMax: null, hipThrust: 30, note: "初回測定" },
      { id: "m2", date: day(-28), situps: 24, benchMax: null, hipThrust: 40, note: "" },
      { id: "m3", date: day(-1), situps: 29, benchMax: null, hipThrust: 50, note: "体幹が安定してきた" },
    ],
    [`data:${sato}:conditions`]: conditions(10),
    [`data:${sato}:workouts`]: [
      { id: "w1", date: day(-1), exercise: "スクワット", reps: 20, unit: "reps", weight: 0 },
      { id: "w2", date: day(-2), exercise: "プランク", reps: 45, unit: "sec", weight: 0 },
      { id: "w3", date: day(-5), exercise: "ランジ", reps: 12, unit: "reps", weight: 0 },
    ],
    [`data:${sato}:karteSessions`]: satoSessions,
    [`karte:${sato}`]: { tickets: 6, sheetTickets: 8, lastVisit: day(-3), note: "左膝に古傷あり（高校の部活）。ジャンプ系は控えめに。\n甘いものが好き。週末の外食が多い。" },
    [`profile_photo:${sato}:before_side`]: silhouette(110, "#B8C5B4", "BEFORE"),
    [`profile_photo:${sato}:after_side`]: silhouette(88, "#8DA88E", "AFTER"),

    [`profile:${suzuki}`]: {
      id: suzuki, name: "鈴木 健太", furigana: "スズキ ケンタ", birthdate: "1985-11-02", phone: "080-3333-4444", avatarColor: "#2F6B4F",
      goal: "ベンチプレス100kg。体脂肪15%以下をキープ", targetWeight: 72, approved: true, lastActivityAt: `${day(-2)}T09:00:00Z`,
    },
    [`data:${suzuki}:growth`]: series(8, { w: 76.4, f: 19.8, m: 33.1 }, { w: 74.2, f: 16.9, m: 34.4 }, 14),
    [`data:${suzuki}:monthly`]: [{ id: "m1", date: day(-60), benchMax: 80, situps: 35 }, { id: "m2", date: day(-30), benchMax: 85, situps: 38 }, { id: "m3", date: day(-2), benchMax: 90, situps: 41 }],
    [`data:${suzuki}:karteSessions`]: [
      session(1, day(-9), [{ name: "ベンチプレス", cat: "upper", weight: 80, reps: 5, sets: 5 }, { name: "ダンベルプレス", cat: "upper", weight: 26, reps: 10, sets: 3 }], "MAX更新に向けて順調です！", "右肩の可動域やや狭い。ストレッチ追加。", 4, "山本"),
    ],
    [`karte:${suzuki}`]: { tickets: 1, sheetTickets: 2, lastVisit: day(-9), note: "右肩に注意。" },

    [`nutri:Udemo2`]: {
      line: { displayName: "ゆか🌸", pictureUrl: null }, profile: { fullName: "高橋 由佳", age: 34, targetWeight: 50 }, goal: { goal: "産後太りを解消して、昔のジーンズを履きたい", targetWeight: 50 },
      weights: [{ id: "lw1", date: day(-20), weight: 54.8 }, { id: "lw2", date: day(-10), weight: 54.1 }, { id: "lw3", date: day(-1), weight: 53.5 }], meals: [], water: {}, followedAt: `${day(-21)}T09:00:00Z`,
    },
    [`data:line_Udemo2:conditions`]: conditions(4),
    [`nutri_photo:Udemo2:before`]: silhouette(112, "#D8C3A5", "BEFORE"),

    "global:karteSheet": {
      url: "https://docs.google.com/spreadsheets/d/DEMO/edit#gid=0", fetchedAt: new Date().toISOString(), headerIdx: 0,
      columns: { memberNo: 0, name: 1, furigana: 2, age: 3, plan: 4, tickets: 5, goal: 6, phone: 7, startDate: 8 },
      rows: [
        ["会員番号", "氏名", "フリガナ", "年齢", "プラン", "残り回数", "目標", "電話番号", "入会日"],
        ["1001", "佐藤 美咲", "サトウ ミサキ", "34", "16回券", "8", "ダイエット", "090-1111-2222", "2026/08/20"],
        ["1002", "鈴木 健太", "スズキ ケンタ", "40", "8回券", "2", "筋力アップ", "080-3333-4444", "2026/07/01"],
        ["1003", "高橋 由佳", "タカハシ ユカ", "34", "8回券", "5", "産後ダイエット", "070-5555-6666", "2026/10/01"],
        ["1004", "伊藤 誠", "イトウ マコト", "52", "回数券24回", "14", "腰痛改善・姿勢改善", "090-7777-8888", "2026/05/12"],
      ],
    },
    "global:karteStaff": ["田中", "山本", "佐々木"],
  };
}
