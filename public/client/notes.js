// client/notes.js — vanilla JS scratchpad / word-notes panel

(function () {
  let _entries  = [];   // [{ word: string }]
  let _draft    = "";
  let _active   = false;
  let _role     = null;
  let _lastRoom = null;

  function _resetIfRoomChanged() {
    const cur = window.roomId;
    if (cur !== _lastRoom) {
      _entries  = [];
      _draft    = "";
      _lastRoom = cur;
    }
  }

  function _viable(history, word) {
    if (!history?.length) return true;
    if (typeof window.isConsistentWithHistory === "function") {
      return window.isConsistentWithHistory(history, word, window.state);
    }
    return true;
  }

  function _guessedLetters(history) {
    const s = new Set();
    for (const h of (history || [])) {
      if (h?.guess) for (const l of h.guess.toUpperCase()) s.add(l);
    }
    return s;
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
      const viable = _entries.filter(e => _viable(history, e.word));
      const elim   = _entries.filter(e => !_viable(history, e.word));
      viable.forEach(e => {
        html += `<div class="notes-entry notes-viable" data-word="${e.word}">
          <span class="notes-word">${e.word}</span>
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
        if (_viable(history, e.word)) {
          cls = "notes-viable";
        } else {
          const allNew = e.word.split("").every(l => !guessed.has(l));
          cls = allNew ? "notes-clean" : "notes-elim";
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

    if (!isSetter) {
      list.querySelectorAll(".notes-fillable").forEach(span => {
        span.style.cursor = "pointer";
        span.addEventListener("click", () => {
          const w = span.dataset.fill;
          if (w?.length === 5) {
            window.localGuesserDraft = w;
            window.renderGuesserDraftOnly?.();
          }
        });
      });
    }
  }

  function _renderPanel(state) {
    if (!_role) return;
    const roleId = _role === "setter" ? "Setter" : "Guesser";
    const panel  = document.getElementById(`notesPanel${roleId}`);
    if (!panel) return;

    if (!_active) { panel.classList.add("hidden"); return; }
    panel.classList.remove("hidden");
    _renderDraft(roleId);
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
    const roleId = role === "setter" ? "Setter" : "Guesser";
    document.getElementById(`notesBtn${roleId}`)?.classList.toggle("active", _active);
    _renderPanel(window.state);
  };

  window.renderNotesPanel = function (state) {
    _renderPanel(state);
  };

  // Called from handleSetterInput / handleGuesserInput when notes is active.
  // Returns true to consume the event.
  window.notesInput = function (event) {
    if (!_active || !_role) return false;
    const roleId = _role === "setter" ? "Setter" : "Guesser";

    if (event.type === "BACKSPACE") {
      _draft = _draft.slice(0, -1);
      _renderDraft(roleId);
      return true;
    }
    if (event.type === "ENTER") {
      if (_draft.length === 5) {
        const w = _draft.toUpperCase();
        if (!_entries.find(e => e.word === w)) _entries.push({ word: w });
        _draft = "";
        _renderPanel(window.state);
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
})();
