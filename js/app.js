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

  // Minimal kana → romaji for typed reading search.
  var ROMA = { "あ":"a","い":"i","う":"u","え":"e","お":"o","か":"ka","き":"ki","く":"ku","け":"ke","こ":"ko","さ":"sa","し":"shi","す":"su","せ":"se","そ":"so","た":"ta","ち":"chi","つ":"tsu","て":"te","と":"to","な":"na","に":"ni","ぬ":"nu","ね":"ne","の":"no","は":"ha","ひ":"hi","ふ":"fu","へ":"he","ほ":"ho","ま":"ma","み":"mi","む":"mu","め":"me","も":"mo","や":"ya","ゆ":"yu","よ":"yo","ら":"ra","り":"ri","る":"ru","れ":"re","ろ":"ro","わ":"wa","を":"wo","ん":"n","が":"ga","ぎ":"gi","ぐ":"gu","げ":"ge","ご":"go","ざ":"za","じ":"ji","ず":"zu","ぜ":"ze","ぞ":"zo","だ":"da","ぢ":"ji","づ":"zu","で":"de","ど":"do","ば":"ba","び":"bi","ぶ":"bu","べ":"be","ぼ":"bo","ぱ":"pa","ぴ":"pi","ぷ":"pu","ぺ":"pe","ぽ":"po","ゃ":"ya","ゅ":"yu","ょ":"yo","っ":"","ー":"" };
  function kanaToRomaji(s) {
    var out = "";
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      // katakana → hiragana first
      var code = c.charCodeAt(0);
      if (code >= 0x30a1 && code <= 0x30f6) c = String.fromCharCode(code - 0x60);
      var nxt = s[i + 1];
      if (nxt && (nxt === "ゃ" || nxt === "ゅ" || nxt === "ょ") && ROMA[c] && ROMA[c].length === 2) {
        out += ROMA[c][0] + "y" + ROMA[nxt][1]; i++; continue;   // きゃ -> kya
      }
      out += (c in ROMA) ? ROMA[c] : (/\s/.test(c) ? " " : (/[a-z0-9]/i.test(c) ? c.toLowerCase() : ""));
    }
    return out;
  }

  // G: vocabulary audio via the Web Speech API (Japanese TTS).
  window.Speak = (function () {
    function speak(text) {
      if (!window.speechSynthesis) return;
      var u = new SpeechSynthesisUtterance(text);
      u.lang = "ja-JP"; u.rate = 0.9;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    }
    function speakButton(text) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "speak-btn"; b.title = "Play audio"; b.setAttribute("aria-label", "Play audio"); b.textContent = "🔊";
      b.addEventListener("click", function (e) { e.stopPropagation(); speak(text); });
      return b;
    }
    return { speak: speak, speakButton: speakButton };
  })();

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

  // Radical text (C1): radical character + Japanese name in hiragana, no English.
  function radicalText(char) {
    var c = (window.KANJI_COMPONENTS || {})[char]; var r = c && c.radical;
    if (!r) { var m = metaOf(char); r = m && m.radical; }
    return r ? (r.char + (r.name ? "（" + r.name + "）" : "")) : "—";
  }

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
  function buildBrowsePicker(chars) {
    var picker = $("browse-picker"); picker.innerHTML = "";
    (chars || allChars()).forEach(function (ch) {
      var chip = document.createElement("button");
      chip.type = "button"; chip.className = "kanji-chip"; chip.textContent = ch; chip.dataset.char = ch;
      chip.addEventListener("click", function () { browseSelect(ch); });
      picker.appendChild(chip);
    });
  }
  function browseSelect(char) {
    browseChar = char;
    var meta = metaOf(char);
    Array.prototype.forEach.call($("browse-picker").children, function (chip) { chip.classList.toggle("active", chip.dataset.char === char); });
    $("browse-char").textContent = char;
    $("browse-meaning").textContent = meta.meaning;
    $("browse-on").textContent = meta.on.join("、") || "—";
    $("browse-kun").textContent = meta.kun.join("、") || "—";
    $("browse-strokes").textContent = meta.strokeCount;
    $("browse-freq").textContent = "#" + meta.freq;
    $("browse-jlpt").textContent = meta.jlpt ? ("N" + meta.jlpt) : "—";
    $("browse-radical").textContent = radicalText(char);
    // F: alternate forms / radical-usage variants
    var vars = (window.KANJI_VARIANTS || {})[char];
    $("browse-variants").textContent = vars && vars.length
      ? vars.map(function (v) { return v.char + (v.name ? "（" + v.name + "）" : ""); }).join("、") : "—";
    // F: full vocabulary list (with audio)
    renderBrowseVocab(meta);
    $("browse-target").innerHTML = "";
    browseWriter = HanziWriter.create($("browse-target"), char, {
      width: 300, height: 300, padding: 5, showCharacter: true, showOutline: true,
      strokeColor: "#1f2933", outlineColor: "#e2e6ea",
      charDataLoader: function (c, done) { fetch("data/kanji/" + encodeURIComponent(c) + ".json").then(function (r) { return r.json(); }).then(done); },
    });
  }
  function renderBrowseVocab(meta) {
    var root = $("browse-vocab-list"); root.innerHTML = "";
    if (!meta.vocab || !meta.vocab.length) { root.innerHTML = '<span class="cue-empty">No vocabulary yet for this kanji.</span>'; return; }
    meta.vocab.forEach(function (w) {
      var item = document.createElement("div"); item.className = "vocab-item";
      var reading = w.r.map(function (s) { return s.t; }).join("");
      item.appendChild(window.Speak.speakButton(w.jp));
      var jp = document.createElement("span"); jp.className = "vocab-jp"; jp.textContent = " " + w.jp;
      var gl = document.createElement("span"); gl.className = "vocab-gloss"; gl.textContent = "（" + reading + "） — " + w.en;
      item.appendChild(jp); item.appendChild(gl);
      root.appendChild(item);
    });
  }
  function openBrowse() {
    buildBrowsePicker();
    $("browse-search").value = "";
    browseSelect(META[0].char);
    show("screen-browse");
  }
  function browseSearch() {
    var matches = searchChars($("browse-search").value);
    buildBrowsePicker(matches);
    if (matches.length) browseSelect(matches[0]);
  }

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
  function newSliderVal() { var s = $("new-slider"); return s ? (parseInt(s.value, 10) || 0) : 0; }
  function updateListStart() {
    var n = selectedListChars().length;
    $("list-count").textContent = n + " selected";
    $("list-start").disabled = (n === 0 && newSliderVal() === 0);
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

  // Display order (select screen) — Random is NOT offered here (A).
  function buildSortOptions() {
    var sel = $("list-sort"); sel.innerHTML = "";
    Object.keys(Filters.SORTS).filter(function (id) { return id !== "random"; })
      .forEach(function (id) { var o = document.createElement("option"); o.value = id; o.textContent = Filters.SORTS[id].label; sel.appendChild(o); });
    sel.value = "study";
  }
  // Review order (during the session) — single-select radios incl Random (default).
  function buildReviewOrder() {
    var wrap = $("review-order-options"); wrap.innerHTML = "";
    Object.keys(Filters.SORTS).forEach(function (id) {
      var lab = document.createElement("label"); lab.className = "ro-opt";
      var inp = document.createElement("input"); inp.type = "radio"; inp.name = "review-order"; inp.value = id;
      if (id === Filters.DEFAULT_SORT) inp.checked = true;
      lab.appendChild(inp); lab.appendChild(document.createTextNode(" " + Filters.SORTS[id].label));
      wrap.appendChild(lab);
    });
  }
  function reviewOrder() {
    var r = document.querySelector('input[name="review-order"]:checked');
    return r ? r.value : Filters.DEFAULT_SORT;
  }

  // --- search (D / F) — shared by the Study list and Browse ---
  function searchChars(query) {
    var q = (query || "").trim().toLowerCase();
    if (!q) return allChars();
    return allChars().filter(function (c) {
      if (c === q) return true;
      var m = metaOf(c);
      if (m.meaning && m.meaning.toLowerCase().indexOf(q) >= 0) return true;
      var kana = (m.on || []).concat(m.kun || []).join(" ");
      if (kana.toLowerCase().indexOf(q) >= 0) return true;
      if (kanaToRomaji(kana).indexOf(q) >= 0) return true;
      return false;
    });
  }
  function drawSearchNotice() {
    alert("Draw-to-search is coming soon. For now, search by typing the kanji, a reading in romaji (e.g. \"sui\"), or an English meaning.");
  }
  function applySearch() {
    var q = $("list-search").value;
    listVisible = Filters.sortChars(searchChars(q), currentSort());
    buildListGrid();
    $("filter-match").textContent = q.trim() ? (listVisible.length + " match") : "";
  }

  // --- new-kanji slider (C): mix N brand-new characters into the session ---
  function newChars(n) { return Store.nextNewChars(n); }
  function updateNewSlider() {
    var n = parseInt($("new-slider").value, 10) || 0;
    $("new-value").textContent = n;
    var avail = Store.nextNewChars(999);
    $("new-preview").textContent = n > 0 ? ("next: " + Store.nextNewChars(n).join(" ")) : "(review only)";
    updateListStart();
  }
  function setupNewSlider() {
    var avail = Store.nextNewChars(999).length;
    var s = $("new-slider");
    s.max = String(Math.min(50, Math.max(0, avail)));
    s.value = "0";
    updateNewSlider();
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
    buildFilterRows(); buildSortOptions(); buildReviewOrder(); setupNewSlider();
    Array.prototype.forEach.call($("filter-rows").querySelectorAll("select"), function (s) { s.value = ""; });
    $("filter-match").textContent = "";
    $("list-search").value = "";
    listSelected = {};
    listVisible = Filters.sortChars(allChars(), "study");
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
    // C: mix in N brand-new characters (next in study order), excluding any already chosen.
    var extra = Store.nextNewChars(newSliderVal()).filter(function (c) { return chars.indexOf(c) < 0; });
    var all = chars.concat(extra);
    if (!all.length) return;
    var built = buildSessionFromChars(all, reviewOrder());   // session presentation order (A)
    runSession({ learnItems: built.learnItems, reviewChars: built.reviewChars, modeLabel: "Study", returnScreen: "screen-list" });
  }
  function startDueReview(returnScreen, order) {
    var due = Scheduler.dueChars();
    if (!due.length) return;
    runSession({ learnItems: [], reviewChars: Filters.sortChars(due, order || Filters.DEFAULT_SORT), modeLabel: "Review", returnScreen: returnScreen });
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

  // Return to a screen, refreshing the list (B) so statuses are current.
  function returnToScreen(id) {
    renderHome();
    if (id === "screen-list") { renderListDue(); buildListGrid(); }
    show(id || "screen-home");
  }

  // A: results screen — Newly Learned (blue), Reviewed score, Missed (red).
  function finishSession(cfg, summary) {
    var learned = summary.graduated;
    var reviewedTotal = summary.reviewed.length;
    var reviewedCorrect = reviewedTotal - summary.failed.length;

    $("done-learned-row").hidden = !learned.length;
    $("done-learned").textContent = learned.join(" ");
    $("done-reviewed-row").hidden = !reviewedTotal;
    $("done-reviewed").textContent = reviewedCorrect + " / " + reviewedTotal + " correct";
    $("done-missed-row").hidden = !summary.failed.length;
    $("done-missed").textContent = summary.failed.join(" ");

    $("done-back").onclick = function () { returnToScreen(cfg.returnScreen); };
    renderHome();
    show("screen-done");
  }

  function exitSession() {
    if (activeSession) activeSession.aborted = true;
    DrawScreen.stop();
    var rs = activeReturnScreen;
    activeSession = null;
    returnToScreen(rs || "screen-home");
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
      reveal: $("draw-reveal"), skip: $("draw-skip"), back: $("draw-back"), prior: $("draw-prior"),
    }, { onBack: exitSession });

    $("nav-browse").addEventListener("click", openBrowse);
    $("nav-study").addEventListener("click", function () { openList("Study", "screen-home"); });
    $("nav-settings").addEventListener("click", function () { show("screen-settings"); });
    $("home-due").addEventListener("click", function () { startDueReview("screen-home", Filters.DEFAULT_SORT); });

    Array.prototype.forEach.call(document.querySelectorAll("[data-home]"), function (b) { b.addEventListener("click", goHome); });
    Array.prototype.forEach.call(document.querySelectorAll("[data-back]"), function (b) {
      b.addEventListener("click", function () {
        var target = b.getAttribute("data-back");
        if (target === "auto") target = listOpenedFrom;
        returnToScreen(target || "screen-home");
      });
    });

    $("reset-progress").addEventListener("click", function () {
      if (!confirm("Reset all learning progress on this device?")) return;
      if (!confirm("Are you sure? This permanently erases your progress and cannot be undone.")) return;
      Store.resetAll(); renderHome(); alert("Progress has been reset.");
    });

    $("browse-animate").addEventListener("click", function () { if (browseWriter) browseWriter.animateCharacter(); });
    $("browse-search").addEventListener("input", browseSearch);
    $("browse-search-draw").addEventListener("click", drawSearchNotice);

    $("filter-apply").addEventListener("click", applyFilters);
    $("filter-reset").addEventListener("click", resetFilters);
    $("list-sort").addEventListener("change", applySort);
    $("list-search").addEventListener("input", applySearch);
    $("search-draw").addEventListener("click", drawSearchNotice);
    $("new-slider").addEventListener("input", updateNewSlider);
    $("list-all").addEventListener("click", function () { listVisible.forEach(function (c) { listSelected[c] = true; }); buildListGrid(); });
    $("list-clear").addEventListener("click", function () { listSelected = {}; buildListGrid(); });
    $("list-start").addEventListener("click", startListSession);
    $("list-due-banner").addEventListener("click", function () { if (!$("list-due-banner").disabled) startDueReview("screen-list", reviewOrder()); });

    renderHome();
    show("screen-home");
  }

  document.addEventListener("DOMContentLoaded", init);
})();
