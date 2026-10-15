/* Cuddle: the Co-pilot stage.
 *
 * A two-skull challenge stop (cuddle-quests.js CONSTRAINTS "copilot",
 * placed by cuddle-rebalance-v5.js): every second guess -- the 2nd, 4th,
 * 6th... -- is played for you by the Duel's hard AI
 * (cuddle-expanded-stages.js aiWord). It isn't a race: the AI's guesses
 * are yours, they score and solve like any other, and it reads every row
 * on the board. You just don't get to choose them.
 *
 * On the AI's turn the hand waits: a submit is refused, the next row says
 * the co-pilot is thinking, and about a second later its word goes in.
 * Its rows wear a small robot badge. Loaded after every other layer so its
 * submit and canSubmit wrappers are the outermost ones.
 */
(function () {
  "use strict";

  var Engine = window.CuddleEngine;
  var Game = Engine && Engine.CuddleGame;
  if (!Game || Game.prototype.__cuddleCopilot) return;
  var proto = Game.prototype;
  proto.__cuddleCopilot = true;

  var ID = "copilot";
  var THINK_MS = 1200;

  function inDuel(state) {
    return String((state && state.runId) || "").indexOf(":duel:") !== -1;
  }

  function activeGame() {
    try {
      return window.CuddleBranchMap && typeof window.CuddleBranchMap.getActiveGame === "function"
        ? window.CuddleBranchMap.getActiveGame() : null;
    } catch (_error) {
      return null;
    }
  }

  // A Co-pilot stage being played.
  function copilotStage(game) {
    var state = game && game.state;
    if (!state || inDuel(state) || state.status !== "playing") return false;
    var v5 = window.CuddleRebalanceV5;
    var ids = v5 && typeof v5.liveChallengeIds === "function" ? v5.liveChallengeIds(game) || [] : [];
    return ids.indexOf(ID) !== -1;
  }

  // The AI's turn: the next guess is an even one (2nd, 4th, 6th...).
  function aiTurn(game) {
    if (!copilotStage(game)) return false;
    var state = game.state;
    if (state.pendingRoundEnd) return false;
    var made = Array.isArray(state.history) ? state.history.length : 0;
    return made % 2 === 1;
  }

  // While it's the AI's turn, the player's own submit waits.
  var baseSubmit = proto.submitDraft;
  proto.submitDraft = function submitDraftWithCopilot() {
    if (!this._copilotWord && aiTurn(this)) {
      return { ok: false, error: "Co-pilot's turn: the AI makes this guess." };
    }
    return baseSubmit.apply(this, arguments);
  };

  // The AI's word skips the hand and the stage's word rules: it was played
  // by the game, not built from your cards.
  var baseCanSubmit = proto.canSubmit;
  proto.canSubmit = function canSubmitWithCopilot() {
    if (this._copilotWord && typeof this.getDraftWord === "function"
        && String(this.getDraftWord()).toUpperCase() === this._copilotWord) {
      return { ok: true, word: this._copilotWord };
    }
    return baseCanSubmit.apply(this, arguments);
  };

  // Plays the AI's guess: five one-turn cards carry its word through the
  // ordinary submit (the way the Preset Trial's pick does), so scoring,
  // quests and the solve all work as usual.
  proto.copilotGuess = function copilotGuess() {
    if (!aiTurn(this)) return { ok: false, error: "It isn't the co-pilot's turn." };
    var stages = window.CuddleExpandedStages;
    var state = this.state;
    if (!stages || typeof stages.aiWord !== "function") return { ok: false, error: "The co-pilot isn't available." };
    var rows = (state.history || []).map(function row(entry) { return { word: entry.word, feedback: entry.feedback }; });
    var word = "";
    try {
      word = String(stages.aiWord(this, rows, "hard") || "").toUpperCase();
    } catch (error) {
      console.warn("Cuddle co-pilot: no word.", error);
    }
    if (!/^[A-Z]{5}$/.test(word)) return { ok: false, error: "The co-pilot couldn't find a word." };
    var game = this;
    var savedDraft = Array.isArray(state.draft) ? state.draft.slice() : [];
    var cards = word.split("").map(function make(letter) { return game._newCard(letter, "extra"); });
    var ids = cards.map(function id(card) { return card.id; });
    state.hand = state.hand.concat(cards);
    state.draft = ids.slice();
    var before = state.history.length;
    this._copilotWord = word;
    var result;
    try {
      result = this.submitDraft();
    } finally {
      this._copilotWord = null;
    }
    if (!result || result.ok === false) {
      state.hand = state.hand.filter(function keep(card) { return ids.indexOf(card.id) === -1; });
      state.draft = savedDraft;
      return result || { ok: false, error: "The co-pilot's guess could not be played." };
    }
    var entry = state.history[before];
    if (entry) entry.umtCopilot = true;
    try { this.save(); } catch (_error) { /* next save */ }
    return result;
  };

  // -- the AI's turn on screen -------------------------------------------------
  var thinking = null;

  function stageKey(state) {
    return [state.runId || "", state.round || 0, state.secret || "", (state.history || []).length].join(":");
  }

  function markBoard(game) {
    var state = game && game.state;
    var board = document.querySelector("#cuddleScreen .cuddle-board");
    if (!board || !state || !Array.isArray(state.history)) return;
    var rows = board.querySelectorAll(".cuddle-board-row");
    var turn = aiTurn(game);
    rows.forEach(function mark(row, index) {
      var entry = state.history[index];
      var ai = Boolean(entry && entry.umtCopilot);
      if (ai !== row.classList.contains("is-copilot-row")) row.classList.toggle("is-copilot-row", ai);
      var waiting = turn && index === state.history.length;
      if (waiting !== row.classList.contains("is-copilot-turn")) row.classList.toggle("is-copilot-turn", waiting);
      var badge = row.querySelector(":scope > .umt-copilot-badge");
      var label = ai ? "AI" : waiting ? "AI thinking…" : "";
      if (label && (!badge || badge.textContent !== label)) {
        if (!badge) {
          badge = document.createElement("span");
          badge.className = "umt-copilot-badge";
          badge.setAttribute("aria-hidden", "true");
          row.appendChild(badge);
        }
        badge.textContent = label;
      } else if (!label && badge) {
        badge.remove();
      }
    });
  }

  function tick() {
    var game = activeGame();
    if (!game || !game.state) return;
    markBoard(game);
    if (!aiTurn(game)) {
      thinking = null;
      return;
    }
    if (!document.querySelector("#cuddleScreen .cuddle-board")) return;
    var key = stageKey(game.state);
    if (thinking === key) return;
    thinking = key;
    setTimeout(function play() {
      var live = activeGame();
      if (!live || !live.state || stageKey(live.state) !== key || !aiTurn(live)) {
        thinking = null;
        return;
      }
      var result = live.copilotGuess();
      if (!result || result.ok === false) console.warn("Cuddle co-pilot:", result && result.error);
      thinking = null;
      try { window.dispatchEvent(new Event("cuddle:campaign-update")); } catch (_error) { /* next render */ }
    }, THINK_MS);
  }

  function attach() {
    var host = document.getElementById("cuddleScreen");
    if (!host) {
      document.addEventListener("DOMContentLoaded", attach, { once: true });
      return;
    }
    var pending = false;
    new MutationObserver(function schedule() {
      if (pending) return;
      pending = true;
      requestAnimationFrame(function run() {
        pending = false;
        try { tick(); } catch (error) { console.warn("Cuddle co-pilot:", error); }
      });
    }).observe(host, { childList: true, subtree: true });
    setInterval(function poll() {
      try { tick(); } catch (error) { console.warn("Cuddle co-pilot:", error); }
    }, 400);
  }
  attach();

  window.CuddleCopilot = Object.freeze({ isStage: copilotStage, aiTurn: aiTurn });
}());
