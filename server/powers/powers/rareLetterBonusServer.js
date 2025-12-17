const engine = require("../powerEngineServer.js");

engine.registerPower("rareLetterBonus", {
  apply(state, action, roomId, io) {
  if (!state.powers.rareLetterBonusReady) return;
  if (state.powers.rareLetterBonusUsed) return;

  // Mark as used
  state.powers.rareLetterBonusUsed = true;
  state.powerUsedThisTurn = true;
  state.powers.rareLetterBonusReady = false;

  // Pick a random position from true secret
  const positions = [0,1,2,3,4];
  const i = positions[Math.floor(Math.random() * 5)];
  const letter = state.secret[i].toUpperCase();

  // Store revealed info
  state.powers.guesserLockedGreens.push(letter);
  state.powers.rareLetterBonusGreenIndex = i;
// Flag that this power must modify the next feedback entry
state.powers.rareLetterBonusAppliedThisTurn = {
  index: i,
  letter: letter
};

  // Send reveal to guesser
  io.to(room[state.guesser]).emit("rareLetterReveal", {
    index: i,
    letter
  });
  
  // They get a toast too
  io.to(roomId).emit("toast", "A green letter has been revealed!");
},
postScore(state, entry, roomId, io) {
  const applied = state.powers.rareLetterBonusAppliedThisTurn;
  if (!applied) return;

  const { index, letter } = applied;

  // ensure fbGuesser exists
  if (!entry.fbGuesser) {
    entry.fbGuesser = Array(5).fill("⬛");
  }

  // Inject the green feedback
  entry.fbGuesser[index] = "🟩";
  entry.rareBonusApplied = index;

  // Clean flag so it doesn't affect next turn
  state.powers.rareLetterBonusAppliedThisTurn = null;
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
