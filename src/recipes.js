// 週刊 Body Make Recipe — shared by the app's レシピ tab (RecipeTab in App.jsx)
// and the Saturday LINE broadcast (api/weekly-recipe.js).
//
// A recipe becomes visible in the app, and is broadcast on LINE, once its
// `publishAt` has passed (use 07:30 JST so the 08:00 JST cron always finds it).
// `notice` is an optional one-off message shown at the top of TTGYM's Point. Add next week's recipe by appending an entry with
// the next vol number and the following Saturday 08:00 JST, plus its card
// image at public/recipes/vol<N>.png (see scripts/render-recipe-cards.mjs).
// Optionally set `image` to a different card image under public/recipes/ (e.g.
// the Canva-designed "/recipes/vol19.jpg", JPEG under 1MB) — it is then used in
// the app and on LINE instead of the generated vol<N>.png card.
//
// Nutrition values are per 1 serving, estimated from 日本食品標準成分表.

export const RECIPES = [
  {
    vol: 19,
    publishAt: "2026-09-29T07:30:00+09:00",
    image: "/recipes/vol19.jpg",
    notice:
      "システムの不具合により、約1ヶ月のあいだレシピ配信がストップしていました。楽しみにしてくださっていた皆さま、本当に申し訳ありません！\n" +
      "今日から配信を再開し、これからは毎週土曜の朝8時に新しいレシピをお届けします。引き続きよろしくお願いします！",
    title: "鶏むねのねぎ塩レモン",
    tag: "下味冷凍OK",
    minutes: 10,
    ingredients: [
      "鶏むね肉（皮なし）150g、長ねぎ1/4本、片栗粉小1、ごま油小1",
      "【下味用A】酒大1、レモン汁小2、鶏がらスープの素小1/2、おろしにんにく少々、塩・黒こしょう各少々",
    ],
    steps: [
      "鶏むね肉は繊維を断つように1cm厚のそぎ切りにし、片栗粉を薄くまぶす。（※これでパサつかず、しっとり仕上がる！）",
      "長ねぎはみじん切りにし、Aと一緒に鶏肉と保存袋へ。袋の上からよく揉み込む。",
      "すぐ食べない分は空気を抜いて平らにし、そのまま冷凍庫へ。（冷凍で約3週間OK）",
      "冷凍した場合は前日から冷蔵庫で解凍。フライパンにごま油を熱し、中火で両面を焼いて中までしっかり火を通す。",
      "器に盛り、仕上げにレモン汁（分量外）をひとかけすれば香りが立って完成！",
    ],
    nutrition: { kcal: 238, p: 35.6, f: 7.1, c: 6.2, sugar: 5.5, fiber: 0.7 },
    point: {
      good: "下味冷凍しておけば、帰って焼くだけで10分。脂質7.1gなのにタンパク質は35.6g、レモンでさっぱり最後まで食べやすい一皿です。",
      forWho: "減量中で脂質を抑えたい人／仕事帰りでも自炊を続けたい人／トレーニング後すぐにタンパク質を摂りたい人",
      nutrition: "鶏むね肉の良質なタンパク質で筋肉の材料をしっかり補給。イミダペプチドとレモンのクエン酸が疲労回復をサポートし、翌日に疲れを残しにくくなります。",
    },
  },
  {
    vol: 20,
    publishAt: "2026-10-03T07:30:00+09:00",
    image: "/recipes/vol20.jpg",
    title: "鮭ときのこのみそ漬け",
    tag: "下味冷凍OK",
    minutes: 12,
    ingredients: [
      "生鮭1切れ（120g）、しめじ50g、まいたけ40g、サラダ油小1/2",
      "【みそダレA】みそ大1/2、酒大1、みりん小1、おろし生姜少々",
    ],
    steps: [
      "鮭はキッチンペーパーで水気をしっかり拭き取る。（※これで生臭さが一気に消える！）",
      "しめじとまいたけは石づきを取り、食べやすくほぐす。",
      "保存袋にAを入れて混ぜ、鮭ときのこを加えて全体になじませる。空気を抜いて平らにし冷凍。（きのこは生のまま冷凍でOK！冷凍で約3週間）",
      "食べる前日に冷蔵庫で解凍。フライパンに油を薄くひき、中火で鮭を焼く。",
      "焼き色がついたら裏返し、きのこも加えて蓋をし弱火で5分蒸し焼き。鮭に火が通ったら完成！",
    ],
    nutrition: { kcal: 232, p: 30.1, f: 7.4, c: 8.9, sugar: 5.6, fiber: 3.3 },
    point: {
      good: "みそ漬けで冷凍するから味がしっかり染みて、焼くだけでごはんが進む主菜に。きのこ入りでボリュームも満点です。",
      forWho: "魚が不足しがちな人／筋肉痛や疲れが残りやすい人／お腹の調子を整えたい人",
      nutrition: "タンパク質30.1gに加え、鮭のアスタキサンチン(抗酸化成分)が運動で受けたダメージをケア。EPA・DHAで体のコンディションを整え、きのこの食物繊維3.3gで腸内環境もサポートします。",
    },
  },
  {
    vol: 21,
    publishAt: "2026-10-10T07:30:00+09:00",
    image: "/recipes/vol21.jpg",
    title: "豚ヒレのしょうが焼き",
    tag: "下味冷凍OK",
    minutes: 10,
    ingredients: [
      "豚ヒレ肉150g、玉ねぎ1/4個、片栗粉小1、サラダ油小1、キャベツ（千切り）50g",
      "【タレA】しょうゆ大1、酒大1、みりん小1、おろし生姜小1",
    ],
    steps: [
      "豚ヒレ肉は1cm厚に切り、ラップをかぶせて軽く叩いて薄くのばす。玉ねぎは薄切りにする。",
      "保存袋に豚肉、玉ねぎ、A、片栗粉を入れてよく揉み込む。（冷凍する場合は空気を抜いて平らにし冷凍庫へ。約3週間OK）",
      "冷凍した場合は前日から冷蔵庫で解凍しておく。",
      "フライパンに油を熱し、中火で豚肉と玉ねぎを焼く。タレごと入れて絡めながら中までしっかり火を通す。",
      "千切りキャベツと一緒に盛り付けて完成！",
    ],
    nutrition: { kcal: 298, p: 35.9, f: 9.7, c: 14.5, sugar: 12.7, fiber: 1.8 },
    point: {
      good: "定番のしょうが焼きを脂質の少ないヒレ肉でアレンジ。ガッツリ感はそのままに脂質は9.7gに抑えられます。",
      forWho: "減量中でもお肉をしっかり食べたい人／疲れやすい・だるさを感じる人／ハードに追い込んでいる人",
      nutrition: "豚肉に豊富なビタミンB1が糖質をエネルギーに変え、トレーニング中のスタミナ切れを防ぎます。タンパク質35.9gで筋肉づくりも◎、生姜で体が温まり代謝もサポート。",
    },
  },
  {
    vol: 22,
    publishAt: "2026-10-17T07:30:00+09:00",
    image: "/recipes/vol22.jpg",
    title: "牛もも肉とごぼうのすき煮",
    tag: "25分",
    minutes: 25,
    ingredients: [
      "牛もも薄切り肉110g、ごぼう1/4本、長ねぎ1/2本、しらたき75g",
      "【煮汁A】だし汁75ml、しょうゆ大3/4、みりん大1/2、酒大1/2、はちみつ小1/2",
    ],
    steps: [
      "ごぼうはささがきにして水にさらす。長ねぎは斜め切りにする。",
      "しらたきは食べやすく切り、下茹でして臭みを取る。",
      "鍋にAを入れて火にかけ、ごぼう・長ねぎ・しらたきを入れて野菜がしんなりするまで煮る。",
      "牛肉を広げながら加え、色が変わるまでさっと煮る。（※煮すぎると硬くなるので注意！）",
      "器に盛って完成！雑穀米と一緒に食べるのがおすすめです。",
    ],
    nutrition: { kcal: 249, p: 25.9, f: 5.6, c: 20.9, sugar: 15.1, fiber: 5.8 },
    point: {
      good: "すき焼き風の甘辛味なのに脂質はわずか5.6g。ごぼうとしらたきで食べ応えも満点の和の主菜です。",
      forWho: "筋力・パワーを伸ばしたい人／貧血気味・疲れやすい人／週末に満足感のある和食を食べたい人",
      nutrition: "牛もも肉の鉄分・亜鉛・クレアチンが、筋力アップと全身への酸素の運搬をサポート。ごぼうとしらたきの食物繊維5.8gで満腹感が続き、間食防止にもつながります。",
    },
  },
  {
    vol: 23,
    publishAt: "2026-10-24T07:30:00+09:00",
    image: "/recipes/vol23.jpg",
    title: "きのこソースの豆腐ハンバーグ",
    tag: "25分",
    minutes: 25,
    ingredients: [
      "鶏むねひき肉125g、木綿豆腐75g、玉ねぎ1/4個、卵1/2個、片栗粉大1/2、サラダ油小1",
      "【きのこソースA】しめじ50g、ケチャップ大1/2、中濃ソース大1/2、しょうゆ小1/2、水大2",
    ],
    steps: [
      "豆腐はキッチンペーパーで包んでしっかり水切りする。玉ねぎはみじん切りにする。",
      "ボウルにひき肉、豆腐、玉ねぎ、卵、片栗粉を入れて粘りが出るまでよく混ぜる。",
      "小判形に整え、油を熱したフライパンで焼く。焼き色がついたら裏返し、蓋をして弱火で5分蒸し焼きにして器に盛る。",
      "同じフライパンにほぐしたしめじとAの調味料を入れ、とろみがつくまで煮詰める。",
      "ハンバーグにたっぷりのきのこソースをかけて完成！",
    ],
    nutrition: { kcal: 342, p: 38.1, f: 13.9, c: 16.9, sugar: 14.4, fiber: 2.5 },
    point: {
      good: "鶏むねひき肉と豆腐で作るから、ふっくら大きいのにタンパク質38.1g。きのこソースで満足感もたっぷりです。",
      forWho: "ハンバーグを我慢したくない減量中の人／家族と同じメニューで体づくりしたい人／タンパク質量をしっかり稼ぎたい人",
      nutrition: "動物性(鶏肉・卵)と植物性(豆腐)のタンパク質を一度に摂れてアミノ酸バランスが◎。豆腐のカルシウム・イソフラボンも摂れて、筋肉と骨の両方をサポートします。",
    },
  },
  {
    vol: 24,
    publishAt: "2026-10-31T07:30:00+09:00",
    image: "/recipes/vol24.jpg",
    title: "たらと小松菜の豆乳みそスープ",
    tag: "腸活スープ",
    minutes: 15,
    ingredients: [
      "真だら(切り身)120g、小松菜70g、しめじ50g、無調整豆乳150ml、水100ml、ごま油小1/2",
      "【調味料A】和風だしの素小1/2、みそ小2、おろし生姜小1/2",
    ],
    steps: [
      "たらは一口大に切り、キッチンペーパーで水気をしっかり拭く。（※これで臭みが出にくくなる！）",
      "小松菜は4cm長さに切り、しめじは石づきを取ってほぐす。",
      "鍋にごま油を熱してしめじをさっと炒め、水と和風だしの素を入れて煮立てる。",
      "たらと小松菜を加え、弱めの中火で4〜5分煮てたらに火を通す。",
      "豆乳を加えてみそを溶き入れ、おろし生姜を加えて沸騰直前で火を止めれば完成！（※豆乳は煮立てると分離するので注意）",
    ],
    nutrition: { kcal: 217, p: 30.4, f: 6.3, c: 11.1, sugar: 7.7, fiber: 3.4 },
    point: {
      good: "鍋ひとつで15分。脂質6.3gなのにタンパク質30.4g、豆乳とみそのやさしい味で体の芯から温まる一杯です。",
      forWho: "冷えやむくみが気になる人／夜遅くでも軽くタンパク質を摂りたい人／お腹の調子を整えたい人",
      nutrition: "たらは高タンパク・低脂質の優秀食材。みその発酵パワーときのこ・小松菜の食物繊維で腸内環境をサポートし、小松菜のカルシウムと鉄、生姜の温め効果で冷えにくい体づくりを後押しします。",
    },
  },
];

export function isPublished(recipe, now = new Date()) {
  return new Date(recipe.publishAt).getTime() <= now.getTime();
}

export function publishedRecipes(now = new Date()) {
  return RECIPES.filter(r => isPublished(r, now)).sort((a, b) => b.vol - a.vol);
}

function fmt(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function recipeImage(r) {
  return r.image || `/recipes/vol${r.vol}.png`;
}

// The LINE message text sent under the card image (the image already shows the
// ingredients and steps, so the text is the title, nutrition and TTGYM's Point).
export function recipeMessageText(r) {
  const n = r.nutrition;
  return [
    `📱 【週刊：Body Make Recipe vol.${r.vol}】`,
    "",
    `「${r.title}」です！`,
    "材料と作り方は画像をチェック👆",
    "",
    `📊 1人分：${n.kcal}kcal ／ P ${fmt(n.p)}g ／ F ${fmt(n.f)}g ／ C ${fmt(n.c)}g`,
    "",
    "💡 TTGYM's Point",
    "",
    ...(r.notice ? ["🙇 お知らせ", r.notice, ""] : []),
    "✅ このレシピの良さ",
    r.point.good,
    "",
    "🙋 こんな人におすすめ",
    r.point.forWho,
    "",
    "💪 摂れる栄養とカラダへの効果",
    r.point.nutrition,
  ].join("\n");
}
