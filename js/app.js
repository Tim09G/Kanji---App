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
    // Voices often load asynchronously, and on some platforms TTS stays silent
    // unless an explicit ja voice is set (setting only `lang` isn't enough). Pick
    // a Japanese voice once the list is available and refresh on `voiceschanged`.
    var jaVoice = null;
    function pickVoice() {
      if (!window.speechSynthesis) return;
      var vs = window.speechSynthesis.getVoices() || [];
      if (!vs.length) return;
      jaVoice = vs.filter(function (v) {
        return /^ja\b/i.test(v.lang) || /ja[-_]/i.test(v.lang) || /japanese/i.test(v.name);
      })[0] || jaVoice;
    }
    if (window.speechSynthesis) {
      pickVoice();
      if (window.speechSynthesis.addEventListener) {
        window.speechSynthesis.addEventListener("voiceschanged", pickVoice);
      }
    }
    function speak(text) {
      if (!window.speechSynthesis) return;
      if (!jaVoice) pickVoice();           // voices may have loaded since startup
      var u = new SpeechSynthesisUtterance(text);
      u.lang = "ja-JP"; u.rate = 0.9;
      if (jaVoice) u.voice = jaVoice;
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
  // C: Browse picker rendered as labelled sections matching the active order
  // (same grouping as the Study list; headers here are visual, not selectable).
  var browseVisible = [];
  var browseAllCollapsed = false;
  function currentBrowseSort() { return $("browse-sort").value || "study"; }
  function buildBrowsePicker(chars) {
    if (chars) browseVisible = chars;
    var picker = $("browse-picker"); picker.innerHTML = "";
    var secs = Filters.sections(browseVisible, currentBrowseSort());
    secs.forEach(function (sec) {
      var header = null;
      if (sec.label) {
        header = makeSectionHeader(sec.label, sec.chars.length, null);   // Browse: visual header, collapsible only
        picker.appendChild(header);
      }
      var wrap = document.createElement("div"); wrap.className = "section-chips browse-section-chips";
      sec.chars.forEach(function (ch) {
        var chip = document.createElement("button");
        chip.type = "button"; chip.className = "kanji-chip"; chip.textContent = ch; chip.dataset.char = ch;
        if (ch === browseChar) chip.classList.add("active");
        chip.addEventListener("click", function () { browseSelect(ch); });
        wrap.appendChild(chip);
      });
      picker.appendChild(wrap);
      if (header && browseAllCollapsed) setSectionCollapsed(header, true);
    });
  }
  // Recompute the Browse picker from the current search + filters + sort.
  function refreshBrowse(base) {
    if (browseFilterValues.group) browseFilterValues.group.sort = currentBrowseSort();   // E: chunk by active order
    var active = activeFilters(browseFilterValues);
    var chars = base || (active.length ? Filters.apply(active) : allChars());
    browseVisible = Filters.sortChars(chars, currentBrowseSort());
    buildBrowsePicker(browseVisible);
    $("browse-filter-match").textContent = active.length ? (browseVisible.length + " shown") : "";
  }
  function browseSelect(char) {
    browseChar = char;
    var meta = metaOf(char);
    Array.prototype.forEach.call($("browse-picker").querySelectorAll(".kanji-chip"), function (chip) { chip.classList.toggle("active", chip.dataset.char === char); });
    $("browse-char").textContent = char;
    var bm = $("browse-meaning");
    bm.textContent = meta.meaning;
    if (meta.archaic) {                 // A: archaic/variant form borrows modern meaning
      var atag = document.createElement("span");
      atag.className = "archaic-tag";
      atag.textContent = "*archaic";
      atag.title = "Archaic variant of " + meta.modern + " — shares its meaning.";
      bm.appendChild(document.createTextNode(" "));
      bm.appendChild(atag);
    }
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
      // B: brisker stroke animation (defaults of 1x speed / 1s between strokes drag).
      strokeAnimationSpeed: 2, delayBetweenStrokes: 250,
      charDataLoader: function (c, done) { fetch("data/kanji/" + encodeURIComponent(c) + ".json").then(function (r) { return r.json(); }).then(done); },
    });
  }
  function renderBrowseVocab(meta) {
    var root = $("browse-vocab-list"); root.innerHTML = "";
    if (!meta.vocab || !meta.vocab.length) { root.innerHTML = '<span class="cue-empty">No vocabulary yet for this kanji.</span>'; return; }
    function vocabItem(w) {
      var item = document.createElement("div"); item.className = "vocab-item";
      var reading = w.r.map(function (s) { return s.t; }).join("");
      item.appendChild(window.Speak.speakButton(w.jp));
      var jp = document.createElement("span"); jp.className = "vocab-jp"; jp.textContent = " " + w.jp;
      var gl = document.createElement("span"); gl.className = "vocab-gloss"; gl.textContent = "（" + reading + "） — " + w.en;
      item.appendChild(jp); item.appendChild(gl);
      return item;
    }
    // G: group by the kanji's reading, matching the study-screen cue panel.
    var groups = {}, order = [];
    meta.vocab.forEach(function (w) {
      var key = w.reading || "";
      if (!groups[key]) { groups[key] = []; order.push(key); }
      groups[key].push(w);
    });
    order.forEach(function (reading) {
      if (reading) { var rh = document.createElement("div"); rh.className = "vocab-reading"; rh.textContent = reading; root.appendChild(rh); }
      groups[reading].forEach(function (w) { root.appendChild(vocabItem(w)); });
    });
  }
  function openBrowse() {
    $("browse-search").value = "";
    buildBrowseSortOptions();
    buildFilterRows($("browse-filter-rows"), browseFilterValues);
    $("browse-filter-match").textContent = "";
    browseAllCollapsed = false; $("browse-collapse-all").textContent = "Collapse all";
    refreshBrowse(allChars());
    browseSelect(META[0].char);
    show("screen-browse");
  }
  function buildBrowseSortOptions() {
    var sel = $("browse-sort"); if (sel.options.length) return;   // build once
    Object.keys(Filters.SORTS).filter(function (id) { return id !== "random"; })
      .forEach(function (id) { var o = document.createElement("option"); o.value = id; o.textContent = Filters.SORTS[id].label; sel.appendChild(o); });
    sel.value = "study";
  }
  function browseSearch() {
    var q = $("browse-search").value;
    var matches = q.trim() ? searchChars(q) : (activeFilters(browseFilterValues).length ? Filters.apply(activeFilters(browseFilterValues)) : allChars());
    refreshBrowse(matches);
    if (browseVisible.length) browseSelect(browseVisible[0]);
  }
  function applyBrowseFilters() {
    var q = $("browse-search").value;
    refreshBrowse(q.trim() ? searchChars(q) : null);
    if (browseVisible.length) browseSelect(browseVisible[0]);
  }
  function resetBrowseFilters() {
    buildFilterRows($("browse-filter-rows"), browseFilterValues);
    $("browse-search").value = "";
    refreshBrowse(allChars());
  }

  // ================= SHARED LIST =================
  var listSelected = {};
  var listVisible = [];   // characters currently shown (after filters), in sort order

  function currentSort() { return $("list-sort").value || Filters.DEFAULT_SORT; }

  function makeSelectChip(ch) {
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
    return chip;
  }
  // B: collapse/expand a single section (the chips immediately after its header).
  // Keeps the header in place so its sticky behaviour is unchanged.
  function setSectionCollapsed(headerEl, collapsed) {
    headerEl.classList.toggle("collapsed", collapsed);
    var arrow = headerEl.querySelector(".section-arrow");
    if (arrow) arrow.textContent = collapsed ? "▸" : "▾";
    var chips = headerEl.nextElementSibling;
    if (chips && chips.classList.contains("section-chips")) chips.classList.toggle("section-collapsed", collapsed);
  }
  // Build a section header: label on the left; arrow + count on the right (arrow
  // just left of the count). `onSelect` (Study only) makes the header itself a
  // select toggle; the arrow always collapses/expands and never triggers select.
  function makeSectionHeader(label, count, onSelect) {
    var h = document.createElement("div");
    h.className = "section-header" + (onSelect ? "" : " section-header-static");
    var lab = document.createElement("span"); lab.className = "section-label"; lab.textContent = label;
    var right = document.createElement("span"); right.className = "section-right";
    var arrow = document.createElement("button"); arrow.type = "button"; arrow.className = "section-arrow";
    arrow.setAttribute("aria-label", "Collapse or expand section"); arrow.textContent = "▾";
    var cnt = document.createElement("span"); cnt.className = "section-count"; cnt.textContent = count;
    right.appendChild(arrow); right.appendChild(cnt);
    h.appendChild(lab); h.appendChild(right);
    arrow.addEventListener("click", function (e) {
      e.stopPropagation();
      setSectionCollapsed(h, !h.classList.contains("collapsed"));
    });
    if (onSelect) { h.setAttribute("role", "button"); h.tabIndex = 0; h.title = "Select / clear this section"; h.addEventListener("click", onSelect); }
    return h;
  }

  // A: render the visible list as labelled sections matching the active order.
  // Clicking a header toggles selection of every kanji in that section that's
  // currently visible (select all → on second click, clear just that section).
  var listAllCollapsed = false;
  function buildListGrid() {
    var grid = $("list-grid"); grid.innerHTML = "";
    var secs = Filters.sections(listVisible, currentSort());
    secs.forEach(function (sec) {
      var chipEls = [];
      var header = null;
      if (sec.label) {
        header = makeSectionHeader(sec.label, sec.chars.length, function () {
          var allSel = sec.chars.every(function (c) { return listSelected[c]; });
          sec.chars.forEach(function (c) { listSelected[c] = !allSel; });
          chipEls.forEach(function (e) { e.classList.toggle("selected", !allSel); });
          updateListStart();
        });
        grid.appendChild(header);
      }
      var wrap = document.createElement("div"); wrap.className = "section-chips";
      sec.chars.forEach(function (ch) { var chip = makeSelectChip(ch); chipEls.push(chip); wrap.appendChild(chip); });
      grid.appendChild(wrap);
      if (header && listAllCollapsed) setSectionCollapsed(header, true);
    });
    updateListStart();
  }
  function setAllSectionsCollapsed(gridId, collapsed) {
    Array.prototype.forEach.call($(gridId).querySelectorAll(".section-header"), function (h) { setSectionCollapsed(h, collapsed); });
  }
  function selectedListChars() { return allChars().filter(function (c) { return listSelected[c]; }); }
  function newSliderVal() { var s = $("new-slider"); return s ? (parseInt(s.value, 10) || 0) : 0; }
  function updateListStart() {
    var n = selectedListChars().length;
    $("list-count").textContent = n + " selected";
    $("list-start").disabled = (n === 0 && newSliderVal() === 0);
  }

  // Filter values are tracked per screen (decoupled from input type) so selects, the
  // kanji text input (A) and the group scroll-picker (E) all read out uniformly.
  // The same builders serve both the Study list and the Browse tab (C).
  var listFilterValues = {};
  var browseFilterValues = {};

  function buildFilterRows(wrapEl, values) {
    wrapEl.innerHTML = "";
    Object.keys(values).forEach(function (k) { delete values[k]; });
    Object.keys(Filters.DEFS).forEach(function (id) {
      var def = Filters.DEFS[id];
      var row = document.createElement("div"); row.className = "filter-row";
      var lab = document.createElement("label"); lab.className = "filter-label"; lab.textContent = def.label;
      row.appendChild(lab);
      if (def.ui === "kanji") buildKanjiFilterRow(row, def, values);
      else if (def.ui === "group") buildGroupFilterRow(row, def, values);
      else buildSelectFilterRow(row, def, values);
      wrapEl.appendChild(row);
    });
  }

  function buildSelectFilterRow(row, def, values) {
    var sel = document.createElement("select"); sel.className = "select-input"; sel.dataset.filter = def.id;
    var any = document.createElement("option"); any.value = ""; any.textContent = "— any —"; sel.appendChild(any);
    var opts = def.options();
    opts.forEach(function (o) { var opt = document.createElement("option"); opt.value = o.value; opt.textContent = o.label; sel.appendChild(opt); });
    var hint = document.createElement("small"); hint.className = "filter-opt-hint";
    sel.addEventListener("change", function () {
      if (sel.value === "") { delete values[def.id]; hint.textContent = ""; return; }
      values[def.id] = sel.value;
      var o = opts.filter(function (x) { return String(x.value) === sel.value; })[0];
      hint.textContent = (o && o.hint) || "";
    });
    row.appendChild(sel); row.appendChild(hint);
  }

  // A: type/enter any kanji; filter to it + its similar list.
  function buildKanjiFilterRow(row, def, values) {
    var inp = document.createElement("input"); inp.type = "text"; inp.className = "select-input kanji-filter-input";
    inp.maxLength = 2; inp.placeholder = "Type a kanji, e.g. 校"; inp.dataset.filter = def.id;
    var hint = document.createElement("small"); hint.className = "filter-opt-hint";
    inp.addEventListener("input", function () {
      var v = (inp.value || "").trim(), ch = null;
      for (var i = 0; i < v.length; i++) { if (/[㐀-鿿]/.test(v[i])) { ch = v[i]; break; } }
      if (!ch || !metaOf(ch)) { delete values[def.id]; hint.textContent = ch ? "Not in the set." : ""; return; }
      values[def.id] = ch;
      var sim = metaOf(ch).similar || [];
      hint.textContent = sim.length ? ("similar: " + sim.join(" ")) : "no similar characters found";
    });
    row.appendChild(inp); row.appendChild(hint);
  }

  // E: iOS-style scroll-picker — a size wheel and a group wheel.
  function buildGroupFilterRow(row, def, values) {
    row.classList.add("filter-row-wide");
    var box = document.createElement("div"); box.className = "group-filter";
    var enable = document.createElement("label"); enable.className = "group-enable";
    var cb = document.createElement("input"); cb.type = "checkbox"; cb.dataset.groupEnable = "1";
    enable.appendChild(cb); enable.appendChild(document.createTextNode(" Limit to a block"));
    box.appendChild(enable);
    var cols = document.createElement("div"); cols.className = "wheel-cols";
    var sizeSlot = document.createElement("div"); sizeSlot.className = "wheel-slot";
    var sizeCap = document.createElement("div"); sizeCap.className = "wheel-cap"; sizeCap.textContent = "Size";
    var grpSlot = document.createElement("div"); grpSlot.className = "wheel-slot";
    var grpCap = document.createElement("div"); grpCap.className = "wheel-cap"; grpCap.textContent = "Group";
    cols.appendChild(sizeSlot); cols.appendChild(grpSlot);
    box.appendChild(cols); row.appendChild(box);

    var grpWheel = null;
    function commit() { if (cb.checked && grpWheel) values[def.id] = { size: sizeWheel.value(), index: grpWheel.index() }; }
    var sizeWheel = buildWheel([50, 100, 200], function (v) { return String(v); }, function () { rebuildGroups(); commit(); });
    sizeSlot.appendChild(sizeCap); sizeSlot.appendChild(sizeWheel.el);
    grpSlot.appendChild(grpCap);
    function rebuildGroups() {
      var size = sizeWheel.value(), count = def.groupCount(size), vals = [];
      for (var i = 0; i < count; i++) vals.push(i);
      if (grpWheel && grpWheel.el.parentNode) grpSlot.removeChild(grpWheel.el);
      grpWheel = buildWheel(vals, function (i) { return (i * size + 1) + "–" + Math.min((i + 1) * size, allChars().length); }, commit);
      grpSlot.appendChild(grpWheel.el);
    }
    rebuildGroups();
    cb.addEventListener("change", function () { if (cb.checked) commit(); else delete values[def.id]; });
  }

  function activeFilters(values) {
    return Object.keys(values)
      .filter(function (id) { var v = values[id]; return v !== "" && v != null; })
      .map(function (id) { return { id: id, value: values[id] }; });
  }
  // C3: filters narrow the visible list (not just highlight).
  function applyFilters() {
    if (listFilterValues.group) listFilterValues.group.sort = currentSort();   // E: chunk by active order
    var active = activeFilters(listFilterValues);
    var matched = active.length ? Filters.apply(active) : allChars();
    listVisible = Filters.sortChars(matched, currentSort());
    listSelected = {};
    if (active.length) matched.forEach(function (c) { listSelected[c] = true; }); // pre-select the narrowed set
    buildListGrid();
    $("filter-match").textContent = active.length ? (matched.length + " shown") : "";
  }
  function resetFilters() {
    buildFilterRows($("filter-rows"), listFilterValues);   // clears values + resets controls
    listVisible = Filters.sortChars(allChars(), currentSort());
    listSelected = {};
    buildListGrid();
    $("filter-match").textContent = "";
  }

  // A reusable iOS-style scroll wheel (E). `labelFn(item, idx)` renders each row;
  // `onSelect()` fires when the centered selection changes. ITEMH must match CSS.
  var WHEEL_ITEMH = 36;
  function buildWheel(items, labelFn, onSelect) {
    var col = document.createElement("div"); col.className = "wheel";
    var inner = document.createElement("div"); inner.className = "wheel-inner";
    var topPad = document.createElement("div"); topPad.className = "wheel-pad";
    inner.appendChild(topPad);
    items.forEach(function (it, i) {
      var d = document.createElement("div"); d.className = "wheel-item"; d.textContent = labelFn(it, i); d.dataset.idx = i;
      d.addEventListener("click", function () { selectIdx(i, true); });
      inner.appendChild(d);
    });
    var botPad = document.createElement("div"); botPad.className = "wheel-pad"; inner.appendChild(botPad);
    col.appendChild(inner);
    var selected = 0;
    function itemEls() { return inner.querySelectorAll(".wheel-item"); }
    function paint() { Array.prototype.forEach.call(itemEls(), function (e, j) { e.classList.toggle("sel", j === selected); }); }
    function selectIdx(i, scroll) {
      i = Math.max(0, Math.min(items.length - 1, i));
      var changed = i !== selected; selected = i; paint();
      if (scroll) col.scrollTop = i * WHEEL_ITEMH;
      if (changed && onSelect) onSelect();
    }
    var t;
    col.addEventListener("scroll", function () {
      clearTimeout(t);
      t = setTimeout(function () {
        var i = Math.max(0, Math.min(items.length - 1, Math.round(col.scrollTop / WHEEL_ITEMH)));
        if (i !== selected) { selected = i; paint(); if (onSelect) onSelect(); }
      }, 80);
    });
    paint();
    return {
      el: col,
      value: function () { return items[selected]; },
      index: function () { return selected; },
      set: function (i) { selectIdx(i, true); },
    };
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
    Object.keys(Filters.SORTS).filter(function (id) { return id !== "ungrouped"; }).forEach(function (id) {
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
    buildFilterRows($("filter-rows"), listFilterValues); buildSortOptions(); buildReviewOrder(); setupNewSlider();
    $("filter-match").textContent = "";
    $("list-search").value = "";
    listSelected = {};
    listAllCollapsed = false; $("list-collapse-all").textContent = "Collapse all";
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
        else {
          Store.recordLearnStep(t.char, 4); Store.graduate(t.char);
          Scheduler.applyResult(t.char, r);   // first FSRS review, rated from the step-4 attempt
          graduated[t.char] = true;
        }
      } else {
        // B4: fall back one step (min 1); only progress forward on a pass.
        queue.push(makeLearn(t.char, Math.max(1, t.step - 1)));
      }
    }

    function handleReview(t, r) {
      Scheduler.applyResult(t.char, r);   // feed Again/Hard/Good into FSRS
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
    $("browse-sort").addEventListener("change", function () { buildBrowsePicker(browseVisible); });
    $("browse-filter-apply").addEventListener("click", applyBrowseFilters);
    $("browse-filter-reset").addEventListener("click", resetBrowseFilters);
    $("browse-collapse-all").addEventListener("click", function () {
      browseAllCollapsed = !browseAllCollapsed;
      setAllSectionsCollapsed("browse-picker", browseAllCollapsed);
      $("browse-collapse-all").textContent = browseAllCollapsed ? "Expand all" : "Collapse all";
    });

    $("filter-apply").addEventListener("click", applyFilters);
    $("filter-reset").addEventListener("click", resetFilters);
    $("list-sort").addEventListener("change", applySort);
    $("list-search").addEventListener("input", applySearch);
    $("new-slider").addEventListener("input", updateNewSlider);
    $("list-all").addEventListener("click", function () { listVisible.forEach(function (c) { listSelected[c] = true; }); buildListGrid(); });
    $("list-clear").addEventListener("click", function () { listSelected = {}; buildListGrid(); });
    $("list-collapse-all").addEventListener("click", function () {
      listAllCollapsed = !listAllCollapsed;
      setAllSectionsCollapsed("list-grid", listAllCollapsed);
      $("list-collapse-all").textContent = listAllCollapsed ? "Expand all" : "Collapse all";
    });
    $("list-start").addEventListener("click", startListSession);
    $("list-due-banner").addEventListener("click", function () { if (!$("list-due-banner").disabled) startDueReview("screen-list", reviewOrder()); });

    renderHome();
    show("screen-home");
  }

  document.addEventListener("DOMContentLoaded", init);
})();
