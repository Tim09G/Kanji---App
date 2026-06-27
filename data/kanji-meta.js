/*
 * Sample kanji metadata (hand-authored small set for the current build).
 *
 * Later this will be replaced/augmented by real datasets:
 *   - KANJIDIC2 for meanings/readings/grade/JLPT/frequency/stroke count
 *   - JMdict for vocabulary
 * For now we keep a tiny curated list so every feature has data to show.
 *
 * Fields:
 *   char    - the kanji (also the filename of its stroke data in data/kanji/)
 *   meaning - short English meaning(s)
 *   on      - on'yomi (音読み), katakana (shown converted to hiragana in cues)
 *   kun     - kun'yomi (訓読み), hiragana
 *   grade   - Japanese school grade (used as the default study order / future filter)
 *   vocab   - example words. Each word's reading is split into segments so the
 *             part that corresponds to THIS kanji can be shown in bold.
 *               r:  array of { t: hiragana text, b: true if it maps to this kanji }
 *               en: English meaning of the whole word
 */
window.KANJI_META = [
  { char: "一", meaning: "one", on: ["イチ", "イツ"], kun: ["ひと-", "ひと.つ"], grade: 1, vocab: [
    { r: [{ t: "ひと", b: true }, { t: "つ", b: false }], en: "one (thing)" },
    { r: [{ t: "いち", b: true }, { t: "がつ", b: false }], en: "January" },
  ]},
  { char: "二", meaning: "two", on: ["ニ", "ジ"], kun: ["ふた", "ふた.つ"], grade: 1, vocab: [
    { r: [{ t: "ふた", b: true }, { t: "つ", b: false }], en: "two (things)" },
    { r: [{ t: "に", b: true }, { t: "がつ", b: false }], en: "February" },
  ]},
  { char: "三", meaning: "three", on: ["サン", "ゾウ"], kun: ["み", "み.つ", "みっ.つ"], grade: 1, vocab: [
    { r: [{ t: "みっ", b: true }, { t: "つ", b: false }], en: "three (things)" },
    { r: [{ t: "さん", b: true }, { t: "がつ", b: false }], en: "March" },
  ]},
  { char: "人", meaning: "person", on: ["ジン", "ニン"], kun: ["ひと"], grade: 1, vocab: [
    { r: [{ t: "にん", b: true }, { t: "き", b: false }], en: "popularity" },
    { r: [{ t: "ゆう", b: false }, { t: "じん", b: true }], en: "friend" },
  ]},
  { char: "日", meaning: "day, sun", on: ["ニチ", "ジツ"], kun: ["ひ", "-び", "-か"], grade: 1, vocab: [
    { r: [{ t: "に", b: true }, { t: "ほん", b: false }], en: "Japan" },
    { r: [{ t: "まい", b: false }, { t: "にち", b: true }], en: "every day" },
  ]},
  { char: "月", meaning: "moon, month", on: ["ゲツ", "ガツ"], kun: ["つき"], grade: 1, vocab: [
    { r: [{ t: "げつ", b: true }, { t: "ようび", b: false }], en: "Monday" },
    { r: [{ t: "いち", b: false }, { t: "がつ", b: true }], en: "January" },
  ]},
  { char: "火", meaning: "fire", on: ["カ"], kun: ["ひ", "ほ-"], grade: 1, vocab: [
    { r: [{ t: "か", b: true }, { t: "ようび", b: false }], en: "Tuesday" },
    { r: [{ t: "か", b: true }, { t: "ざん", b: false }], en: "volcano" },
  ]},
  { char: "水", meaning: "water", on: ["スイ"], kun: ["みず"], grade: 1, vocab: [
    { r: [{ t: "すい", b: true }, { t: "ようび", b: false }], en: "Wednesday" },
    { r: [{ t: "みず", b: true }], en: "water" },
  ]},
  { char: "木", meaning: "tree, wood", on: ["ボク", "モク"], kun: ["き", "こ-"], grade: 1, vocab: [
    { r: [{ t: "もく", b: true }, { t: "ようび", b: false }], en: "Thursday" },
    { r: [{ t: "き", b: true }], en: "tree" },
  ]},
  { char: "金", meaning: "gold, money", on: ["キン", "コン"], kun: ["かね", "かな-"], grade: 1, vocab: [
    { r: [{ t: "きん", b: true }, { t: "ようび", b: false }], en: "Friday" },
    { r: [{ t: "お", b: false }, { t: "かね", b: true }], en: "money" },
  ]},
  { char: "土", meaning: "earth, soil", on: ["ド", "ト"], kun: ["つち"], grade: 1, vocab: [
    { r: [{ t: "ど", b: true }, { t: "ようび", b: false }], en: "Saturday" },
    { r: [{ t: "つち", b: true }], en: "soil" },
  ]},
  { char: "山", meaning: "mountain", on: ["サン", "セン"], kun: ["やま"], grade: 1, vocab: [
    { r: [{ t: "やま", b: true }], en: "mountain" },
    { r: [{ t: "か", b: false }, { t: "ざん", b: true }], en: "volcano" },
  ]},
  { char: "川", meaning: "river", on: ["セン"], kun: ["かわ"], grade: 1, vocab: [
    { r: [{ t: "かわ", b: true }], en: "river" },
    { r: [{ t: "かわ", b: true }, { t: "ぐち", b: false }], en: "Kawaguchi (place/surname)" },
  ]},
  { char: "口", meaning: "mouth", on: ["コウ", "ク"], kun: ["くち"], grade: 1, vocab: [
    { r: [{ t: "くち", b: true }], en: "mouth" },
    { r: [{ t: "いり", b: false }, { t: "ぐち", b: true }], en: "entrance" },
  ]},
];
