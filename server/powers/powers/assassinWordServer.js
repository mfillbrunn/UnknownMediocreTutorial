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

    // Do NOT block if the previous attempt was invalid
    // Only block if assassinWord was actually SET
    if (!state.activePowers?.includes("assassinWord")) return;
    if (state.powers.assassinWordUsed) return;
    if (!action.word) return;
    const w = action.word.toUpperCase();
       if (w.length !==5) {
            io.to(action.playerId).emit(
              "errorMessage",
              "5 letters!"
            );
            return; // DO NOT consume the power
          }
    
          if (!/^[A-Z]{5}$/.test(w)) {
        io.to(action.playerId).emit(
          "errorMessage",
          "Assassin word must be exactly 5 letters."
        );
        return;
      }
    
        if (!ALLOWED_WORDS.has(w)) {
      io.to(action.playerId).emit(
        "errorMessage",
        "Assassin word must be a valid dictionary word."
      );
      return; // DO NOT consume the power
    }
    // Reject: cannot equal current secret
    if (state.secret && w === state.secret.toUpperCase()) {
       state.powerUsedThisTurn = false;
      io.to(action.playerId).emit(
        "errorMessage",
        "Assassin word cannot match current secret."
      );
      return; // IMPORTANT: DO NOT mark power used
    }

    // Reject: cannot equal current guess
    if (state.pendingGuess && w === state.pendingGuess.toUpperCase()) {
       state.powerUsedThisTurn = false;
      io.to(action.playerId).emit(
        "errorMessage",
        "Assassin word cannot match current guess."
      );
      return; // IMPORTANT: DO NOT mark power used
    }

    // VALID → now lock it in
    state.powers.assassinWordUsed = true;
    state.powers.assassinWord = w;

    // Optional: confirm success
    io.to(action.playerId).emit("assassinSet", { word: w });
    io.to(roomId).emit("assassinUsed", {
  word: action.word.toUpperCase()
});

  }
});

