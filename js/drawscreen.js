/*
 * drawscreen.js — the shared "draw a character" screen used by Quiz and Learn.
 *
 * It renders:
 *   - a draw area (HanziWriter) where the user writes one character
 *   - a cue panel beside it (meaning / readings / vocabulary), toggleable
 *
 * The character itself is NEVER shown as a glyph here (not in the draw box,
 * not in the cue panel). Depending on the "level" we show more or less help:
 *
 *   "blind"  -> nothing shown; only the user's strokes appear (Quiz, Learn step 4)
 *   "guided" -> faint whole-character outline + the current stroke flashed (Learn step 1)
 *   "order"  -> faint whole-character outline, no hints (Learn step 2)
 *   "start"  -> nothing shown except a dot marking where the next stroke starts (Learn step 3)
 */
window.DrawScreen = (function () {
  "use strict";

  var SVGNS = "http://www.w3.org/2000/svg";
  var SIZE = 300, PAD = 5;
  var FAINT = "#e2e6ea";

  var els = {};        // cached DOM
  var task = null;     // current task
  var writer = null;
  var strokeData = null; // {strokes, medians} for the current char
  var finished = false;

  // ---- helpers ----
  function kataToHira(s) {
    var out = "";
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      out += (c >= 0x30a1 && c <= 0x30f6) ? String.fromCharCode(c - 0x60) : s[i];
    }
    return out;
  }

  function fetchStrokeData(char) {
    return fetch("data/kanji/" + encodeURIComponent(char) + ".json").then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    });
  }

  function setPrompt(text) { els.prompt.textContent = text; }
  function setStatus(text, kind) {
    els.status.textContent = text || "";
    els.status.className = "draw-status" + (kind ? " " + kind : "");
  }

  // ---- cue panel ----
  function metaFor(char) {
    return (window.KANJI_META || []).filter(function (m) { return m.char === char; })[0];
  }

  function renderCuePanel(char) {
    var meta = metaFor(char);
    var settings = Store.getSettings().cues;

    // settings checkboxes
    els.cueSettings.innerHTML = "";
    [["meaning", "Meaning"], ["readings", "Readings"], ["vocab", "Vocabulary"]].forEach(function (pair) {
      var id = "cue-" + pair[0];
      var label = document.createElement("label");
      label.className = "cue-toggle";
      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = !!settings[pair[0]];
      cb.addEventListener("change", function () {
        Store.setCue(pair[0], cb.checked);
        renderCueContent(char);
      });
      label.appendChild(cb);
      label.appendChild(document.createTextNode(" " + pair[1]));
      els.cueSettings.appendChild(label);
    });

    renderCueContent(char);
  }

  function renderCueContent(char) {
    var meta = metaFor(char);
    var settings = Store.getSettings().cues;
    var root = els.cueContent;
    root.innerHTML = "";
    if (!meta) return;

    if (settings.meaning) {
      var block = document.createElement("div");
      block.className = "cue-block";
      block.innerHTML = '<div class="cue-label">Meaning</div>';
      var v = document.createElement("div");
      v.className = "cue-value";
      v.textContent = meta.meaning;
      block.appendChild(v);
      root.appendChild(block);
    }

    if (settings.readings) {
      var rb = document.createElement("div");
      rb.className = "cue-block";
      rb.innerHTML = '<div class="cue-label">Readings (hiragana)</div>';
      var on = (meta.on || []).map(kataToHira);
      var kun = (meta.kun || []).map(function (k) { return k.replace(/[.\-]/g, ""); }).map(kataToHira);
      var line = document.createElement("div");
      line.className = "cue-value";
      var parts = [];
      if (on.length) parts.push("音 " + on.join("、"));
      if (kun.length) parts.push("訓 " + kun.join("、"));
      line.textContent = parts.join("　");
      rb.appendChild(line);
      root.appendChild(rb);
    }

    if (settings.vocab && meta.vocab && meta.vocab.length) {
      var vb = document.createElement("div");
      vb.className = "cue-block";
      vb.innerHTML = '<div class="cue-label">Vocabulary</div>';
      meta.vocab.forEach(function (w) {
        var item = document.createElement("div");
        item.className = "vocab-item";

        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "vocab-word";
        // build the reading with the target-kanji portion in bold
        w.r.forEach(function (seg) {
          var span = document.createElement("span");
          span.textContent = seg.t;
          if (seg.b) span.className = "vocab-target";
          btn.appendChild(span);
        });
        btn.title = w.en; // hover tooltip on desktop

        var gloss = document.createElement("span");
        gloss.className = "vocab-gloss";
        gloss.textContent = " — " + w.en;
        gloss.hidden = true; // tap to reveal on mobile

        btn.addEventListener("click", function () { gloss.hidden = !gloss.hidden; });

        item.appendChild(btn);
        item.appendChild(gloss);
        vb.appendChild(item);
      });
      root.appendChild(vb);
    }

    if (!root.children.length) {
      var empty = document.createElement("p");
      empty.className = "cue-empty";
      empty.textContent = "No cues selected. Tick a box above for a hint.";
      root.appendChild(empty);
    }
  }

  // ---- start-point marker (level "start") ----
  function clearMarker() {
    var old = els.target.querySelector(".start-marker");
    if (old) old.parentNode.removeChild(old);
  }
  function showStartMarker(strokeIndex, attempt) {
    clearMarker();
    if (!strokeData || !strokeData.medians[strokeIndex]) return;
    var g = els.target.querySelector("svg > g");
    if (!g) {
      // HanziWriter's SVG group may not be in the DOM yet — retry next frame.
      if ((attempt || 0) < 20) requestAnimationFrame(function () { showStartMarker(strokeIndex, (attempt || 0) + 1); });
      return;
    }
    var pt = strokeData.medians[strokeIndex][0]; // first point of the stroke's median
    var c = document.createElementNS(SVGNS, "circle");
    c.setAttribute("class", "start-marker");
    c.setAttribute("cx", pt[0]);
    c.setAttribute("cy", pt[1]);
    c.setAttribute("r", "45");      // data units (~13px on screen at this scale)
    c.setAttribute("fill", "#2f6fed");
    c.setAttribute("fill-opacity", "0.85");
    g.appendChild(c);
  }

  // ---- writer + quiz ----
  function buildWriter(char, level) {
    els.target.innerHTML = "";
    var opts = {
      width: SIZE, height: SIZE, padding: PAD,
      showCharacter: false,
      showOutline: (level === "guided" || level === "order"),
      outlineColor: FAINT,
      strokeColor: "#1f2933",
      drawingColor: "#2f6fed",
      highlightColor: "#2f6fed",
      charDataLoader: function (c, onComplete) { onComplete(strokeData); },
    };
    writer = HanziWriter.create(els.target, char, opts);
  }

  function startQuiz(level) {
    var nextStroke = 0;
    var quizOpts = {
      leniency: level === "guided" ? 1.25 : 1.0,
      showHintAfterMisses: level === "guided" ? 1 : 9999,
      onCorrectStroke: function (info) {
        nextStroke = info.strokeNum + 1;
        var remaining = info.strokesRemaining;
        setStatus(remaining > 0 ? remaining + " stroke(s) to go" : "Last stroke!", "good");
        if (level === "guided" && remaining > 0) writer.highlightStroke(nextStroke);
        if (level === "start") showStartMarker(nextStroke);
      },
      onMistake: function (info) {
        setStatus("Not stroke " + (info.strokeNum + 1) + " — try again", "bad");
      },
      onComplete: function (summary) {
        clearMarker();
        finished = true;
        var mistakes = summary && typeof summary.totalMistakes === "number" ? summary.totalMistakes : 0;
        task._mistakes = mistakes;
        setStatus("Correct!" + (mistakes ? " (" + mistakes + " mistakes)" : " Perfect!"), "good");
        els.next.hidden = false;
        els.next.focus();
      },
    };
    writer.quiz(quizOpts);
    if (level === "guided") writer.highlightStroke(0);
    if (level === "start") showStartMarker(0);
  }

  // ---- public: run one task ----
  // task = { char, level, modeLabel, stepLabel, progressLabel, onDone(result) }
  function run(t) {
    task = t;
    finished = false;
    els.next.hidden = true;
    els.modeLabel.textContent = t.modeLabel || "";
    els.progressLabel.textContent = t.progressLabel || "";
    els.stepLabel.textContent = t.stepLabel || "";
    setPrompt(promptFor(t.level));
    setStatus("");
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
      case "order":  return "Draw it — figure out the stroke order yourself.";
      case "start":  return "Draw each stroke starting from the blue dot.";
      default:       return "Draw this character from memory.";
    }
  }

  // ---- buttons ----
  function onSkip() {
    if (!task) return;
    var t = task; task = null;
    if (writer) writer.cancelQuiz();
    t.onDone({ completed: false, skipped: true });
  }
  function onReveal() {
    if (!task || !writer) return;
    finished = false;
    setStatus("Showing the answer — counts as needing help.", "");
    writer.showOutline();
    writer.animateCharacter();
    task._gaveUp = true;
    els.next.hidden = false;
  }
  function onNext() {
    if (!task) return;
    var t = task; task = null;
    t.onDone({ completed: finished && !t._gaveUp, mistakes: t._mistakes || 0 });
  }

  function init(elements) {
    els = elements;
    els.skip.addEventListener("click", onSkip);
    els.reveal.addEventListener("click", onReveal);
    els.next.addEventListener("click", onNext);
  }

  return { init: init, run: run };
})();
