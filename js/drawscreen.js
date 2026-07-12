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
  var prevChar = null;       // the previously-shown character (for "Prior kanji")
  var inPrior = false;       // currently viewing the prior character (read-only)
  var priorSaved = null;     // saved current-task state while viewing prior
  // Phase 28: stroke-level grading. Per draw we count `misses` (strokes that needed
  // the auto-hint: wrong on the first attempt AND the redo) and `redos` (wrong once,
  // corrected on the redo). These map to an FSRS rating (Easy/Good/Hard/Again).
  var misses = 0, redos = 0;
  var computedRating = null; // "easy"|"good"|"hard"|"again" once finished (null while drawing)
  var flipped = false;       // Phase 25/28: badge toggled away from the computed result

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
  // Phase 23 A: no status/instruction text anywhere in the session flow. The
  // ✓/✗ badge is the only feedback; this stays a no-op so the many flow-cue call
  // sites keep working without printing anything.
  function setPrompt() {}

  // ===== confusion prompt (Phase 34, 1a) =====
  // After a FAILED review, ask (optionally — a single tap, never blocking) whether
  // the miss was a mix-up with a look-alike. Tapping a suggested kanji or typing
  // any other kanji records a confusion pair; advancing past it skips silently.
  function clearConfusionPrompt() {
    if (!els.confusion) return;
    els.confusion.hidden = true;
    els.confusion.innerHTML = "";
  }
  function isKanjiChar(c) { return /[⺀-⻿㐀-鿿]/.test(c); }
  function renderConfusionPrompt(t) {
    if (!els.confusion || !window.Confusion) return;
    els.confusion.innerHTML = "";
    if (t._confusedWith) {   // already answered this task (e.g. badge flipped back and forth)
      confirmConfusion(t, t._confusedWith);
      els.confusion.hidden = false;
      return;
    }
    var head = document.createElement("div"); head.className = "conf-head";
    var q = document.createElement("span"); q.className = "conf-q"; q.textContent = "Mixed it up with another kanji?";
    var x = document.createElement("button"); x.type = "button"; x.className = "conf-dismiss";
    x.setAttribute("aria-label", "Dismiss"); x.textContent = "✕";
    x.addEventListener("click", clearConfusionPrompt);
    head.appendChild(q); head.appendChild(x);
    els.confusion.appendChild(head);

    var row = document.createElement("div"); row.className = "conf-row";
    Confusion.suggestionsFor(t.char, 4).forEach(function (c) {
      var b = document.createElement("button"); b.type = "button"; b.className = "conf-chip"; b.textContent = c;
      b.addEventListener("click", function () { recordConfusion(t, c, "prompt"); });
      row.appendChild(b);
    });
    var inp = document.createElement("input");
    inp.type = "text"; inp.className = "conf-input"; inp.maxLength = 2;
    inp.placeholder = "or type it…"; inp.setAttribute("aria-label", "Type the kanji you confused it with");
    inp.addEventListener("input", function () {
      var v = (inp.value || "").trim();
      for (var i = 0; i < v.length; i++) {
        if (isKanjiChar(v[i]) && v[i] !== t.char && metaFor(v[i])) { recordConfusion(t, v[i], "typed"); return; }
      }
    });
    row.appendChild(inp);
    els.confusion.appendChild(row);
    els.confusion.hidden = false;
  }
  function recordConfusion(t, partner, src) {
    Confusion.record(t.char, partner, src);
    t._confusedWith = partner;
    confirmConfusion(t, partner);
  }
  function confirmConfusion(t, partner) {
    els.confusion.innerHTML = "";
    var ok = document.createElement("div"); ok.className = "conf-noted";
    ok.textContent = "Noted: " + t.char + " ↔ " + partner + " — they'll come up for side-by-side practice.";
    els.confusion.appendChild(ok);
  }

  // Phase 28: pass = Easy/Good, fail = Hard/Again.
  function isPass(r) { return r === "easy" || r === "good"; }

  // Stroke-level rating (Phase 28 B). Thresholds scale modestly with stroke count
  // (+1 tolerated miss per ~10 strokes, capped), with a hard ceiling: 6+ misses is
  // always Again no matter how complex the character.
  function ratingFromStrokes(m, r, strokeCount) {
    if (m >= 6) return "again";                                  // hard ceiling
    var extra = Math.min(Math.floor((strokeCount || 0) / 10), 3);
    if (m === 0 && r === 0) return "easy";                       // flawless: no misses, no redos
    if (m <= 1 + extra) return "good";                           // 0 miss + redos, or 1 miss
    if (m <= 2 + extra) return "hard";                           // 2 misses
    return "again";                                              // 3+ misses
  }

  // Phase 28 D: the badge shows the computed result; tapping flips its polarity.
  // Flipped-to-fail records Again (bottom); flipped-to-pass records Easy (top);
  // flipping back restores the computed rating.
  function effectiveRating() {
    if (!computedRating) return null;
    if (!flipped) return computedRating;
    return isPass(computedRating) ? "again" : "easy";
  }
  function showResult(rating) { computedRating = rating; flipped = false; renderBadge(); }
  function clearBadge() { computedRating = null; flipped = false; renderBadge(); }
  function renderBadge() {
    var el = els.status; if (!el) return;
    var r = effectiveRating();
    if (!r) { el.textContent = ""; el.className = "draw-result"; el.hidden = true; el.title = ""; el.setAttribute("aria-label", ""); return; }
    var pass = isPass(r);
    el.textContent = pass ? "✓" : "✗";
    el.className = "draw-result " + (pass ? "good" : "bad");
    el.hidden = false;
    var label = (pass ? "Marked correct" : "Marked incorrect") + " — tap to change";
    el.title = label; el.setAttribute("aria-label", label);
  }
  // Phase 25/28: tapping the badge flips pass<->fail. If an auto-advance countdown is
  // running it is cancelled first so the user has time to decide; they then advance by
  // tapping the character (the normal tap-to-continue). Works for mouse + touch.
  function toggleBadge(e) {
    if (!computedRating || inPrior || !done) return;
    if (e) { e.stopPropagation(); if (e.type === "touchend" && e.cancelable) e.preventDefault(); }
    if (advanceTimer) { clearTimeout(advanceTimer); advanceTimer = null; armTap(); }
    flipped = !flipped;
    renderBadge();
    // Phase 34: keep the confusion prompt consistent with the badge — it belongs
    // to failed reviews only, so flipping to ✓ hides it and back to ✗ restores it.
    if (task && task.kind === "review") {
      var er = effectiveRating();
      if (er && !isPass(er)) renderConfusionPrompt(task); else clearConfusionPrompt();
    }
  }

  // ===== cue panel =====
  function renderCuePanel(char) {
    var settings = Store.getSettings().cues;
    els.cueSettings.innerHTML = "";
    [["frequency", "Freq"], ["meaning", "Mean"], ["readings", "Read"], ["vocab", "Vocab"]].forEach(function (pair) {
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

  // A: marker for archaic/variant forms that borrow their modern equivalent's meaning.
  function archaicTag(modern) {
    var t = document.createElement("span");
    t.className = "archaic-tag";
    t.textContent = "*archaic";
    if (modern) t.title = "Archaic variant of " + modern + " — shares its meaning.";
    return t;
  }

  function renderCueContent(char) {
    var meta = metaFor(char);
    var settings = Store.getSettings().cues;
    var root = els.cueContent;
    root.innerHTML = "";
    if (!meta) return;

    // Identity-revealing content stays hidden until the character is finished.
    var revealed = !!(task && task.vocabRevealed);

    if (revealed) {
      // Phase 23 B: after drawing, show the typed kanji at the top in the same
      // compact "一 — one" style as the Browse header (the char is the answer,
      // so it only appears post-draw).
      var head = document.createElement("div"); head.className = "info-head";
      var ch = document.createElement("div"); ch.className = "info-char"; ch.textContent = meta.char;
      head.appendChild(ch);
      if (settings.meaning !== false) {
        var dash = document.createElement("span"); dash.className = "info-dash"; dash.setAttribute("aria-hidden", "true"); dash.textContent = "—";
        var mn = document.createElement("div"); mn.className = "info-meaning"; mn.textContent = meta.meaning;
        if (meta.archaic) mn.appendChild(archaicTag(meta.modern));
        head.appendChild(dash); head.appendChild(mn);
      }
      root.appendChild(head);
    } else if (settings.meaning !== false) {
      // Before drawing: meaning only (Phase 22 C — no "MEANING" header).
      var mb = document.createElement("div"); mb.className = "cue-block";
      var mv = document.createElement("div");
      mv.className = "cue-value";
      mv.textContent = meta.meaning;
      if (meta.archaic) mv.appendChild(archaicTag(meta.modern));
      mb.appendChild(mv);
      root.appendChild(mb);
    }

    if (settings.readings !== false) {
      // E: same labelled On/Kun rows as Browse (音（おん）/訓（くん）).
      // Phase 22 C: no "READINGS" header — the 音/訓 row labels are enough.
      // Phase 35 (P3): rare readings render muted (common-first order + onc/kunc).
      var rb = document.createElement("div"); rb.className = "cue-block";
      var dl = document.createElement("dl"); dl.className = "readings";
      var dtOn = document.createElement("dt"); dtOn.textContent = "音（おん）";
      var ddOn = document.createElement("dd");
      window.__fillReadings(ddOn, (meta.on || []).map(kataToHira), meta.onc, true);
      var dtKun = document.createElement("dt"); dtKun.textContent = "訓（くん）";
      var ddKun = document.createElement("dd");
      window.__fillReadings(ddKun, meta.kun || [], meta.kunc, true);
      dl.appendChild(dtOn); dl.appendChild(ddOn); dl.appendChild(dtKun); dl.appendChild(ddKun);
      rb.appendChild(dl);
      root.appendChild(rb);
    }

    // F/Phase 32 B: compact paired metadata — Freq|JLPT, Strokes|Radical,
    // Variants|Versions. Identity-revealing fields (Radical, Variants, Versions)
    // stay blank until post-draw.
    var radInfo = radicalOf(meta.char);
    var metaBox = document.createElement("div"); metaBox.className = "info-meta cue-meta";
    function imField(k, v, hidden, vClass) {
      var f = document.createElement("div"); f.className = "im-field";
      var ks = document.createElement("span"); ks.className = "im-k"; ks.textContent = k;
      var vs = document.createElement("span"); vs.className = "im-v" + (vClass && !hidden ? " " + vClass : "");
      vs.textContent = hidden ? "—" : v;
      f.appendChild(ks); f.appendChild(vs); return f;
    }
    function imRow(fields) { var r = document.createElement("div"); r.className = "im-row"; fields.forEach(function (f) { r.appendChild(f); }); return r; }
    var freqVal = (settings.frequency !== false && meta.freq && meta.freq < 99999) ? ("#" + meta.freq) : "—";
    var jlptVal = meta.jlpt ? ("N" + meta.jlpt) : "—";
    metaBox.appendChild(imRow([imField("Freq", freqVal), imField("JLPT", jlptVal)]));
    var radVal = radInfo ? (radInfo.char + (radInfo.name ? "（" + radInfo.name + "）" : "")) : "—";
    metaBox.appendChild(imRow([imField("Strokes", String(meta.strokeCount || "—")), imField("Radical", radVal, !revealed, "radical-reveal")]));
    var vars = (window.KANJI_VARIANTS || {})[meta.char];
    var varVal = vars && vars.length ? vars.map(function (v) { return v.char; }).join("、") : "—";
    // Versions (Phase 32 B): tappable reference chips, display-only; hidden pre-draw.
    var verField = document.createElement("div"); verField.className = "im-field";
    var verK = document.createElement("span"); verK.className = "im-k"; verK.textContent = "Versions";
    var verV = document.createElement("span"); verV.className = "im-v";
    if (!revealed) verV.textContent = "—";
    else if (window.Versions) window.Versions.fill(verV, meta.char);
    else verV.textContent = "—";
    verField.appendChild(verK); verField.appendChild(verV);
    metaBox.appendChild(imRow([imField("Variants", varVal, !revealed), verField]));
    root.appendChild(metaBox);

    if (settings.vocab !== false && meta.vocab && meta.vocab.length) {
      var vb = block("Vocabulary" + (revealed ? " (written form)" : ""));
      var lg = document.createElement("span"); lg.className = "rare-legend"; lg.textContent = "faded = less common";
      vb.querySelector(".cue-label").appendChild(lg);
      // C3: fixed-height scrollable box; E: words laid out as a compact grid.
      var vsc = document.createElement("div"); vsc.className = "vocab-scroll";
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
        vsc.appendChild(rh);
        var grid = document.createElement("div"); grid.className = "vocab-grid";
        groups[reading].forEach(function (w) { grid.appendChild(vocabItem(w)); });
        vsc.appendChild(grid);
      });
      vb.appendChild(vsc);
      root.appendChild(vb);
    }
  }

  function readingText(w) { return w.r.map(function (s) { return s.t; }).join(""); }

  // C1/C2: a transient floating tooltip (the body-level tip element, so it isn't
  // clipped by the scrollable vocab box) shown on hover and on tap; tap also plays
  // audio. No permanent inline gloss, no persistent audio icon.
  var vtipTimer = null;
  function showVocabTip(text, btn) {
    var t = ensureTip(); t.textContent = text; t.hidden = false;
    var r = btn.getBoundingClientRect();
    t.style.left = Math.round(r.left) + "px";
    t.style.top = Math.round(r.bottom + 4) + "px";
  }

  // E: returns a compact word chip (sits in a .vocab-grid), with the Phase 14
  // tap/hover tooltip + audio behaviour.
  function vocabItem(w) {
    var revealed = task && task.vocabRevealed;
    var btn = document.createElement("button");
    btn.type = "button"; btn.className = "vocab-word" + (revealed ? " vocab-jp" : "") + (w.c ? "" : " vocab-rare");
    if (!w.c) btn.title = "Less common word";
    if (revealed) {
      btn.textContent = w.jp;                         // written (kanji) form
    } else {
      w.r.forEach(function (seg) {                     // hiragana, target portion bold
        var span = document.createElement("span");
        span.textContent = seg.t;
        if (seg.b) span.className = "vocab-target";
        btn.appendChild(span);
      });
    }
    var tipText = revealed ? (readingText(w) + " — " + w.en) : w.en;
    btn.addEventListener("mouseenter", function () { clearTimeout(vtipTimer); showVocabTip(tipText, btn); });
    btn.addEventListener("mouseleave", function () { hideTip(); });
    btn.addEventListener("click", function () {
      clearTimeout(vtipTimer);
      showVocabTip(tipText, btn);
      if (window.Speak) window.Speak.speak(w.jp);     // tap also plays audio
      vtipTimer = setTimeout(hideTip, 3000);          // auto-hide (for touch)
    });
    return btn;
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
  var compTipTimer = null;      // auto-hide timer for tap-shown component tips
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
  function clearHighlights() { clearTimeout(compTipTimer); var ov = els.target.querySelector(".hl-overlay"); if (ov) ov.parentNode.removeChild(ov); hideTip(); }

  function ovPath(d, fill, hit) {
    var pth = document.createElementNS(SVGNS, "path");
    pth.setAttribute("d", d); pth.setAttribute("fill", fill);
    if (hit) { pth.style.pointerEvents = "all"; pth.style.cursor = "help"; }
    else { pth.style.pointerEvents = "none"; }
    return pth;
  }

  // Wire a component's hit regions for hover (desktop) and tap (mouse + touch).
  // Phase 24: a tap on a component shows its info and MUST NOT bubble up to the
  // draw-area tap-to-pause/advance handler — so component tap and pause/advance
  // are mutually exclusive. Blank-canvas taps still reach the pause handler.
  function wireComponentHits(hit, tipHtml) {
    function on() { hit.forEach(function (z) { z.setAttribute("fill", HOVER_COLOR); }); }
    function off() { hit.forEach(function (z) { z.setAttribute("fill", "transparent"); }); }
    function pointOf(e) {
      var t = e.changedTouches && e.changedTouches[0];
      return t ? { x: t.clientX, y: t.clientY } : { x: e.clientX, y: e.clientY };
    }
    function tap(e) {
      e.stopPropagation();                                   // beat the pause/advance handler
      if (e.type === "touchend" && e.cancelable) e.preventDefault();  // no ghost click
      on();
      var p = pointOf(e);
      showTip(tipHtml, p.x, p.y);
      clearTimeout(compTipTimer);
      compTipTimer = setTimeout(function () { off(); hideTip(); }, 3000);  // auto-hide (touch)
    }
    hit.forEach(function (q) {
      q.addEventListener("mouseenter", function (e) { on(); showTip(tipHtml, e.clientX, e.clientY); });
      q.addEventListener("mousemove", function (e) { moveTip(e.clientX, e.clientY); });
      q.addEventListener("mouseleave", function () { off(); hideTip(); });
      q.addEventListener("click", tap);
      q.addEventListener("touchend", tap, { passive: false });
    });
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
      wireComponentHits(hit, tip);
    });
    g.appendChild(ov);
  }

  // Phase 19: reusable component-only hover for any HanziWriter target (e.g. Browse).
  // Same component hit-regions + tooltip as Study, but NO radical highlight (per scope).
  // `sd` is the kanji's stroke data (the data/kanji/<char>.json object).
  function componentHover(targetEl, char, sd, attempt) {
    var data = componentsOf(char);
    if (!targetEl || !data || !sd || !sd.strokes) return;
    var g = targetEl.querySelector("svg > g");
    if (!g) { if ((attempt || 0) < 20) requestAnimationFrame(function () { componentHover(targetEl, char, sd, (attempt || 0) + 1); }); return; }
    var old = targetEl.querySelector(".hl-overlay"); if (old) old.parentNode.removeChild(old);
    var ov = document.createElementNS(SVGNS, "g"); ov.setAttribute("class", "hl-overlay");
    (data.components || []).forEach(function (cmp) {
      var hit = [];
      cmp.strokes.forEach(function (i) { if (sd.strokes[i]) { var pp = ovPath(sd.strokes[i], "transparent", true); ov.appendChild(pp); hit.push(pp); } });
      var tip = "<strong>" + cmp.char + "</strong>" + (cmp.meaning ? " — " + cmp.meaning : "") +
                (cmp.readings && cmp.readings.length ? "<br>" + cmp.readings.join("、") : "");
      wireComponentHits(hit, tip);
    });
    g.appendChild(ov);
  }

  // F: size the canvas to the (responsive) box so the reduced border/padding gives
  // a bigger drawable area, especially on phone widths.
  function measureSize() {
    var w = els.target.getBoundingClientRect().width;
    return w >= 200 ? Math.round(w) : SIZE;
  }

  // ===== writer + quiz =====
  function buildWriter(char, level) {
    els.target.innerHTML = "";
    var size = measureSize();
    writer = HanziWriter.create(els.target, char, {
      width: size, height: size, padding: PAD,
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
        // Phase 28: classify the stroke just completed. mistakesOnStroke counts wrong
        // attempts before it went in: 0 = first try, 1 = one redo, >=2 = needed the hint.
        var m = (info && info.mistakesOnStroke) || 0;
        if (m >= 2) misses++; else if (m === 1) redos++;
        var nextStroke = info.strokeNum + 1;
        if (level === "guided" && info.strokesRemaining > 0) writer.highlightStroke(nextStroke);
        if (level === "start") showStartMarker(nextStroke);
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
    // Phase 28: rating from the stroke-level miss/redo counts (giving up = Again).
    var strokeCount = strokeData && strokeData.strokes ? strokeData.strokes.length : ((metaFor(t.char) || {}).strokeCount || 0);
    var rating = gaveUp ? "again" : ratingFromStrokes(misses, redos, strokeCount);
    t._misses = misses; t._redos = redos; t._gaveUp = gaveUp;
    t._computedRating = rating;
    var pass = isPass(rating);
    t._success = pass;   // legacy field still read by the session flow

    // Reveal vocab written form + readings + meaning, and the radical (D4/D5).
    t.vocabRevealed = true;
    renderCueContent(t.char);
    applyHighlights(t.char);   // colour the radical + enable component hover (C2/C3)

    // Fail = Hard or Again (Phase 28 C). A failed review reveals the character.
    var isReviewFail = (t.kind === "review" && !pass);
    if (isReviewFail && writer) writer.showCharacter();

    showResult(rating);   // ✓ for Easy/Good, ✗ for Hard/Again

    if (isReviewFail) {
      // Phase 34 (1a): optional one-tap "did you mix this up?" prompt. Only for
      // failed reviews, which always hold — so it never delays auto-advance.
      renderConfusionPrompt(t);
      // Hold here; the review must not auto-progress past a failed character (B2.2).
      armTap();
    } else {
      // Cancelable auto-advance (B5) — correct answers, learn steps, scaffolding.
      startAutoAdvance();
    }
  }

  var tapArmTime = 0;
  // Ignore taps that land within 300ms of arming — that's the completing
  // stroke's own mouseup/touchend, not a deliberate tap by the user.
  function freshTap() { return Date.now() - tapArmTime >= 300; }

  // I: bind a tap handler for BOTH mouse and touch. On phones HanziWriter
  // consumes the touch sequence, so the synthetic `click` often never fires —
  // we listen for `touchend` directly and preventDefault to suppress the ghost
  // click (so the handler runs exactly once per tap).
  function bindTap(fn) {
    disarmTap();
    tapHandler = function (e) {
      if (e && e.type === "touchend" && e.cancelable) e.preventDefault();
      fn();
    };
    els.target.addEventListener("click", tapHandler);
    els.target.addEventListener("touchend", tapHandler, { passive: false });
  }
  function disarmTap() {
    if (tapHandler) {
      els.target.removeEventListener("click", tapHandler);
      els.target.removeEventListener("touchend", tapHandler);
      tapHandler = null;
    }
  }

  function startAutoAdvance() {
    setPrompt("Moving on… (tap to pause)");
    advanceTimer = setTimeout(function () { advance(); }, AUTO_ADVANCE_MS);
    if (els.prior) els.prior.disabled = true;   // D: disabled during the countdown
    tapArmTime = Date.now();
    // Tapping during the window cancels auto-advance and holds for an explicit tap (B5).
    bindTap(function () {
      if (!freshTap()) return;
      if (advanceTimer) {
        clearTimeout(advanceTimer); advanceTimer = null;
        setPrompt("Paused — tap the character to continue.");
        armTap();
      }
    });
  }

  function armTap() {
    tapArmTime = Date.now();
    bindTap(function () { if (freshTap()) advance(); });
    if (els.prior) els.prior.disabled = !prevChar || inPrior;  // D: re-enabled when countdown cancelled / held
  }

  function advance() {
    if (advancing) return;
    advancing = true;
    disarmTap();
    var t = task; task = null;
    prevChar = t.char;   // D: this character becomes the "prior" for the next one
    // Phase 25/28: FSRS records whatever the badge implies *now* (on advance): the
    // computed rating, or Easy/Again if the user overrode it. success drives the
    // failure flow + results score, so both follow the badge state too.
    t.onDone(resultForAdvance(t));
  }

  function resultForAdvance(t) {
    var rating = effectiveRating() || t._computedRating || "again";
    return {
      completed: done,
      success: isPass(rating),
      rating: rating,
      misses: t._misses || 0,
      redos: t._redos || 0,
      mistakes: t._misses || 0,   // difficulty stats key on this count
      gaveUp: !!t._gaveUp,
      skipped: false,
    };
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
    // `done` guard (Phase 29 audit): once the character is finished the attempt is
    // already graded — skipping then would discard the computed rating and record
    // a skip (Again) instead. Same guard as onReveal.
    if (inPrior || !task || done) return;
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
    var size = measureSize();
    writer = HanziWriter.create(els.target, char, {
      width: size, height: size, padding: PAD, showCharacter: true, showOutline: false,
      strokeColor: "#1f2933", charDataLoader: function (c, cb) { cb(data); },
    });
    applyHighlights(char);
  }
  function onPrior() {
    if (inPrior || !prevChar || (els.prior && els.prior.disabled)) return;
    inPrior = true;
    priorSaved = { task: task, done: done, strokeData: strokeData,
                   misses: misses, redos: redos, computedRating: computedRating, flipped: flipped,
                   stepLabel: els.stepLabel.textContent, progressLabel: els.progressLabel.textContent };
    if (advanceTimer) { clearTimeout(advanceTimer); advanceTimer = null; }
    disarmTap();
    if (writer) { try { writer.cancelQuiz(); } catch (e) {} }
    if (els.prior) els.prior.disabled = true;
    els.stepLabel.textContent = "◀ Previous kanji";
    clearBadge(); clearConfusionPrompt();
    task = { char: prevChar, vocabRevealed: true };   // stub so cues render fully
    renderCuePanel(prevChar);
    var pc = prevChar;
    fetchStrokeData(pc).then(function (data) {
      if (!inPrior) return;
      strokeData = data;
      buildReadOnly(pc, data);
    });
    bindTap(function () { exitPriorView(); });
  }
  function exitPriorView() {
    if (!inPrior) return;
    inPrior = false;
    disarmTap();
    var s = priorSaved; priorSaved = null;
    task = s.task; done = s.done; strokeData = s.strokeData;
    misses = s.misses; redos = s.redos;
    els.stepLabel.textContent = s.stepLabel;
    els.progressLabel.textContent = s.progressLabel;
    renderCuePanel(task.char);
    if (done) {
      // current was completed and held — re-render completed and re-arm tap-to-continue.
      // Restore the badge exactly as the user left it (they may have toggled it).
      buildReadOnly(task.char, strokeData);
      computedRating = s.computedRating; flipped = s.flipped; renderBadge();
      // restore the confusion prompt if this was a held failed review (Phase 34)
      var er = effectiveRating();
      if (task.kind === "review" && er && !isPass(er)) renderConfusionPrompt(task);
      armTap();
    } else {
      // current not yet drawn — resume the quiz fresh
      misses = 0; redos = 0;
      buildWriter(task.char, task.level);
      startQuiz(task.level);
      if (els.prior) els.prior.disabled = !prevChar;
    }
  }

  // ===== public: run one task =====
  // task = { char, level, scaffold, modeLabel, stepLabel, progressLabel, onDone }
  function run(t) {
    task = t;
    done = false; advancing = false; task.vocabRevealed = false;
    misses = 0; redos = 0;              // Phase 28: fresh stroke-grade counters
    if (advanceTimer) { clearTimeout(advanceTimer); advanceTimer = null; }
    disarmTap(); clearHighlights(); clearConfusionPrompt();
    els.modeLabel.textContent = t.modeLabel || "";
    els.stepLabel.textContent = t.stepLabel || "";
    els.progressLabel.textContent = t.progressLabel || "";
    clearBadge();                       // no result yet
    renderCuePanel(t.char);
    if (els.prior) els.prior.disabled = !prevChar;  // D: enabled if there is a previous character

    fetchStrokeData(t.char).then(function (data) {
      strokeData = data;
      buildWriter(t.char, t.level);
      startQuiz(t.level);
    }).catch(function () {
      // No on-screen status text (Phase 23 A); log for diagnosis. Won't occur
      // on a proper host — only when opened from file:// without a server.
      console.error("Couldn't load stroke data for", t.char, "— run via a local server (see README).");
    });
  }

  // Abort the current task without advancing (used by the back button).
  function stop() {
    if (advanceTimer) { clearTimeout(advanceTimer); advanceTimer = null; }
    disarmTap(); clearConfusionPrompt();
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
    if (els.status) {
      els.status.addEventListener("click", toggleBadge);
      els.status.addEventListener("touchend", toggleBadge, { passive: false });
    }
  }

  return { init: init, run: run, stop: stop, componentHover: componentHover };
})();
