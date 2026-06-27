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
  function allChars() { return (window.KANJI_META || []).map(function (m) { return m.char; }); }
  function uniqueSorted(arr) {
    return arr.filter(function (v, i, a) { return a.indexOf(v) === i; }).sort(function (a, b) { return a - b; });
  }

  var DEFS = {
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

    // Classifying radical.
    radical: {
      id: "radical",
      label: "Radical",
      options: function () {
        var seen = {};
        var opts = [];
        allChars().forEach(function (c) {
          var r = meta(c).radical;
          if (r && !seen[r.char]) { seen[r.char] = true; opts.push({ value: r.char, label: r.char + " (" + r.name + ")" }); }
        });
        return opts;
      },
      predicate: function (rad) {
        return function (char) { var r = meta(char).radical; return r && r.char === rad; };
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

    // How new / recently learned for the user.
    recency: {
      id: "recency",
      label: "Learning stage",
      options: function () {
        return [
          { value: "new", label: "New (not started)" },
          { value: "learning", label: "Currently learning" },
          { value: "fresh", label: "Recently graduated (<7d)" },
          { value: "review", label: "In review pool" },
        ];
      },
      predicate: function (stage) {
        return function (char) {
          var p = Store.getProgress(char);
          if (stage === "new") return p.status === "new";
          if (stage === "learning") return p.status === "learning";
          if (stage === "review") return p.status === "review";
          if (stage === "fresh") {
            return p.status === "review" && p.graduatedAt && (Date.now() - p.graduatedAt) < 7 * 24 * 3600 * 1000;
          }
          return true;
        };
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

  // Sorting for the final session order.
  var SORTS = {
    study: { label: "Study order", cmp: null },
    freqAsc: { label: "Most frequent first", cmp: function (a, b) { return meta(a).freq - meta(b).freq; } },
    strokesAsc: { label: "Fewest strokes first", cmp: function (a, b) { return meta(a).strokeCount - meta(b).strokeCount; } },
    dueFirst: { label: "Most overdue first", cmp: function (a, b) { return Scheduler.daysSinceReview(b) - Scheduler.daysSinceReview(a); } },
  };

  function sortChars(chars, sortId) {
    var order = allChars();
    var out = chars.slice().sort(function (a, b) { return order.indexOf(a) - order.indexOf(b); });
    var s = SORTS[sortId];
    if (s && s.cmp) out.sort(s.cmp);
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

  return { DEFS: DEFS, SORTS: SORTS, apply: apply, sortChars: sortChars, shuffle: shuffle };
})();
