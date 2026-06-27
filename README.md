# 漢字 Kanji Practice (PWA) — work in progress

A personal web app for practicing kanji: stroke order, readings, meanings,
vocabulary, and (later) spaced-repetition review with flexible filtering.

Built in **phases**. This README reflects what works today.

---

## ✅ What works now

Three modes, reached from the Home screen:

### 🌱 Learn — pick up new characters
Two modes:
- **Next in order** (default) — choose how many new characters (up to 15) and the
  app takes the next ones in study order.
- **Choose specific** — hand-pick any characters (no limit), e.g. to bulk-add ones
  you already know. Characters you've never studied get the full 4-step flow;
  characters already in your review pool are just reviewed — all **mixed together**
  in one interleaved session.

New characters are practiced across **4 progressively harder steps**:
  1. **Guided** — faint whole character + the current stroke highlighted, in order.
  2. **Order recall** — faint whole character, but you work out the stroke order.
  3. **Start points** — character hidden; only a dot shows where the next stroke begins.
  4. **Free recall** — no help at all; write it from memory.

When learning several at once, the steps are **interleaved** so you don't cram one
before moving on. A character **graduates into the review pool** after step 4.

### ✎ Quiz — filter, sort and write from memory
- **Always-on review tracking**: a banner shows which characters are **due for
  review** (independent of any filters) and can add them in one tap.
- **Filters** (combine with **AND**): not-reviewed-in (1 day … 6 months),
  stroke count, radical, similar characters, group, historical difficulty,
  learning stage.
- **Sort** the session (frequency, fewest strokes, most overdue…) or flip on
  **Randomize** to shuffle.
- Then write each selected character from memory.

### 👁 Browse — study stroke order
- Look at any character with animated stroke order, readings, meaning, stroke
  count and frequency.

### The draw screen (shared by Learn & Quiz)
- The kanji is **never shown** while you draw — only your own strokes appear.
- A **cue panel** with toggleable hints (remembered between sessions):
  **Frequency rank**, **Meaning**, **Readings** (hiragana), and **Vocabulary**
  (grouped by reading; ≥2 per reading and ≥8 total where the data has them).
  - Before you draw, vocab is shown **in hiragana** with the quizzed kanji's
    portion in **bold**. After you finish, it switches to the **real written form**.
  - Tap any vocab word to reveal its English meaning.
- **Advancing**: a clean write auto-advances after ~1 second. A wrong attempt (or
  any Learn step) waits until you **tap the character** to continue. No buttons,
  no stroke countdown.

Progress is saved on your device (localStorage); the Home screen shows how many
characters are *new*, *learning*, or *in review*, plus how many are **due**.

### Sample set
14 beginner kanji: 一 二 三 人 日 月 火 水 木 金 土 山 川 口

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
- **Vocabulary** is a hand-authored set (~6–8 words per kanji) for now; JMdict
  integration is a later phase. Stroke counts, frequency ranks and radicals come
  from an open KANJIDIC2-derived dataset.
- **"Group (of 50)" and similar-character lists** are minimal with only 14 sample
  kanji — the mechanism is there and scales when the full kanji set is loaded.

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
data/kanji-meta.js    Meanings, readings, vocabulary for the sample kanji
data/kanji/*.json     Stroke-order data per kanji (KanjiVG → HanziWriter format)
vendor/               The HanziWriter library (bundled so it works offline)
```

## 🙏 Data & libraries

- Stroke order data: [KanjiVG](https://kanjivg.tagaini.net/) (CC BY-SA 3.0),
  converted to HanziWriter format via
  [hanzi-writer-data-ja](https://github.com/mnako/hanzi-writer-data-ja).
- Stroke rendering & quiz: [HanziWriter](https://hanziwriter.org/) (MIT,
  see `vendor/hanzi-writer.LICENSE`).
