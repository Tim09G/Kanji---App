/*
 * store.js — local persistence for progress and settings.
 *
 * Everything lives in the browser's localStorage (per-device, offline).
 *
 * Per-character progress state:
 *   status: "new"      -> never studied; eligible for a Learn session
 *           "learning" -> partway through the 4-step Learn flow
 *           "review"   -> graduated; in the spaced-repetition review pool
 *   learnStep: 0..4    -> highest Learn step completed (0 = none yet)
 *
 * The spaced-repetition (FSRS) scheduling fields will be added to "review"
 * items in a later phase. For now graduating just moves a char into the pool.
 */
window.Store = (function () {
  "use strict";

  var PROGRESS_KEY = "kanji.progress.v1";
  var SETTINGS_KEY = "kanji.settings.v1";

  var DEFAULT_SETTINGS = {
    cues: { meaning: true, readings: true, vocab: true },
  };

  function readJSON(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }
  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* ignore quota/private mode */ }
  }

  // ---- Settings (cue toggles) ----
  function getSettings() {
    var s = readJSON(SETTINGS_KEY, null);
    if (!s) return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    // merge defaults so new keys appear
    s.cues = Object.assign({}, DEFAULT_SETTINGS.cues, s.cues || {});
    return s;
  }
  function setCue(name, on) {
    var s = getSettings();
    s.cues[name] = !!on;
    writeJSON(SETTINGS_KEY, s);
    return s;
  }

  // ---- Progress ----
  function allProgress() { return readJSON(PROGRESS_KEY, {}); }

  function getProgress(char) {
    var all = allProgress();
    return all[char] || { status: "new", learnStep: 0 };
  }

  function saveProgress(char, patch) {
    var all = allProgress();
    var cur = all[char] || { status: "new", learnStep: 0 };
    all[char] = Object.assign({}, cur, patch);
    writeJSON(PROGRESS_KEY, all);
    return all[char];
  }

  // Record that a Learn step was completed for a character.
  function recordLearnStep(char, step) {
    var cur = getProgress(char);
    var patch = { status: "learning", learnStep: Math.max(cur.learnStep || 0, step) };
    return saveProgress(char, patch);
  }

  // Graduate a character into the review pool (after step 4).
  function graduate(char) {
    return saveProgress(char, { status: "review", learnStep: 4, graduatedAt: Date.now() });
  }

  // Sequence of all known chars in study order (currently: grade, then list order).
  function studyOrder() {
    var meta = window.KANJI_META || [];
    return meta.map(function (m) { return m.char; });
  }

  // The next N characters available to Learn (not yet graduated), in study order.
  // Characters already "learning" come first so the user finishes what they started.
  function nextNewChars(n) {
    var order = studyOrder();
    var learning = [], fresh = [];
    order.forEach(function (c) {
      var st = getProgress(c).status;
      if (st === "learning") learning.push(c);
      else if (st === "new") fresh.push(c);
    });
    return learning.concat(fresh).slice(0, n);
  }

  // Characters currently in the review pool.
  function reviewPool() {
    return studyOrder().filter(function (c) { return getProgress(c).status === "review"; });
  }

  function counts() {
    var order = studyOrder();
    var c = { new: 0, learning: 0, review: 0 };
    order.forEach(function (ch) { c[getProgress(ch).status]++; });
    return c;
  }

  // Wipe everything (handy for testing).
  function resetAll() {
    try { localStorage.removeItem(PROGRESS_KEY); } catch (e) {}
  }

  return {
    getSettings: getSettings,
    setCue: setCue,
    getProgress: getProgress,
    saveProgress: saveProgress,
    recordLearnStep: recordLearnStep,
    graduate: graduate,
    studyOrder: studyOrder,
    nextNewChars: nextNewChars,
    reviewPool: reviewPool,
    counts: counts,
    resetAll: resetAll,
  };
})();
