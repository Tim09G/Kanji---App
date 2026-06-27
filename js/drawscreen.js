/*
 * drawscreen.js — the shared "draw a character" screen used by Quiz and Learn.
 *
 * Layout: a draw area (HanziWriter) + a cue panel (frequency / meaning / readings
 * / vocabulary). The kanji is never shown as a glyph while drawing.
 *
 * Reveal levels (how much help while drawing):
 *   "blind"  -> nothing shown; only the user's strokes (Quiz / review / Learn step 4)
 *   "guided" -> faint outline + current stroke flashed (Learn step 1)
 *   "order"  -> faint outline, no hints (Learn step 2)
 *   "start"  -> only a dot for where the next stroke starts (Learn step 3)
 *
 * Advancing:
 *   - A clean success on a normal quiz/review auto-advances after 1s.
 *   - A wrong attempt, or any Learn-scaffolding task, waits for the user to tap
 *     the drawing area to continue. (No "Next" button.)
 */
window.DrawScreen = (function () {
  "use strict";

  var SVGNS = "http://www.w3.org/2000/svg";
  var SIZE = 300, PAD = 5;
  var FAINT = "#e2e6ea";
  var AUTO_ADVANCE_MS = 1000;

  var els = {};
  var task = null;
  var writer = null;
  var strokeData = null;
  var done = false;          // current character finished (success or reveal)
  var advancing = false;     // guard against double-advance
  var tapHandler = null;

  // ---- helpers ----
  function kataToHira(s) {
    var out = "";
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      out += (c >= 0x30a1 && c <= 0x30f6) ? String.fromCharCode(c - 0x60) : s[i];
    }
    return out;
  }
  function metaFor(char) {
    return (window.KANJI_META || []).filter(function (m) { return m.char === char; })[0];
  }
  function fetchStrokeData(char) {
    return fetch("data/kanji/" + encodeURIComponent(char) + ".json").then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    });
  }
  function setPrompt(t) { els.prompt.textContent = t || ""; }
  function setStatus(t, kind) { els.status.textContent = t || ""; els.status.className = "draw-status" + (kind ? " " + kind : ""); }

  // ===== cue panel =====
  function renderCuePanel(char) {
    var settings = Store.getSettings().cues;
    els.cueSettings.innerHTML = "";
    [["frequency", "Frequency"], ["meaning", "Meaning"], ["readings", "Readings"], ["vocab", "Vocabulary"]].forEach(function (pair) {
      var label = document.createElement("label");
      label.className = "cue-toggle";
      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = settings[pair[0]] !== false;
      cb.addEventListener("change", function () { Store.setCue(pair[0], cb.checked); renderCueContent(char); });
      label.appendChild(cb);
      label.appendChild(document.createTextNode(" " + pair[1]));
      els.cueSettings.appendChild(label);
    });
    renderCueContent(char);
  }

  function block(labelText) {
    var b = document.createElement("div");
    b.className = "cue-block";
    var l = document.createElement("div");
    l.className = "cue-label";
    l.textContent = labelText;
    b.appendChild(l);
    return b;
  }

  function renderCueContent(char) {
    var meta = metaFor(char);
    var settings = Store.getSettings().cues;
    var root = els.cueContent;
    root.innerHTML = "";
    if (!meta) return;

    if (settings.frequency !== false && meta.freq) {
      var fb = block("Frequency rank");
      var fv = document.createElement("div");
      fv.className = "cue-value";
      fv.textContent = "#" + meta.freq + " most common";
      fb.appendChild(fv);
      root.appendChild(fb);
    }

    if (settings.meaning !== false) {
      var mb = block("Meaning");
      var mv = document.createElement("div");
      mv.className = "cue-value";
      mv.textContent = meta.meaning;
      mb.appendChild(mv);
      root.appendChild(mb);
    }

    if (settings.readings !== false) {
      var rb = block("Readings (hiragana)");
      var on = (meta.on || []).map(kataToHira);
      var kun = (meta.kun || []).map(function (k) { return k.replace(/[.\-]/g, ""); });
      var rv = document.createElement("div");
      rv.className = "cue-value";
      var parts = [];
      if (on.length) parts.push("音 " + on.join("、"));
      if (kun.length) parts.push("訓 " + kun.join("、"));
      rv.textContent = parts.join("　");
      rb.appendChild(rv);
      root.appendChild(rb);
    }

    if (settings.vocab !== false && meta.vocab && meta.vocab.length) {
      var vb = block("Vocabulary" + (task && task.vocabRevealed ? " (written form)" : ""));
      // group by the kanji's reading used
      var groups = {};
      var order = [];
      meta.vocab.forEach(function (w) {
        if (!groups[w.reading]) { groups[w.reading] = []; order.push(w.reading); }
        groups[w.reading].push(w);
      });
      order.forEach(function (reading) {
        var rh = document.createElement("div");
        rh.className = "vocab-reading";
        rh.textContent = reading;
        vb.appendChild(rh);
        groups[reading].forEach(function (w) {
          vb.appendChild(vocabItem(w));
        });
      });
      root.appendChild(vb);
    }

    if (!root.children.length) {
      var empty = document.createElement("p");
      empty.className = "cue-empty";
      empty.textContent = "No cues selected.";
      root.appendChild(empty);
    }
  }

  function vocabItem(w) {
    var item = document.createElement("div");
    item.className = "vocab-item";
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "vocab-word";

    if (task && task.vocabRevealed) {
      // after drawing: show the real written form (kanji/kana mixed)
      btn.textContent = w.jp;
    } else {
      // before drawing: hiragana only, target-kanji portion in bold
      w.r.forEach(function (seg) {
        var span = document.createElement("span");
        span.textContent = seg.t;
        if (seg.b) span.className = "vocab-target";
        btn.appendChild(span);
      });
    }
    btn.title = w.en;

    var gloss = document.createElement("span");
    gloss.className = "vocab-gloss";
    gloss.textContent = " — " + w.en;
    gloss.hidden = true;
    btn.addEventListener("click", function () { gloss.hidden = !gloss.hidden; });

    item.appendChild(btn);
    item.appendChild(gloss);
    return item;
  }

  // ===== start-point marker (level "start") =====
  function clearMarker() {
    var old = els.target.querySelector(".start-marker");
    if (old) old.parentNode.removeChild(old);
  }
  function showStartMarker(strokeIndex, attempt) {
    clearMarker();
    if (!strokeData || !strokeData.medians[strokeIndex]) return;
    var g = els.target.querySelector("svg > g");
    if (!g) {
      if ((attempt || 0) < 20) requestAnimationFrame(function () { showStartMarker(strokeIndex, (attempt || 0) + 1); });
      return;
    }
    var pt = strokeData.medians[strokeIndex][0];
    var c = document.createElementNS(SVGNS, "circle");
    c.setAttribute("class", "start-marker");
    c.setAttribute("cx", pt[0]); c.setAttribute("cy", pt[1]); c.setAttribute("r", "45");
    c.setAttribute("fill", "#2f6fed"); c.setAttribute("fill-opacity", "0.85");
    g.appendChild(c);
  }

  // ===== writer + quiz =====
  function buildWriter(char, level) {
    els.target.innerHTML = "";
    writer = HanziWriter.create(els.target, char, {
      width: SIZE, height: SIZE, padding: PAD,
      showCharacter: false,
      showOutline: (level === "guided" || level === "order"),
      outlineColor: FAINT,
      strokeColor: "#1f2933",
      drawingColor: "#2f6fed",
      highlightColor: "#2f6fed",
      charDataLoader: function (c, onComplete) { onComplete(strokeData); },
    });
  }

  function startQuiz(level) {
    writer.quiz({
      leniency: level === "guided" ? 1.25 : 1.0,
      showHintAfterMisses: level === "guided" ? 1 : 9999,
      onCorrectStroke: function (info) {
        // no stroke-order countdown shown — just advance the visual helpers
        var nextStroke = info.strokeNum + 1;
        if (level === "guided" && info.strokesRemaining > 0) writer.highlightStroke(nextStroke);
        if (level === "start") showStartMarker(nextStroke);
      },
      onMistake: function () { /* countdown removed; silent */ },
      onComplete: function (summary) {
        clearMarker();
        var mistakes = summary && typeof summary.totalMistakes === "number" ? summary.totalMistakes : 0;
        finish(mistakes, false);
      },
    });
    if (level === "guided") writer.highlightStroke(0);
    if (level === "start") showStartMarker(0);
  }

  // Called when the character is complete (or revealed). Switches vocab to the
  // written form and decides whether to auto-advance or wait for a tap.
  function finish(mistakes, gaveUp) {
    if (done) return;
    done = true;
    var t = task;
    t._mistakes = mistakes;
    var success = !gaveUp && mistakes === 0;
    t._success = success;

    // reveal the real written form of the vocabulary now that drawing is done
    t.vocabRevealed = true;
    renderCueContent(t.char);

    if (success) setStatus("Correct" + (gaveUp ? "" : "!"), "good");
    else if (gaveUp) setStatus("Answer shown.", "bad");
    else setStatus("Got there — " + mistakes + " mistake(s).", "bad");

    if (success && !t.scaffold) {
      setPrompt("Nice. Moving on…");
      setTimeout(function () { advance(); }, AUTO_ADVANCE_MS);
    } else {
      setPrompt("Tap the character to continue.");
      armTap();
    }
  }

  function armTap() {
    disarmTap();
    tapHandler = function () { advance(); };
    els.target.addEventListener("click", tapHandler);
  }
  function disarmTap() {
    if (tapHandler) { els.target.removeEventListener("click", tapHandler); tapHandler = null; }
  }

  function advance() {
    if (advancing) return;
    advancing = true;
    disarmTap();
    var t = task; task = null;
    t.onDone({ completed: done, success: !!t._success, mistakes: t._mistakes || 0, gaveUp: !!t._gaveUp, skipped: false });
  }

  // ===== buttons =====
  function onReveal() {
    if (!task || done) return;
    if (writer) writer.cancelQuiz();
    if (writer) { writer.showOutline(); writer.animateCharacter(); }
    task._gaveUp = true;
    finish(task._mistakes || 99, true);
  }
  function onSkip() {
    if (!task) return;
    if (writer) writer.cancelQuiz();
    disarmTap();
    var t = task; task = null;
    advancing = true;
    t.onDone({ completed: false, success: false, mistakes: 0, gaveUp: false, skipped: true });
  }

  // ===== public: run one task =====
  // task = { char, level, scaffold, modeLabel, stepLabel, progressLabel, onDone }
  function run(t) {
    task = t;
    done = false; advancing = false; task.vocabRevealed = false;
    disarmTap();
    els.modeLabel.textContent = t.modeLabel || "";
    els.stepLabel.textContent = t.stepLabel || "";
    els.progressLabel.textContent = t.progressLabel || "";
    setStatus("");
    setPrompt(promptFor(t.level));
    renderCuePanel(t.char);

    fetchStrokeData(t.char).then(function (data) {
      strokeData = data;
      buildWriter(t.char, t.level);
      startQuiz(t.level);
    }).catch(function () {
      setStatus("Couldn't load stroke data. Run via a local server (see README).", "bad");
    });
  }

  function promptFor(level) {
    switch (level) {
      case "guided": return "Trace each highlighted stroke in order.";
      case "order":  return "Draw it — work out the stroke order yourself.";
      case "start":  return "Draw each stroke from the blue dot.";
      default:       return "Draw this character from memory.";
    }
  }

  function init(elements) {
    els = elements;
    els.reveal.addEventListener("click", onReveal);
    els.skip.addEventListener("click", onSkip);
  }

  return { init: init, run: run };
})();
