/* Cuddle: the Co-pilot stage.
 *
 * A one-skull challenge stop (cuddle-quests.js CONSTRAINTS "copilot",
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
 *
 * Autopilot (a legendary badge) plays for you on every stage, Duels
 * included (there it takes your own turns, never the rival's):
 *   level 1  every 3rd guess, the best word your cards can make;
 *   level 2  every 3rd guess, the best word from any letters;
 *   level 3  every 2nd guess, from any letters.
 * It reads the rows you can see and what your hints say. If no word fits,
 * or the stage's rules turn it down, that guess is yours after all. Its
 * rows say "Auto"; a Co-pilot stage's or a rival's say "AI".
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

  // Autopilot: held, and a stage where the next guess is an ordinary one.
  var BADGE = "autopilot";
  function autopilotLevel(game) {
    var tree = window.CuddleSkillTree;
    var node = tree && tree.findNode(BADGE);
    try { return node ? Number(tree.level(game, node)) || 0 : 0; } catch (_error) { return 0; }
  }
  // Every how many of your guesses it plays, and whether from any letters.
  function autopilotEvery(game) {
    return autopilotLevel(game) >= 3 ? 2 : 3;
  }
  function anyLetters(game) {
    return autopilotLevel(game) >= 2;
  }
  function autopilotStage(game) {
    var state = game && game.state;
    if (!state || inDuel(state) || state.status !== "playing" || state.umtCoinOffer) return false;
    if (copilotStage(game) || autopilotLevel(game) <= 0) return false;
    // A Trial's pick is the player's own.
    if (typeof game.presetPick === "function" && game.presetPick()) return false;
    return true;
  }
  function turnKey(state) {
    return [state.runId || "", state.round || 0, state.secret || "", (state.history || []).length].join(":");
  }

  // The AI's turn: on a Co-pilot stage every 2nd guess; with Autopilot
  // every 3rd (every 2nd at level 3).
  function aiTurn(game) {
    var copilot = copilotStage(game);
    if (!copilot && !autopilotStage(game)) return false;
    var state = game.state;
    if (state.pendingRoundEnd) return false;
    var made = Array.isArray(state.history) ? state.history.length : 0;
    var every = copilot ? 2 : autopilotEvery(game);
    if ((made + 1) % every !== 0) return false;
    // A turn Autopilot couldn't play goes back to the player.
    return copilot || state.umtAutopilotSkip !== turnKey(state);
  }

  // While it's the AI's turn, the player's own submit waits.
  var baseSubmit = proto.submitDraft;
  proto.submitDraft = function submitDraftWithCopilot() {
    if (!this._copilotWord && !this._autopilotPlaying && aiTurn(this)) {
      return { ok: false, error: copilotStage(this) ? "Co-pilot's turn: the AI makes this guess." : "Autopilot's turn: it makes this guess." };
    }
    if (!this._autopilotPlaying && duelAutopilotDue(this)) {
      return { ok: false, error: "Autopilot's turn: it makes this guess." };
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
    if (!copilotStage(this)) return autopilotGuess(this);
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
    var result = playLooseWord(this, word, "copilot");
    if (!result || result.ok === false) return result || { ok: false, error: "The co-pilot's guess could not be played." };
    return result;
  };

  // Plays `word` from five one-turn cards (not the hand), past the hand and
  // the stage's word rules; `kind` marks the row ("copilot" or "auto").
  function playLooseWord(game, word, kind) {
    var state = game.state;
    var savedDraft = Array.isArray(state.draft) ? state.draft.slice() : [];
    var cards = word.split("").map(function make(letter) { return game._newCard(letter, "extra"); });
    var ids = cards.map(function id(card) { return card.id; });
    state.hand = state.hand.concat(cards);
    state.draft = ids.slice();
    var before = state.history.length;
    game._copilotWord = word;
    game._autopilotPlaying = kind === "auto";
    var result;
    try {
      result = game.submitDraft();
    } finally {
      game._copilotWord = null;
      game._autopilotPlaying = false;
    }
    if (!result || result.ok === false) {
      state.hand = state.hand.filter(function keep(card) { return ids.indexOf(card.id) === -1; });
      state.draft = savedDraft;
      return result;
    }
    markRow(state.history[before], kind);
    try { game.save(); } catch (_error) { /* next save */ }
    return result;
  }
  function markRow(entry, kind) {
    if (!entry) return;
    entry.umtCopilot = true;
    if (kind === "auto") entry.umtAutopilot = true;
  }

  // Autopilot's guess, built from the hand's own cards and submitted like
  // the player's would be (so the stage's rules still apply).
  function handCards(game) {
    return (game.state.hand || []).filter(function letter(card) {
      return card && /^[A-Z]$/.test(String(card.glyph || ""));
    });
  }
  function infinite(game, card) {
    return typeof game.isInfiniteCard === "function" && game.isInfiniteCard(card);
  }
  function canBuildWith(game) {
    var unlimited = {};
    var counts = {};
    handCards(game).forEach(function add(card) {
      if (infinite(game, card)) unlimited[card.glyph] = true;
      else counts[card.glyph] = (counts[card.glyph] || 0) + 1;
    });
    return function canBuild(word) {
      var need = {};
      for (var i = 0; i < word.length; i += 1) {
        var letter = word[i];
        if (unlimited[letter]) continue;
        need[letter] = (need[letter] || 0) + 1;
        if (need[letter] > (counts[letter] || 0)) return false;
      }
      return true;
    };
  }
  // What the hints already say about the answer.
  function fitsHints(state) {
    var absent = (state.knownAbsent || []).concat(state.removedLetters || []);
    var present = state.knownPresent || [];
    var placed = state.revealedPositions || [];
    return function fits(word) {
      for (var i = 0; i < absent.length; i += 1) if (word.indexOf(absent[i]) !== -1) return false;
      for (var j = 0; j < present.length; j += 1) if (word.indexOf(present[j]) === -1) return false;
      for (var k = 0; k < 5; k += 1) if (placed[k] && word[k] !== placed[k]) return false;
      return true;
    };
  }
  // Only rows whose every tile shows its real colour: the AI knows what
  // you know, nothing a masked or false tile hides.
  function visibleRows(state) {
    return (state.history || []).filter(function plain(entry) {
      var shown = entry && (Array.isArray(entry.shownFeedback) ? entry.shownFeedback : entry.feedback);
      return Array.isArray(shown) && shown.length === 5 && !(entry.maskedIndices || []).length
        && shown.every(function real(value) { return value === "green" || value === "yellow" || value === "grey"; });
    }).map(function row(entry) { return { word: entry.word, feedback: entry.shownFeedback || entry.feedback }; });
  }
  function skipTurn(game, why) {
    game.state.umtAutopilotSkip = turnKey(game.state);
    game.state.lastMessage = "Autopilot: " + why + " This guess is yours.";
    try { game.save(); } catch (_error) { /* next save */ }
    return { ok: false, error: game.state.lastMessage };
  }
  // Autopilot's word for the state in play: from the hand (level 1) or any
  // letters (level 2+), never one already played.
  function autopilotWord(game) {
    var stages = window.CuddleExpandedStages;
    var state = game.state;
    if (!stages || typeof stages.aiHandWord !== "function") return "";
    var played = (state.history || []).map(function word(entry) { return String(entry && entry.word || "").toUpperCase(); });
    var hints = fitsHints(state);
    var fits = function fits(word) { return played.indexOf(word) === -1 && hints(word); };
    var canBuild = anyLetters(game) ? function any() { return true; } : canBuildWith(game);
    try {
      return String(stages.aiHandWord(game, visibleRows(state), canBuild, fits) || "").toUpperCase();
    } catch (error) {
      console.warn("Cuddle autopilot: no word.", error);
      return "";
    }
  }

  function autopilotGuess(game) {
    var state = game.state;
    var word = autopilotWord(game);
    if (!/^[A-Z]{5}$/.test(word)) return skipTurn(game, anyLetters(game) ? "no word fits what you know." : "no word fits your cards.");
    if (anyLetters(game)) {
      var loose = playLooseWord(game, word, "auto");
      return loose && loose.ok !== false ? loose : skipTurn(game, "its word " + word + " isn't allowed here.");
    }
    var used = {};
    var ids = [];
    word.split("").forEach(function take(letter) {
      var card = handCards(game).find(function match(item) {
        return item.glyph === letter && (infinite(game, item) || !used[item.id]);
      });
      if (card) { used[card.id] = true; ids.push(card.id); }
    });
    if (ids.length !== 5) return skipTurn(game, "no word fits your cards.");
    var savedDraft = Array.isArray(state.draft) ? state.draft.slice() : [];
    var before = state.history.length;
    state.draft = ids;
    game._autopilotPlaying = true;
    var result;
    try {
      result = game.submitDraft();
    } finally {
      game._autopilotPlaying = false;
    }
    if (!result || result.ok === false) {
      state.draft = savedDraft;
      return skipTurn(game, "its word " + word + " isn't allowed here.");
    }
    markRow(state.history[before], "auto");
    try { game.save(); } catch (_error) { /* next save */ }
    return result;
  }

  // -- Autopilot in a Duel -------------------------------------------------------
  // It plays your own turns (every 3rd of yours, every 2nd at level 3),
  // through the Duel's Submit; the rival AI keeps its turns. `game.state`
  // is the Duel's own state while inside withDuel.
  function duelMine(state) {
    return (state.history || []).filter(function mine(entry) { return entry && entry.actor !== "ai"; }).length;
  }
  function duelAutopilotDue(game) {
    var state = game && game.state;
    if (!state || !inDuel(state) || state.status !== "playing" || autopilotLevel(game) <= 0) return false;
    var mine = duelMine(state);
    if ((mine + 1) % autopilotEvery(game) !== 0) return false;
    return state.umtAutopilotSkip !== mine;
  }
  function duelTurn(game) {
    var stages = window.CuddleExpandedStages;
    if (!stages || typeof stages.withDuel !== "function" || typeof stages.duelPlayerTurn !== "function") return false;
    if (stages.duelPlayerTurn(game) !== true) return false;
    return Boolean(stages.withDuel(game, function check(g) { return duelAutopilotDue(g); }));
  }
  // Autopilot's Duel word, its cards ready in the Duel hand (the draft is
  // left empty: duelTick types them in one by one), or null.
  function duelAutopilotPlan(game) {
    var stages = window.CuddleExpandedStages;
    if (!duelTurn(game) || typeof stages.submitDuel !== "function") return null;
    return stages.withDuel(game, function build(g) {
      var state = g.state;
      var word = autopilotWord(g);
      if (!/^[A-Z]{5}$/.test(word)) {
        state.umtAutopilotSkip = duelMine(state);
        state.lastMessage = "Autopilot: no word fits. This guess is yours.";
        return null;
      }
      var ids = [];
      if (anyLetters(g)) {
        var cards = word.split("").map(function make(letter) { return g._newCard(letter, "extra"); });
        state.hand = state.hand.concat(cards);
        ids = cards.map(function id(card) { return card.id; });
      } else {
        var used = {};
        word.split("").forEach(function take(letter) {
          var card = handCards(g).find(function match(item) { return item.glyph === letter && (infinite(g, item) || !used[item.id]); });
          if (card) { used[card.id] = true; ids.push(card.id); }
        });
        if (ids.length !== 5) { state.umtAutopilotSkip = duelMine(state); return null; }
      }
      state.draft = [];
      return { word: word, loose: anyLetters(g), ids: ids };
    }, true) || null;
  }

  function duelAutopilotSubmit(game, plan) {
    var stages = window.CuddleExpandedStages;
    if (!plan) return { ok: false };
    stages.withDuel(game, function fill(g) { g.state.draft = plan.ids.slice(); }, true);
    game._autopilotPlaying = true;
    game._copilotWord = plan.loose ? plan.word : null;
    var result;
    try {
      result = stages.submitDuel(game, true);
    } finally {
      game._autopilotPlaying = false;
      game._copilotWord = null;
    }
    if (!result || result.ok === false) {
      // Turned down: the cards go back, and this turn is the player's.
      stages.withDuel(game, function undo(g) {
        var state = g.state;
        if (plan.loose) state.hand = state.hand.filter(function keep(card) { return plan.ids.indexOf(card.id) === -1; });
        state.draft = [];
        state.umtAutopilotSkip = duelMine(state);
      }, true);
    }
    return result;
  }

  // -- the AI's turn on screen -------------------------------------------------
  var thinking = null;

  function stageKey(state) {
    return [state.runId || "", state.round || 0, state.secret || "", (state.history || []).length].join(":");
  }

  function markBoard(game) {
    var state = game && game.state;
    var board = document.querySelector("#cuddleScreen .cuddle-board");
    if (!board || !state || !Array.isArray(state.history)) return;
    if (board.classList.contains("umt-duel-board")) {
      board.querySelectorAll(".umt-copilot-badge").forEach(function stray(el) { if (!el.classList.contains("is-duel-auto")) el.remove(); });
      board.querySelectorAll(".is-copilot-row, .is-copilot-turn").forEach(function clear(row) { row.classList.remove("is-copilot-row", "is-copilot-turn"); });
      var mine = board.querySelector(".umt-duel-row.is-your-turn");
      var autoBadge = board.querySelector(".umt-copilot-badge.is-duel-auto");
      var autoTurn = Boolean(mine) && (duelAutopilotTyping() || duelTurn(game));
      if (autoTurn && !(mine && mine.contains(autoBadge))) {
        if (autoBadge) autoBadge.remove();
        autoBadge = document.createElement("span");
        autoBadge.className = "umt-copilot-badge is-duel-auto";
        autoBadge.setAttribute("aria-hidden", "true");
        autoBadge.textContent = "Autopilot…";
        mine.appendChild(autoBadge);
      } else if (!autoTurn && autoBadge) {
        autoBadge.remove();
      }
      return;
    }
    var rows = board.querySelectorAll(".cuddle-board-row");
    var turn = aiTurn(game);
    rows.forEach(function mark(row, index) {
      var entry = state.history[index];
      var ai = Boolean(entry && entry.umtCopilot);
      var auto = Boolean(entry && entry.umtAutopilot) || (!entry && !copilotStage(game));
      if (ai !== row.classList.contains("is-copilot-row")) row.classList.toggle("is-copilot-row", ai);
      var waiting = turn && index === state.history.length;
      if (waiting !== row.classList.contains("is-copilot-turn")) row.classList.toggle("is-copilot-turn", waiting);
      var badge = row.querySelector(":scope > .umt-copilot-badge");
      var label = ai ? (auto ? "Auto" : "AI") : waiting ? (auto ? "Autopilot…" : "AI thinking…") : "";
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

  // In a Duel, Autopilot types its word into your row a letter at a time
  // (as fast as the rival types), shows it a moment, then submits.
  var TYPE_STEP_MS = 170;
  var TYPED_HOLD_MS = 450;
  var duelThinking = false;
  function redraw() {
    try { window.dispatchEvent(new Event("cuddle:campaign-update")); } catch (_error) { /* next render */ }
  }
  function duelTick(game) {
    if (duelThinking || !duelTurn(game)) return;
    duelThinking = true;
    setTimeout(function start() {
      var live = activeGame();
      var plan = live ? duelAutopilotPlan(live) : null;
      if (!plan) {
        duelThinking = false;
        redraw();
        return;
      }
      var stages = window.CuddleExpandedStages;
      var typed = 0;
      (function typeNext() {
        var now = activeGame();
        if (!now || !duelTurn(now)) { duelThinking = false; return; }
        typed += 1;
        stages.withDuel(now, function show(g) { g.state.draft = plan.ids.slice(0, typed); }, true);
        redraw();
        if (typed < plan.ids.length) {
          setTimeout(typeNext, TYPE_STEP_MS);
          return;
        }
        setTimeout(function submit() {
          var last = activeGame();
          duelThinking = false;
          if (!last || !duelTurn(last)) return;
          duelAutopilotSubmit(last, plan);
          redraw();
        }, TYPED_HOLD_MS);
      }());
    }, THINK_MS);
  }

  function duelAutopilotTyping() {
    return duelThinking;
  }

  function tick() {
    var game = activeGame();
    if (!game || !game.state) return;
    duelTick(game);
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
    }, 5000);
  }
  attach();

  window.CuddleCopilot = Object.freeze({ isStage: copilotStage, aiTurn: aiTurn, autopilot: autopilotStage });
}());
