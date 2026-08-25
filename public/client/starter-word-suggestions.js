// /public/client/starter-word-suggestions.js
//
// Two random starting-word ideas for whoever is about to enter a secret,
// shown only before that round's secret is ever submitted -- meant as a
// lightweight nudge for players staring at a blank draft row, not a
// popup/modal. Tapping one fills the draft the same way a saved Notes
// word does (see client/notes.js's _fillDraft); the panel then disappears
// once that secret goes in, since window.renderSetterStartSuggestions is
// only ever called with eligible state up to that point -- and comes back
// with a fresh pair the next time a role swap hands the setter job to
// someone entering a secret for the first time this round.

(() => {
  "use strict";

  // Cached per round (keyed by room + round) so the same two words stay
  // put across re-renders within a round instead of reshuffling on every
  // keystroke, but get replaced with a new pair the next time round.
  let _words = null;
  let _forKey = null;

  function pickTwoRandom(pool) {
    const words = [...pool];
    const picked = [];
    while (words.length && picked.length < 2) {
      const i = Math.floor(Math.random() * words.length);
      picked.push(words.splice(i, 1)[0]);
    }
    return picked;
  }

  // Same fill mechanics as a saved Notes word (client/notes.js's
  // _fillDraft): write straight into state.setterDraft and let the next
  // render pick it up, after the same opening-miss-lock guard that blocks
  // any other hand-edit of the draft.
  function fillDraft(word) {
    const state = window.state;
    if (!state) return;

    if (window.isOpeningMissSecretLocked?.()) {
      window.shakeDraftRow?.("setter");
      return;
    }

    state.setterDraft = word;
    state.setterDraftTouched = true;
    window.emitSetterDraftPreview?.(word);
    window.updateUI?.();
  }

  function render(container, words) {
    container.innerHTML = "";

    const label = document.createElement("span");
    label.className = "setter-start-suggestions-label";
    label.textContent = "Need a starting word?";
    container.appendChild(label);

    const row = document.createElement("div");
    row.className = "setter-start-suggestions-words";
    words.forEach(word => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "setter-start-suggestion-word";
      btn.textContent = word;
      btn.addEventListener("click", () => fillDraft(word));
      row.appendChild(btn);
    });
    container.appendChild(row);
  }

  window.renderSetterStartSuggestions = function (state) {
    const container = document.getElementById("setterStartSuggestions");
    if (!container) return;

    // Every round -- not just round 1 -- re-enters this same simultaneous,
    // pre-secret window (see resetRoundState/nextRoundTransition), and
    // CompetitiveMode's onNextRound always swaps setter/guesser going
    // into it, so each round's setter is stepping into the role fresh.
    // Only gate on it actually being that opening window, for the setter
    // themself, with nothing typed or sent yet.
    const eligible =
      !!state &&
      !state.isTutorial &&
      window.myUserId?.() === state.setter &&
      state.phase === "simultaneous" &&
      !state.secret &&
      !state.simultaneousSecretSubmitted;

    if (!eligible) {
      container.classList.add("hidden");
      container.setAttribute("aria-hidden", "true");
      return;
    }

    // Keyed by round (falling back to the finished-round count if
    // roundIndex isn't present) so a new round's setter gets a newly
    // picked pair instead of round 1's leftover words.
    const roundKey = state.roundIndex ?? state.matchRounds?.length ?? 0;
    const key = `${window.roomId}:${roundKey}`;

    if (_forKey !== key || !_words) {
      const pool = window.ALLOWED_SECRETS;
      if (!pool || pool.size < 2) {
        container.classList.add("hidden");
        return;
      }
      _words = pickTwoRandom(pool);
      _forKey = key;
      render(container, _words);
    }

    container.classList.remove("hidden");
    container.setAttribute("aria-hidden", "false");
  };
})();
