const engine = require("../powerEngineServer.js");
const fs = require("fs");
const path = require("path");

const ALLOWED_WORDS = new Set(
  fs.readFileSync(
    path.join(__dirname, "../../wordlists/allowed_guesses.txt"),
    "utf8"
  )
  .trim()
  .split(/\r?\n/)
  .map(w => w.toUpperCase())
);

engine.registerPower("assassinWord", {
  apply(state, action, roomId, io) {
    state.powers.assassinWordActive = true;
    if (!state.activePowers?.includes("assassinWord")) return;
    if (state.powers.assassinWordUsed && !state.powers.assassinWordActive) return;
    
    const w = action.word.toUpperCase();

    // --- Validation ---
    if (w.length !== 5) {
      io.to(action.playerId).emit("errorMessage", "5 letters!");
      state.powerUsedThisTurn = false; 
      return;
    }

    if (!/^[A-Z]{5}$/.test(w)) {
      io.to(action.playerId).emit(
        "errorMessage",
        "Assassin word must be exactly 5 letters."
      );
      state.powerUsedThisTurn = false; 
      return;
    }

    if (!ALLOWED_WORDS.has(w)) {
      io.to(action.playerId).emit(
        "errorMessage",
        "Assassin word must be a valid dictionary word."
      );
      state.powerUsedThisTurn = false; 
      return;
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
        state.powerUsedThisTurn = false;
        return;
      }
    }

    if (state.pendingGuess && w === state.pendingGuess.toUpperCase()) {
      io.to(action.playerId).emit(
        "errorMessage",
        "Assassin word cannot match current guess."
      );
      state.powerUsedThisTurn = false; 
      return;
    }

    // --- VALID → commit ---
    state.powers.assassinWordUsed = true;
    state.powers.assassinWord = w;
    state.powers.assassinPoints = Math.max(7-state.guessCount,1);
    state.powerUsedThisTurn = true;    

    // Setter-only confirmation
    io.to(action.playerId).emit("assassinSet", { word: w });

    // Room-level generic signal (NO WORD)
    io.to(roomId).emit("assassinUsed");
  }
});
