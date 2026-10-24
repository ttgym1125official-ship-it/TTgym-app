// 栄養素の定義・目標値の計算・判定ロジック。LIFFダッシュボード(src/liff)と
// LINE webhook(api/)の両方から読み込むので、ブラウザ専用/Node専用のAPIは使わない。

export const CATEGORIES = [
  { id: "vitamin", label: "ビタミン" },
  { id: "mineral", label: "ミネラル" },
  { id: "lipid", label: "脂質の質" },
  { id: "fiber", label: "食物繊維・塩分" },
];

// kind: "target" = 目標量まで摂りたいもの / "limit" = 上限を超えないようにしたいもの
// tip = 吹き出し下の引用ブロック、adviceFoods = アドバイス欄で「〜などで補いましょう」に使う食品
export const NUTRIENTS = [
  // ── ビタミン ──
  { key: "vitA", name: "ビタミンA", unit: "µg", cat: "vitamin", kind: "target",
    role: "目や皮膚・粘膜の健康を保ち、暗い所での見え方や免疫の働きを支えます。",
    foods: ["鶏・豚レバー", "うなぎ", "にんじん", "かぼちゃ", "ほうれん草", "卵黄"],
    tip: "脂に溶けるビタミンなので、炒め物など油と一緒に摂ると吸収がよくなります。",
    adviceFoods: "レバー・うなぎ・にんじん・かぼちゃ" },
  { key: "vitB1", name: "ビタミンB1", unit: "mg", cat: "vitamin", kind: "target",
    role: "糖質をエネルギーに変えます。不足すると疲れやすく、集中力が落ちやすくなります。",
    foods: ["豚ヒレ・もも肉", "うなぎ", "玄米", "大豆・枝豆", "たらこ"],
    tip: "にんにく・玉ねぎ・ねぎと一緒に摂ると吸収が高まります。水に溶けやすいので汁ごと食べられる料理が◎。",
    adviceFoods: "豚肉・玄米・大豆・枝豆" },
  { key: "vitB2", name: "ビタミンB2", unit: "mg", cat: "vitamin", kind: "target",
    role: "脂質をエネルギーに変え、皮膚・髪・爪や粘膜の健康を保ちます。",
    foods: ["レバー", "卵", "納豆", "牛乳・ヨーグルト", "さば"],
    tip: "脂質を多く摂る日やよく運動する日は、特に意識して摂りましょう。",
    adviceFoods: "卵・納豆・牛乳・ヨーグルト・さば" },
  { key: "vitB6", name: "ビタミンB6", unit: "mg", cat: "vitamin", kind: "target",
    role: "たんぱく質の分解・合成を助け、神経の働きやホルモンのバランスにも関わります。",
    foods: ["まぐろ", "かつお", "鶏むね肉", "さんま", "バナナ", "にんにく"],
    tip: "たんぱく質を多く摂る人ほど必要量が増えます。",
    adviceFoods: "まぐろ・かつお・鶏むね肉・バナナ" },
  { key: "vitB12", name: "ビタミンB12", unit: "µg", cat: "vitamin", kind: "target",
    role: "赤血球をつくり、神経の働きを正常に保ちます。",
    foods: ["しじみ・あさり", "牡蠣", "さんま", "レバー", "卵"],
    tip: "植物性の食品にはほとんど含まれないので、魚介・卵・乳製品から摂りましょう。",
    adviceFoods: "しじみ・あさり・牡蠣・さんま・卵" },
  { key: "vitC", name: "ビタミンC", unit: "mg", cat: "vitamin", kind: "target",
    role: "コラーゲンをつくって肌や血管を丈夫にし、抗酸化・免疫の働き、鉄の吸収を助けます。",
    foods: ["赤・黄パプリカ", "ブロッコリー", "キウイ", "いちご", "柑橘類", "じゃがいも"],
    tip: "熱と水に弱いので、生で食べるか、短時間の加熱がおすすめです。",
    adviceFoods: "パプリカ・ブロッコリー・キウイ・柑橘類" },
  { key: "vitD", name: "ビタミンD", unit: "µg", cat: "vitamin", kind: "target",
    role: "カルシウムの吸収を助けて骨を丈夫にし、筋肉や免疫の働きにも関わります。",
    foods: ["鮭", "さんま・いわし", "しらす干し", "きくらげ・干ししいたけ", "卵黄"],
    tip: "日光を浴びると皮膚でもつくられます。1日15〜30分ほどの散歩も効果的です。",
    adviceFoods: "鮭・さんま・いわし・しらす干し" },
  { key: "vitE", name: "ビタミンE", unit: "mg", cat: "vitamin", kind: "target",
    role: "強い抗酸化作用で細胞の老化を防ぎ、血行をよくします。",
    foods: ["アーモンド", "アボカド", "かぼちゃ", "うなぎ", "オリーブオイル"],
    tip: "ビタミンCと一緒に摂ると抗酸化の働きが長持ちします。",
    adviceFoods: "アーモンド・アボカド・かぼちゃ" },
  { key: "vitK", name: "ビタミンK", unit: "µg", cat: "vitamin", kind: "target",
    role: "出血したときに血を固め、カルシウムを骨に定着させます。",
    foods: ["納豆", "小松菜", "ほうれん草", "ブロッコリー", "わかめ"],
    tip: "血液をサラサラにする薬（ワルファリン）を飲んでいる方は医師に相談してください。",
    adviceFoods: "納豆・小松菜・ほうれん草・ブロッコリー" },
  { key: "folate", name: "葉酸", unit: "µg", cat: "vitamin", kind: "target",
    role: "細胞や赤血球をつくるのに必要です。妊娠を考えている時期には特に重要です。",
    foods: ["枝豆", "ブロッコリー", "ほうれん草", "アスパラガス", "レバー", "いちご"],
    tip: "水と熱に弱いので、蒸す・電子レンジ調理がおすすめです。",
    adviceFoods: "枝豆・ブロッコリー・ほうれん草・アスパラガス" },
  { key: "niacin", name: "ナイアシン", unit: "mg", cat: "vitamin", kind: "target",
    role: "糖質・脂質をエネルギーに変え、皮膚や粘膜を保ちます。アルコールの分解にも使われます。",
    foods: ["たらこ", "まぐろ", "かつお", "鶏むね肉", "ピーナッツ"],
    tip: "お酒を飲む日は消費が増えます。",
    adviceFoods: "まぐろ・かつお・鶏むね肉・たらこ" },
  { key: "pantothenic", name: "パントテン酸", unit: "mg", cat: "vitamin", kind: "target",
    role: "糖質・脂質の代謝を助け、ストレスに対抗するホルモンづくりに関わります。",
    foods: ["レバー", "鶏肉", "納豆", "卵", "アボカド", "きのこ"],
    tip: "いろいろな食品に含まれるので、品数を増やすと自然に摂れます。",
    adviceFoods: "鶏肉・納豆・卵・アボカド・きのこ" },
  { key: "biotin", name: "ビオチン", unit: "µg", cat: "vitamin", kind: "target",
    role: "皮膚や髪の健康を保ち、糖の代謝を助けます。",
    foods: ["レバー", "卵", "ピーナッツ", "大豆", "まいたけ"],
    tip: "生の卵白を大量に食べると吸収が妨げられるので、卵は加熱がおすすめです。",
    adviceFoods: "卵・ピーナッツ・大豆・まいたけ" },

  // ── ミネラル ──
  { key: "calcium", name: "カルシウム", unit: "mg", cat: "mineral", kind: "target",
    role: "骨と歯をつくり、筋肉の収縮や神経の伝達にも欠かせません。",
    foods: ["牛乳・チーズ・ヨーグルト", "しらす・ししゃも", "豆腐・厚揚げ", "小松菜", "ひじき"],
    tip: "ビタミンD（魚・きのこ）と一緒に摂ると吸収が高まります。",
    adviceFoods: "牛乳・チーズ・ヨーグルト・しらす・ししゃも・豆腐・厚揚げ" },
  { key: "iron", name: "鉄", unit: "mg", cat: "mineral", kind: "target",
    role: "赤血球のヘモグロビンとして全身に酸素を運びます。不足すると疲れやすさ・息切れの原因に。",
    foods: ["赤身の牛肉", "レバー", "あさり", "かつお", "小松菜", "大豆・ひじき"],
    tip: "ビタミンCと一緒に摂ると吸収率が上がります。食事中の濃いお茶・コーヒーは控えめに。",
    adviceFoods: "赤身の牛肉・レバー・あさり・かつお・小松菜" },
  { key: "zinc", name: "亜鉛", unit: "mg", cat: "mineral", kind: "target",
    role: "味覚を保ち、新しい細胞づくり、免疫、ホルモンの働きに関わります。",
    foods: ["牡蠣", "牛赤身肉", "豚レバー", "卵黄", "カシューナッツ"],
    tip: "加工食品やインスタント食品が多いと不足しやすくなります。",
    adviceFoods: "牡蠣・牛赤身肉・卵・カシューナッツ" },
  { key: "magnesium", name: "マグネシウム", unit: "mg", cat: "mineral", kind: "target",
    role: "骨や歯をつくり、筋肉の収縮やエネルギーづくりなど、たくさんの酵素の働きを助けます。",
    foods: ["豆腐・納豆", "玄米", "アーモンド", "ほうれん草", "わかめ・ひじき", "バナナ"],
    tip: "精製された白米・パンより、玄米や全粒粉を選ぶと摂りやすくなります。",
    adviceFoods: "豆腐・納豆・玄米・アーモンド・海藻" },
  { key: "potassium", name: "カリウム", unit: "mg", cat: "mineral", kind: "target",
    role: "余分なナトリウム（塩分）を排出し、血圧を正常に保ちます。筋肉の動きにも関わります。",
    foods: ["バナナ", "アボカド", "ほうれん草", "じゃがいも・さつまいも", "納豆", "トマト"],
    tip: "水に溶けやすいので、ゆで汁ごと食べられるスープや生野菜がおすすめです。",
    adviceFoods: "バナナ・アボカド・いも類・野菜" },
  { key: "phosphorus", name: "リン", unit: "mg", cat: "mineral", kind: "target",
    role: "カルシウムと一緒に骨や歯をつくり、エネルギーを生み出す働きにも欠かせません。",
    foods: ["魚", "肉", "卵", "乳製品", "大豆製品"],
    tip: "加工食品にも多く含まれるので、摂りすぎに注意しつつ自然な食品から摂りましょう。",
    adviceFoods: "魚・肉・卵・乳製品" },
  { key: "copper", name: "銅", unit: "mg", cat: "mineral", kind: "target",
    role: "鉄の利用を助けて赤血球をつくり、骨や血管の健康にも関わります。",
    foods: ["牛レバー", "牡蠣", "えび・いか", "ナッツ類", "大豆"],
    tip: "鉄と一緒に働くので、貧血が気になる方は両方を意識しましょう。",
    adviceFoods: "牡蠣・えび・いか・ナッツ・大豆" },
  { key: "manganese", name: "マンガン", unit: "mg", cat: "mineral", kind: "target",
    role: "骨の形成や、糖質・脂質の代謝を助ける酵素の材料になります。",
    foods: ["玄米", "大豆・納豆", "緑茶", "しょうが", "ナッツ類"],
    tip: "植物性食品に多く含まれます。主食を玄米や雑穀にするのも手軽です。",
    adviceFoods: "玄米・大豆・納豆・ナッツ" },
  { key: "selenium", name: "セレン", unit: "µg", cat: "mineral", kind: "target",
    role: "抗酸化酵素の材料となり、細胞を酸化ストレスから守ります。",
    foods: ["かつお・まぐろ", "いわし", "卵", "鶏肉", "ねぎ"],
    tip: "魚介類に多く、和食中心だと不足しにくい栄養素です。",
    adviceFoods: "かつお・まぐろ・いわし・卵" },
  { key: "iodine", name: "ヨウ素", unit: "µg", cat: "mineral", kind: "target",
    role: "甲状腺ホルモンの材料となり、代謝や成長を調節します。",
    foods: ["昆布", "わかめ", "ひじき", "のり", "たら"],
    tip: "海藻に非常に多く含まれます。昆布だしの味噌汁など、少量でも十分補えます。",
    adviceFoods: "昆布・わかめ・ひじき" },
  { key: "chromium", name: "クロム", unit: "µg", cat: "mineral", kind: "target",
    role: "インスリンの働きを助け、血糖値を安定させます。",
    foods: ["あおさ・ひじき", "黒こしょう", "玄米", "ブロッコリー", "肉類"],
    tip: "精製食品で減りやすいので、未精製の穀物や野菜を取り入れましょう。",
    adviceFoods: "ひじき・玄米・ブロッコリー" },
  { key: "molybdenum", name: "モリブデン", unit: "µg", cat: "mineral", kind: "target",
    role: "尿酸の代謝や、体内の有害物質の分解を助けます。",
    foods: ["納豆・大豆", "米", "レバー", "枝豆", "ピーナッツ"],
    tip: "穀類や豆類に多く、日本人の食事では不足しにくい栄養素です。",
    adviceFoods: "納豆・大豆・枝豆" },

  // ── 脂質の質 ──
  { key: "saturatedFat", name: "飽和脂肪酸", unit: "g", cat: "lipid", kind: "limit",
    role: "エネルギー源になりますが、摂りすぎると血中のLDLコレステロールが増えやすくなります。",
    foods: ["バター", "生クリーム", "脂身の多い肉", "ベーコン・ソーセージ", "洋菓子"],
    tip: "肉は脂身の少ない部位を選び、乳製品は低脂肪のものを取り入れると抑えやすくなります。",
    adviceFoods: "脂身の多い肉・バター・洋菓子" },
  { key: "n3", name: "n-3系（オメガ3）", unit: "g", cat: "lipid", kind: "target",
    role: "血液をサラサラに保ち、中性脂肪を下げる働きがあります。脳の健康にも関わります。",
    foods: ["さば・いわし・さんま", "鮭", "えごま油・あまに油", "くるみ", "ちりめんじゃこ"],
    tip: "熱や酸化に弱いので、えごま油・あまに油はドレッシングなど加熱しない料理に使いましょう。",
    adviceFoods: "さば・いわし・さんま・鮭・くるみ" },
  { key: "n6", name: "n-6系（オメガ6）", unit: "g", cat: "lipid", kind: "target",
    role: "細胞膜の材料となり、皮膚の健康を保ちます。体内でつくれない必須脂肪酸です。",
    foods: ["大豆油・コーン油", "ごま", "くるみ", "大豆", "鶏肉"],
    tip: "揚げ物や加工食品で摂りすぎやすいので、オメガ3とのバランスを意識しましょう。",
    adviceFoods: "ごま・くるみ・大豆" },
  { key: "monoFat", name: "一価不飽和脂肪酸", unit: "g", cat: "lipid", kind: "target",
    role: "LDLコレステロールを増やしにくく、酸化しにくい脂質です。",
    foods: ["オリーブオイル", "アボカド", "アーモンド", "なたね油", "マカダミアナッツ"],
    tip: "炒め物の油をオリーブオイルに替えるだけでも手軽に増やせます。",
    adviceFoods: "オリーブオイル・アボカド・アーモンド" },
  { key: "transFat", name: "トランス脂肪酸", unit: "g", cat: "lipid", kind: "limit",
    role: "摂りすぎるとLDLコレステロールを増やし、HDLコレステロールを減らします。",
    foods: ["マーガリン", "ショートニング", "菓子パン", "スナック菓子", "揚げ物"],
    tip: "菓子パン・スナック・ファストフードの頻度を減らすのが一番の近道です。",
    adviceFoods: "菓子パン・スナック菓子・揚げ物" },
  { key: "cholesterol", name: "コレステロール", unit: "mg", cat: "lipid", kind: "limit",
    role: "細胞膜やホルモンの材料になります。多くは体内でつくられます。",
    foods: ["卵", "レバー", "いか・えび", "たらこ・いくら", "うなぎ"],
    tip: "体内での合成量が調整されるため、健康な方は過度に気にしすぎなくて大丈夫です。",
    adviceFoods: "卵・レバー・魚卵" },

  // ── 食物繊維・塩分 ──
  { key: "fiber", name: "食物繊維", unit: "g", cat: "fiber", kind: "target",
    role: "腸内環境を整え、血糖値の急上昇やコレステロールの吸収を抑えます。",
    foods: ["ごぼう", "きのこ", "海藻", "大麦・玄米", "納豆・豆類", "ブロッコリー"],
    tip: "主食を玄米やもち麦ごはんにすると、毎食しっかり摂れます。",
    adviceFoods: "ごぼう・きのこ・海藻・大麦・豆類" },
  { key: "solubleFiber", name: "水溶性食物繊維", unit: "g", cat: "fiber", kind: "target",
    role: "糖や脂質の吸収をゆるやかにし、腸内の善玉菌のエサになります。",
    foods: ["もち麦・大麦", "海藻", "オクラ", "納豆", "アボカド", "りんご"],
    tip: "ネバネバ・ぬるぬるした食品に多く含まれます。",
    adviceFoods: "もち麦・海藻・オクラ・納豆" },
  { key: "insolubleFiber", name: "不溶性食物繊維", unit: "g", cat: "fiber", kind: "target",
    role: "便のかさを増やして腸の動きを活発にし、お通じを整えます。",
    foods: ["ごぼう", "きのこ", "豆類", "玄米", "さつまいも", "ブロッコリー"],
    tip: "水分と一緒に摂ると効果的です。こまめな水分補給も意識しましょう。",
    adviceFoods: "ごぼう・きのこ・豆類・玄米" },
  { key: "salt", name: "食塩相当量", unit: "g", cat: "fiber", kind: "limit",
    role: "体の水分バランスを保ちますが、摂りすぎると高血圧やむくみの原因になります。",
    foods: ["ラーメン・うどんの汁", "漬物", "加工肉", "練り物", "調味料"],
    tip: "麺類の汁を残す、だしや香辛料・酸味を活かすと無理なく減らせます。",
    adviceFoods: "麺類の汁・漬物・加工肉" },
  { key: "sugar", name: "糖質", unit: "g", cat: "fiber", kind: "limit",
    role: "脳や筋肉のエネルギー源です。摂りすぎると体脂肪として蓄えられます。",
    foods: ["ごはん", "パン", "麺類", "いも類", "果物", "甘い飲み物"],
    tip: "トレーニング前後に多めに、夜は控えめにするなどタイミングを意識すると効果的です。",
    adviceFoods: "甘い飲み物・菓子類" },
];

export const NUTRIENT_KEYS = NUTRIENTS.map(n => n.key);
export const NUTRIENT_BY_KEY = Object.fromEntries(NUTRIENTS.map(n => [n.key, n]));

// ── 目標値（日本人の食事摂取基準 2025年版の推奨量・目安量・目標量をもとに設定）──
// 年齢帯: 0=〜29歳, 1=30〜49歳, 2=50〜64歳, 3=65歳〜
const DRI = {
  male: {
    vitA: [850, 900, 900, 850], vitB1: [1.1, 1.2, 1.1, 1.0], vitB2: [1.6, 1.7, 1.6, 1.4],
    vitB6: [1.5, 1.5, 1.5, 1.4], vitB12: [4, 4, 4, 4], vitC: [100, 100, 100, 100],
    vitD: [9, 9, 9, 9], vitE: [6.5, 6.5, 7.0, 7.0], vitK: [150, 150, 150, 150],
    folate: [240, 240, 240, 240], niacin: [15, 16, 15, 14], pantothenic: [6, 6, 6, 6],
    biotin: [50, 50, 50, 50],
    calcium: [800, 750, 750, 750], iron: [7, 7.5, 7, 7], zinc: [9, 9.5, 9.5, 9],
    magnesium: [340, 380, 370, 350], potassium: [3000, 3000, 3000, 3000],
    phosphorus: [1000, 1000, 1000, 1000], copper: [0.8, 0.9, 0.9, 0.8],
    manganese: [3.5, 3.5, 3.5, 3.5], selenium: [30, 30, 30, 30], iodine: [140, 140, 140, 140],
    chromium: [10, 10, 10, 10], molybdenum: [30, 30, 30, 30],
    n3: [2.2, 2.0, 2.2, 2.2], n6: [12, 10, 10, 9],
    fiber: [20, 22, 22, 20], salt: [7.5, 7.5, 7.5, 7.5],
  },
  female: {
    vitA: [650, 700, 700, 700], vitB1: [0.8, 0.9, 0.8, 0.8], vitB2: [1.2, 1.2, 1.2, 1.1],
    vitB6: [1.2, 1.2, 1.2, 1.1], vitB12: [4, 4, 4, 4], vitC: [100, 100, 100, 100],
    vitD: [9, 9, 9, 9], vitE: [5.0, 5.5, 6.0, 6.5], vitK: [150, 150, 150, 150],
    folate: [240, 240, 240, 240], niacin: [11, 12, 11, 11], pantothenic: [5, 5, 5, 5],
    biotin: [50, 50, 50, 50],
    calcium: [650, 650, 650, 650], iron: [10.5, 10.5, 10.5, 6.0], zinc: [7.5, 8, 8, 7.5],
    magnesium: [280, 290, 290, 280], potassium: [2600, 2600, 2600, 2600],
    phosphorus: [800, 800, 800, 800], copper: [0.7, 0.7, 0.7, 0.7],
    manganese: [3.0, 3.0, 3.0, 3.0], selenium: [25, 25, 25, 25], iodine: [140, 140, 140, 140],
    chromium: [10, 10, 10, 10], molybdenum: [25, 25, 25, 25],
    n3: [1.7, 1.7, 1.9, 2.0], n6: [9, 8, 8, 8],
    fiber: [18, 18, 18, 17], salt: [6.5, 6.5, 6.5, 6.5],
  },
};

function ageBand(age) {
  if (age < 30) return 0;
  if (age < 50) return 1;
  if (age < 65) return 2;
  return 3;
}

export const ACTIVITY = {
  low: { label: "低い", desc: "デスクワーク中心", factor: 1.2 },
  normal: { label: "普通", desc: "軽い運動を週1〜2回", factor: 1.375 },
  high: { label: "高い", desc: "週3〜5回のトレーニング", factor: 1.55 },
  veryHigh: { label: "非常に高い", desc: "毎日ハードに運動する", factor: 1.9 },
};

export const GOALS = {
  lose: { label: "減量する", desc: "1日 −300 kcal", delta: -300, proteinPerKg: 2.0 },
  keep: { label: "いまをキープ", desc: "体重を維持する", delta: 0, proteinPerKg: 1.6 },
  gain: { label: "筋肉をつける", desc: "1日 +300 kcal", delta: 300, proteinPerKg: 2.0 },
};

export const PFC_RANGE = { p: [13, 20], f: [20, 30], c: [50, 65] };

// 基礎代謝: 入力があればそれを使い、なければ Mifflin-St Jeor 式
export function calcBmr(profile) {
  if (Number(profile.bmr) > 0) return Number(profile.bmr);
  const base = 10 * profile.weight + 6.25 * profile.height - 5 * profile.age;
  return base + (profile.sex === "female" ? -161 : 5);
}

export function calcTargets(profile) {
  if (!profile || !profile.weight || !profile.height || !profile.age) return null;
  const sex = profile.sex === "female" ? "female" : "male";
  const goal = GOALS[profile.goal] || GOALS.keep;
  const factor = (ACTIVITY[profile.activity] || ACTIVITY.normal).factor;
  const kcal = Math.round(calcBmr(profile) * factor + goal.delta);
  const p = Math.round(profile.weight * goal.proteinPerKg);
  const f = Math.round((kcal * 0.25) / 9);
  const c = Math.max(0, Math.round((kcal - p * 4 - f * 9) / 4));
  const band = ageBand(profile.age);
  const n = {};
  for (const [key, arr] of Object.entries(DRI[sex])) n[key] = arr[band];
  n.saturatedFat = Math.round(((kcal * 0.07) / 9) * 10) / 10;
  n.monoFat = 20;
  n.transFat = 2;
  n.cholesterol = 300;
  n.solubleFiber = Math.round((n.fiber / 3) * 10) / 10;
  n.insolubleFiber = Math.round(((n.fiber * 2) / 3) * 10) / 10;
  n.sugar = 250;
  return { kcal, p, f, c, n };
}

// 判定: target系は 50%未満=不足 / 100%未満=もう少し / 300%以上=多め / それ以外=十分
//        limit系は 上限以内=適正 / 超過=多め
export function nutrientStatus(def, value, target) {
  // 画面に出す%（整数に丸めた値）と判定がずれないよう、丸めてから比べる
  const pct = target > 0 ? Math.round((value / target) * 100) : 0;
  if (def.kind === "limit") return pct <= 100 ? "ok" : "over";
  if (pct < 50) return "low";
  if (pct < 100) return "almost";
  if (pct >= 300) return "much";
  return "enough";
}

export const STATUS_LABEL = {
  low: "不足", almost: "もう少し", enough: "十分", ok: "適正", much: "多め", over: "多め",
};

export function emptyNutrients() {
  return Object.fromEntries(NUTRIENT_KEYS.map(k => [k, 0]));
}

export function sumItems(items) {
  const t = { kcal: 0, p: 0, f: 0, c: 0, n: emptyNutrients() };
  for (const it of items || []) {
    t.kcal += Number(it.kcal) || 0;
    t.p += Number(it.p) || 0;
    t.f += Number(it.f) || 0;
    t.c += Number(it.c) || 0;
    for (const k of NUTRIENT_KEYS) t.n[k] += Number(it.n?.[k]) || 0;
  }
  return t;
}

export function sumMeals(meals) {
  return sumItems((meals || []).flatMap(m => m.items || []));
}

// 表示用の丸め: 100以上は整数、10以上は小数1桁、それ未満は小数2桁（有効数字3桁相当）
export function fmt(v) {
  const x = Number(v) || 0;
  if (x === 0) return "0";
  const a = Math.abs(x);
  if (a >= 100) return Math.round(x).toLocaleString("ja-JP");
  if (a >= 10) return String(Math.round(x * 10) / 10);
  if (a >= 1) return String(Math.round(x * 100) / 100);
  return String(Math.round(x * 100) / 100);
}

// 不足が大きい順にアドバイスを作る（ダッシュボードとLINE返信で共通）
export function buildAdvice(totals, targets, limit = 3) {
  const lows = NUTRIENTS
    .filter(d => d.kind === "target")
    .map(d => ({ d, pct: targets.n[d.key] ? Math.round((totals.n[d.key] / targets.n[d.key]) * 100) : 100 }))
    .filter(x => x.pct < 50)
    .sort((a, b) => a.pct - b.pct)
    .slice(0, limit)
    .map(({ d, pct }) => ({
      type: "low",
      title: `${d.name}が不足（${Math.round(pct)}%）`,
      body: `${d.adviceFoods}などで補いましょう。`,
    }));
  const overs = NUTRIENTS
    .filter(d => d.kind === "limit" && targets.n[d.key] && totals.n[d.key] > targets.n[d.key])
    .map(d => ({
      type: "over",
      title: `${d.name}が多め（${Math.round((totals.n[d.key] / targets.n[d.key]) * 100)}%）`,
      body: `${d.adviceFoods}を控えめにしましょう。`,
    }));
  const out = [...lows, ...overs];
  const remainP = targets.p - totals.p;
  if (remainP > 5) {
    out.push({ type: "low", title: `たんぱく質をあと ${Math.round(remainP)}g`, body: "鶏むね肉・魚・卵・豆腐・ギリシャヨーグルトがおすすめです。" });
  }
  return out;
}

// PFCのエネルギー比率(%)。たんぱく質4・脂質9・炭水化物4kcal/g で計算
export function pfcRatio(t) {
  const pk = t.p * 4, fk = t.f * 9, ck = t.c * 4;
  const sum = pk + fk + ck;
  if (!sum) return { p: 0, f: 0, c: 0 };
  const p = Math.round((pk / sum) * 100), f = Math.round((fk / sum) * 100);
  return { p, f, c: 100 - p - f };
}

export function pfcBalanceLabel(ratio) {
  const out = ["p", "f", "c"].filter(k => ratio[k] < PFC_RANGE[k][0] || ratio[k] > PFC_RANGE[k][1]).length;
  if (out === 0) return { label: "バランス良好", tone: "good" };
  if (out <= 2) return { label: "少し偏りあり", tone: "warn" };
  return { label: "偏りあり", tone: "bad" };
}
