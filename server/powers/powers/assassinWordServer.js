const engine = require("../powerEngineServer.js");
const fs = require("fs");
const path = require("path");

const ALLOWED_WORDS = new Set(
  fs.readFileSync(
    path.join(__dirname, "../../wordlists/allowed_secrets.txt"),
    "utf8"
  )
  .trim()
  .split(/\r?\n/)
  .map(w => w.toUpperCase())
);

engine.registerPower("assassinWord", {
  apply(state, action, roomId, io) {
    if (!state.activePowers?.includes("assassinWord")) return false;
    if (state.powers.assassinWordUsed && !state.powers.assassinWordActive) return false;
    
    const w = action.word.toUpperCase();

    // --- Validation ---
    if (w.length !== 5) {
      io.to(action.playerId).emit("errorMessage", "5 letters!");
      return false;
    }

    if (!/^[A-Z]{5}$/.test(w)) {
      io.to(action.playerId).emit(
        "errorMessage",
        "Assassin word must be exactly 5 letters."
      );
      return false;
    }

    if (!ALLOWED_WORDS.has(w)) {
      io.to(action.playerId).emit(
        "errorMessage",
        "Assassin word must be a valid dictionary word."
      );
      return false;
    }
    
    if (state.secret) {
      const secret = state.secret.toUpperCase();
      let diffCount = 0;
    
      for (let i = 0; i < 5; i++) {
        if (w[i] !== secret[i]) diffCount++;
      }
    
      if (diffCount < 2) {
        io.to(action.playerId).emit(
          "errorMessage",
          "Assassin word must differ from the secret by at least two letters."
        );
        return false;
      }
    }

    if (state.pendingGuess && w === state.pendingGuess.toUpperCase()) {
      io.to(action.playerId).emit(
        "errorMessage",
        "Assassin word cannot match current guess."
      );
      return false;
    }

    // --- VALID → commit ---
    state.powers.assassinWordActive = true;
    state.powers.assassinWordUsed = true;
    state.powers.assassinWord = w;
    state.powers.assassinPoints = Math.max(7-state.guessCount,1);

    // Setter-only confirmation
    io.to(action.playerId).emit("assassinSet", { word: w });

    // Room-level generic signal (NO WORD)
    io.to(roomId).emit("assassinUsed");
    io.to(roomId).emit("powerUsed", { type: "assassinWord" });
  }
});
