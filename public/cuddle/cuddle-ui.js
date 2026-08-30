// public/cuddle/cuddle-ui.js
// Card-only renderer and menu integration for Cuddle. No keyboard handlers are registered.
(function () {
  "use strict";

  const WORDS_URL = "cuddle/allowed-secrets.txt";
  const ROOT_ID = "cuddleRoot";
  let root = null;
  let words = null;
  let game = null;
  let landing = true;
  let rulesOpen = false;
  let actionMode = "play";
  let selectedCards = new Set();
  let uiMessage = "";
  let loadingPromise = null;

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
    if (words) return words;
    if (loadingPromise) return loadingPromise;
    loadingPromise = fetch(WORDS_URL, { cache: "no-cache" })
      .then(response => {
        if (!response.ok) throw new Error(`Could not load Cuddle secrets (${response.status}).`);
        return response.text();
      })
      .then(text => {
        const parsed = window.CuddleEngine.normalizeWords(text.split(/\r?\n|\s+/));
        if (parsed.length < 12) throw new Error("The copied secret list contains fewer than 12 usable words.");
        words = parsed;
        return words;
      })
      .finally(() => { loadingPromise = null; });
    return loadingPromise;
  }

  async function openCuddle() {
    showScreen("cuddleScreen");
    root = document.getElementById(ROOT_ID);
    if (!root) return;
    root.innerHTML = renderLoading();
    try {
      const loadedWords = await loadWords();
      game = window.CuddleEngine.CuddleGame.load(loadedWords);
      landing = true;
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

  function renderFatal(message) {
    return `
      <div class="cuddle-loading-card cuddle-fatal" role="alert">
        <div class="cuddle-logo" aria-hidden="true">!</div>
        <h2>Cuddle could not load</h2>
        <p>${escapeHtml(message)}</p>
        <button class="cuddle-btn" data-action="back">Back to menu</button>
      </div>`;
  }

  function currentState() {
    return game?.state || null;
  }

  function render() {
    if (!root) return;
    if (landing || !game?.state) root.innerHTML = renderLanding();
    else root.innerHTML = renderRun();
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
          <p class="cuddle-tagline">Build words from cards. Learn the secret. Shape the deck. Survive twelve rounds.</p>
          <div class="cuddle-save-summary ${hasRun ? "" : "is-empty"}">
            <span>${escapeHtml(statusLabel)}</span>
            ${hasRun ? `<strong>Score ${state.score} · Round ${state.round}/12</strong>` : `<strong>Your run saves in this browser.</strong>`}
          </div>
          <div class="cuddle-landing-actions">
            ${hasRun ? `<button class="cuddle-btn cuddle-btn-primary" data-action="continue">${escapeHtml(continueLabel)}</button>` : ""}
            <button class="cuddle-btn ${hasRun ? "" : "cuddle-btn-primary"}" data-action="new-run">New run</button>
            <button class="cuddle-btn cuddle-btn-ghost" data-action="rules">Rules</button>
          </div>
        </section>
        ${rulesOpen ? renderRulesOverlay() : ""}
      </div>`;
  }

  function renderRun() {
    const state = currentState();
    const rules = game.getRulesSummary();
    const target = game.getTarget();
    const needed = Math.max(0, target - state.score);
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
            <h1>CUDDLE</h1>
          </div>
          <div class="cuddle-header-side cuddle-header-side-right">
            <button class="cuddle-icon-btn" data-action="rules" aria-label="How to play">?</button>
          </div>
        </header>

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
        </div>

        <section class="cuddle-metrics" aria-label="Run status">
          <div><span>Round</span><strong>${state.round}/12</strong></div>
          <div><span>Total score</span><strong>${state.score}</strong></div>
          <div><span>Target</span><strong>${target}</strong></div>
          <div><span>Still needed</span><strong>${needed}</strong></div>
          <div><span>Draw / discard</span><strong>${drawPile} / ${recyclable}</strong></div>
        </section>

        <main class="cuddle-play-area">
          <section class="cuddle-left-column">
            ${renderQuest(state, rules)}
            ${renderBoard(state)}
            ${renderKnowledge(state)}
          </section>
          <section class="cuddle-right-column">
            ${renderMessage(state)}
            ${renderDraft(state)}
            ${renderHand(state)}
            ${renderActions(state, rules)}
            <div class="cuddle-score-key">
              <span><b class="is-yellow">Yellow</b> +${rules.yellowPoints}</span>
              <span><b class="is-grey">Grey</b> −1</span>
              <span><b>Early solve</b> +${rules.earlyPoint} per unused guess</span>
            </div>
          </section>
        </main>
        ${renderStateOverlay(state)}
        ${rulesOpen ? renderRulesOverlay() : ""}
      </div>`;
  }

  function renderQuest(state, rules) {
    if (state.activeQuest) {
      return `
        <article class="cuddle-quest is-active">
          <div class="cuddle-quest-icon" aria-hidden="true">${escapeHtml(state.activeQuest.icon || "❗")}</div>
          <div>
            <span class="cuddle-eyebrow">TURN ${state.guessesUsed + 1} QUEST</span>
            <h2>${escapeHtml(state.activeQuest.title)}</h2>
            <p>${escapeHtml(state.activeQuest.description)}</p>
          </div>
        </article>`;
    }
    const nextGuess = state.guessesUsed + 1;
    let trigger = nextGuess;
    while (trigger <= state.maxGuesses && (trigger < rules.questCadence || trigger % rules.questCadence !== 0)) trigger += 1;
    const copy = trigger <= state.maxGuesses
      ? `Next quest appears on guess ${trigger}.`
      : "No more scheduled quests this round.";
    return `
      <article class="cuddle-quest">
        <div class="cuddle-quest-icon" aria-hidden="true">○</div>
        <div>
          <span class="cuddle-eyebrow">QUEST CLOCK</span>
          <h2>Every ${rules.questCadence} turn${rules.questCadence === 1 ? "" : "s"}</h2>
          <p>${escapeHtml(copy)}</p>
        </div>
      </article>`;
  }

  function renderBoard(state) {
    const draftLetters = game.getDraftLetters();
    const rows = [];
    for (let row = 0; row < state.maxGuesses; row += 1) {
      const history = state.history[row];
      const isDraft = !history && row === state.history.length && state.status === "playing";
      const tiles = [];
      for (let column = 0; column < 5; column += 1) {
        const letter = history?.word[column] || (isDraft ? draftLetters[column] : "") || "";
        const result = history?.feedback[column] || "";
        const tileClass = result ? ` is-${result}` : letter ? " is-filled" : "";
        tiles.push(`<span class="cuddle-tile${tileClass}">${escapeHtml(letter)}</span>`);
      }
      const score = history
        ? `<span class="cuddle-row-score ${history.scoreDelta < 0 ? "is-negative" : ""}">${history.scoreDelta >= 0 ? "+" : ""}${history.scoreDelta}${history.earlyBonus ? `<small> +${history.earlyBonus}</small>` : ""}</span>`
        : `<span class="cuddle-row-score">${row + 1}</span>`;
      rows.push(`<div class="cuddle-board-row">${tiles.join("")}${score}</div>`);
    }
    return `<section class="cuddle-board" aria-label="Guess board">${rows.join("")}</section>`;
  }

  function renderKnowledge(state) {
    const pattern = state.revealedPositions.map(letter => letter || "·");
    return `
      <section class="cuddle-knowledge" aria-label="Known information">
        <div class="cuddle-pattern" title="Known green positions">
          ${pattern.map(letter => `<span>${escapeHtml(letter)}</span>`).join("")}
        </div>
        <div class="cuddle-known-list">
          <span><b>Present:</b> ${state.knownPresent.length ? escapeHtml(state.knownPresent.join(" ")) : "—"}</span>
          <span><b>Absent:</b> ${state.knownAbsent.length ? escapeHtml(state.knownAbsent.join(" ")) : "—"}</span>
        </div>
      </section>`;
  }

  function renderMessage(state) {
    const message = uiMessage || state.lastMessage || "Choose cards to build a word.";
    return `
      <div class="cuddle-message" role="status">
        <span>${escapeHtml(message)}</span>
        ${state.suggestedWord ? `<strong>Suggested word: ${escapeHtml(state.suggestedWord)}</strong>` : ""}
        ${state.buffs.greyShield ? `<strong>🥷 Grey shield ready (${state.buffs.greyShield})</strong>` : ""}
      </div>`;
  }

  function renderDraft(state) {
    const cards = game.getDraftCards();
    const word = game.getDraftWord();
    const validation = game.canSubmit();
    return `
      <section class="cuddle-draft-panel">
        <div class="cuddle-section-heading">
          <div>
            <span class="cuddle-eyebrow">YOUR GUESS</span>
            <h2>${word ? escapeHtml(word) : "Choose cards"}</h2>
          </div>
          <span>${word.length}/5 letters</span>
        </div>
        <div class="cuddle-draft-cards" aria-label="Cards in current guess">
          ${cards.length ? cards.map(card => `
            <button class="cuddle-mini-card" data-card-id="${escapeHtml(card.id)}" data-draft-remove="true" title="Return ${escapeHtml(card.glyph)} to hand">
              ${escapeHtml(card.glyph)}
            </button>`).join("") : `<span class="cuddle-draft-empty">Tap hand cards in word order. QU supplies two letters.</span>`}
        </div>
        ${word.length === 5 && !validation.ok ? `<p class="cuddle-validation">${escapeHtml(validation.error)}</p>` : ""}
      </section>`;
  }

  function renderHand(state) {
    const draft = new Set(state.draft);
    const cards = state.hand.map(card => {
      const isDrafted = draft.has(card.id);
      const isSelected = selectedCards.has(card.id);
      const isGrey = game.cardIsKnownGrey(card);
      const disabled = state.status !== "playing"
        || (actionMode === "exchange" && (!isGrey || isDrafted))
        || (actionMode === "mulligan" && isDrafted);
      const classes = [
        "cuddle-card",
        card.glyph === "QU" ? "is-wide" : "",
        card.source === "bonus" ? "is-bonus" : "",
        isGrey ? "is-known-grey" : "",
        isDrafted ? "is-drafted" : "",
        isSelected ? "is-selected" : ""
      ].filter(Boolean).join(" ");
      return `
        <button class="${classes}" data-card-id="${escapeHtml(card.id)}" ${disabled ? "disabled" : ""}
          aria-pressed="${isDrafted || isSelected ? "true" : "false"}"
          title="${escapeHtml(card.glyph)}${card.source === "bonus" ? " · temporary bonus" : ""}${isGrey ? " · confirmed grey" : ""}">
          <span>${escapeHtml(card.glyph)}</span>
          ${card.source === "bonus" ? `<small>bonus</small>` : ""}
        </button>`;
    }).join("");
    return `
      <section class="cuddle-hand-panel">
        <div class="cuddle-section-heading">
          <div>
            <span class="cuddle-eyebrow">YOUR HAND</span>
            <h2>${state.hand.length} cards</h2>
          </div>
          <span>${state.hand.filter(card => card.source === "bonus").length} temporary</span>
        </div>
        <div class="cuddle-hand" aria-label="Letter card hand">${cards || `<p class="cuddle-draft-empty">No cards are currently available.</p>`}</div>
      </section>`;
  }

  function renderActions(state, rules) {
    if (state.status !== "playing") return "";
    if (actionMode === "mulligan") {
      const max = game.getMulliganLimit();
      const valid = selectedCards.size >= 1 && selectedCards.size <= max;
      return `
        <section class="cuddle-action-panel is-selecting">
          <div><strong>Select up to ${max} cards</strong><span>${selectedCards.size}/${max} selected · ${state.mulligansLeft} mulligan${state.mulligansLeft === 1 ? "" : "s"} left</span></div>
          <button class="cuddle-btn cuddle-btn-primary" data-action="confirm-mulligan" ${valid ? "" : "disabled"}>Replace selected</button>
          <button class="cuddle-btn cuddle-btn-ghost" data-action="cancel-mode">Cancel</button>
        </section>`;
    }
    if (actionMode === "exchange") {
      const cost = game.getGreyExchangeCost();
      const valid = selectedCards.size === cost;
      return `
        <section class="cuddle-action-panel is-selecting">
          <div><strong>Select exactly ${cost} grey card${cost === 1 ? "" : "s"}</strong><span>${selectedCards.size}/${cost} selected · draw one card</span></div>
          <button class="cuddle-btn cuddle-btn-primary" data-action="confirm-exchange" ${valid ? "" : "disabled"}>Recycle selected</button>
          <button class="cuddle-btn cuddle-btn-ghost" data-action="cancel-mode">Cancel</button>
        </section>`;
    }

    const submit = game.canSubmit();
    const greyCount = game.getGreyCards().length;
    return `
      <section class="cuddle-action-panel">
        <button class="cuddle-btn cuddle-btn-primary cuddle-submit" data-action="submit" ${submit.ok ? "" : "disabled"}>Submit word</button>
        <button class="cuddle-btn" data-action="mulligan-mode" ${state.mulligansLeft > 0 ? "" : "disabled"}>
          Mulligan <span>${state.mulligansLeft} left · up to ${rules.mulliganSize}</span>
        </button>
        <button class="cuddle-btn" data-action="exchange-mode" ${greyCount >= rules.greyExchange ? "" : "disabled"}>
          Recycle greys <span>${rules.greyExchange} → 1 · ${greyCount} available</span>
        </button>
      </section>`;
  }

  function renderStateOverlay(state) {
    if (state.status === "questReward") return renderQuestRewardOverlay(state);
    if (state.status === "upgrade") return renderUpgradeOverlay(state);
    if (state.status === "lost") return renderEndOverlay(state, false);
    if (state.status === "won") return renderEndOverlay(state, true);
    return "";
  }

  function renderQuestRewardOverlay(state) {
    return `
      <div class="cuddle-overlay" role="dialog" aria-modal="true" aria-labelledby="cuddleRewardTitle">
        <section class="cuddle-modal cuddle-modal-wide">
          <span class="cuddle-modal-kicker">QUEST COMPLETE</span>
          <h2 id="cuddleRewardTitle">Choose one reward</h2>
          <p>These are Cuddle adaptations of the existing guesser rewards. Freeze Secret is excluded, and the fixed secret never changes.</p>
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
    const summary = state.lastRoundSummary;
    return `
      <div class="cuddle-overlay" role="dialog" aria-modal="true" aria-labelledby="cuddleUpgradeTitle">
        <section class="cuddle-modal cuddle-modal-wide">
          <span class="cuddle-modal-kicker">${milestone ? `SCORE MILESTONE · ${state.upgradeMilestone}` : `ROUND ${summary?.round || state.round} CLEARED`}</span>
          <h2 id="cuddleUpgradeTitle">${milestone ? "Choose a bonus upgrade" : "Improve the run"}</h2>
          <p>${milestone
            ? `Your total score reached ${state.upgradeMilestone}. This choice is in addition to the round reward.`
            : `${escapeHtml(summary?.secret || state.secret)} solved in ${summary?.guesses || state.guessesUsed} guesses. Total score: ${state.score}.`}</p>
          <div class="cuddle-choice-grid">
            ${state.upgradeChoices.map(choice => `
              <button class="cuddle-choice" data-upgrade-key="${escapeHtml(choice.key)}">
                <span class="cuddle-choice-icon">${escapeHtml(choice.icon || "⬆️")}</span>
                <strong>${escapeHtml(choice.title)}</strong>
                <small>${escapeHtml(choice.description)}</small>
              </button>`).join("")}
          </div>
          <details class="cuddle-upgrade-details">
            <summary>Current run upgrades</summary>
            <ul>${game.getUpgradeSummary().map(line => `<li>${escapeHtml(line)}</li>`).join("")}</ul>
          </details>
        </section>
      </div>`;
  }

  function renderEndOverlay(state, won) {
    return `
      <div class="cuddle-overlay" role="dialog" aria-modal="true" aria-labelledby="cuddleEndTitle">
        <section class="cuddle-modal cuddle-end-modal">
          <span class="cuddle-modal-kicker">${won ? "TWELVE ROUNDS CLEARED" : "RUN ENDED"}</span>
          <div class="cuddle-end-icon" aria-hidden="true">${won ? "🏆" : "🌙"}</div>
          <h2 id="cuddleEndTitle">${won ? "Cuddle complete" : "The deck goes quiet"}</h2>
          <p>${won
            ? `You won the campaign with ${state.score} points.`
            : escapeHtml(state.failureReason || "The run could not continue.")}</p>
          <div class="cuddle-end-stats">
            <div><span>Score</span><strong>${state.score}</strong></div>
            <div><span>Rounds reached</span><strong>${state.round}/12</strong></div>
            <div><span>Removed letters</span><strong>${state.removedLetters.length ? escapeHtml(state.removedLetters.join(" ")) : "—"}</strong></div>
          </div>
          <details class="cuddle-upgrade-details">
            <summary>Final upgrades</summary>
            <ul>${game.getUpgradeSummary().map(line => `<li>${escapeHtml(line)}</li>`).join("")}</ul>
          </details>
          <div class="cuddle-modal-actions">
            <button class="cuddle-btn cuddle-btn-primary" data-action="new-run">Start another run</button>
            <button class="cuddle-btn" data-action="run-menu">Cuddle menu</button>
            <button class="cuddle-btn cuddle-btn-ghost" data-action="back">Main menu</button>
          </div>
        </section>
      </div>`;
  }

  function renderRulesOverlay() {
    const state = currentState();
    const rules = state ? game.getRulesSummary() : {
      handSize: 8,
      mulligans: 2,
      mulliganSize: 3,
      greyExchange: 3,
      yellowPoints: 2,
      earlyPoint: 5,
      questCadence: 3
    };
    return `
      <div class="cuddle-overlay cuddle-rules-overlay" role="dialog" aria-modal="true" aria-labelledby="cuddleRulesTitle">
        <section class="cuddle-modal cuddle-rules-modal">
          <button class="cuddle-modal-close" data-action="close-rules" aria-label="Close rules">×</button>
          <span class="cuddle-modal-kicker">HOW TO PLAY</span>
          <h2 id="cuddleRulesTitle">Cuddle rules</h2>
          <div class="cuddle-rules-grid">
            <article><strong>1 · Build, do not type</strong><p>Tap cards in order to make a five-letter word from the existing secret list. Q is printed as QU and supplies both letters.</p></article>
            <article><strong>2 · Read the feedback</strong><p>Each yellow adds one temporary copy of that letter; each green adds two. Temporary cards never enter the deck.</p></article>
            <article><strong>3 · Refill the hand</strong><p>Every submitted five-letter word draws five replacements. When the draw pile empties, the discard pile is shuffled back in.</p></article>
            <article><strong>4 · Fix bad hands</strong><p>You begin each round with ${rules.mulligans} mulligans of up to ${rules.mulliganSize} cards. Trade exactly ${rules.greyExchange} confirmed grey cards for one new draw.</p></article>
            <article><strong>5 · Score enough</strong><p>Yellow tiles score +${rules.yellowPoints}; grey tiles score −1. Solving early adds +${rules.earlyPoint} for every unused guess. You must also meet the cumulative round target.</p></article>
            <article><strong>6 · Grow the run</strong><p>Quests appear every ${rules.questCadence} turn${rules.questCadence === 1 ? "" : "s"}. Solve the word to choose an upgrade; every newly crossed 50-point milestone grants another.</p></article>
          </div>
          <p class="cuddle-rule-note"><strong>Campaign targets:</strong> ${window.CuddleEngine.THRESHOLDS.join(" · ")}. Clear round 12 at 300 points to win.</p>
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

  function chooseUtilityCard(cardId) {
    const state = currentState();
    const card = game.getHandCard(cardId);
    if (!card || state.draft.includes(cardId)) return;
    if (actionMode === "exchange" && !game.cardIsKnownGrey(card)) return;
    const limit = actionMode === "exchange" ? game.getGreyExchangeCost() : game.getMulliganLimit();
    if (selectedCards.has(cardId)) selectedCards.delete(cardId);
    else if (selectedCards.size < limit) selectedCards.add(cardId);
  }

  function startNewRun() {
    if (!words) return;
    if (game?.state && !["lost", "won"].includes(game.state.status)) {
      const okay = window.confirm("Start a new Cuddle run? The current saved run will be replaced.");
      if (!okay) return;
    }
    game = new window.CuddleEngine.CuddleGame(words);
    game.startNew();
    landing = false;
    rulesOpen = false;
    resetActionMode();
    setUiMessage("");
  }

  function handleAction(action) {
    switch (action) {
      case "back":
        rulesOpen = false;
        showScreen("startupScreen");
        return false;
      case "run-menu":
        landing = true;
        rulesOpen = false;
        resetActionMode();
        setUiMessage("");
        return true;
      case "continue":
        landing = false;
        rulesOpen = false;
        resetActionMode();
        return true;
      case "new-run":
        startNewRun();
        return true;
      case "rules":
        rulesOpen = true;
        return true;
      case "close-rules":
        rulesOpen = false;
        return true;
      case "submit": {
        const result = game.submitDraft();
        if (!result.ok) setUiMessage(result.error);
        else setUiMessage("");
        resetActionMode();
        return true;
      }
      case "mulligan-mode":
        game.clearDraft();
        actionMode = "mulligan";
        selectedCards = new Set();
        setUiMessage("Choose cards to replace, then confirm.");
        return true;
      case "exchange-mode":
        game.clearDraft();
        actionMode = "exchange";
        selectedCards = new Set();
        setUiMessage("Choose confirmed grey cards to recycle.");
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
      case "confirm-exchange": {
        const result = game.exchangeGreys([...selectedCards]);
        setUiMessage(result.ok ? "" : result.error);
        resetActionMode();
        return true;
      }
      case "refresh-rewards": {
        const result = game.refreshQuestRewards();
        setUiMessage(result.ok ? "" : result.error);
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

    const cardButton = event.target.closest("[data-card-id]");
    if (!cardButton || !game?.state || game.state.status !== "playing") return;
    const cardId = cardButton.dataset.cardId;
    if (actionMode === "play") {
      const result = game.toggleDraft(cardId);
      setUiMessage(result.ok ? "" : result.error);
    } else {
      chooseUtilityCard(cardId);
    }
    render();
  }

  document.addEventListener("DOMContentLoaded", () => {
    root = document.getElementById(ROOT_ID);
    document.getElementById("cuddleBtn")?.addEventListener("click", openCuddle);
    root?.addEventListener("click", handleClick);
  });

  window.CuddleMode = Object.freeze({ open: openCuddle });
}());
