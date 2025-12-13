// suggestSecret power (setter)
const engine = require("../powerEngineServer.js");
const { isConsistentWithHistory } = require("../../game-engine/history");
const { parseWordlist } = require("../../game-engine/validation");
const fs = require("fs");
const path = require("path");

const WORDS = fs.readFileSync(path.join(__dirname, "../../wordlists/allowed_guesses.txt"), "utf8")
  .trim()
  .split("\n");

engine.registerPower("suggestSecret", {
  apply(state, action, roomId, io) {

    // Once per match
    if (state.powers.suggestSecretUsed) return;

    // Cannot operate while frozen
    if (state.powers.freezeActive) return;

    state.powers.suggestSecretUsed = true;

    const feasible = WORDS.filter(w =>
      isConsistentWithHistory(state.history, w)
    );

    if (feasible.length === 0) {
      io.to(action.playerId).emit("toast", "No valid secrets!");
      return;
    }

    const suggestion = feasible[Math.floor(Math.random() * feasible.length)];

    io.to(action.playerId).emit("suggestWord", {
      word: suggestion
    });
  }
});
