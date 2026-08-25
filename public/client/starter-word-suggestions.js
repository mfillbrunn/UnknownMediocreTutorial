// /public/client/starter-word-suggestions.js
//
// Two random starting-word ideas for the Secretkeeper, shown only before
// the very first secret of the match is ever submitted -- meant as a
// lightweight nudge for players staring at a blank draft row, not a
// popup/modal. Tapping one fills the draft the same way a saved Notes
// word does (see client/notes.js's _fillDraft); the panel then disappears
// for good the instant that first secret goes in, since
// window.renderSetterStartSuggestions is only ever called with eligible
// state up to that point.

(() => {
  "use strict";

  // Cached per match (keyed by room) so the same two words stay put across
  // re-renders instead of reshuffling on every keystroke.
  let _words = null;
  let _forRoomId = null;

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

    // Only during the opening, simultaneous first-secret entry, for the
    // setter themself, and only for round 1 of the match -- every later
    // round re-enters "simultaneous" phase too (see
    // resetRoundState/nextRoundTransition), but by then matchRounds
    // already holds the finished round 1, which is what tells "beginning
    // of the game" apart from "beginning of a later round".
    const eligible =
      !!state &&
      !state.isTutorial &&
      window.myUserId?.() === state.setter &&
      state.phase === "simultaneous" &&
      !state.secret &&
      !state.simultaneousSecretSubmitted &&
      !(state.matchRounds && state.matchRounds.length > 0);

    if (!eligible) {
      container.classList.add("hidden");
      container.setAttribute("aria-hidden", "true");
      return;
    }

    if (_forRoomId !== window.roomId || !_words) {
      const pool = window.ALLOWED_SECRETS;
      if (!pool || pool.size < 2) {
        container.classList.add("hidden");
        return;
      }
      _words = pickTwoRandom(pool);
      _forRoomId = window.roomId;
      render(container, _words);
    }

    container.classList.remove("hidden");
    container.setAttribute("aria-hidden", "false");
  };
})();
