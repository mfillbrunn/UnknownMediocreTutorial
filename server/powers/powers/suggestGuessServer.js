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

engine.registerPower("suggestGuess", {
  apply(state, action, roomId, io, room) {
    // Two charges per round — can be activated on two separate turns
    // (never the same turn, powerUsedThisTurn already prevents that).
    if ((state.powers.suggestGuessUses || 0) >= 2) return false;

    const feasible = WORDS.filter((w) =>
      isConsistentWithHistory(state.history, w, state)
    );

    if (feasible.length === 0) {
      const socketId = getSocketIdForUser(room, action.userId);
      if (socketId) {
        io.to(socketId).emit("toast", "No valid suggestions!");
      }
      return false;
    }

    const suggestion =
      feasible[Math.floor(Math.random() * feasible.length)];

    state.powers.suggestGuessUsed = true;
    state.powers.suggestGuessUses = (state.powers.suggestGuessUses || 0) + 1;
    state.powers.suggestGuessActive = true;
    state.powers.suggestedGuess = suggestion;

    const socketId = getSocketIdForUser(room, action.userId);
    if (socketId) {
      io.to(socketId).emit("suggestWord", { word: suggestion });
    }

    io.to(roomId).emit("powerUsed", { type: "suggestGuess" });
    return true;
  }
});
