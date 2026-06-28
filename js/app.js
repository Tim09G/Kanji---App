/*
 * app.js — screen router + modes (Learn / Review / Browse / Settings).
 *
 * Learn and Review share one kanji list (#screen-list) and one dynamic session
 * engine. The engine processes a FIFO queue of tasks (character + reveal level)
 * that can grow mid-session:
 *   - Learn steps that fail fall back a step; that pass advance (B4).
 *   - Review failures spawn a step-3 scaffolding side-loop and, on success, a
 *     final end-of-session retry; repeated side-loop failures retry after a few
 *     more characters (B2/B3).
 */
(function () {
  "use strict";

  var META = window.KANJI_META || [];
  var $ = function (id) { return document.getElementById(id); };
  var allChars = function () { return (window.KANJI_META || []).map(function (m) { return m.char; }); };
  var metaOf = function (c) { return (window.KANJI_META || []).filter(function (m) { return m.char === c; })[0]; };

  var STEP = {
    1: { level: "guided", name: "Guided" },
    2: { level: "order", name: "Order recall" },
    3: { level: "start", name: "Start points" },
    4: { level: "blind", name: "Free recall" },
  };

  var screens = {};
  var listOpenedFrom = "screen-home";
  var activeSession = null;
  var activeReturnScreen = "screen-home";

  function registerScreens() { Array.prototype.forEach.call(document.querySelectorAll(".screen"), function (s) { screens[s.id] = s; }); }
  function show(id) { Object.keys(screens).forEach(function (k) { screens[k].classList.toggle("active", k === id); }); window.scrollTo(0, 0); }
  function goHome() { renderHome(); show("screen-home"); }

  function statusInfo(char) {
    var p = Store.getProgress(char);
    if (p.status === "new") return { key: "new", label: "New" };
    if (p.status === "learning") return { key: "learning", label: "Learning" };
    return Scheduler.isDue(char) ? { key: "due", label: "Due" } : { key: "learned", label: "Learned" };
  }

  // ================= HOME =================
  function renderHome() {
    // D3: show "total learned" and "due for review". (TODO: mastery-level breakdown later.)
    var learned = Store.reviewPool().length;
    var due = Scheduler.dueChars();
    $("home-counts").textContent = learned + " learned · " + due.length + " due for review";
    var pill = $("home-due");
    if (due.length) { pill.hidden = false; pill.textContent = "🔔 " + due.length + " due for review — start now"; }
    else { pill.hidden = true; }
  }

  // ================= BROWSE =================
  var browseWriter = null, browseChar = null;
  function buildBrowsePicker() {
    var picker = $("browse-picker"); picker.innerHTML = "";
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

  // ================= SHARED LIST =================
  var listSelected = {};
  var listVisible = [];   // characters currently shown (after filters), in sort order

  function currentSort() { return $("list-sort").value || Filters.DEFAULT_SORT; }

  function buildListGrid() {
    var grid = $("list-grid"); grid.innerHTML = "";
    listVisible.forEach(function (ch) {
      var info = statusInfo(ch);
      var chip = document.createElement("button");
      chip.type = "button"; chip.className = "select-chip"; chip.dataset.char = ch;
      if (listSelected[ch]) chip.classList.add("selected");
      var glyph = document.createElement("span"); glyph.className = "chip-glyph"; glyph.textContent = ch;
      var tag = document.createElement("span"); tag.className = "chip-tag chip-" + info.key; tag.textContent = info.label;
      chip.appendChild(glyph); chip.appendChild(tag);
      chip.addEventListener("click", function () {
        listSelected[ch] = !listSelected[ch];
        chip.classList.toggle("selected", listSelected[ch]);
        updateListStart();
      });
      grid.appendChild(chip);
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
    var wrap = $("filter-rows"); wrap.innerHTML = "";
    Object.keys(Filters.DEFS).forEach(function (id) {
      var def = Filters.DEFS[id];
      var row = document.createElement("div"); row.className = "filter-row";
      var lab = document.createElement("label"); lab.textContent = def.label;
      var sel = document.createElement("select"); sel.className = "select-input"; sel.dataset.filter = id;
      var any = document.createElement("option"); any.value = ""; any.textContent = "— any —"; sel.appendChild(any);
      def.options().forEach(function (o) { var opt = document.createElement("option"); opt.value = o.value; opt.textContent = o.label; sel.appendChild(opt); });
      row.appendChild(lab); row.appendChild(sel); wrap.appendChild(row);
    });
  }
  function activeFilters() {
    return Array.prototype.map.call($("filter-rows").querySelectorAll("select"), function (sel) { return { id: sel.dataset.filter, value: sel.value }; })
      .filter(function (f) { return f.value !== ""; });
  }
  // C3: filters narrow the visible list (not just highlight).
  function applyFilters() {
    var active = activeFilters();
    var matched = active.length ? Filters.apply(active) : allChars();
    listVisible = Filters.sortChars(matched, currentSort());
    listSelected = {};
    if (active.length) matched.forEach(function (c) { listSelected[c] = true; }); // pre-select the narrowed set
    buildListGrid();
    $("filter-match").textContent = active.length ? (matched.length + " shown") : "";
  }
  function resetFilters() {
    Array.prototype.forEach.call($("filter-rows").querySelectorAll("select"), function (s) { s.value = ""; });
    listVisible = Filters.sortChars(allChars(), currentSort());
    listSelected = {};
    buildListGrid();
    $("filter-match").textContent = "";
  }
  // C4: changing the order actually re-sorts the visible list.
  function applySort() { listVisible = Filters.sortChars(listVisible, currentSort()); buildListGrid(); }

  function buildSortOptions() {
    var sel = $("list-sort"); sel.innerHTML = "";
    Object.keys(Filters.SORTS).forEach(function (id) { var o = document.createElement("option"); o.value = id; o.textContent = Filters.SORTS[id].label; sel.appendChild(o); });
    sel.value = Filters.DEFAULT_SORT;
  }
  function renderListDue() {
    var due = Scheduler.dueChars();
    var b = $("list-due-banner");
    if (due.length) { b.hidden = false; b.disabled = false; b.textContent = "🔔 " + due.length + " due for review — tap to review them"; }
    else { b.hidden = false; b.disabled = true; b.textContent = "No characters are due for review right now."; }
  }

  function openList(title, openedFrom) {
    listOpenedFrom = openedFrom;
    $("list-title").textContent = title;
    buildFilterRows(); buildSortOptions();
    Array.prototype.forEach.call($("filter-rows").querySelectorAll("select"), function (s) { s.value = ""; });
    $("filter-match").textContent = "";
    listSelected = {};
    listVisible = Filters.sortChars(allChars(), Filters.DEFAULT_SORT);
    renderListDue(); buildListGrid();
    show("screen-list");
  }

  // ================= SESSION ENGINE =================
  function makeLearn(char, step) { return { char: char, kind: "learn", step: step, level: STEP[step].level }; }
  function makeSideloop(char, attempts) { return { char: char, kind: "learn", step: 3, level: STEP[3].level, sideloop: true, recoveryAttempts: attempts }; }
  function makeReview(char, isExtra) { return { char: char, kind: "review", level: "blind", isExtra: !!isExtra }; }

  function buildSessionFromChars(chars, sortId) {
    var learnItems = [], reviewChars = [];
    chars.forEach(function (c) {
      var p = Store.getProgress(c);
      if (p.status === "review") reviewChars.push(c);
      else { var start = (p.status === "learning" ? (p.learnStep || 0) : 0) + 1; learnItems.push({ char: c, step: Math.min(4, start) }); }
    });
    reviewChars = Filters.sortChars(reviewChars, sortId);
    return { learnItems: learnItems, reviewChars: reviewChars };
  }

  function startListSession() {
    var chars = selectedListChars();
    if (!chars.length) return;
    var built = buildSessionFromChars(chars, currentSort());
    runSession({ learnItems: built.learnItems, reviewChars: built.reviewChars, modeLabel: "Review", returnScreen: "screen-list" });
  }
  function startSeq() {
    var n = parseInt($("seq-slider").value, 10) || 1;
    var chars = Store.nextNewChars(n);
    if (!chars.length) return;
    runSession({ learnItems: chars.map(function (c) { return { char: c, step: 1 }; }), reviewChars: [], modeLabel: "Learn", returnScreen: "screen-learn-seq" });
  }
  function startDueReview(returnScreen) {
    var due = Scheduler.dueChars();
    if (!due.length) return;
    runSession({ learnItems: [], reviewChars: Filters.sortChars(due, Filters.DEFAULT_SORT), modeLabel: "Review", returnScreen: returnScreen });
  }

  function runSession(cfg) {
    // initial interleave of learn-start tasks and review tasks
    var learnTasks = cfg.learnItems.map(function (it) { return makeLearn(it.char, it.step); });
    var reviewTasks = cfg.reviewChars.map(function (c) { return makeReview(c, false); });
    var queue = [];
    var li = 0, ri = 0;
    while (li < learnTasks.length || ri < reviewTasks.length) {
      if (li < learnTasks.length) queue.push(learnTasks[li++]);
      if (ri < reviewTasks.length) queue.push(reviewTasks[ri++]);
    }

    var reviewedSet = {}; cfg.reviewChars.forEach(function (c) { reviewedSet[c] = true; });
    var failedSet = {};
    var graduated = {};
    var completed = 0;

    activeSession = { aborted: false };
    activeReturnScreen = cfg.returnScreen || "screen-home";

    function labelFor(t) {
      if (t.kind === "review") return t.isExtra ? "Final retry" : "Review";
      if (t.sideloop) return "Retry · " + STEP[3].name;
      return "Step " + t.step + "/4 · " + STEP[t.step].name;
    }
    function progressText() { return (completed + 1) + " / " + (completed + queue.length + 1); }

    function present() {
      if (!activeSession || activeSession.aborted) return;
      if (!queue.length) {
        activeSession = null;
        finishSession(cfg, { reviewed: Object.keys(reviewedSet), failed: Object.keys(failedSet), graduated: Object.keys(graduated) });
        return;
      }
      var t = queue.shift();
      show("screen-draw");
      DrawScreen.run({
        char: t.char, level: t.level, kind: t.kind, scaffold: (t.kind === "learn"),
        modeLabel: cfg.modeLabel, stepLabel: labelFor(t), progressLabel: progressText(),
        onDone: function (r) {
          if (!activeSession || activeSession.aborted) return;
          completed++;
          if (t.kind === "learn") {
            if (t.sideloop) handleSideloop(t, r); else handleLearn(t, r);
          } else handleReview(t, r);
          present();
        },
      });
    }

    function handleLearn(t, r) {
      if (r.skipped) return; // user skipped this step; don't progress or re-queue
      if (r.success) {
        if (t.step < 4) { Store.recordLearnStep(t.char, t.step); queue.push(makeLearn(t.char, t.step + 1)); }
        else { Store.recordLearnStep(t.char, 4); Store.graduate(t.char); Scheduler.onGraduate(t.char); graduated[t.char] = true; }
      } else {
        // B4: fall back one step (min 1); only progress forward on a pass.
        queue.push(makeLearn(t.char, Math.max(1, t.step - 1)));
      }
    }

    function handleReview(t, r) {
      Scheduler.recordReview(t.char, r.success, r.mistakes);
      if (r.success) return;
      if (reviewedSet[t.char]) failedSet[t.char] = true; // A2: distinct kanji that failed
      if (t.isExtra) return;                              // final attempt failed -> terminal
      queue.unshift(makeSideloop(t.char, 1));             // B2.3 (A1: step 3), immediate
    }

    function handleSideloop(t, r) {
      if (r.success) {
        queue.push(makeReview(t.char, true)); // B2.5/B3: queue final end-of-session attempt
      } else if (t.recoveryAttempts >= 5) {
        queue.push(makeReview(t.char, true)); // safety cap -> just queue the final attempt
      } else {
        var pos = Math.min(queue.length, 3); // B3: retry after a few more characters
        queue.splice(pos, 0, makeSideloop(t.char, t.recoveryAttempts + 1));
      }
    }

    present();
  }

  function finishSession(cfg, summary) {
    if (summary.reviewed.length) {
      var correct = summary.reviewed.length - summary.failed.length;
      var extra = summary.graduated.length ? ("Newly learned: " + summary.graduated.join(" ")) : "";
      showDone("Review complete", correct + " / " + summary.reviewed.length + " kanji correct", extra, cfg.returnScreen);
    } else {
      var grad = Store.reviewPool();
      showDone("Learn session complete",
        summary.graduated.length + " character" + (summary.graduated.length === 1 ? "" : "s") + " learned",
        grad.length ? ("In your review pool: " + grad.join(" ")) : "", cfg.returnScreen);
    }
  }

  function exitSession() {
    if (activeSession) activeSession.aborted = true;
    DrawScreen.stop();
    activeSession = null;
    renderHome();
    show(activeReturnScreen || "screen-home");
  }

  function showDone(title, summaryText, extraNote, backScreenId) {
    $("done-title").textContent = title;
    $("done-summary").textContent = summaryText;
    $("done-extra").textContent = extraNote || "";
    $("done-back").onclick = function () { renderHome(); show(backScreenId || "screen-home"); };
    renderHome();
    show("screen-done");
  }

  // ================= LEARN entry + sequential =================
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

  // ================= wiring =================
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

    $("nav-browse").addEventListener("click", function () { buildBrowsePicker(); browseSelect(META[0].char); show("screen-browse"); });
    $("nav-learn").addEventListener("click", function () { show("screen-learn-entry"); });
    $("nav-review").addEventListener("click", function () { openList("Review", "screen-home"); });
    $("nav-settings").addEventListener("click", function () { show("screen-settings"); });
    $("home-due").addEventListener("click", function () { startDueReview("screen-home"); });

    Array.prototype.forEach.call(document.querySelectorAll("[data-home]"), function (b) { b.addEventListener("click", goHome); });
    Array.prototype.forEach.call(document.querySelectorAll("[data-back]"), function (b) {
      b.addEventListener("click", function () {
        var target = b.getAttribute("data-back");
        if (target === "auto") target = listOpenedFrom;
        renderHome(); show(target || "screen-home");
      });
    });

    $("reset-progress").addEventListener("click", function () {
      if (!confirm("Reset all learning progress on this device?")) return;
      if (!confirm("Are you sure? This permanently erases your progress and cannot be undone.")) return;
      Store.resetAll(); renderHome(); alert("Progress has been reset.");
    });

    $("browse-animate").addEventListener("click", function () { if (browseWriter) browseWriter.animateCharacter(); });
    $("browse-reset").addEventListener("click", function () { if (browseChar) browseSelect(browseChar); });
    $("browse-random").addEventListener("click", browseRandom);

    $("learn-seq-btn").addEventListener("click", openSeq);
    $("learn-choose-btn").addEventListener("click", function () { openList("Choose to learn", "screen-learn-entry"); });
    $("seq-start").addEventListener("click", startSeq);

    $("filter-apply").addEventListener("click", applyFilters);
    $("filter-reset").addEventListener("click", resetFilters);
    $("list-sort").addEventListener("change", applySort);
    $("list-all").addEventListener("click", function () { listVisible.forEach(function (c) { listSelected[c] = true; }); buildListGrid(); });
    $("list-clear").addEventListener("click", function () { listSelected = {}; buildListGrid(); });
    $("list-start").addEventListener("click", startListSession);
    $("list-due-banner").addEventListener("click", function () { if (!$("list-due-banner").disabled) startDueReview("screen-list"); });

    renderHome();
    show("screen-home");
  }

  document.addEventListener("DOMContentLoaded", init);
})();
