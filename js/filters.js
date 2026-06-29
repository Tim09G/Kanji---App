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
    // UI is a kanji text input rather than a fixed dropdown.
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

    // (E) A contiguous block of the study order, chosen via a scroll-picker
    // (size wheel + group wheel). Value is { size, index } (0-based group index).
    group: {
      id: "group",
      label: "Group",
      ui: "group",
      groupCount: function (size) { return Math.max(1, Math.ceil(allChars().length / (Number(size) || 50))); },
      predicate: function (val) {
        var size = Number(val && val.size) || 50, idx = Number(val && val.index) || 0;
        var order = allChars();
        var start = idx * size, end = start + size;
        var set = {};
        order.slice(start, end).forEach(function (c) { set[c] = true; });
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
    study: { label: "Study order", cmp: null },
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

  function sortChars(chars, sortId) {
    var s = SORTS[sortId] || SORTS[DEFAULT_SORT];
    if (s.random) return shuffle(chars);
    var order = allChars();
    var out = chars.slice().sort(function (a, b) { return order.indexOf(a) - order.indexOf(b); });
    if (s.cmp) out.sort(s.cmp);
    return out;
  }

  function shuffle(chars) {
    var a = chars.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  return { DEFS: DEFS, SORTS: SORTS, DEFAULT_SORT: DEFAULT_SORT, apply: apply, sortChars: sortChars, shuffle: shuffle };
})();
