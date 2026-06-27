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

### ✎ Review — the shared list: filter, sort, write from memory
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
    in **bold**; after you finish, it switches to the **real written form**.
  - Tap any vocab word to reveal its English meaning.
- **Advancing**: a clean write auto-advances after ~1 second. A wrong attempt or any
  Learn step waits until you **tap the character** to continue. No stroke countdown.
- **Failure handling (Review)**: getting any stroke wrong on the first try reveals
  the correct character, then (after you tap) you immediately **redraw it from memory
  once**, the session continues, and that character is **queued once more at the very
  end** of the session.

Progress is saved on your device (localStorage); the Home screen shows how many
characters are *new*, *learning*, or *in review*, plus a tappable **due** count.

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
