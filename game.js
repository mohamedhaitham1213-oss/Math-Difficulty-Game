/* ==========================================================
   Math Adventure - adaptive difficulty testbed
   Sections:
     0. Settings from the link (?mode= ?level= ?lang= ?admin=1)
     1. Configuration
     2. Languages (English / Arabic)
     3. Question generator
     4. Features (accuracy, response time, retry rate)
     5. The three difficulty engines (static, rule-based, predictive)
     6. Visual and sound effects (decoration only)
     7. Game flow
     8. Data logging, saving and CSV export
     9. Info panel
    10. Start-up and event wiring
   ========================================================== */


/* ---------- 0. SETTINGS FROM THE LINK ----------
   Researcher link:  ...?admin=1
   Child link:       ...?mode=rule&level=2&lang=en
   mode  = static | rule | predictive | random   (hides the mode picker)
   level = 1 | 2 | 3                             (hides the level picker)
   lang  = en | ar                               (hides the language button)
   sound = 0                                     (starts muted)
   admin = 1                                     (shows pickers + CSV buttons)  */

const BUILD = "2026-10-29-v3";                   // logged with every row: which design made the data
const MODES = ["static", "rule", "predictive"];

const params = new URLSearchParams(location.search);
const ADMIN = params.get("admin") === "1";

let URL_MODE = params.get("mode");
if (URL_MODE === "random") URL_MODE = MODES[Math.floor(Math.random() * MODES.length)];
if (!MODES.includes(URL_MODE)) URL_MODE = null;

const URL_LEVEL = [1, 2, 3].includes(Number(params.get("level"))) ? Number(params.get("level")) : null;
const URL_LANG = ["en", "ar"].includes(params.get("lang")) ? params.get("lang") : null;
const URL_MUTED = params.get("sound") === "0";


/* ---------- 1. CONFIGURATION ---------- */

const N_QUESTIONS = 12;                          // questions per session
const WINDOW = 3;                                // features use the last 3 answers
const MIN_LEVEL = 1;
const MAX_LEVEL = 3;
const LEVEL_ICONS = { 1: "🌱", 2: "⭐", 3: "🔥" };
const MODE_ICONS = { static: "🧊", rule: "📏", predictive: "🔮" };

// Rule-based engine
const RULE_STREAK_UP = 3;                        // correct in a row -> harder
const RULE_WRONG_DOWN = 2;                       // wrong in a row -> easier

// Predictive engine: logistic regression
//   z = b + w_acc*accuracy + w_time*time + w_retry*retry
//   p = 1 / (1 + e^(-z))
// PLACEHOLDER weights - replace with weights trained in Python.
// The info panel in the mode screen reads these values automatically.
const MODEL = { b: -0.5, w_acc: 4.0, w_time: -1.5, w_retry: -3.0 };
const P_UP = 0.70;                               // p above this -> harder
const P_DOWN = 0.35;                             // p below this -> easier
const TIME_CAP_MS = 15000;                       // response time capped, scaled to 0..1

const DELAY_NEXT_MS = 1200;                      // pause before the next question

const el = id => document.getElementById(id);

// The mode is chosen in the "Select mode" overlay or fixed by the link.
function getMode() {
  return el("mode-select").value;
}

function readStore(key) {
  try { return localStorage.getItem(key); } catch (e) { return null; }
}
function writeStore(key, value) {
  try { localStorage.setItem(key, value); } catch (e) { /* storage may be blocked */ }
}


/* ---------- 2. LANGUAGES (ENGLISH / ARABIC) ----------
   {name}, {total}, ... are filled in by t(). Strings that contain
   <b> or <bdi> are shown with innerHTML (they never contain user input). */

const T = {
  en: {
    appName: "Math Adventure",
    hi: "Hi! I'm Numo. Let's do some math!",
    subtitle: "Answer the questions and collect your stars!",
    nameLabel: "What's your name?",
    namePh: "Your name or nickname",
    defaultName: "Player",
    modeLabel: "Game mode",
    selectMode: "🎮 Select mode",
    modeBtn: "{icon} Mode: {mode}",
    levelLabel: "Starting level",
    easy: "🌱 Easy", medium: "⭐ Medium", hard: "🔥 Hard",
    lvl1: "Easy", lvl2: "Medium", lvl3: "Hard",
    start: "▶ Start",
    qCount: "Question {n} / {total}",
    wellDone: "Well done!",
    summary: "{name}, your mark: {c} / {total}",
    playAgain: "🔄 Play again",
    download: "📥 Download this session (CSV)",
    downloadAll: "📦 Download ALL saved sessions",
    chooseMode: "Choose your game mode 🎮",
    mode_static: "Static",
    mode_rule: "Rule-based",
    mode_predictive: "Predictive",
    info_static: "The difficulty never changes. You stay on the level you started with for all {total} questions.",
    info_rule: "Simple rules: {streakUp} correct answers in a row makes the game harder, and {wrongDown} wrong answers in a row makes it easier.",
    info_predictive: "A small model looks at your last {window} answers (accuracy, speed and retries) and predicts the best next level.",
    cancel: "Cancel",
    gotIt: "Got it!",
    infoTitle: "How does Predictive mode think? 🤔",
    modeChosen: "{mode} mode. Good choice!",
    letsGo: "Let's go, {name}!",
    correct: "Correct! ⭐",
    tryAgain: "Try again!",
    answerWas: "The answer was {a}",
    levelUp: "Level up! 🚀",
    levelDown: "Let's practise a bit more! 🌱",
    quitTitle: "Stop playing?",
    quitText: "Your stars so far will be saved.",
    quitYes: "Yes, stop",
    quitNo: "Keep playing",
    endTop: "Math superstar, {name}!",
    endMid: "Great work, {name}!",
    endLow: "Nice try, {name}! Play again for more stars!",
    sayPlus: "plus", sayMinus: "minus", sayTimes: "times", sayEquals: "equals what?",
    langAria: "Change language",
    soundAria: "Sound on or off",
    quitAria: "Stop playing",
    speakAria: "Read the question aloud",
    infoAria: "How does Predictive mode work?",
    praise: ["Super!", "Awesome!", "You got it!", "Brilliant!", "Great job!", "Wow, nice one!"],
    retry: ["Oops! Try once more.", "Almost! Give it another go.", "Not quite. You can do it!"],
    miss: ["That one was tricky! On to the next.", "Good try! Let's keep going."],
    newQ: ["What's the answer?", "You can do it!", "Let's see...", "Here's a new one!"],

    // info panel
    iT1: "1. It watches your last {window} answers",
    i1: "The game looks at how you did on your last {window} questions and uses three clues. It waits until you have answered {window} questions at a level, so one lucky (or unlucky) answer can never change things on its own.",
    iT2: "2. The three clues and their weights",
    i2: "A <b>weight</b> tells the game how important a clue is. The bigger the number, the more that clue matters. A <b>+</b> means the clue adds points, a <b>−</b> means it takes points away.",
    iAcc: "✅ <b>Right the first time</b> (accuracy): from 0 (none) to 1 (all {window}). Weight {w} → {effect}.",
    iTime: "⏱️ <b>Speed</b> (how long you think): from 0 (super fast) to 1 ({cap} seconds or more). Weight {w} → {effect}.",
    iRetry: "🔁 <b>Retries</b> (extra tries needed): the average number of retries per question. Weight {w} → {effect}.",
    effAdd: "adds points",
    effSub: "takes points away",
    iT3: "3. Add it all up: the score z",
    i3: "Each clue is multiplied by its weight, and everything is added to a starting number ({b}, called b). The result is your score <b>z</b>:",
    fAcc: "accuracy", fTime: "speed", fRetry: "retries",
    iT4: "4. Turn the score into a ready-chance",
    i4: "The score z is turned into a <b>ready-chance p</b> between 0% and 100%, which says how ready you are for harder questions:",
    iT5: "5. The game decides",
    i5Up: "🚀 If <b>p is above {pUpPct}</b> ({cond}) → the next level is <b>harder</b>.",
    i5Down: "🌱 If <b>p is below {pDownPct}</b> ({cond}) → the next level is <b>easier</b>.",
    i5Stay: "👍 In between → you <b>stay</b> on the same level.",
    iT6: "6. Examples",
    ex1: "3 of 3 right the first time, about 5 seconds each, no retries",
    ex2: "2 of 3 right the first time, one retry, about 7.5 seconds each",
    ex3: "1 of 3 right the first time, two retries, about 12 seconds each",
    exResult: "z = {z} → ready-chance p = {p} → <b>{outcome}</b>",
    outUp: "🚀 harder level",
    outDown: "🌱 easier level",
    outStay: "👍 stay on the same level"
  },

  ar: {
    appName: "مغامرة الرياضيات",
    hi: "مرحباً! أنا نومو. هيا نحل بعض المسائل!",
    subtitle: "أجب عن الأسئلة واجمع نجومك!",
    nameLabel: "ما اسمك؟",
    namePh: "اسمك أو لقبك",
    defaultName: "لاعب",
    modeLabel: "نمط اللعب",
    selectMode: "🎮 اختر النمط",
    modeBtn: "{icon} النمط: {mode}",
    levelLabel: "مستوى البداية",
    easy: "🌱 سهل", medium: "⭐ متوسط", hard: "🔥 صعب",
    lvl1: "سهل", lvl2: "متوسط", lvl3: "صعب",
    start: "▶ ابدأ",
    qCount: "السؤال {n} / {total}",
    wellDone: "أحسنت!",
    summary: "{name}، درجتك: {c} / {total}",
    playAgain: "🔄 العب مرة أخرى",
    download: "📥 تنزيل هذه الجلسة (CSV)",
    downloadAll: "📦 تنزيل كل الجلسات المحفوظة",
    chooseMode: "اختر نمط اللعب 🎮",
    mode_static: "ثابت",
    mode_rule: "بالقواعد",
    mode_predictive: "تنبؤي",
    info_static: "الصعوبة لا تتغير أبداً. تبقى على المستوى الذي بدأت به في كل الأسئلة الـ {total}.",
    info_rule: "قواعد بسيطة: عندما تجيب {streakUp} مرات صحيحة متتالية تصبح اللعبة أصعب، وعندما تخطئ {wrongDown} مرات متتالية تصبح أسهل.",
    info_predictive: "نموذج صغير ينظر إلى آخر {window} إجابات لك (الدقة والسرعة والمحاولات) ويتوقع أفضل مستوى قادم.",
    cancel: "إلغاء",
    gotIt: "فهمت!",
    infoTitle: "كيف يفكر النمط التنبؤي؟ 🤔",
    modeChosen: "نمط {mode}. اختيار رائع!",
    letsGo: "هيا بنا يا {name}!",
    correct: "صحيح! ⭐",
    tryAgain: "حاول مرة أخرى!",
    answerWas: "الإجابة كانت {a}",
    levelUp: "ارتقيت مستوى! 🚀",
    levelDown: "لنتدرب أكثر قليلاً! 🌱",
    quitTitle: "هل تريد التوقف؟",
    quitText: "ستُحفظ نجومك حتى الآن.",
    quitYes: "نعم، أوقف",
    quitNo: "تابع اللعب",
    endTop: "نجم الرياضيات يا {name}!",
    endMid: "عمل رائع يا {name}!",
    endLow: "محاولة جميلة يا {name}! العب مرة أخرى لتجمع نجوماً أكثر!",
    sayPlus: "زائد", sayMinus: "ناقص", sayTimes: "ضرب في", sayEquals: "يساوي كم؟",
    langAria: "تغيير اللغة",
    soundAria: "تشغيل الصوت أو إيقافه",
    quitAria: "إيقاف اللعب",
    speakAria: "اقرأ السؤال بصوت عالٍ",
    infoAria: "كيف يعمل النمط التنبؤي؟",
    praise: ["رائع!", "ممتاز!", "أحسنت!", "عبقري!", "عمل جميل!", "واو، إجابة رائعة!"],
    retry: ["أوه! حاول مرة أخرى.", "اقتربت! جرّب مرة أخرى.", "ليس تماماً. أنت تستطيع!"],
    miss: ["هذا السؤال صعب! هيا إلى التالي.", "محاولة جيدة! لنكمل."],
    newQ: ["ما الإجابة؟", "أنت تستطيع!", "لنرَ...", "هذا سؤال جديد!"],

    // info panel
    iT1: "1. يراقب آخر {window} إجابات لك",
    i1: "تنظر اللعبة إلى أدائك في آخر {window} أسئلة وتستخدم ثلاثة أدلة. وتنتظر حتى تجيب عن {window} أسئلة في المستوى الواحد، فلا تستطيع إجابة واحدة محظوظة (أو سيئة الحظ) أن تغيّر شيئاً وحدها.",
    iT2: "2. الأدلة الثلاثة وأوزانها",
    i2: "<b>الوزن</b> يخبر اللعبة بمدى أهمية الدليل. كلما كان الرقم أكبر زادت أهمية الدليل. علامة <b>+</b> تعني أن الدليل يضيف نقاطاً، وعلامة <b>−</b> تعني أنه يأخذ نقاطاً.",
    iAcc: "✅ <b>الإجابة الصحيحة من أول مرة</b> (الدقة): من 0 (لا شيء) إلى 1 (كل الأسئلة الـ {window}). الوزن {w} ← {effect}.",
    iTime: "⏱️ <b>السرعة</b> (مقدار تفكيرك): من 0 (سريع جداً) إلى 1 ({cap} ثانية أو أكثر). الوزن {w} ← {effect}.",
    iRetry: "🔁 <b>المحاولات</b> (المحاولات الإضافية): متوسط عدد المحاولات الإضافية لكل سؤال. الوزن {w} ← {effect}.",
    effAdd: "يضيف نقاطاً",
    effSub: "يأخذ نقاطاً",
    iT3: "3. اجمع كل شيء: الدرجة z",
    i3: "يُضرب كل دليل في وزنه، ثم يُجمع الكل مع رقم البداية ({b}، ويُسمى b). والناتج هو درجتك <b>z</b>:",
    fAcc: "الدقة", fTime: "السرعة", fRetry: "المحاولات",
    iT4: "4. حوّل الدرجة إلى فرصة الاستعداد",
    i4: "تتحول الدرجة z إلى <b>فرصة استعداد p</b> بين 0% و100%، تبيّن مدى استعدادك لأسئلة أصعب:",
    iT5: "5. اللعبة تقرر",
    i5Up: "🚀 إذا كانت <b>p أكبر من {pUpPct}</b> ({cond}) ← المستوى القادم <b>أصعب</b>.",
    i5Down: "🌱 إذا كانت <b>p أقل من {pDownPct}</b> ({cond}) ← المستوى القادم <b>أسهل</b>.",
    i5Stay: "👍 وإذا كانت بينهما ← <b>تبقى</b> في المستوى نفسه.",
    iT6: "6. أمثلة",
    ex1: "3 من 3 صحيحة من أول مرة، حوالي 5 ثوانٍ لكل سؤال، بلا محاولات إضافية",
    ex2: "2 من 3 صحيحة من أول مرة، محاولة إضافية واحدة، حوالي 7.5 ثانية لكل سؤال",
    ex3: "1 من 3 صحيحة من أول مرة، محاولتان إضافيتان، حوالي 12 ثانية لكل سؤال",
    exResult: "z = {z} ← فرصة الاستعداد p = {p} ← <b>{outcome}</b>",
    outUp: "🚀 مستوى أصعب",
    outDown: "🌱 مستوى أسهل",
    outStay: "👍 البقاء في المستوى نفسه"
  }
};

let lang = URL_LANG || readStore("mathgame_lang") || "en";
if (!T[lang]) lang = "en";

// Text for a key in the current language, with {placeholders} filled in.
function t(key, vars) {
  const raw = (T[lang] && T[lang][key] !== undefined) ? T[lang][key] : T.en[key];
  if (raw === undefined) return key;
  const all = Object.assign(
    { total: N_QUESTIONS, streakUp: RULE_STREAK_UP, wrongDown: RULE_WRONG_DOWN, window: WINDOW },
    vars
  );
  return String(raw).replace(/\{(\w+)\}/g, (m, k) => (k in all ? all[k] : m));
}

// A list of lines (praise, retry, ...) in the current language.
function tl(key) {
  return (T[lang] && T[lang][key]) || T.en[key];
}

// Puts the current language on every labelled element of the page.
function applyLang() {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";

  document.querySelectorAll("[data-i18n]").forEach(node => {
    if (!node.classList.contains("rainbow")) node.textContent = t(node.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-ph]").forEach(node => {
    node.placeholder = t(node.dataset.i18nPh);
  });
  document.querySelectorAll("[data-i18n-aria]").forEach(node => {
    node.setAttribute("aria-label", t(node.dataset.i18nAria));
  });

  rainbowTitles();
  refreshModeButton();
  el("lang-button").textContent = lang === "ar" ? "EN" : "عربي";
  if (!state.mode) el("bubble").textContent = t("hi");   // greeting, before the game starts
}

function refreshModeButton() {
  const m = getMode();
  el("select-mode-button").textContent = m
    ? t("modeBtn", { icon: MODE_ICONS[m], mode: t("mode_" + m) })
    : t("selectMode");
}


/* ---------- 3. QUESTION GENERATOR ---------- */

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Fair shuffle (Fisher-Yates) - returns a new list.
function shuffle(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Returns { text, answer, a, b, op } for the given level.
function makeProblem(level) {
  let a, b;

  if (level === 1) {                             // Easy: add/subtract within 20
    if (Math.random() < 0.5) {
      a = randomInt(1, 10); b = randomInt(1, 10);
      return { text: `${a} + ${b}`, answer: a + b, a, b, op: "+" };
    }
    a = randomInt(5, 20); b = randomInt(1, a);
    return { text: `${a} − ${b}`, answer: a - b, a, b, op: "−" };
  }

  if (level === 2) {                             // Medium: within 100, tables 2-5
    const type = randomInt(1, 3);
    if (type === 1) {
      a = randomInt(10, 60); b = randomInt(10, 39);
      return { text: `${a} + ${b}`, answer: a + b, a, b, op: "+" };
    }
    if (type === 2) {
      a = randomInt(30, 99); b = randomInt(10, a - 1);
      return { text: `${a} − ${b}`, answer: a - b, a, b, op: "−" };
    }
    a = randomInt(2, 5); b = randomInt(2, 10);
    return { text: `${a} × ${b}`, answer: a * b, a, b, op: "×" };
  }

  // Hard: tables up to 12, two-digit addition
  if (Math.random() < 0.6) {
    a = randomInt(6, 12); b = randomInt(6, 12);
    return { text: `${a} × ${b}`, answer: a * b, a, b, op: "×" };
  }
  a = randomInt(45, 99); b = randomInt(45, 99);
  return { text: `${a} + ${b}`, answer: a + b, a, b, op: "+" };
}

// The 4 answer buttons: the right answer plus 3 believable wrong ones
// (off by 1, 2 or 10, the wrong operation, one table too many or too few).
function makeOptions(p) {
  const ans = p.answer;
  const pool = [ans + 1, ans - 1, ans + 2, ans - 2, ans + 10, ans - 10];
  if (p.op === "×") pool.push(ans + p.a, ans - p.a, ans + p.b, ans - p.b);
  if (p.op === "+") pool.push(Math.abs(p.a - p.b));
  if (p.op === "−") pool.push(p.a + p.b);

  const wrong = shuffle([...new Set(pool)].filter(v => v >= 0 && v !== ans)).slice(0, 3);
  const options = new Set([ans, ...wrong]);
  while (options.size < 4) {                     // safety net: random numbers near the answer
    const v = ans + randomInt(-10, 10);
    if (v >= 0) options.add(v);
  }
  return shuffle([...options]);
}

function makeQuestion(level) {
  const problem = makeProblem(level);
  problem.options = makeOptions(problem);
  return problem;
}


/* ---------- 4. FEATURES ---------- */

// Computed over the last WINDOW answered questions.
//   accuracy: share answered correctly on the first try (0..1)
//   time:     average response time, capped and scaled (0..1)
//   retry:    average number of retries per question
function computeFeatures(history) {
  const last = history.slice(-WINDOW);
  const n = last.length;

  const accuracy = last.filter(h => h.correct).length / n;
  const avgTime = last.reduce((sum, h) => sum + h.timeMs, 0) / n;
  const time = Math.min(avgTime, TIME_CAP_MS) / TIME_CAP_MS;
  const retry = last.reduce((sum, h) => sum + h.retries, 0) / n;

  return { accuracy, time, retry };
}


/* ---------- 5. THE THREE DIFFICULTY ENGINES ----------
   Each engine receives the game state and the features and
   returns { level, p }. p is only used by the predictive engine. */

function clampLevel(level) {
  return Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, level));
}

// Engine 1: static - the level never changes.
function staticEngine(state) {
  return { level: state.level, p: null };
}

// Engine 2: rule-based - "3 correct in a row -> harder, 2 wrong in a row -> easier".
function ruleEngine(state) {
  if (state.streak >= RULE_STREAK_UP) {
    state.streak = 0;
    return { level: clampLevel(state.level + 1), p: null };
  }
  if (state.wrongStreak >= RULE_WRONG_DOWN) {
    state.wrongStreak = 0;
    return { level: clampLevel(state.level - 1), p: null };
  }
  return { level: state.level, p: null };
}

// The logistic regression itself. Used by the engine AND by the info panel,
// so the explanation always matches what the game really does.
function modelScore(features) {
  const z = MODEL.b
          + MODEL.w_acc * features.accuracy
          + MODEL.w_time * features.time
          + MODEL.w_retry * features.retry;
  return { z, p: 1 / (1 + Math.exp(-z)) };
}

// What the model would do at this moment (also used as the "shadow" prediction
// that is logged in the static and rule-based modes).
function predictiveDecision(level, answersInWindow, features) {
  const { p } = modelScore(features);

  // Wait until there are WINDOW answers at the current level, so one lucky
  // (or unlucky) answer cannot change the level on its own.
  if (answersInWindow < WINDOW) return { level, p };

  let next = level;
  if (p > P_UP) next = clampLevel(level + 1);
  else if (p < P_DOWN) next = clampLevel(level - 1);
  return { level: next, p };
}

// Engine 3: predictive - logistic regression gives P(ready for harder).
function predictiveEngine(state, features) {
  return predictiveDecision(state.level, state.history.length, features);
}

function chooseNextLevel(state, features) {
  if (state.mode === "static") return staticEngine(state);
  if (state.mode === "rule") return ruleEngine(state);
  return predictiveEngine(state, features);
}


/* ---------- 6. VISUAL AND SOUND EFFECTS ----------
   Everything here is decoration only. It never touches the
   questions, the engines, the features or the logged data. */

const CONFETTI_COLORS = ["#ff5d8f", "#ffd23f", "#2ec27e", "#4d7cff", "#9b5de5", "#ff9f1c"];
const BG_SYMBOLS = ["+", "−", "×", "÷", "=", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "%", "π", "∞"];

function pick(list) {
  return list[randomInt(0, list.length - 1)];
}

// Restart a CSS animation that is driven by a class.
function restart(node, cls) {
  node.classList.remove(cls);
  void node.offsetWidth;                         // forces the browser to notice
  node.classList.add(cls);
}

// ----- sound (made with the browser's own sound generator, no files) -----
let audioCtx = null;
let muted = URL_MUTED || readStore("mathgame_muted") === "1";

// [frequency Hz, start s, length s, wave type, volume]
const SFX = {
  start: [[523, 0, 0.12], [659, 0.1, 0.12], [784, 0.2, 0.2]],
  right: [[659, 0, 0.1], [880, 0.09, 0.18]],
  wrong: [[220, 0, 0.18, "triangle", 0.12]],
  miss:  [[262, 0, 0.15, "triangle", 0.12], [196, 0.14, 0.25, "triangle", 0.12]],
  up:    [[523, 0, 0.1], [659, 0.09, 0.1], [784, 0.18, 0.1], [1047, 0.27, 0.22]],
  down:  [[523, 0, 0.12, "triangle", 0.12], [392, 0.12, 0.2, "triangle", 0.12]],
  end:   [[523, 0, 0.12], [659, 0.12, 0.12], [784, 0.24, 0.12], [1047, 0.36, 0.3]]
};

function tone(freq, start, dur, type, vol) {
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  const t0 = audioCtx.currentTime + start;
  o.type = type || "sine";
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol || 0.15, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g);
  g.connect(audioCtx.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

function sfx(name) {
  if (muted) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    audioCtx = audioCtx || new AC();
    if (audioCtx.state === "suspended") audioCtx.resume();
    (SFX[name] || []).forEach(n => tone(n[0], n[1], n[2], n[3], n[4]));
  } catch (e) { /* sound is optional */ }
}

function refreshMuteButton() {
  el("mute-button").textContent = muted ? "🔇" : "🔊";
  el("mute-button").setAttribute("aria-pressed", String(muted));
}

// ----- mascot and messages -----

// Mascot mood: "happy" or "oops" (goes back to normal by itself)
let moodTimer = null;
function setMood(mood) {
  const mascot = el("mascot");
  mascot.classList.remove("mood-happy", "mood-oops");
  void mascot.offsetWidth;
  mascot.classList.add("mood-" + mood);
  clearTimeout(moodTimer);
  moodTimer = setTimeout(() => mascot.classList.remove("mood-happy", "mood-oops"), 900);
}

// Mascot speech bubble
function say(text, mood) {
  el("bubble").textContent = text;
  restart(el("bubble"), "pop");
  if (mood) setMood(mood);
}

// Feedback line under the answers; kind is "good", "bad" or "" (clear)
function showMessage(text, kind) {
  const m = el("message");
  m.className = "";
  void m.offsetWidth;
  m.textContent = text;
  if (kind) m.classList.add("msg-" + kind);
}

function confetti(x, y, count) {
  const layer = el("fx");
  for (let i = 0; i < count; i++) {
    const piece = document.createElement("i");
    piece.style.left = x + "px";
    piece.style.top = y + "px";
    piece.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    piece.style.setProperty("--dx", randomInt(-170, 170) + "px");
    piece.style.setProperty("--up", -randomInt(60, 180) + "px");
    piece.style.setProperty("--fall", randomInt(60, 240) + "px");
    piece.style.setProperty("--rot", randomInt(-540, 540) + "deg");
    layer.appendChild(piece);
    setTimeout(() => piece.remove(), 1300);
  }
}

function celebrate(button, firstTry) {
  const r = button.getBoundingClientRect();
  confetti(r.left + r.width / 2, r.top + r.height / 2, firstTry ? 30 : 14);
  say(pick(tl("praise")), "happy");
}

// After a missed question, light up the right answer
function revealAnswer() {
  document.querySelectorAll("#options button").forEach(b => {
    if (Number(b.dataset.value) === state.question.answer) b.classList.add("correct", "reveal");
  });
}

// Floating math symbols in the background
function buildBackground() {
  const bg = el("bg");
  for (let i = 0; i < 22; i++) {
    const s = document.createElement("span");
    s.textContent = BG_SYMBOLS[i % BG_SYMBOLS.length];
    s.style.left = randomInt(0, 96) + "%";
    s.style.fontSize = randomInt(28, 70) + "px";
    s.style.color = CONFETTI_COLORS[randomInt(0, CONFETTI_COLORS.length - 1)];
    s.style.animationDuration = randomInt(16, 32) + "s";
    s.style.animationDelay = "-" + randomInt(0, 32) + "s";
    bg.appendChild(s);
  }
}

// Turns every ".rainbow" title into bouncing coloured letters.
// Arabic is split by WORD, never by letter (Arabic letters must stay joined).
function rainbowTitles() {
  document.querySelectorAll(".rainbow").forEach(node => {
    const text = t(node.dataset.i18n);
    node.setAttribute("aria-label", text);
    node.textContent = "";
    const parts = word => (lang === "ar" ? [word] : [...word]);
    let n = 0;
    text.split(" ").forEach((word, w, words) => {
      const wordSpan = document.createElement("span");
      wordSpan.className = "word";
      wordSpan.setAttribute("aria-hidden", "true");
      parts(word).forEach(piece => {
        const s = document.createElement("span");
        s.className = "letter";
        s.textContent = piece;
        s.style.setProperty("--i", n);
        s.style.setProperty("--lc", CONFETTI_COLORS[n % CONFETTI_COLORS.length]);
        wordSpan.appendChild(s);
        n++;
      });
      node.appendChild(wordSpan);
      if (w < words.length - 1) node.appendChild(document.createTextNode(" "));
    });
  });
}

// "<7> + <5> = ?" with coloured operators (text comes from our own generator)
function equationHtml(text) {
  return text.replace(/([+−×])/g, '<span class="op">$1</span>') +
         ' <span class="op">=</span> <span class="qmark">?</span>';
}

function buildStarsRow(correct) {
  const row = el("stars-row");
  row.innerHTML = "";
  for (let i = 0; i < N_QUESTIONS; i++) {
    const s = document.createElement("span");
    s.className = "star" + (i < correct ? "" : " off");
    s.textContent = "⭐";
    s.style.setProperty("--i", i);
    row.appendChild(s);
  }
}

function endLine(correct, name) {
  const share = correct / N_QUESTIONS;
  if (share >= 0.8) return t("endTop", { name });
  if (share >= 0.5) return t("endMid", { name });
  return t("endLow", { name });
}

// Read the question aloud (the browser's own voice; optional)
function speakQuestion() {
  if (!("speechSynthesis" in window) || !state.question) return;
  const q = state.question;
  const words = { "+": t("sayPlus"), "−": t("sayMinus"), "×": t("sayTimes") };
  const u = new SpeechSynthesisUtterance(`${q.a} ${words[q.op]} ${q.b}, ${t("sayEquals")}`);
  u.lang = lang === "ar" ? "ar-SA" : "en-US";
  u.rate = 0.9;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
  state.listenClicks++;
}


/* ---------- 7. GAME FLOW ---------- */

let state = {};
let log = [];                                    // one row per question

function startGame() {
  // No mode chosen yet: open the mode overlay instead of starting
  if (!getMode()) {
    el("mode-overlay").classList.remove("hidden");
    return;
  }

  state = {
    playerName: el("player-id").value.trim() || t("defaultName"),   // shown on screen only
    playerId: "P" + Math.random().toString(36).slice(2, 8),         // anonymous, goes in the CSV
    mode: getMode(),
    level: parseInt(el("level-select").value, 10),
    sessionId: "S" + Date.now(),
    questionIndex: 0,
    history: [],                                 // { correct, timeMs, retries }
    streak: 0,                                   // consecutive first-try correct
    wrongStreak: 0,                              // consecutive not first-try correct
    seen: new Set(),                             // questions already asked (no repeats)
    stars: 0,                                    // first-try correct answers (display only)
    shownLevel: null,                            // last level shown on the badge (display only)
    interrupted: false,                          // tab left or quit window opened during this question
    listenClicks: 0,                             // times the child pressed the read-aloud button
    ended: false,
    nextTimer: null
  };
  log = [];

  el("stars").textContent = "⭐ 0";
  el("lang-button").classList.add("hidden");
  el("quit-button").classList.remove("hidden");      // the stop button takes the language button's place
  el("start-screen").classList.add("hidden");
  el("game-screen").classList.remove("hidden");
  sfx("start");
  say(t("letsGo", { name: state.playerName }), "happy");
  showNextQuestion();
}

function showNextQuestion() {
  if (state.ended) return;
  if (state.questionIndex >= N_QUESTIONS) return endGame(false);

  // a question that has not been asked yet in this session
  let question, tries = 0;
  do { question = makeQuestion(state.level); tries++; }
  while (state.seen.has(question.text) && tries < 40);
  state.seen.add(question.text);

  state.question = question;
  state.attempts = 0;
  state.interrupted = false;
  state.listenClicks = 0;
  state.startTime = performance.now();

  const pct = (state.questionIndex / N_QUESTIONS) * 100;
  const levelChanged = state.shownLevel !== null && state.shownLevel !== state.level;
  const wentUp = levelChanged && state.level > state.shownLevel;
  state.shownLevel = state.level;

  el("q-count").textContent = t("qCount", { n: state.questionIndex + 1 });
  el("level-badge").textContent = `${LEVEL_ICONS[state.level]} ${t("lvl" + state.level)}`;
  el("level-badge").className = `badge level-${state.level}`;
  if (levelChanged) restart(el("level-badge"), "pop");

  el("progress-fill").style.width = `${pct}%`;
  el("rocket").style.left = `${pct}%`;
  el("question").innerHTML = equationHtml(question.text);
  restart(el("question-card"), "slide-in");
  showMessage("", "");

  if (levelChanged) {
    say(t(wentUp ? "levelUp" : "levelDown"));
    sfx(wentUp ? "up" : "down");
  } else if (state.questionIndex > 0) {
    say(pick(tl("newQ")));
  }

  const box = el("options");
  box.innerHTML = "";
  question.options.forEach((value, i) => {
    const button = document.createElement("button");
    button.className = "option";
    button.dataset.value = value;
    button.style.setProperty("--n", i);

    const key = document.createElement("span");
    key.className = "key";
    key.setAttribute("aria-hidden", "true");
    key.textContent = i + 1;
    const label = document.createElement("span");
    label.textContent = value;
    button.append(key, label);

    button.addEventListener("click", () => handleAnswer(button, value));
    box.appendChild(button);
  });
}

function handleAnswer(button, value) {
  if (state.ended) return;
  state.attempts++;

  if (value === state.question.answer) {
    button.classList.add("correct");
    showMessage(t("correct"), "good");
    finishQuestion(true);
    celebrate(button, state.attempts === 1);
    sfx("right");
  } else if (state.attempts < 2) {               // one retry allowed
    button.classList.add("wrong");
    button.disabled = true;
    showMessage(t("tryAgain"), "bad");
    say(pick(tl("retry")), "oops");
    sfx("wrong");
  } else {
    button.classList.add("wrong");
    showMessage(t("answerWas", { a: state.question.answer }), "bad");
    finishQuestion(false);
    revealAnswer();
    say(pick(tl("miss")), "oops");
    sfx("miss");
  }
}

function finishQuestion(finalCorrect) {
  document.querySelectorAll("#options button").forEach(b => (b.disabled = true));

  const timeMs = performance.now() - state.startTime;
  const retries = state.attempts - 1;
  const firstTryCorrect = finalCorrect && state.attempts === 1;

  // Update history and streaks
  state.history.push({ correct: firstTryCorrect, timeMs, retries });
  if (firstTryCorrect) { state.streak++; state.wrongStreak = 0; }
  else                 { state.streak = 0; state.wrongStreak++; }

  // Star counter (display only)
  if (firstTryCorrect) {
    state.stars++;
    el("stars").textContent = `⭐ ${state.stars}`;
    restart(el("stars"), "pop");
  }

  // Let the selected engine choose the next level
  const oldLevel = state.level;
  const features = computeFeatures(state.history);
  const shadow = predictiveDecision(oldLevel, state.history.length, features);   // what the model would do
  const decision = chooseNextLevel(state, features);
  state.level = decision.level;

  logQuestion(oldLevel, firstTryCorrect, finalCorrect, timeMs, features, decision, shadow);
  saveLog();

  // After a level change, start a fresh window so the next decision
  // is based on answers given at the new level only.
  if (decision.level !== oldLevel) state.history = [];

  state.questionIndex++;
  state.nextTimer = setTimeout(showNextQuestion, DELAY_NEXT_MS);
}

// quit = true when the child pressed "stop" before the last question
function endGame(quit) {
  if (state.ended) return;
  state.ended = true;
  clearTimeout(state.nextTimer);

  if (!quit) log.forEach(row => { row.session_completed = 1; });
  saveLog();

  el("game-screen").classList.add("hidden");
  el("quit-button").classList.add("hidden");
  el("end-screen").classList.remove("hidden");

  const correct = log.filter(row => row.correct_first_try === 1).length;
  el("summary").textContent = t("summary", { name: state.playerName, c: correct });
  buildStarsRow(correct);
  say(endLine(correct, state.playerName), "happy");
  confetti(window.innerWidth / 2, window.innerHeight / 3, 70);
  sfx("end");
}


/* ---------- 8. DATA LOGGING, SAVING AND CSV EXPORT ---------- */

const SAVE_PREFIX = "mathgame_session_";

function deviceInfo() {
  const touch = ("ontouchstart" in window) || navigator.maxTouchPoints > 0;
  return `${touch ? "touch" : "mouse"} ${window.innerWidth}x${window.innerHeight}`;
}

function logQuestion(level, firstTryCorrect, finalCorrect, timeMs, features, decision, shadow) {
  log.push({
    player_id: state.playerId,
    session_id: state.sessionId,
    mode: state.mode,
    q_index: state.questionIndex + 1,
    level: level,
    question: state.question.text,
    correct_first_try: firstTryCorrect ? 1 : 0,
    final_correct: finalCorrect ? 1 : 0,
    attempts: state.attempts,
    response_time_ms: Math.round(timeMs),
    f_accuracy: features.accuracy.toFixed(3),
    f_time: features.time.toFixed(3),
    f_retry: features.retry.toFixed(3),
    model_p: decision.p === null ? "" : decision.p.toFixed(3),
    next_level: decision.level,
    // --- added in design v3 ---
    shadow_p: shadow.p.toFixed(3),               // what the model would have said (all modes)
    shadow_level: shadow.level,                  // the level the model would have chosen
    interrupted: state.interrupted ? 1 : 0,      // 1 = tab left / quit window opened (time may be too long)
    listen_clicks: state.listenClicks,
    lang: lang,
    device: deviceInfo(),
    timestamp: new Date().toISOString(),
    build: BUILD,
    session_completed: 0                         // becomes 1 when all questions were answered
  });
}

// Saves the whole session in this browser after every question.
function saveLog() {
  writeStore(SAVE_PREFIX + state.sessionId, JSON.stringify(log));
}

function savedSessionKeys() {
  const keys = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(SAVE_PREFIX)) keys.push(k);
    }
  } catch (e) { /* storage blocked */ }
  return keys;
}

function savedRows() {
  const rows = [];
  savedSessionKeys().forEach(k => {
    try { rows.push(...JSON.parse(readStore(k))); } catch (e) { /* skip a damaged entry */ }
  });
  return rows;
}

// Rows -> CSV text (all columns that appear in any row)
function toCSV(rows) {
  const columns = [];
  rows.forEach(r => Object.keys(r).forEach(c => { if (!columns.includes(c)) columns.push(c); }));
  const lines = [columns.join(",")];
  rows.forEach(row => {
    lines.push(columns.map(c => `"${String(row[c] === undefined ? "" : row[c]).replace(/"/g, '""')}"`).join(","));
  });
  return lines.join("\n");
}

function downloadFile(text, filename) {
  const blob = new Blob([text], { type: "text/csv" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
}

function downloadCSV() {
  if (log.length === 0) return;
  downloadFile(toCSV(log), `log_${state.playerId}_${state.mode}.csv`);
}

function downloadAll() {
  const rows = savedRows();
  if (rows.length === 0) {
    alert("No saved sessions on this device and browser yet.");
    return;
  }
  downloadFile(toCSV(rows), `all_sessions_${new Date().toISOString().slice(0, 10)}.csv`);
}

function refreshSavedCount() {
  el("saved-count").textContent = savedSessionKeys().length;
}


/* ---------- 9. INFO PANEL ----------
   Builds the child-friendly explanation of the Predictive mode.
   All numbers come from MODEL, P_UP, P_DOWN, WINDOW and TIME_CAP_MS above. */

function buildInfo() {
  const MINUS = "−";
  const num = s => `<bdi dir="ltr"><b>${s}</b></bdi>`;       // numbers always read left to right
  const sign = w => (w < 0 ? MINUS : "+");
  const abs = w => Math.abs(w).toFixed(1);
  const signed = w => sign(w) + abs(w);
  const effect = w => t(w < 0 ? "effSub" : "effAdd");
  const pct = x => Math.round(x * 100) + "%";
  const bTxt = (MODEL.b < 0 ? MINUS : "") + abs(MODEL.b);

  // each Arabic word sits in its own <bdi> so it cannot reorder the numbers around it,
  // and each "sign weight × clue" group is kept together on one line (class "term")
  const term = (w, key) =>
    `<span class="term">${sign(w)} ${abs(w)} × <bdi>${t(key)}</bdi></span>`;
  const formula =
    `<span class="term">z = ${bTxt}</span> ` +
    `${term(MODEL.w_acc, "fAcc")} ` +
    `${term(MODEL.w_time, "fTime")} ` +
    `${term(MODEL.w_retry, "fRetry")}`;

  // Worked examples (written for WINDOW = 3), calculated with the real model
  const seconds = s => Math.min(s * 1000, TIME_CAP_MS) / TIME_CAP_MS;
  const examples = [
    { icon: "🌟", key: "ex1", f: { accuracy: 3 / 3, time: seconds(5),   retry: 0 } },
    { icon: "🙂", key: "ex2", f: { accuracy: 2 / 3, time: seconds(7.5), retry: 1 / 3 } },
    { icon: "😅", key: "ex3", f: { accuracy: 1 / 3, time: seconds(12),  retry: 2 / 3 } }
  ];

  const exampleHtml = examples.map(ex => {
    const { z, p } = modelScore(ex.f);
    const outcome = t(p > P_UP ? "outUp" : p < P_DOWN ? "outDown" : "outStay");
    return `<div class="example">${ex.icon} <b>${t(ex.key)}</b><br>` +
           t("exResult", { z: num(z.toFixed(2)), p: num(pct(p)), outcome }) + `</div>`;
  }).join("");

  const wAcc = num(signed(MODEL.w_acc));
  const wTime = num(signed(MODEL.w_time));
  const wRetry = num(signed(MODEL.w_retry));

  el("info-content").innerHTML = `
    <h3>${t("iT1")}</h3>
    <p>${t("i1")}</p>

    <h3>${t("iT2")}</h3>
    <p>${t("i2")}</p>
    <ul>
      <li>${t("iAcc", { w: wAcc, effect: effect(MODEL.w_acc) })}</li>
      <li>${t("iTime", { w: wTime, effect: effect(MODEL.w_time), cap: TIME_CAP_MS / 1000 })}</li>
      <li>${t("iRetry", { w: wRetry, effect: effect(MODEL.w_retry) })}</li>
    </ul>

    <h3>${t("iT3")}</h3>
    <p>${t("i3", { b: num(bTxt) })}</p>
    <div class="formula">${formula}</div>

    <h3>${t("iT4")}</h3>
    <p>${t("i4")}</p>
    <div class="formula">p = 1 ÷ (1 + e<sup>${MINUS}z</sup>)</div>

    <h3>${t("iT5")}</h3>
    <ul>
      <li>${t("i5Up", { pUpPct: num(pct(P_UP)), cond: `<bdi dir="ltr">p &gt; ${P_UP.toFixed(2)}</bdi>` })}</li>
      <li>${t("i5Down", { pDownPct: num(pct(P_DOWN)), cond: `<bdi dir="ltr">p &lt; ${P_DOWN.toFixed(2)}</bdi>` })}</li>
      <li>${t("i5Stay")}</li>
    </ul>

    <h3>${t("iT6")}</h3>
    ${exampleHtml}
  `;
}

function openInfo() {
  buildInfo();
  el("info-overlay").classList.remove("hidden");
}

function closeInfo() {
  el("info-overlay").classList.add("hidden");
}


/* ---------- 10. START-UP AND EVENT WIRING ---------- */

function selectLevel(level) {
  el("level-select").value = level;
  document.querySelectorAll(".chip").forEach(c => {
    c.classList.toggle("selected", Number(c.dataset.level) === Number(level));
  });
}

// Apply what the link says (child links hide the pickers)
function setupFromLink() {
  if (URL_MODE) el("mode-select").value = URL_MODE;
  if (URL_LEVEL) selectLevel(URL_LEVEL);

  el("mode-row").classList.toggle("hidden", !!URL_MODE && !ADMIN);
  el("level-row").classList.toggle("hidden", !!URL_LEVEL && !ADMIN);
  el("lang-button").classList.toggle("hidden", !!URL_LANG && !ADMIN);
  el("admin-box").classList.toggle("hidden", !ADMIN);
  el("download-button").classList.toggle("hidden", !ADMIN);
  el("download-all-button").classList.toggle("hidden", !ADMIN);

  if (!("speechSynthesis" in window)) el("speak-button").classList.add("hidden");
  refreshSavedCount();
  refreshMuteButton();
}

function closeTopOverlay() {
  if (!el("info-overlay").classList.contains("hidden")) closeInfo();
  else if (!el("quit-overlay").classList.contains("hidden")) el("quit-overlay").classList.add("hidden");
  else el("mode-overlay").classList.add("hidden");
}

buildBackground();
setupFromLink();
applyLang();

el("start-button").addEventListener("click", startGame);
el("download-button").addEventListener("click", downloadCSV);
el("download-all-button").addEventListener("click", downloadAll);
el("download-all-start").addEventListener("click", downloadAll);
el("again-button").addEventListener("click", () => location.reload());
el("speak-button").addEventListener("click", speakQuestion);

// Language button
el("lang-button").addEventListener("click", () => {
  lang = lang === "ar" ? "en" : "ar";
  writeStore("mathgame_lang", lang);
  applyLang();
});

// Sound button
el("mute-button").addEventListener("click", () => {
  muted = !muted;
  writeStore("mathgame_muted", muted ? "1" : "0");
  refreshMuteButton();
  sfx("right");
});

// Starting level chips
document.querySelectorAll(".chip").forEach(chip => {
  chip.addEventListener("click", () => selectLevel(chip.dataset.level));
});

// Mode selection overlay
el("select-mode-button").addEventListener("click", () => {
  el("mode-overlay").classList.remove("hidden");
});

document.querySelectorAll(".mode-card").forEach(card => {
  card.addEventListener("click", () => {
    const mode = card.dataset.mode;
    el("mode-select").value = mode;
    refreshModeButton();
    el("mode-overlay").classList.add("hidden");
    say(t("modeChosen", { mode: t("mode_" + mode) }), "happy");
  });
});

el("mode-close").addEventListener("click", () => {
  el("mode-overlay").classList.add("hidden");
});

// Info panel (the small "i" on the Predictive card)
el("info-button").addEventListener("click", openInfo);
el("info-close").addEventListener("click", closeInfo);
el("info-overlay").addEventListener("click", e => {
  if (e.target === el("info-overlay")) closeInfo();   // click on the dark background
});

// "Stop playing?" window
el("quit-button").addEventListener("click", () => {
  state.interrupted = true;                      // the clock kept running while the window was open
  el("quit-overlay").classList.remove("hidden");
});
el("quit-no").addEventListener("click", () => el("quit-overlay").classList.add("hidden"));
el("quit-yes").addEventListener("click", () => {
  el("quit-overlay").classList.add("hidden");
  endGame(true);
});

// Keyboard: keys 1-4 choose an answer, Escape closes windows
const KEY_INDEX = { "1": 0, "2": 1, "3": 2, "4": 3, "١": 0, "٢": 1, "٣": 2, "٤": 3 };
document.addEventListener("keydown", e => {
  if (e.key === "Escape") { closeTopOverlay(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const i = KEY_INDEX[e.key];
  if (i === undefined) return;
  if (el("game-screen").classList.contains("hidden")) return;
  if (document.querySelector(".overlay:not(.hidden)")) return;
  const button = el("options").children[i];
  if (button && !button.disabled) button.click();
});

// If the child switches to another tab, remember that this question's time is not reliable
document.addEventListener("visibilitychange", () => {
  if (document.hidden && state.question && !state.ended) state.interrupted = true;
});
