// /powers/powers/secretThemesServer.js — Secret Themes (guesser power,
// Power Choice Rare reward). Reads the categories the secret belongs to
// right now and hands the guesser that list.
//
// Deliberately a single reading rather than a standing feed like Secret
// Vowel Count: apply() snapshots the labels once and nothing recomputes
// them, so if the Secretkeeper later swaps to a New secret the reward does
// not follow it. The snapshot is cleared at the round transition
// (clearRoundPowerActivity.js) along with every other round-scoped power
// result, since the next round has its own secret.
const engine = require("../powerEngineServer.js");
const { themeLabelsForWord } = require("../../utils/secretThemes");

engine.registerPower("secretThemes", {
  apply(state, action, roomId, io) {
    if (state.powers.secretThemesUsed) return false;

    const labels = themeLabelsForWord(state.secret);
    if (!labels.length) return false;

    state.powers.secretThemesUsed = true;
    state.powers.secretThemesRevealed = labels;

    io.to(roomId).emit("powerUsed", { type: "secretThemes" });
  },

  postScore() {},
  turnStart() {}
});
