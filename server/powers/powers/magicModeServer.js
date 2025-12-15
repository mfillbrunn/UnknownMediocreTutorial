const engine = require("../powerEngineServer.js");

engine.registerPower("magicMode", {
  apply(state) {
    if (state.powers.magicModeUsed) return;
    state.powers.magicModeUsed = true;
    state.powerUsedThisTurn = true;
    state.powers.magicModeActive = true;
    state.powers.magicModeJustUsed = true;
  },

  postScore(state, entry) {
    if (!state.powers.magicModeActive) return;

    entry.magicModeApplied = true;
    entry.fbGuesser = entry.fbGuesser.slice();
    entry.fb = entry.fb.slice();
    entry.guess = entry.guess.split("");

    for (let i = 0; i < 5; i++) {
      if (entry.fbGuesser[i] === "🟨") {
        entry.fbGuesser[i] = "🟩";
        entry.fb[i] = "🟩";
        entry.guess[i] = state.secret[i];
      }
    }

    entry.guess = entry.guess.join("");
    state.powers.magicModeActive = false;
  },

  turnStart(state, role) {
    if (role === state.setter) state.powers.magicModeJustUsed = false;
  }
});
