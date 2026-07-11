/*
 * versions.js — Phase 32 B: the "Versions" reference field.
 *
 * Shows alternate STYLISTIC forms of a kanji (Kaisho 楷書 calligraphic, Hyōgai 表外
 * alternate glyph, Jinmeiyō 人名 name-use form) as tappable chips; tapping opens a
 * larger view in a modal overlay.
 *
 * WALL-OFF (Phase 30 constraint): this module renders pre-cleaned static SVGs from
 * data/versions/ via <img> tags ONLY. It never touches data/kanji/ (the stroke-
 * practice data), never parses stroke paths, and has no connection to HanziWriter.
 */
window.Versions = (function () {
  "use strict";

  var LABELS = { kaisho: "楷書", hyougai: "表外", jinmei: "人名" };
  var TITLES = { kaisho: "Kaisho (楷書) — calligraphic form", hyougai: "Hyōgai (表外) — alternate glyph form", jinmei: "Jinmeiyō (人名用) — name-use form" };

  function urlFor(char, kind) {
    var hex = char.codePointAt(0).toString(16);
    while (hex.length < 5) hex = "0" + hex;
    return "data/versions/" + hex + "-" + kind + ".svg";
  }

  // versions available for a kanji: ["kaisho", ...] or []
  function of(char) { return (window.KANJI_VERSIONS || {})[char] || []; }

  // ---- modal (created on demand, shared) ----
  var modal = null;
  function ensureModal() {
    if (modal) return modal;
    modal = document.createElement("div");
    modal.className = "version-modal";
    modal.hidden = true;
    var box = document.createElement("div"); box.className = "version-box";
    var img = document.createElement("img"); img.alt = "";
    var cap = document.createElement("div"); cap.className = "version-cap";
    box.appendChild(img); box.appendChild(cap);
    modal.appendChild(box);
    modal.addEventListener("click", function () { modal.hidden = true; });
    document.body.appendChild(modal);
    modal._img = img; modal._cap = cap;
    return modal;
  }
  function show(char, kind) {
    var m = ensureModal();
    m._img.src = urlFor(char, kind);
    m._cap.textContent = char + " — " + (TITLES[kind] || kind);
    m.hidden = false;
  }

  // Fill a container element with tappable version chips (or a dash when none).
  function fill(el, char) {
    el.innerHTML = "";
    var kinds = of(char);
    if (!kinds.length) { el.textContent = "—"; return; }
    kinds.forEach(function (kind) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "version-chip";
      b.textContent = LABELS[kind] || kind;
      b.title = (TITLES[kind] || kind) + " — tap to view";
      b.addEventListener("click", function (e) { e.stopPropagation(); show(char, kind); });
      el.appendChild(b);
    });
  }

  return { of: of, fill: fill, show: show };
})();
