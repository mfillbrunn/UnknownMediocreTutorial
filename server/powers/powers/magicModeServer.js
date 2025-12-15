// /powers/powers/magicModeServer.js
const engine = require("../powerEngineServer.js");

engine.registerPower("magicMode", {
  apply(state) {
    state.powers.magicModeActive = true;
    state.powers.magicModeJustUsed = true;     // used to block confuseColors next turn
  },

  postScore(state, entry) {
    if (!state.powers.magicModeActive) return;

    entry.magicModeApplied = true;
    entry.fbGuesser = entry.fbGuesser.slice();

    for (let i = 0; i < 5; i++) {
      if (entry.fbGuesser[i] === "🟨") entry.fbGuesser[i] = "🟩";
    }

    state.powers.magicModeActive = false;
  },

  turnStart(state, role) {
    if (role === state.setter) {
      state.powers.magicModeJustUsed = false;
    }
  }
});
