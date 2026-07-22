const powerMetadata = require("../../powers/powerMetadata");

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

    // A deliberately-inconsistent secret the setter round asks the player
    // to try, indexed like the arrays above (only turn index 1 uses it) so
    // they see the real "not consistent with prior feedback" rejection
    // before entering the real LEMUR switch. Doesn't reproduce the
    // feedback SMALL already got against BLIMP, so it fails the
    // consistency check even though it's a valid dictionary word.
    state.tutorialWrongSecretExamples = [null, "MUSHY"];

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
    // Word sequencing (traced against the real win-condition timing --
    // a guess only wins once the SETTER's reaction to it is committed,
    // scored against whatever secret they end up choosing):
    //   - Round 1 (teaching): the human's own second action (their real
    //     use of the power, plus a scripted follow-up word) wins the
    //     round immediately -- there's no opposing reaction turn to leave
    //     room for, since the AI's blind opener already stood as its one
    //     move for that exchange.
    //   - Round 2 (receiving): the AI now holds the power and needs an
    //     actual turn to fire it on before the round can end, so the
    //     human's own second scripted word is a deliberate non-winner
    //     (SNORE / the AI's throwaway guess "BLIND") that just asks them
    //     to keep going normally -- the win comes on the THIRD action
    //     instead, once the AI's power-use turn has already happened.
    //     scriptedTurns is bumped to 3 to cover that extra round-2 turn.
    if (state.tutorialStage === "power" && state.tutorialPowerId) {
      const role = powerMetadata[state.tutorialPowerId]?.role === "setter" ? "setter" : "guesser";
      state.tutorialPowerGuesser = role === "guesser" ? state.tutorialPowerId : null;
      state.tutorialPowerSetter = role === "setter" ? state.tutorialPowerId : null;
      state.scriptedTurns = 3;

      if (role === "guesser") {
        state.tutorialGuesses = ["CHAMP", "CUMIN"];
        // SALAD (not BLIND) as the throwaway probe: it scores identically
        // against BLIMP and LEMUR, so keeping BLIMP in response to it
        // doesn't lock in a feedback pattern (e.g. BLIND's 3 greens on
        // B/L/I) that would make switching to LEMUR next turn invalid.
        state.tutorialGuessesAI = ["SMALL", "SALAD", "LEMUR"];
      } else {
        state.tutorialGuessesAI = ["SMALL", "LEMUR"];
        state.tutorialGuesses = ["CHAMP", "SNORE", "CUMIN"];
      }
    }

    state.timeControl.enabled = false;
    // No randomness
    state.shuffle = false;
    state.ranked = false;
  }
  onLobbyReady(state, setterPowers, guesserPowers) {
    if (state.tutorialStage === 2 || state.tutorialStage === "advanced") {
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
      return;
    }

    // Stage 1: no powers — the first game teaches the base rules only.
    state.initialPowers = {
      setter: [],
      guesser: []
    };
    state.activePowers = [];
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
