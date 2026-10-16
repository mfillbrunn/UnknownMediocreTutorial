// client/player-insights.js — how many people play, for how long, and
// whether they had fun.
//
// Two jobs, both reported per game ("vowelplay" or "cuddle"):
//
//  1. Run tracking. Each Cuddle run and each Vowel Play match becomes one
//     row in Supabase (server/routes/playerInsights.js -> play_runs): sent
//     when it starts, refreshed every minute while it's played, and closed
//     with its outcome. Time counts only while the game is on screen and
//     the tab is visible, so a tab left open overnight doesn't read as a
//     marathon. Watching the game state from outside (rather than hooking
//     the engines) keeps this independent of both games' code.
//
//  2. The post-run "Did you have fun?" card: a smiley or a frowny, then a
//     short form (why, any bugs, and an optional questionnaire) saved to
//     game_feedback.
//
// Identity: the signed-in or guest id when there is one, plus a random id
// stored per browser so "how many people" can be counted either way.

(function () {
  "use strict";

  const RUNS_KEY = "umtInsightsRuns.v1";
  const DEVICE_KEY = "umtDeviceId";
  const QUESTIONNAIRE_KEY = "umtFeedbackQuestionnaire.v1";
  const TICK_MS = 5000;
  const FLUSH_MS = 60 * 1000;
  // Long enough to see the result screen first.
  const PROMPT_DELAY_MS = 2200;
  const GAME_NAMES = { vowelplay: "Vowel Play", cuddle: "Cuddle" };

  // ---------------------------------------------------------------------------
  // Storage and identity
  // ---------------------------------------------------------------------------

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (error) { /* private mode */ }
  }

  function randomId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }

  let deviceIdCache = null;
  function deviceId() {
    if (deviceIdCache) return deviceIdCache;
    try {
      deviceIdCache = localStorage.getItem(DEVICE_KEY);
      if (!deviceIdCache) {
        deviceIdCache = randomId();
        localStorage.setItem(DEVICE_KEY, deviceIdCache);
      }
    } catch (error) {
      deviceIdCache = deviceIdCache || randomId();
    }
    return deviceIdCache;
  }

  function who() {
    const user = window.currentUser;
    return {
      playerId: (user && user.id) || deviceId(),
      deviceId: deviceId(),
      isGuest: !user || Boolean(user.isGuest)
    };
  }

  function post(path, body, { beacon = false } = {}) {
    const payload = JSON.stringify({ ...who(), ...body });
    if (beacon && navigator.sendBeacon) {
      try {
        if (navigator.sendBeacon(path, new Blob([payload], { type: "application/json" }))) return Promise.resolve(null);
      } catch (error) { /* fall through to fetch */ }
    }
    return fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true
    }).then(response => response.json().catch(() => ({ ok: response.ok })))
      .catch(() => null);
  }

  // ---------------------------------------------------------------------------
  // Run tracking
  // ---------------------------------------------------------------------------

  // { "<game>:<runId>": { game, runId, mode, startedAt, active, details, roomId } }
  // Kept in localStorage so a Cuddle run resumed after a reload keeps adding
  // to the same row, and a run left behind still gets closed.
  let runs = readJson(RUNS_KEY, {});
  if (!runs || typeof runs !== "object") runs = {};
  function saveRuns() { writeJson(RUNS_KEY, runs); }

  function runBody(run, event) {
    return {
      event,
      game: run.game,
      runId: run.runId,
      mode: run.mode || null,
      activeSeconds: Math.round(run.active || 0),
      wallSeconds: Math.round((Date.now() - (run.startedAt || Date.now())) / 1000),
      details: run.details || null
    };
  }

  function startRun(game, runId, mode, details, extra) {
    const key = `${game}:${runId}`;
    if (runs[key]) return runs[key];
    const run = { game, runId, mode, startedAt: Date.now(), active: 0, details, lastFlush: Date.now(), ...extra };
    runs[key] = run;
    saveRuns();
    post("/api/play-run", runBody(run, "start"));
    return run;
  }

  function endRun(run, outcome, details, { prompt = false, beacon = false } = {}) {
    if (!run) return;
    if (details) run.details = details;
    const body = { ...runBody(run, "end"), outcome };
    delete runs[`${run.game}:${run.runId}`];
    saveRuns();
    post("/api/play-run", body, { beacon });
    if (prompt) {
      queueFeedback({ game: run.game, runId: run.runId, mode: run.mode, outcome, details: run.details });
    }
  }

  function liveRuns(game) {
    return Object.values(runs).filter(run => run && run.game === game);
  }

  function screenActive(id) {
    return Boolean(document.getElementById(id)?.classList.contains("active"));
  }

  // Which game is on screen right now (for counting time).
  function gameOnScreen() {
    if (document.visibilityState === "hidden") return null;
    if (screenActive("cuddleScreen")) return "cuddle";
    if (screenActive("gameHubScreen")) return null;
    return window.state && window.roomId ? "vowelplay" : null;
  }

  // ---- Cuddle -------------------------------------------------------------

  function cuddleState() {
    try {
      const game = window.CuddleBranchMap && typeof window.CuddleBranchMap.getActiveGame === "function"
        ? window.CuddleBranchMap.getActiveGame() : null;
      return game && game.state ? game.state : null;
    } catch (error) {
      return null;
    }
  }

  function cuddleDetails(state) {
    const mega = state.megaState || state.mega || {};
    return {
      stage: Number(state.round) || 0,
      points: Number(state.score) || 0,
      difficulty: String(mega.difficulty || ""),
      ascension: Number(state.umtAscension && state.umtAscension.level) || 0
    };
  }

  function watchCuddle() {
    const state = cuddleState();
    if (!state || !state.runId) return;
    const key = `cuddle:${state.runId}`;
    const finished = state.status === "won" || state.status === "lost";
    if (finished) {
      if (runs[key]) endRun(runs[key], state.status, cuddleDetails(state), { prompt: true });
      return;
    }
    if (!screenActive("cuddleScreen")) return;
    if (runs[key]) {
      runs[key].details = cuddleDetails(state);
      return;
    }
    // A new run replaced one that never finished.
    liveRuns("cuddle").forEach(run => endRun(run, "abandoned"));
    const details = cuddleDetails(state);
    startRun("cuddle", state.runId, details.difficulty || null, details);
  }

  // ---- Vowel Play ---------------------------------------------------------

  function vowelPlayMode(state) {
    if (state.isTutorial) return "tutorial";
    if (state.isDaily) return "daily";
    if (state.singlePlayer && state.singlePlayer.enabled) {
      return String(state.singlePlayer.sessionId || "").startsWith("challenge:") ? "challenge" : "campaign";
    }
    if (state.ranked) return "ranked";
    const hasAi = Object.values(state.players || {}).some(player => player && player.isAI);
    return hasAi ? "vs_ai" : "friends";
  }

  function vowelPlayOutcome(state) {
    // summary.js's own verdict, so the row agrees with the result screen.
    try {
      if (typeof window.computeMatchResult === "function") {
        const result = window.computeMatchResult(state, window.currentUser && window.currentUser.id);
        if (result.tie) return "tie";
        return result.didWin ? "won" : "lost";
      }
    } catch (error) { /* fall through */ }
    return "finished";
  }

  function watchVowelPlay() {
    const state = window.state;
    const roomId = window.roomId;
    const inGame = Boolean(state && roomId && state.phase && state.phase !== "lobby");
    const live = liveRuns("vowelplay");
    const current = live.find(run => run.roomId === roomId);
    // Anything from another room (or no room any more) was left mid-match.
    live.filter(run => run !== current || !state || !roomId)
      .forEach(run => endRun(run, "left"));
    if (!inGame) return;
    window.UmtGameHub?.markVowelPlay();

    const over = state.phase === "gameOver" && !state.canNextRound;
    if (current && runs[`vowelplay:${current.runId}`]) {
      current.details = { rounds: Number(state.round) || 0 };
      if (over) {
        endRun(current, vowelPlayOutcome(state), current.details, { prompt: state.isTutorial !== true });
        lastFinishedRoom = roomId;
      }
      return;
    }
    // Still sitting on the summary of a match already closed.
    if (over && lastFinishedRoom === roomId) return;
    if (over) return;
    lastFinishedRoom = null;
    startRun("vowelplay", `${roomId}:${Date.now().toString(36)}`, vowelPlayMode(state),
      { rounds: Number(state.round) || 0 }, { roomId });
  }
  let lastFinishedRoom = null;

  // ---- Clock --------------------------------------------------------------

  function tick() {
    try { watchCuddle(); } catch (error) { /* never break the game */ }
    try { watchVowelPlay(); } catch (error) { /* never break the game */ }
    const onScreen = gameOnScreen();
    const now = Date.now();
    let changed = false;
    Object.values(runs).forEach(run => {
      if (run.game === onScreen) {
        run.active = (run.active || 0) + TICK_MS / 1000;
        changed = true;
      }
      if (now - (run.lastFlush || 0) >= FLUSH_MS && run.game === onScreen) {
        run.lastFlush = now;
        post("/api/play-run", runBody(run, "progress"));
      }
    });
    if (changed) saveRuns();
  }

  // The tab closing: send what's been played so far.
  window.addEventListener("pagehide", () => {
    Object.values(runs).forEach(run => post("/api/play-run", runBody(run, "progress"), { beacon: true }));
    saveRuns();
  });

  setInterval(tick, TICK_MS);
  // Vowel Play runs from an earlier visit that aren't this room any more.
  setTimeout(tick, 1500);

  // ---------------------------------------------------------------------------
  // "Did you have fun?"
  // ---------------------------------------------------------------------------

  const QUESTIONS = [
    { key: "understand", text: "Was the game easy to understand?", choices: [["yes", "Yes"], ["mostly", "Mostly"], ["no", "No"]] },
    { key: "easyToPlay", text: "Was it easy to play?", choices: [["yes", "Yes"], ["mostly", "Mostly"], ["no", "No"]] },
    { key: "complexity", text: "How complicated did it feel?", choices: [["too_simple", "Too simple"], ["just_right", "Just right"], ["too_complicated", "Too complicated"]] },
    { key: "difficulty", text: "How hard was it?", choices: [["too_easy", "Too easy"], ["just_right", "Just right"], ["too_hard", "Too hard"]] },
    { key: "animations", text: "Did you like the animations?", choices: [["yes", "Yes"], ["okay", "They're okay"], ["no", "No"]] },
    { key: "style", text: "Did you like the look and style?", choices: [["yes", "Yes"], ["okay", "It's okay"], ["no", "No"]] },
    { key: "playStyle", text: "Did you like the way it plays?", choices: [["yes", "Yes"], ["okay", "It's okay"], ["no", "No"]] }
  ];
  const RECOMMEND = { key: "recommend", text: "Would you recommend it to a friend?", choices: [["yes", "Yes"], ["maybe", "Maybe"], ["no", "No"]] };

  const FACE_YES = '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="20"/><circle class="umt-fb-eye" cx="17" cy="20" r="2.4"/><circle class="umt-fb-eye" cx="31" cy="20" r="2.4"/><path d="M15 28.5c2.4 4 5.5 6 9 6s6.6-2 9-6"/></svg>';
  const FACE_NO = '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="20"/><circle class="umt-fb-eye" cx="17" cy="20" r="2.4"/><circle class="umt-fb-eye" cx="31" cy="20" r="2.4"/><path d="M15.5 34c2.4-3.6 5.3-5.4 8.5-5.4s6.1 1.8 8.5 5.4"/></svg>';

  let pending = null;   // the run waiting for its card
  let open = null;      // the run whose card is showing
  let promptTimer = null;
  let answers = {};
  let lastFocus = null;

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]
    ));
  }

  function outcomeLabel(context) {
    const outcome = context.outcome;
    if (context.game === "cuddle") return outcome === "won" ? "Run won" : outcome === "lost" ? "Run over" : "Run ended";
    return { won: "Victory", lost: "Defeat", tie: "Tie" }[outcome] || "Match over";
  }

  function queueFeedback(context) {
    pending = context;
    clearTimeout(promptTimer);
    promptTimer = setTimeout(showPrompt, PROMPT_DELAY_MS);
  }

  function chipRow(question) {
    return `<fieldset class="umt-fb-question" data-question="${question.key}">
      <legend>${escapeHtml(question.text)}</legend>
      <div class="umt-fb-chips">${question.choices.map(([value, label]) => (
        `<button type="button" class="umt-fb-chip" data-answer="${question.key}" data-value="${value}" aria-pressed="false">${escapeHtml(label)}</button>`
      )).join("")}</div>
    </fieldset>`;
  }

  function ensureRoot() {
    let root = document.getElementById("umtFeedback");
    if (root) return root;
    root = document.createElement("div");
    root.id = "umtFeedback";
    root.className = "umt-fb";
    root.hidden = true;
    document.body.appendChild(root);
    root.addEventListener("click", onClick);
    root.addEventListener("keydown", event => {
      if (event.key === "Escape") { event.stopPropagation(); closeFeedback(); }
    });
    return root;
  }

  function showPrompt() {
    if (!pending || open) return;
    // Don't land on top of another dialog the player is using.
    if (document.querySelector(".bug-report-modal:not(.hidden), #bigAnnouncePopup.show")) {
      promptTimer = setTimeout(showPrompt, 3000);
      return;
    }
    open = pending;
    pending = null;
    answers = {};
    lastFocus = document.activeElement;
    const root = ensureRoot();
    root.className = "umt-fb is-prompt";
    root.innerHTML = `
      <section class="umt-fb-card" role="dialog" aria-modal="false" aria-labelledby="umtFbTitle">
        <button type="button" class="umt-fb-close" data-fb-action="close" aria-label="Close">&times;</button>
        <p class="umt-fb-eyebrow">${escapeHtml(GAME_NAMES[open.game] || "")} · ${escapeHtml(outcomeLabel(open))}</p>
        <h3 id="umtFbTitle" class="umt-fb-title">Did you have fun?</h3>
        <div class="umt-fb-faces">
          <button type="button" class="umt-fb-face is-yes" data-fun="yes">${FACE_YES}<span>Yes!</span></button>
          <button type="button" class="umt-fb-face is-no" data-fun="no">${FACE_NO}<span>Not really</span></button>
        </div>
      </section>`;
    root.hidden = false;
    requestAnimationFrame(() => root.classList.add("is-in"));
  }

  function showForm(hadFun) {
    answers = { hadFun };
    const root = ensureRoot();
    const seenQuestionnaire = readJson(QUESTIONNAIRE_KEY, {})[open.game] === true;
    root.className = "umt-fb is-form is-in";
    root.innerHTML = `
      <section class="umt-fb-card" role="dialog" aria-modal="true" aria-labelledby="umtFbTitle">
        <button type="button" class="umt-fb-close" data-fb-action="close" aria-label="Close">&times;</button>
        <p class="umt-fb-eyebrow">${escapeHtml(GAME_NAMES[open.game] || "")} · ${escapeHtml(outcomeLabel(open))}</p>
        <div class="umt-fb-head">
          <span class="umt-fb-mini ${hadFun ? "is-yes" : "is-no"}">${hadFun ? FACE_YES : FACE_NO}</span>
          <h3 id="umtFbTitle" class="umt-fb-title">${hadFun ? "Glad to hear it! What made it fun?" : "Sorry about that. What took the fun out of it?"}</h3>
        </div>
        <textarea id="umtFbReason" class="umt-fb-text" rows="3" maxlength="4000"
          placeholder="${hadFun ? "e.g. The boss fights, the combos, beating my friend..." : "e.g. Too confusing, too slow, felt unfair..."}"></textarea>

        <fieldset class="umt-fb-question" data-question="hadBugs">
          <legend>Did you run into any bugs?</legend>
          <div class="umt-fb-chips">
            <button type="button" class="umt-fb-chip" data-answer="hadBugs" data-value="no" aria-pressed="false">No</button>
            <button type="button" class="umt-fb-chip" data-answer="hadBugs" data-value="yes" aria-pressed="false">Yes</button>
          </div>
          <textarea id="umtFbBugs" class="umt-fb-text" rows="2" maxlength="4000" hidden
            placeholder="What happened? Where were you in the game?"></textarea>
        </fieldset>

        <details class="umt-fb-more"${seenQuestionnaire ? "" : " open"}>
          <summary>A few more quick questions <span>(optional)</span></summary>
          <div class="umt-fb-more-body">
            ${QUESTIONS.map(chipRow).join("")}
            <label class="umt-fb-label" for="umtFbIdeas">Anything you'd do differently, or would like to see in the game?</label>
            <textarea id="umtFbIdeas" class="umt-fb-text" rows="3" maxlength="4000" placeholder="Ideas, wishes, gripes..."></textarea>
            ${chipRow(RECOMMEND)}
          </div>
        </details>

        <p class="umt-fb-status" role="status" aria-live="polite"></p>
        <div class="umt-fb-actions">
          <button type="button" class="umt-fb-send" data-fb-action="send">Send</button>
          <button type="button" class="umt-fb-skip" data-fb-action="close">Skip</button>
        </div>
      </section>`;
    requestAnimationFrame(() => document.getElementById("umtFbReason")?.focus());
  }

  function setStatus(text, isError) {
    const status = document.querySelector("#umtFeedback .umt-fb-status");
    if (!status) return;
    status.textContent = text || "";
    status.classList.toggle("is-error", Boolean(isError));
  }

  function chooseAnswer(button) {
    const key = button.dataset.answer;
    const value = button.dataset.value;
    const again = answers[key] === value;
    answers[key] = again ? undefined : value;
    button.closest(".umt-fb-chips").querySelectorAll(".umt-fb-chip").forEach(chip => {
      chip.setAttribute("aria-pressed", String(!again && chip === button));
    });
    if (key === "hadBugs") {
      const box = document.getElementById("umtFbBugs");
      if (box) {
        box.hidden = answers.hadBugs !== "yes";
        if (!box.hidden) box.focus();
      }
    }
  }

  async function send() {
    const button = document.querySelector("#umtFeedback .umt-fb-send");
    if (!open || !button || button.disabled) return;
    const text = id => (document.getElementById(id)?.value || "").trim();
    const questionnaire = {};
    QUESTIONS.concat(RECOMMEND).forEach(({ key }) => { if (answers[key]) questionnaire[key] = answers[key]; });
    const body = {
      game: open.game,
      runId: open.runId,
      mode: open.mode || null,
      outcome: open.outcome || null,
      details: open.details || null,
      hadFun: answers.hadFun,
      funReason: text("umtFbReason"),
      hadBugs: answers.hadBugs === "yes" ? true : answers.hadBugs === "no" ? false : null,
      bugDetails: answers.hadBugs === "yes" ? text("umtFbBugs") : "",
      ideas: text("umtFbIdeas"),
      answers: questionnaire
    };
    button.disabled = true;
    setStatus("Sending...");
    const result = await post("/api/feedback", body);
    if (!result || result.ok === false) {
      button.disabled = false;
      setStatus((result && result.error) || "Couldn't send that. Check your connection and try again.", true);
      return;
    }
    if (Object.keys(questionnaire).length || body.ideas) {
      const seen = readJson(QUESTIONNAIRE_KEY, {});
      seen[open.game] = true;
      writeJson(QUESTIONNAIRE_KEY, seen);
    }
    const card = document.querySelector("#umtFeedback .umt-fb-card");
    if (card) {
      card.innerHTML = `<div class="umt-fb-thanks"><span class="umt-fb-mini is-yes">${FACE_YES}</span>
        <h3 class="umt-fb-title">Thank you!</h3><p>That really helps make the game better.</p></div>`;
    }
    setTimeout(closeFeedback, 1600);
  }

  function closeFeedback() {
    const root = document.getElementById("umtFeedback");
    open = null;
    answers = {};
    if (!root || root.hidden) return;
    root.classList.remove("is-in");
    setTimeout(() => {
      if (open) return; // a new card opened meanwhile
      root.hidden = true;
      root.innerHTML = "";
      if (lastFocus && typeof lastFocus.focus === "function" && document.contains(lastFocus)) lastFocus.focus();
      if (pending) promptTimer = setTimeout(showPrompt, 400);
    }, 220);
  }

  function onClick(event) {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target === event.currentTarget && event.currentTarget.classList.contains("is-form")) return;
    const face = target.closest("[data-fun]");
    if (face) { showForm(face.dataset.fun === "yes"); return; }
    const chip = target.closest("[data-answer]");
    if (chip) { chooseAnswer(chip); return; }
    const action = target.closest("[data-fb-action]")?.dataset.fbAction;
    if (action === "close") closeFeedback();
    else if (action === "send") send();
  }

  window.UmtInsights = Object.freeze({
    // For testing from the console: UmtInsights.askFeedback("cuddle")
    askFeedback(game = "cuddle", outcome = "won") {
      queueFeedback({ game, runId: null, mode: null, outcome, details: null });
      clearTimeout(promptTimer);
      showPrompt();
    },
    liveRuns: () => Object.values(runs).map(run => ({ ...run }))
  });
}());
