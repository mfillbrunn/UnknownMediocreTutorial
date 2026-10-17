/* Cuddle: what makes each world its own.
 *
 * Each world theme (cuddle-worlds.js THEMES -- three or four per world
 * slot, one drawn per run) has
 *   a look     its own palette, board, tile shape and lettering, and a
 *              moving backdrop (leaves, pollen, fireflies, crystal glints,
 *              snow, dust, embers, rain and lightning, sparks) --
 *              cuddle-world-identity.css, keyed on #cuddleRoot[data-umt-theme]
 *   a name     its stages have one (Glades in the Woods, Grottos in the
 *              Caverns, Halls in the Citadel...)
 *   a trait    one rule that holds in every stage there, boss fights
 *              included: world one's help a little, world two's trade one
 *              thing for another, world three's raise the stakes.
 *
 * The world chip on the play screen names the world and its trait; tap it
 * for the rule. The world intro popup and the stage banner say it too.
 */
(function () {
  "use strict";

  var Engine = window.CuddleEngine;
  var Game = Engine && Engine.CuddleGame;
  if (!Game || Game.prototype.__cuddleWorldIdentity) return;
  var proto = Game.prototype;
  proto.__cuddleWorldIdentity = true;

  var TRAITS = Object.freeze({
    woods: { icon: "🌬️", name: "Whispers", stage: "Glade",
      text: "After your first guess in each stage, the woods whisper one letter that isn't in the answer." },
    meadow: { icon: "🍀", name: "In Bloom", stage: "Field",
      text: "Two more special squares grow on the board in every stage." },
    marsh: { icon: "✨", name: "Fireflies", stage: "Pool",
      text: "Every stage opens with one vowel tested for free: you learn whether it's in the answer." },
    caverns: { icon: "👯", name: "Echoes", stage: "Grotto",
      text: "Every stage tells you whether the answer uses a letter twice." },
    frost: { icon: "❄️", name: "Brittle Ice", stage: "Ridge",
      text: "One fewer mulligan in every stage, but every solved stage pays +$8." },
    library: { icon: "📖", name: "Footnotes", stage: "Shelf",
      text: "Every stage opens with one of the answer's themes shown." },
    swamp: { icon: "💀", name: "Sinking Mud", stage: "Bog",
      text: "Three dead cards sink into your deck in every stage. Mulligan them away." },
    tides: { icon: "🌊", name: "Deep Water", stage: "Lagoon",
      text: "Every letter in your hand that's in the answer shows blue: you can't tell green from yellow there. The board still shows the colours." },
    citadel: { icon: "👁️", name: "Watchtower", stage: "Hall",
      text: "Guesses past the guess window cost 10 points more, but solving within it pays +15." },
    storm: { icon: "⚡", name: "Lightning", stage: "Ledge",
      text: "Your third guess in every stage pays double tile points." },
    forge: { icon: "🔥", name: "Forge Heat", stage: "Anvil",
      text: "Every green tile pays 2 more points, but every grey tile costs 1." },
    glacier: { icon: "🧊", name: "Frozen Hand", stage: "Crevasse",
      text: "One letter in your hand is frozen: it can't be mulliganed. A different one freezes after every guess." }
  });

  function num(value) {
    var parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function inDuel(state) {
    return String((state && state.runId) || "").indexOf(":duel:") !== -1;
  }

  function worldOf(game) {
    var worlds = window.CuddleWorlds;
    if (!worlds || !game || !game.state || !game.state.runId) return null;
    try {
      return worlds.currentWorld(game);
    } catch (_error) {
      return null;
    }
  }

  function describeTheme(world) {
    var theme = world.theme || world.id;
    var trait = TRAITS[theme] || null;
    return { theme: theme, index: world.index, name: world.name, tagline: world.tagline, accent: world.accent, trait: trait };
  }

  // The current world: its theme id, name, trait and stage name.
  // Easy (cuddle-easy-mode.js) keeps its one world plain: no world rule.
  function easyRun(game) {
    return Boolean(window.CuddleEasyMode && window.CuddleEasyMode.isEasy(game));
  }

  function describe(game) {
    if (easyRun(game)) return null;
    var world = worldOf(game);
    return world ? describeTheme(world) : null;
  }

  // World `index` (0-2) as this run's route themed it -- the world intro
  // announces the next world while the player still stands on the last
  // row of the one before.
  function describeWorld(game, index) {
    if (easyRun(game)) return null;
    var worlds = window.CuddleWorlds;
    var map = game && game.state && game.state.branchMap;
    if (!worlds || !map) return null;
    try {
      return describeTheme(worlds.themedWorld(map, index));
    } catch (_error) {
      return null;
    }
  }

  function traitOf(game) {
    var state = game && game.state;
    if (!state || inDuel(state)) return null;
    var info = describe(game);
    return info ? info.theme : null;
  }

  function stageKey(state) {
    return [state.runId || "", state.round || 0, state.secret || ""].join(":");
  }

  // This stage's trait record (what it whispered, which vowel it tested).
  function record(state) {
    var key = stageKey(state);
    if (!state.umtWorldTrait || state.umtWorldTrait.key !== key) state.umtWorldTrait = { key: key };
    return state.umtWorldTrait;
  }

  function note(game, text) {
    game.state.lastMessage = ((game.state.lastMessage || "") + " " + text).trim();
  }

  function stageBonus(game, amount, field, label) {
    var value = Math.round(num(amount));
    if (!value) return;
    var rebalance = window.CuddleRebalanceV5;
    if (rebalance && typeof rebalance.addStageBonus === "function") {
      rebalance.addStageBonus(game, value, field, label);
      return;
    }
    game.state.score = num(game.state.score) + value;
    game.state.roundScore = num(game.state.roundScore) + value;
  }

  function uniqueSorted(list) {
    return Array.from(new Set(list)).sort();
  }

  function testedLetters(state) {
    var tested = new Set();
    (state.history || []).forEach(function each(entry) {
      String(entry && entry.word || "").toUpperCase().split("").forEach(function add(letter) { tested.add(letter); });
    });
    return tested;
  }

  function pickOne(game, list) {
    if (!list.length) return null;
    var random = typeof game.random === "function" ? game.random : Math.random;
    return list[Math.floor(random() * list.length)];
  }

  // While a stop is entered, its stage is dealt and set up under its real
  // row's world (see currentWorld in cuddle-worlds.js).
  var baseEnter = proto.enterBranchNode;
  if (typeof baseEnter === "function") {
    proto.enterBranchNode = function enterBranchNodeInItsWorld(nodeId) {
      var row = Number(String(nodeId || "").split(":")[0]);
      this.__umtEnteringRow = Number.isFinite(row) ? row : undefined;
      try {
        return baseEnter.apply(this, arguments);
      } finally {
        this.__umtEnteringRow = undefined;
      }
    };
  }

  // -- stage start ------------------------------------------------------------
  var baseBegin = proto._beginRound;
  proto._beginRound = function beginRoundWithWorldTrait() {
    var result = baseBegin.apply(this, arguments);
    var state = this.state;
    var theme = traitOf(this);
    if (!state || !theme) return result;
    try {
      var trait = record(state);
      var secret = String(state.secret || "").toUpperCase();
      if (theme === "marsh" && !trait.firefly && secret.length === 5) {
        var known = new Set((state.knownPresent || []).concat(state.knownAbsent || []));
        var vowel = pickOne(this, "AEIOU".split("").filter(function free(letter) { return !known.has(letter); }));
        if (vowel) {
          var present = secret.indexOf(vowel) !== -1;
          if (present) state.knownPresent = uniqueSorted((state.knownPresent || []).concat([vowel]));
          else state.knownAbsent = uniqueSorted((state.knownAbsent || []).concat([vowel]));
          trait.firefly = { letter: vowel, present: present };
          note(this, "Fireflies: " + vowel + (present ? " is in the answer." : " isn't in the answer."));
        }
      } else if (theme === "frost" && !trait.iced) {
        trait.iced = true;
        state.mulligansLeft = Math.max(0, num(state.mulligansLeft) - 1);
      } else if (theme === "library" && !trait.footnote && typeof this._applyRewardEffect === "function") {
        trait.footnote = true;
        this._applyRewardEffect("revealCategory");
      }
    } catch (error) {
      console.warn("Cuddle worlds: a world trait failed at the stage start.", error);
    }
    return result;
  };

  // -- each guess ---------------------------------------------------------------
  function feedbackOf(entry) {
    var shown = entry && (Array.isArray(entry.shownFeedback) ? entry.shownFeedback : entry.feedback);
    return Array.isArray(shown) ? shown : [];
  }

  function count(feedback, colour) {
    return feedback.filter(function is(value) { return value === colour; }).length;
  }

  var baseSubmit = proto.submitDraft;
  proto.submitDraft = function submitDraftWithWorldTrait() {
    var before = this.state && Array.isArray(this.state.history) ? this.state.history.length : 0;
    var result = baseSubmit.apply(this, arguments);
    var state = this.state;
    var history = state && Array.isArray(state.history) ? state.history : [];
    var theme = traitOf(this);
    if (!result || !result.ok || !theme || history.length <= before) return result;
    try {
      var entry = history[history.length - 1];
      var late = num(entry && entry.latePenalty) > 0;
      var solved = Boolean(entry && state.secret && entry.word === state.secret);
      var feedback = feedbackOf(entry);
      var trait = record(state);

      if (theme === "woods" && history.length === 1 && !solved && !trait.whisper) {
        var secret = String(state.secret || "").toUpperCase();
        var ruledOut = new Set((state.knownAbsent || []).concat(state.removedLetters || []));
        var tested = testedLetters(state);
        var inHand = new Set((state.hand || []).map(function glyph(card) { return String(card && card.glyph || ""); }));
        var options = "BCDFGHJKLMNPQRSTVWXYZ".split("").filter(function ok(letter) {
          return secret.indexOf(letter) === -1 && !ruledOut.has(letter) && !tested.has(letter);
        });
        // A letter in the hand is the most useful one to hear about.
        var useful = options.filter(function held(letter) { return inHand.has(letter); });
        var letter = pickOne(this, useful.length ? useful : options);
        if (letter) {
          trait.whisper = letter;
          state.knownAbsent = uniqueSorted((state.knownAbsent || []).concat([letter]));
          note(this, "The woods whisper: " + letter + " isn't in the answer.");
        }
      }
      if (theme === "storm" && history.length === 3 && !late && num(entry.scoreDelta) > 0) {
        stageBonus(this, num(entry.scoreDelta), "umtWorldLightning", "Lightning");
      }
      if (theme === "forge" && !late) {
        var heat = count(feedback, "green") * 2 - count(feedback, "grey");
        if (heat) stageBonus(this, heat, "umtWorldForgeHeat", "Forge Heat");
      }
      if (solved && !late) {
        if (theme === "citadel" && typeof this._solveGuessThreshold === "function" && history.length <= this._solveGuessThreshold()) {
          stageBonus(this, 15, "umtWorldWatchtower", "Watchtower");
        }
        if (theme === "frost") {
          state.cuddleMoney = Math.max(0, num(state.cuddleMoney) + 8);
          note(this, "Brittle Ice: +$8.");
        }
      }
    } catch (error) {
      console.warn("Cuddle worlds: a world trait failed after a guess.", error);
    }
    return result;
  };

  // Watchtower: late guesses cost 10 more.
  var baseLate = proto._lateGuessPenalty;
  if (typeof baseLate === "function") {
    proto._lateGuessPenalty = function lateGuessPenaltyWithWatchtower() {
      var penalty = baseLate.apply(this, arguments);
      return penalty > 0 && traitOf(this) === "citadel" ? penalty + 10 : penalty;
    };
  }

  // -- Deep Water (tides) ------------------------------------------------------
  // Read by cuddle-ui.js (the hand's colours) and cuddle-hint-fx.js (a hint
  // landing on a card).
  function handIsBlue(game) {
    return traitOf(game) === "tides";
  }

  // -- Frozen Hand (glacier) ----------------------------------------------------
  // One letter of the hand is frozen for each guess: chosen from the cards
  // a mulligan could swap, and chosen again once a guess is made (or if the
  // frozen letter has left the hand).
  function swappable(game, card) {
    if (!card || !card.glyph) return false;
    if (typeof game.isInfiniteCard === "function" && game.isInfiniteCard(card)) return false;
    var burdens = window.CuddleBurdens;
    if (burdens && ((burdens.isDeadGlyph && burdens.isDeadGlyph(card.glyph))
      || (burdens.isIdeaGlyph && burdens.isIdeaGlyph(card.glyph))
      || (burdens.isLuckyGlyph && burdens.isLuckyGlyph(card.glyph)))) return false;
    return card.glyph !== (window.CuddleEngine && window.CuddleEngine.CUDDLE_JOKER_GLYPH);
  }

  function frozenGlyph(game) {
    var state = game && game.state;
    if (traitOf(game) !== "glacier" || !state || state.status !== "playing") return null;
    var hand = Array.isArray(state.hand) ? state.hand : [];
    var guess = num(state.guessesUsed);
    var trait = record(state);
    var held = function held(glyph) { return hand.some(function has(card) { return card && card.glyph === glyph; }); };
    if (trait.frozen && trait.frozen.guess === guess && held(trait.frozen.glyph)) return trait.frozen.glyph;
    var letters = Array.from(new Set(hand.filter(function ok(card) { return swappable(game, card); }).map(function glyph(card) { return card.glyph; })))
      .filter(function fresh(glyph) { return !trait.frozen || glyph !== trait.frozen.glyph; });
    if (!letters.length) return null;
    // The same letter on a reload: picked from the stage and the guess.
    var seed = 0;
    String(stageKey(state) + ":" + guess).split("").forEach(function mix(character) { seed = (seed * 31 + character.charCodeAt(0)) >>> 0; });
    letters.sort();
    trait.frozen = { guess: guess, glyph: letters[seed % letters.length] };
    return trait.frozen.glyph;
  }

  function isFrozenGlyph(game, glyph) {
    return Boolean(glyph) && frozenGlyph(game) === glyph;
  }

  var baseMulligan = proto.mulligan;
  if (typeof baseMulligan === "function") {
    proto.mulligan = function mulliganWithFrozenHand(cardIds) {
      var frozen = frozenGlyph(this);
      if (frozen && Array.isArray(cardIds)) {
        var game = this;
        var hit = cardIds.some(function isFrozen(id) {
          var card = typeof game.getHandCard === "function" ? game.getHandCard(id) : null;
          return card && card.glyph === frozen;
        });
        if (hit) return { ok: false, error: "Frozen Hand: " + frozen + " is frozen this guess and can't be mulliganed." };
      }
      return baseMulligan.apply(this, arguments);
    };
  }

  // In Bloom: read by cuddle-points-money.js when it lays out special squares.
  function extraSpecialTiles(game) {
    return traitOf(game) === "meadow" ? 2 : 0;
  }

  // -- the play screen ----------------------------------------------------------
  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function swap(character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[character];
    });
  }

  // The moving backdrop: the same particles on every redraw, each placed
  // where it would be by now, so a redraw never makes them jump.
  var PARTICLES = { woods: 14, meadow: 18, marsh: 12, caverns: 16, frost: 30, library: 16, swamp: 14, tides: 20, citadel: 18, storm: 34, forge: 22, glacier: 24 };

  function seeded(seed) {
    var x = seed * 9301 + 49297;
    return function next() {
      x = (x * 9301 + 49297) % 233280;
      return x / 233280;
    };
  }

  function ambienceHtml(theme) {
    var total = PARTICLES[theme] || 0;
    var rand = seeded(theme.length * 31 + theme.charCodeAt(0));
    var now = Date.now() / 1000;
    var html = "";
    for (var index = 0; index < total; index += 1) {
      var duration = 6 + rand() * 10;
      if (theme === "storm") duration = 0.7 + rand() * 0.6;
      if (theme === "forge") duration = 2.5 + rand() * 3;
      if (theme === "frost" || theme === "glacier") duration = 8 + rand() * 9;
      if (theme === "tides") duration = 7 + rand() * 7;
      var offset = rand() * duration;
      var delay = -((now + offset) % duration);
      var style = "--x:" + (rand() * 100).toFixed(1) + "%;--y:" + (rand() * 100).toFixed(1) + "%;--s:" + (0.6 + rand() * 0.9).toFixed(2)
        + ";--sway:" + ((rand() - 0.5) * 80).toFixed(0) + "px;--r:" + Math.round(rand() * 360) + "deg"
        + ";animation-duration:" + duration.toFixed(2) + "s;animation-delay:" + delay.toFixed(2) + "s";
      html += '<i class="umt-wa-p' + (index % 5 === 0 ? " is-alt" : "") + '" style="' + style + '"></i>';
    }
    var flashDelay = -((now) % 9);
    return '<div class="umt-wa" data-theme="' + theme + '" aria-hidden="true">'
      + '<span class="umt-wa-glow"></span>'
      + (theme === "marsh" || theme === "swamp" ? '<span class="umt-wa-fog" style="animation-delay:' + (-(now % 40)).toFixed(1) + 's"></span>' : "")
      + (theme === "storm" ? '<span class="umt-wa-flash" style="animation-delay:' + flashDelay.toFixed(2) + 's"></span>' : "")
      + html + '</div>';
  }

  function render(root, game, landing) {
    if (landing || !root || !game || !game.state) return;
    var info = describe(game);
    var shell = root.querySelector(":scope > .cuddle-shell:not(.cuddle-branch-shell):not(.cuddle-shop-shell)");
    if (!info || !shell || inDuel(game.state)) return;
    if (!shell.querySelector(":scope > .umt-wa")) shell.insertAdjacentHTML("afterbegin", ambienceHtml(info.theme));
    // The world's rule is told by the world intro and the stage banner; the
    // play screen keeps its space for the board (no chip in the strip).
  }

  // The same render hook cuddle-clues.js uses; other add-ons replace
  // CuddleCampaign on their own timers, so re-hook when a newer one appears.
  function installRenderHook() {
    var campaign = window.CuddleCampaign;
    if (!campaign || campaign.__umtWorldIdentity) return false;
    var previous = campaign.afterRender;
    window.CuddleCampaign = Object.freeze(Object.assign({}, campaign, {
      __umtWorldIdentity: true,
      afterRender: function afterRender(root, game, landing) {
        if (typeof previous === "function") previous.call(this, root, game, landing);
        try {
          render(root, game, landing);
        } catch (error) {
          console.warn("Cuddle worlds: render failed.", error);
        }
      }
    }));
    return true;
  }

  var attempts = 0;
  (function install() {
    attempts += 1;
    if (!window.CuddleCampaign) {
      if (attempts < 200) setTimeout(install, 50);
      return;
    }
    installRenderHook();
    setInterval(installRenderHook, 1000);
  }());

  window.CuddleWorldIdentity = Object.freeze({
    TRAITS: TRAITS,
    describe: describe,
    describeWorld: describeWorld,
    extraSpecialTiles: extraSpecialTiles,
    handIsBlue: handIsBlue,
    frozenGlyph: frozenGlyph,
    isFrozenGlyph: isFrozenGlyph
  });
}());
