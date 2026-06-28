# 漢字 Kanji Practice (PWA) — work in progress

A personal web app for practicing kanji: stroke order, readings, meanings,
vocabulary, and (later) spaced-repetition review with flexible filtering.

Built in **phases**. This README reflects what works today.

---

## ✅ What works now

Modes reached from the Home screen: **Learn**, **Review**, **Browse**, **Settings**.
Learn and Review share **one kanji list** and **one session engine**, so mixing new
and due characters behaves consistently.

### 🌱 Learn — pick up new characters
Choose how to pick what to learn:
- **Sequential** — a **slider (1–50)** picks the next new characters in study order.
- **Choose your own** — drops you into the **shared list** (same filters/randomize as
  Review), since choosing your own to learn is the same action as choosing to review.

New characters are practiced across **4 progressively harder steps** (Guided → Order
recall → Start points → Free recall), **interleaved** when learning several at once.
A character **graduates into the review pool** after step 4.

### ✎ Review — the shared list: search, filter, sort, write from memory
- **Search** for a kanji by typing the character, an English meaning, or a reading
  in **romaji** (e.g. "sui"). (Handwriting/draw-to-search is a planned fast-follow.)
- **Display order** (dropdown) sets how the list is shown; a separate **Review
  order** control (Random by default) sets the order characters come up *during*
  the session — two independent settings.
- **Always-on review tracking**: a **tappable** banner shows which characters are
  **due for review** (independent of any filters) — tap it to review exactly those.
- Each character shows its **status** (New / Learning / Due / Learned) in a
  **distinct colour**.
- **Filters** (combine with **AND**): status, not-reviewed-in (1 day … 6 months),
  stroke count, radical, similar characters, group, historical difficulty.
- **Sort** (frequency, fewest strokes, most overdue…) or **Randomize**.
- Starting a session handles each character by its status: new ones get the
  scaffolding, known ones get reviewed — mixed together.

### 👁 Browse — study stroke order
- Animated stroke order with readings, meaning, stroke count and frequency.

### ⚙️ Settings
- **Reset progress** lives here now, behind **two confirmations**.

### The draw screen (shared by Learn & Review)
- The kanji is **never shown** while you draw — only your own strokes appear.
- A **back button** returns you to the list/menu you came from.
- A **cue panel** with toggleable hints (remembered between sessions): Frequency
  rank, Meaning, Readings (hiragana), and Vocabulary (grouped by reading; ≥2 per
  reading and ≥8 total where the data has them).
  - Before you draw, vocab is shown **in hiragana** with the quizzed kanji's portion
    in **bold**; after you finish, the written form is shown with the hiragana
    reading and English **hidden until tapped**.
  - **Radical & component highlights** (from KanjiVG): after drawing, the radical's
    strokes are coloured on the character and shown as **radical + Japanese name in
    hiragana**; for compound kanji each component is **hoverable**, showing its
    meaning and two main readings.
- **Results** show the score as **distinct kanji correct** plus a **list of the
  kanji you missed**.
- **Per-stroke help**: get a stroke wrong and you get one redo; miss again and a
  **hint** is shown — repeating per stroke until the character is done.
- **Advancing**: a clean write auto-advances after ~1 second (tap during that second
  to pause and hold). A failed character is held until you tap.
- **Failure handling (Review)**: a character that needed a hint reveals the correct
  form and holds; after you tap you immediately redraw it at **scaffolding step 3**,
  the session continues, and it's **queued once more at the end**. Fail the step-3
  redo and it's retried again a few characters later; only once a redo succeeds does
  the end-of-session attempt get queued.
- **Learn step fallback**: failing a Learn step drops you back one step; you only
  advance after passing.
- **Scoring** counts **distinct kanji** (e.g. 3 reviewed, 1 failed → 2/3), not the
  extra retry attempts a failure generates.

Progress is saved on your device (localStorage); the Home screen shows **total
learned** and a tappable **due-for-review** count that updates live.

### Sample set
~104 kanji: the 14 hand-authored beginner kanji (with rich vocabulary) plus ~90
more (JLPT N5/N4 by frequency) generated from an open KANJIDIC2-derived dataset.

Works **offline** — the renderer and all stroke data are bundled in the repo.

---

## 🧭 Decisions to revisit

- **Spaced repetition is a lightweight placeholder.** `js/scheduler.js` uses a
  simple interval ladder (correct → longer gap, wrong → reset) so due-dates and
  the "due for review" flagging work today. It's deliberately a separate module
  so it can be swapped for **FSRS** later without touching the filters or UI.
- **What counts as "graduating" from Learn step 4:** completing the character once
  (you may retry strokes). Easy to make stricter later — see `Store.graduate` /
  `runLearnSession` in the code.
- **A "successful" quiz attempt** = completed with **zero mistakes** (drives the
  auto-advance and the difficulty/scheduler tracking).
- **Study order** is the curated list order. Real ordering by JLPT / frequency
  comes with full KANJIDIC2 data.
- **Vocabulary** is hand-authored (~6–8 words) only for the 14 core kanji; the ~90
  generated kanji have full metadata (meaning/readings/stroke/freq/radical) but no
  vocabulary or similar-character lists yet. JMdict integration is a later phase.
- **Radicals** use the dataset's WaniKani-style names (e.g. "Water") so the radical
  filter groups consistently across all kanji; proper Kangxi radical glyphs come
  with full KANJIDIC2 radical data.
- **Home counts** show total-learned and due-for-review; a mastery-level breakdown
  is a planned future addition (TODO in `renderHome`).
- **Stroke data is uniformly local KanjiVG** — verified all kanji have valid local
  stroke files with no missing/fallback source (so the calligraphic look is the
  standard KanjiVG style, not a loading gap).
- **Draw-to-search** (handwriting lookup) is deferred; typed search (character /
  reading / meaning) ships first.
- **Radical Japanese names** come from a hand-built map over the radicals in the
  current set; component meanings/readings are looked up from the KANJIDIC2 dataset.

---

## ▶️ How to run it

The app loads data files in the background, which browsers block if you open the
HTML file directly. So serve the folder with a tiny local web server:

**Python (already on most Macs/Linux):**
```
python3 -m http.server 8000
```
then open **http://localhost:8000**

**Node:**
```
npx serve .
```
then open the URL it prints.

Press `Ctrl + C` to stop the server.

---

## 📁 Project structure

```
index.html            The page + all screens (Home, Browse, Quiz, Learn, Draw, Done)
css/styles.css        Styling
js/store.js           Saves progress + cue settings (localStorage)
js/scheduler.js       Spaced-repetition due dates (separate; swappable for FSRS)
js/filters.js         Quiz filter/sort/shuffle "session builder"
js/drawscreen.js      The shared "draw a character" screen + cue panel
js/app.js             Screen router + Browse / Quiz / Learn controllers
data/kanji-meta.js    Curated metadata + vocabulary for the 14 core kanji
data/kanji-extra.js   Auto-generated metadata for ~90 more kanji (KANJIDIC2-derived)
data/kanji-components.js  Radical + component stroke groupings (from KanjiVG)
data/kanji/*.json     Stroke-order data per kanji (KanjiVG → HanziWriter format)
vendor/               The HanziWriter library (bundled so it works offline)
```

## 🙏 Data & libraries

- Stroke order data: [KanjiVG](https://kanjivg.tagaini.net/) (CC BY-SA 3.0),
  converted to HanziWriter format via
  [hanzi-writer-data-ja](https://github.com/mnako/hanzi-writer-data-ja).
- Stroke rendering & quiz: [HanziWriter](https://hanziwriter.org/) (MIT,
  see `vendor/hanzi-writer.LICENSE`).
