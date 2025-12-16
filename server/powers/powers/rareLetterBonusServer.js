const engine = require("../powerEngineServer.js");

engine.registerPower("rareLetterBonus", {
  apply(state, action, roomId, io) {
    if (!state.powers.rareLetterBonusReady) return;
    if (state.powers.rareLetterBonusUsed) return;
    state.powers.rareLetterBonusUsed = true;
    state.powerUsedThisTurn = true;
    state.powers.rareLetterBonusActive = true;
    state.powers.rareLetterBonusReady = false;
    io.to(roomId).emit("powerUsed", { type: "rareLetterBonus" });
  },

  postScore(state, entry) {
    if (!state.powers.rareLetterBonusActive) return;

    const guess = state.pendingGuess.toUpperCase();
    const fb = entry.fb;

    const pos = [];
    for (let i = 0; i < 5; i++) if (fb[i] === "🟩") pos.push(i);

    if (pos.length > 0) {
      const i = pos[Math.floor(Math.random() * pos.length)];
      entry.rareBonusApplied = i;

      entry.fbGuesser = entry.fbGuesser.slice();
      entry.fbGuesser[i] = "🟩";

      const L = state.secret[i].toUpperCase();
      state.powers.guesserLockedGreens = state.powers.guesserLockedGreens || [];
      if (!state.powers.guesserLockedGreens.includes(L)) {
        state.powers.guesserLockedGreens.push(L);
      }
    }

    state.powers.rareLetterBonusActive = false;
  },

  turnStart(state, role, roomId, io) {
  if (role !== state.guesser) return;

  // Already used or already unlocked → nothing to do
  if (state.powers.rareLetterBonusUsed || state.powers.rareLetterBonusReady) return;

  const rare = new Set(["Q","J","X","Z","W","K"]);
  let totalRare = 0;

  // Count ALL rare letters across ALL previous guesses
  for (const entry of state.history) {
    const guess = entry.guess.toUpperCase();
    for (const c of guess) {
      if (rare.has(c)) totalRare++;
    }
  }

  // Unlock if 4+ rare letters have been used cumulatively
  if (totalRare >= 4) {
    state.powers.rareLetterBonusReady = true;
    io.to(roomId).emit("toast", "Rare Letter Bonus unlocked!");
  }
}

});
