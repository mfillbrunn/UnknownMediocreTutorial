const engine = require("../powerEngineServer.js");

engine.registerPower("revealLetter", {
  apply(state, action, roomId, io) {
    const p = state.powers.revealLetter;
    if (!p.ready || p.used) return;

    p.used = true;
    p.ready = false;
    state.powerUsedThisTurn = true;

    // Step 1 — find all green positions from scoring history
    const greenPositions = new Set();
    for (const entry of state.history) {
      if (!entry || !entry.fbGuesser) continue;
      for (let i = 0; i < 5; i++) {
        if (entry.fbGuesser[i] === "🟩") greenPositions.add(i);
      }
    }

    // Step 2 — pick ONLY non-green positions
    let options = [0,1,2,3,4].filter(i => !greenPositions.has(i));
    if (options.length === 0) options = [0,1,2,3,4];

    const index = options[Math.floor(Math.random() * options.length)];
    const letter = state.secret[index].toUpperCase();

    // Step 3 — store forced green constraint permanently
    if (!state.powers.forcedGreens) state.powers.forcedGreens = {};
    state.powers.forcedGreens[index] = letter;

    // Step 4 — keyboard coloring support
    if (!state.powers.guesserLockedGreens) state.powers.guesserLockedGreens = [];
    if (!state.powers.guesserLockedGreens.includes(letter))
      state.powers.guesserLockedGreens.push(letter);

    // Step 5 — reveal info (client uses this for animation)
    p.pendingReveal = { index, letter };

    io.to(roomId).emit("rareLetterReveal", { index, letter });
    io.to(roomId).emit("toast", `Revealed letter ${letter} in position ${index+1}!`);
    p.pendingReveal = null;
  },

  // IMPORTANT: revealLetter MUST NOT change fb/fbGuesser
  postScore(state, entry, roomId, io) {
    const p = state.powers.revealLetter;
    if (!p.pendingReveal) return;

    // Only store metadata for UI
    const { index, letter } = p.pendingReveal;
    entry.revealPowerApplied = { index, letter };

    p.pendingReveal = null;
  },

  turnStart(state, role, roomId, io) {
    if (role !== state.guesser) return;
    const p = state.powers.revealLetter;
    if (p.used || p.ready) return;

    // Unlocking logic
if (p.mode === "RARE") {
  const rare = new Set("QJXZWKV");
  const seen = new Set();

  for (const h of state.history) {
    for (const c of h.guess.toUpperCase()) {
      if (rare.has(c)) {
        seen.add(c);
      }
    }
  }

  // e.g., require at least 2 or 3 unique rare letters
  if (seen.size >= 5) {   // adjust threshold as desired
    p.ready = true;
    io.to(roomId).emit("toast", "Rare Letter Reveal unlocked!");
  }
}


    if (p.mode === "ROW") {
      const rows = [
        new Set("QWERTYUIOP"), // 10 letters
        new Set("ASDFGHJKL"),  // 9 letters
        new Set("ZXCVBNM")     // 7 letters
      ];
    
      // Track which letters have been used per row
      const used = rows.map(() => new Set());
    
      for (const h of state.history) {
        for (const c of h.guess.toUpperCase()) {
          rows.forEach((row, i) => {
            if (row.has(c)) {
              used[i].add(c);
            }
          });
        }
      }
    
      // Unlock if any row is fully exhausted
      const exhausted = rows.some((row, i) => {
        return used[i].size === row.size;
      });
    
      if (exhausted) {
        p.ready = true;
        io.to(roomId).emit("toast", "Row Master unlocked!");
      }
    }
  }
});
