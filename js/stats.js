/*
 * stats.js — Phase 32 A: read-only stats/history view of FSRS outcomes.
 *
 * Everything derives from existing stored data plus the per-review history log
 * (kanji.history.v1) that started with this phase. Changes NO scheduling logic.
 * Sections are independent .stats-card blocks so future insights (e.g. confusion
 * detection) can be appended without touching the rest.
 */
window.Stats = (function () {
  "use strict";

  var DAY = 24 * 60 * 60 * 1000;
  var ACCENT = "#2f6fed", ACCENT_DK = "#1d4ed8", MUTED = "#6b7785", LINE = "#e3e7ec";

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function svgEl(tag, attrs) {
    var e = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }
  function dayStart(t) { var d = new Date(t); d.setHours(0, 0, 0, 0); return +d; }

  // ---- section helpers (each section = an addable card) ----
  function card(title, hint) {
    var c = el("section", "stats-card");
    c.appendChild(el("h3", null, title));
    if (hint) c.appendChild(el("p", "hint stats-hint", hint));
    return c;
  }

  // ---- generic bar chart (single series, vertical) ----
  // data: [{label, value, emph}]; opts: {h, maxLabelEvery}
  function barChart(data, opts) {
    var W = 320, H = (opts && opts.h) || 120, PADB = 16, PADT = 12;
    var max = Math.max(1, Math.max.apply(null, data.map(function (d) { return d.value; })));
    var svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H, class: "stats-chart", role: "img" });
    var bw = Math.max(2, Math.floor(W / data.length) - 2);   // 2px surface gap between bars
    data.forEach(function (d, i) {
      var x = Math.round(i * (W / data.length)) + 1;
      var bh = Math.round((H - PADB - PADT) * d.value / max);
      var y = H - PADB - bh;
      var r = svgEl("rect", { x: x, y: y, width: bw, height: Math.max(bh, d.value > 0 ? 2 : 0), rx: 2, fill: d.emph ? ACCENT_DK : ACCENT });
      var t = svgEl("title", {}); t.textContent = d.label + ": " + d.value;
      r.appendChild(t);
      svg.appendChild(r);
      // selective direct labels: latest bar + the max bar only
      if (d.value > 0 && (i === data.length - 1 || d.value === max)) {
        svg.appendChild(text(x + bw / 2, y - 3, String(d.value), "middle"));
      }
      if (!opts || !opts.everyLabel ? (i === 0 || i === data.length - 1) : true) {
        svg.appendChild(text(x + bw / 2, H - 4, d.label, "middle"));
      }
    });
    svg.appendChild(svgEl("line", { x1: 0, y1: H - PADB, x2: W, y2: H - PADB, stroke: LINE, "stroke-width": 1 }));
    return svg;
  }
  function text(x, y, s, anchor) {
    var t = svgEl("text", { x: x, y: y, "text-anchor": anchor || "start", fill: MUTED, "font-size": 9 });
    t.textContent = s;
    return t;
  }

  // ---- retention line chart with target band ----
  function retentionChart(weeks) {
    var W = 320, H = 130, PADB = 16, PADT = 8, PADL = 26;
    var svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H, class: "stats-chart", role: "img" });
    function y(pct) { return PADT + (H - PADB - PADT) * (1 - pct / 100); }
    function x(i) { return PADL + (W - PADL - 6) * (weeks.length === 1 ? 0.5 : i / (weeks.length - 1)); }
    // recessive target band (healthy retention roughly 75–92%)
    svg.appendChild(svgEl("rect", { x: PADL, y: y(92), width: W - PADL - 6, height: y(75) - y(92), fill: ACCENT, opacity: 0.07 }));
    [50, 75, 92, 100].forEach(function (p) {
      svg.appendChild(svgEl("line", { x1: PADL, y1: y(p), x2: W - 6, y2: y(p), stroke: LINE, "stroke-width": 1 }));
      svg.appendChild(text(2, y(p) + 3, p + "%"));
    });
    var pts = weeks.map(function (w, i) { return [x(i), y(w.pct)]; });
    if (pts.length > 1) {
      svg.appendChild(svgEl("polyline", { points: pts.map(function (p) { return p.join(","); }).join(" "), fill: "none", stroke: ACCENT, "stroke-width": 2, "stroke-linejoin": "round" }));
    }
    weeks.forEach(function (w, i) {
      var c = svgEl("circle", { cx: pts[i][0], cy: pts[i][1], r: 4, fill: ACCENT, stroke: "#fff", "stroke-width": 2 });
      var t = svgEl("title", {}); t.textContent = w.label + ": " + w.pct + "% (" + w.pass + "/" + w.total + ")";
      c.appendChild(t);
      svg.appendChild(c);
      // thin the x labels so they never crowd (first, last, and every other in between)
      var step = Math.max(1, Math.ceil(weeks.length / 6));
      if (i === 0 || i === weeks.length - 1 || i % step === 0) {
        svg.appendChild(text(pts[i][0], H - 4, w.label, "middle"));
      }
    });
    // selective label: latest point
    var last = weeks[weeks.length - 1];
    svg.appendChild(text(pts[pts.length - 1][0], pts[pts.length - 1][1] - 8, last.pct + "%", "middle"));
    return svg;
  }

  // ---- data crunching ----
  function weeklyRetention(hist, nWeeks) {
    var now = Date.now(), out = [];
    for (var wk = nWeeks - 1; wk >= 0; wk--) {
      var end = dayStart(now) + DAY - wk * 7 * DAY;
      var start = end - 7 * DAY;
      var pass = 0, total = 0;
      hist.forEach(function (h) { if (h.t >= start && h.t < end) { total++; if (h.p) pass++; } });
      if (total > 0) out.push({ label: wk === 0 ? "this wk" : wk + "w ago", pass: pass, total: total, pct: Math.round(100 * pass / total) });
    }
    return out;
  }
  function dailyReviews(hist, nDays) {
    var today = dayStart(Date.now()), out = [];
    for (var d = nDays - 1; d >= 0; d--) {
      var start = today - d * DAY;
      var n = 0;
      hist.forEach(function (h) { if (h.t >= start && h.t < start + DAY) n++; });
      var lbl = d === 0 ? "today" : (new Date(start).getDate()) + "";
      out.push({ label: lbl, value: n });
    }
    return out;
  }
  function dueForecast(nDays) {
    var today = dayStart(Date.now()), out = [];
    var pool = Store.reviewPool();
    for (var d = 0; d < nDays; d++) {
      var end = today + (d + 1) * DAY;
      var start = today + d * DAY;
      var n = 0;
      pool.forEach(function (c) {
        var due = Scheduler.dueDate(c);
        if (due == null) { if (d === 0) n++; return; }         // never scheduled = due now
        if (d === 0 ? due < end : (due >= start && due < end)) n++;   // day 0 includes overdue
      });
      out.push({ label: d === 0 ? "today" : "+" + d, value: n, emph: d === 0 });
    }
    return out;
  }

  // ---- render ----
  function render() {
    var root = $("stats-body");
    root.innerHTML = "";
    var hist = Store.history();
    var counts = Scheduler.masteryCounts();
    var pool = Store.reviewPool();
    var due = Scheduler.dueChars().length;
    var leeches = pool.filter(function (c) { return Scheduler.isLeech(c); });

    // --- headline tiles ---
    var now = Date.now();
    var last30 = hist.filter(function (h) { return h.t >= now - 30 * DAY; });
    var pass30 = last30.filter(function (h) { return h.p; }).length;
    var tiles = el("div", "stats-tiles");
    [["Learned", String(pool.length)],
     ["Due now", String(due)],
     ["Retention (30d)", last30.length ? Math.round(100 * pass30 / last30.length) + "%" : "—"],
     ["Leeches", String(leeches.length)]].forEach(function (p) {
      var t = el("div", "stats-tile");
      t.appendChild(el("div", "stats-num", p[1]));
      t.appendChild(el("div", "stats-lab", p[0]));
      tiles.appendChild(t);
    });
    root.appendChild(tiles);

    // --- retention trend ---
    var rc = card("Retention", "Share of reviews passed per week. The shaded band (75–92%) is a healthy range: consistently below it means intervals are outrunning your memory; far above may mean reviews are too easy.");
    var weeks = weeklyRetention(hist, 12);
    if (weeks.length && hist.length >= 10) rc.appendChild(retentionChart(weeks));
    else rc.appendChild(el("p", "hint", "Not enough review history yet — tracking started with this version, so the trend fills in as you study."));
    root.appendChild(rc);

    // --- reviews per day ---
    var rv = card("Reviews per day", "Your actual study activity over the last two weeks.");
    if (hist.length) rv.appendChild(barChart(dailyReviews(hist, 14), { h: 110 }));
    else rv.appendChild(el("p", "hint", "No reviews logged yet."));
    root.appendChild(rv);

    // --- due forecast ---
    var fc = card("Due forecast", "Reviews coming due over the next week (today includes anything overdue).");
    fc.appendChild(barChart(dueForecast(7), { h: 110, everyLabel: true }));
    root.appendChild(fc);

    // --- mastery distribution ---
    var md = card("Mastery", "Where every kanji sits right now.");
    var mrows = el("div", "stats-bars");
    var order = [["new", "New"], ["learning", "Learning"], ["mature", "Mature"], ["seasoned", "Seasoned"], ["mastered", "Mastered"]];
    var maxCount = Math.max.apply(null, order.map(function (o) { return counts[o[0]] || 0; })) || 1;
    order.forEach(function (o) {
      var row = el("div", "stats-bar-row");
      row.appendChild(el("span", "stats-bar-label", o[1]));
      var track = el("div", "stats-bar-track");
      var fill = el("div", "stats-bar-fill mastery-fill-" + o[0]);
      fill.style.width = Math.max(1, Math.round(100 * (counts[o[0]] || 0) / maxCount)) + "%";
      track.appendChild(fill);
      row.appendChild(track);
      row.appendChild(el("span", "stats-bar-num", String(counts[o[0]] || 0)));
      mrows.appendChild(row);
    });
    md.appendChild(mrows);
    root.appendChild(md);

    // --- trouble kanji ---
    var tk = card("Trouble kanji", leeches.length
      ? "Kanji that keep failing despite review. Tap one to see it in Browse — or use the Leeches filter in Study to drill them."
      : "Kanji that keep failing despite review show up here. None right now.");
    if (leeches.length) {
      var wrap = el("div", "stats-leeches");
      leeches.slice(0, 24).forEach(function (c) {
        var b = el("button", "leech-chip", c);
        b.type = "button";
        b.addEventListener("click", function () { if (window.__openBrowseAt) window.__openBrowseAt(c); });
        wrap.appendChild(b);
      });
      if (leeches.length > 24) wrap.appendChild(el("span", "hint", "+" + (leeches.length - 24) + " more"));
      tk.appendChild(wrap);
    }
    root.appendChild(tk);

    // --- confusion pairs (Phase 34, Part 3) ---
    var pairs = window.Confusion ? Confusion.allPairs() : [];
    var cp = card("Kanji you mix up", pairs.length
      ? "Pairs you've marked as confused. They come up for side-by-side practice during reviews. Tap a kanji to open it in Browse; ✕ removes a pair you've untangled."
      : "When you fail a review, the app asks if you mixed the kanji up with a look-alike — confirmed pairs collect here (you can also mark them on a kanji's Browse card) and get side-by-side practice during reviews.");
    if (pairs.length) {
      var pw = el("div", "stats-conf");
      pairs.slice(0, 20).forEach(function (p) {
        var row = el("div", "conf-stat-row");
        [p.a, p.b].forEach(function (c, i) {
          if (i) row.appendChild(el("span", "conf-stat-sep", "↔"));
          var b = el("button", "leech-chip", c);
          b.type = "button";
          b.addEventListener("click", function () { if (window.__openBrowseAt) window.__openBrowseAt(c); });
          row.appendChild(b);
        });
        row.appendChild(el("span", "conf-stat-n", p.n + "×"));
        var rm = el("button", "conf-stat-rm", "✕");
        rm.type = "button";
        rm.title = "No longer confused — remove this pair";
        rm.addEventListener("click", function () { Confusion.remove(p.a, p.b); render(); });
        row.appendChild(rm);
        pw.appendChild(row);
      });
      if (pairs.length > 20) pw.appendChild(el("span", "hint", "+" + (pairs.length - 20) + " more"));
      cp.appendChild(pw);
    }
    root.appendChild(cp);
  }

  return { render: render };
})();
