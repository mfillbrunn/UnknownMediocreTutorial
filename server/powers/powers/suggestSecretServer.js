const engine = require("../powerEngineServer.js");
const { isConsistentWithHistory } = require("../../game-engine/history");
const { getSocketIdForUser } = require("../../core/rooms");
const fs = require("fs");
const path = require("path");

const WORDS = fs.readFileSync(
  path.join(__dirname, "../../wordlists/allowed_secrets.txt"),
  "utf8"
)
  .trim()
  .split("\n");

engine.registerPower("suggestSecret", {
  apply(state, action, roomId, io, room) {
    if (state.powers.suggestSecretUsed) return false;
    if (state.powers.freezeActive) return false;

    const feasible = WORDS.filter((w) =>
      isConsistentWithHistory(state.history, w, state)
    );

    if (feasible.length === 0) {
      const socketId = getSocketIdForUser(room, action.userId);
      if (socketId) {
        io.to(socketId).emit("toast", "No valid secrets!");
      }
      return false;
    }

    let candidates = feasible;

    if (feasible.length > 1 && state.pendingGuess) {
      const upperPending = state.pendingGuess.toUpperCase();
      const filtered = feasible.filter(
        (w) => w.toUpperCase() !== upperPending
      );
      if (filtered.length > 0) {
        candidates = filtered;
      }
    }

    const suggestion =
      candidates[Math.floor(Math.random() * candidates.length)];

    state.powers.suggestSecretUsed = true;
    state.powers.suggestSecretActive = true;
    state.powers.suggestedSecret = suggestion;

    if (!action.ai) {
      const socketId = getSocketIdForUser(room, action.userId);
      if (socketId) {
        io.to(socketId).emit("suggestWord", { word: suggestion });
      }
    }

    io.to(roomId).emit("powerUsed", { type: "suggestSecret" });
    return true;
  }
});
