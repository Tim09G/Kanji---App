# 漢字 Kanji Practice (PWA) — work in progress

A personal web app for practicing kanji: stroke order, readings, meanings,
vocabulary, and (later) spaced-repetition review with flexible filtering.

Built in **phases**. This README reflects what works today.

---

## ✅ What works now

Modes reached from the Home screen: **Study**, **Browse**, **Settings**.
Learn and review are unified into one **Study** flow over a single kanji list, so
mixing new and due characters behaves consistently.

### ✎ Study — the shared list: search, filter, sort, write from memory
- A single entry point for any session: pure review, pure new-learning, or a mix.
- A **"New kanji to add" slider** at the bottom mixes in that many brand-new
  characters (0 = review only); the rest of the session comes from your selection.
- New characters are practiced across **4 progressively harder steps** (Guided →
  Order recall → Start points → Free recall), interleaved; a character **graduates
  into the review pool** after step 4.
- **Prior kanji** button on the draw screen shows the previous character read-only;
  tap to return and continue (disabled during the 1s auto-advance countdown).
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

### 👁 Browse — full per-kanji reference
- Search (typed) + animated stroke order, with the full info panel: readings,
  meaning, stroke count, frequency, JLPT, radical, alternate radical-usage forms
  (e.g. 手 → 扌), and the complete vocabulary list with **audio** (🔊).

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
- **Vocabulary audio** (🔊) plays each example word (Web Speech API). It selects an
  installed Japanese system voice and waits for voices to finish loading, so playback
  is reliable on browsers that load TTS voices asynchronously. (If your device has no
  Japanese voice installed, the OS may substitute a default voice or stay silent —
  that's a system-voice setting, not the app.)
- **Results** ("Session Complete") show **Newly Learned** (blue), the **Reviewed
  Kanji** score (distinct kanji correct), and the **Missed** kanji (red).
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

### Full kanji set
**2,998 kanji**: every **jōyō** (2,136 regular-use) plus **jinmeiyō** (862
name-use) character. Each one is generated from open data:
- **Stroke order** from KanjiVG (HanziWriter format).
- **Metadata** (meaning, on/kun readings, grade, JLPT, frequency rank, stroke
  count, classifying radical) from KANJIDIC2.
- **Vocabulary** from the **full JMdict** (not just the common-word subset),
  grouped ≥2 per *common* reading and aiming for ≥8 total **where the data supports
  it** — no padding. Common words are ranked first; rarer/variant kanji still get
  their real (less-common) words. A small number of very rare characters have few or
  no example words; that's expected.
- **Radical & component highlighting** from KanjiVG, and a **"Similar to"** list
  computed across the whole set by shared components.

The 14 core beginner kanji keep their hand-authored vocabulary.

**Known data gaps (flagged):**
- **89 kanji** (e.g. compatibility-ideograph variants whose stroke count differs
  from the standard KanjiVG glyph) get **no radical/component highlighting** — they
  keep stroke data, metadata and vocab, but the highlight is omitted rather than
  shown misaligned.
- **~175 kanji** (very rare characters, and kyūjitai/variant forms that only appear
  in JMdict's search-only spellings) have **no vocabulary** because JMdict has no
  displayable word for them — left empty by design, not padded.

Works **offline** — the renderer and all stroke data are bundled in the repo.

---

## 🧭 Decisions to revisit

- **Spaced repetition uses real FSRS** (`js/scheduler.js`, backed by the vendored
  [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) library). Every
  attempt feeds a 4-point rating into FSRS, which returns the next interval/due
  date; that drives "due for review", "most overdue" sorting and the home count.
  Per-kanji FSRS card state (stability, difficulty, due, reps, lapses…) is stored
  in localStorage. Notes on configuration:
  - **Rating mapping** from the app's signals: **Again** = needed a hint / gave up /
    skipped; **Hard** = clean completion but with ≥1 stroke redo; **Good** = clean
    pass with no redos. **Easy is currently unused** — there's no reliable existing
    signal to separate it from Good, so clean passes default to Good (flagged).
  - **Desired retention** = FSRS standard default (0.9); not user-adjustable yet.
  - **Short-term (minute-scale) learning steps are disabled** so intervals are
    day-scale from the first review — within-session learning is already handled by
    the app's Learn scaffolding and failure side-loop.
  - A newly-graduated kanji is now scheduled a few days out (Good → ~3 days) rather
    than being immediately due.
  - The **FSRS-derived Difficulty filter categories and mastery-level breakdown**
    are a deferred follow-up (read-only views into FSRS state).
- **What counts as "graduating" from Learn step 4:** completing the character once
  (you may retry strokes). Easy to make stricter later — see `Store.graduate` /
  `runLearnSession` in the code.
- **A "successful" quiz attempt** = completed with **zero mistakes** (drives the
  auto-advance and the difficulty/scheduler tracking).
- **Study order** sorts by grade then frequency (most common first), from full
  KANJIDIC2 data.
- **Vocabulary** is generated from the **full JMdict** for the whole set (grouped
  ≥2 per common reading, aiming ≥8 total where data supports), with the 14 core
  kanji keeping their richer hand-authored lists. Words are matched against **every
  writing form** of a kanji (so variant/kyūjitai characters get their own words) and
  ranked by commonness, with proper-noun/name senses filtered out. ~175 very rare
  kanji have no displayable JMdict word and are intentionally left empty.
- **Radicals** use the classifying **Kangxi radical glyph** (from KanjiVG's
  KANJIDIC-aligned tags) plus a **Japanese hiragana name** (e.g. 水 → さんずい);
  the radical filter groups by that glyph across the full set.
- **Home counts** show total-learned and due-for-review; a mastery-level breakdown
  is a planned future addition (TODO in `renderHome`).
- **Stroke data is uniformly local KanjiVG** — verified all kanji have valid local
  stroke files with no missing/fallback source (so the calligraphic look is the
  standard KanjiVG style, not a loading gap).
- **Draw-to-search** (handwriting lookup) is deferred; typed search (character /
  reading / meaning) ships first.
- **Radical Japanese names** come from a hand-built map over the radicals in the
  current set; component meanings/readings are looked up from the KANJIDIC2 dataset.
- **Radical source**: the classifying radical uses KanjiVG's KANJIDIC-aligned radical
  tags with `general` > `tradit` > `nelson` priority (a standalone KANJIDIC2 radical
  JSON wasn't reachable from this environment). This gives the Kangxi classical radical
  (e.g. 半 → 十, 前 → 刂). Components descend through positional wrappers so compounds
  like 前 decompose correctly.

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
js/scheduler.js       Spaced-repetition scheduling — real FSRS (vendored ts-fsrs)
js/filters.js         Quiz filter/sort/shuffle "session builder"
js/drawscreen.js      The shared "draw a character" screen + cue panel
js/app.js             Screen router + Browse / Quiz / Learn controllers
data/kanji-meta.js    Curated metadata + vocabulary for the 14 core kanji
data/kanji-gen-1..4.js  Auto-generated metadata + vocab + similar for the full set
                        (2,136 jōyō + 862 jinmeiyō), from KANJIDIC2 + JMdict
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
- Kanji metadata & radicals: [KANJIDIC2](https://www.edrdg.org/wiki/index.php/KANJIDIC_Project)
  (CC BY-SA 4.0, EDRDG).
- Vocabulary & furigana: [JMdict / JMdict-simplified](https://github.com/scriptin/jmdict-simplified)
  and [JmdictFurigana](https://github.com/Doublevil/JmdictFurigana) (EDRDG licence).
