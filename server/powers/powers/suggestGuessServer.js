// suggestGuess power (guesser)
const engine = require("../powerEngineServer.js");
const { isConsistentWithHistory } = require("../../game-engine/history");
const { parseWordlist } = require("../../game-engine/validation");
const fs = require("fs");
const path = require("path");

const WORDS = fs.readFileSync(path.join(__dirname, "../../wordlists/allowed_secrets.txt"), "utf8")
  .trim()
  .split("\n");

engine.registerPower("suggestGuess", {
  apply(state, action, roomId, io) {

    // Once per match
    if (state.powers.suggestGuessUsed) return false;
    state.powers.suggestGuessUsed = true;
    state.powers.suggestGuessActive = true;

    const feasible = WORDS.filter(w =>
      isConsistentWithHistory(state.history, w, state)
    );
    if (feasible.length === 0) {
      io.to(action.playerId).emit("toast", "No valid suggestions!");
      return;
    }

    const suggestion = feasible[Math.floor(Math.random() * feasible.length)];
    if (!action.ai) {
      io.to(action.playerId).emit("suggestWord", {word: suggestion});
    }

    io.to(roomId).emit("powerUsed", { type: "suggestGuess" });
  }
});
