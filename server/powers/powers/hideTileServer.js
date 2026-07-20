// /powers/powers/hideTileServer.js
// Server-side logic for Hide Tile power (setter ability)
//
// The setter chooses exactly which tile of the pending guess gets hidden
// (by tapping it client-side — see public/powerEngine/powers/hideTile.js),
// instead of the server picking one at random. That tile's result is
// withheld from BOTH sides: the guesser already couldn't see it (existing
// fbGuesser masking below); now the setter can't either, via
// getSetterTileClasses' client-side rendering (entry.fb itself stays
// truthful here — it's still needed for secret-consistency validation —
// only the setter's OWN view of it is masked, the same "hide the display,
// not the data" pattern blindGuess/stealthGuess already use).
const engine = require("../powerEngineServer.js");

engine.registerPower("hideTile", {
  apply(state, action, roomId, io) {
    // Two charges per round — can be activated on two separate turns
    // (never the same turn, powerUsedThisTurn already prevents that).
    if ((state.powers.hideTileUses || 0) >= 2) return false;
    if (!state.pendingGuess) return false;

    const index = Number(action.index);
    if (!Number.isInteger(index) || index < 0 || index > 4) return false;

    state.powers.hideTileUsed = true;
    state.powers.hideTileUses = (state.powers.hideTileUses || 0) + 1;
    state.powers.hideTileActive = true;
    state.powers.hideTilePendingIndex = index;

    io.to(roomId).emit("powerUsed", { type: "hideTile" });
  },

  postScore(state, entry) {
    if (typeof state.powers.hideTilePendingIndex !== "number") {
      entry.hiddenIndices = null;
      return;
    }

    const idx = state.powers.hideTilePendingIndex;
    state.powers.hideTilePendingIndex = null;

    entry.hiddenIndices = [idx];
    entry.hideTileApplied = true;
    entry.powerUsed = "HideTile";

    // Mask feedback for the guesser.
    entry.fbGuesser = entry.fbGuesser.slice();
    entry.fbGuesser[idx] = "❓";
  }
});
