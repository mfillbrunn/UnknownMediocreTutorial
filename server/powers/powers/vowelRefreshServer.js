const engine = require("../powerEngineServer.js");

engine.registerPower("vowelRefresh", {
  apply(state) {
    if (state.powers.vowelRefreshUsed) return;
    state.powers.vowelRefreshUsed = true;
    state.powerUsedThisTurn = true;

    const last = state.history[state.history.length - 1];
    if (!last) return;

    const vowels = new Set(["A","E","I","O","U"]);
    const guess = last.guess.toUpperCase();
    const out = [];

    for (let i = 0; i < 5; i++) if (vowels.has(guess[i])) out.push(guess[i]);

    state.powers.vowelRefreshLetters = out;
    state.powers.vowelRefreshPending = true;

    for (const h of state.history) {
      h.vowelRefreshLetters = out.slice();
      h.ignoreConstraints = true;

      h.fb = h.fb.map((fb, i) =>
        out.includes(h.guess[i].toUpperCase()) ? null : fb
      );
    }
  },

  postScore(state, entry) {
    if (!state.powers.vowelRefreshPending) return;

    entry.vowelRefreshApplied = true;
    entry.vowelRefreshLetters = state.powers.vowelRefreshLetters.slice();

    entry.fb = entry.fb.map((fb, i) =>
      entry.vowelRefreshLetters.includes(entry.guess[i].toUpperCase())
        ? null
        : fb
    );

    entry.ignoreConstraints = true;
    state.powers.vowelRefreshPending = false;
  },

  turnStart(state, role) {
    if (role === state.setter) return;
    state.powers.vowelRefreshLetters = null;
  }
});
