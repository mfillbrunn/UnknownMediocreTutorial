// client/notes.js — vanilla JS scratchpad / word-notes panel

(function () {
  let _entries  = [];   // [{ word: string }]  — user-typed candidates
  let _draft    = "";
  let _active   = false;
  let _role     = null;
  let _lastRoom = null;
  let _wasMyTurn = false; // tracks the last _isMyTurnToType result, so
                          // _renderPanel can detect the false->true edge

  function _isBreak(state) {
    return state?.phase === "gameOver" && state?.gameOverView === "round";
  }

  // Notes reuse the on-screen keyboard, so they can only safely intercept
  // it when the player isn't using that same keyboard to type their real
  // guess/secret right now — i.e. anytime EXCEPT their own active turn
  // (this mirrors the exact turn-guard conditions in handleSetterInput /
  // handleGuesserInput in client.js).
  //
  // Deliberately does NOT special-case freeze/rouletteSecret the way
  // handleSetterInput's inner typing block does -- that block skips itself
  // during freeze/roulette but ENTER still falls through past it to submit
  // "keep same secret" (see client.js's comment there). An earlier version
  // of this function excluded freeze/roulette here too, which meant Notes
  // kept "active" turn-capture and swallowed that same ENTER keypress
  // before it ever reached the real handler -- the setter's turn genuinely
  // began (the UI already showed it), but the keyboard stayed stuck
  // feeding Notes and Enter-to-keep silently did nothing.
  function _isMyTurnToType(state) {
    if (!state || !_role) return false;

    if (_role === "setter") {
      const myId = window.myUserId?.();
      const isNormalSetterTurn =
        myId === state.setter &&
        state.phase === "normal" &&
        state.turn === state.setter &&
        !!state.pendingGuess;
      const isSimultaneousSecretEntry =
        state.phase === "simultaneous" &&
        !state.secret &&
        !state.simultaneousSecretSubmitted;
      return isNormalSetterTurn || isSimultaneousSecretEntry;
    }

    // guesser
    return state.phase !== "gameOver" && !state.pendingGuess;
  }

  function _resetIfRoomChanged() {
    const cur = window.roomId;
    if (cur !== _lastRoom) {
      _entries  = [];
      _draft    = "";
      _wasMyTurn = false;
      _lastRoom = cur;
    }
  }

  // A genuinely new match (NEW_MATCH) reuses the same room, so
  // _resetIfRoomChanged never fires for it -- state.matchStartedAt is set
  // fresh each time a match actually begins (lobby.js's PLAYER_READY
  // handler), unlike NEXT_ROUND, which only changes the round within the
  // same match. That's the right boundary to clear notes on: entries
  // should survive a round swap (see _pruneInfeasible for what actually
  // invalidates one), just not leak into a brand new match.
  let _lastMatchStart = null;
  function _resetIfNewMatch(state) {
    const cur = state?.matchStartedAt ?? null;
    if (cur != null && cur !== _lastMatchStart) {
      _entries = [];
      _draft = "";
      _wasMyTurn = false;
      _lastMatchStart = cur;
    }
  }

  // state defaults to window.state for call sites that don't have a
  // render-pass state handy (e.g. notesInput's ENTER handler, which runs
  // from a raw keyboard event, not a state broadcast) -- everywhere that
  // DOES have one in scope (_pruneInfeasible, _renderList) passes it
  // explicitly instead, so this always checks against the same state the
  // history array itself came from.
  function _viable(history, word, state = window.state) {
    if (!history?.length) return true;
    if (typeof window.isConsistentWithHistory === "function") {
      return window.isConsistentWithHistory(history, word, state);
    }
    return true;
  }

  // Drop entries that are no longer consistent with history, in real time,
  // rather than just greying them out. Re-checks every render (not just
  // when history.length grows) -- viability can also change from
  // state.extraConstraints picking up a new hard constraint (e.g. the
  // guesser's Reveal Letter power firing) without history itself growing,
  // and history-length-only invalidation missed that: an entry that just
  // became impossible stayed in _entries, unpruned, until the next real
  // guess happened to come in. _entries is always small (a handful of
  // candidate words), so re-filtering every render is cheap.
  function _pruneInfeasible(state) {
    const history = state?.history || [];
    if (!_entries.length) return;
    _entries = _entries.filter(e => _viable(history, e.word, state));
  }

  function _guessedLetters(history) {
    const s = new Set();
    for (const h of (history || [])) {
      if (h?.guess) for (const l of h.guess.toUpperCase()) s.add(l);
    }
    return s;
  }

  function _shakeNotesDraft(roleId) {
    const row = document.getElementById(`notesDraft${roleId}`);
    if (!row) return;
    row.classList.remove("draft-shake");
    void row.offsetWidth; // restart animation if already running
    row.classList.add("draft-shake");
  }

  function _renderDraft(roleId) {
    const row = document.getElementById(`notesDraft${roleId}`);
    if (!row) return;
    let html = "";
    for (let i = 0; i < 5; i++) {
      const letter = _draft[i] || "";
      const isCursor = i === _draft.length && _active;
      html += `<div class="notes-draft-cell${letter ? " filled" : ""}${isCursor ? " cursor" : ""}">${letter}</div>`;
    }
    row.innerHTML = html;
  }

  function _fillDraft(word) {
    if (!word || word.length !== 5) return;
    if (_role === "setter") {
      if (window.state) window.state.setterDraft = word;
      window.updateUI?.();
      window.emitSetterDraftPreview?.(word);
    } else {
      window.setGuesserDraft?.(word);
    }
  }

  // Reuses the same "remaining words" math as the setter's Keep/New box
  // (server/utils/remainingWords.js computeRemainingNew), run client-side
  // since only the client knows what candidate words are in notes.
  function _remainingCountFor(candidateWord, state) {
    const guess = state?.pendingGuess;
    if (!guess || guess.includes("?")) return null;
    if (typeof window.predictFeedback !== "function" || typeof window.isConsistentWithHistory !== "function") return null;
    if (!window.ALLOWED_SECRETS) return null;

    const fb = window.predictFeedback(candidateWord, guess);
    if (!fb) return null;
    const testHistory = [...(state.history || []), { guess, fb, ignoreConstraints: false }];

    let count = 0;
    for (const w of window.ALLOWED_SECRETS) {
      if (window.isConsistentWithHistory(testHistory, w, state)) count++;
    }
    return count;
  }

  function _renderList(roleId, state) {
    const list = document.getElementById(`notesList${roleId}`);
    if (!list) return;

    if (!_entries.length) {
      list.innerHTML = '<div class="notes-empty">No words yet — type above</div>';
      return;
    }

    const history  = state?.history || [];
    const isSetter = _role === "setter";
    let html = "";

    if (isSetter) {
      const viable = _entries.filter(e => _viable(history, e.word, state));
      const elim   = _entries.filter(e => !_viable(history, e.word, state));
      viable.forEach(e => {
        const count = _remainingCountFor(e.word, state);
        html += `<div class="notes-entry notes-viable" data-word="${e.word}">
          <span class="notes-word notes-fillable" data-fill="${e.word}">${e.word}</span>
          ${count != null ? `<span class="notes-remaining-count-inline">${count}</span>` : ""}
          <button class="notes-remove" data-word="${e.word}" title="Remove">✕</button>
        </div>`;
      });
      elim.forEach(e => {
        html += `<div class="notes-entry notes-elim" data-word="${e.word}">
          <span class="notes-word">${e.word}</span>
          <button class="notes-remove" data-word="${e.word}" title="Remove">✕</button>
        </div>`;
      });
    } else {
      const guessed = _guessedLetters(history);
      _entries.forEach(e => {
        let cls;
        if (_viable(history, e.word, state)) {
          cls = "notes-viable";
        } else {
          const allNew = e.word.split("").every(l => !guessed.has(l));
          cls = allNew ? "notes-clean" : "notes-grey";
        }
        html += `<div class="notes-entry ${cls}" data-word="${e.word}">
          <span class="notes-word notes-fillable" data-fill="${e.word}">${e.word}</span>
          <button class="notes-remove" data-word="${e.word}" title="Remove">✕</button>
        </div>`;
      });
    }

    list.innerHTML = html;

    list.querySelectorAll(".notes-remove").forEach(btn => {
      btn.addEventListener("click", ev => {
        ev.stopPropagation();
        _entries = _entries.filter(e => e.word !== btn.dataset.word);
        _renderList(roleId, window.state);
      });
    });

list.querySelectorAll(
  ".notes-fillable"
).forEach(span => {
  span.addEventListener(
    "click",
    () => {
      const word =
        span.dataset.fill;

      _fillDraft(word);

      window
        .notifyTutorialNoteSelected
        ?.(word);
    }
  );
});
  }

  function _renderPanel(state) {
    if (!_role) return;
    const roleId = _role === "setter" ? "Setter" : "Guesser";
    const panel  = document.getElementById(`notesPanel${roleId}`);
    if (!panel) return;

    _resetIfNewMatch(state);
    _pruneInfeasible(state);

    if (!_active) { panel.classList.add("hidden"); return; }

    // The setter always knows their own secret, so keep it in their notes
    // by default (added once it's set, re-added each round). Only the setter
    // — the guesser's state.secret is blanked server-side, and they must not
    // be handed the answer.
    if (_role === "setter") {
      const secret = (state?.secret || "").toUpperCase();
      if (secret.length === 5 && !_entries.some(e => e.word === secret)) {
        _entries.push({ word: secret });
      }
    }

    panel.classList.remove("hidden");

    // The draft row shares the real on-screen keyboard with actual
    // gameplay typing (see _isMyTurnToType) -- once it's genuinely the
    // player's turn, keystrokes fall through to the real guess/secret
    // draft instead (see notesInput below), so the notes draft tiles
    // have nothing live to show and just vanish rather than sit there
    // stale.
    const draftRow = document.getElementById(`notesDraft${roleId}`);
    const myTurn = !_isBreak(state) && _isMyTurnToType(state);
    // The instant the player's real turn starts, drop whatever unfinished
    // word they'd half-typed into Notes -- otherwise it just sits in
    // _draft hidden behind the real draft row and reappears stale (still
    // mid-word) the next time they're idle again.
    if (myTurn && !_wasMyTurn) _draft = "";
    _wasMyTurn = myTurn;
    if (draftRow) draftRow.classList.toggle("hidden", myTurn);
    if (!myTurn) _renderDraft(roleId);

    _renderList(roleId, state);
  }

  // ── Public API ──────────────────────────────────────────────────────

  window.toggleNotes = function (role) {
    _resetIfRoomChanged();
    if (_active && _role !== role) {
      // switching roles — just swap
    } else {
      _active = !_active;
    }
    _role = role;
    _renderPanel(window.state);
    if (_active) window.notifyTutorialNotesOpened?.();
  };

  window.renderNotesPanel = function (state) {
    _renderPanel(state);
  };

  // Called from handleSetterInput / handleGuesserInput when notes is active.
  // Returns true to consume the event.
  window.notesInput = function (event) {
    if (!_active || !_role) return false;
    const roleId = _role === "setter" ? "Setter" : "Guesser";

    const isEdit = event.type === "BACKSPACE" || event.type === "ENTER" || event.type === "LETTER";
    if (isEdit && !_isBreak(window.state) && _isMyTurnToType(window.state)) {
      // It's the player's real turn -- let the keystroke fall through to
      // the actual gameplay handler (handleSetterInput/handleGuesserInput)
      // instead of the notes scratchpad. The notes draft row is hidden
      // for the same reason (see _renderPanel), so there's nothing here
      // to type into right now anyway.
      return false;
    }

    if (event.type === "BACKSPACE") {
      _draft = _draft.slice(0, -1);
      _renderDraft(roleId);
      return true;
    }
    if (event.type === "ENTER") {
      if (_draft.length === 5) {
        const w = _draft.toUpperCase();
        const dict = _role === "setter" ? window.ALLOWED_SECRETS : window.ALLOWED_GUESSES;
        // A setter's note is a candidate SECRET -- if it's already
        // inconsistent with the feedback given so far, reject it outright
        // (same shake as an invalid dictionary word) instead of adding a
        // doomed entry the setter would just have to delete themselves.
        const infeasible =
          _role === "setter" && !_viable(window.state?.history, w);
        if ((dict && !dict.has(w)) || infeasible) {
          _shakeNotesDraft(roleId);
} else {
  if (
    !_entries.find(
      entry => entry.word === w
    )
  ) {
    _entries.push({
      word: w
    });
  }

  _draft = "";
  _renderPanel(window.state);

  window
    .notifyTutorialNoteAdded
    ?.(w);
}
      }
      return true;
    }
    if (event.type === "LETTER" && _draft.length < 5) {
      _draft += event.value.toUpperCase();
      _renderDraft(roleId);
      return true;
    }
    return true; // consume all keys when panel is active
  };

  window.isNotesActive = function () { return _active; };

  // Called whenever the player's role stops being "setter" (round swap,
  // leaving the game, etc. -- see client.js's newMyRole handling). Notes
  // is only ever opened for the setter (ensureNotesOpen in
  // ui/setter-sidebar.js), and _active/_role otherwise just sit stale --
  // nothing used to close it on a role swap, so a guesser's very first
  // keystroke of the new round would still hit notesInput below. There,
  // _isMyTurnToType("setter") checks state.setter against a userId that's
  // no longer the setter, always comes back false, and the keystroke gets
  // silently swallowed as a "not my turn" notes entry instead of ever
  // reaching handleGuesserInput -- the guesser's keyboard looked
  // permanently dead until reload.
  window.closeNotes = function () {
    _active = false;
    _draft = "";
  };

  // Called when a secret submission gets rejected (bad word, inconsistent
  // with history, etc.) so the setter doesn't have to backspace through a
  // dead draft by hand -- clears the notes scratchpad's own in-progress
  // draft alongside the real one (see client.js's submitSetterNew).
  window.clearNotesDraft = function () {
    _draft = "";
    if (_role) _renderDraft(_role === "setter" ? "Setter" : "Guesser");
  };
})();
