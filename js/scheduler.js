/*
 * scheduler.js — lightweight spaced-repetition scheduler.
 *
 * Deliberately separate from the "what do I study now" logic (filters / session
 * builder). This module only answers: given a review result, WHEN is an item due
 * next, and WHICH items are due now. It is a simple interval ladder for now and
 * is meant to be swapped for FSRS in a later phase without touching the UI or the
 * filter system — they only call recordReview / isDue / dueChars / stats helpers.
 */
window.Scheduler = (function () {
  "use strict";

  var DAY = 24 * 60 * 60 * 1000;
  // Interval ladder in days. A correct answer steps up; a wrong answer resets.
  var LADDER = [1, 3, 7, 14, 30, 60, 120, 240];

  function now() { return Date.now(); }

  function srsOf(char) {
    var p = Store.getProgress(char);
    return p.srs || { idx: -1, interval: 0, due: null, lastReviewed: null, reps: 0, lapses: 0 };
  }
  function statsOf(char) {
    var p = Store.getProgress(char);
    return p.stats || { attempts: 0, mistakes: 0 };
  }

  // Record the outcome of a review/quiz attempt.
  //   success  : true if written correctly with no mistakes
  //   mistakes : number of wrong strokes during the attempt
  function recordReview(char, success, mistakes) {
    var srs = srsOf(char);
    var stats = statsOf(char);

    stats.attempts += 1;
    stats.mistakes += (mistakes || 0);

    if (success) {
      srs.idx = Math.min((srs.idx < 0 ? 0 : srs.idx + 1), LADDER.length - 1);
      srs.reps += 1;
    } else {
      srs.idx = 0;
      srs.lapses += 1;
    }
    srs.interval = LADDER[Math.max(0, srs.idx)];
    srs.lastReviewed = now();
    srs.due = now() + srs.interval * DAY;

    Store.saveProgress(char, { srs: srs, stats: stats });
    return srs;
  }

  // When a character graduates from Learn, seed its schedule so it shows as due.
  function onGraduate(char) {
    var srs = srsOf(char);
    if (srs.due == null) {
      srs.idx = 0; srs.interval = LADDER[0];
      srs.lastReviewed = now(); srs.due = now(); // due immediately for first review
      Store.saveProgress(char, { srs: srs });
    }
  }

  function isDue(char) {
    var p = Store.getProgress(char);
    if (p.status !== "review") return false;
    var srs = srsOf(char);
    return srs.due == null || srs.due <= now();
  }

  // Characters in the review pool that are due now (or never reviewed yet).
  function dueChars() {
    return Store.reviewPool().filter(isDue);
  }

  function daysSinceReview(char) {
    var srs = srsOf(char);
    if (!srs.lastReviewed) return Infinity; // never reviewed → "infinitely long ago"
    return (now() - srs.lastReviewed) / DAY;
  }

  // Coarse difficulty bucket from historical performance.
  function difficulty(char) {
    var s = statsOf(char), srs = srsOf(char);
    if (s.attempts === 0) return "unseen";
    var missRate = s.mistakes / Math.max(1, s.attempts);
    if (srs.lapses >= 2 || missRate >= 1.5) return "hard";
    if (srs.lapses === 1 || missRate >= 0.5) return "medium";
    return "easy";
  }

  return {
    recordReview: recordReview,
    onGraduate: onGraduate,
    isDue: isDue,
    dueChars: dueChars,
    daysSinceReview: daysSinceReview,
    difficulty: difficulty,
    srsOf: srsOf,
    statsOf: statsOf,
  };
})();
