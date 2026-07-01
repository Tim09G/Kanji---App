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
  var AUTOBACKUP_KEY = "kanji.autobackup.v1";
  var BACKUP_APP = "kanji-practice";
  var BACKUP_VERSION = 1;
  var MAX_AUTO = 3;   // keep the last few automatic backups

  var DEFAULT_SETTINGS = {
    cues: { frequency: true, meaning: true, readings: true, vocab: true },
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

  // Fully replace a character's entry (unlike saveProgress, does NOT merge — so any
  // prior FSRS card / stats are dropped). Used by the Settings bulk tools.
  function replaceProgress(char, entry) {
    var all = allProgress();
    all[char] = entry;
    writeJSON(PROGRESS_KEY, all);
    return entry;
  }
  // Phase 26: mark a character as learned and immediately due for review — a graduated
  // review item with no FSRS card, which Scheduler.isDue() treats as due right now.
  // Any existing review schedule for the character is cleared (a fresh test).
  function markLearnedDue(char) {
    return replaceProgress(char, { status: "review", learnStep: 4, graduatedAt: Date.now() });
  }
  // Phase 26: reset a character back to unlearned (clears FSRS history + learn progress).
  function unlearn(char) {
    return replaceProgress(char, { status: "new", learnStep: 0 });
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

  // ---- Backup / restore (Phase 18) ----
  // A snapshot is the full set of locally-persisted data (progress incl. FSRS state,
  // and settings). Export wraps it in an envelope with an app/version marker.
  function snapshot() {
    return { progress: readJSON(PROGRESS_KEY, {}), settings: readJSON(SETTINGS_KEY, null) };
  }
  function exportData() {
    return { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), data: snapshot() };
  }
  // A valid backup is from this app and carries a progress object.
  function validateBackup(obj) {
    return !!(obj && typeof obj === "object" && obj.app === BACKUP_APP &&
      obj.data && typeof obj.data === "object" &&
      obj.data.progress && typeof obj.data.progress === "object");
  }
  function applyData(data) {
    if (data && data.progress && typeof data.progress === "object") writeJSON(PROGRESS_KEY, data.progress);
    if (data && data.settings && typeof data.settings === "object") writeJSON(SETTINGS_KEY, data.settings);
  }
  // Overwrite live data from a validated export envelope. Returns true on success.
  function importData(obj) {
    if (!validateBackup(obj)) return false;
    applyData(obj.data);
    return true;
  }

  // Automatic local backups: a rolling list (newest first), distinct from live data.
  function autoBackups() { var s = readJSON(AUTOBACKUP_KEY, []); return Array.isArray(s) ? s : []; }
  function autoBackup() {
    var snaps = autoBackups();
    var cur = snapshot();
    // skip if nothing changed since the most recent snapshot (don't churn the slots)
    if (snaps.length && JSON.stringify(snaps[0].data) === JSON.stringify(cur)) return false;
    snaps.unshift({ at: new Date().toISOString(), data: cur });
    writeJSON(AUTOBACKUP_KEY, snaps.slice(0, MAX_AUTO));
    return true;
  }
  function restoreAuto() {
    var snaps = autoBackups();
    if (!snaps.length) return false;
    applyData(snaps[0].data);
    return true;
  }

  return {
    getSettings: getSettings,
    setCue: setCue,
    allProgress: allProgress,
    getProgress: getProgress,
    saveProgress: saveProgress,
    recordLearnStep: recordLearnStep,
    graduate: graduate,
    markLearnedDue: markLearnedDue,
    unlearn: unlearn,
    studyOrder: studyOrder,
    nextNewChars: nextNewChars,
    reviewPool: reviewPool,
    counts: counts,
    resetAll: resetAll,
    exportData: exportData,
    importData: importData,
    validateBackup: validateBackup,
    autoBackup: autoBackup,
    autoBackups: autoBackups,
    restoreAuto: restoreAuto,
  };
})();
