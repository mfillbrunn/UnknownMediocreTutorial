// public/cuddle/cuddle-ui.js
// Card-only renderer and menu integration for Cuddle. No keyboard handlers are registered.
(function () {
  "use strict";

  // Same two lists (and same source) the main game uses: guesses is the
  // broad dictionary a submitted word is checked against, secrets is the
  // curated pool the actual secret is drawn from. See helpers.js's own
  // fetches of these same endpoints into window.ALLOWED_GUESSES/SECRETS --
  // fetched independently here rather than reused, so Cuddle doesn't
  // depend on load order with the rest of the page.
  const GUESSES_URL = "/api/allowed-guesses";
  const SECRETS_URL = "/api/allowed-secrets";
  const ROOT_ID = "cuddleRoot";
  const VOWEL_ORDER = Object.freeze(["A", "E", "I", "O", "U"]);
  const VOWEL_SET = new Set(VOWEL_ORDER);
  const CARD_STATUS_ORDER = Object.freeze({ green: 0, yellow: 1, unused: 2, red: 3 });
  let root = null;
  let wordLists = null;
  let game = null;
  let landing = true;
  let rulesOpen = false;
  let detailsOpen = false;
  let actionMode = "play";
  let selectedCards = new Set();
  let uiMessage = "";
  let loadingPromise = null;
  const RECONNECT_GRACE_MS = 30000;
  const RECONNECT_RETRY_MS = 3000;

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function showScreen(id) {
    if (typeof window.showScreen === "function") {
      window.showScreen(id);
      return;
    }
    document.querySelectorAll(".screen").forEach(screen => {
      screen.classList.toggle("active", screen.id === id);
    });
  }

  async function loadWords() {
    if (wordLists) return wordLists;
    if (loadingPromise) return loadingPromise;
    loadingPromise = Promise.all([
      fetch(GUESSES_URL, { cache: "no-cache" }),
      fetch(SECRETS_URL, { cache: "no-cache" })
    ])
      .then(async ([guessesResponse, secretsResponse]) => {
        if (!guessesResponse.ok) throw new Error(`Could not load Cuddle guesses (${guessesResponse.status}).`);
        if (!secretsResponse.ok) throw new Error(`Could not load Cuddle secrets (${secretsResponse.status}).`);
        const [guessesRaw, secretsRaw] = await Promise.all([guessesResponse.json(), secretsResponse.json()]);
        const guesses = window.CuddleEngine.normalizeWords(guessesRaw);
        const secrets = window.CuddleEngine.normalizeWords(secretsRaw);
        if (secrets.length < 12) throw new Error("The secret list contains fewer than 12 usable words.");
        if (!guesses.length) throw new Error("The guess list is empty.");
        wordLists = { guesses, secrets };
        return wordLists;
      })
      .finally(() => { loadingPromise = null; });
    return loadingPromise;
  }

  // A dropped connection while fetching the secret list used to dump the
  // player straight to a dead-end error screen with no way back in except
  // leaving and reopening Cuddle by hand. Retry quietly for up to 30s
  // (RECONNECT_GRACE_MS) before giving up -- the saved run itself is
  // already safe in localStorage, only the word list needs the network.
  async function loadWordsWithRetry(onRetrying) {
    const deadline = Date.now() + RECONNECT_GRACE_MS;
    for (;;) {
      try {
        return await loadWords();
      } catch (error) {
        const remainingMs = deadline - Date.now();
        if (remainingMs <= 0) throw error;
        onRetrying(Math.ceil(remainingMs / 1000));
        await new Promise(resolve => setTimeout(resolve, Math.min(RECONNECT_RETRY_MS, remainingMs)));
      }
    }
  }

  async function openCuddle() {
    showScreen("cuddleScreen");
    root = document.getElementById(ROOT_ID);
    if (!root) return;
    root.innerHTML = renderLoading();
    try {
      const loadedWords = await loadWordsWithRetry(secondsLeft => {
        if (root) root.innerHTML = renderReconnecting(secondsLeft);
      });
      game = window.CuddleEngine.CuddleGame.load(loadedWords);
      landing = true;
      detailsOpen = false;
      actionMode = "play";
      selectedCards = new Set();
      uiMessage = "";
      render();
    } catch (error) {
      root.innerHTML = renderFatal(error?.message || "Cuddle could not start.");
    }
  }

  function renderLoading() {
    return `
      <div class="cuddle-loading-card" role="status">
        <div class="cuddle-logo" aria-hidden="true">C</div>
        <h2>Opening Cuddle…</h2>
        <p>Shuffling the letter deck.</p>
      </div>`;
  }

  function renderReconnecting(secondsLeft) {
    return `
      <div class="cuddle-loading-card" role="status">
        <div class="cuddle-logo" aria-hidden="true">C</div>
        <h2>Reconnecting…</h2>
        <p>Connection dropped while opening Cuddle. Your saved run is safe — retrying for ${secondsLeft}s.</p>
      </div>`;
  }

  function renderFatal(message) {
    return `
      <div class="cuddle-loading-card cuddle-fatal" role="alert">
        <div class="cuddle-logo" aria-hidden="true">!</div>
        <h2>Cuddle could not load</h2>
        <p>${escapeHtml(message)}</p>
        <button class="cuddle-btn cuddle-btn-primary" data-action="retry-load">Try again</button>
        <button class="cuddle-btn" data-action="back">Back to menu</button>
      </div>`;
  }

  function currentState() {
    return game?.state || null;
  }

  // Rounds the player is scored on. Boss rounds sit between them and are
  // pass/fail, so they are never part of this count.
  function scoringRounds() {
    return window.CuddleEngine.THRESHOLDS.length;
  }

  function render() {
    if (!root) return;
    if (landing || !game?.state) root.innerHTML = renderLanding();
    else root.innerHTML = renderRun();
    syncQuickModeTimer();
    keepCurrentRowVisible();
    // The bolt-on modules patch their panels in on the next frame, which can
    // shrink the board after the first pass; watch for that and re-align.
    watchScrollerResize();
  }

  // On short screens the board scrolls inside its own box so the quest, the
  // hand and Submit all stay put (see the compact layout in cuddle.css).
  // Because render() rebuilds the whole subtree, that box comes back scrolled
  // to the top, which would hide the row the player is actually typing into
  // once a few guesses are down. Nudge it back into view -- only when there is
  // a real scroller, so the desktop layout is untouched.
  function keepCurrentRowVisible() {
    const current = root?.querySelector(".cuddle-board-row.is-current-row");
    if (!current) return;
    const scroller = findScrollableAncestor(current);
    if (!scroller) return;
    const scrollerBox = scroller.getBoundingClientRect();
    const rowBox = current.getBoundingClientRect();
    if (rowBox.top >= scrollerBox.top && rowBox.bottom <= scrollerBox.bottom) return;
    const target = rowBox.bottom > scrollerBox.bottom
      ? scroller.scrollTop + (rowBox.bottom - scrollerBox.bottom) + 12
      : scroller.scrollTop - (scrollerBox.top - rowBox.top) - 12;
    scroller.scrollTop = Math.max(0, target);
  }

  // render() replaces the board every time, so the observer is re-pointed at
  // the new element rather than kept alive across renders.
  let scrollerObserver = null;
  function watchScrollerResize() {
    if (typeof ResizeObserver !== "function") return;
    const board = root?.querySelector(".cuddle-board");
    if (!scrollerObserver) scrollerObserver = new ResizeObserver(() => keepCurrentRowVisible());
    scrollerObserver.disconnect();
    if (board) scrollerObserver.observe(board);
  }

  function findScrollableAncestor(element) {
    let node = element.parentElement;
    while (node && node !== root) {
      const overflowY = getComputedStyle(node).overflowY;
      if ((overflowY === "auto" || overflowY === "scroll")
        && node.scrollHeight > node.clientHeight + 1) return node;
      node = node.parentElement;
    }
    return null;
  }

  // Quick Mode is the one boss that needs a real clock. The deadline lives
  // here rather than in the engine because it is wall-clock UI state: a
  // saved run that is reopened later should get a fresh minute, not a timer
  // that expired while the tab was closed.
  let quickModeTimer = null;
  let quickModeDeadline = 0;
  let quickModeGuessIndex = -1;

  function clearQuickModeTimer() {
    if (quickModeTimer) clearInterval(quickModeTimer);
    quickModeTimer = null;
    quickModeDeadline = 0;
    quickModeGuessIndex = -1;
  }

  function syncQuickModeTimer() {
    const state = currentState();
    const seconds = Number(state?.boss?.secondsPerGuess) || 0;
    const running = Boolean(
      seconds && state.status === "playing" && !state.roundIntroPending && !state.pendingRoundEnd
    );
    if (!running) {
      clearQuickModeTimer();
      return;
    }
    // Restart the clock whenever a new guess begins.
    if (quickModeGuessIndex !== state.guessesUsed) {
      quickModeGuessIndex = state.guessesUsed;
      quickModeDeadline = Date.now() + seconds * 1000;
    }
    paintQuickModeClock();
    if (quickModeTimer) return;
    quickModeTimer = setInterval(() => {
      const live = currentState();
      if (!live || live.status !== "playing" || !live.boss?.secondsPerGuess) {
        clearQuickModeTimer();
        return;
      }
      if (Date.now() >= quickModeDeadline) {
        clearQuickModeTimer();
        // Out of time: the guess is lost. forfeitGuess burns the turn
        // exactly as if it had been submitted and missed.
        const result = game.forfeitGuess();
        setUiMessage(result?.ok ? "Out of time -- that guess was lost." : "");
        render();
        return;
      }
      paintQuickModeClock();
    }, 250);
  }

  function paintQuickModeClock() {
    const el = document.getElementById("cuddleQuickClock");
    if (!el) return;
    const left = Math.max(0, Math.ceil((quickModeDeadline - Date.now()) / 1000));
    el.textContent = `${left}s`;
    el.classList.toggle("is-urgent", left <= 10);
  }

  function renderLanding() {
    const state = currentState();
    const hasRun = Boolean(state);
    const statusLabel = state
      ? state.status === "won" ? "Completed"
        : state.status === "lost" ? "Run ended"
          : `Round ${state.round} in progress`
      : "No saved run";
    const continueLabel = state?.status === "won" || state?.status === "lost" ? "Review run" : "Continue run";
    return `
      <div class="cuddle-landing">
        <div class="cuddle-landing-top">
          <button class="cuddle-icon-btn" data-action="back" aria-label="Back to main menu">←</button>
          <button class="cuddle-icon-btn" data-action="rules" aria-label="How to play Cuddle">?</button>
        </div>
        <section class="cuddle-hero">
          <div class="cuddle-logo" aria-hidden="true">C</div>
          <p class="cuddle-eyebrow">SINGLE-PLAYER ROGUELITE</p>
          <h1>CUDDLE</h1>
          <p class="cuddle-tagline">Build words from cards. Learn the secret. Shape the deck. Survive ${scoringRounds()} rounds and four bosses.</p>
          <div class="cuddle-save-summary ${hasRun ? "" : "is-empty"}">
            <span>${escapeHtml(statusLabel)}</span>
            ${hasRun ? `<strong>Score ${state.score} · Round ${state.round}/${scoringRounds()}</strong>` : `<strong>Your run saves in this browser.</strong>`}
          </div>
          <div class="cuddle-landing-actions">
            ${hasRun ? `<button class="cuddle-btn cuddle-btn-primary" data-action="continue">${escapeHtml(continueLabel)}</button>` : ""}
            <button class="cuddle-btn cuddle-btn-ghost" data-action="rules">Rules</button>
          </div>
          <div class="cuddle-difficulty-picker">
            <span class="cuddle-eyebrow">${hasRun ? "START A NEW RUN" : "CHOOSE A DIFFICULTY"}</span>
            <div class="cuddle-difficulty-row">
              <button class="cuddle-btn ${hasRun ? "" : "cuddle-btn-primary"}" data-action="new-run-easy">Easy</button>
              <button class="cuddle-btn ${hasRun ? "" : "cuddle-btn-primary"}" data-action="new-run-medium">Medium</button>
              <button class="cuddle-btn ${hasRun ? "" : "cuddle-btn-primary"}" data-action="new-run-hard">Hard</button>
            </div>
          </div>
        </section>
        ${rulesOpen ? renderRulesOverlay() : ""}
      </div>`;
  }

  function renderRun() {
    const state = currentState();
    const rules = game.getRulesSummary();
    const target = game.getTarget();
    const drawPile = state.deck.length;
    const recyclable = state.discard.length;
    return `
      <div class="cuddle-shell">
        <header class="cuddle-header">
          <div class="cuddle-header-side">
            <button class="cuddle-icon-btn" data-action="run-menu" aria-label="Cuddle menu">←</button>
          </div>
          <div class="cuddle-header-title">
            <span class="cuddle-eyebrow">SINGLE-PLAYER CAMPAIGN</span>
            <div class="cuddle-header-title-line">
              <h1>CUDDLE</h1>
              <span class="cuddle-header-score" aria-label="Total score ${state.score}${game.isBossRound() ? "" : `, goal ${target}`}">Score ${state.score}${game.isBossRound() ? "" : ` / ${target}`}</span>
            </div>
          </div>
          <div class="cuddle-header-side cuddle-header-side-right">
            <button class="cuddle-details-toggle ${detailsOpen ? "is-open" : ""}" data-action="toggle-details"
              aria-expanded="${detailsOpen ? "true" : "false"}" aria-controls="cuddleRunDetails"
              aria-label="${detailsOpen ? "Hide run details" : "Show run details"}">
              ${detailsOpen ? "Hide ▲" : "Details ▼"}
            </button>
            <button class="cuddle-icon-btn" data-action="rules" aria-label="How to play">?</button>
          </div>
        </header>


        ${detailsOpen ? `
          <section id="cuddleRunDetails" class="cuddle-details-panel" aria-label="Additional run information">
            ${renderProgress(state)}

            <div class="cuddle-stat-group">
              <h3 class="cuddle-stat-group-title">Stats</h3>
              <div class="cuddle-detail-badges">
                <span class="cuddle-detail-badge is-yellow"><b>Yellow</b> ${rules.yellowPoints > 0 ? "+" : ""}${rules.yellowPoints}</span>
                <span class="cuddle-detail-badge is-green"><b>Green</b> ${rules.greenPoints > 0 ? "+" : ""}${rules.greenPoints}</span>
                <span class="cuddle-detail-badge is-grey"><b>Grey</b> ${rules.greyPoints > 0 ? "+" : ""}${rules.greyPoints}</span>
                <span class="cuddle-detail-badge"><b>Guesses left</b> ${Math.max(0, (state.maxGuesses || window.CuddleEngine.MAX_GUESSES) - state.guessesUsed)}</span>
                <span class="cuddle-detail-badge"><b>Early solve</b> +${rules.earlyPoint} per unused guess</span>
                <span class="cuddle-detail-badge"><b>Unused mulligan</b> +${rules.mulliganPoints}</span>
                <span class="cuddle-detail-badge"><b>Quest</b> +${rules.questPoints}</span>
              </div>
            </div>

            <div class="cuddle-stat-group">
              <h3 class="cuddle-stat-group-title">Loadout</h3>
              <div class="cuddle-detail-badges">
                <span class="cuddle-detail-badge"><b>Hand size</b> ${rules.handSize}</span>
                <span class="cuddle-detail-badge"><b>Mulligans</b> ${state.mulligansLeft}/${rules.mulligans} · up to ${rules.mulliganSize}</span>
                <span class="cuddle-detail-badge"><b>Concurrent quests</b> ${rules.questSlots || 1}</span>
                <span class="cuddle-detail-badge"><b>Draw / discard</b> ${drawPile} / ${recyclable}</span>
              </div>
            </div>

          </section>` : ""}

        <main class="cuddle-play-area">
          <section class="cuddle-left-column">
            ${renderBossBanner(state)}
            ${renderBoard(state)}
          </section>
          <section class="cuddle-right-column">
            ${renderStatusAnnouncement(state)}
            ${renderHand(state, rules)}
          </section>
        </main>
        ${renderStateOverlay(state)}
        ${rulesOpen ? renderRulesOverlay() : ""}
      </div>`;
  }

  // Keeps the active boss constraint on screen, and counts down how many
  // guesses are left under it -- otherwise a player who dismissed the intro
  // has no way to tell why the board is behaving oddly.
  function renderBossBanner(state) {
    const boss = state.boss;
    if (!boss) return "";
    // Short Hand's constraint (fewer letters, fewer guesses), Steady
    // Hand's (no mulligans), and Quest Trial's (a quest and its penalty on
    // every guess) aren't guess-window feedback masks -- boss.turns is
    // meaningless for them (see _bossActive in the engine), so treat them
    // as always "on" instead of reading a countdown out of a field that
    // doesn't describe anything real for these bosses.
    const isWholeRound = boss.id === "shortHand" || boss.id === "noMulligans" || boss.id === "questTrial"
      || boss.id === "extraGuessTrial" || boss.id === "questEndurance" || boss.id === "presetWordsTrial";
    const turns = Number(boss.turns) || 0;
    const remaining = Math.max(0, turns - (state.guessesUsed || 0));
    const stillOn = isWholeRound || remaining > 0;
    const scope = isWholeRound || turns >= (state.maxGuesses || 6)
      ? "All round"
      : stillOn
        ? `${remaining} guess${remaining === 1 ? "" : "es"} left under this`
        : "Constraint lifted";
    const presetWords = boss.id === "presetWordsTrial" ? state.megaState?.presetWords : null;
    return `
      <article class="cuddle-quest cuddle-boss-banner ${stillOn ? "is-active" : "is-spent"}">
        <div class="cuddle-quest-icon" aria-hidden="true">${escapeHtml(boss.icon || "💀")}</div>
        <div>
          <span class="cuddle-eyebrow">BOSS ROUND</span>
          <h2>${escapeHtml(boss.title || "Boss")}</h2>
          <p>${escapeHtml(boss.description || "")} <b>${escapeHtml(scope)}.</b></p>
          ${presetWords?.length ? `
            <div class="cuddle-preset-words" aria-label="Candidate words">
              ${presetWords.map(word => `<span class="cuddle-preset-word">${escapeHtml(word)}</span>`).join("")}
            </div>` : ""}
        </div>
        ${boss.secondsPerGuess ? `<span id="cuddleQuickClock" class="cuddle-quick-clock" aria-live="off">${boss.secondsPerGuess}s</span>` : ""}
      </article>`;
  }

  function renderProgress(state) {
    return `
      <div class="cuddle-progress" aria-label="Campaign progress">
        ${window.CuddleEngine.THRESHOLDS.map((threshold, index) => {
          const round = index + 1;
          const classes = [
            "cuddle-progress-node",
            round < state.round ? "is-cleared" : "",
            round === state.round ? "is-current" : ""
          ].filter(Boolean).join(" ");
          return `<span class="${classes}" title="Round ${round}: ${threshold} points">${round}</span>`;
        }).join("")}
      </div>`;
  }

  function renderBoard(state) {
    const draftTiles = game.getDraftCards().flatMap((card, draftIndex) => (
      card.glyph.split("").map(letter => ({
        letter,
        cardId: card.id,
        draftIndex,
        glyph: card.glyph
      }))
    ));
    const rows = [];
    for (let row = 0; row < state.maxGuesses; row += 1) {
      const history = state.history[row];
      const isDraft = !history && row === state.history.length && state.status === "playing";
      const tiles = [];
      for (let column = 0; column < 5; column += 1) {
        const draftTile = isDraft ? draftTiles[column] : null;
        const letter = history?.word[column] || draftTile?.letter || "";
        // shownFeedback is what a boss lets the board reveal; it matches
        // feedback exactly in an ordinary round.
        const result = (history?.shownFeedback || history?.feedback || [])[column] || "";
        const tileClass = result ? ` is-${result}` : letter ? " is-filled" : "";
        if (draftTile) {
          tiles.push(`
            <button type="button" class="cuddle-tile is-draft-tile${tileClass}"
              data-draft-index="${draftTile.draftIndex}" data-draft-card-id="${escapeHtml(draftTile.cardId)}"
              aria-label="Remove ${escapeHtml(draftTile.glyph)} from the current word"
              title="Click to return ${escapeHtml(draftTile.glyph)} to your hand">
              ${escapeHtml(letter)}
            </button>`);
        } else {
          tiles.push(`<span class="cuddle-tile${tileClass}">${escapeHtml(letter)}</span>`);
        }
      }
      // Count Only replaces the row's score with the only thing it tells you:
      // how many greens and yellows the guess actually hit.
      const counts = history?.bossCounts;
      // Every other boss round never scores (scoreDelta is always 0 there),
      // so a plain "+0" told the player nothing -- show instead whether the
      // boss's constraint actually applied to this specific guess. Its
      // window can end mid-round, so later guesses go back to normal.
      const bossBadge = state.boss && history && !counts
        ? (history.bossActive
            ? `<span class="cuddle-row-score is-boss-active" title="${escapeHtml(state.boss.title || "Boss power")} applied to this guess">${escapeHtml(state.boss.icon || "⚡")}</span>`
            : `<span class="cuddle-row-score is-boss-inactive" title="${escapeHtml(state.boss.title || "Boss power")} no longer applies to this guess">—</span>`)
        : null;
      const score = counts
        ? `<span class="cuddle-row-score is-counts" title="${counts.green} green, ${counts.yellow} yellow">🟩${counts.green} 🟨${counts.yellow}</span>`
        : bossBadge
          ? bossBadge
          : history
            ? `<span class="cuddle-row-score ${history.scoreDelta < 0 ? "is-negative" : ""}">${history.scoreDelta >= 0 ? "+" : ""}${history.scoreDelta}${history.earlyBonus ? `<small> +${history.earlyBonus}</small>` : ""}</span>`
            : `<span class="cuddle-row-score">${row + 1}</span>`;
      // The active row is tagged so a short screen, where the board scrolls
      // inside its own column, can keep it in view after every render.
      rows.push(`<div class="cuddle-board-row${isDraft ? " is-current-row" : ""}">${tiles.join("")}${score}</div>`);
    }
    const removedCount = state.removedLetters?.length || 0;
    const excluded = removedCount
      ? `<p class="cuddle-excluded-letters">${removedCount} letter${removedCount === 1 ? "" : "s"} excluded: ${escapeHtml(state.removedLetters.join(", "))}</p>`
      : "";
    return `<section class="cuddle-board" aria-label="Guess board">${rows.join("")}</section>${excluded}`;
  }

  function renderStatusAnnouncement(state) {
    const draftWord = game.getDraftWord();
    const validation = game.canSubmit();
    const draftError = state.status === "playing" && draftWord.length === 5 && !validation.ok
      ? validation.error
      : "";
    const message = uiMessage || draftError || state.lastMessage || "";
    return `<div class="cuddle-sr-status" role="status" aria-live="polite">${escapeHtml(message)}</div>`;
  }

  function groupedHand(state) {
    const groups = new Map();
    state.hand.forEach(card => {
      if (!groups.has(card.glyph)) groups.set(card.glyph, []);
      groups.get(card.glyph).push(card);
    });
    const sourceRank = source => source === "infinite" ? 0 : source === "reward" ? 1 : 2;
    const allGroups = [...groups.entries()]
      .map(([glyph, cards]) => ({
        glyph,
        cards: cards.slice().sort((a, b) => (
          sourceRank(a.source) - sourceRank(b.source) || a.id.localeCompare(b.id)
        ))
      }));
    const sortByColorThenLetter = (a, b) => {
      const aStatus = game.getCardKnowledgeStatus(a.glyph);
      const bStatus = game.getCardKnowledgeStatus(b.glyph);
      return (CARD_STATUS_ORDER[aStatus] ?? 99) - (CARD_STATUS_ORDER[bStatus] ?? 99)
        || a.glyph.localeCompare(b.glyph);
    };
    // All consonants stay in one row (sortByColorThenLetter already ranks
    // green and yellow ahead of grey/red), rather than pulling known ones
    // out into a separate row above.
    return {
      vowels: allGroups
        .filter(group => VOWEL_SET.has(group.glyph))
        .sort(sortByColorThenLetter),
      consonants: allGroups
        .filter(group => !VOWEL_SET.has(group.glyph))
        .sort(sortByColorThenLetter)
    };
  }

  function renderHandCard(group, state, limit) {
    // A displayed glyph is reusable in play mode, whether its backing card is finite or persistent.
    const persistentCard = group.cards.find(card => game.isInfiniteCard(card));
    const draftedCount = state.draft.filter(id => group.cards.some(card => card.id === id)).length;
    const selectable = group.cards.filter(card => (
      !game.isInfiniteCard(card)
      && !state.draft.includes(card.id)
    ));
    const selectedCount = selectable.filter(card => selectedCards.has(card.id)).length;
    const unselectedCount = selectable.length - selectedCount;
    // A boss can withhold what a played letter actually did. Those letters go
    // to the unknown pile: still playable, but drawn with a question mark
    // instead of a colour that would give the answer away.
    const unknown = typeof game.isGlyphUnknown === "function" && game.isGlyphUnknown(group.glyph);
    const status = unknown ? "unknown" : game.getCardKnowledgeStatus(group.glyph);
    const disabled = state.status !== "playing"
      || (actionMode === "play" && game.getDraftWord().length >= 5)
      || (actionMode !== "play" && selectable.length === 0)
      || (actionMode !== "play" && selectedCount === 0 && (unselectedCount === 0 || selectedCards.size >= limit));
    const isJoker = group.glyph === window.CuddleEngine.CUDDLE_JOKER_GLYPH;
    const classes = [
      "cuddle-card",
      `is-card-${status}`,
      persistentCard ? "is-infinite" : "",
      VOWEL_SET.has(group.glyph) ? "is-vowel" : "",
      draftedCount ? "has-drafted" : "",
      selectedCount ? "is-selected" : "",
      isJoker ? "is-joker" : ""
    ].filter(Boolean).join(" ");
    const statusLabel = status === "unknown" ? "unknown · result withheld"
      : status === "green" ? "green"
        : status === "yellow" ? "yellow"
          : status === "red" ? "red · not in the secret"
            : "grey · unused";
    const count = group.cards.length;
    const details = [
      "reusable while in hand",
      persistentCard ? "stays in hand after a guess" : `${count} ${count === 1 ? "copy" : "copies"}`,
      statusLabel,
      draftedCount ? `${draftedCount} in the grid` : "",
      selectedCount ? `${selectedCount} selected` : ""
    ].filter(Boolean).join(" · ");
    return `
      <button class="${classes}" data-card-glyph="${escapeHtml(group.glyph)}" ${disabled ? "disabled" : ""}
        aria-pressed="${draftedCount > 0 || selectedCount > 0 ? "true" : "false"}"
        aria-label="${escapeHtml(group.glyph)}: ${escapeHtml(details)}"
        title="${escapeHtml(details)}">
        <span class="cuddle-card-letter">${escapeHtml(group.glyph)}</span>
        ${unknown ? `<span class="cuddle-card-unknown" aria-hidden="true">?</span>` : ""}
        ${count > 1 ? `<span class="cuddle-card-count" aria-hidden="true">${count}</span>` : ""}
      </button>`;
  }

  function renderHand(state, rules) {
    const limit = game.getMulliganLimit();
    const groups = groupedHand(state);
    const vowels = groups.vowels.map(group => renderHandCard(group, state, limit)).join("");
    const consonants = groups.consonants.map(group => renderHandCard(group, state, limit)).join("");
    const submit = game.canSubmit();
    const isPlaying = state.status === "playing";
    const isMulliganMode = isPlaying && actionMode === "mulligan";
    const showSubmitRow = isPlaying && (actionMode === "play" || isMulliganMode);
    const mega = state.megaState || {};
    const jokerCharges = Number(mega.jokerCharges || 0);
    const metaBadges = [
      state.suggestedWord ? `<b>Hint ${escapeHtml(state.suggestedWord)}</b>` : "",
      state.buffs.greyShield ? `<b>Grey shield ${state.buffs.greyShield}</b>` : "",
      jokerCharges > 0 ? `<b>🃏 Jokers ${jokerCharges}</b>` : ""
    ].filter(Boolean).join("");
    const selectedCount = selectedCards.size;
    const mulliganValid = selectedCount >= 1 && selectedCount <= limit;
    const questRerollCharges = Number(mega.questRerollCharges || 0);
    const canReroll = isPlaying && !game.isBossRound() && Boolean(state.activeQuest) && questRerollCharges > 0;
    return `
      <section class="cuddle-hand-panel">
        ${metaBadges ? `<div class="cuddle-hand-meta">${metaBadges}</div>` : ""}
        ${isPlaying && canReroll ? `
          <div class="cuddle-utility-row">
            <button class="cuddle-btn" data-action="reroll-quest" title="Swap your active quest for a different one">
              🔄 Reroll quest <span>${questRerollCharges}</span>
            </button>
          </div>` : ""}
        ${showSubmitRow ? `
          <div class="cuddle-submit-row ${isMulliganMode ? "is-mulligan-mode" : ""}">
            ${isMulliganMode ? `
              <button class="cuddle-btn cuddle-btn-primary cuddle-mulligan cuddle-mulligan-confirm" data-action="confirm-mulligan" ${mulliganValid ? "" : "disabled"}>
                Confirm mulligan <span>${selectedCount}/${limit} selected</span>
              </button>
              <button class="cuddle-btn cuddle-backspace" data-action="cancel-mode" aria-label="Cancel mulligan" title="Cancel mulligan">✕</button>
            ` : `
              <button class="cuddle-btn cuddle-mulligan" data-action="mulligan-mode" ${state.mulligansLeft > 0 ? "" : "disabled"}
                title="Mulligan: ${state.mulligansLeft} left, up to ${rules.mulliganSize} cards">
                Mulligan <span>${state.mulligansLeft}</span>
              </button>
              <button class="cuddle-btn cuddle-btn-primary cuddle-submit" data-action="submit" ${submit.ok ? "" : "disabled"}>Submit word</button>
              <button class="cuddle-btn cuddle-backspace" data-action="backspace" ${state.draft.length ? "" : "disabled"}
                aria-label="Delete the last drafted card" title="Delete last letter">⌫</button>
            `}
          </div>` : ""}
        <div class="cuddle-hand" aria-label="Letter card hand">
          <div class="cuddle-hand-row cuddle-hand-vowels" aria-label="Bold, always-available vowels">${vowels}</div>
          <div class="cuddle-hand-row cuddle-hand-consonants" aria-label="Consonants">${consonants || `<p class="cuddle-draft-empty">No consonant cards are currently available.</p>`}</div>
        </div>
      </section>`;
  }

  /* UMT_CUDDLE_SINGLEPLAYER_V2: ROUND INTRO START */
  function renderRoundIntroOverlay(state) {
    const target = game.getTarget();
    const needed = Math.max(0, target - state.score);
    const totalRounds = window.CuddleEngine.THRESHOLDS.length;
    const modifications = typeof game.getCurrentModifications === "function"
      ? game.getCurrentModifications()
      : game.getUpgradeSummary();
    return `
      <div class="cuddle-overlay" role="dialog" aria-modal="true" aria-labelledby="cuddleRoundIntroTitle">
        <section class="cuddle-modal cuddle-round-intro">
          <span class="cuddle-modal-kicker">ROUND ${state.round} OF ${totalRounds}</span>
          <h2 id="cuddleRoundIntroTitle">Ready for round ${state.round}</h2>
          <button class="cuddle-btn cuddle-btn-primary cuddle-round-start" data-action="start-round">Start round ${state.round}</button>
          <p>Solve the fixed secret and finish the round at or above the next score target.</p>
          <div class="cuddle-round-intro-stats">
            <div><span>Current score</span><strong>${state.score}</strong></div>
            <div><span>Next target</span><strong>${target}</strong></div>
            <div><span>Still needed</span><strong>${needed}</strong></div>
          </div>
          <div class="cuddle-round-modifications">
            <h3>Current modifications</h3>
            <ul>${modifications.map(line => `<li>${escapeHtml(line)}</li>`).join("")}</ul>
          </div>
        </section>
      </div>`;
  }

  function renderStateOverlay(state) {
    if (state.status === "bossChoice") return renderBossChoiceOverlay(state);
    if (state.status === "playing" && state.roundIntroPending) return renderRoundIntroOverlay(state);
    if (state.status === "questReward") return renderQuestRewardOverlay(state);
    if (state.status === "upgrade") return renderUpgradeOverlay(state);
    if (state.status === "lost") return renderEndOverlay(state, false);
    if (state.status === "won") return renderEndOverlay(state, true);
    return "";
  }

  // Every boss choice shows its permanent reward, including the final boss.
  // Bosses never add a second ordinary post-round reward.
  function renderBossChoiceOverlay(state) {
    const options = state.bossOffer || [];
    const isFinal = options.some(option => option.gate === "final");
    return `
      <div class="cuddle-overlay" role="dialog" aria-modal="true" aria-labelledby="cuddleBossTitle">
        <section class="cuddle-modal cuddle-modal-wide cuddle-boss-modal">
          <span class="cuddle-modal-kicker">${isFinal ? "FINAL BOSS" : "BOSS ROUND"}</span>
          <h2 id="cuddleBossTitle">${isFinal ? "One last secret" : "Choose your boss"}</h2>
          <p>${isFinal
            ? "Beat this round to win the run. Its permanent reward is shown below; no ordinary upgrade follows."
            : "A boss round is pass or fail: nothing scores, you only have to solve it. Clear it and you keep the permanent reward shown below; there is no additional ordinary reward after a boss."}</p>
          <div class="cuddle-choice-grid">
            ${options.map(option => `
              <button class="cuddle-choice cuddle-boss-choice" data-boss-id="${escapeHtml(option.id)}">
                <span class="cuddle-choice-icon">${escapeHtml(option.icon || "💀")}</span>
                <strong>${escapeHtml(option.title)}</strong>
                <small>${escapeHtml(option.description)}</small>
                ${option.reward ? `
                  <span class="cuddle-boss-reward">
                    <b>${escapeHtml(option.reward.icon || "🎁")} ${escapeHtml(option.reward.title)}</b>
                    <span>${escapeHtml(option.reward.description)}</span>
                  </span>` : ""}
              </button>`).join("")}
          </div>
        </section>
      </div>`;
  }
  /* UMT_CUDDLE_SINGLEPLAYER_V2: ROUND INTRO END */
  function renderQuestRewardOverlay(state) {
    // Double Pick (a boss reward) lets the player choose twice from the
    // same offer instead of once -- questRewardPicksRemaining tracks which
    // pick this is, so the heading/copy can say so instead of always
    // reading "choose one" while a second pick is still pending.
    const totalPicks = state.upgrades?.questDoublePick ? 2 : 1;
    const picksRemaining = Math.max(1, Number(state.questRewardPicksRemaining) || 1);
    const heading = totalPicks > 1
      ? (picksRemaining >= totalPicks ? "Choose your first reward" : "Choose your second reward")
      : "Choose one reward";
    const subtext = totalPicks > 1
      ? "Double Pick is active: choose two of these rewards. Effects apply immediately and never carry into the next round."
      : "Choose a reward for the current round. It applies immediately and never carries into the next round.";
    return `
      <div class="cuddle-overlay" role="dialog" aria-modal="true" aria-labelledby="cuddleRewardTitle">
        <section class="cuddle-modal cuddle-modal-wide">
          <span class="cuddle-modal-kicker">QUEST COMPLETE</span>
          <h2 id="cuddleRewardTitle">${heading}</h2>
          <p>${subtext}</p>
          <div class="cuddle-choice-grid">
            ${state.questRewardChoices.map(reward => `
              <button class="cuddle-choice" data-reward-id="${escapeHtml(reward.id)}">
                <span class="cuddle-choice-icon">${escapeHtml(reward.icon || "✨")}</span>
                <strong>${escapeHtml(reward.title)}</strong>
                <small>${escapeHtml(reward.description)}</small>
              </button>`).join("")}
          </div>
          <button class="cuddle-btn cuddle-btn-ghost" data-action="refresh-rewards" ${state.questRewardRefreshesLeft > 0 ? "" : "disabled"}>
            Refresh choices (${state.questRewardRefreshesLeft})
          </button>
        </section>
      </div>`;
  }

  function renderUpgradeOverlay(state) {
    const milestone = state.upgradePhase === "milestone";
    const startingRewards = state.upgradePhase === "difficultyStart";
    const summary = state.lastRoundSummary;
    const refreshCost = typeof game.getUpgradeRefreshCost === "function"
      ? game.getUpgradeRefreshCost()
      : null;
    const canRefresh = refreshCost !== null
      && (refreshCost === 0 || Number(state.score) >= refreshCost);
    const refreshLabel = refreshCost === 0
      ? "Refresh choices (free)"
      : refreshCost === null
        ? "Refresh unavailable"
        : `Refresh choices (${refreshCost} points)`;
    const kicker = milestone
      ? `SCORE MILESTONE · ${state.upgradeMilestone}`
      : startingRewards
        ? "STARTING REWARDS"
        : `ROUND ${summary?.round || state.round} CLEARED`;
    const heading = milestone
      ? "Choose a bonus upgrade"
      : startingRewards
        ? "Choose a starting reward"
        : "Improve the run";
    const body = milestone
      ? `Your total score reached ${state.upgradeMilestone}. This choice is in addition to the round reward.`
      : startingRewards
        ? "Pick a reward to begin the run with."
        : `${escapeHtml(summary?.secret || state.secret)} solved in ${summary?.guesses || state.guessesUsed} guesses. Total score: ${state.score}.`;
    return `
      <div class="cuddle-overlay" role="dialog" aria-modal="true" aria-labelledby="cuddleUpgradeTitle">
        <section class="cuddle-modal cuddle-modal-wide">
          <span class="cuddle-modal-kicker">${kicker}</span>
          <h2 id="cuddleUpgradeTitle">${heading}</h2>
          <p>${body}</p>
          <div class="cuddle-choice-grid">
            ${state.upgradeChoices.map(choice => `
              <button class="cuddle-choice" data-upgrade-key="${escapeHtml(choice.key)}">
                <span class="cuddle-choice-icon">${escapeHtml(choice.icon || "⬆️")}</span>
                <strong>${escapeHtml(choice.title)}</strong>
                <small>${escapeHtml(choice.description)}</small>
              </button>`).join("")}
          </div>
          <div class="cuddle-upgrade-refresh">
            <button class="cuddle-btn cuddle-btn-ghost" data-action="refresh-upgrades" ${canRefresh ? "" : "disabled"}>
              ${escapeHtml(refreshLabel)}
            </button>
            <small>The first refresh on each between-round reward screen is free. Later refreshes cost 3, 5, 7, 9, and so on.</small>
          </div>
          <details class="cuddle-upgrade-details">
            <summary>Current run upgrades</summary>
            <ul>${game.getUpgradeSummary().map(line => `<li>${escapeHtml(line)}</li>`).join("")}</ul>
          </details>
        </section>
      </div>`;
  }

  /* UMT_CUDDLE_SINGLEPLAYER_V2: END SHARE START */
  function buildCuddleShareText(state, won) {
    const totalRounds = window.CuddleEngine.THRESHOLDS.length;
    const round = state.lastRoundSummary?.round || state.round;
    const grid = (state.history || []).map(entry => (
      (entry.feedback || []).map(result => (
        result === "green" ? "🟩" : result === "yellow" ? "🟨" : "⬛"
      )).join("")
    )).join("\n");
    const lastEntry = state.history?.[state.history.length - 1];
    const lines = [
      `Cuddle ${won ? "🏆" : "🌙"} · Round ${round}/${totalRounds}`,
      `${won ? "Campaign complete" : "Run ended"} · ${state.score} points`,
      `Guesses: ${(state.history || []).length}/${state.maxGuesses || 6}`
    ];
    if (grid) lines.push(grid);
    if (lastEntry?.questFinalBonus) lines.push(`Quest finish bonus: +${lastEntry.questFinalBonus}`);
    return lines.join("\n");
  }

  async function copyCuddleShareText(text) {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch {
        // Fall through to the selection-based copy for browsers that expose
        // Clipboard API support but deny it in the current context.
      }
    }
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    if (!copied) throw new Error("Clipboard copy was not available.");
  }

  function setCuddleShareStatus(message) {
    const status = document.getElementById("cuddleShareStatus");
    if (status) status.textContent = message;
  }

  async function shareFinishedRun() {
    const state = currentState();
    if (!state || !["won", "lost"].includes(state.status)) return;
    const won = state.status === "won";
    const text = buildCuddleShareText(state, won);
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({
          title: "Cuddle round result",
          text,
          url: window.location.href
        });
        setCuddleShareStatus("Round shared.");
        return;
      }
      await copyCuddleShareText(`${text}\n${window.location.href}`);
      setCuddleShareStatus("Round copied to the clipboard.");
    } catch (error) {
      if (error?.name === "AbortError") return;
      try {
        await copyCuddleShareText(`${text}\n${window.location.href}`);
        setCuddleShareStatus("Round copied to the clipboard.");
      } catch {
        setCuddleShareStatus("Sharing was unavailable in this browser.");
      }
    }
  }

  function renderEndOverlay(state, won) {
    const totalRounds = window.CuddleEngine.THRESHOLDS.length;
    const removedLetters = state.removedLetters || [];
    return `
      <div class="cuddle-overlay" role="dialog" aria-modal="true" aria-labelledby="cuddleEndTitle">
        <section class="cuddle-modal cuddle-end-modal">
          <span class="cuddle-modal-kicker">${won ? `${totalRounds} ROUNDS CLEARED` : "RUN ENDED"}</span>
          <div class="cuddle-end-icon" aria-hidden="true">${won ? "🏆" : "🌙"}</div>
          <h2 id="cuddleEndTitle">${won ? "Cuddle complete" : "The deck goes quiet"}</h2>
          <p>${won
            ? `You won the campaign with ${state.score} points.`
            : escapeHtml(state.failureReason || "The run could not continue.")}</p>
          <div class="cuddle-end-stats">
            <div><span>Score</span><strong>${state.score}</strong></div>
            <div><span>Rounds reached</span><strong>${state.round}/${totalRounds}</strong></div>
            <div><span>Removed letters</span><strong>${removedLetters.length ? escapeHtml(removedLetters.join(" ")) : "—"}</strong></div>
          </div>
          <details class="cuddle-upgrade-details">
            <summary>Final upgrades</summary>
            <ul>${game.getUpgradeSummary().map(line => `<li>${escapeHtml(line)}</li>`).join("")}</ul>
          </details>
          <p class="cuddle-share-help">Share the final round grid without revealing the secret word.</p>
          <p id="cuddleShareStatus" class="cuddle-share-status" role="status" aria-live="polite"></p>
          <div class="cuddle-modal-actions">
            <button class="cuddle-btn cuddle-btn-primary" data-action="share-run">Share round</button>
            <button class="cuddle-btn" data-action="run-menu">Start another run</button>
            <button class="cuddle-btn cuddle-btn-ghost" data-action="back">Main menu</button>
          </div>
        </section>
      </div>`;
  }
  /* UMT_CUDDLE_SINGLEPLAYER_V2: END SHARE END */
  function renderRulesOverlay() {
    const state = currentState();
    const rules = state ? game.getRulesSummary() : {
      handSize: 5,
      freeVowels: 5,
      mulligans: 2,
      mulliganSize: 3,
      yellowPoints: 1,
      greenPoints: 2,
      greyPoints: 0,
      earlyPoint: 10,
      mulliganPoints: 3,
      questPoints: 0,
      questCadence: 3
    };
    return `
      <div class="cuddle-overlay cuddle-rules-overlay" role="dialog" aria-modal="true" aria-labelledby="cuddleRulesTitle">
        <section class="cuddle-modal cuddle-rules-modal">
          <button class="cuddle-modal-close" data-action="close-rules" aria-label="Close rules">×</button>
          <span class="cuddle-modal-kicker">HOW TO PLAY</span>
          <h2 id="cuddleRulesTitle">Cuddle rules</h2>
          <div class="cuddle-rules-grid">
            <article><strong>1 · Build, do not type</strong><p>Tap cards in order to make a five-letter word from the existing secret list. Q is its own card; use the always-available U card separately when a word needs QU.</p></article>
            <article><strong>2 · Reuse letters in hand</strong><p>Any letter currently shown in your hand can be tapped more than once while building a word. A, E, I, O, and U are bold, always available, and do not use counted hand slots. Yellow or green consonants stay in hand after a guess.</p></article>
            <article><strong>3 · Refill the hand</strong><p>You have ${rules.handSize} counted consonant slots. A finite consonant used in a submitted word leaves once, even when it was repeated in that word, and the draw pile refills open counted slots back toward ${rules.handSize}.</p></article>
            <article><strong>4 · Fix bad hands</strong><p>You begin each round with ${rules.mulligans} mulligans of up to ${rules.mulliganSize} cards.</p></article>
            <article><strong>5 · Score enough</strong><p>Yellow tiles score ${rules.yellowPoints > 0 ? "+" : ""}${rules.yellowPoints}, green tiles score ${rules.greenPoints > 0 ? "+" : ""}${rules.greenPoints}, and grey tiles score ${rules.greyPoints > 0 ? "+" : ""}${rules.greyPoints}. Solving early adds +${rules.earlyPoint} for every unused guess, and every mulligan you did not spend is worth +${rules.mulliganPoints}. You must also meet the cumulative round target.</p></article>
            <article><strong>6 · Grow the run</strong><p>Quests appear every few turns and pay bonus points once you own a reward that makes them worth something. Certain boss rewards add extra concurrent quests. Solve the word to choose an upgrade after every round.</p></article>
            <article><strong>7 · Boss rounds</strong><p>Before rounds 4, 7, and 10 -- and once more after round 12 -- you pick one of two bosses. Their powers last for 2, 2, 3, and 4 guesses respectively. A boss round is pass or fail: nothing scores and no target applies, you just have to solve it. Clear any boss to receive its displayed permanent reward; no ordinary upgrade is added afterward.</p></article>
          </div>
          <p class="cuddle-rule-note"><strong>Campaign targets:</strong> ${window.CuddleEngine.THRESHOLDS.join(" · ")}. Clear round ${scoringRounds()} at ${window.CuddleEngine.THRESHOLDS[scoringRounds() - 1]} points, then beat the final boss to win.</p>
          <button class="cuddle-btn cuddle-btn-primary" data-action="close-rules">Got it</button>
        </section>
      </div>`;
  }

  function setUiMessage(message) {
    uiMessage = message || "";
  }

  function resetActionMode() {
    actionMode = "play";
    selectedCards = new Set();
  }

  function cardsForGlyph(glyph) {
    const state = currentState();
    const sourceRank = source => source === "infinite" ? 0 : source === "reward" ? 1 : 2;
    return state.hand
      .filter(card => card.glyph === glyph)
      .sort((a, b) => sourceRank(a.source) - sourceRank(b.source) || a.id.localeCompare(b.id));
  }

  function choosePlayCard(glyph) {
    const cards = cardsForGlyph(glyph);
    const card = cards.find(item => game.isInfiniteCard(item)) || cards[0];
    if (!card) return { ok: false, error: `${glyph} is not currently in your hand.` };
    return game.toggleDraft(card.id);
  }

  function chooseUtilityCard(glyph) {
    const state = currentState();
    const limit = game.getMulliganLimit();
    const eligible = cardsForGlyph(glyph).filter(card => (
      !game.isInfiniteCard(card)
      && !state.draft.includes(card.id)
    ));
    const unselected = eligible.filter(card => !selectedCards.has(card.id));
    const selected = eligible.filter(card => selectedCards.has(card.id));
    if (unselected.length && selectedCards.size < limit) {
      selectedCards.add(unselected[0].id);
      return;
    }
    // Once the group has reached its available/global selection limit, the
    // next click clears that letter's selected copies so grouped cards remain
    // practical without a keyboard or modifier key.
    selected.forEach(card => selectedCards.delete(card.id));
  }

  function startNewRun(difficulty) {
    if (!wordLists) return;
    if (game?.state && !["lost", "won"].includes(game.state.status)) {
      const okay = window.confirm("Start a new Cuddle run? The current saved run will be replaced.");
      if (!okay) return;
    }
    game = new window.CuddleEngine.CuddleGame(wordLists);
    game.startNew(difficulty);
    landing = false;
    rulesOpen = false;
    detailsOpen = false;
    resetActionMode();
    setUiMessage("");
  }

  function handleAction(action) {
    switch (action) {
      case "back":
        rulesOpen = false;
        // Cuddle sits on the main menu now, not inside the Play hub.
        showScreen("startupScreen");
        return false;
      case "run-menu":
        landing = true;
        rulesOpen = false;
        detailsOpen = false;
        resetActionMode();
        setUiMessage("");
        return true;
      case "continue":
        landing = false;
        rulesOpen = false;
        detailsOpen = false;
        resetActionMode();
        return true;
      case "toggle-details":
        detailsOpen = !detailsOpen;
        return true;
      case "new-run-easy":
        startNewRun("easy");
        return true;
      case "new-run-medium":
        startNewRun("medium");
        return true;
      case "new-run-hard":
        startNewRun("hard");
        return true;
      case "reroll-quest": {
        const result = game.rerollActiveQuest();
        setUiMessage(result.ok ? "" : result.error);
        return true;
      }
      case "retry-load":
        openCuddle();
        return false;
      case "rules":
        rulesOpen = true;
        return true;
      case "close-rules":
        rulesOpen = false;
        return true;
      /* UMT_CUDDLE_SINGLEPLAYER_V2: ACTIONS START */
      case "start-round": {
        const result = game.dismissRoundIntro();
        setUiMessage(result.ok ? "" : result.error);
        resetActionMode();
        return true;
      }
      case "share-run":
        void shareFinishedRun();
        return false;
      /* UMT_CUDDLE_SINGLEPLAYER_V2: ACTIONS END */
      case "submit": {
        const result = game.submitDraft();
        if (!result.ok) setUiMessage(result.error);
        else setUiMessage("");
        resetActionMode();
        return true;
      }
      case "backspace": {
        const result = game.backspaceDraft();
        setUiMessage(result.ok ? "" : result.error);
        return true;
      }
      case "mulligan-mode":
        game.clearDraft();
        actionMode = "mulligan";
        selectedCards = new Set();
        setUiMessage("Choose cards to replace, then confirm.");
        return true;
      case "cancel-mode":
        resetActionMode();
        setUiMessage("");
        return true;
      case "confirm-mulligan": {
        const result = game.mulligan([...selectedCards]);
        setUiMessage(result.ok ? "" : result.error);
        resetActionMode();
        return true;
      }
      case "refresh-rewards": {
        const result = game.refreshQuestRewards();
        setUiMessage(result.ok ? "" : result.error);
        return true;
      }
      case "refresh-upgrades": {
        const result = game.refreshUpgradeChoices();
        setUiMessage(result.ok ? (result.message || "") : result.error);
        return true;
      }
      default:
        return false;
    }
  }

  function handleClick(event) {
    const actionButton = event.target.closest("[data-action]");
    if (actionButton) {
      event.preventDefault();
      const shouldRender = handleAction(actionButton.dataset.action);
      if (shouldRender) render();
      return;
    }

    const bossButton = event.target.closest("[data-boss-id]");
    if (bossButton) {
      const result = game.chooseBoss(bossButton.dataset.bossId);
      setUiMessage(result.ok ? "" : result.error);
      resetActionMode();
      render();
      return;
    }

    const rewardButton = event.target.closest("[data-reward-id]");
    if (rewardButton) {
      const result = game.chooseQuestReward(rewardButton.dataset.rewardId);
      setUiMessage(result.ok ? "" : result.error);
      resetActionMode();
      render();
      return;
    }

    const upgradeButton = event.target.closest("[data-upgrade-key]");
    if (upgradeButton) {
      const result = game.chooseUpgrade(upgradeButton.dataset.upgradeKey);
      setUiMessage(result.ok ? "" : result.error);
      resetActionMode();
      render();
      return;
    }

    const draftTile = event.target.closest("[data-draft-index]");
    if (draftTile && game?.state?.status === "playing" && actionMode === "play") {
      const result = game.removeDraftAt(Number(draftTile.dataset.draftIndex));
      setUiMessage(result.ok ? "" : result.error);
      render();
      return;
    }

    const cardButton = event.target.closest("[data-card-glyph]");
    if (!cardButton || !game?.state || game.state.status !== "playing") return;
    const glyph = cardButton.dataset.cardGlyph;
    if (actionMode === "play") {
      const result = choosePlayCard(glyph);
      setUiMessage(result.ok ? "" : result.error);
    } else {
      chooseUtilityCard(glyph);
    }
    render();
  }

  /* UMT_CUDDLE_REBALANCE_V3: UI START */
  function cuddleV3ToastStack(state) {
    const boss = state?.bossRewardNotice;
    const synergy = state?.synergyNotice;
    if (!boss && !synergy) return "";
    return `
      <div class="cuddle-v3-toast-stack" aria-live="polite">
        ${boss ? `
          <section class="cuddle-v3-toast is-boss" role="status">
            <span class="cuddle-v3-toast-icon">${escapeHtml(boss.icon || "🎁")}</span>
            <div><small>${escapeHtml(boss.bossTitle || "Boss")} cleared</small><strong>${escapeHtml(boss.title || "Boss reward received")}</strong><p>${escapeHtml(boss.message || "Permanent bonus received.")}</p></div>
            <button type="button" data-cuddle-v3-action="dismiss-boss-reward" aria-label="Dismiss boss reward">×</button>
          </section>` : ""}
        ${synergy ? `
          <section class="cuddle-v3-toast is-synergy" role="status">
            <span class="cuddle-v3-toast-icon">${escapeHtml(synergy.icon || "✨")}</span>
            <div><small>Reward interaction</small><strong>${escapeHtml(synergy.title || "Combination unlocked")}</strong><p>${escapeHtml(synergy.message || "A new combination bonus is active.")}</p></div>
            <button type="button" data-cuddle-v3-action="dismiss-synergy" aria-label="Dismiss combination bonus">×</button>
          </section>` : ""}
      </div>`;
  }
  function cuddleV3EnhanceRenderedRun() {
    const state = currentState();
    if (!root || landing || !state || !game) return;

    if (typeof game.getMysteryKind === "function") {
      root.querySelectorAll("[data-card-glyph]").forEach(card => {
        const kind = game.getMysteryKind(card.dataset.cardGlyph);
        if (!kind) return;
        card.classList.add(`is-mystery-${kind}`);
        card.dataset.mysteryKind = kind;
      });
    }

    const shell = root.querySelector(".cuddle-shell") || root;
    const toasts = cuddleV3ToastStack(state);
    if (toasts) shell.insertAdjacentHTML("beforeend", toasts);
  }

  const cuddleV3OriginalSyncQuickModeTimer = syncQuickModeTimer;
  syncQuickModeTimer = function syncCuddleV3QuickModeTimer() {
    const state = currentState();
    if (state?.boss?.secondsPerGuess
        && typeof game?._bossActive === "function"
        && !game._bossActive()) {
      clearQuickModeTimer();
      return;
    }
    cuddleV3OriginalSyncQuickModeTimer();
  };

  const cuddleV3OriginalRender = render;
  render = function renderCuddleV3() {
    cuddleV3OriginalRender();
    cuddleV3EnhanceRenderedRun();
  };

  document.addEventListener("click", event => {
    const button = event.target.closest("[data-cuddle-v3-action]");
    if (!button) return;
    event.preventDefault();
    const action = button.dataset.cuddleV3Action;
    if (action === "dismiss-boss-reward") game?.dismissBossRewardNotice?.();
    else if (action === "dismiss-synergy") game?.dismissSynergyNotice?.();
    else return;
    render();
  });
  /* UMT_CUDDLE_REBALANCE_V3: UI END */
  /* UMT_CUDDLE_CAMPAIGN_UI START */
  const cuddleCampaignOriginalRenderRun = renderRun;
  renderRun = function renderRunWithCampaignMap() {
    if (!window.CuddleCampaign || !game?.state) {
      return cuddleCampaignOriginalRenderRun();
    }
    if (game.state.status === "shop") {
      return window.CuddleCampaign.renderShop(game);
    }
    if (game.state.status === "playing" && game.state.roundIntroPending
        && typeof window.CuddleCampaign.renderRoundIntroMap === "function") {
      return window.CuddleCampaign.renderRoundIntroMap(game);
    }
    return window.CuddleCampaign.insertMap(cuddleCampaignOriginalRenderRun(), game);
  };

  const cuddleCampaignOriginalRender = render;
  render = function renderWithCampaignMap() {
    cuddleCampaignOriginalRender();
    window.CuddleCampaign?.afterRender?.(root, game, landing);
  };

  window.addEventListener("cuddle:campaign-update", () => {
    if (!landing && game?.state) render();
  });

  document.addEventListener("click", event => {
    const target = event.target instanceof Element ? event.target : null;
    const button = target?.closest("[data-cuddle-campaign-action]");
    if (!button || !root?.contains(button)) return;
    event.preventDefault();
    const result = window.CuddleCampaign?.handleUiAction?.(
      game,
      button.dataset.cuddleCampaignAction,
      button.dataset.shopItemId
    ) || { ok: false, error: "Campaign action unavailable." };
    setUiMessage(result.ok ? (result.message || "") : result.error);
    resetActionMode();
    render();
  });
  /* UMT_CUDDLE_CAMPAIGN_UI END */
  document.addEventListener("DOMContentLoaded", () => {
    root = document.getElementById(ROOT_ID);
    document.getElementById("cuddleBtn")?.addEventListener("click", openCuddle);
    root?.addEventListener("click", handleClick);
  });

  window.CuddleMode = Object.freeze({ open: openCuddle });
}());
