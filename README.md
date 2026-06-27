# 漢字 Kanji Practice (PWA) — work in progress

A personal web app for practicing kanji: stroke order, readings, meanings, and
(later) vocabulary, audio, spaced repetition, filtering, and randomized review.

This repository is being built in **phases**. Right now only **Phase 1** is done.

---

## ✅ Phase 1 (current): stroke order + draw-to-quiz

What works today:

- A small sample set of **14 beginner kanji** (一 二 三 人 日 月 火 水 木 金 土 山 川 口).
- **Animated stroke order** for each kanji.
- **Draw-to-quiz mode** — you write the kanji stroke by stroke and it checks
  the order and shape.
- **Meaning + on/kun readings + stroke count** shown beside each character.
- Works **offline** — the stroke renderer and stroke data are bundled in the repo,
  nothing is loaded from the internet at runtime.

Not yet built (planned phases): saving progress, the FSRS scheduler, the
filter + randomized-session builder, vocabulary, audio, and full PWA install.

---

## ▶️ How to run it on your computer

The app loads data files in the background, and browsers block that when you
open an HTML file directly (the `file://` way). So you need to serve the folder
with a tiny local web server. Two easy options:

### Option A — Python (already on most Macs/Linux)

1. Open a terminal in this project folder.
2. Run:
   ```
   python3 -m http.server 8000
   ```
3. Open your browser to: **http://localhost:8000**

### Option B — Node.js

1. In a terminal in this folder, run:
   ```
   npx serve .
   ```
2. Open the URL it prints (usually **http://localhost:3000**).

To stop the server, press `Ctrl + C` in the terminal.

---

## 🕹️ How to use it

- Click a kanji in the top row to select it.
- **▶ Animate strokes** — watch the correct stroke order.
- **✎ Quiz me** — draw the kanji yourself, one stroke at a time. Green means
  correct; if you miss a stroke 3 times it shows a hint.
- **↺ Reset** — clear and start the character over.
- **🎲 Random** — jump to a random kanji from the set.

---

## 📁 Project structure

```
index.html            The page itself
css/styles.css        Styling
js/app.js             App logic (picker, animation, quiz) — plain JavaScript
data/kanji-meta.js    Meanings + readings for the sample kanji (hand-authored for now)
data/kanji/*.json     Stroke-order data per kanji (KanjiVG → HanziWriter format)
vendor/               The HanziWriter drawing library (bundled so it works offline)
```

## 🙏 Data & libraries

- Stroke order data: [KanjiVG](https://kanjivg.tagaini.net/) (CC BY-SA 3.0),
  converted to HanziWriter format via
  [hanzi-writer-data-ja](https://github.com/mnako/hanzi-writer-data-ja).
- Stroke rendering & quiz: [HanziWriter](https://hanziwriter.org/) (MIT license,
  see `vendor/hanzi-writer.LICENSE`).
