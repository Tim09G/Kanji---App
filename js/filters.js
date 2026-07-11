/*
 * filters.js — the Quiz "session builder" filter/sort layer.
 *
 * This is intentionally separate from the scheduler: filters decide WHICH
 * characters are eligible for a session; the scheduler decides when something is
 * due. Filters are combinable with AND — a character must pass every active
 * filter to be included.
 *
 * Each filter definition exposes:
 *   id, label
 *   options()      -> [{ value, label }] choices for the dropdown
 *   predicate(val) -> function(char) returning true if the char passes
 */
window.Filters = (function () {
  "use strict";

  var _metaMap = null;
  function meta(char) {
    if (!_metaMap) {
      _metaMap = {};
      (window.KANJI_META || []).forEach(function (m) { if (!_metaMap[m.char]) _metaMap[m.char] = m; });
    }
    return _metaMap[char];
  }
  function radicalOf(char) {
    var c = (window.KANJI_COMPONENTS || {})[char];
    if (c && c.radical) return c.radical;
    var m = meta(char);
    return m && m.radical ? m.radical : null;
  }
  function allChars() { return (window.KANJI_META || []).map(function (m) { return m.char; }); }
  function uniqueSorted(arr) {
    return arr.filter(function (v, i, a) { return a.indexOf(v) === i; }).sort(function (a, b) { return a - b; });
  }
  // kun'yomi stem: the reading up to the "." okurigana marker, "-" prefixes dropped
  // (e.g. "はし.る" -> "はしる"? no — stem is "はし"; "ひと-" -> "ひと").
  function kunStem(r) { return String(r).split(".")[0].replace(/-/g, ""); }
  function unique(v, i, a) { return a.indexOf(v) === i; }

  var DEFS = {
    // Learning status (New / Learning / Due for review / Learned).
    status: {
      id: "status",
      label: "Status",
      options: function () {
        return [
          { value: "new", label: "New" },
          { value: "learning", label: "Learning" },
          { value: "due", label: "Due for review" },
          { value: "learned", label: "Learned" },
        ];
      },
      predicate: function (v) {
        return function (char) {
          var p = Store.getProgress(char);
          if (v === "new") return p.status === "new";
          if (v === "learning") return p.status === "learning";
          if (v === "due") return p.status === "review" && Scheduler.isDue(char);
          if (v === "learned") return p.status === "review" && !Scheduler.isDue(char);
          return true;
        };
      },
    },

    // Time since last reviewed — graduated buckets spanning days to years.
    // (C) Only surfaces kanji already in the SRS pool (reviewed at least once) whose
    // time-since-last-review is >= the threshold. New / never-reviewed kanji have no
    // last_review (daysSinceReview = Infinity) and are excluded by the isFinite check.
    timeSinceReview: {
      id: "timeSinceReview",
      label: "Not reviewed in",
      options: function () {
        return [
          { value: 1, label: "1 day" }, { value: 3, label: "3 days" }, { value: 5, label: "5 days" },
          { value: 7, label: "1 week" }, { value: 14, label: "2 weeks" }, { value: 21, label: "3 weeks" },
          { value: 28, label: "4 weeks" }, { value: 30, label: "1 month" }, { value: 60, label: "2 months" },
          { value: 90, label: "3 months" }, { value: 180, label: "6 months" },
          { value: 365, label: "1 year" }, { value: 730, label: "2 years" },
        ];
      },
      predicate: function (days) {
        return function (char) {
          var d = Scheduler.daysSinceReview(char);
          return isFinite(d) && d >= Number(days);   // reviewed-at-least-once AND >= threshold
        };
      },
    },

    // Stroke count (exact).
    strokeCount: {
      id: "strokeCount",
      label: "Stroke count",
      options: function () {
        return uniqueSorted(allChars().map(function (c) { return meta(c).strokeCount; }))
          .map(function (n) { return { value: n, label: n + (n === 1 ? " stroke" : " strokes") }; });
      },
      predicate: function (n) {
        return function (char) { return meta(char).strokeCount === Number(n); };
      },
    },

    // Classifying radical (KANJIDIC-aligned, from KanjiVG component data).
    radical: {
      id: "radical",
      label: "Radical",
      options: function () {
        var seen = {};
        var opts = [];
        allChars().forEach(function (c) {
          var r = radicalOf(c);
          if (r && !seen[r.char]) { seen[r.char] = true; opts.push({ value: r.char, label: r.char + (r.name ? "（" + r.name + "）" : "") }); }
        });
        return opts;
      },
      predicate: function (rad) {
        return function (char) { var r = radicalOf(char); return r && r.char === rad; };
      },
    },

    // (B) Difficulty — derived from the FSRS difficulty value (D, ~1–10) of each
    // kanji's card. "Not attempted" is kept distinct since FSRS has no data for it.
    difficulty: {
      id: "difficulty",
      label: "Difficulty",
      options: function () {
        return [
          { value: "hard", label: "Hard", hint: "FSRS rates these hardest for you — they come up most often." },
          { value: "medium", label: "Medium", hint: "Average effort to recall." },
          { value: "easy", label: "Easy", hint: "Easy for you — FSRS leaves long gaps between reviews." },
          { value: "unseen", label: "Not attempted", hint: "Never studied yet — no review data." },
        ];
      },
      predicate: function (level) {
        return function (char) { return Scheduler.fsrsDifficultyCat(char) === level; };
      },
    },

    // (F) Lapses — how many times a kanji has been failed after it was learned.
    lapses: {
      id: "lapses",
      label: "Times failed",
      options: function () {
        return [
          { value: 1, label: "1 or more", hint: "Failed at least once since learning." },
          { value: 2, label: "2 or more" },
          { value: 3, label: "3 or more" },
          { value: 5, label: "5 or more", hint: "Persistent trouble characters." },
        ];
      },
      predicate: function (n) {
        return function (char) { return Scheduler.lapses(char) >= Number(n); };
      },
    },

    // (F) Leeches — items that keep coming back despite repeated review.
    leech: {
      id: "leech",
      label: "Leeches",
      options: function () {
        return [{ value: "1", label: "Leeches only", hint: "Kept failing: ≥4 lapses, or ≥3 lapses on 40%+ of reviews." }];
      },
      predicate: function () {
        return function (char) { return Scheduler.isLeech(char); };
      },
    },

    // (F) JLPT level (from KANJIDIC2).
    jlpt: {
      id: "jlpt",
      label: "JLPT level",
      options: function () {
        return [5, 4, 3, 2, 1].map(function (n) { return { value: n, label: "N" + n }; });
      },
      predicate: function (n) {
        return function (char) { return meta(char).jlpt === Number(n); };
      },
    },

    // (F) School grade (from KANJIDIC2): 1–6 kyōiku, 8 secondary jōyō, 9/10 jinmeiyō.
    grade: {
      id: "grade",
      label: "School grade",
      options: function () {
        var present = {};
        allChars().forEach(function (c) { var g = meta(c).grade; if (g != null) present[g] = true; });
        function lbl(g) {
          if (g >= 1 && g <= 6) return "Grade " + g + " (elementary)";
          if (g === 8) return "Secondary (jōyō)";
          if (g === 9 || g === 10) return "Jinmeiyō (names)";
          return "Grade " + g;
        }
        return Object.keys(present).map(Number).sort(function (a, b) { return a - b; })
          .map(function (g) { return { value: g, label: lbl(g) }; });
      },
      predicate: function (g) {
        return function (char) { return meta(char).grade === Number(g); };
      },
    },

    // (A) Visually/structurally similar to a chosen kanji (any kanji; includes it).
    // UI is a kanji text input rather than a fixed dropdown. Phase 31: the underlying
    // meta.similar lists are multi-signal (shared components + visual shape +
    // stroke-count proximity + curated confusables).
    similar: {
      id: "similar",
      label: "Similar to",
      ui: "kanji",
      predicate: function (base) {
        var m = meta(base);
        var set = {};
        set[base] = true;
        (m && m.similar || []).forEach(function (c) { set[c] = true; });
        return function (char) { return !!set[char]; };
      },
    },

    // Phase 31: kanji sharing a READING with the chosen one — sounds-alike, kept as
    // its own toggle (never blended into the visual similarity score). Matches on
    // any shared on'yomi, or any shared kun'yomi stem (the part before the "." that
    // marks okurigana).
    similarReading: {
      id: "similarReading",
      label: "Similar reading",
      ui: "kanji",
      hintFor: function (base) {
        var m = meta(base);
        if (!m) return "";
        var on = (m.on || []).join("、");
        var kun = (m.kun || []).map(kunStem).filter(unique).join("、");
        var parts = [];
        if (on) parts.push("音 " + on);
        if (kun) parts.push("訓 " + kun);
        return parts.length ? ("readings: " + parts.join("　")) : "no readings";
      },
      predicate: function (base) {
        var m = meta(base);
        var ons = {}, kuns = {};
        (m && m.on || []).forEach(function (r) { ons[r] = true; });
        (m && m.kun || []).forEach(function (r) { kuns[kunStem(r)] = true; });
        return function (char) {
          if (char === base) return true;
          var c = meta(char);
          if (!c) return false;
          for (var i = 0; i < (c.on || []).length; i++) if (ons[c.on[i]]) return true;
          for (var j = 0; j < (c.kun || []).length; j++) if (kuns[kunStem(c.kun[j])]) return true;
          return false;
        };
      },
    },

    // (E) A contiguous block of the ACTIVE display order, chosen via a scroll-picker
    // (size wheel + group wheel). Value is { size, index, sort } where `sort` is the
    // screen's current display order (injected at apply time) so the block follows
    // whatever order is selected rather than a fixed one.
    group: {
      id: "group",
      label: "Group",
      ui: "group",
      groupCount: function (size) { return Math.max(1, Math.ceil(allChars().length / (Number(size) || 50))); },
      predicate: function (val) {
        var size = Number(val && val.size) || 50, idx = Number(val && val.index) || 0;
        var sortId = (val && val.sort) || "study";
        // Chunk through the order EXACTLY as displayed: sort, then flatten the
        // section grouping (so e.g. Study order/JLPT yields all-N5 first, not the
        // raw grade,freq sequence that interleaves JLPT levels).
        var flat = [];
        sections(sortChars(allChars(), sortId), sortId).forEach(function (s) {
          s.chars.forEach(function (c) { flat.push(c); });
        });
        var start = idx * size, end = start + size, set = {};
        flat.slice(start, end).forEach(function (c) { set[c] = true; });
        return function (char) { return !!set[char]; };
      },
    },
  };

  // Given active filters [{ id, value }], return the matching characters (AND).
  function apply(active) {
    var preds = active.map(function (f) { return DEFS[f.id].predicate(f.value); });
    return allChars().filter(function (char) {
      return preds.every(function (p) { return p(char); });
    });
  }

  // Ordering for the session. "Random" is the default.
  var SORTS = {
    random: { label: "Random", random: true },
    study: { label: "Study order (JLPT)", cmp: null },
    // (D) Same underlying order as study, but the UI renders no section headers.
    ungrouped: { label: "Ungrouped (plain list)", cmp: null },
    grade: { label: "Grade level", cmp: function (a, b) {
      var ga = meta(a).grade == null ? 99 : meta(a).grade, gb = meta(b).grade == null ? 99 : meta(b).grade;
      return ga - gb || (meta(a).freq - meta(b).freq);
    } },
    strokesAsc: { label: "Increasing stroke count", cmp: function (a, b) { return meta(a).strokeCount - meta(b).strokeCount; } },
    freqAsc: { label: "Frequency (most common first)", cmp: function (a, b) { return meta(a).freq - meta(b).freq; } },
    dueFirst: { label: "Most overdue first", cmp: function (a, b) { return Scheduler.overdueDays(b) - Scheduler.overdueDays(a); } },
    // (F) Soonest upcoming due date first — previews what's coming up, including
    // future-due cards (distinct from "most overdue", which only ranks lateness).
    nextDue: { label: "Next due (soonest first)", cmp: function (a, b) {
      var da = Scheduler.dueDate(a), db = Scheduler.dueDate(b);
      return (da == null ? Infinity : da) - (db == null ? Infinity : db);
    } },
    // (F) Most-failed first — surfaces personal trouble characters.
    lapsesDesc: { label: "Most failed first", cmp: function (a, b) { return Scheduler.lapses(b) - Scheduler.lapses(a); } },
  };
  var DEFAULT_SORT = "random";

  var _orderIdx = null;
  function orderIndex(ch) {
    if (!_orderIdx) { _orderIdx = {}; allChars().forEach(function (c, i) { _orderIdx[c] = i; }); }
    return _orderIdx[ch];
  }
  function sortChars(chars, sortId) {
    var s = SORTS[sortId] || SORTS[DEFAULT_SORT];
    if (s.random) return shuffle(chars);
    var out = chars.slice().sort(function (a, b) { return orderIndex(a) - orderIndex(b); });
    if (s.cmp) out.sort(s.cmp);
    return out;
  }

  // ===== Sectioned display (A) =====
  // Given the already-sorted `chars`, partition them into labelled sections that
  // match the active order. Returns [{ label, chars }] in header order; within each
  // section the input order is preserved. Kanji that don't fit the active order's
  // categories go into a generic "Outside current order" bucket, shown last.
  var OUTSIDE = "Outside current order";

  // Day-range bands reused from the "Not reviewed in" thresholds (C).
  var DAY_BANDS = [
    [1, "under a day"], [3, "1–3 days"], [5, "3–5 days"], [7, "5–7 days"],
    [14, "1–2 weeks"], [21, "2–3 weeks"], [28, "3–4 weeks"], [30, "about a month"],
    [60, "1–2 months"], [90, "2–3 months"], [180, "3–6 months"], [365, "6–12 months"],
    [730, "1–2 years"], [Infinity, "2+ years"],
  ];
  function dayBand(days) {
    for (var i = 0; i < DAY_BANDS.length; i++) { if (days < DAY_BANDS[i][0]) return { idx: i, label: DAY_BANDS[i][1] }; }
    return { idx: DAY_BANDS.length - 1, label: DAY_BANDS[DAY_BANDS.length - 1][1] };
  }

  function sectionAssign(sortId, ctx) {
    // returns function(char) -> { key, label, rank }   (lower rank = earlier header)
    switch (sortId) {
      case "study": return function (ch) {
        var j = meta(ch).jlpt;
        if (!j) return { key: "out", label: OUTSIDE, rank: 999 };
        return { key: "n" + j, label: "JLPT N" + j, rank: 6 - j };   // N5 first
      };
      case "grade": return function (ch) {
        var g = meta(ch).grade;
        if (g == null) return { key: "out", label: OUTSIDE, rank: 999 };
        if (g >= 1 && g <= 6) return { key: "g" + g, label: "Grade " + g, rank: g };
        if (g === 8) return { key: "g8", label: "Secondary (jōyō)", rank: 8 };
        return { key: "g9", label: "Jinmeiyō (names)", rank: 9 };
      };
      case "strokesAsc": return function (ch) {
        var n = meta(ch).strokeCount || 0, band = Math.floor((n - 1) / 2);
        var lo = band * 2 + 1, hi = lo + 1;
        return { key: "s" + band, label: lo + "–" + hi + " strokes", rank: band };
      };
      case "freqAsc": return function (ch) {
        var f = meta(ch).freq;
        if (f == null || f >= 99999) return { key: "out", label: OUTSIDE, rank: 99999 };
        var band = Math.floor((f - 1) / 100), lo = band * 100 + 1, hi = lo + 99;
        return { key: "f" + band, label: "#" + lo + "–" + hi, rank: band };
      };
      case "dueFirst": return function (ch) {
        if (Store.getProgress(ch).status !== "review") return { key: "out", label: OUTSIDE, rank: 999 };
        var od = Scheduler.overdueDays(ch);
        if (od < 0) return { key: "out", label: OUTSIDE, rank: 999 };
        if (!isFinite(od)) return { key: "due", label: "Due now", rank: -1 };
        var b = dayBand(od);
        return { key: "od" + b.idx, label: b.label + " overdue", rank: 100 - b.idx };   // most overdue first
      };
      case "nextDue": return function (ch) {
        if (Store.getProgress(ch).status !== "review") return { key: "out", label: OUTSIDE, rank: 999 };
        var due = Scheduler.dueDate(ch);
        if (due == null) return { key: "due", label: "Due now", rank: -1 };
        var u = (due - Date.now()) / DAY_MS;
        if (u <= 0) return { key: "due", label: "Due now", rank: -1 };
        var b = dayBand(u);
        return { key: "nd" + b.idx, label: "in " + b.label, rank: b.idx };
      };
      case "lapsesDesc": return function (ch) {
        var l = Scheduler.lapses(ch);
        if (l <= 0) return { key: "out", label: "Never failed", rank: 999 };
        var pct = ctx.pct[ch];   // 0..1 percentile rank (0 = most failed)
        if (pct < 0.05) return { key: "p0", label: "Top 5% most failed", rank: 0 };
        if (pct < 0.20) return { key: "p1", label: "Next 15% most failed", rank: 1 };
        if (pct < 0.50) return { key: "p2", label: "Next 30% most failed", rank: 2 };
        return { key: "p3", label: "Lower 50% (least failed)", rank: 3 };
      };
      default: return null;   // random / unknown → no sectioning
    }
  }
  var DAY_MS = 24 * 60 * 60 * 1000;

  function sectionContext(sortId, chars) {
    if (sortId !== "lapsesDesc") return null;
    var failed = chars.filter(function (c) { return Scheduler.lapses(c) > 0; })
      .sort(function (a, b) { return Scheduler.lapses(b) - Scheduler.lapses(a); });
    var pct = {}, n = failed.length || 1;
    failed.forEach(function (c, i) { pct[c] = i / n; });
    return { pct: pct };
  }

  function sections(chars, sortId) {
    var assign = sectionAssign(sortId, sectionContext(sortId, chars));
    if (!assign) return [{ label: null, chars: chars.slice() }];
    var groups = {}, keys = [];
    chars.forEach(function (ch) {
      var s = assign(ch);
      if (!groups[s.key]) { groups[s.key] = { label: s.label, rank: s.rank, chars: [] }; keys.push(s.key); }
      groups[s.key].chars.push(ch);
    });
    keys.sort(function (a, b) { return groups[a].rank - groups[b].rank; });
    return keys.map(function (k) { return { label: groups[k].label, chars: groups[k].chars }; });
  }

  function shuffle(chars) {
    var a = chars.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  return { DEFS: DEFS, SORTS: SORTS, DEFAULT_SORT: DEFAULT_SORT, apply: apply, sortChars: sortChars, sections: sections, shuffle: shuffle };
})();
