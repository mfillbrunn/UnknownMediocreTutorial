// /powers/powers/rowMasterServer.js
const engine = require("../powerEngineServer.js");

engine.registerPower("rowMaster", {
  apply(state) {
    state.powers.rowMasterActive = true;
  },

  postScore(state, entry) {
    if (!state.powers.rowMasterActive) return;

    const rows = [
      new Set("QWERTYUIOP".split("")),
      new Set("ASDFGHJKL".split("")),
      new Set("ZXCVBNM".split(""))
    ];

    const guess = state.pendingGuess.toUpperCase();
    let triggered = false;

    for (let r of rows) {
      let count = 0;
      for (let c of guess) if (r.has(c)) count++;
      if (count >= 6) {
        triggered = true;
        break;
      }
    }

    if (triggered) {
      const index = Math.floor(Math.random() * 5);
      entry.rowMasterApplied = index;

      entry.fbGuesser = entry.fbGuesser.slice();
      if (entry.fbGuesser[index] !== "🟩") {
        entry.fbGuesser[index] = "🟨";
      }
    }

    state.powers.rowMasterActive = false;
  }
});
