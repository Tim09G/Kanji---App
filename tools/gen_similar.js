/*
 * gen_similar.js — Phase 31: rebuild meta.similar with multi-signal similarity.
 * Run from repo root.
 *
 * Channels:
 *  1. Component: full KanjiVG element decomposition (every kvg:element in the
 *     hierarchy), rarity-weighted — a shared rare component (岡) scores far higher
 *     than a ubiquitous one (糸/口/木), so specific relatives beat generic ones.
 *  2. Shape: fixed-frame 12x12 occupancy raster of the stroke medians (+ global
 *     stroke-direction histogram), cosine similarity, gated to |Δstrokes| <= 3.
 *     Catches look-alikes with no shared parts (土/士, 力/刀, 未/末, 干/千).
 *  3. Stroke-count proximity: small tiebreaker bonus.
 *  4. Curated classic confusable groups: guaranteed floor for textbook pairs.
 *
 * Output: rewrites the "similar" field in data/kanji-gen-*.js (top-N, symmetric).
 */
const fs = require("fs");
const path = require("path");
const KVG = "/tmp/claude-0/-home-user-Kanji---App/6bf433aa-e9f0-518b-9a85-c7530c860182/scratchpad/kvg_extract/kanjivg-master/kanji";

global.window = {};
for (const f of ["kanji-meta", "kanji-gen-1", "kanji-gen-2", "kanji-gen-3", "kanji-gen-4"]) require(process.cwd() + "/data/" + f + ".js");
const meta = global.window.KANJI_META;
const chars = meta.map(m => m.char);
const inSet = new Set(chars);
const strokeN = {}; meta.forEach(m => strokeN[m.char] = m.strokeCount);

// ---- 1. element sets from KanjiVG ----
const elems = {};
const df = {};
chars.forEach(ch => {
  const hex = ch.codePointAt(0).toString(16).padStart(5, "0");
  const fp = path.join(KVG, hex + ".svg");
  const set = new Set();
  if (fs.existsSync(fp)) {
    const txt = fs.readFileSync(fp, "utf8");
    for (const m of txt.matchAll(/kvg:element="([^"]+)"/g)) if (m[1] !== ch) set.add(m[1]);
    for (const m of txt.matchAll(/kvg:original="([^"]+)"/g)) if (m[1] !== ch) set.add(m[1]);
  }
  elems[ch] = [...set];
  set.forEach(e => df[e] = (df[e] || 0) + 1);
});
const w = e => 1 / Math.log(3 + (df[e] || 1));
const elemNorm = {};
chars.forEach(ch => { elemNorm[ch] = Math.sqrt(elems[ch].reduce((s, e) => s + w(e) * w(e), 0)) || 1; });
// inverted index for candidate generation
const byElem = {};
chars.forEach(ch => elems[ch].forEach(e => { (byElem[e] = byElem[e] || []).push(ch); }));

function compScore(a, b) {
  const A = new Set(elems[a]);
  let s = 0;
  for (const e of elems[b]) if (A.has(e)) s += w(e) * w(e);
  return s / (elemNorm[a] * elemNorm[b]);
}

// ---- 2. shape features from stroke medians ----
const G = 12;
const feats = {};
chars.forEach(ch => {
  let d;
  try { d = JSON.parse(fs.readFileSync("data/kanji/" + ch + ".json", "utf8")); } catch (e) { return; }
  const grid = new Float32Array(G * G);
  const dir = new Float32Array(4);
  d.medians.forEach(med => {
    for (let i = 0; i + 1 < med.length; i++) {
      const [x1, y1] = med[i], [x2, y2] = med[i + 1];
      const len = Math.hypot(x2 - x1, y2 - y1);
      const steps = Math.max(1, Math.round(len / 40));
      for (let s = 0; s <= steps; s++) {
        const x = x1 + (x2 - x1) * s / steps, y = y1 + (y2 - y1) * s / steps;
        const gx = Math.min(G - 1, Math.max(0, Math.floor(x / 1024 * G)));
        const gy = Math.min(G - 1, Math.max(0, Math.floor((900 - y) / 1024 * G)));
        grid[gy * G + gx] = 1;
      }
      const ang = Math.atan2(y1 - y2, x2 - x1);          // screen-down positive fix
      const deg = ((ang * 180 / Math.PI) + 180) % 180;   // undirected
      const bin = deg < 22.5 || deg >= 157.5 ? 0 : deg < 67.5 ? 1 : deg < 112.5 ? 2 : 3;
      dir[bin] += len / 1024;
    }
  });
  const v = new Float32Array(G * G + 4);
  v.set(grid); for (let i = 0; i < 4; i++) v[G * G + i] = dir[i] * 2.2;   // direction weight
  let n = 0; for (let i = 0; i < v.length; i++) n += v[i] * v[i];
  feats[ch] = { v, n: Math.sqrt(n) || 1 };
});
function shapeScore(a, b) {
  const A = feats[a], B = feats[b];
  if (!A || !B) return 0;
  if (Math.abs(strokeN[a] - strokeN[b]) > 3) return 0;
  let s = 0; for (let i = 0; i < A.v.length; i++) s += A.v[i] * B.v[i];
  return s / (A.n * B.n);
}

// ---- 4. curated classic confusable groups (guaranteed) ----
const CLASSICS = [
  "土士", "力刀", "未末", "干千于", "人入", "日曰", "目自", "己已巳", "王玉主",
  "大太犬", "石右", "天夭", "矢失", "牛午", "戊戌戒成", "鳥烏", "待侍", "徴微",
  "縁緑", "貧貪", "壁璧", "捨拾", "網綱鋼", "薄簿", "暦歴", "免兎", "孑子",
  "汗汁", "住往", "困因", "旅族", "帥師", "候侯", "萩荻", "崇祟", "微徹徹",
  "斤斥", "刺剌", "冶治", "沢択", "積績", "峰蜂逢", "凡几", "毫豪", "延廷",
  "線緑縁", "将浮",
].map(g => [...g].filter(c => inSet.has(c))).filter(g => g.length >= 2);

// ---- combine ----
const SHAPE_T = 0.80, COMP_T = 0.18, CAP = 18, HARD_CAP = 20;
const result = {};
chars.forEach(ch => result[ch] = new Map());

// Same classifying radical + similar overall shape = the classic high-confusion
// class (線/緑/縁/綿…): identical left half + similar-looking other half. Graded
// bonus (with a slightly lower shape floor) so these outrank generic cross-radical
// shape-mates; the floor keeps dissimilar radical-mates out.
const radOf = {};
meta.forEach(m => { radOf[m.char] = (m.radical && m.radical.char) || null; });

// A DISTINCTIVE shared component (df <= 150 — e.g. ⺤, 岡, 孚; not 口/木/氵) makes a
// pair confusable even when everything else differs (将/浮 share the ⺤ crown but
// score only 0.55 on whole-glyph shape). Such pairs get a floor score blended with
// shape + the component's rarity, so the nearest-looking family members rank first
// while strong matches (0.8+) stay above them.
const DISTINCT_DF = 150;
function distinctShared(a, b) {
  const A = new Set(elems[a]);
  let best = 0;
  for (const e of elems[b]) if (A.has(e) && (df[e] || 0) <= DISTINCT_DF) best = Math.max(best, w(e));
  return best;   // 0 if none; else the rarest shared element's weight
}
function pairScore(a, b, ss, cs) {
  const strokeBonus = Math.max(0, 1 - Math.abs(strokeN[a] - strokeN[b]) / 6) * 0.06;
  let s = 0.55 * ss + 0.45 * Math.min(cs * 1.6, 1) + strokeBonus;
  if (radOf[a] && radOf[a] === radOf[b] && ss >= 0.76) s += 0.12 + (ss - 0.76) * 0.5;
  const dw = distinctShared(a, b);
  if (dw > 0) s = Math.max(s, 0.40 + 0.25 * ss + Math.min((dw - 0.2) * 0.5, 0.1) + strokeBonus);
  return s;
}

// component-channel candidates via inverted index (skip mega-common elements for
// candidate generation only — they still contribute to scores)
const t0 = Date.now();
chars.forEach(a => {
  const cand = new Set();
  elems[a].forEach(e => { if ((df[e] || 0) <= 400) (byElem[e] || []).forEach(c => cand.add(c)); });
  // shape candidates: same stroke-count bucket ±3 (checked in shapeScore anyway) —
  // to keep it O(n·bucket), bucket by strokeCount
  cand.delete(a);
  cand.forEach(b => {
    if (a >= b) return;   // score each unordered pair once
    const cs = compScore(a, b);
    const ss = shapeScore(a, b);
    const sameRad = radOf[a] && radOf[a] === radOf[b] && ss >= 0.76;
    if (cs < COMP_T && ss < SHAPE_T && !sameRad && !distinctShared(a, b)) return;
    const score = pairScore(a, b, ss, cs);
    result[a].set(b, Math.max(result[a].get(b) || 0, score));
    result[b].set(a, Math.max(result[b].get(a) || 0, score));
  });
});
// shape-only candidates (pairs with no shared elements at all): bucket by strokes
const buckets = {};
chars.forEach(c => { (buckets[strokeN[c]] = buckets[strokeN[c]] || []).push(c); });
chars.forEach(a => {
  for (let d = -3; d <= 3; d++) {
    (buckets[strokeN[a] + d] || []).forEach(b => {
      if (a >= b) return;
      if (result[a].has(b)) return;
      const ss = shapeScore(a, b);
      const sameRad = radOf[a] && radOf[a] === radOf[b] && ss >= 0.76;
      if (ss < SHAPE_T && !sameRad) return;
      const score = pairScore(a, b, ss, 0);
      result[a].set(b, score); result[b].set(a, score);
    });
  }
});
console.log("pair scoring done in", ((Date.now() - t0) / 1000).toFixed(1) + "s");

// curated floor (score 2 = always first)
CLASSICS.forEach(g => g.forEach(a => g.forEach(b => { if (a !== b) result[a].set(b, 2); })));

// backfill: any kanji with no matches above threshold gets its top few loose shape
// matches anyway (broad-matching bias — a couple of loosely-similar beats none)
chars.forEach(a => {
  if (result[a].size) return;
  const cand = [];
  for (let d = -4; d <= 4; d++) (buckets[strokeN[a] + d] || []).forEach(b => {
    if (b === a) return;
    const A = feats[a], B = feats[b];
    if (!A || !B) return;
    let s = 0; for (let i = 0; i < A.v.length; i++) s += A.v[i] * B.v[i];
    cand.push([b, s / (A.n * B.n)]);
  });
  cand.sort((x, y) => y[1] - x[1]).slice(0, 4).forEach(([b, s]) => result[a].set(b, s * 0.4));
});

// top-N per kanji, then symmetrize (if A lists B, B must list A) within hard cap
const lists = {};
chars.forEach(ch => {
  lists[ch] = [...result[ch].entries()].sort((x, y) => y[1] - x[1]).slice(0, CAP).map(e => e[0]);
});
chars.forEach(a => lists[a].forEach(b => {
  if (!lists[b].includes(a) && lists[b].length < HARD_CAP) lists[b].push(a);
}));

// ---- report + write ----
const check = (a, b) => (lists[a] || []).includes(b);
console.log("土→士", check("土", "士"), "| 力→刀", check("力", "刀"), "| 未→末", check("未", "末"), "| 干→千", check("干", "千"));
console.log("網→綱", check("網", "綱"), "| 網→鋼", check("網", "鋼"), "| 綱→鋼", check("綱", "鋼"), "| 綱→網", check("綱", "網"));
console.log("巢→巣", check("巢", "巣"));
console.log("線→緑", check("線", "緑"), "| 緑→線", check("緑", "線"), "| 線→縁", check("線", "縁"), "| 線→綿", check("線", "綿"));
console.log("将→浮", check("将", "浮"), "| 浮→将", check("浮", "将"));
console.log("sample 将:", (lists["将"] || []).join(" "));
console.log("sample 浮:", (lists["浮"] || []).join(" "));
console.log("sample 線:", (lists["線"] || []).join(" "));
console.log("sample 語:", (lists["語"] || []).join(" "));
let empty = 0, total = 0;
chars.forEach(c => { total += lists[c].length; if (!lists[c].length) empty++; });
console.log("empty lists:", empty, "| avg size:", (total / chars.length).toFixed(1));
console.log("sample 未:", lists["未"].join(" "));
console.log("sample 網:", lists["網"].join(" "));
console.log("sample 土:", lists["土"].join(" "));
console.log("sample 貝:", (lists["貝"] || []).join(" "));

if (process.argv.includes("--write")) {
  const files = ["data/kanji-gen-1.js", "data/kanji-gen-2.js", "data/kanji-gen-3.js", "data/kanji-gen-4.js"];
  files.forEach(fp => {
    const txt = fs.readFileSync(fp, "utf8");
    const open = txt.indexOf("[", txt.indexOf(".concat("));
    const close = txt.lastIndexOf("]");
    const arr = JSON.parse(txt.slice(open, close + 1));
    arr.forEach(m => {
      const orig = JSON.stringify(m.similar || []);
      m.similar = lists[m.char] || [];
      void orig;
    });
    fs.writeFileSync(fp, txt.slice(0, open) + JSON.stringify(arr) + txt.slice(close + 1));
    console.log("rewrote", fp);
  });
  // kanji-meta.js curated entries: patch similar via regex per char (JS-literal file)
  let mtxt = fs.readFileSync("data/kanji-meta.js", "utf8");
  const curatedChars = [...mtxt.matchAll(/char: "(.)"/g)].map(x => x[1]);
  curatedChars.forEach(ch => {
    if (!lists[ch]) return;
    const re = new RegExp('(char: "' + ch + '",[\\s\\S]*?similar: )\\[[^\\]]*\\]');
    if (re.test(mtxt)) mtxt = mtxt.replace(re, "$1" + JSON.stringify(lists[ch]));
  });
  fs.writeFileSync("data/kanji-meta.js", mtxt);
  console.log("patched kanji-meta.js curated entries:", curatedChars.length);
}
