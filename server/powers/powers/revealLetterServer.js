const engine = require("../powerEngineServer.js");

engine.registerPower("revealLetter", {
  apply(state, action, roomId, io) {
    const p = state.powers.revealLetter;
    if (!p.ready || p.used) return;

    p.used = true;
    state.powerUsedThisTurn = true;
    p.ready = false;

    // 1. Choose index to reveal
    
    // Step 1: find non-green positions
    const greenPositions = new Set();
    
    for (const entry of state.history) {
      if (!entry || !entry.fbGuesser) continue;
      for (let i = 0; i < 5; i++) {
        if (entry.fbGuesser[i] === "🟩") {
          greenPositions.add(i);
        }
      }
    }
    
    // Step 2: choose from positions that are NOT already green
    let options = [0,1,2,3,4].filter(i => !greenPositions.has(i));
    
    // fallback if all 5 positions are green (rare but safe)
    if (options.length === 0) options = [0,1,2,3,4];
    
    const index = options[Math.floor(Math.random() * options.length)];
    const letter = state.secret[index].toUpperCase();

    // 2. Save PERMANENT enforced reveal
    if (!state.powers.forcedGreens) state.powers.forcedGreens = {};
    state.powers.forcedGreens[index] = letter;

    // 3. For keyboard effects
    if (!state.powers.guesserLockedGreens) state.powers.guesserLockedGreens = [];
    if (!state.powers.guesserLockedGreens.includes(letter))
      state.powers.guesserLockedGreens.push(letter);

    // 4. Save pending reveal for next scoring entry
    p.pendingReveal = { index, letter };

    // 5. Notify UI (both players receive the event; only guesser reacts)
    io.to(roomId).emit("rareLetterReveal", { 
      index,
      letter
    });

    io.to(roomId).emit("toast", `Revealed letter ${letter} at position ${index+1}!`);
  },

  postScore(state, entry, roomId, io) {
    const p = state.powers.revealLetter;
    const pr = p.pendingReveal;
    if (!pr) return;

    const { index, letter } = pr;

    // Ensure fbGuesser array exists
    entry.fbGuesser = entry.fbGuesser || Array(5).fill("⬛");

entry.revealPowerApplied = { index, letter };

    // Clear pending reveal
    p.pendingReveal = null;
  },

  turnStart(state, role, roomId, io) {
    if (role !== state.guesser) return;

    const p = state.powers.revealLetter;
    if (p.used || p.ready) return;

    // === UNLOCK CONDITIONS ===
    if (p.mode === "RARE") {
      const rare = new Set(["Q","J","X","Z","W","K"]);
      let total = 0;
      for (const h of state.history) {
        for (const c of h.guess.toUpperCase()) {
          if (rare.has(c)) total++;
        }
      }
      if (total >= 4) {
        p.ready = true;
        io.to(roomId).emit("toast", "Rare Letter Reveal unlocked!");
      }
    }

    if (p.mode === "ROW") {
      const rows = [
        new Set("QWERTYUIOP"),
        new Set("ASDFGHJKL"),
        new Set("ZXCVBNM")
      ];
      let totals = [0,0,0];
      for (const h of state.history) {
        for (const c of h.guess.toUpperCase()) {
          rows.forEach((r,i)=>{ if(r.has(c)) totals[i]++; });
        }
      }
      if (totals.some(x=>x>=6)) {
        p.ready = true;
        io.to(roomId).emit("toast", "Row Master unlocked!");
      }
    }
  }
});
