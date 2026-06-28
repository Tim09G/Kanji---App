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
  var advanceTimer = null;   // pending auto-advance timeout
  var onBack = null;         // callback for the back button
  var hintShown = false;     // did the character ever need a hint (= overall failure)
  var prevChar = null;       // the previously-shown character (for "Prior kanji")
  var inPrior = false;       // currently viewing the prior character (read-only)
  var priorSaved = null;     // saved current-task state while viewing prior

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
  function componentsOf(char) { return (window.KANJI_COMPONENTS || {})[char]; }
  function radicalOf(char) {
    var c = componentsOf(char);
    if (c && c.radical) return c.radical;        // { char, name(hiragana), strokes }
    var m = metaFor(char);
    return m && m.radical ? { char: m.radical.char, name: m.radical.name } : null;
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

    // After completing the character, reveal its radical: the radical character
    // itself + its Japanese name in hiragana (C1), in a distinct colour.
    var radInfo = radicalOf(meta.char);
    if (task && task.vocabRevealed && radInfo) {
      var radBlock = block("Radical");
      var rv = document.createElement("div");
      rv.className = "cue-value";
      var rad = document.createElement("span");
      rad.className = "radical-reveal";
      rad.textContent = radInfo.char + (radInfo.name ? "（" + radInfo.name + "）" : "");
      rv.appendChild(rad);
      radBlock.appendChild(rv);
      root.appendChild(radBlock);
    }

    if (!root.children.length) {
      var empty = document.createElement("p");
      empty.className = "cue-empty";
      empty.textContent = "No cues selected.";
      root.appendChild(empty);
    }
  }

  function readingText(w) { return w.r.map(function (s) { return s.t; }).join(""); }

  function vocabItem(w) {
    var item = document.createElement("div");
    item.className = "vocab-item";
    if (window.Speak) item.appendChild(window.Speak.speakButton(w.jp)); // G: audio

    if (task && task.vocabRevealed) {
      // After drawing: written form shown; hiragana reading + English hidden
      // until tapped (same hidden-until-interacted pattern as before drawing).
      var jbtn = document.createElement("button");
      jbtn.type = "button"; jbtn.className = "vocab-word vocab-jp"; jbtn.textContent = w.jp;
      jbtn.title = readingText(w) + " — " + w.en;
      var g2 = document.createElement("span");
      g2.className = "vocab-gloss"; g2.textContent = "（" + readingText(w) + "） — " + w.en; g2.hidden = true;
      jbtn.addEventListener("click", function () { g2.hidden = !g2.hidden; });
      item.appendChild(jbtn); item.appendChild(g2);
      return item;
    }

    // Before drawing: hiragana only, target-kanji portion in bold; tap for English.
    var btn = document.createElement("button");
    btn.type = "button"; btn.className = "vocab-word";
    w.r.forEach(function (seg) {
      var span = document.createElement("span");
      span.textContent = seg.t;
      if (seg.b) span.className = "vocab-target";
      btn.appendChild(span);
    });
    btn.title = w.en;
    var gloss = document.createElement("span");
    gloss.className = "vocab-gloss"; gloss.textContent = " — " + w.en; gloss.hidden = true;
    btn.addEventListener("click", function () { gloss.hidden = !gloss.hidden; });
    item.appendChild(btn); item.appendChild(gloss);
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

  // ===== radical / component highlight overlay (C2/C3) =====
  var RAD_COLOR = "#d6453d";    // radical strokes (red)
  var HOVER_COLOR = "#2f6fed";  // component hover (blue)
  var tipEl = null;
  function ensureTip() {
    if (tipEl) return tipEl;
    tipEl = document.createElement("div");
    tipEl.className = "component-tip"; tipEl.hidden = true;
    document.body.appendChild(tipEl);
    return tipEl;
  }
  function showTip(html, x, y) { var t = ensureTip(); t.innerHTML = html; t.hidden = false; moveTip(x, y); }
  function moveTip(x, y) { if (tipEl && !tipEl.hidden) { tipEl.style.left = (x + 14) + "px"; tipEl.style.top = (y + 14) + "px"; } }
  function hideTip() { if (tipEl) tipEl.hidden = true; }
  function clearHighlights() { var ov = els.target.querySelector(".hl-overlay"); if (ov) ov.parentNode.removeChild(ov); hideTip(); }

  function ovPath(d, fill, hit) {
    var pth = document.createElementNS(SVGNS, "path");
    pth.setAttribute("d", d); pth.setAttribute("fill", fill);
    if (hit) { pth.style.pointerEvents = "all"; pth.style.cursor = "help"; }
    else { pth.style.pointerEvents = "none"; }
    return pth;
  }

  // After completion, overlay coloured paths (from our own stroke data) onto the
  // drawn character: radical strokes are coloured; components are hover regions.
  function applyHighlights(char, attempt) {
    var data = componentsOf(char);
    if (!data || !strokeData) return;
    var g = els.target.querySelector("svg > g");
    if (!g) { if ((attempt || 0) < 20) requestAnimationFrame(function () { applyHighlights(char, (attempt || 0) + 1); }); return; }
    clearHighlights();
    var total = strokeData.strokes.length;
    var ov = document.createElementNS(SVGNS, "g"); ov.setAttribute("class", "hl-overlay");

    if (data.radical && data.radical.strokes && data.radical.strokes.length < total) {
      data.radical.strokes.forEach(function (i) { if (strokeData.strokes[i]) ov.appendChild(ovPath(strokeData.strokes[i], RAD_COLOR, false)); });
    }
    (data.components || []).forEach(function (cmp) {
      var hit = [];
      cmp.strokes.forEach(function (i) { if (strokeData.strokes[i]) { var pp = ovPath(strokeData.strokes[i], "transparent", true); ov.appendChild(pp); hit.push(pp); } });
      var tip = "<strong>" + cmp.char + "</strong>" + (cmp.meaning ? " — " + cmp.meaning : "") +
                (cmp.readings && cmp.readings.length ? "<br>" + cmp.readings.join("、") : "");
      hit.forEach(function (q) {
        q.addEventListener("mouseenter", function (e) { hit.forEach(function (z) { z.setAttribute("fill", HOVER_COLOR); }); showTip(tip, e.clientX, e.clientY); });
        q.addEventListener("mousemove", function (e) { moveTip(e.clientX, e.clientY); });
        q.addEventListener("mouseleave", function () { hit.forEach(function (z) { z.setAttribute("fill", "transparent"); }); hideTip(); });
      });
    });
    g.appendChild(ov);
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
      // One redo per stroke, then auto-show the hint on the 2nd miss (B1).
      showHintAfterMisses: 2,
      onCorrectStroke: function (info) {
        var nextStroke = info.strokeNum + 1;
        if (level === "guided" && info.strokesRemaining > 0) writer.highlightStroke(nextStroke);
        if (level === "start") showStartMarker(nextStroke);
      },
      onMistake: function (info) {
        // A hint is shown once a stroke has been missed twice -> overall failure.
        if (info && info.mistakesOnStroke >= 2) hintShown = true;
      },
      onComplete: function (summary) {
        clearMarker();
        var mistakes = summary && typeof summary.totalMistakes === "number" ? summary.totalMistakes : 0;
        finish(mistakes, false);
      },
    });
    if (level === "guided") writer.highlightStroke(0);
    if (level === "start") showStartMarker(0);
  }

  // Called when the character is complete (or revealed). Reveals vocab/radical
  // and decides whether to hold (review failure) or auto-advance (cancelable).
  function finish(mistakes, gaveUp) {
    if (done) return;
    done = true;
    var t = task;
    t._mistakes = mistakes;
    // Success = completed without ever needing a hint, and didn't give up (B1/B2).
    var success = !gaveUp && !hintShown;
    t._success = success;
    t._hintShown = hintShown;

    // Reveal vocab written form + readings + meaning, and the radical (D4/D5).
    t.vocabRevealed = true;
    renderCueContent(t.char);
    applyHighlights(t.char);   // colour the radical + enable component hover (C2/C3)

    var isReviewFail = (t.kind === "review" && !success);
    // On a failed/given-up review attempt, reveal the correct character (B2.1).
    if (isReviewFail && writer) writer.showCharacter();

    if (success) setStatus("Correct!", "good");
    else if (gaveUp) setStatus("Answer shown.", "bad");
    else setStatus("Needed a hint — counts as a miss.", "bad");

    if (isReviewFail) {
      // Hold here; the review must not auto-progress past a failed character (B2.2).
      setPrompt("Tap the character to continue.");
      armTap();
    } else {
      // Cancelable auto-advance (B5) — used for correct answers, learn steps,
      // and the scaffolding side-loop (which pauses 1s then progresses, B2.4).
      startAutoAdvance();
    }
  }

  var tapArmTime = 0;
  // Ignore clicks that land within 300ms of arming — that's the completing
  // stroke's own mouseup firing a click, not a deliberate tap by the user.
  function freshTap() { return Date.now() - tapArmTime >= 300; }

  function startAutoAdvance() {
    setPrompt("Moving on… (tap to pause)");
    advanceTimer = setTimeout(function () { advance(); }, AUTO_ADVANCE_MS);
    if (els.prior) els.prior.disabled = true;   // D: disabled during the countdown
    disarmTap();
    tapArmTime = Date.now();
    // Tapping during the window cancels auto-advance and holds for an explicit tap (B5).
    tapHandler = function () {
      if (!freshTap()) return;
      if (advanceTimer) {
        clearTimeout(advanceTimer); advanceTimer = null;
        setPrompt("Paused — tap the character to continue.");
        armTap();
      }
    };
    els.target.addEventListener("click", tapHandler);
  }

  function armTap() {
    disarmTap();
    tapArmTime = Date.now();
    tapHandler = function () { if (freshTap()) advance(); };
    els.target.addEventListener("click", tapHandler);
    if (els.prior) els.prior.disabled = !prevChar || inPrior;  // D: re-enabled when countdown cancelled / held
  }
  function disarmTap() {
    if (tapHandler) { els.target.removeEventListener("click", tapHandler); tapHandler = null; }
  }

  function advance() {
    if (advancing) return;
    advancing = true;
    disarmTap();
    var t = task; task = null;
    prevChar = t.char;   // D: this character becomes the "prior" for the next one
    t.onDone({ completed: done, success: !!t._success, hintShown: !!t._hintShown, mistakes: t._mistakes || 0, gaveUp: !!t._gaveUp, skipped: false });
  }

  // ===== buttons =====
  function onReveal() {
    if (inPrior || !task || done) return;
    if (writer) writer.cancelQuiz();
    if (writer) { writer.showOutline(); writer.animateCharacter(); }
    task._gaveUp = true;
    finish(task._mistakes || 99, true);
  }
  function onSkip() {
    if (inPrior || !task) return;
    if (writer) writer.cancelQuiz();
    disarmTap();
    var t = task; task = null;
    prevChar = t.char;
    advancing = true;
    t.onDone({ completed: false, success: false, mistakes: 0, gaveUp: false, skipped: true });
  }

  // ===== Prior kanji (D): read-only peek at the previous character =====
  function buildReadOnly(char, data) {
    els.target.innerHTML = "";
    writer = HanziWriter.create(els.target, char, {
      width: SIZE, height: SIZE, padding: PAD, showCharacter: true, showOutline: false,
      strokeColor: "#1f2933", charDataLoader: function (c, cb) { cb(data); },
    });
    applyHighlights(char);
  }
  function onPrior() {
    if (inPrior || !prevChar || (els.prior && els.prior.disabled)) return;
    inPrior = true;
    priorSaved = { task: task, done: done, hintShown: hintShown, strokeData: strokeData,
                   stepLabel: els.stepLabel.textContent, progressLabel: els.progressLabel.textContent };
    if (advanceTimer) { clearTimeout(advanceTimer); advanceTimer = null; }
    disarmTap();
    if (writer) { try { writer.cancelQuiz(); } catch (e) {} }
    if (els.prior) els.prior.disabled = true;
    els.stepLabel.textContent = "◀ Previous kanji";
    setStatus("");
    setPrompt("Showing the previous kanji — tap it to return.");
    task = { char: prevChar, vocabRevealed: true };   // stub so cues render fully
    renderCuePanel(prevChar);
    var pc = prevChar;
    fetchStrokeData(pc).then(function (data) {
      if (!inPrior) return;
      strokeData = data;
      buildReadOnly(pc, data);
    });
    disarmTap();
    tapHandler = function () { exitPriorView(); };
    els.target.addEventListener("click", tapHandler);
  }
  function exitPriorView() {
    if (!inPrior) return;
    inPrior = false;
    disarmTap();
    var s = priorSaved; priorSaved = null;
    task = s.task; done = s.done; hintShown = s.hintShown; strokeData = s.strokeData;
    els.stepLabel.textContent = s.stepLabel;
    els.progressLabel.textContent = s.progressLabel;
    renderCuePanel(task.char);
    if (done) {
      // current was completed and held — re-render completed and re-arm tap-to-continue
      buildReadOnly(task.char, strokeData);
      setStatus(task._success ? "Correct!" : "", task._success ? "good" : "bad");
      setPrompt("Tap the character to continue.");
      armTap();
    } else {
      // current not yet drawn — resume the quiz fresh
      hintShown = false;
      setPrompt(promptFor(task.level));
      buildWriter(task.char, task.level);
      startQuiz(task.level);
      if (els.prior) els.prior.disabled = !prevChar;
    }
  }

  // ===== public: run one task =====
  // task = { char, level, scaffold, modeLabel, stepLabel, progressLabel, onDone }
  function run(t) {
    task = t;
    done = false; advancing = false; hintShown = false; task.vocabRevealed = false;
    if (advanceTimer) { clearTimeout(advanceTimer); advanceTimer = null; }
    disarmTap(); clearHighlights();
    els.modeLabel.textContent = t.modeLabel || "";
    els.stepLabel.textContent = t.stepLabel || "";
    els.progressLabel.textContent = t.progressLabel || "";
    setStatus("");
    setPrompt(promptFor(t.level));
    renderCuePanel(t.char);
    if (els.prior) els.prior.disabled = !prevChar;  // D: enabled if there is a previous character

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

  // Abort the current task without advancing (used by the back button).
  function stop() {
    if (advanceTimer) { clearTimeout(advanceTimer); advanceTimer = null; }
    disarmTap();
    if (writer) { try { writer.cancelQuiz(); } catch (e) {} }
    done = true; advancing = true; task = null;
    inPrior = false; priorSaved = null; prevChar = null;   // reset prior state between sessions
  }

  function init(elements, callbacks) {
    els = elements;
    onBack = (callbacks && callbacks.onBack) || null;
    els.reveal.addEventListener("click", onReveal);
    els.skip.addEventListener("click", onSkip);
    if (els.back) els.back.addEventListener("click", function () { if (onBack) onBack(); });
    if (els.prior) els.prior.addEventListener("click", onPrior);
  }

  return { init: init, run: run, stop: stop };
})();
