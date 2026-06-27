/*
 * app.js — screen router + modes (Learn / Review / Browse / Settings).
 *
 * Learn and Review share ONE list view (#screen-list) and ONE session builder so
 * that mixing new + due characters behaves consistently. A session is a queue of
 * tasks (character + reveal level); the draw screen plays them one at a time and
 * the queue can grow mid-session (failure side-loops).
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
  var listOpenedFrom = "screen-home";   // where the shared list returns to
  var activeSession = null;             // current running session (for abort)
  var activeReturnScreen = "screen-home";

  function registerScreens() {
    Array.prototype.forEach.call(document.querySelectorAll(".screen"), function (s) { screens[s.id] = s; });
  }
  function show(id) {
    Object.keys(screens).forEach(function (k) { screens[k].classList.toggle("active", k === id); });
    window.scrollTo(0, 0);
  }

  // ---- per-character display status ----
  function statusInfo(char) {
    var p = Store.getProgress(char);
    if (p.status === "new") return { key: "new", label: "New" };
    if (p.status === "learning") return { key: "learning", label: "Learning" };
    return Scheduler.isDue(char) ? { key: "due", label: "Due" } : { key: "learned", label: "Learned" };
  }

  // ===================================================================
  // HOME
  // ===================================================================
  function renderHome() {
    var c = Store.counts();
    $("home-counts").textContent = c.new + " new · " + c.learning + " learning · " + c.review + " in review";
    var due = Scheduler.dueChars();
    var pill = $("home-due");
    if (due.length) {
      pill.hidden = false;
      pill.textContent = "🔔 " + due.length + " due for review — start now";
    } else {
      pill.hidden = true;
    }
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
    Array.prototype.forEach.call($("browse-picker").children, function (chip) { chip.classList.toggle("active", chip.dataset.char === char); });
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
  function browseRandom() { var pick; do { pick = META[Math.floor(Math.random() * META.length)].char; } while (META.length > 1 && pick === browseChar); browseSelect(pick); }

  // ===================================================================
  // SHARED LIST (Review + Learn "choose your own")
  // ===================================================================
  var listSelected = {};

  function buildListGrid() {
    var grid = $("list-grid");
    grid.innerHTML = "";
    META.forEach(function (m) {
      var info = statusInfo(m.char);
      var chip = document.createElement("button");
      chip.type = "button"; chip.className = "select-chip"; chip.dataset.char = m.char;
      var glyph = document.createElement("span"); glyph.className = "chip-glyph"; glyph.textContent = m.char;
      var tag = document.createElement("span"); tag.className = "chip-tag chip-" + info.key; tag.textContent = info.label;
      chip.appendChild(glyph); chip.appendChild(tag);
      chip.addEventListener("click", function () {
        listSelected[m.char] = !listSelected[m.char];
        chip.classList.toggle("selected", listSelected[m.char]);
        updateListStart();
      });
      grid.appendChild(chip);
    });
  }
  function refreshListGrid() {
    Array.prototype.forEach.call($("list-grid").children, function (chip) {
      chip.classList.toggle("selected", !!listSelected[chip.dataset.char]);
    });
    updateListStart();
  }
  function selectedListChars() { return allChars().filter(function (c) { return listSelected[c]; }); }
  function updateListStart() {
    var n = selectedListChars().length;
    $("list-count").textContent = n + " selected";
    $("list-start").disabled = n === 0;
  }

  function buildFilterRows() {
    var wrap = $("filter-rows");
    wrap.innerHTML = "";
    Object.keys(Filters.DEFS).forEach(function (id) {
      var def = Filters.DEFS[id];
      var row = document.createElement("div");
      row.className = "filter-row";
      var lab = document.createElement("label"); lab.textContent = def.label;
      var sel = document.createElement("select"); sel.className = "select-input"; sel.dataset.filter = id;
      var any = document.createElement("option"); any.value = ""; any.textContent = "— any —"; sel.appendChild(any);
      def.options().forEach(function (o) { var opt = document.createElement("option"); opt.value = o.value; opt.textContent = o.label; sel.appendChild(opt); });
      row.appendChild(lab); row.appendChild(sel);
      wrap.appendChild(row);
    });
  }
  function activeFilters() {
    return Array.prototype.map.call($("filter-rows").querySelectorAll("select"), function (sel) { return { id: sel.dataset.filter, value: sel.value }; })
      .filter(function (f) { return f.value !== ""; });
  }
  function applyFilters() {
    var active = activeFilters();
    var matched = active.length ? Filters.apply(active) : [];
    listSelected = {};
    matched.forEach(function (c) { listSelected[c] = true; });
    refreshListGrid();
    $("filter-match").textContent = active.length ? (matched.length + " match") : "no filters set";
  }
  function resetFilters() {
    Array.prototype.forEach.call($("filter-rows").querySelectorAll("select"), function (s) { s.value = ""; });
    $("filter-match").textContent = "";
  }
  function buildSortOptions() {
    var sel = $("list-sort"); sel.innerHTML = "";
    Object.keys(Filters.SORTS).forEach(function (id) { var o = document.createElement("option"); o.value = id; o.textContent = Filters.SORTS[id].label; sel.appendChild(o); });
  }
  function renderListDue() {
    var due = Scheduler.dueChars();
    var b = $("list-due-banner");
    if (due.length) {
      b.hidden = false;
      b.textContent = "🔔 " + due.length + " due for review: " + due.join(" ") + "  → tap to review them";
    } else {
      b.hidden = false;
      b.textContent = "No characters are due for review right now.";
      b.disabled = true;
      return;
    }
    b.disabled = false;
  }

  function openList(title, openedFrom) {
    listOpenedFrom = openedFrom;
    $("list-title").textContent = title;
    buildListGrid(); buildFilterRows(); buildSortOptions(); resetFilters();
    listSelected = {}; $("list-random").checked = false;
    renderListDue(); refreshListGrid();
    show("screen-list");
  }

  function startListSession() {
    var chars = selectedListChars();
    if (!chars.length) return;
    var tasks = buildUnifiedTasks(chars, $("list-sort").value, $("list-random").checked);
    runUnifiedSession(tasks, "screen-list");
  }

  // ===================================================================
  // Session builders
  // ===================================================================
  function reviewTask(c) { return { char: c, level: "blind", scaffold: false, kind: "review" }; }
  function scaffoldTask(c, s) { return { char: c, level: STEP[s].level, scaffold: true, kind: "scaffold", step: s, stepName: STEP[s].name }; }

  // Mixed Learn+Review: new/learning chars get (remaining) scaffold steps; review
  // chars get a review task; interleaved by round when scaffolding is present.
  function buildUnifiedTasks(chars, sortId, randomize) {
    var scaffoldChars = [], reviewChars = [];
    chars.forEach(function (c) { (Store.getProgress(c).status === "review" ? reviewChars : scaffoldChars).push(c); });
    var orderedReview = randomize ? Filters.shuffle(reviewChars) : Filters.sortChars(reviewChars, sortId);

    if (!scaffoldChars.length) {
      return orderedReview.map(reviewTask); // pure review honours sort/randomize
    }

    var rounds = 4;
    var scaffoldTasks = [], reviewTasks = [];
    scaffoldChars.forEach(function (c) {
      var p = Store.getProgress(c);
      var start = (p.status === "learning" ? (p.learnStep || 0) : 0) + 1;
      for (var s = start; s <= 4; s++) { var t = scaffoldTask(c, s); t.round = s - 1; scaffoldTasks.push(t); }
    });
    orderedReview.forEach(function (c) { var t = reviewTask(c); t.round = Math.floor(Math.random() * rounds); reviewTasks.push(t); });
    var byRound = []; for (var r = 0; r < rounds; r++) byRound.push([]);
    scaffoldTasks.concat(reviewTasks).forEach(function (t) { byRound[t.round].push(t); });
    var tasks = []; byRound.forEach(function (g) { tasks = tasks.concat(Filters.shuffle(g)); });
    return tasks;
  }

  function labelForUnified(t) {
    if (t.sideloop) return "Retry · free recall";
    if (t.kind === "review") return t.isExtra ? "Final retry" : "Review";
    return "Step " + t.step + "/4 · " + t.stepName;
  }
  function unifiedTaskDone(t, r) {
    if (t.kind === "review") { Scheduler.recordReview(t.char, r.success, r.mistakes); return; }
    if (t.sideloop) return; // the step-4 redraw is just practice; don't double-schedule
    if (t.step < 4) { if (!r.skipped) Store.recordLearnStep(t.char, t.step); }
    else if (r.completed && !r.gaveUp) { Store.graduate(t.char); Scheduler.onGraduate(t.char); }
  }

  function runUnifiedSession(tasks, returnScreen) {
    runSession({
      tasks: tasks, modeLabel: "Review", returnScreen: returnScreen,
      labelFor: labelForUnified, onTaskDone: unifiedTaskDone, failureHandling: true,
      onFinish: function (stats) {
        var grad = Store.reviewPool();
        showDone("Session complete", stats, "screen-home", grad.length ? ("In your review pool: " + grad.join(" ")) : "");
      },
    });
  }

  // Due notification → review exactly the due characters.
  function startDueReview(returnScreen) {
    var due = Scheduler.dueChars();
    if (!due.length) return;
    runUnifiedSession(due.map(reviewTask), returnScreen);
  }

  // ===================================================================
  // LEARN — entry + sequential slider
  // ===================================================================
  function openSeq() {
    var avail = Store.nextNewChars(999);
    $("seq-available").textContent = avail.length;
    var slider = $("seq-slider");
    slider.max = String(Math.max(1, Math.min(50, avail.length)));
    if (parseInt(slider.value, 10) > parseInt(slider.max, 10)) slider.value = slider.max;
    updateSeq();
    slider.oninput = updateSeq;
    $("seq-start").disabled = avail.length === 0;
    show("screen-learn-seq");
  }
  function updateSeq() {
    var n = parseInt($("seq-slider").value, 10);
    $("seq-value").textContent = n;
    var avail = Store.nextNewChars(999);
    $("seq-preview").textContent = avail.length ? ("Next up: " + Store.nextNewChars(n).join(" ")) : "Nothing new to learn right now.";
  }
  function startSeq() {
    var n = parseInt($("seq-slider").value, 10) || 1;
    var chars = Store.nextNewChars(n);
    if (!chars.length) return;
    var tasks = [];
    [1, 2, 3, 4].forEach(function (s) { chars.forEach(function (c) { tasks.push(scaffoldTask(c, s)); }); });
    runSession({
      tasks: tasks, modeLabel: "Learn", returnScreen: "screen-learn-seq",
      labelFor: function (t) { return "Step " + t.step + "/4 · " + t.stepName; },
      onTaskDone: unifiedTaskDone, failureHandling: true,
      onFinish: function (stats) {
        var grad = Store.reviewPool();
        showDone("Learn session complete", stats, "screen-home", grad.length ? ("In your review pool: " + grad.join(" ")) : "");
      },
    });
  }

  // ===================================================================
  // Session runner (dynamic queue + failure side-loops + abort)
  // ===================================================================
  function runSession(cfg) {
    var queue = cfg.tasks.slice();
    var stats = { total: queue.length, success: 0, completed: 0, skipped: 0 };
    var idx = 0;
    activeSession = { aborted: false };
    activeReturnScreen = cfg.returnScreen || "screen-home";

    function next() {
      if (!activeSession || activeSession.aborted) return;
      if (idx >= queue.length) { activeSession = null; cfg.onFinish(stats); return; }
      var t = queue[idx];
      show("screen-draw");
      DrawScreen.run({
        char: t.char, level: t.level, scaffold: t.scaffold,
        modeLabel: cfg.modeLabel,
        stepLabel: cfg.labelFor ? cfg.labelFor(t) : "",
        progressLabel: (idx + 1) + " / " + queue.length,
        onDone: function (result) {
          if (!activeSession || activeSession.aborted) return;
          if (result.success) stats.success++;
          if (result.completed) stats.completed++;
          if (result.skipped) stats.skipped++;
          if (cfg.onTaskDone) cfg.onTaskDone(t, result);

          // Failure handling: a review attempt with any first-try wrong stroke.
          if (cfg.failureHandling && t.kind === "review" && !t.noFail &&
              result.completed && !result.success && !result.skipped) {
            // 1) immediate step-4 free-recall redraw, right after this character
            queue.splice(idx + 1, 0, { char: t.char, level: "blind", scaffold: true, kind: "scaffold", step: 4, stepName: "Free recall", sideloop: true, noFail: true });
            // 2) one more attempt at the very end of the whole session
            queue.push({ char: t.char, level: "blind", scaffold: false, kind: "review", isExtra: true, noFail: true });
            stats.total = queue.length;
          }
          idx++; next();
        },
      });
    }
    next();
  }

  function exitSession() {
    if (activeSession) activeSession.aborted = true;
    DrawScreen.stop();
    activeSession = null;
    renderHome();
    show(activeReturnScreen || "screen-home");
  }

  function showDone(title, stats, backScreenId, extraNote) {
    $("done-title").textContent = title;
    $("done-summary").textContent = stats.success + " of " + stats.total + " written cleanly" + (stats.skipped ? " · " + stats.skipped + " skipped" : "");
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
      reveal: $("draw-reveal"), skip: $("draw-skip"), back: $("draw-back"),
    }, { onBack: exitSession });

    // top-level nav
    $("nav-browse").addEventListener("click", function () { buildBrowsePicker(); browseSelect(META[0].char); show("screen-browse"); });
    $("nav-learn").addEventListener("click", function () { show("screen-learn-entry"); });
    $("nav-review").addEventListener("click", function () { openList("Review", "screen-home"); });
    $("nav-settings").addEventListener("click", function () { show("screen-settings"); });

    // home due pill
    $("home-due").addEventListener("click", function () { startDueReview("screen-home"); });

    // back buttons: data-home / data-back="screen-x" / data-back="auto"
    Array.prototype.forEach.call(document.querySelectorAll("[data-home]"), function (b) {
      b.addEventListener("click", function () { renderHome(); show("screen-home"); });
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-back]"), function (b) {
      b.addEventListener("click", function () {
        var target = b.getAttribute("data-back");
        if (target === "auto") target = listOpenedFrom;
        renderHome(); show(target || "screen-home");
      });
    });

    // settings
    $("reset-progress").addEventListener("click", function () {
      if (!confirm("Reset all learning progress on this device?")) return;
      if (!confirm("Are you sure? This permanently erases your progress and cannot be undone.")) return;
      Store.resetAll(); renderHome();
      alert("Progress has been reset.");
    });

    // browse
    $("browse-animate").addEventListener("click", function () { if (browseWriter) browseWriter.animateCharacter(); });
    $("browse-reset").addEventListener("click", function () { if (browseChar) browseSelect(browseChar); });
    $("browse-random").addEventListener("click", browseRandom);

    // learn entry
    $("learn-seq-btn").addEventListener("click", openSeq);
    $("learn-choose-btn").addEventListener("click", function () { openList("Choose to learn", "screen-learn-entry"); });
    $("seq-start").addEventListener("click", startSeq);

    // shared list
    $("filter-apply").addEventListener("click", applyFilters);
    $("filter-reset").addEventListener("click", function () { resetFilters(); listSelected = {}; refreshListGrid(); });
    $("list-all").addEventListener("click", function () { allChars().forEach(function (c) { listSelected[c] = true; }); refreshListGrid(); });
    $("list-clear").addEventListener("click", function () { listSelected = {}; refreshListGrid(); });
    $("list-start").addEventListener("click", startListSession);
    $("list-due-banner").addEventListener("click", function () { if (!$("list-due-banner").disabled) startDueReview("screen-list"); });

    renderHome();
    show("screen-home");
  }

  document.addEventListener("DOMContentLoaded", init);
})();
