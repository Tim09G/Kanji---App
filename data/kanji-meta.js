/*
 * Sample kanji metadata for Phase 1 (hand-authored small set).
 *
 * In a later phase this will be replaced/augmented by real KANJIDIC2 data
 * (meanings, on/kun readings, grade, JLPT level, frequency, stroke count).
 * For now we keep a tiny curated list so we can show meaning + readings
 * next to the stroke animation.
 *
 * Fields:
 *   char    - the kanji character (also the filename of its stroke data)
 *   meaning - short English meaning(s)
 *   on      - on'yomi (音読み) readings, katakana
 *   kun     - kun'yomi (訓読み) readings, hiragana
 *   grade   - Japanese school grade it is taught in (for future filtering)
 */
window.KANJI_META = [
  { char: "一", meaning: "one",            on: ["イチ", "イツ"], kun: ["ひと-", "ひと.つ"], grade: 1 },
  { char: "二", meaning: "two",            on: ["ニ", "ジ"],     kun: ["ふた", "ふた.つ"],  grade: 1 },
  { char: "三", meaning: "three",          on: ["サン", "ゾウ"], kun: ["み", "み.つ", "みっ.つ"], grade: 1 },
  { char: "人", meaning: "person",         on: ["ジン", "ニン"], kun: ["ひと"],            grade: 1 },
  { char: "日", meaning: "day, sun",       on: ["ニチ", "ジツ"], kun: ["ひ", "-び", "-か"], grade: 1 },
  { char: "月", meaning: "moon, month",    on: ["ゲツ", "ガツ"], kun: ["つき"],            grade: 1 },
  { char: "火", meaning: "fire",           on: ["カ"],           kun: ["ひ", "ほ-"],       grade: 1 },
  { char: "水", meaning: "water",          on: ["スイ"],         kun: ["みず"],            grade: 1 },
  { char: "木", meaning: "tree, wood",     on: ["ボク", "モク"], kun: ["き", "こ-"],       grade: 1 },
  { char: "金", meaning: "gold, money",    on: ["キン", "コン"], kun: ["かね", "かな-"],   grade: 1 },
  { char: "土", meaning: "earth, soil",    on: ["ド", "ト"],     kun: ["つち"],            grade: 1 },
  { char: "山", meaning: "mountain",       on: ["サン", "セン"], kun: ["やま"],            grade: 1 },
  { char: "川", meaning: "river",          on: ["セン"],         kun: ["かわ"],            grade: 1 },
  { char: "口", meaning: "mouth",          on: ["コウ", "ク"],   kun: ["くち"],            grade: 1 },
];
