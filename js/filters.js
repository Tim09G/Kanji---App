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

  function meta(char) {
    return (window.KANJI_META || []).filter(function (m) { return m.char === char; })[0];
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

    // Time since last reviewed — graduated buckets spanning days to months.
    timeSinceReview: {
      id: "timeSinceReview",
      label: "Not reviewed in",
      options: function () {
        return [
          { value: 1, label: "1 day" }, { value: 3, label: "3 days" }, { value: 5, label: "5 days" },
          { value: 7, label: "1 week" }, { value: 14, label: "2 weeks" }, { value: 21, label: "3 weeks" },
          { value: 28, label: "4 weeks" }, { value: 30, label: "1 month" }, { value: 60, label: "2 months" },
          { value: 90, label: "3 months" }, { value: 180, label: "6 months" },
        ];
      },
      predicate: function (days) {
        return function (char) { return Scheduler.daysSinceReview(char) >= days; };
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

    // Visually/structurally similar to a chosen kanji (includes that kanji).
    similar: {
      id: "similar",
      label: "Similar to",
      options: function () {
        return allChars().filter(function (c) { return (meta(c).similar || []).length; })
          .map(function (c) { return { value: c, label: c + " " + meta(c).meaning }; });
      },
      predicate: function (base) {
        var m = meta(base);
        var set = {};
        set[base] = true;
        (m && m.similar || []).forEach(function (c) { set[c] = true; });
        return function (char) { return !!set[char]; };
      },
    },

    // Blocks of 50 in study order (with a small set this is one block).
    group: {
      id: "group",
      label: "Group (of 50)",
      options: function () {
        var n = allChars().length;
        var blocks = Math.ceil(n / 50);
        var opts = [];
        for (var i = 0; i < blocks; i++) {
          opts.push({ value: i, label: (i * 50 + 1) + "–" + Math.min((i + 1) * 50, n) });
        }
        return opts;
      },
      predicate: function (block) {
        var order = allChars();
        var start = block * 50, end = start + 50;
        var set = {};
        order.slice(start, end).forEach(function (c) { set[c] = true; });
        return function (char) { return !!set[char]; };
      },
    },

    // Historical difficulty from past performance.
    difficulty: {
      id: "difficulty",
      label: "Difficulty",
      options: function () {
        return [
          { value: "hard", label: "Hard (struggled)" },
          { value: "medium", label: "Medium" },
          { value: "easy", label: "Easy" },
          { value: "unseen", label: "Not yet attempted" },
        ];
      },
      predicate: function (level) {
        return function (char) { return Scheduler.difficulty(char) === level; };
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
    dueFirst: { label: "Most overdue first", cmp: function (a, b) { return Scheduler.daysSinceReview(b) - Scheduler.daysSinceReview(a); } },
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
