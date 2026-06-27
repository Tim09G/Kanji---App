# 漢字 Kanji Practice (PWA) — work in progress

A personal web app for practicing kanji: stroke order, readings, meanings,
vocabulary, and (later) spaced-repetition review with flexible filtering.

Built in **phases**. This README reflects what works today.

---

## ✅ What works now

Three modes, reached from the Home screen:

### 🌱 Learn — pick up brand-new characters
- Choose how many new characters to learn this session.
- The app picks the next N characters in **study order** that you haven't
  learned yet.
- Each character is practiced across **4 progressively harder steps**:
  1. **Guided** — faint whole character + the current stroke highlighted, in order.
  2. **Order recall** — faint whole character, but you work out the stroke order.
  3. **Start points** — character hidden; only a dot shows where the next stroke begins.
  4. **Free recall** — no help at all; write it from memory.
- When learning several characters together, the steps are **interleaved**
  (step 1 of A, B, C → step 2 of A, B, C …) so you don't just cram one before
  moving on.
- A character **graduates into the review pool** after it's written from memory
  once in step 4. *(See "Decisions to revisit" below.)*

### ✎ Quiz — write a chosen set from memory
- A selection screen to **multi-select** which characters to be quizzed on.
- Then you write each one from memory, one at a time.

### 👁 Browse — study stroke order
- Look at any character with animated stroke order, meaning and readings.

### The draw screen (shared by Learn & Quiz)
- The kanji is **never shown** while you draw — not in the box, not in the side
  panel. Only your own strokes appear.
- A **cue panel** beside the draw area with toggleable hints (your choices are
  remembered):
  - **Meaning** (English)
  - **Readings** (in hiragana)
  - **Vocabulary** — example words in hiragana, with the part that corresponds
    to the kanji you're writing shown in **bold**. Tap a word to reveal its
    English meaning.

Progress is saved on your device (localStorage), so the Home screen shows how
many characters are *new*, *learning*, or *in review*.

### Sample set
14 beginner kanji: 一 二 三 人 日 月 火 水 木 金 土 山 川 口

Works **offline** — the renderer and all stroke data are bundled in the repo.

---

## 🧭 Decisions to revisit

- **What counts as "graduating" from Learn step 4:** currently **one** correct
  free-recall write-through (you may retry individual strokes). This is the
  agreed default — easy to change to e.g. "no mistakes" or "two clean attempts"
  later. See `LEARN_STEPS` / `Store.graduate` in the code.
- **Study order** is currently the curated list order (roughly by grade). Real
  ordering by JLPT level / frequency comes when KANJIDIC2 data is added.
- **Vocabulary** is a small hand-authored set for now; JMdict integration is a
  later phase.
- **Spaced repetition (FSRS)** isn't built yet — graduating just moves a
  character into the review pool. The scheduler is a later phase.

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
