const powerMetadata = require("../../powers/powerMetadata");
const { scoreGuess } = require("../../game-engine/scoring");
const spyChargeServer = require("../../powers/powers/spyChargeServer");
const { pickRandomQuestType, ensureQuestConditions } = require("../../powers/powers/questServer");
const powerChoiceServer = require("../../power-choice/powerChoiceServer");

class TutorialMode {
  constructor() {
    this.type = "tutorial";
  }

  initMatch(state) {
    state.roundIndex = 0;
    state.roundsTotal = 2;
    state.matchOver = false;

    // Stage 1 (default): the base-rules tutorial, no powers. Stage 2: a
    // short follow-up teaching exactly one guesser power and one setter
    // power. Set by lobby.js's PLAYER_READY handler from action.mode
    // ("tutorial" vs "tutorial2") before initMatch runs.
    state.tutorialStage = state.tutorialStage || 1;

    // Tutorial metadata — two forced turns per round, then the AI falls
    // back to normal beginner-difficulty play (runAI.js gates its scripted
    // branch on history.length < scriptedTurns).
    state.scriptedTurns = 2;

    // Round 1: human is guesser, tutorial AI is setter and keeps the
    // secret "CUMIN" across both scripted turns. Round 2: human is setter
    // — reuses the pre-existing secret pair (BLIMP, then switching to
    // LEMUR) and the AI's pre-existing guesses as the guesser. Stage 2
    // reuses the exact same words — same underlying game, just with the
    // two powers now in play — so it reads as a direct continuation.
    state.tutorialSecrets = ["BLIMP", "LEMUR"];
    state.tutorialGuesses = ["CHAMP", "CAIRN"];
    state.tutorialSecretsAI = ["CUMIN", "CUMIN"];
    state.tutorialGuessesAI = ["SMALL", "BLIND"];

    // Stage 2 and stage "advanced" share the exact same scripted words and
    // power pair — stage "advanced" is the UI-features walkthrough (Notes,
    // Guide, Drag & Lock, Power UI) launched standalone from the "Advanced
    // Tutorial" menu button, reusing stage 2's already-verified word
    // sequence rather than inventing a new one; only the narration in
    // tutorial-ui.js differs. Round 1 (human as guesser) teaches
    // revealGreen; round 2 (human as setter, after the role swap) teaches
    // countOnly — see onLobbyReady/onNextRound below.
    if (state.tutorialStage === 2 || state.tutorialStage === "advanced") {
      state.tutorialPowerGuesser = "revealGreen";
      state.tutorialPowerSetter = "countOnly";

      // Second guess is the AI's actual secret (CUMIN, from
      // tutorialSecretsAI above) rather than stage 1's CAIRN, so entering
      // it right after the Leak Info reveal wins the round immediately
      // instead of trailing into unscripted free play.
      state.tutorialGuesses = ["CHAMP", "CUMIN"];
    }

    // Stage "advanced" only: unlike stage 2 (whose setter round trails into
    // unscripted free play after LEMUR), this standalone walkthrough scripts
    // the AI's second guess as LEMUR too -- the human's own second secret
    // submission (LEMUR, matching) wins the round immediately, the same way
    // the guesser round's CUMIN already does, keeping the whole thing fully
    // scripted end-to-end.
    if (state.tutorialStage === "advanced") {
      state.tutorialGuessesAI = ["SMALL", "LEMUR"];
    }

    // Base tutorial only: a couple more scripted AI guesses right after the
    // SMALL/BLIND scripted pair, before the AI goes fully organic in round
    // 2 (the setter round) -- deliberately unhelpful words (they don't
    // reuse any letter the earlier guesses already placed) so the human
    // sees a few more scored turns play out before free-form guessing
    // starts. See runAI.js's tutorialGuessesAIExtra handling.
    if (state.tutorialStage === 1) {
      state.tutorialGuessesAIExtra = ["BRIEF", "GHOST"];
    }

    // Stage "power": a single power (launched from a "Try it" button next
    // to that power in the Power Library, see lobby.js's PLAYER_READY
    // tutorialPower branch, which sets tutorialPowerId) taught in BOTH
    // directions across the same two rounds -- round 1 has the human use
    // it themselves in its native role; round 2 (after the normal role
    // swap below) has the AI use the SAME power against them instead of
    // building any new "peek at the other side" machinery. runAI.js's
    // maybeUsePower forces this the instant the AI's current role matches
    // the power's role, which only becomes true post-swap.
    //
    // Unlike the other stages, this one doesn't script a match from
    // scratch -- seedPowerTutorialRound (called from onLobbyReady below,
    // and again from onNextRound after the round-2 role swap) drops the
    // player straight into a mid-match scenario instead, so there are no
    // scripted opening words to sequence here. scriptedTurns = 0 means the
    // scripted-word gates in validation.js/client.js (which only apply
    // while history.length < scriptedTurns) never engage -- the seeded
    // history already starts past that threshold.
    if (state.tutorialStage === "power" && state.tutorialPowerId) {
      const role = powerMetadata[state.tutorialPowerId]?.role === "setter" ? "setter" : "guesser";
      state.tutorialPowerGuesser = role === "guesser" ? state.tutorialPowerId : null;
      state.tutorialPowerSetter = role === "setter" ? state.tutorialPowerId : null;
      state.scriptedTurns = 0;
    }
    // Stage "quest": a standalone, live walkthrough of Power Choice's real
    // Inspector quest system (see client/tutorial-quest.js and
    // onLobbyReady's quest branch below). Single round, no scripted
    // opening -- seedQuestTutorialRound drops the player straight into a
    // live decision with a forced example quest already active, the same
    // "seed a snapshot instead of scripting from scratch" approach the
    // Star Tutorial uses. Free typing throughout, same reasoning as
    // "star": a forced tutorialGuesses match would fight with wanting the
    // player to type their own quest-satisfying guess.
    if (state.tutorialStage === "quest") {
      state.roundsTotal = 1;
      state.scriptedTurns = 0;
    }

    // Stage "star": a standalone, entirely narrative deep dive on the
    // Spy's star/charge system (see client/tutorial-star.js). Single
    // round, no scripted opening -- seedStarTutorialRound (called from
    // onLobbyReady below) drops the player straight into a mid-decision
    // scenario for the board to look realistic while the narration plays,
    // the same "seed a snapshot instead of scripting from scratch"
    // approach seedPowerTutorialRound uses.
    if (state.tutorialStage === "star") {
      state.roundsTotal = 1;
      state.scriptedTurns = 0;
    }

    // Stage "modes": explains the power/quest draft and what carries over
    // at the round-2 swap (see client/tutorial-modes.js). Also entirely
    // narrative -- nothing here is about a specific live action, so it
    // doesn't matter which role the human starts as.
    if (state.tutorialStage === "modes") {
      state.roundsTotal = 1;
      state.scriptedTurns = 0;
    }

    state.timeControl.enabled = false;
    // No randomness
    state.shuffle = false;
    state.ranked = false;
  }
  onLobbyReady(
  state,
  setterPowers,
  guesserPowers,
  guesserQuest
) {
  if (state.tutorialStage === "quest") {
    // Real Power Choice this time, not the classic single-quest system --
    // see isPowerChoice() in powerChoiceServer.js, which special-cases
    // this stage (alongside "star") to actually run live. No fixed
    // loadout to seed, same reasoning as "star" below.
    state.initialPowers = {
      setter: [],
      guesser: []
    };

    state.activePowers = [];

    this.seedQuestPowerChoiceRound(state);

    powerChoiceServer.initializeRound(state);
    // Force the very first quest to one concrete, easy-to-explain example
    // (see client/tutorial-quest.js) instead of whatever makeQuest() would
    // have picked at random, and make it live for the player's very next
    // guess -- normally only every OTHER guess is live (see
    // evaluateInspectorGuess's questLive gate) -- so they can fulfill it
    // right away instead of needing a throwaway guess first.
    state.powerChoice.inspector.currentQuest = {
      id: "tutorial-quest-half-am",
      type: "HALF_AM",
      icon: "A–P",
      title: "First Half",
      description: "Use only letters A through P."
    };
    state.powerChoice.inspector.attempts = 1;
    return;
  }

  if (state.tutorialStage === "star") {
    // Real Power Choice this time, not the classic power draft -- see
    // isPowerChoice() in powerChoiceServer.js, which special-cases this
    // one stage to actually run live. No fixed setter loadout to seed
    // (initialPowers/activePowers below start empty, same as any normal
    // Power Choice match): initializeForRound's own patched branch (see
    // powerChoiceServer.js's spyChargeServer.initializeForRound override)
    // rebuilds state.activePowers from state.powers.powerChoicePersistentGrants
    // on every call regardless of what's passed in here, so seeding a
    // fixed two-power loadout would just get silently overwritten the
    // instant the round actually starts.
    state.initialPowers = {
      setter: [],
      guesser: []
    };

    state.activePowers = [];

    this.seedStarTutorialRound(state);

    spyChargeServer.initializeForRound(state, []);
    // Start the meter partway full (see tutorial-star.js) so the player
    // reaches the first Power Choice reward milestone (5 stars) with just
    // one real secret change instead of needing a long grind from zero.
    state.powers.spyCharge.total = 3;
    return;
  }

  if (state.tutorialStage === "modes") {
    // Unlike every other tutorial stage, this one goes through the REAL
    // draft screen for real (see lobby.js's draftEligible) -- setterPowers/
    // guesserPowers/guesserQuest here are the player's own actual picks
    // (plus whatever the AI auto-picked for itself), not a scripted
    // loadout. From here on this plays out exactly like a normal match;
    // draft.js's finalizeDraft (which called this) sets state.phase to
    // "simultaneous" right after, same as it does for every other match.
    state.initialPowers = {
      setter: setterPowers,
      guesser: guesserPowers
    };

    state.activePowers = [...setterPowers, ...guesserPowers];

    state.powers.quest.type = guesserQuest || pickRandomQuestType();
    ensureQuestConditions(state);
    return;
  }

  if (
    state.tutorialStage === 2 ||
    state.tutorialStage === "advanced"
  ) {
      const sP = [state.tutorialPowerSetter];
      const gP = [state.tutorialPowerGuesser];
      state.initialPowers = { setter: sP, guesser: gP };
      state.activePowers = [...sP, ...gP];
      return;
    }

    if (state.tutorialStage === "power") {
      const sP = state.tutorialPowerSetter ? [state.tutorialPowerSetter] : [];
      const gP = state.tutorialPowerGuesser ? [state.tutorialPowerGuesser] : [];
      state.initialPowers = { setter: sP, guesser: gP };
      state.activePowers = [...sP, ...gP];
      // Round 1 always has the human playing the power's own role (see
      // lobby.js's tutorialPower launch flow, which force-swaps them into
      // it before readying up) -- teaching: true.
      this.seedPowerTutorialRound(state, { teaching: true });
      return;
    }

    // Stage 1: no powers — the first game teaches the base rules only.
    state.initialPowers = {
      setter: [],
      guesser: []
    };
    state.activePowers = [];
  }
  // Drops the Quest Tutorial straight into a live decision -- one
  // already-scored guess sitting in state.history for the board to look
  // realistic, then the player's own next guess is what actually attempts
  // the forced example quest set up in onLobbyReady above. Same "seed a
  // snapshot instead of scripting from scratch" approach seedStarTutorialRound
  // uses.
  seedQuestPowerChoiceRound(state) {
    if (state.tutorialStage !== "quest") return;

    const secret = "BLIMP";
    state.secret = secret;
    state.history = ["CRANE"].map((guess, i) => {
      const fb = scoreGuess(secret, guess);
      return {
        guess,
        fb,
        fbGuesser: [...fb],
        extraInfo: null,
        finalSecret: secret,
        roundIndex: i,
        powerEvents: [],
        fakeFeedback: null
      };
    });

    state.phase = "normal";
    state.turn = state.guesser;
    state.pendingGuess = "";
    state.setterDraft = "";
  }

  // Superseded by seedQuestPowerChoiceRound above (kept, not deleted --
  // the Quest Tutorial now runs Power Choice's real multi-quest system
  // live instead of this scripted single RARE-quest walkthrough).
  seedQuestTutorialRound(state) {
  if (
    state.tutorialStage !== "quest"
  ) {
    return;
  }

  const secret = "BLIMP";

  state.secret = secret;

  // Seeded so exactly 4 of the RARE quest's 6 needed letters (V, X, Q, J)
  // are already in hand before the tutorial's own scripted WACKY guess --
  // W and K are deliberately left untouched here so both still read as
  // "needed" right up through the highlight-button demo step, and WACKY
  // (which contains both) is what completes the quest.
  state.history = [
    "VIXEN",
    "QUERY",
    "JUMPY"
  ].map((guess, index) => {
    const fb =
      scoreGuess(secret, guess);

    return {
      guess,
      fb,
      fbGuesser: [...fb],
      extraInfo: null,
      finalSecret: secret,
      roundIndex: index,
      powerEvents: [],
      fakeFeedback: null
    };
  });

  state.guessCount =
    state.history.length;

  state.phase = "normal";
  state.turn = state.guesser;

  state.pendingGuess = "";
  state.setterDraft = "";

  state.simultaneousGuessSubmitted =
    false;

  state.simultaneousSecretSubmitted =
    false;

  state.gameOver = false;
  state.canNextRound = false;

  state.powers.quest = {
    ...(state.powers.quest || {}),

    type: "RARE",
    ready: false,
    used: false,
    oneAway: true,
    claimedEarly: false,

    conditions: null,
    conditionsHistory: [],

    resultColor: null,
    resultLetter: null,
    resultIndex: null
  };

  state.powers.questActive = false;
}
  // Drops the Star Tutorial straight into a mid-decision scenario -- one
  // already-scored guess, one live guess sitting in front of the setter --
  // so the board looks like a real match. Unlike seedPowerTutorialRound
  // below, the star ratings here are REAL (spy-charge is specifically
  // enabled for this stage), which makes the seed's own constraints
  // matter in a way they don't elsewhere: ROUND shares zero letters with
  // BLIMP, so it only rules out R/O/U/N/D and pins nothing to an exact
  // position -- the feasible-secret pool stays wide open, and the player
  // can find a genuinely different, genuinely legal switch to submit.
  // (An earlier version reused seedPowerTutorialRound's CHAMP/CAIRN pair,
  // which pins 3 of the 5 letters exactly and left BLIMP as close to the
  // ONLY legal secret -- fine when nothing was actually being scored, but
  // it meant there was nothing left to switch to once scoring went live.)
  seedStarTutorialRound(state) {
    if (state.tutorialStage !== "star") return;

    const secret = "BLIMP";
    state.secret = secret;
    state.history = ["ROUND"].map((guess, i) => {
      const fb = scoreGuess(secret, guess);
      return {
        guess,
        fb,
        fbGuesser: [...fb],
        extraInfo: null,
        finalSecret: secret,
        roundIndex: i,
        powerEvents: [],
        fakeFeedback: null
      };
    });

    state.phase = "normal";
    state.turn = state.setter;
    state.pendingGuess = "CRANE";
    state.setterDraft = "";
  }
  // Drops the "Try it" power tutorial straight into a mid-match scenario
  // -- two already-scored rounds already sitting in state.history, one
  // live turn ready to go -- instead of scripting an entire match from
  // scratch just to reach the one moment this tutorial actually cares
  // about. Called for round 1 (teaching, from onLobbyReady above) and
  // again for round 2 (receiving, from nextRoundTransition.js's
  // afterRoundReset hook below, which runs AFTER resetRoundState --
  // calling this any earlier would just get wiped out by that reset).
  seedPowerTutorialRound(state, { teaching }) {
    if (state.tutorialStage !== "power" || !state.tutorialPowerId) return;

    const powerRole = powerMetadata[state.tutorialPowerId]?.role === "setter" ? "setter" : "guesser";

    // Both scored for real against the same secret, so they're
    // automatically self-consistent with each other and with whatever
    // gets submitted next -- no separate consistency bookkeeping needed.
    const secret = "BLIMP";
    state.secret = secret;
    state.history = ["CHAMP", "CAIRN"].map((guess, i) => {
      const fb = scoreGuess(secret, guess);
      return {
        guess,
        fb,
        fbGuesser: [...fb],
        extraInfo: null,
        finalSecret: secret,
        roundIndex: i,
        powerEvents: [],
        fakeFeedback: null
      };
    });
    state.phase = "normal";

    // Only one combination lets the "prior" guesser move be faked
    // outright: teaching a SETTER power, where the guess the human is
    // about to react to doesn't need to have genuinely invoked anything
    // -- it's just context for their own upcoming power use. Every other
    // combination needs a REAL guesser move next (human or AI) so that
    // whoever actually holds the power fires it for real and picks up its
    // real effects/flags (e.g. Break Cover's feasible-word list), instead
    // of the tutorial pretending that already happened.
    if (teaching && powerRole === "setter") {
      state.turn = state.setter;
      state.pendingGuess = "SMALL";
      // Pre-filled with the running secret so submitting it is one
      // keystroke (ENTER) -- resubmitting the same word as "new" is
      // functionally identical to keeping it, just via the visible,
      // discoverable draft row instead of the empty-draft "keep"
      // shortcut.
      state.setterDraft = secret;
    } else {
      state.turn = state.guesser;
      state.pendingGuess = "";
    }
  }

  // Called by nextRoundTransition.js right after it resets round-scoped
  // state for round 2 (which would otherwise wipe anything seeded here).
  afterRoundReset(state) {
    if (state.tutorialStage !== "power") return;
    this.seedPowerTutorialRound(state, { teaching: false });
  }

    onRoundEnd(state) {
    // Stage 2 (the "Tutorial: Powers" follow-up) and stage "power" (the
    // per-power "Try it" tutorial): the round-summary screen was already
    // taught in stage 1 -- showing it again between round 1 and round 2
    // here is pure duplication, so skip straight into round 2 instead of
    // pausing on it. gameOver.js's endGame() checks this flag and calls
    // nextRoundTransition.js's advanceToNextRound() directly.
    if (
      (state.tutorialStage === 2 || state.tutorialStage === "power" || state.tutorialStage === "advanced") &&
      state.roundIndex < state.roundsTotal - 1
    ) {
      return { skipSummary: true };
    }

    // More rounds to play → round summary
    if (state.roundIndex < state.roundsTotal - 1) {
      return {
        view: "round",
        canNextRound: true
      };
    }

    // Final round → match summary
    state.matchOver = true;
    return {
      view: "match",
      canNextRound: false
    };
  }

  /**
   * Called when NEXT_ROUND is clicked during gameOver (round view).
   * Performs role swap and prepares next round.
   */
  onNextRound(state) {
    state.roundIndex += 1;

    const oldSetter = state.setter;
    const oldGuesser = state.guesser;

    state.setter = oldGuesser;
    state.guesser = oldSetter;

    // syncTurnOwners reads player.role, so we must update it here
    if (state.players?.[state.setter]) {
      state.players[state.setter].role = "setter";
    }
    if (state.players?.[state.guesser]) {
      state.players[state.guesser].role = "guesser";
    }

    // swap powers (same powers, reversed roles)
    state.activePowers = [
      ...state.initialPowers.guesser,
      ...state.initialPowers.setter
    ];

    return {
      phase: "simultaneous",
      resetRound: true
    };
  }

  isMatchOver(state) {
    return state.matchOver;
  }
}

module.exports = TutorialMode;
