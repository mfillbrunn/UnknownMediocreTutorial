engine.registerPower("revealLetter", {
  apply(state, action, roomId, io) {
    const p = state.powers.revealLetter;

    if (!p.ready || p.used) return;

    p.used = true;
    state.powerUsedThisTurn = true;
    p.ready = false;

    // Pick reveal index
    const i = Math.floor(Math.random() * 5);
    const letter = state.secret[i].toUpperCase();

    // Store for injection
    p.pendingReveal = { index: i, letter, mode: p.mode };

    // Send client reveal animation
    io.to(roomId).emit("rareLetterReveal", {   // same event works
      index: i,
      letter
    });

    io.to(roomId).emit("toast", `${p.mode} letter revealed!`);
  },

  postScore(state, entry, roomId, io) {
    const p = state.powers.revealLetter;
    const pr = p.pendingReveal;
    if (!pr) return;

    const { index, letter, mode } = pr;

    entry.fbGuesser = entry.fbGuesser || Array(5).fill("⬛");
    entry.fbGuesser[index] = "🟩";   // unified green behavior

    entry.revealPowerApplied = { index, mode };

    // clear for next turn
    p.pendingReveal = null;
  },

  turnStart(state, role, roomId, io) {
    if (role !== state.guesser) return;

    const p = state.powers.revealLetter;

    if (p.used || p.ready) return;

    // UNLOCK CONDITIONS
    if (p.mode === "RARE") {
      const rare = new Set(["Q","J","X","Z","W","K"]);
      let totalRare = 0;
      for (const h of state.history) {
        for (const c of h.guess.toUpperCase()) {
          if (rare.has(c)) totalRare++;
        }
      }
      if (totalRare >= 4) {
        p.ready = true;
        io.to(roomId).emit("toast", "Rare Bonus unlocked!");
      }
    }

    if (p.mode === "ROW") {
      const rows = [
        new Set("QWERTYUIOP"),
        new Set("ASDFGHJKL"),
        new Set("ZXCVBNM")
      ];
      let totals = [0, 0, 0];
      for (const h of state.history) {
        for (const c of h.guess.toUpperCase()) {
          rows.forEach((r, idx) => {
            if (r.has(c)) totals[idx]++;
          });
        }
      }
      if (totals.some(x => x >= 6)) {
        p.ready = true;
        io.to(roomId).emit("toast", "Row Master unlocked!");
      }
    }
  }
});
