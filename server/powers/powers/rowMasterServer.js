// /powers/powers/rowMasterServer.js
const engine = require("../powerEngineServer.js");

engine.registerPower("rowMaster", {
  apply(state, action, roomId, io) {
    // Power can only be used AFTER being unlocked
    if (!state.powers.rowMasterReady) return;

    // One-time use
    if (state.powers.rowMasterUsed) return;

    state.powers.rowMasterUsed = true;
    state.powerUsedThisTurn = true;
    state.powers.rowMasterActive = true;

    // After activation, disable further use
    state.powers.rowMasterReady = false;

    // Optional feedback to player
    io.to(roomId).emit("powerUsed", { type: "rowMaster" });
  },

  postScore(state, entry, roomId, io) {
    const guess = state.pendingGuess.toUpperCase();

    // Do NOT run unless power was actively used
    if (!state.powers.rowMasterActive) return;

    const rows = [
      new Set("QWERTYUIOP".split("")),
      new Set("ASDFGHJKL".split("")),
      new Set("ZXCVBNM".split(""))
    ];

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

    // Power effect ends after scoring
    state.powers.rowMasterActive = false;
  },

  // NEW: Unlock RowMaster after every guess if conditions are met
  turnStart(state, role, roomId, io) {
  if (role !== state.guesser) return;

  // Already used or already unlocked → stop
  if (state.powers.rowMasterUsed || state.powers.rowMasterReady) return;

  // No guesses yet → cannot unlock
  if (state.history.length === 0) return;

  const rows = [
    new Set("QWERTYUIOP".split("")),
    new Set("ASDFGHJKL".split("")),
    new Set("ZXCVBNM".split(""))
  ];

  // Cumulative row counters
  let rowTotals = [0, 0, 0];

  // Count ALL letters across ALL previous guesses
  for (const entry of state.history) {
    const guess = entry.guess.toUpperCase();
    for (const c of guess) {
      for (let r = 0; r < rows.length; r++) {
        if (rows[r].has(c)) {
          rowTotals[r]++;
        }
      }
    }
  }

  // Unlock if ANY row has 6 or more letters total
  const unlocked = rowTotals.some(total => total >= 6);

  if (unlocked) {
    state.powers.rowMasterReady = true;
    io.to(roomId).emit("toast", "Row Master unlocked!");
  }
}

});
