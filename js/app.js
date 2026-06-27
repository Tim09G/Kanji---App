/*
 * app.js — screen router + the three modes (Browse / Learn / Quiz).
 *
 * Screens are plain <section> elements; we just toggle which one is visible.
 * The actual "draw a character" work lives in drawscreen.js; the Quiz and
 * Learn controllers here just build a queue of characters and feed them in.
 */
(function () {
  "use strict";

  var META = window.KANJI_META || [];
  var $ = function (id) { return document.getElementById(id); };

  // ---- screen router ----
  var screens = {};
  function registerScreens() {
    Array.prototype.forEach.call(document.querySelectorAll(".screen"), function (s) {
      screens[s.id] = s;
    });
  }
  function show(id) {
    Object.keys(screens).forEach(function (k) {
      screens[k].classList.toggle("active", k === id);
    });
    window.scrollTo(0, 0);
  }

  // ===================================================================
  // HOME
  // ===================================================================
  function renderHome() {
    var c = Store.counts();
    $("home-counts").textContent =
      c.new + " new · " + c.learning + " learning · " + c.review + " in review";
  }

  // ===================================================================
  // BROWSE (study / look at stroke order — kanji is shown here on purpose)
  // ===================================================================
  var browseWriter = null, browseChar = null;

  function buildBrowsePicker() {
    var picker = $("browse-picker");
    picker.innerHTML = "";
    META.forEach(function (m) {
      var chip = document.createElement("button");
      chip.type = "button";
      chip.className = "kanji-chip";
      chip.textContent = m.char;
      chip.dataset.char = m.char;
      chip.addEventListener("click", function () { browseSelect(m.char); });
      picker.appendChild(chip);
    });
  }

  function browseSelect(char) {
    browseChar = char;
    var meta = META.filter(function (m) { return m.char === char; })[0];
    Array.prototype.forEach.call($("browse-picker").children, function (chip) {
      chip.classList.toggle("active", chip.dataset.char === char);
    });
    $("browse-char").textContent = char;
    $("browse-meaning").textContent = meta.meaning;
    $("browse-on").textContent = meta.on.join("、");
    $("browse-kun").textContent = meta.kun.join("、");

    $("browse-target").innerHTML = "";
    browseWriter = HanziWriter.create($("browse-target"), char, {
      width: 300, height: 300, padding: 5,
      showCharacter: true, showOutline: true,
      strokeColor: "#1f2933", outlineColor: "#e2e6ea",
      charDataLoader: function (c, done) {
        fetch("data/kanji/" + encodeURIComponent(c) + ".json")
          .then(function (r) { return r.json(); }).then(done);
      },
    });
    fetch("data/kanji/" + encodeURIComponent(char) + ".json")
      .then(function (r) { return r.json(); })
      .then(function (d) { $("browse-strokes").textContent = d.strokes.length; })
      .catch(function () { $("browse-strokes").textContent = "—"; });
  }

  function browseAnimate() { if (browseWriter) browseWriter.animateCharacter(); }
  function browseReset() { if (browseChar) browseSelect(browseChar); }
  function browseRandom() {
    var pick;
    do { pick = META[Math.floor(Math.random() * META.length)].char; }
    while (META.length > 1 && pick === browseChar);
    browseSelect(pick);
  }

  // ===================================================================
  // QUIZ — selection screen + session
  // ===================================================================
  var quizSelected = {};

  function buildQuizSelect() {
    var grid = $("quiz-grid");
    grid.innerHTML = "";
    quizSelected = {};
    META.forEach(function (m) {
      var chip = document.createElement("button");
      chip.type = "button";
      chip.className = "select-chip";
      chip.textContent = m.char;
      chip.dataset.char = m.char;
      chip.addEventListener("click", function () {
        quizSelected[m.char] = !quizSelected[m.char];
        chip.classList.toggle("selected", quizSelected[m.char]);
        updateQuizStart();
      });
      grid.appendChild(chip);
    });
    updateQuizStart();
  }

  function selectedQuizChars() {
    return META.map(function (m) { return m.char; }).filter(function (c) { return quizSelected[c]; });
  }
  function updateQuizStart() {
    var n = selectedQuizChars().length;
    $("quiz-count").textContent = n + " selected";
    $("quiz-start").disabled = n === 0;
  }

  function quizSelectAll() {
    META.forEach(function (m) { quizSelected[m.char] = true; });
    Array.prototype.forEach.call($("quiz-grid").children, function (ch) { ch.classList.add("selected"); });
    updateQuizStart();
  }
  function quizClear() {
    quizSelected = {};
    Array.prototype.forEach.call($("quiz-grid").children, function (ch) { ch.classList.remove("selected"); });
    updateQuizStart();
  }

  function startQuizSession() {
    var chars = selectedQuizChars();
    if (!chars.length) return;
    var tasks = chars.map(function (c) { return { char: c, level: "blind" }; });
    runSession({
      tasks: tasks,
      modeLabel: "Quiz",
      stepLabelFor: function () { return ""; },
      onTaskDone: function () { /* no progress tracking for plain quiz yet */ },
      onFinish: function (stats) { showDone("Quiz complete", stats, null, "screen-home"); },
    });
  }

  // ===================================================================
  // LEARN — setup + interleaved 4-step session
  // ===================================================================
  var LEARN_STEPS = [
    { step: 1, level: "guided", name: "Guided" },
    { step: 2, level: "order",  name: "Order recall" },
    { step: 3, level: "start",  name: "Start points" },
    { step: 4, level: "blind",  name: "Free recall" },
  ];

  function buildLearnSetup() {
    var avail = Store.nextNewChars(999);
    $("learn-available").textContent = avail.length;
    var sel = $("learn-count");
    sel.innerHTML = "";
    var options = [1, 2, 3, 5, 8].filter(function (n) { return n <= Math.max(1, avail.length); });
    if (!options.length) options = [Math.max(1, avail.length)];
    options.forEach(function (n) {
      var o = document.createElement("option");
      o.value = n; o.textContent = n + (n === 1 ? " character" : " characters");
      sel.appendChild(o);
    });
    // preview which chars
    $("learn-preview").textContent = avail.length
      ? "Next up: " + Store.nextNewChars(parseInt(sel.value || options[0], 10)).join(" ")
      : "Nothing new to learn — all characters are already in progress or review.";
    sel.onchange = function () {
      $("learn-preview").textContent = "Next up: " + Store.nextNewChars(parseInt(sel.value, 10)).join(" ");
    };
    $("learn-start").disabled = avail.length === 0;
  }

  function startLearnSession() {
    var n = parseInt($("learn-count").value, 10) || 1;
    var chars = Store.nextNewChars(n);
    if (!chars.length) return;

    // Interleave: do step 1 for every char, then step 2 for every char, etc.
    var tasks = [];
    LEARN_STEPS.forEach(function (s) {
      chars.forEach(function (c) {
        tasks.push({ char: c, level: s.level, step: s.step, stepName: s.name });
      });
    });

    runSession({
      tasks: tasks,
      modeLabel: "Learn",
      stepLabelFor: function (t) { return "Step " + t.step + "/4 · " + t.stepName; },
      onTaskDone: function (t, result) {
        if (result.completed) {
          if (t.step < 4) Store.recordLearnStep(t.char, t.step);
          else Store.graduate(t.char); // step 4 success → into the review pool
        } else if (t.step < 4) {
          // still mark scaffolding steps as seen even if they peeked/skipped
          Store.recordLearnStep(t.char, t.step);
        }
      },
      onFinish: function (stats) {
        var graduated = Store.reviewPool();
        showDone("Learn session complete", stats,
          function () { renderHome(); buildLearnSetup(); },
          "screen-home",
          graduated.length ? ("Graduated into review: " + graduated.join(" ")) : "");
      },
    });
  }

  // ===================================================================
  // Shared session runner: feeds tasks to the draw screen one at a time
  // ===================================================================
  function runSession(cfg) {
    var i = 0;
    var stats = { total: cfg.tasks.length, completed: 0, skipped: 0 };

    function next() {
      if (i >= cfg.tasks.length) { cfg.onFinish(stats); return; }
      var t = cfg.tasks[i];
      show("screen-draw");
      DrawScreen.run({
        char: t.char,
        level: t.level,
        modeLabel: cfg.modeLabel,
        stepLabel: cfg.stepLabelFor(t),
        progressLabel: (i + 1) + " / " + cfg.tasks.length,
        onDone: function (result) {
          if (result.completed) stats.completed++;
          if (result.skipped) stats.skipped++;
          if (cfg.onTaskDone) cfg.onTaskDone(t, result);
          i++;
          next();
        },
      });
    }
    next();
  }

  // Simple completion screen reused by both modes.
  function showDone(title, stats, after, backScreenId, extraNote) {
    $("done-title").textContent = title;
    $("done-summary").textContent =
      stats.completed + " of " + stats.total + " written from memory" +
      (stats.skipped ? " · " + stats.skipped + " skipped" : "");
    $("done-extra").textContent = extraNote || "";
    $("done-back").onclick = function () {
      if (after) after();
      renderHome();
      show(backScreenId || "screen-home");
    };
    show("screen-done");
  }

  // ===================================================================
  // wiring
  // ===================================================================
  function init() {
    if (typeof HanziWriter === "undefined") {
      document.body.insertAdjacentHTML("afterbegin",
        '<p style="color:#d6453d;text-align:center">HanziWriter failed to load.</p>');
      return;
    }
    registerScreens();

    DrawScreen.init({
      target: $("draw-target"),
      cueSettings: $("cue-settings"),
      cueContent: $("cue-content"),
      prompt: $("draw-prompt"),
      status: $("draw-status"),
      modeLabel: $("draw-mode"),
      stepLabel: $("draw-step"),
      progressLabel: $("draw-progress"),
      skip: $("draw-skip"),
      reveal: $("draw-reveal"),
      next: $("draw-next"),
    });

    // Home navigation
    $("nav-browse").addEventListener("click", function () { buildBrowsePicker(); browseSelect(META[0].char); show("screen-browse"); });
    $("nav-learn").addEventListener("click", function () { buildLearnSetup(); show("screen-learn-setup"); });
    $("nav-quiz").addEventListener("click", function () { buildQuizSelect(); show("screen-quiz-select"); });
    $("reset-progress").addEventListener("click", function () {
      if (confirm("Reset all learning progress on this device?")) { Store.resetAll(); renderHome(); }
    });

    // Back buttons
    Array.prototype.forEach.call(document.querySelectorAll("[data-home]"), function (b) {
      b.addEventListener("click", function () { renderHome(); show("screen-home"); });
    });

    // Browse controls
    $("browse-animate").addEventListener("click", browseAnimate);
    $("browse-reset").addEventListener("click", browseReset);
    $("browse-random").addEventListener("click", browseRandom);

    // Quiz controls
    $("quiz-all").addEventListener("click", quizSelectAll);
    $("quiz-clear").addEventListener("click", quizClear);
    $("quiz-start").addEventListener("click", startQuizSession);

    // Learn controls
    $("learn-start").addEventListener("click", startLearnSession);

    renderHome();
    show("screen-home");
  }

  document.addEventListener("DOMContentLoaded", init);
})();
