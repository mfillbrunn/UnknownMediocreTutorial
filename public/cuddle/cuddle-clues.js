/* CUDDLE CLUES -- the Insight rewards (picked like any round reward; see
 * FUN_REWARDS in cuddle-rebalance-v5.js, which only tracks their levels).
 *
 *   Vowel Lamp       every stage: how many vowels the answer has
 *   Echo Finder      every stage: does the answer repeat a letter
 *   Pattern Lens     every stage: vowel/consonant pattern (C V C C V)
 *   Dead Letter      every stage opens with 1-3 absent letters crossed out
 *   Last Light       every stage opens with the last letter in place
 *   Treasure Hunter  about one stage in three is a treasure stage: +$25 per copy when
 *                    solved before guess 5 (world 1), 4 (world 2) or 3 (world 3)
 *   Mistake Shield   in a boss or strict stage, the first guess with no green
 *                    or yellow gives a guess back
 *
 * The clues show as a row of chips under the quest on the play screen.
 */
(function bootstrapCuddleClues() {
  "use strict";

  const Engine = window.CuddleEngine;
  const Game = Engine && Engine.CuddleGame;
  if (!Game) {
    console.error("Cuddle Clues: the Cuddle engine was not available.");
    return;
  }
  const proto = Game.prototype;

  const IDS = Object.freeze({
    vowelLamp: "umtVowelLamp",
    echoFinder: "umtEchoFinder",
    deadLetter: "umtDeadLetter",
    treasureHunter: "umtTreasureHunter",
    patternLens: "umtPatternLens",
    mistakeShield: "umtMistakeShield",
    lastLight: "umtLastLight"
  });
  const VOWELS = new Set(["A", "E", "I", "O", "U"]);
  const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  const TREASURE_PER_COPY = 25;
  // The treasure pays only for a quick solve: before guess 5 in world one,
  // 4 in world two, 3 in world three (by bosses cleared).
  const TREASURE_BEFORE = [5, 4, 3];
  function treasureDeadline(game) {
    const cleared = Array.isArray(game.state && game.state.bossGatesDone) ? game.state.bossGatesDone.length : 0;
    return TREASURE_BEFORE[Math.max(0, Math.min(2, cleared))];
  }
  function treasurePrize(game) {
    // $25, $50, then $100 at level 3.
    const tier = Math.max(0, Math.min(3, Math.floor(level(game, IDS.treasureHunter))));
    return [0, TREASURE_PER_COPY, TREASURE_PER_COPY * 2, TREASURE_PER_COPY * 4][tier] + graveRobberBonus(game);
  }

  function num(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function level(game, id) {
    try {
      return num(window.CuddleRebalanceV5?.upgradeLevel?.(game, id));
    } catch (_error) {
      return 0;
    }
  }

  function isBoss(game) {
    try { return Boolean(typeof game.isBossRound === "function" && game.isBossRound()); }
    catch (_error) { return false; }
  }

  function stageToken(state) {
    return `${state.runId || "run"}:${state.round}:${state.secret || ""}`;
  }

  function hashText(text) {
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  // This stage's clue record, started fresh whenever the answer changes.
  function clues(game) {
    const state = game.state;
    const token = stageToken(state);
    if (!state.umtClues || state.umtClues.token !== token) {
      state.umtClues = { token, dead: [], treasure: false, treasurePaid: false, shieldUsed: false, shieldBonus: 0 };
    }
    return state.umtClues;
  }

  function feedbackOf(secret, guess) {
    const result = Array(5).fill("grey");
    const left = {};
    for (let index = 0; index < 5; index += 1) {
      if (guess[index] === secret[index]) result[index] = "green";
      else left[secret[index]] = (left[secret[index]] || 0) + 1;
    }
    for (let index = 0; index < 5; index += 1) {
      if (result[index] !== "green" && left[guess[index]]) {
        result[index] = "yellow";
        left[guess[index]] -= 1;
      }
    }
    return result;
  }

  function addMessage(game, text) {
    if (!text) return;
    game.state.lastMessage = `${game.state.lastMessage || ""} ${text}`.trim();
  }

  // -- stage start ------------------------------------------------------------
  function deadLetters(game, count) {
    const state = game.state;
    const secret = String(state.secret || "").toUpperCase();
    const known = new Set([...(state.knownAbsent || []), ...(state.removedLetters || [])]);
    const inPlay = new Set([...(state.hand || []), ...(state.deck || [])].map(card => String(card && card.glyph || "")));
    const candidates = ALPHABET.filter(letter => !secret.includes(letter) && !known.has(letter));
    // Letters you could actually be holding are the useful ones to rule out.
    const preferred = candidates.filter(letter => inPlay.has(letter));
    const pool = (preferred.length >= count ? preferred : candidates).slice();
    const picked = [];
    while (picked.length < count && pool.length) {
      const index = Math.floor(game.random() * pool.length);
      picked.push(pool.splice(index, 1)[0]);
    }
    if (!picked.length) return [];
    state.knownAbsent = [...new Set([...(state.knownAbsent || []), ...picked])].sort();
    if (typeof game._syncInfiniteCards === "function") game._syncInfiniteCards();
    return picked;
  }

  function placeLastLetter(game) {
    const state = game.state;
    const secret = String(state.secret || "").toUpperCase();
    if (secret.length !== 5) return "";
    if (!Array.isArray(state.revealedPositions)) state.revealedPositions = Array(5).fill(null);
    if (state.revealedPositions[4]) return "";
    const letter = secret[4];
    state.revealedPositions[4] = letter;
    state.knownPresent = [...new Set([...(state.knownPresent || []), letter])].sort();
    if (typeof game._syncInfiniteCards === "function") game._syncInfiniteCards();
    if (typeof game.drawToHandLimit === "function") game.drawToHandLimit();
    return `Last Light: the answer ends in ${letter}.`;
  }

  const originalBeginRound = proto._beginRound;
  proto._beginRound = function beginRoundWithClues() {
    const result = originalBeginRound.apply(this, arguments);
    try {
      if (!this.state || !this.state.secret) return result;
      const record = clues(this);
      // Every stage, boss fights included.
      const dead = level(this, IDS.deadLetter);
      if (dead > 0 && !record.dead.length) {
        record.dead = deadLetters(this, Math.min(3, dead));
        if (record.dead.length) addMessage(this, `Dead Letter: ${record.dead.join(", ")} ${record.dead.length === 1 ? "is" : "are"} not in the answer.`);
      }
      if (level(this, IDS.lastLight) > 0) addMessage(this, placeLastLetter(this));
      if (level(this, IDS.treasureHunter) > 0) {
        // Its own hash, not the run's random stream, so taking Treasure
        // Hunter doesn't reshuffle what the rest of the run rolls.
        // One stage in three; every other stage at level 3.
        record.treasure = hashText(`${record.token}:treasure`) % (level(this, IDS.treasureHunter) >= 3 ? 2 : 3) === 0;
        if (record.treasure) addMessage(this, `Treasure word! Solve it before guess ${treasureDeadline(this)} for +$${treasurePrize(this)}.`);
      }
    } catch (error) {
      console.warn("Cuddle Clues: stage start failed.", error);
    }
    return result;
  };

  // -- Mistake Shield + treasure payout ---------------------------------------
  function shieldApplies(game) {
    return isBoss(game) || Boolean(game.state && game.state.strictGuessLimit);
  }

  const originalHardLimit = proto._hardGuessLimit;
  if (typeof originalHardLimit === "function") {
    proto._hardGuessLimit = function hardGuessLimitWithShield() {
      const base = originalHardLimit.apply(this, arguments);
      // A boss's limit is its row count, which the shield already raised;
      // a strict stage's limit is the world's window, raised here.
      if (!Number.isFinite(base) || isBoss(this) || !this.state || !this.state.umtClues) return base;
      const record = this.state.umtClues;
      return record.token === stageToken(this.state) ? base + num(record.shieldBonus) : base;
    };
  }

  const originalSubmit = proto.submitDraft;
  proto.submitDraft = function submitDraftWithClues() {
    const state = this.state;
    let shielded = false;
    let record = null;
    if (state && state.status === "playing" && state.secret) {
      record = clues(this);
      if (level(this, IDS.mistakeShield) > 0 && !record.shieldUsed && shieldApplies(this)) {
        const validation = typeof this.canSubmit === "function" ? this.canSubmit() : null;
        const word = validation && validation.ok ? String(validation.word || "").toUpperCase() : "";
        const secret = String(state.secret).toUpperCase();
        if (word.length === 5 && word !== secret && !feedbackOf(secret, word).some(value => value !== "grey")) {
          // Granted before the guess lands, so a dud on the last row is
          // caught before the engine calls the stage lost.
          record.shieldUsed = true;
          record.shieldBonus = 1;
          state.maxGuesses = Math.max(1, num(state.maxGuesses) || 6) + 1;
          shielded = true;
        }
      }
    }
    const before = state && Array.isArray(state.history) ? state.history.length : 0;
    const result = originalSubmit.apply(this, arguments);
    if (shielded && (!result || !result.ok)) {
      record.shieldUsed = false;
      record.shieldBonus = 0;
      state.maxGuesses = Math.max(1, num(state.maxGuesses) - 1);
      return result;
    }
    if (shielded) addMessage(this, "Mistake Shield: no greens or yellows, so you get that guess back.");
    try {
      const history = this.state && Array.isArray(this.state.history) ? this.state.history : [];
      const entry = history.length > before ? history[history.length - 1] : null;
      if (record && entry && record.treasure && !record.treasurePaid
          && String(entry.word || "").toUpperCase() === String(this.state.secret || "").toUpperCase()) {
        record.treasurePaid = true;
        // The guess that solved it: its own count (a Duel counts only the
        // player's rows, as guessesUsed does there).
        const guessNumber = num(this.state.guessesUsed) || history.length;
        const deadline = treasureDeadline(this);
        if (guessNumber < deadline) {
          const prize = treasurePrize(this);
          this.state.cuddleMoney = Math.max(0, num(this.state.cuddleMoney)) + prize;
          addMessage(this, `Treasure word solved on guess ${guessNumber}: +$${prize}.`);
        } else {
          record.treasureMissed = true;
          addMessage(this, `Treasure word solved on guess ${guessNumber}: too late for the treasure (before guess ${deadline}).`);
        }
      }
    } catch (error) {
      console.warn("Cuddle Clues: payout failed.", error);
    }
    return result;
  };

  // Grave Robber combo (Dead Letter + Treasure Hunter, cuddle-synergies.js).
  function graveRobberBonus(game) {
    const synergies = window.CuddleSynergies;
    try { return synergies && synergies.owns(game, "graveRobber") ? 5 : 0; }
    catch (_error) { return 0; }
  }

  // -- the clue chips -----------------------------------------------------------
  function icon(name) {
    return window.CuddleIcons ? `<span class="umt-ico">${window.CuddleIcons.svg(name)}</span>` : "";
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, character => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;"
    })[character]);
  }

  function clueChips(game) {
    const state = game.state;
    const secret = String(state.secret || "").toUpperCase();
    if (secret.length !== 5) return [];
    const record = clues(game);
    const chips = [];
    // Every clue works in every stage, boss fights included.
    if (level(game, IDS.vowelLamp) > 0) {
      const count = [...secret].filter(letter => VOWELS.has(letter)).length;
      chips.push({ icon: "lantern", label: "Vowel Lamp", text: `${count} vowel${count === 1 ? "" : "s"}` });
    }
    if (level(game, IDS.echoFinder) > 0) {
      const repeats = new Set(secret).size < 5;
      chips.push({ icon: "twoPeople", label: "Echo Finder", text: repeats ? "Repeats a letter" : "No repeated letters" });
    }
    if (level(game, IDS.patternLens) > 0) {
      chips.push({ icon: "puzzle", label: "Pattern Lens", text: [...secret].map(letter => (VOWELS.has(letter) ? "V" : "C")).join(" "), mono: true });
    }
    if (record.dead.length) chips.push({ icon: "gravestone", label: "Dead Letter", text: `Not ${record.dead.join(", ")}` });
    if (record.treasure) {
      chips.push({
        icon: "gem", label: "Treasure word", tone: "money",
        text: record.treasurePaid
          ? (record.treasureMissed ? "Treasure missed" : "Treasure claimed")
          : (num(state.guessesUsed) + 1 < treasureDeadline(game)
            ? `Solve before guess ${treasureDeadline(game)}: +$${treasurePrize(game)}`
            : "Treasure slipped away")
      });
    }
    // Process of Elimination (cuddle-rebalance-v5.js): every consonant it
    // has ruled out this stage, the newest one picked out.
    const sweep = state.cuddleRebalanceV5 && state.cuddleRebalanceV5.consonantSweep;
    if (sweep && sweep.secret === secret && Array.isArray(sweep.letters) && sweep.letters.length) {
      chips.push({ icon: "🔍", label: "Process of Elimination", text: "Not", letters: sweep.letters, tone: "sweep" });
    }
    // Preset Trial boss: the answer is one of these words.
    const preset = state.megaState && state.megaState.presetWords;
    if (state.boss && state.boss.id === "presetWordsTrial" && Array.isArray(preset) && preset.length) {
      chips.push({ icon: "scroll", label: "Preset Trial", text: "Answer is one of", words: preset, tone: "preset" });
    }
    if (level(game, IDS.mistakeShield) > 0 && shieldApplies(game)) {
      chips.push({ icon: "shield", label: "Mistake Shield", text: record.shieldUsed ? "Shield used" : "Shield ready", tone: record.shieldUsed ? "spent" : "" });
    }
    return chips;
  }

  // The clue strip is rebuilt on every render (each tile added or removed),
  // so the newest ruled-out letter's flip is played once per letter, not on
  // every redraw.
  let flippedSweepKey = "";

  function renderClues(root, game) {
    if (!root || !game || !game.state || game.state.status !== "playing") return;
    // World rules (Whispers, Watchtower...) stay off the play screen: the
    // world intro and the stage banner explain them.
    const chips = clueChips(game);
    // Letters excluded for the whole run (Cull One and friends) sit with
    // the clues instead of on a line of their own under the board.
    const removed = Array.isArray(game.state.removedLetters) ? game.state.removedLetters : [];
    if (removed.length) chips.push({ icon: "🚫", label: `Excluded this run: ${removed.join(", ")}`, text: "Out", letters: removed.slice(), tone: "excluded" });
    root.querySelectorAll(".umt-clues").forEach(element => element.remove());
    if (!chips.length) return;
    const markup = `<div class="umt-clues" aria-label="Clues">${chips.map(chip => (
      `<span class="umt-clue${chip.tone ? ` is-${chip.tone}` : ""}" title="${escapeHtml(chip.label)}">`
      + `${icon(chip.icon)}<span class="umt-clue-text${chip.mono ? " is-mono" : ""}">${escapeHtml(chip.text)}`
      + (chip.letters ? chip.letters.map((letter, i) => {
        if (chip.tone === "excluded") return `<b class="umt-clue-letter">${escapeHtml(letter)}</b>`;
        const latest = i === chip.letters.length - 1;
        const key = `${game.state.secret}:${chip.letters.join("")}`;
        const flip = latest && key !== flippedSweepKey;
        if (flip) flippedSweepKey = key;
        return `<b class="umt-clue-letter${latest ? " is-new" : ""}${flip ? " is-flipping" : ""}">${escapeHtml(letter)}</b>`;
      }).join("") : "")
      + (chip.words ? chip.words.map(word => `<b class="umt-clue-word">${escapeHtml(String(word).toUpperCase())}</b>`).join("") : "")
      + `</span></span>`
    )).join("")}</div>`;
    let strip = root.querySelector(".cuddle-play-strip");
    if (!strip) {
      const column = root.querySelector(".cuddle-left-column");
      if (!column) return;
      column.insertAdjacentHTML("afterbegin", '<div class="cuddle-play-strip"></div>');
      strip = column.querySelector(".cuddle-play-strip");
    }
    strip.insertAdjacentHTML("beforeend", markup);
  }

  function installRenderHook() {
    const campaign = window.CuddleCampaign;
    if (!campaign || campaign.__umtClues) return false;
    const previous = campaign.afterRender;
    window.CuddleCampaign = Object.freeze(Object.assign({}, campaign, {
      __umtClues: true,
      afterRender(root, game, landing) {
        if (typeof previous === "function") previous.call(this, root, game, landing);
        try {
          if (!landing) renderClues(root, game);
        } catch (error) {
          console.warn("Cuddle Clues: render failed.", error);
        }
      }
    }));
    return true;
  }

  // Other add-ons replace CuddleCampaign on their own timers; re-hook when
  // a newer one appears (the same approach as cuddle-progression.js).
  let attempts = 0;
  (function install() {
    attempts += 1;
    if (!window.CuddleCampaign) {
      if (attempts < 200) setTimeout(install, 50);
      return;
    }
    installRenderHook();
    setInterval(installRenderHook, 1000);
  }());

  window.CuddleClues = Object.freeze({ ids: IDS, clueChips });
}());
