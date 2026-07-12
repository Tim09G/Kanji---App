/*
 * confusion.js — Phase 34: personal confusion pairs.
 *
 * Detects and stores WHICH kanji this user mixes up (as opposed to the global
 * "similar" data, which says which kanji are mixable in principle):
 *   - prompt-on-failure: after a failed review the draw screen asks "mixed it
 *     up with one of these?" (see drawscreen.js)
 *   - manual marking from Browse ("I mix this up with…")
 * Both record the same bidirectional pair here. Discrimination practice
 * (side-by-side contrast during review sessions) feeds off these records.
 *
 * Pacing/gating knobs (flagged in the phase report):
 *   ACTIVE_DAYS   pair counts as "live" if confused within the last 60 days
 *   COOLDOWN_DAYS a pair isn't re-shown in discrimination within 3 days
 *   SESSION_MAX   at most 2 discrimination steps per study session
 *   Gate: BOTH kanji must be past the Learning mastery band — contrasting
 *   look-alikes too early deepens confusion instead of resolving it.
 */
window.Confusion = (function () {
  "use strict";

  var DAY = 24 * 60 * 60 * 1000;
  var ACTIVE_DAYS = 60, COOLDOWN_DAYS = 3, SESSION_MAX = 2;

  function metaOf(c) { return (window.KANJI_META || []).filter(function (m) { return m.char === c; })[0]; }

  // Canonical key: the two kanji in codepoint order, joined with "|".
  function key(a, b) { return a < b ? a + "|" + b : b + "|" + a; }

  function get(a, b) { return Store.confusions()[key(a, b)] || null; }

  // Record one confusion event between a and b. src: "prompt" (tapped a
  // suggested look-alike after a failure), "typed" (typed a kanji the
  // suggestions missed — kept separate as signal for improving similarity
  // data), or "manual" (marked from Browse).
  function record(a, b, src) {
    if (!a || !b || a === b || !metaOf(a) || !metaOf(b)) return null;
    var map = Store.confusions();
    var k = key(a, b);
    var rec = map[k] || { n: 0, t: 0, m: {} };
    rec.n += 1;
    rec.t = Date.now();
    rec.m[src || "manual"] = (rec.m[src || "manual"] || 0) + 1;
    map[k] = rec;
    Store.writeConfusions(map);
    return rec;
  }

  function remove(a, b) {
    var map = Store.confusions();
    var k = key(a, b);
    if (!map[k]) return false;
    delete map[k];
    Store.writeConfusions(map);
    return true;
  }

  // Partners recorded for a kanji, strongest first (count, then recency).
  function partnersOf(char) {
    var map = Store.confusions();
    var out = [];
    Object.keys(map).forEach(function (k) {
      var parts = k.split("|");
      if (parts[0] === char) out.push({ char: parts[1], rec: map[k] });
      else if (parts[1] === char) out.push({ char: parts[0], rec: map[k] });
    });
    out.sort(function (x, y) { return (y.rec.n - x.rec.n) || (y.rec.t - x.rec.t); });
    return out;
  }

  // All pairs, strongest first — for the stats list.
  function allPairs() {
    var map = Store.confusions();
    return Object.keys(map).map(function (k) {
      var parts = k.split("|");
      return { a: parts[0], b: parts[1], n: map[k].n, t: map[k].t, m: map[k].m || {} };
    }).sort(function (x, y) { return (y.n - x.n) || (y.t - x.t); });
  }

  // Look-alike suggestions for the prompt / manual picker: already-recorded
  // partners first (most likely repeat offenders), topped up from the
  // similarity data. Small on purpose — the prompt must stay one glance.
  function suggestionsFor(char, k) {
    k = k || 4;
    var seen = {}; seen[char] = true;
    var out = [];
    partnersOf(char).forEach(function (p) { if (out.length < k && !seen[p.char]) { seen[p.char] = true; out.push(p.char); } });
    var m = metaOf(char);
    ((m && m.similar) || []).forEach(function (c) { if (out.length < k && !seen[c] && metaOf(c)) { seen[c] = true; out.push(c); } });
    return out;
  }

  // --- discrimination pacing ---
  function pastLearning(char) {
    var lv = Scheduler.masteryLevel(char);
    return lv !== "new" && lv !== "learning";
  }

  var sessionShown = 0;
  function resetSession() { sessionShown = 0; }

  // After `char` was reviewed: pick a partner to contrast it with, or null.
  // Eligible = live pair (confused recently), both past Learning, pair not
  // contrasted in the last COOLDOWN_DAYS, session budget left.
  function pickDiscrimination(char) {
    if (sessionShown >= SESSION_MAX) return null;
    if (!pastLearning(char)) return null;
    var now = Date.now();
    var cands = partnersOf(char).filter(function (p) {
      if (now - p.rec.t > ACTIVE_DAYS * DAY) return false;         // faded out
      if (p.rec.s && now - p.rec.s < COOLDOWN_DAYS * DAY) return false;  // shown recently
      return pastLearning(p.char);
    });
    return cands.length ? cands[0].char : null;
  }

  function noteShown(a, b) {
    var map = Store.confusions();
    var k = key(a, b);
    if (!map[k]) return;
    map[k].s = Date.now();
    Store.writeConfusions(map);
    sessionShown += 1;
  }

  return {
    record: record,
    remove: remove,
    get: get,
    partnersOf: partnersOf,
    allPairs: allPairs,
    suggestionsFor: suggestionsFor,
    pastLearning: pastLearning,
    resetSession: resetSession,
    pickDiscrimination: pickDiscrimination,
    noteShown: noteShown,
  };
})();
