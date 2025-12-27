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
    state.powerUsedThisTurn = true;

    const feasible = WORDS.filter(w =>
      isConsistentWithHistory(state.history, w, state)
    );

    if (feasible.length === 0) {
      io.to(action.playerId).emit("toast", "No valid secrets!");
      return;
    }

    let candidates = feasible;

    // Only filter if there is more than one option
    if (feasible.length > 1 && state.pendingGuess) {
      const upperPending = state.pendingGuess.toUpperCase();

      const filtered = feasible.filter(
        w => w.toUpperCase() !== upperPending
      );

      // Only use filtered list if it doesn't eliminate everything
      if (filtered.length > 0) {
        candidates = filtered;
      }
    }

    const suggestion =
      candidates[Math.floor(Math.random() * candidates.length)];

    io.to(action.playerId).emit("suggestWord", {
      word: suggestion
    });
  }
});

