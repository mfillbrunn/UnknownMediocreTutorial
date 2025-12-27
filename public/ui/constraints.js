// /public/ui/constraints.js — MODULAR VERSION (no power logic inside)

window.getPattern = function (state, isSetterView) {
  let pattern = ["-", "-", "-", "-", "-"];

  if (!state?.history?.length) {
    return pattern;
  }

  for (const entry of state.history) {
    const fbArray = isSetterView ? entry.fb : entry.fbGuesser;
    if (!Array.isArray(fbArray) || fbArray.length !== 5) {
      continue;
    }

    for (let i = 0; i < 5; i++) {
      if (fbArray[i] === "🟩") {
        pattern[i] = entry.guess[i].toUpperCase();
      }
    }
  }
  // Apply forced greens from extraConstraints
  if (state.extraConstraints?.length) {
    for (const c of state.extraConstraints) {
      if (c.type === "GREEN") {
        pattern[c.index] = c.letter;
      }
    }
  }

  return pattern;
};


// ------- APPLY POWER MODS -------
function applyPatternPowers(pattern, state, isSetterView) {
  // Let power modules rewrite / hide / modify pattern
  if (window.PowerEngine) {
    for (const id in PowerEngine.powers) {
      const mod = PowerEngine.powers[id];
      if (mod.patternEffects) {
        mod.patternEffects(state, isSetterView, pattern);
      }
    }
  }
  return pattern.join("");
}

// ----------------------------------------------------------

window.getMustContainLetters = function (state) {
  const must = new Set();
  if (!state?.history?.length) return [];

  for (const entry of state.history) {
    const fbArray = entry.fb ?? entry.fbGuesser;

    if (!Array.isArray(fbArray) || fbArray.length !== 5) {
      continue;
    }

    for (let i = 0; i < 5; i++) {
      const fb = fbArray[i];
      if (fb === "🟩" || fb === "🟨") {
        must.add(entry.guess[i].toUpperCase());
      }
    }
  }
  // Apply extraConstraints
  if (state.extraConstraints?.length) {
    for (const c of state.extraConstraints) {
      if (c.type === "GREEN") {
        must.add(c.letter);
      }
    }
  }

  return Array.from(must);
};


// ------- APPLY POWER MODS -------
function applyMustContainPowers(arr, state) {
  if (window.PowerEngine) {
    for (const id in PowerEngine.powers) {
      const mod = PowerEngine.powers[id];
      if (mod.mustContainEffects) {
        mod.mustContainEffects(state, arr);
      }
    }
  }
  return arr;
}

// ----------------------------------------------------------

window.formatPattern = function (pattern) {
  // Accept array or string
  if (Array.isArray(pattern)) {
    return pattern.join(" ");
  }
  if (typeof pattern === "string") {
    return pattern.split("").join(" ");
  }
  return "";
};

window.getConstraintGrid = function (state, isSetterView) {
  const grid = Array.from({ length: 5 }, () => ({
    green: null,
    forbidden: new Set()
  }));

  if (!state) return grid;

  // 1️⃣ Greens and forbidden letters from history
// 1️⃣ Greens and forbidden letters from history
if (state.history?.length) {
  for (const entry of state.history) {
    const fbArray = isSetterView ? entry.fb : entry.fbGuesser;
    if (!Array.isArray(fbArray)) continue;

    const guess = entry.guess.toUpperCase();

    // First pass: which letters are known to be in the word?
    const knownInWord = new Set();
    for (let i = 0; i < 5; i++) {
      if (fbArray[i] === "🟩" || fbArray[i] === "🟨") {
        knownInWord.add(guess[i]);
      }
    }

    // Second pass: apply positional constraints
    for (let i = 0; i < 5; i++) {
      const letter = guess[i];
      const fb = fbArray[i];

      if (fb === "🟩") {
        grid[i].green = letter;
        grid[i].forbidden.clear();
      }
      else if (fb === "🟨") {
        grid[i].forbidden.add(letter);
      }
      else if (fb === "⬛" && knownInWord.has(letter)) {
        // 🔥 THIS IS THE MISSING RULE
        grid[i].forbidden.add(letter);
      }
    }
  }
}

// 2️⃣ Forced greens from extraConstraints (override)
if (state.extraConstraints?.length) {
  for (const c of state.extraConstraints) {
    if (c.type !== "GREEN") continue;

    const idx = c.index;
    grid[idx].green = c.letter;
    grid[idx].forbidden.clear();
  }
}


  return grid;
};



window.renderConstraintRow = function ({
  state,
  container,
  isSetterView
}) {
  if (state.powers?.blindGuessActive) {return;}

  container.innerHTML = "";

  const grid = getConstraintGrid(state, isSetterView);
  const bsIdx   = state.powers?.blindSpotIndex;
  const bsRound = state.powers?.blindSpotRoundIndex;

  for (let i = 0; i < 5; i++) {
    const tile = document.createElement("div");
    tile.className = "history-tile constraint-tile";

    const cell = grid[i];
// 🟪 Blind Spot (persistent from activation onward)
      if (
        typeof bsIdx === "number" &&
        i === bsIdx
      ) {
        tile.classList.add("tile-blindspot");
      
        if (isSetterView) {
          // Setter sees the real letter (if known)
          if (cell.green) {
            tile.textContent = cell.green;
          }
        } else {
          // Guesser sees masked letter
          tile.textContent = "?";
        }
      
        container.appendChild(tile);
        continue;
      }



    // 🟩 Green
    if (cell.green) {
      tile.classList.add("tile-green");
      tile.textContent = cell.green;
      container.appendChild(tile);
      continue;
    }

    // ❌ Forbidden letters only
    // ❌ Forbidden letters only (alphabetically ordered)
const letters = Array
  .from(cell.forbidden)
  .sort()        // ← alphabetical
  .slice(0, 4);  // ← cap to quadrants

for (const letter of letters) {
  const span = document.createElement("span");
  span.className = "constraint-letter forbidden";
  span.textContent = letter;
  tile.appendChild(span);
}


    // If nothing known, show plain gray
    if (cell.forbidden.size === 0) {
      tile.classList.add("tile-gray");
    }

    container.appendChild(tile);
  }
};


