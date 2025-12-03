// /powers/applyPowers.js
// SERVER-SIDE — handles updates to state when a power is activated.

//
// This module modifies the game state when either the setter or guesser
// activates a power. These functions are called from index.js.
//

function pickRandomLettersFromHistory(state, max = 4) {
  const letters = new Set();

  for (const h of state.history) {
    for (const ch of h.guess.toUpperCase()) {
      letters.add(ch);
    }
  }

  const arr = Array.from(letters);
  if (arr.length <= max) return arr;

  const chosen = [];
  while (chosen.length < max && arr.length > 0) {
    const idx = Math.floor(Math.random() * arr.length);
    chosen.push(arr[idx]);
    arr.splice(idx, 1);
  }
  return chosen;
}

function applySetterPower(state, action, role, roomId, io) {
  switch (action.type) {

    case "USE_HIDETILE":
      // your old logic — allow up to 2 uses
      if (state.powers.hideTileUsed && state.powers.hideTilePendingCount === 0) {
        return;
      }
      state.powers.hideTileUsed = true;
      state.powers.hideTilePendingCount = Math.min(
        2,
        state.powers.hideTilePendingCount + 1
      );
      io.to(roomId).emit("powerUsed", { player: role, type: "hideTile" });
      break;

    case "USE_REUSELETTERS":
      state.powers.reuseLettersUsed = true;
      state.powers.reuseLettersPool = pickRandomLettersFromHistory(state, 4);
      io.to(roomId).emit("powerUsed", {
        player: role,
        type: "reuseLetters",
        letters: state.powers.reuseLettersPool
      });
      break;

    case "USE_CONFUSECOLORS":
      if (state.powers.confuseColorsUsed) return;
      state.powers.confuseColorsUsed = true;
      state.powers.confuseColorsActive = true;
      io.to(roomId).emit("powerUsed", { player: role, type: "confuseColors" });
      break;

    case "USE_COUNTONLY":
      if (state.powers.countOnlyUsed) return;
      state.powers.countOnlyUsed = true;
      state.powers.countOnlyActive = true;
      io.to(roomId).emit("powerUsed", { player: role, type: "countOnly" });
      break;
  }
}

function applyGuesserPower(state, action, role, roomId, io) {
  switch (action.type) {

    case "USE_REVEALGREEN":
      if (state.powers.revealGreenUsed) return;
      if (!state.secret) return;

      const pos = Math.floor(Math.random() * 5);
      const letter = state.secret[pos].toUpperCase();

      state.revealGreenInfo = { pos, letter };
      state.powers.revealGreenUsed = true;

      io.to(roomId).emit("powerUsed", {
        player: role,
        type: "revealGreen",
        pos,
        letter
      });
      break;

    case "USE_FREEZESECRET":
      if (state.powers.freezeSecretUsed) return;
      if (!state.firstSecretSet) return;

      state.powers.freezeSecretUsed = true;
      state.powers.freezeActive = true;

      io.to(roomId).emit("powerUsed", {
        player: role,
        type: "freezeSecret"
      });
      break;
  }
}

module.exports = {
  applySetterPower,
  applyGuesserPower
};
