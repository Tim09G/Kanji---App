/*
 * Kanji Practice — Phase 1 app logic
 *
 * What this does:
 *  - Builds a row of kanji "chips" from the sample metadata.
 *  - When you pick one, it loads that kanji's stroke data (from data/kanji/<char>.json,
 *    which is KanjiVG data converted to HanziWriter format) and shows its meaning/readings.
 *  - "Animate strokes" plays the stroke-order animation.
 *  - "Quiz me" lets you draw the kanji stroke-by-stroke; HanziWriter checks order & shape.
 *
 * No build step, no framework — just plain JavaScript so it's easy to read and tweak.
 */

(function () {
  "use strict";

  // ---- Grab the elements we'll touch ----
  var els = {
    picker: document.getElementById("kanji-picker"),
    target: document.getElementById("writer-target"),
    status: document.getElementById("status"),
    btnAnimate: document.getElementById("btn-animate"),
    btnQuiz: document.getElementById("btn-quiz"),
    btnReset: document.getElementById("btn-reset"),
    btnRandom: document.getElementById("btn-random"),
    infoChar: document.getElementById("info-char"),
    infoMeaning: document.getElementById("info-meaning"),
    infoOn: document.getElementById("info-on"),
    infoKun: document.getElementById("info-kun"),
    infoStrokes: document.getElementById("info-strokes"),
  };

  var META = window.KANJI_META || [];
  var writer = null;        // current HanziWriter instance
  var current = null;       // current metadata entry
  var quizActive = false;

  // ---- Helpers ----

  function setStatus(message, kind) {
    els.status.textContent = message;
    els.status.className = "status" + (kind ? " " + kind : "");
  }

  // Loads a kanji's stroke data from our local files.
  // HanziWriter calls this whenever it needs character data.
  function charDataLoader(char, onComplete, onError) {
    fetch("data/kanji/" + encodeURIComponent(char) + ".json")
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        onComplete(data);
      })
      .catch(function (err) {
        setStatus(
          "Couldn't load stroke data for " + char +
          ". If you opened the file directly, run it through a local server instead (see README).",
          "bad"
        );
        if (onError) onError(err);
      });
  }

  // Builds (or rebuilds) the HanziWriter instance for a character.
  function makeWriter(char) {
    els.target.innerHTML = ""; // clear any previous SVG
    quizActive = false;
    writer = HanziWriter.create(els.target, char, {
      width: 300,
      height: 300,
      padding: 5,
      showCharacter: true,
      showOutline: true,
      strokeColor: "#1f2933",
      radicalColor: "#2f6fed",
      drawingColor: "#2f6fed",
      strokeAnimationSpeed: 1,
      delayBetweenStrokes: 250,
      charDataLoader: charDataLoader,
    });
    return writer;
  }

  function showInfo(entry, data) {
    els.infoChar.textContent = entry.char;
    els.infoMeaning.textContent = entry.meaning;
    els.infoOn.textContent = entry.on && entry.on.length ? entry.on.join("、") : "—";
    els.infoKun.textContent = entry.kun && entry.kun.length ? entry.kun.join("、") : "—";
    // Stroke count comes from the actual stroke data when available.
    els.infoStrokes.textContent = data && data.strokes ? String(data.strokes.length) : "—";
  }

  // Select a kanji: highlight its chip, rebuild the writer, update the info card.
  function selectKanji(entry) {
    current = entry;

    // highlight active chip
    Array.prototype.forEach.call(els.picker.children, function (chip) {
      chip.classList.toggle("active", chip.dataset.char === entry.char);
    });

    showInfo(entry, null);
    setStatus("Loading " + entry.char + " …");

    makeWriter(entry.char);

    // Fetch the data once more just to fill in the stroke count + confirm load.
    charDataLoader(
      entry.char,
      function (data) {
        showInfo(entry, data);
        setStatus("Ready. Press “Animate strokes” or “Quiz me”.");
      },
      function () { /* error already surfaced by charDataLoader */ }
    );
  }

  // ---- Button actions ----

  function doAnimate() {
    if (!writer) return;
    quizActive = false;
    setStatus("Playing stroke order for " + current.char + " …");
    writer.animateCharacter({
      onComplete: function () {
        setStatus("That's the stroke order. Try “Quiz me” to draw it yourself.");
      },
    });
  }

  function doQuiz() {
    if (!writer || !current) return;
    quizActive = true;
    setStatus("Your turn — draw " + current.char + " one stroke at a time.");
    writer.quiz({
      leniency: 1.0,
      showHintAfterMisses: 3,
      onCorrectStroke: function (info) {
        var left = info.strokesRemaining;
        setStatus(
          left > 0 ? ("Nice — " + left + " stroke(s) to go.") : "Last stroke done!",
          "good"
        );
      },
      onMistake: function (info) {
        setStatus(
          "Not quite — that's not stroke " + (info.strokeNum + 1) +
          ". Try again (" + info.strokesRemaining + " left).",
          "bad"
        );
      },
      onComplete: function (summary) {
        quizActive = false;
        var msg = "🎉 You wrote " + current.char + "!";
        if (summary && typeof summary.totalMistakes === "number") {
          msg += " Total mistakes: " + summary.totalMistakes + ".";
        }
        setStatus(msg, "good");
      },
    });
  }

  function doReset() {
    if (!current) return;
    makeWriter(current.char);
    setStatus("Reset. Press “Animate strokes” or “Quiz me”.");
  }

  function doRandom() {
    if (!META.length) return;
    var pick;
    do {
      pick = META[Math.floor(Math.random() * META.length)];
    } while (META.length > 1 && current && pick.char === current.char);
    selectKanji(pick);
  }

  // ---- Build the picker chips ----
  function buildPicker() {
    META.forEach(function (entry) {
      var chip = document.createElement("button");
      chip.type = "button";
      chip.className = "kanji-chip";
      chip.textContent = entry.char;
      chip.dataset.char = entry.char;
      chip.setAttribute("aria-label", entry.char + " — " + entry.meaning);
      chip.addEventListener("click", function () { selectKanji(entry); });
      els.picker.appendChild(chip);
    });
  }

  // ---- Wire up & start ----
  function init() {
    if (typeof HanziWriter === "undefined") {
      setStatus("HanziWriter library failed to load. Check vendor/hanzi-writer.min.js.", "bad");
      return;
    }
    if (!META.length) {
      setStatus("No kanji metadata found (data/kanji-meta.js).", "bad");
      return;
    }

    buildPicker();
    els.btnAnimate.addEventListener("click", doAnimate);
    els.btnQuiz.addEventListener("click", doQuiz);
    els.btnReset.addEventListener("click", doReset);
    els.btnRandom.addEventListener("click", doRandom);

    // Start on the first kanji.
    selectKanji(META[0]);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
