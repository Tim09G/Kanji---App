/*
 * scheduler.js — spaced-repetition scheduler, backed by FSRS (ts-fsrs).
 *
 * Separate from the "what do I study now" logic (filters / session builder).
 * It answers: given a review result, WHEN is a kanji due next, and WHICH are due
 * now. The real FSRS algorithm (ts-fsrs, vendored) computes the next interval /
 * due date from the 4-point Again/Hard/Good/Easy rating.
 *
 * Rating mapping (Phase 28, stroke-level): the draw screen computes an explicit
 * rating from per-stroke misses/redos (Easy = flawless, Good = redos or 1 miss,
 * Hard = 2 misses, Again = 3+/gave up; thresholds scale with stroke count) and
 * passes it as result.rating. Only ratingless results (skips) use the legacy
 * fallback below, which maps them to Again.
 *
 * Desired retention: FSRS standard default (0.9), not user-adjustable this round.
 *
 * Per-kanji FSRS card state is persisted in Store under progress[char].fsrs.
 */
window.Scheduler = (function () {
  "use strict";

  var DAY = 24 * 60 * 60 * 1000;
  function now() { return Date.now(); }

  // FSRS instance with standard default desired retention (request_retention = 0.9).
  // enable_short_term is turned OFF so intervals are day-scale from the first
  // review — within-session learning is already handled by the app's own Learn
  // scaffolding and failure side-loop, so sub-day (minute) FSRS steps would
  // conflict and surface "due" items again minutes later in the same session.
  var lib = window.FSRS;
  var f = lib.fsrs(lib.generatorParameters({ enable_short_term: false }));
  var Rating = lib.Rating;   // Again=1, Hard=2, Good=3, Easy=4

  // ---- card storage (serialised FSRS Card) ----
  function rawCard(char) { return Store.getProgress(char).fsrs || null; }

  // Build a CardInput ts-fsrs accepts (due/last_review as epoch ms, state numeric).
  function cardInput(char) {
    var c = rawCard(char);
    if (!c) return lib.createEmptyCard(now());
    return {
      due: c.due, stability: c.stability, difficulty: c.difficulty,
      elapsed_days: c.elapsed_days, scheduled_days: c.scheduled_days,
      learning_steps: c.learning_steps || 0, reps: c.reps, lapses: c.lapses,
      state: c.state, last_review: c.last_review != null ? c.last_review : null,
    };
  }
  function serialize(card) {
    return {
      due: +new Date(card.due), stability: card.stability, difficulty: card.difficulty,
      elapsed_days: card.elapsed_days, scheduled_days: card.scheduled_days,
      learning_steps: card.learning_steps || 0, reps: card.reps, lapses: card.lapses,
      state: card.state, last_review: card.last_review != null ? +new Date(card.last_review) : null,
    };
  }

  function statsOf(char) { return Store.getProgress(char).stats || { attempts: 0, mistakes: 0 }; }

  // ---- rating from an app result ----
  function ratingFor(result) {
    // Phase 28: the draw screen supplies an explicit stroke-level rating.
    if (result.rating) {
      switch (result.rating) {
        case "easy": return Rating.Easy;
        case "good": return Rating.Good;
        case "hard": return Rating.Hard;
        default: return Rating.Again;
      }
    }
    // Legacy fallback (e.g. a skip, which carries no rating).
    if (result.skipped || result.gaveUp || result.hintShown) return Rating.Again;
    if ((result.mistakes || 0) >= 1) return Rating.Hard;
    return Rating.Good;
  }

  // Feed one attempt's rating into FSRS and persist the new card.
  function review(char, rating, when) {
    var t = when || now();
    var item = f.next(cardInput(char), t, rating);   // { card, log }
    var saved = serialize(item.card);
    Store.saveProgress(char, { fsrs: saved });
    return saved;
  }

  // Apply a full app result (review-mode attempt or learn-mode graduation).
  function applyResult(char, result) {
    var stats = statsOf(char);
    stats.attempts += 1;
    stats.mistakes += (result.mistakes || 0);
    Store.saveProgress(char, { stats: stats });
    return review(char, ratingFor(result));
  }

  // ---- due / scheduling queries (all from FSRS card.due) ----
  function dueDate(char) { var c = rawCard(char); return c ? c.due : null; }

  function isDue(char) {
    if (Store.getProgress(char).status !== "review") return false;
    var due = dueDate(char);
    return due == null || due <= now();   // never-scheduled review items count as due
  }
  function dueChars() { return Store.reviewPool().filter(isDue); }

  // Days a card is past its due date (negative = not yet due). Used by "most overdue".
  function overdueDays(char) {
    var due = dueDate(char);
    if (due == null) return Infinity;     // never scheduled → maximally overdue
    return (now() - due) / DAY;
  }
  function daysSinceReview(char) {
    var c = rawCard(char);
    if (!c || c.last_review == null) return Infinity;
    return (now() - c.last_review) / DAY;
  }

  // Preview the next interval (days) for each rating without committing — for the
  // verification walkthrough / future UI.
  function previewIntervals(char, when) {
    var t = when || now();
    var out = {};
    [["again", Rating.Again], ["hard", Rating.Hard], ["good", Rating.Good], ["easy", Rating.Easy]].forEach(function (p) {
      var item = f.next(cardInput(char), t, p[1]);
      out[p[0]] = { due: +new Date(item.card.due), days: Math.round((+new Date(item.card.due) - t) / DAY * 10) / 10, stability: item.card.stability };
    });
    return out;
  }

  // Coarse historical-difficulty bucket (legacy; kept for any callers. The filter
  // now uses fsrsDifficultyCat below).
  function difficulty(char) {
    var s = statsOf(char), c = rawCard(char) || { lapses: 0 };
    if (s.attempts === 0) return "unseen";
    var missRate = s.mistakes / Math.max(1, s.attempts);
    if (c.lapses >= 2 || missRate >= 1.5) return "hard";
    if (c.lapses === 1 || missRate >= 0.5) return "medium";
    return "easy";
  }

  // ---- FSRS-state accessors (for the difficulty / lapse / leech filters) ----
  function lapses(char) { var c = rawCard(char); return c ? (c.lapses || 0) : 0; }
  function reps(char) { var c = rawCard(char); return c ? (c.reps || 0) : 0; }
  function stability(char) { var c = rawCard(char); return c ? c.stability : null; }

  // (B) Difficulty category from the FSRS difficulty value (D, ~1–10). A kanji with
  // no card (new, or still in Learn scaffolding) has no FSRS data → "unseen".
  function fsrsDifficultyCat(char) {
    var c = rawCard(char);
    if (Store.getProgress(char).status !== "review" || !c) return "unseen";
    var d = c.difficulty || 0;
    if (d >= 7) return "hard";
    if (d >= 4) return "medium";
    return "easy";
  }

  // (F) Leech: keeps lapsing despite review. ≥4 lapses, OR ≥3 lapses and failed on
  // 40%+ of its reviews (catches early-but-persistent failers without waiting for 4).
  function isLeech(char) {
    var c = rawCard(char);
    if (!c) return false;
    var l = c.lapses || 0, r = c.reps || 0;
    return l >= 4 || (l >= 3 && r > 0 && (l / r) >= 0.4);
  }

  // ---- mastery levels (A, rebanded Phase 30) — from FSRS stability S (≈ the
  // day-interval at which recall stays ~90%). "Learning" now covers the whole
  // early-study period, not just the Learn scaffolding:
  //   learning = in Learn scaffolding, OR in the review pool with S < 7 days
  //              (≈ the first couple of successful reviews; also bulk-marked
  //              kanji awaiting their first verification test)
  //   mature   = 7 ≤ S < 45 days     (weekly-to-monthly intervals)
  //   seasoned = 45 ≤ S < 180 days   (~1.5–6 months)
  //   mastered = S ≥ 180 days AND not currently relapsed (state ≠ Relearning)
  // (A lapse resets S low, so a lapsed kanji naturally falls back down the bands.)
  var LEARNING_MAX = 7, MATURE_MAX = 45, MASTERED_MIN = 180;
  function levelFromEntry(p) {
    if (p && p.status === "review") {
      if (!p.fsrs) return "learning";   // unmeasured (bulk-marked): not yet established
      var s = p.fsrs.stability || 0;
      if (s >= MASTERED_MIN && p.fsrs.state !== lib.State.Relearning) return "mastered";
      if (s >= MATURE_MAX) return "seasoned";
      if (s >= LEARNING_MAX) return "mature";
      return "learning";
    }
    if (p && p.status === "learning") return "learning";
    return "new";
  }
  function masteryLevel(char) { return levelFromEntry(Store.getProgress(char)); }
  function masteryCounts() {
    var counts = { new: 0, learning: 0, mature: 0, seasoned: 0, mastered: 0 };
    var prog = Store.allProgress();                       // one read
    var total = (window.KANJI_META || []).length;
    var studied = 0;
    for (var ch in prog) {
      if (!Object.prototype.hasOwnProperty.call(prog, ch)) continue;
      studied++;
      counts[levelFromEntry(prog[ch])]++;
    }
    counts["new"] += Math.max(0, total - studied);        // everything untouched is New
    return counts;
  }

  function cardOf(char) { return rawCard(char); }

  return {
    Rating: Rating,
    ratingFor: ratingFor,
    review: review,
    applyResult: applyResult,
    isDue: isDue,
    dueChars: dueChars,
    dueDate: dueDate,
    overdueDays: overdueDays,
    daysSinceReview: daysSinceReview,
    previewIntervals: previewIntervals,
    difficulty: difficulty,
    fsrsDifficultyCat: fsrsDifficultyCat,
    lapses: lapses,
    reps: reps,
    stability: stability,
    isLeech: isLeech,
    masteryLevel: masteryLevel,
    masteryCounts: masteryCounts,
    statsOf: statsOf,
    cardOf: cardOf,
  };
})();
