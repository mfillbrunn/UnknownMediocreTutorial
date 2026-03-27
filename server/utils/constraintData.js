function getEffectiveFbForConstraints(entry, isSetterView) {
  if (isSetterView) return entry.fb;

  const result = Array(5).fill(null);

  if (!entry.fakeFeedback?.entry1 || !entry.fakeFeedback?.entry2) {
    return entry.fbGuesser;
  }

  const e1 = entry.fakeFeedback.entry1;
  const e2 = entry.fakeFeedback.entry2;

  if (!Array.isArray(e1) || !Array.isArray(e2)) {
    return entry.fbGuesser;
  }

  for (let i = 0; i < 5; i++) {
    if (e1[i] === e2[i]) {
      result[i] = e1[i];
    }
  }

  return result;
}

function getPattern(state, isSetterView) {
  const pattern = ["-", "-", "-", "-", "-"];

  if (!state?.history?.length) {
    return pattern;
  }

  for (const entry of state.history) {
    const fbArray = getEffectiveFbForConstraints(entry, isSetterView);
    if (!Array.isArray(fbArray) || fbArray.length !== 5) continue;

    for (let i = 0; i < 5; i++) {
      if (fbArray[i] === "🟩") {
        pattern[i] = entry.guess[i].toUpperCase();
      }
    }
  }

  if (state.extraConstraints?.length) {
    for (const c of state.extraConstraints) {
      if (c.type === "GREEN") {
        pattern[c.index] = c.letter;
      }
    }
  }

  return pattern;
}

function getMustContainLetters(state) {
  const must = new Set();
  if (!state?.history?.length) return [];

  for (const entry of state.history) {
    const fbArray = entry.fb ?? entry.fbGuesser;
    if (!Array.isArray(fbArray) || fbArray.length !== 5) continue;

    for (let i = 0; i < 5; i++) {
      const fb = fbArray[i];
      if (fb === "🟩" || fb === "🟨") {
        must.add(entry.guess[i].toUpperCase());
      }
    }
  }

  if (state.extraConstraints?.length) {
    for (const c of state.extraConstraints) {
      if (c.type === "GREEN") {
        must.add(c.letter);
      }
    }
  }

  return Array.from(must);
}

function getConstraintGrid(state, isSetterView) {
  const grid = Array.from({ length: 5 }, () => ({
    green: null,
    forbidden: []
  }));

  if (!state) return grid;

  if (state.history?.length) {
    for (const entry of state.history) {
      const fbArray = getEffectiveFbForConstraints(entry, isSetterView);
      if (!Array.isArray(fbArray) || fbArray.length !== 5) continue;

      const guess = entry.guess.toUpperCase();

      const knownInWord = new Set();
      for (let i = 0; i < 5; i++) {
        if (fbArray[i] === "🟩" || fbArray[i] === "🟨") {
          knownInWord.add(guess[i]);
        }
      }

      for (let i = 0; i < 5; i++) {
        const letter = guess[i];
        const fb = fbArray[i];

        if (fb === "🟩") {
          grid[i].green = letter;
          grid[i].forbidden = [];
        } else if (fb === "🟨") {
          if (!grid[i].forbidden.includes(letter)) {
            grid[i].forbidden.push(letter);
          }
        } else if (fb === "⬛" && knownInWord.has(letter)) {
          if (!grid[i].forbidden.includes(letter)) {
            grid[i].forbidden.push(letter);
          }
        }
      }
    }
  }

  if (state.extraConstraints?.length) {
    for (const c of state.extraConstraints) {
      if (c.type !== "GREEN") continue;
      const idx = c.index;
      grid[idx].green = c.letter;
      grid[idx].forbidden = [];
    }
  }

  for (const cell of grid) {
    cell.forbidden.sort();
  }

  return grid;
}

function buildConstraintData(state, role) {
  const isSetterView = role === state.setter;

  return {
    pattern: getPattern(state, isSetterView),
    mustContain: getMustContainLetters(state),
    grid: getConstraintGrid(state, isSetterView)
  };
}

module.exports = {
  buildConstraintData
};
