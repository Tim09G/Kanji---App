/*
 * Kanji metadata (curated sample set).
 *
 * Accurate stroke counts, frequency ranks, JLPT and radicals come from the
 * open KANJIDIC2-derived dataset (davidluzgouveia/kanji-data). Vocabulary is
 * hand-authored for now (JMdict integration is a later phase) with proper
 * furigana segmentation so the quizzed kanji's portion can be shown in bold.
 *
 * Fields:
 *   char        the kanji (also the filename of its stroke data)
 *   meaning     short English meaning(s)
 *   on / kun    readings (on in katakana, kun in hiragana)
 *   grade       Japanese school grade
 *   jlpt        JLPT level (5 = easiest)
 *   freq        newspaper frequency rank (1 = most frequent; lower = more common)
 *   strokeCount number of strokes
 *   radical     { char, name } classifying radical
 *   similar     visually/structurally similar kanji (within this set)
 *   vocab       example words. Each:
 *                 jp      real written form (kanji/kana mixed)
 *                 r       reading split into segments { t, b } — b:true marks the
 *                         portion that corresponds to THIS kanji (shown bold)
 *                 en      English meaning
 *                 reading which reading of this kanji the word uses (hiragana)
 */
window.KANJI_META = [
  { char: "一", meaning: "one", on: ["イチ", "イツ"], kun: ["ひと", "ひと.つ"], grade: 1, jlpt: 5, freq: 2, strokeCount: 1,
    radical: { char: "Ground", name: "Ground" }, similar: ["十","千","士","午"], vocab: [
    { jp: "一つ", r: [{ t: "ひと", b: true }, { t: "つ" }], en: "one (thing)", reading: "ひと" },
    { jp: "一人", r: [{ t: "ひと", b: true }, { t: "り" }], en: "one person; alone", reading: "ひと" },
    { jp: "一月", r: [{ t: "いち", b: true }, { t: "がつ" }], en: "January", reading: "いち" },
    { jp: "一年", r: [{ t: "いち", b: true }, { t: "ねん" }], en: "one year", reading: "いち" },
    { jp: "一番", r: [{ t: "いち", b: true }, { t: "ばん" }], en: "number one; best", reading: "いち" },
    { jp: "一回", r: [{ t: "いっ", b: true }, { t: "かい" }], en: "once", reading: "いち" },
    { jp: "一日", r: [{ t: "いち", b: true }, { t: "にち" }], en: "one day", reading: "いち" },
    { jp: "一生", r: [{ t: "いっ", b: true }, { t: "しょう" }], en: "a lifetime", reading: "いち" },
  ]},
  { char: "二", meaning: "two", on: ["ニ", "ジ"], kun: ["ふた", "ふた.つ"], grade: 1, jlpt: 5, freq: 9, strokeCount: 2,
    radical: { char: "Two", name: "Two" }, similar: ["工","仁","口","皿"], vocab: [
    { jp: "二つ", r: [{ t: "ふた", b: true }, { t: "つ" }], en: "two (things)", reading: "ふた" },
    { jp: "二人", r: [{ t: "ふた", b: true }, { t: "り" }], en: "two people", reading: "ふた" },
    { jp: "二月", r: [{ t: "に", b: true }, { t: "がつ" }], en: "February", reading: "に" },
    { jp: "二回", r: [{ t: "に", b: true }, { t: "かい" }], en: "twice", reading: "に" },
    { jp: "二年", r: [{ t: "に", b: true }, { t: "ねん" }], en: "two years", reading: "に" },
    { jp: "二番", r: [{ t: "に", b: true }, { t: "ばん" }], en: "number two", reading: "に" },
    { jp: "十二", r: [{ t: "じゅう" }, { t: "に", b: true }], en: "twelve", reading: "に" },
  ]},
  { char: "三", meaning: "three", on: ["サン", "ゾウ"], kun: ["み", "み.つ", "みっ.つ"], grade: 1, jlpt: 5, freq: 14, strokeCount: 3,
    radical: { char: "Ground", name: "Ground" }, similar: ["五","丑","且","天","上","旦","万","与","正","下","丁","七","今","写"], vocab: [
    { jp: "三つ", r: [{ t: "みっ", b: true }, { t: "つ" }], en: "three (things)", reading: "み" },
    { jp: "三日", r: [{ t: "みっ", b: true }, { t: "か" }], en: "the 3rd; three days", reading: "み" },
    { jp: "三月", r: [{ t: "さん", b: true }, { t: "がつ" }], en: "March", reading: "さん" },
    { jp: "三人", r: [{ t: "さん", b: true }, { t: "にん" }], en: "three people", reading: "さん" },
    { jp: "三回", r: [{ t: "さん", b: true }, { t: "かい" }], en: "three times", reading: "さん" },
    { jp: "三角", r: [{ t: "さん", b: true }, { t: "かく" }], en: "triangle", reading: "さん" },
    { jp: "三年", r: [{ t: "さん", b: true }, { t: "ねん" }], en: "three years", reading: "さん" },
  ]},
  { char: "人", meaning: "person", on: ["ジン", "ニン"], kun: ["ひと"], grade: 1, jlpt: 5, freq: 5, strokeCount: 2,
    radical: { char: "Person", name: "Person" }, similar: ["入"], vocab: [
    { jp: "人気", r: [{ t: "にん", b: true }, { t: "き" }], en: "popularity", reading: "にん" },
    { jp: "人間", r: [{ t: "にん", b: true }, { t: "げん" }], en: "human being", reading: "にん" },
    { jp: "人形", r: [{ t: "にん", b: true }, { t: "ぎょう" }], en: "doll", reading: "にん" },
    { jp: "友人", r: [{ t: "ゆう" }, { t: "じん", b: true }], en: "friend", reading: "じん" },
    { jp: "人口", r: [{ t: "じん", b: true }, { t: "こう" }], en: "population", reading: "じん" },
    { jp: "一人", r: [{ t: "ひと", b: true }, { t: "り" }], en: "one person; alone", reading: "ひと" },
    { jp: "人々", r: [{ t: "ひと", b: true }, { t: "びと" }], en: "people", reading: "ひと" },
    { jp: "本人", r: [{ t: "ほん" }, { t: "にん", b: true }], en: "the person in question", reading: "にん" },
  ]},
  { char: "日", meaning: "day, sun", on: ["ニチ", "ジツ"], kun: ["ひ", "び", "か"], grade: 1, jlpt: 5, freq: 1, strokeCount: 4,
    radical: { char: "Sun", name: "Sun" }, similar: ["且","目","世","自"], vocab: [
    { jp: "日本", r: [{ t: "に", b: true }, { t: "ほん" }], en: "Japan", reading: "にち" },
    { jp: "毎日", r: [{ t: "まい" }, { t: "にち", b: true }], en: "every day", reading: "にち" },
    { jp: "日曜日", r: [{ t: "にち", b: true }, { t: "ようび" }], en: "Sunday", reading: "にち" },
    { jp: "日記", r: [{ t: "にっ", b: true }, { t: "き" }], en: "diary", reading: "にち" },
    { jp: "休日", r: [{ t: "きゅう" }, { t: "じつ", b: true }], en: "holiday", reading: "じつ" },
    { jp: "平日", r: [{ t: "へい" }, { t: "じつ", b: true }], en: "weekday", reading: "じつ" },
    { jp: "誕生日", r: [{ t: "たんじょう" }, { t: "び", b: true }], en: "birthday", reading: "び" },
    { jp: "三日", r: [{ t: "みっ" }, { t: "か", b: true }], en: "the 3rd; three days", reading: "か" },
  ]},
  { char: "月", meaning: "moon, month", on: ["ゲツ", "ガツ"], kun: ["つき"], grade: 1, jlpt: 5, freq: 23, strokeCount: 4,
    radical: { char: "Moon", name: "Moon" }, similar: ["丹","角","貝","戸","弓","片"], vocab: [
    { jp: "月曜日", r: [{ t: "げつ", b: true }, { t: "ようび" }], en: "Monday", reading: "げつ" },
    { jp: "今月", r: [{ t: "こん" }, { t: "げつ", b: true }], en: "this month", reading: "げつ" },
    { jp: "来月", r: [{ t: "らい" }, { t: "げつ", b: true }], en: "next month", reading: "げつ" },
    { jp: "満月", r: [{ t: "まん" }, { t: "げつ", b: true }], en: "full moon", reading: "げつ" },
    { jp: "一月", r: [{ t: "いち" }, { t: "がつ", b: true }], en: "January", reading: "がつ" },
    { jp: "月", r: [{ t: "つき", b: true }], en: "moon", reading: "つき" },
    { jp: "毎月", r: [{ t: "まい" }, { t: "つき", b: true }], en: "every month", reading: "つき" },
  ]},
  { char: "火", meaning: "fire", on: ["カ"], kun: ["ひ", "ほ"], grade: 1, jlpt: 5, freq: 574, strokeCount: 4,
    radical: { char: "Fire", name: "Fire" }, similar: ["犬","沢","叉","來"], vocab: [
    { jp: "火曜日", r: [{ t: "か", b: true }, { t: "ようび" }], en: "Tuesday", reading: "か" },
    { jp: "火山", r: [{ t: "か", b: true }, { t: "ざん" }], en: "volcano", reading: "か" },
    { jp: "火事", r: [{ t: "か", b: true }, { t: "じ" }], en: "fire (accident)", reading: "か" },
    { jp: "火力", r: [{ t: "か", b: true }, { t: "りょく" }], en: "thermal power", reading: "か" },
    { jp: "花火", r: [{ t: "はな" }, { t: "び", b: true }], en: "fireworks", reading: "ひ" },
    { jp: "火", r: [{ t: "ひ", b: true }], en: "fire", reading: "ひ" },
  ]},
  { char: "水", meaning: "water", on: ["スイ"], kun: ["みず"], grade: 1, jlpt: 5, freq: 223, strokeCount: 4,
    radical: { char: "Water", name: "Water" }, similar: ["木","氷","永","承","八"], vocab: [
    { jp: "水曜日", r: [{ t: "すい", b: true }, { t: "ようび" }], en: "Wednesday", reading: "すい" },
    { jp: "水道", r: [{ t: "すい", b: true }, { t: "どう" }], en: "water supply", reading: "すい" },
    { jp: "水泳", r: [{ t: "すい", b: true }, { t: "えい" }], en: "swimming", reading: "すい" },
    { jp: "海水", r: [{ t: "かい" }, { t: "すい", b: true }], en: "seawater", reading: "すい" },
    { jp: "香水", r: [{ t: "こう" }, { t: "すい", b: true }], en: "perfume", reading: "すい" },
    { jp: "水", r: [{ t: "みず", b: true }], en: "water", reading: "みず" },
    { jp: "水着", r: [{ t: "みず", b: true }, { t: "ぎ" }], en: "swimsuit", reading: "みず" },
  ]},
  { char: "木", meaning: "tree, wood", on: ["ボク", "モク"], kun: ["き", "こ"], grade: 1, jlpt: 5, freq: 317, strokeCount: 4,
    radical: { char: "Tree", name: "Tree" }, similar: ["承","水","氷","本","八","卜"], vocab: [
    { jp: "木曜日", r: [{ t: "もく", b: true }, { t: "ようび" }], en: "Thursday", reading: "もく" },
    { jp: "木材", r: [{ t: "もく", b: true }, { t: "ざい" }], en: "lumber", reading: "もく" },
    { jp: "木曜", r: [{ t: "もく", b: true }, { t: "よう" }], en: "Thursday (short)", reading: "もく" },
    { jp: "大木", r: [{ t: "たい" }, { t: "ぼく", b: true }], en: "large tree", reading: "ぼく" },
    { jp: "土木", r: [{ t: "ど" }, { t: "ぼく", b: true }], en: "civil engineering", reading: "ぼく" },
    { jp: "木", r: [{ t: "き", b: true }], en: "tree", reading: "き" },
    { jp: "並木", r: [{ t: "なみ" }, { t: "き", b: true }], en: "row of trees", reading: "き" },
  ]},
  { char: "金", meaning: "gold, money", on: ["キン", "コン"], kun: ["かね", "かな"], grade: 1, jlpt: 5, freq: 53, strokeCount: 8,
    radical: { char: "Gold", name: "Gold" }, similar: ["舎","含","会"], vocab: [
    { jp: "金曜日", r: [{ t: "きん", b: true }, { t: "ようび" }], en: "Friday", reading: "きん" },
    { jp: "金", r: [{ t: "きん", b: true }], en: "gold", reading: "きん" },
    { jp: "現金", r: [{ t: "げん" }, { t: "きん", b: true }], en: "cash", reading: "きん" },
    { jp: "金魚", r: [{ t: "きん", b: true }, { t: "ぎょ" }], en: "goldfish", reading: "きん" },
    { jp: "料金", r: [{ t: "りょう" }, { t: "きん", b: true }], en: "fee, charge", reading: "きん" },
    { jp: "金色", r: [{ t: "きん", b: true }, { t: "いろ" }], en: "gold (color)", reading: "きん" },
    { jp: "お金", r: [{ t: "お" }, { t: "かね", b: true }], en: "money", reading: "かね" },
    { jp: "金持ち", r: [{ t: "かね", b: true }, { t: "もち" }], en: "rich person", reading: "かね" },
  ]},
  { char: "土", meaning: "earth, soil", on: ["ド", "ト"], kun: ["つち"], grade: 1, jlpt: 5, freq: 307, strokeCount: 3,
    radical: { char: "Dirt", name: "Dirt" }, similar: ["士","上","王","玉","圭","十"], vocab: [
    { jp: "土曜日", r: [{ t: "ど", b: true }, { t: "ようび" }], en: "Saturday", reading: "ど" },
    { jp: "土曜", r: [{ t: "ど", b: true }, { t: "よう" }], en: "Saturday (short)", reading: "ど" },
    { jp: "土木", r: [{ t: "ど", b: true }, { t: "ぼく" }], en: "civil engineering", reading: "ど" },
    { jp: "国土", r: [{ t: "こく" }, { t: "ど", b: true }], en: "national land", reading: "ど" },
    { jp: "土地", r: [{ t: "と", b: true }, { t: "ち" }], en: "land, plot", reading: "と" },
    { jp: "土", r: [{ t: "つち", b: true }], en: "soil; earth", reading: "つち" },
  ]},
  { char: "山", meaning: "mountain", on: ["サン", "セン"], kun: ["やま"], grade: 1, jlpt: 5, freq: 131, strokeCount: 3,
    radical: { char: "Mountain", name: "Mountain" }, similar: ["田","出","川","凪","小"], vocab: [
    { jp: "山", r: [{ t: "やま", b: true }], en: "mountain", reading: "やま" },
    { jp: "山道", r: [{ t: "やま", b: true }, { t: "みち" }], en: "mountain path", reading: "やま" },
    { jp: "火山", r: [{ t: "か" }, { t: "ざん", b: true }], en: "volcano", reading: "さん" },
    { jp: "富士山", r: [{ t: "ふじ" }, { t: "さん", b: true }], en: "Mt. Fuji", reading: "さん" },
    { jp: "登山", r: [{ t: "と" }, { t: "ざん", b: true }], en: "mountain climbing", reading: "さん" },
    { jp: "山林", r: [{ t: "さん", b: true }, { t: "りん" }], en: "mountains and forests", reading: "さん" },
  ]},
  { char: "川", meaning: "river", on: ["セン"], kun: ["かわ"], grade: 1, jlpt: 5, freq: 181, strokeCount: 3,
    radical: { char: "River", name: "River" }, similar: ["州","巡","災","拶","釧","侃","訓","馴","順","巣","流","硫","山","小"], vocab: [
    { jp: "川", r: [{ t: "かわ", b: true }], en: "river", reading: "かわ" },
    { jp: "川口", r: [{ t: "かわ", b: true }, { t: "ぐち" }], en: "river mouth; (surname)", reading: "かわ" },
    { jp: "小川", r: [{ t: "お" }, { t: "がわ", b: true }], en: "stream", reading: "かわ" },
    { jp: "川岸", r: [{ t: "かわ", b: true }, { t: "ぎし" }], en: "riverbank", reading: "かわ" },
    { jp: "河川", r: [{ t: "か" }, { t: "せん", b: true }], en: "rivers (formal)", reading: "せん" },
  ]},
  { char: "口", meaning: "mouth", on: ["コウ", "ク"], kun: ["くち"], grade: 1, jlpt: 4, freq: 284, strokeCount: 3,
    radical: { char: "Mouth", name: "Mouth" }, similar: ["皿","四","旨","二"], vocab: [
    { jp: "口", r: [{ t: "くち", b: true }], en: "mouth", reading: "くち" },
    { jp: "出口", r: [{ t: "で" }, { t: "ぐち", b: true }], en: "exit", reading: "くち" },
    { jp: "入口", r: [{ t: "いり" }, { t: "ぐち", b: true }], en: "entrance", reading: "くち" },
    { jp: "口紅", r: [{ t: "くち", b: true }, { t: "べに" }], en: "lipstick", reading: "くち" },
    { jp: "早口", r: [{ t: "はや" }, { t: "くち", b: true }], en: "fast talking", reading: "くち" },
    { jp: "人口", r: [{ t: "じん" }, { t: "こう", b: true }], en: "population", reading: "こう" },
  ]},
];
