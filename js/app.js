/*
 * app.js — screen router + the three modes (Browse / Learn / Quiz).
 *
 * Screens are plain <section> elements; we toggle which one is visible. The
 * "draw a character" work lives in drawscreen.js; the Quiz and Learn controllers
 * here build a queue of tasks (each a character + reveal level) and feed them in.
 */
(function () {
  "use strict";

  var META = window.KANJI_META || [];
  var $ = function (id) { return document.getElementById(id); };
  var allChars = function () { return META.map(function (m) { return m.char; }); };
  var metaOf = function (c) { return META.filter(function (m) { return m.char === c; })[0]; };

  var STEP = {
    1: { level: "guided", name: "Guided" },
    2: { level: "order", name: "Order recall" },
    3: { level: "start", name: "Start points" },
    4: { level: "blind", name: "Free recall" },
  };

  // ---- screen router ----
  var screens = {};
  function registerScreens() {
    Array.prototype.forEach.call(document.querySelectorAll(".screen"), function (s) { screens[s.id] = s; });
  }
  function show(id) {
    Object.keys(screens).forEach(function (k) { screens[k].classList.toggle("active", k === id); });
    window.scrollTo(0, 0);
  }

  // ===================================================================
  // HOME
  // ===================================================================
  function renderHome() {
    var c = Store.counts();
    $("home-counts").textContent = c.new + " new · " + c.learning + " learning · " + c.review + " in review";
    var due = Scheduler.dueChars();
    $("home-due").textContent = due.length
      ? "🔔 " + due.length + " character" + (due.length === 1 ? "" : "s") + " due for review"
      : "";
  }

  // ===================================================================
  // BROWSE
  // ===================================================================
  var browseWriter = null, browseChar = null;
  function buildBrowsePicker() {
    var picker = $("browse-picker");
    picker.innerHTML = "";
    META.forEach(function (m) {
      var chip = document.createElement("button");
      chip.type = "button"; chip.className = "kanji-chip"; chip.textContent = m.char; chip.dataset.char = m.char;
      chip.addEventListener("click", function () { browseSelect(m.char); });
      picker.appendChild(chip);
    });
  }
  function browseSelect(char) {
    browseChar = char;
    var meta = metaOf(char);
    Array.prototype.forEach.call($("browse-picker").children, function (chip) {
      chip.classList.toggle("active", chip.dataset.char === char);
    });
    $("browse-char").textContent = char;
    $("browse-meaning").textContent = meta.meaning;
    $("browse-on").textContent = meta.on.join("、");
    $("browse-kun").textContent = meta.kun.join("、");
    $("browse-strokes").textContent = meta.strokeCount;
    $("browse-freq").textContent = "#" + meta.freq;
    $("browse-target").innerHTML = "";
    browseWriter = HanziWriter.create($("browse-target"), char, {
      width: 300, height: 300, padding: 5, showCharacter: true, showOutline: true,
      strokeColor: "#1f2933", outlineColor: "#e2e6ea",
      charDataLoader: function (c, done) { fetch("data/kanji/" + encodeURIComponent(c) + ".json").then(function (r) { return r.json(); }).then(done); },
    });
  }
  function browseAnimate() { if (browseWriter) browseWriter.animateCharacter(); }
  function browseReset() { if (browseChar) browseSelect(browseChar); }
  function browseRandom() {
    var pick; do { pick = META[Math.floor(Math.random() * META.length)].char; } while (META.length > 1 && pick === browseChar);
    browseSelect(pick);
  }

  // ===================================================================
  // QUIZ — selection + filters + session
  // ===================================================================
  var quizSelected = {};

  function buildQuizGrid() {
    var grid = $("quiz-grid");
    grid.innerHTML = "";
    META.forEach(function (m) {
      var chip = document.createElement("button");
      chip.type = "button"; chip.className = "select-chip"; chip.textContent = m.char; chip.dataset.char = m.char;
      chip.addEventListener("click", function () {
        quizSelected[m.char] = !quizSelected[m.char];
        chip.classList.toggle("selected", quizSelected[m.char]);
        updateQuizStart();
      });
      grid.appendChild(chip);
    });
  }
  function refreshQuizGrid() {
    Array.prototype.forEach.call($("quiz-grid").children, function (chip) {
      chip.classList.toggle("selected", !!quizSelected[chip.dataset.char]);
    });
    updateQuizStart();
  }
  function selectedQuizChars() { return allChars().filter(function (c) { return quizSelected[c]; }); }
  function updateQuizStart() {
    var n = selectedQuizChars().length;
    $("quiz-count").textContent = n + " selected";
    $("quiz-start").disabled = n === 0;
  }

  function buildFilterRows() {
    var wrap = $("filter-rows");
    wrap.innerHTML = "";
    Object.keys(Filters.DEFS).forEach(function (id) {
      var def = Filters.DEFS[id];
      var row = document.createElement("div");
      row.className = "filter-row";
      var lab = document.createElement("label");
      lab.textContent = def.label;
      var sel = document.createElement("select");
      sel.className = "select-input"; sel.dataset.filter = id;
      var any = document.createElement("option"); any.value = ""; any.textContent = "— any —"; sel.appendChild(any);
      def.options().forEach(function (o) {
        var opt = document.createElement("option"); opt.value = o.value; opt.textContent = o.label; sel.appendChild(opt);
      });
      row.appendChild(lab); row.appendChild(sel);
      wrap.appendChild(row);
    });
  }
  function activeFilters() {
    return Array.prototype.map.call($("filter-rows").querySelectorAll("select"), function (sel) {
      return { id: sel.dataset.filter, value: sel.value };
    }).filter(function (f) { return f.value !== ""; });
  }
  function applyFilters() {
    var active = activeFilters();
    var matched = active.length ? Filters.apply(active) : [];
    quizSelected = {};
    matched.forEach(function (c) { quizSelected[c] = true; });
    refreshQuizGrid();
    $("filter-match").textContent = active.length ? (matched.length + " match") : "no filters set";
  }
  function resetFilters() {
    Array.prototype.forEach.call($("filter-rows").querySelectorAll("select"), function (s) { s.value = ""; });
    $("filter-match").textContent = "";
  }
  function buildSortOptions() {
    var sel = $("quiz-sort");
    sel.innerHTML = "";
    Object.keys(Filters.SORTS).forEach(function (id) {
      var o = document.createElement("option"); o.value = id; o.textContent = Filters.SORTS[id].label; sel.appendChild(o);
    });
  }
  function renderDueBanner() {
    var due = Scheduler.dueChars();
    var b = $("quiz-due-banner");
    b.innerHTML = "";
    if (due.length) {
      var span = document.createElement("span");
      span.textContent = "🔔 " + due.length + " due for review: " + due.join(" ");
      var btn = document.createElement("button");
      btn.type = "button"; btn.className = "btn btn-primary btn-small"; btn.textContent = "Add due to selection";
      btn.addEventListener("click", function () {
        due.forEach(function (c) { quizSelected[c] = true; }); refreshQuizGrid();
      });
      b.appendChild(span); b.appendChild(btn);
    } else {
      b.textContent = "No characters are due for review right now.";
    }
  }
  function openQuiz() {
    buildQuizGrid();
    buildFilterRows();
    buildSortOptions();
    resetFilters();
    quizSelected = {};
    $("quiz-random").checked = false;
    renderDueBanner();
    refreshQuizGrid();
    show("screen-quiz-select");
  }

  function startQuizSession() {
    var chars = selectedQuizChars();
    if (!chars.length) return;
    var ordered = $("quiz-random").checked ? Filters.shuffle(chars) : Filters.sortChars(chars, $("quiz-sort").value);
    var tasks = ordered.map(function (c) { return { char: c, level: "blind", scaffold: false, kind: "quiz" }; });
    runSession({
      tasks: tasks,
      modeLabel: "Quiz",
      labelFor: function () { return ""; },
      onTaskDone: function (t, r) { Scheduler.recordReview(t.char, r.success, r.mistakes); },
      onFinish: function (stats) { showDone("Quiz complete", stats, "screen-home"); },
    });
  }

  // ===================================================================
  // LEARN — count mode + manual mode
  // ===================================================================
  var learnManualSel = {};

  function currentLearnMode() {
    var checked = document.querySelector('input[name="learn-mode"]:checked');
    return checked ? checked.value : "count";
  }
  function syncLearnPanes() {
    var manual = currentLearnMode() === "manual";
    $("learn-count-pane").hidden = manual;
    $("learn-manual-pane").hidden = !manual;
  }

  function buildLearnCount() {
    var avail = Store.nextNewChars(999);
    $("learn-available").textContent = avail.length;
    var sel = $("learn-count");
    sel.innerHTML = "";
    var maxN = Math.min(15, Math.max(1, avail.length));
    var options = [1, 2, 3, 5, 8, 10, 12, 15].filter(function (n) { return n <= maxN; });
    if (!options.length) options = [maxN];
    if (options[options.length - 1] < maxN) options.push(maxN); // always allow picking all available
    options.forEach(function (n) {
      var o = document.createElement("option"); o.value = n; o.textContent = n + (n === 1 ? " character" : " characters"); sel.appendChild(o);
    });
    updateLearnPreview();
    sel.onchange = updateLearnPreview;
    $("learn-start").disabled = avail.length === 0 && currentLearnMode() === "count";
  }
  function updateLearnPreview() {
    var avail = Store.nextNewChars(999);
    $("learn-preview").textContent = avail.length
      ? "Next up: " + Store.nextNewChars(parseInt($("learn-count").value, 10)).join(" ")
      : "Nothing new to learn right now.";
  }

  function buildLearnManual() {
    learnManualSel = {};
    var grid = $("learn-manual-grid");
    grid.innerHTML = "";
    META.forEach(function (m) {
      var chip = document.createElement("button");
      chip.type = "button"; chip.className = "select-chip"; chip.dataset.char = m.char;
      var status = Store.getProgress(m.char).status;
      chip.textContent = m.char;
      var tag = document.createElement("span");
      tag.className = "chip-tag chip-" + status;
      tag.textContent = status === "review" ? "review" : status === "learning" ? "learning" : "new";
      chip.appendChild(tag);
      chip.addEventListener("click", function () {
        learnManualSel[m.char] = !learnManualSel[m.char];
        chip.classList.toggle("selected", learnManualSel[m.char]);
        $("learn-manual-count").textContent = Object.keys(learnManualSel).filter(function (k) { return learnManualSel[k]; }).length + " selected";
      });
      grid.appendChild(chip);
    });
    $("learn-manual-count").textContent = "0 selected";
  }

  function openLearn() {
    buildLearnCount();
    buildLearnManual();
    syncLearnPanes();
    show("screen-learn-setup");
  }

  // Count mode: next N new chars, step-major interleave (step1 of all, then step2…).
  function startLearnCount() {
    var n = parseInt($("learn-count").value, 10) || 1;
    var chars = Store.nextNewChars(n);
    if (!chars.length) return;
    var tasks = [];
    [1, 2, 3, 4].forEach(function (step) {
      chars.forEach(function (c) {
        tasks.push({ char: c, level: STEP[step].level, scaffold: true, kind: "scaffold", step: step, stepName: STEP[step].name });
      });
    });
    runLearnSession(tasks);
  }

  // Manual mode: new/learning chars get (remaining) scaffold steps; review-pool
  // chars get a single review task; everything interleaved by round.
  function startLearnManual() {
    var chars = allChars().filter(function (c) { return learnManualSel[c]; });
    if (!chars.length) return;
    var rounds = 4;
    var scaffoldTasks = [], reviewTasks = [];
    chars.forEach(function (c) {
      var p = Store.getProgress(c);
      if (p.status === "review") {
        reviewTasks.push({ char: c, level: "blind", scaffold: false, kind: "review", round: Math.floor(Math.random() * rounds) });
      } else {
        var start = (p.status === "learning" ? (p.learnStep || 0) : 0) + 1;
        for (var s = start; s <= 4; s++) {
          scaffoldTasks.push({ char: c, level: STEP[s].level, scaffold: true, kind: "scaffold", step: s, stepName: STEP[s].name, round: s - 1 });
        }
      }
    });
    var byRound = [];
    for (var r = 0; r < rounds; r++) byRound.push([]);
    scaffoldTasks.concat(reviewTasks).forEach(function (t) { byRound[t.round].push(t); });
    var tasks = [];
    byRound.forEach(function (group) { tasks = tasks.concat(Filters.shuffle(group)); });
    runLearnSession(tasks);
  }

  function runLearnSession(tasks) {
    runSession({
      tasks: tasks,
      modeLabel: "Learn",
      labelFor: function (t) { return t.kind === "review" ? "Review" : "Step " + t.step + "/4 · " + t.stepName; },
      onTaskDone: function (t, r) {
        if (t.kind === "review") {
          Scheduler.recordReview(t.char, r.success, r.mistakes);
          return;
        }
        // scaffolding task
        if (t.step < 4) {
          if (!r.skipped) Store.recordLearnStep(t.char, t.step);
        } else if (r.completed && !r.gaveUp) {
          Store.graduate(t.char);
          Scheduler.onGraduate(t.char);
        }
      },
      onFinish: function (stats) {
        var grad = Store.reviewPool();
        showDone("Session complete", stats, "screen-home",
          grad.length ? ("In your review pool: " + grad.join(" ")) : "");
      },
    });
  }

  // ===================================================================
  // Shared session runner
  // ===================================================================
  function runSession(cfg) {
    var i = 0;
    var stats = { total: cfg.tasks.length, success: 0, completed: 0, skipped: 0 };
    function next() {
      if (i >= cfg.tasks.length) { cfg.onFinish(stats); return; }
      var t = cfg.tasks[i];
      show("screen-draw");
      DrawScreen.run({
        char: t.char,
        level: t.level,
        scaffold: t.scaffold,
        modeLabel: cfg.modeLabel,
        stepLabel: cfg.labelFor(t),
        progressLabel: (i + 1) + " / " + cfg.tasks.length,
        onDone: function (result) {
          if (result.success) stats.success++;
          if (result.completed) stats.completed++;
          if (result.skipped) stats.skipped++;
          if (cfg.onTaskDone) cfg.onTaskDone(t, result);
          i++; next();
        },
      });
    }
    next();
  }

  function showDone(title, stats, backScreenId, extraNote) {
    $("done-title").textContent = title;
    $("done-summary").textContent =
      stats.success + " of " + stats.total + " written cleanly" +
      (stats.skipped ? " · " + stats.skipped + " skipped" : "");
    $("done-extra").textContent = extraNote || "";
    $("done-back").onclick = function () { renderHome(); show(backScreenId || "screen-home"); };
    show("screen-done");
  }

  // ===================================================================
  // wiring
  // ===================================================================
  function init() {
    if (typeof HanziWriter === "undefined") {
      document.body.insertAdjacentHTML("afterbegin", '<p style="color:#d6453d;text-align:center">HanziWriter failed to load.</p>');
      return;
    }
    registerScreens();
    DrawScreen.init({
      target: $("draw-target"), cueSettings: $("cue-settings"), cueContent: $("cue-content"),
      prompt: $("draw-prompt"), status: $("draw-status"),
      modeLabel: $("draw-mode"), stepLabel: $("draw-step"), progressLabel: $("draw-progress"),
      reveal: $("draw-reveal"), skip: $("draw-skip"),
    });

    $("nav-browse").addEventListener("click", function () { buildBrowsePicker(); browseSelect(META[0].char); show("screen-browse"); });
    $("nav-learn").addEventListener("click", openLearn);
    $("nav-quiz").addEventListener("click", openQuiz);
    $("reset-progress").addEventListener("click", function () {
      if (confirm("Reset all learning progress on this device?")) { Store.resetAll(); renderHome(); }
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-home]"), function (b) {
      b.addEventListener("click", function () { renderHome(); show("screen-home"); });
    });

    $("browse-animate").addEventListener("click", browseAnimate);
    $("browse-reset").addEventListener("click", browseReset);
    $("browse-random").addEventListener("click", browseRandom);

    $("filter-apply").addEventListener("click", applyFilters);
    $("filter-reset").addEventListener("click", function () { resetFilters(); quizSelected = {}; refreshQuizGrid(); });
    $("quiz-all").addEventListener("click", function () { allChars().forEach(function (c) { quizSelected[c] = true; }); refreshQuizGrid(); });
    $("quiz-clear").addEventListener("click", function () { quizSelected = {}; refreshQuizGrid(); });
    $("quiz-start").addEventListener("click", startQuizSession);

    Array.prototype.forEach.call(document.querySelectorAll('input[name="learn-mode"]'), function (r) {
      r.addEventListener("change", function () { syncLearnPanes(); buildLearnCount(); });
    });
    $("learn-start").addEventListener("click", function () {
      if (currentLearnMode() === "manual") startLearnManual(); else startLearnCount();
    });

    renderHome();
    show("screen-home");
  }

  document.addEventListener("DOMContentLoaded", init);
})();
