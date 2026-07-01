# 漢字 Kanji Mastery (PWA) — work in progress

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
  in **romaji** (e.g. "sui").
- **Display order** (dropdown) sets how the list is shown; a separate **Review
  order** control (Random by default) sets the order characters come up *during*
  the session — two independent settings.
- **Grouped, sectioned display**: the list is broken into labelled sections that
  match the active order — JLPT level (Study order), grade, 2-stroke bands, 100-rank
  frequency bands, overdue/next-due day-ranges, or lapse percentiles. Kanji that
  don't fit the active order (e.g. jinmeiyō under JLPT) collect in an **"Outside
  current order"** bucket — nothing is ever hidden. An **"Ungrouped (plain list)"**
  order shows everything as one continuous list with no headers.
  - **Tapping a section header toggles selection** of every kanji in that section
    that's currently visible (tap again to clear just that section — other sections
    are untouched).
  - Each header has a **collapse/expand arrow** (just left of the count), and a
    **Collapse all / Expand all** button sits with Select-all / Clear. Headers stay
    sticky as you scroll. **Sections start collapsed** so the whole list is scannable
    at a glance.
  - The **Group** filter's blocks now follow the **active display order** (so under
    Study order/JLPT, "block 1 of 50" is the first 50 N5 kanji; under Grade, the
    first 50 by grade; etc.).
- **Always-on review tracking**: a **tappable** banner shows which characters are
  **due for review** (independent of any filters) — tap it to review exactly those.
- Each character shows its **status** (New / Learning / Due / Learned) in a
  **distinct colour**.
- **Filters** (combine with **AND**):
  - **Status** (New / Learning / Due / Learned).
  - **Not reviewed in** — 1 day … **2 years**; only surfaces kanji already in the SRS
    pool (reviewed at least once) whose time-since-review is ≥ the threshold.
  - **Difficulty** — derived from each card's **FSRS difficulty** (Hard / Medium /
    Easy), plus **Not attempted**; each option shows a one-line explanation.
  - **Times failed (lapses)** and **Leeches** (kept failing: ≥4 lapses, or ≥3 lapses
    on 40%+ of reviews) — surface personal trouble characters.
  - **JLPT level** and **School grade** (from KANJIDIC2).
  - **Stroke count**, **Radical**.
  - **Similar to** — type/enter **any** kanji; filters to it and its
    visually/structurally similar characters.
  - **Group** — an iOS-style **scroll-picker**: one wheel for block size (25/50/100/200)
    and one to scroll between blocks (the blocks follow the active display order).
- **Sort**: study order (JLPT), **ungrouped (plain list)**, **grade level**,
  frequency, fewest strokes, **most overdue**, **next due (soonest upcoming)**,
  **most failed** — or **Randomize** (review order).
- Starting a session handles each character by its status: new ones get the
  scaffolding, known ones get reviewed — mixed together.
- **Dense, responsive top controls**: display-order + filters share a row, search
  pairs with the new-kanji slider, and review order is a compact dropdown — all
  stacking to one-per-row on phone widths. The **Start button floats at the bottom**
  of the screen so it's always reachable.

### 👁 Browse — full per-kanji reference
- Search (typed) + **brisk** animated stroke order, with the full info panel: readings,
  meaning, stroke count, frequency, JLPT, radical, alternate radical-usage forms
  (e.g. 手 → 扌), and the vocabulary list as a **compact side-by-side grid of word
  chips** (grouped by reading) — **tap or hover a chip** to reveal its reading/English
  in a floating tooltip and play its audio (same interaction as the draw screen).
- The **same display-order, filter and grouped-section system as the Study list**
  (status, difficulty, JLPT/grade, lapses/leeches, similar-to, group, …) narrows and
  organises the Browse picker; section headers here are visual labels, each with a
  collapse arrow plus a **Collapse all / Expand all** button above the list.
- The **kanji display + info panel sit at the top**, with the order/filter/search
  controls and the kanji picker below. A small **floating Home button** sits over the
  kanji box (no heading row). The kanji and its meaning sit **side by side** at a
  compact size, and readings are labelled **音（おん）/訓（くん）** (no romaji).
- **Component hover**: hovering a recognisable component of the displayed kanji shows
  its meaning and main readings (the same system as the draw screen). On Browse the
  radical is *not* specially highlighted — component info only.

### ⚙️ Settings
- **Backup & restore** (data portability):
  - **Export data** downloads a single dated JSON file (e.g.
    `kanji-app-backup-2026-06-30.json`) containing all local data — per-kanji FSRS
    state (stability, due, lapses…), Learn progress, and settings. Keep it anywhere
    (cloud, email, USB) to guard against losing the device or having storage cleared.
  - **Import data** restores from a backup file, behind the same **two-confirmation**
    warning as Reset; the file is validated (app/version marker + structure) and a bad
    file is rejected with a clear message instead of corrupting anything. A safety
    auto-backup of the current state is taken right before importing.
  - **Automatic local backups** run with no action needed — at startup, **after every
    study session**, and every few hours — keeping the **last 3** snapshots in a
    separate storage slot. **Restore latest automatic backup** (also two-confirm)
    recovers from in-app corruption or an accidental reset. *(Local-only — it doesn't
    protect against the device/storage being wiped; that's what Export is for.)*
  - **Cloud backup (Google Drive)** — optional. Once connected (one-time setup,
    below), every automatic backup *also* uploads to a hidden app-folder in **your own
    Google Drive**, so your data survives losing the device. Cloud writes are
    best-effort: if you're offline they fail silently and retry on the next trigger —
    the local backup always happens regardless. **Restore from Google Drive** is in
    Settings, behind the same two-confirmation warning. See the setup guide below.
- **Manage learning state** — bulk-edit many kanji at once using the *same* search,
  filters, sort and section selection as the Study screen (so you can grab hundreds in
  a few taps). Two actions on the selection:
  - **Mark learned & due now** — drops the selected kanji straight into the review pool
    as *immediately due*, so an experienced learner can test into FSRS without
    re-learning each one by hand. (Any existing review schedule for them is reset.)
  - **Reset to unlearned** — sends the selected kanji back to "new", clearing their
    review history and Learn progress.
  Both take a safety auto-backup first and are confirmation-guarded.
- **Reset progress** lives here now, behind **two confirmations**.

### The draw screen (shared by Learn & Review)
- The kanji is **never shown** while you draw — only your own strokes appear.
- A small **floating back button** (top-left of the draw box) returns you to the
  list/menu you came from; there's no separate heading row taking up space.
- **No instruction text** clutters the box while you draw. When a character is
  finished a compact **result badge** appears on the buttons row — a green **✓** for a
  clean pass, a red **✗** for a miss (nothing shows while you're still drawing).
- After a correct answer the screen **auto-advances after ~1s**; **tapping the box**
  pauses that countdown (and tapping again continues). This tap works by **touch** on
  phones, not just mouse clicks.
- A **cue panel** with toggleable hints (remembered between sessions): Frequency
  rank, Meaning, Readings, and Vocabulary (grouped by reading; ≥2 per reading and ≥8
  total where the data has them). Readings use the same labelled **音（おん）/訓（くん）**
  rows as the Browse screen (hiragana, no romaji).
  - Before you draw, vocab is shown **in hiragana** with the quizzed kanji's portion
    in **bold**; after you finish, the written form is shown. **Tapping (or hovering)
    a vocabulary word** shows its reading/English in a floating tooltip **and plays
    its audio** — there's no separate audio icon, and the tooltip never pushes the
    layout. The vocab list sits in a **fixed-height scroll box** so a word-rich kanji
    doesn't stretch the panel.
  - The cue panel shows a **compact paired metadata block** (Frequency | JLPT,
    Radical | Variants, then Strokes) above the vocabulary grid; identity-revealing
    fields (Radical, Variants) stay blank until after you draw. The cue toggles
    (Freq / Mean / Read / Vocab) sit on one compact row at the bottom of the panel.
  - **Radical & component highlights** (from KanjiVG): after drawing, the radical's
    strokes are coloured on the character and shown as **radical + Japanese name in
    hiragana**; for compound kanji each component is **hoverable**, showing its
    meaning and two main readings.
- The **draw box has a thin border so the canvas is as large as possible**, and the
  draw box + cue panel **stack vertically on phone widths** (side by side on desktop).
- **Vocabulary audio** plays each example word (Web Speech API) — on the draw screen
  via the tap interaction above; Browse keeps an explicit 🔊 button for now. It selects
  an installed Japanese system voice and waits for voices to finish loading, so playback
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
  count, classifying radical) from KANJIDIC2. JLPT levels use the "new" (N5–N1)
  scale, whose public data (`jlpt_new`) is incomplete for a set of common kanji
  (e.g. 無, 分). For the 19 such kanji that *do* carry an official pre-2010 JLPT
  level (`jlpt_old`), the level is filled from that, mapped old→new (4→N5, 3→N4,
  2→N3, 1→N1) so they group correctly instead of falling into "outside the JLPT
  order". Kanji with no JLPT level in any source (mostly jinmeiyō) stay unlevelled.
- **Vocabulary** from the **full JMdict** (not just the common-word subset),
  grouped ≥2 per *common* reading and aiming for ≥8 total **where the data supports
  it** — no padding. Common words are ranked first; rarer/variant kanji still get
  their real (less-common) words. A small number of very rare characters have few or
  no example words; that's expected.
- **Radical & component highlighting** from KanjiVG, and a **"Similar to"** list
  computed across the whole set by shared components.
- **Archaic/variant forms** (compatibility-ideograph codepoints like 社 U+FA4C that
  KANJIDIC2 doesn't define separately) borrow the **meaning and readings of their
  modern equivalent** (found via Unicode NFKC) and are marked with an **"\*archaic"**
  tag, so they're never left blank.

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
  - The **Difficulty filter** now reads FSRS's per-card difficulty value (D, ~1–10):
    Hard (D≥7) / Medium (4≤D<7) / Easy (D<4), plus **Not attempted** for cards with
    no FSRS data. The **lapse** and **leech** filters also read FSRS card state
    (lapses / reps). The home screen also shows a **5-level mastery breakdown**
    (New / Learning / Mature / Seasoned / Mastered) derived from FSRS stability.
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
- **Home counts** show total-learned and due-for-review, plus a **5-level mastery
  breakdown** derived from each card's FSRS stability (S, ≈ the day-interval at which
  recall ~90%): **New** (untouched) · **Learning** (in Learn scaffolding) · **Mature**
  (graduated, S < 30 d) · **Seasoned** (30–120 d) · **Mastered** (≥ 120 d and not
  currently relapsed). Thresholds live in `js/scheduler.js` (`MATURE_MAX` /
  `MASTERED_MIN`) and are easy to tune.
- **Stroke data is uniformly local KanjiVG** — verified all kanji have valid local
  stroke files with no missing/fallback source (so the calligraphic look is the
  standard KanjiVG style, not a loading gap).
- **Search** is typed only (character / reading / meaning); the unbuilt
  draw-to-search input has been removed.
- **"Similar to"** matching uses component overlap weighted by component rarity
  (IDF): a shared distinctive component (e.g. 交 in 校/効/較/絞/郊) ranks far above a
  shared common radical (e.g. 木), and up to 12 candidates are surfaced — tuned to
  err broad (closer to Imiwa) while keeping the most visually-similar kanji on top.
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

## 🌐 Hosting it on GitHub Pages (for phone use + cloud backup)

To use the app on your phone and to enable Google Drive cloud backup, serve it from
a stable HTTPS address. The simplest free option, since it's already a GitHub repo:

1. In the repo on GitHub → **Settings → Pages**.
2. Under **Build and deployment**, set **Source = Deploy from a branch**, pick your
   branch (e.g. `main`) and folder **/ (root)**, then **Save**.
3. After a minute it'll publish at `https://<your-user>.github.io/<repo>/`
   (for this repo: `https://tim09g.github.io/Kanji---App/`).

(The repo includes a `.nojekyll` file so Pages serves the `data/` files as-is.)
The app uses only relative paths, so it works correctly under that sub-folder URL.

### Installing it to your home screen

There's a `manifest.webmanifest` + app icons, so once it's on HTTPS you can use
**Share → Add to Home Screen** (iOS Safari) or the browser's **Install** prompt
(Android/desktop Chrome). It then opens full-screen like a normal app.

**Works offline.** A service worker (`sw.js`) caches the app shell and the full
metadata/vocabulary datasets on first load, and caches stroke-order data as you use
it (plus a one-time background download of *all* stroke files after your first online
visit). After that first load you can go fully offline — open the app, browse, and run
complete Learn/Review sessions with FSRS scheduling and progress tracking; everything
it needs is local. Cloud backup simply skips while offline and syncs on the next
online trigger (Phase 20 behaviour). Vocabulary audio uses the device's built-in
Japanese voice, so it works offline where one is installed and is silently skipped
otherwise.

**About updates / caching:** HTML is fetched **network-first**, so when you're online
the app always loads the newest version (and every asset link also carries a `?v=NN`
tag bumped each release). When a new version activates, the app refreshes once to pick
it up. So offline caching does **not** cause a "stuck on an old version" problem — you
get offline use *and* prompt updates.

---

## ☁️ Cloud backup (Google Drive) setup

This is a **one-time** setup so the app can back up to a hidden folder in **your own**
Google Drive (no backend, no fees — it uses your Drive). You'll create a free Google
**OAuth Client ID** and paste it into Settings.

1. Go to **[console.cloud.google.com](https://console.cloud.google.com/)** and create
   a project (any name).
2. **APIs & Services → Library** → search **Google Drive API** → **Enable**.
3. **APIs & Services → OAuth consent screen** → choose **External** → fill the
   required app name / email → add **yourself as a Test user**. (You can leave it in
   "Testing" mode; you don't need Google to verify the app for personal use.)
4. **APIs & Services → Credentials → Create credentials → OAuth client ID** →
   Application type **Web application**. Under **Authorized JavaScript origins** add
   the exact address you serve the app from (e.g. `https://tim09g.github.io` and, for
   local testing, `http://localhost:8000`). **Create**.
5. Copy the **Client ID** (looks like `…apps.googleusercontent.com`).
6. In the app: **Settings → Cloud backup (Google Drive)** → paste the Client ID →
   **Connect Google Drive** → approve the Google consent screen. Done — from then on
   every automatic backup also syncs to Drive, and **Restore from Google Drive** is
   available in Settings.

Notes: the Client ID is **not a secret** (it's safe in the page). The app requests
only the `drive.appdata` scope, so it can *only* read/write its own hidden backup
file — it cannot see the rest of your Drive. The access token lives in memory for the
session only; nothing else is stored.

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
