// /powers/powers/rareLetterBonusServer.js
const engine = require("../powerEngineServer.js");

engine.registerPower("rareLetterBonus", {
  apply(state) {
    if (state.powers.rareLetterBonusUsed) return;
  state.powers.rareLetterBonusUsed = true;
  state.powerUsedThisTurn = true;
    state.powers.rareLetterBonusActive = true;
  },

  postScore(state, entry) {
    if (!state.powers.rareLetterBonusActive) return;

    const rare = new Set(["Q","J","X","Z","W","K"]);
    const guess = state.pendingGuess.toUpperCase();

    let count = 0;
    for (let c of guess) if (rare.has(c)) count++;

    if (count >= 4) {
      const fb = entry.fb;
      const pos = [];
      for (let i = 0; i < 5; i++) if (fb[i] === "🟩") pos.push(i);

      if (pos.length > 0) {
        const i = pos[Math.floor(Math.random() * pos.length)];
        entry.rareBonusApplied = i;

        entry.fbGuesser = entry.fbGuesser.slice();
        entry.fbGuesser[i] = "🟩";

        const L = guess[i];
        state.powers.guesserLockedGreens = state.powers.guesserLockedGreens || [];
        if (!state.powers.guesserLockedGreens.includes(L)) {
          state.powers.guesserLockedGreens.push(L);
        }
      }
    }

    state.powers.rareLetterBonusActive = false;
  }
});
