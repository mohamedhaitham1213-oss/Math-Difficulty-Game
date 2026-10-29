/* ==========================================================
   Math Adventure - adaptive difficulty testbed
   Sections:
     1. Configuration
     2. Question generator
     3. Features (accuracy, response time, retry rate)
     4. The three difficulty engines (static, rule-based, predictive)
     5. Game flow
     6. Data logging and CSV export
     7. Start-up, mode selection and info panel
   ========================================================== */


/* ---------- 1. CONFIGURATION ---------- */

const N_QUESTIONS = 12;                          // questions per session
const WINDOW = 3;                                // features use the last 3 answers
const MIN_LEVEL = 1;
const MAX_LEVEL = 3;
const LEVEL_NAMES = { 1: "Easy", 2: "Medium", 3: "Hard" };

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

// The mode is chosen in the "Select mode" overlay: "static", "rule" or "predictive".
function getMode() {
  return el("mode-select").value;
}


/* ---------- 2. QUESTION GENERATOR ---------- */

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Returns { text, answer } for the given level.
function makeProblem(level) {
  let a, b;

  if (level === 1) {                             // Easy: add/subtract within 20
    if (Math.random() < 0.5) {
      a = randomInt(1, 10); b = randomInt(1, 10);
      return { text: `${a} + ${b}`, answer: a + b };
    }
    a = randomInt(5, 20); b = randomInt(1, a);
    return { text: `${a} − ${b}`, answer: a - b };
  }

  if (level === 2) {                             // Medium: within 100, tables 2-5
    const type = randomInt(1, 3);
    if (type === 1) {
      a = randomInt(10, 60); b = randomInt(10, 39);
      return { text: `${a} + ${b}`, answer: a + b };
    }
    if (type === 2) {
      a = randomInt(30, 99); b = randomInt(10, a - 1);
      return { text: `${a} − ${b}`, answer: a - b };
    }
    a = randomInt(2, 5); b = randomInt(2, 10);
    return { text: `${a} × ${b}`, answer: a * b };
  }

  // Hard: tables up to 12, two-digit addition
  if (Math.random() < 0.6) {
    a = randomInt(6, 12); b = randomInt(6, 12);
    return { text: `${a} × ${b}`, answer: a * b };
  }
  a = randomInt(45, 99); b = randomInt(45, 99);
  return { text: `${a} + ${b}`, answer: a + b };
}

// Adds 3 distinct wrong options near the answer and shuffles them.
function makeQuestion(level) {
  const problem = makeProblem(level);
  const options = new Set([problem.answer]);
  while (options.size < 4) {
    const wrong = problem.answer + randomInt(-10, 10);
    if (wrong >= 0) options.add(wrong);
  }
  problem.options = [...options].sort(() => Math.random() - 0.5);
  return problem;
}


/* ---------- 3. FEATURES ---------- */

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


/* ---------- 4. THE THREE DIFFICULTY ENGINES ----------
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

// Engine 3: predictive - logistic regression gives P(ready for harder).
function predictiveEngine(state, features) {
  const { p } = modelScore(features);

  // Wait until there are WINDOW answers at the current level, so one lucky
  // (or unlucky) answer cannot change the level on its own.
  if (state.history.length < WINDOW) return { level: state.level, p };

  let level = state.level;
  if (p > P_UP) level = clampLevel(level + 1);
  else if (p < P_DOWN) level = clampLevel(level - 1);

  return { level, p };
}

function chooseNextLevel(state, features) {
  if (state.mode === "static") return staticEngine(state);
  if (state.mode === "rule") return ruleEngine(state);
  return predictiveEngine(state, features);
}


/* ---------- 5. GAME FLOW ---------- */

let state = {};
let log = [];                                    // one row per question

function startGame() {
  // No mode chosen yet: open the mode overlay instead of starting
  if (!getMode()) {
    el("mode-overlay").classList.remove("hidden");
    return;
  }

  state = {
    playerName: el("player-id").value.trim() || "Player",           // shown on screen only
    playerId: "P" + Math.random().toString(36).slice(2, 8),         // anonymous, goes in the CSV
    mode: getMode(),
    level: parseInt(el("level-select").value, 10),
    sessionId: "S" + Date.now(),
    questionIndex: 0,
    history: [],                                 // { correct, timeMs, retries }
    streak: 0,                                   // consecutive first-try correct
    wrongStreak: 0                               // consecutive not first-try correct
  };
  log = [];

  el("start-screen").classList.add("hidden");
  el("game-screen").classList.remove("hidden");
  showNextQuestion();
}

function showNextQuestion() {
  if (state.questionIndex >= N_QUESTIONS) return endGame();

  state.question = makeQuestion(state.level);
  state.attempts = 0;
  state.startTime = performance.now();

  el("q-count").textContent = `${state.playerName} · Question ${state.questionIndex + 1} / ${N_QUESTIONS}`;
  el("level-badge").textContent = LEVEL_NAMES[state.level];
  el("level-badge").className = `badge level-${state.level}`;
  el("progress-fill").style.width = `${(state.questionIndex / N_QUESTIONS) * 100}%`;
  el("question").textContent = `${state.question.text} = ?`;
  el("message").textContent = "";

  const box = el("options");
  box.innerHTML = "";
  state.question.options.forEach(value => {
    const button = document.createElement("button");
    button.className = "option";
    button.textContent = value;
    button.addEventListener("click", () => handleAnswer(button, value));
    box.appendChild(button);
  });
}

function handleAnswer(button, value) {
  state.attempts++;

  if (value === state.question.answer) {
    button.classList.add("correct");
    el("message").textContent = "Correct! ⭐";
    finishQuestion(true);
  } else if (state.attempts < 2) {               // one retry allowed
    button.classList.add("wrong");
    button.disabled = true;
    el("message").textContent = "Try again!";
  } else {
    button.classList.add("wrong");
    el("message").textContent = `The answer was ${state.question.answer}`;
    finishQuestion(false);
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

  // Let the selected engine choose the next level
  const oldLevel = state.level;
  const features = computeFeatures(state.history);
  const decision = chooseNextLevel(state, features);
  state.level = decision.level;

  logQuestion(oldLevel, firstTryCorrect, finalCorrect, timeMs, features, decision);

  // After a level change, start a fresh window so the next decision
  // is based on answers given at the new level only.
  if (decision.level !== oldLevel) state.history = [];

  state.questionIndex++;
  setTimeout(showNextQuestion, DELAY_NEXT_MS);
}

function endGame() {
  el("game-screen").classList.add("hidden");
  el("end-screen").classList.remove("hidden");

  const correct = log.filter(row => row.correct_first_try === 1).length;
  el("summary").textContent = `${state.playerName}, your mark: ${correct} / ${N_QUESTIONS}`;

  // Backup copy in the browser, in case the CSV download fails
  try {
    localStorage.setItem("math_game_log_" + state.sessionId, JSON.stringify(log));
  } catch (e) { /* storage may be blocked; ignore */ }
}


/* ---------- 6. DATA LOGGING AND CSV EXPORT ---------- */

function logQuestion(level, firstTryCorrect, finalCorrect, timeMs, features, decision) {
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
    next_level: decision.level
  });
}

function downloadCSV() {
  if (log.length === 0) return;

  const columns = Object.keys(log[0]);
  const lines = [columns.join(",")];
  log.forEach(row => {
    lines.push(columns.map(c => `"${String(row[c]).replace(/"/g, '""')}"`).join(","));
  });

  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `log_${state.playerId}_${state.mode}.csv`;
  link.click();
}


/* ---------- 7. START-UP, MODE SELECTION AND INFO PANEL ---------- */

const MODE_LABELS = { static: "Static", rule: "Rule-based", predictive: "Predictive" };

// Builds the child-friendly explanation of the Predictive mode.
// All numbers come from MODEL, P_UP, P_DOWN, WINDOW and TIME_CAP_MS above.
function buildInfo() {
  const MINUS = "−";
  const sign = w => (w < 0 ? MINUS : "+");
  const abs = w => Math.abs(w).toFixed(1);
  const effect = w => (w < 0 ? "takes points away" : "adds points");
  const pct = x => Math.round(x * 100) + "%";
  const capSec = TIME_CAP_MS / 1000;

  const formula =
    `z = ${MODEL.b < 0 ? MINUS : ""}${abs(MODEL.b)} ` +
    `${sign(MODEL.w_acc)} ${abs(MODEL.w_acc)} × accuracy ` +
    `${sign(MODEL.w_time)} ${abs(MODEL.w_time)} × speed ` +
    `${sign(MODEL.w_retry)} ${abs(MODEL.w_retry)} × retries`;

  // Worked examples (written for WINDOW = 3), calculated with the real model
  const seconds = s => Math.min(s * 1000, TIME_CAP_MS) / TIME_CAP_MS;
  const examples = [
    { icon: "🌟", text: "3 of 3 right the first time, about 5 seconds each, no retries",
      f: { accuracy: 3 / 3, time: seconds(5), retry: 0 } },
    { icon: "🙂", text: "2 of 3 right the first time, one retry, about 7.5 seconds each",
      f: { accuracy: 2 / 3, time: seconds(7.5), retry: 1 / 3 } },
    { icon: "😅", text: "1 of 3 right the first time, two retries, about 12 seconds each",
      f: { accuracy: 1 / 3, time: seconds(12), retry: 2 / 3 } }
  ];

  const exampleHtml = examples.map(ex => {
    const { z, p } = modelScore(ex.f);
    const outcome = p > P_UP ? "🚀 harder level"
                  : p < P_DOWN ? "🌱 easier level"
                  : "👍 stay on the same level";
    return `<div class="example">${ex.icon} <b>${ex.text}</b><br>` +
           `z = ${z.toFixed(2)} → ready-chance p = ${pct(p)} → <b>${outcome}</b></div>`;
  }).join("");

  el("info-content").innerHTML = `
    <h3>1. It watches your last ${WINDOW} answers</h3>
    <p>The game looks at how you did on your last ${WINDOW} questions and uses three clues.
       It waits until you have answered ${WINDOW} questions at a level, so one lucky (or unlucky)
       answer can never change things on its own.</p>

    <h3>2. The three clues and their weights</h3>
    <p>A <b>weight</b> tells the game how important a clue is. The bigger the number, the more that
       clue matters. A <b>+</b> means the clue adds points, a <b>${MINUS}</b> means it takes points away.</p>
    <ul>
      <li>✅ <b>Right the first time</b> (accuracy): from 0 (none) to 1 (all ${WINDOW}).
          Weight <b>${sign(MODEL.w_acc)}${abs(MODEL.w_acc)}</b> → ${effect(MODEL.w_acc)}.</li>
      <li>⏱️ <b>Speed</b> (how long you think): from 0 (super fast) to 1 (${capSec} seconds or more).
          Weight <b>${sign(MODEL.w_time)}${abs(MODEL.w_time)}</b> → ${effect(MODEL.w_time)}.</li>
      <li>🔁 <b>Retries</b> (extra tries needed): the average number of retries per question.
          Weight <b>${sign(MODEL.w_retry)}${abs(MODEL.w_retry)}</b> → ${effect(MODEL.w_retry)}.</li>
    </ul>

    <h3>3. Add it all up: the score z</h3>
    <p>Each clue is multiplied by its weight, and everything is added to a starting number
       (<b>${MODEL.b < 0 ? MINUS : ""}${abs(MODEL.b)}</b>, called b). The result is your score <b>z</b>:</p>
    <div class="formula">${formula}</div>

    <h3>4. Turn the score into a ready-chance</h3>
    <p>The score z is turned into a <b>ready-chance p</b> between 0% and 100%,
       which says how ready you are for harder questions:</p>
    <div class="formula">p = 1 ÷ (1 + e<sup>${MINUS}z</sup>)</div>

    <h3>5. The game decides</h3>
    <ul>
      <li>🚀 If <b>p is above ${pct(P_UP)}</b> (p &gt; ${P_UP.toFixed(2)}) → the next level is <b>harder</b>.</li>
      <li>🌱 If <b>p is below ${pct(P_DOWN)}</b> (p &lt; ${P_DOWN.toFixed(2)}) → the next level is <b>easier</b>.</li>
      <li>👍 In between → you <b>stay</b> on the same level.</li>
    </ul>

    <h3>6. Examples</h3>
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

el("start-button").addEventListener("click", startGame);
el("download-button").addEventListener("click", downloadCSV);
el("again-button").addEventListener("click", () => location.reload());

// Mode selection overlay
el("select-mode-button").addEventListener("click", () => {
  el("mode-overlay").classList.remove("hidden");
});

document.querySelectorAll(".mode-card").forEach(card => {
  card.addEventListener("click", () => {
    el("mode-select").value = card.dataset.mode;
    el("select-mode-button").textContent = "Mode: " + MODE_LABELS[card.dataset.mode];
    el("mode-overlay").classList.add("hidden");
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

// Escape closes the top-most overlay
document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  if (!el("info-overlay").classList.contains("hidden")) closeInfo();
  else el("mode-overlay").classList.add("hidden");
});
