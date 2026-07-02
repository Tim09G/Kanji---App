/*
 * kvg2hw.js — convert KanjiVG stroke SVGs to HanziWriter data format.
 *
 * KanjiVG: per-stroke centerline paths (cubic beziers) in a 109x109 box, y-down,
 * document order = stroke order. HanziWriter (makemeahanzi frame): filled outline
 * paths + median polylines in a 1024-wide box, y-UP with baseline at 900
 * (rendered via scale(1,-1) translate(0,-900)), x' = x*1024/109, y' = 900 - y*1024/109.
 *
 * Outlines are constant-width expansions of the centerline with round caps —
 * the same visual convention as KanjiVG's own viewer (uniform-width strokes).
 */
const fs = require("fs");
const path = require("path");

const KVG = path.join(__dirname, "kvg_extract/kanjivg-master/kanji");
const SCALE = 1024 / 109;
const WIDTH = 50;           // stroke thickness in 1024-space (tuned visually)

// ---- path parsing (M/m C/c S/s L/l H/h V/v Z supported) ----
function parsePath(d) {
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e-?\d+)?/g) || [];
  let i = 0, cmd = null, cx = 0, cy = 0, sx = 0, sy = 0, px = null, py = null;
  const segs = [];   // list of cubic segments [x0,y0, x1,y1, x2,y2, x3,y3]
  function num() { return parseFloat(tokens[i++]); }
  while (i < tokens.length) {
    const t = tokens[i];
    if (/[a-zA-Z]/.test(t)) { cmd = t; i++; }
    switch (cmd) {
      case "M": cx = num(); cy = num(); sx = cx; sy = cy; px = py = null; cmd = "L"; break;
      case "m": cx += num(); cy += num(); sx = cx; sy = cy; px = py = null; cmd = "l"; break;
      case "L": { const x = num(), y = num(); segs.push([cx, cy, cx, cy, x, y, x, y]); cx = x; cy = y; px = py = null; break; }
      case "l": { const x = cx + num(), y = cy + num(); segs.push([cx, cy, cx, cy, x, y, x, y]); cx = x; cy = y; px = py = null; break; }
      case "H": { const x = num(); segs.push([cx, cy, cx, cy, x, cy, x, cy]); cx = x; px = py = null; break; }
      case "h": { const x = cx + num(); segs.push([cx, cy, cx, cy, x, cy, x, cy]); cx = x; px = py = null; break; }
      case "V": { const y = num(); segs.push([cx, cy, cx, cy, cx, y, cx, y]); cy = y; px = py = null; break; }
      case "v": { const y = cy + num(); segs.push([cx, cy, cx, cy, cx, y, cx, y]); cy = y; px = py = null; break; }
      case "C": { const x1 = num(), y1 = num(), x2 = num(), y2 = num(), x = num(), y = num();
        segs.push([cx, cy, x1, y1, x2, y2, x, y]); px = x2; py = y2; cx = x; cy = y; break; }
      case "c": { const x1 = cx + num(), y1 = cy + num(), x2 = cx + num(), y2 = cy + num(), x = cx + num(), y = cy + num();
        segs.push([cx, cy, x1, y1, x2, y2, x, y]); px = x2; py = y2; cx = x; cy = y; break; }
      case "S": { const x2 = num(), y2 = num(), x = num(), y = num();
        const x1 = px != null ? 2 * cx - px : cx, y1 = py != null ? 2 * cy - py : cy;
        segs.push([cx, cy, x1, y1, x2, y2, x, y]); px = x2; py = y2; cx = x; cy = y; break; }
      case "s": { const x2 = cx + num(), y2 = cy + num(), x = cx + num(), y = cy + num();
        const x1 = px != null ? 2 * cx - px : cx, y1 = py != null ? 2 * cy - py : cy;
        segs.push([cx, cy, x1, y1, x2, y2, x, y]); px = x2; py = py != null ? y2 : y2; px = x2; py = y2; cx = x; cy = y; break; }
      case "Z": case "z": segs.push([cx, cy, cx, cy, sx, sy, sx, sy]); cx = sx; cy = sy; break;
      default: throw new Error("unsupported cmd " + cmd);
    }
  }
  return segs;
}

function cubicAt(s, t) {
  const mt = 1 - t;
  return [
    mt*mt*mt*s[0] + 3*mt*mt*t*s[2] + 3*mt*t*t*s[4] + t*t*t*s[6],
    mt*mt*mt*s[1] + 3*mt*mt*t*s[3] + 3*mt*t*t*s[5] + t*t*t*s[7],
  ];
}

// sample the whole stroke centerline densely (in KanjiVG space)
function samplePath(segs, per) {
  const pts = [];
  segs.forEach((s, si) => {
    for (let j = (si === 0 ? 0 : 1); j <= per; j++) pts.push(cubicAt(s, j / per));
  });
  // dedupe consecutive identical points
  const out = [pts[0]];
  for (let k = 1; k < pts.length; k++) {
    const p = pts[k], q = out[out.length - 1];
    if (Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-6) out.push(p);
  }
  return out;
}

function tx(p) { return [p[0] * SCALE, 900 - p[1] * SCALE]; }

// constant-width outline with round caps + clamped-miter joins (in 1024 space)
function outline(ptsKvg, width) {
  const pts = ptsKvg.map(tx);
  const w = width / 2;
  const n = pts.length;
  if (n < 2) return null;
  // per-point normals (angle-bisector, clamped)
  const norms = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    let nx = -dy / len, ny = dx / len;
    // miter scale from adjacent-segment angle
    let scale = 1;
    if (i > 0 && i < n - 1) {
      const d1 = [pts[i][0] - pts[i-1][0], pts[i][1] - pts[i-1][1]];
      const d2 = [pts[i+1][0] - pts[i][0], pts[i+1][1] - pts[i][1]];
      const l1 = Math.hypot(d1[0], d1[1]) || 1, l2 = Math.hypot(d2[0], d2[1]) || 1;
      const cos = (d1[0]*d2[0] + d1[1]*d2[1]) / (l1*l2);
      const half = Math.sqrt(Math.max(0, (1 + cos) / 2));   // cos(theta/2)
      scale = Math.min(1 / Math.max(half, 0.6), 1.5);       // clamp folds on sharp hooks
    }
    norms.push([nx * w * scale, ny * w * scale]);
  }
  const left = pts.map((p, i) => [p[0] + norms[i][0], p[1] + norms[i][1]]);
  const right = pts.map((p, i) => [p[0] - norms[i][0], p[1] - norms[i][1]]);
  // round caps: half-circle sweeping THROUGH the outward tangent (deterministic —
  // picks whichever direction passes the tip, so no wrong-way "fang" spurs)
  function cap(center, from, to, tangent, steps) {
    const a0 = Math.atan2(from[1] - center[1], from[0] - center[0]);
    const aT = Math.atan2(tangent[1], tangent[0]);
    const r = w, out = [];
    // choose sweep sign so the midpoint lands on the tangent direction
    let d = aT - a0;
    while (d <= -Math.PI) d += 2 * Math.PI;
    while (d > Math.PI) d -= 2 * Math.PI;
    const sweep = d >= 0 ? Math.PI : -Math.PI;
    for (let s = 1; s < steps; s++) {
      const a = a0 + sweep * (s / steps);
      out.push([center[0] + r * Math.cos(a), center[1] + r * Math.sin(a)]);
    }
    return out;
  }
  const tEnd = [pts[n - 1][0] - pts[n - 2][0], pts[n - 1][1] - pts[n - 2][1]];
  const tStart = [pts[0][0] - pts[1][0], pts[0][1] - pts[1][1]];
  const endCap = cap(pts[n - 1], left[n - 1], right[n - 1], tEnd, 8);
  const startCap = cap(pts[0], right[0], left[0], tStart, 8);
  // decimate near-collinear runs (perpendicular-distance test) — big size win on
  // straight strokes with zero visible quality change at display sizes
  function slim(side) {
    const out = [side[0]];
    for (let i = 1; i < side.length - 1; i++) {
      const a = out[out.length - 1], b = side[i], c = side[i + 1];
      const dx = c[0] - a[0], dy = c[1] - a[1];
      const L = Math.hypot(dx, dy) || 1;
      const dist = Math.abs(dx * (a[1] - b[1]) - dy * (a[0] - b[0])) / L;
      if (dist > 1.2) out.push(b);
    }
    out.push(side[side.length - 1]);
    return out;
  }
  const poly = slim(left).concat(endCap, slim(right.slice().reverse()), startCap);
  return "M" + poly.map(p => Math.round(p[0]) + "," + Math.round(p[1])).join("L") + "Z";
}

function median(ptsKvg, maxPts) {
  const pts = ptsKvg.map(tx).map(p => [Math.round(p[0]), Math.round(p[1])]);
  if (pts.length <= maxPts) return pts;
  const out = [];
  for (let i = 0; i < maxPts; i++) out.push(pts[Math.round(i * (pts.length - 1) / (maxPts - 1))]);
  return out;
}

function convert(svgText) {
  // stroke paths appear in document order inside the StrokePaths group
  const ds = [...svgText.matchAll(/<path[^>]*\bd="([^"]+)"/g)].map(m => m[1]);
  const strokes = [], medians = [];
  for (const d of ds) {
    const segs = parsePath(d);
    const pts = samplePath(segs, 28);
    const o = outline(pts, WIDTH);
    if (!o) throw new Error("degenerate stroke");
    strokes.push(o);
    medians.push(median(pts, 16));
  }
  return { strokes, medians };
}

function fileFor(char) {
  const hex = char.codePointAt(0).toString(16).padStart(5, "0");
  return path.join(KVG, hex + ".svg");   // plain file only — never a -Kaisho/variant
}

module.exports = { convert, fileFor, parsePath, samplePath };

if (require.main === module) {
  const chars = process.argv.slice(2);
  chars.forEach(ch => {
    const f = fileFor(ch);
    if (!fs.existsSync(f)) { console.log(ch, "NO KANJIVG FILE", f); return; }
    const data = convert(fs.readFileSync(f, "utf8"));
    fs.writeFileSync(path.join(__dirname, "out_" + ch + ".json"), JSON.stringify(data));
    console.log(ch, "strokes:", data.strokes.length, "median[0] pts:", data.medians[0].length);
  });
}
