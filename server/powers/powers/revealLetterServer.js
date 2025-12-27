const engine = require("../powerEngineServer.js");

engine.registerPower("revealLetter", {
  apply(state, action, roomId, io) {
  const p = state.powers.revealLetter;
  if (!p.ready || p.used) return;

  if (!state.history.length) return;

  p.used = true;
  p.ready = false;
  state.powerUsedThisTurn = true;

  // Collect known green positions
  const greenPositions = new Set();
  for (const entry of state.history) {
    if (!entry?.fbGuesser) continue;
    for (let i = 0; i < 5; i++) {
      if (entry.fbGuesser[i] === "🟩") greenPositions.add(i);
    }
  }
  for (const c of state.extraConstraints) {
    if (c.type === "GREEN") {
      greenPositions.add(c.index);
    }
  }
    
  const options = [0,1,2,3,4].filter(i => !greenPositions.has(i));
  if (!options.length) return;

  const index = options[Math.floor(Math.random() * options.length)];
  const letter = state.secret[index].toUpperCase();

  // Ensure constraints container exists
  state.extraConstraints ??= [];

  // Prevent duplicate reveals
  if (!state.extraConstraints.some(c => c.type === "GREEN" && c.index === index)) {
    state.extraConstraints.push({
      type: "GREEN",
      index,
      letter
    });
  }

  io.to(roomId).emit("rareLetterReveal", { index, letter });
  io.to(roomId).emit("toast", `Revealed letter ${letter} in position ${index + 1}!`);
}
,
   
  postScore(state, entry, roomId, io) {
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
