// /public/ui/constraints.js — MODULAR VERSION (no power logic inside)

window.getPattern = function (state, isSetterView) {
  let pattern = ["-", "-", "-", "-", "-"];

  if (!state?.history?.length) {
    return pattern;
  }

  for (const entry of state.history) {
    console.log("ENTRY RECEIVED BY CONSTRAINTS:", entry);
    const fbArray = isSetterView ? entry.fb : entry.fbGuesser;
    console.log("FB ARRAY SELECTED:", fbArray);

    if (!Array.isArray(fbArray) || fbArray.length !== 5) {
      console.warn("Skipping invalid history entry (pattern):", entry);
      continue;
    }

    for (let i = 0; i < 5; i++) {
      if (fbArray[i] === "🟩") {
        pattern[i] = entry.guess[i].toUpperCase();
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
      console.warn("Skipping invalid history entry (mustContain):", entry);
      continue;
    }

    for (let i = 0; i < 5; i++) {
      const fb = fbArray[i];
      if (fb === "🟩" || fb === "🟨") {
        must.add(entry.guess[i].toUpperCase());
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
    yellows: new Set()
  }));

  if (!state) return grid;

  // 1️⃣ Greens from scoring history
  if (state.history?.length) {
    for (const entry of state.history) {
      const fbArray = isSetterView ? entry.fb : entry.fbGuesser;
      if (!Array.isArray(fbArray)) continue;

      const guess = entry.guess.toUpperCase();

      for (let i = 0; i < 5; i++) {
        if (fbArray[i] === "🟩") {
          grid[i].green = guess[i];
        } else if (fbArray[i] === "🟨") {
          grid[i].yellows.add(guess[i]);
        }
      }
    }
  }

  // 2️⃣ Greens forced by powers (OVERRIDE)
  if (state.powers?.forcedGreens) {
    for (const [i, letter] of Object.entries(state.powers.forcedGreens)) {
      const idx = Number(i);
      grid[idx].green = letter.toUpperCase();
      grid[idx].yellows.clear(); // once green, yellows here are irrelevant
    }
  }

  return grid;
};
window.renderConstraintRow = function ({
  state,
  container,
  isSetterView
}) {
  container.innerHTML = "";

  const grid = getConstraintGrid(state, isSetterView);

  for (let i = 0; i < 5; i++) {
    const tile = document.createElement("div");
    tile.className = "history-tile";

    const cell = grid[i];

    if (cell.green) {
      tile.classList.add("tile-green");
      tile.textContent = cell.green;
    }
    else if (cell.yellows.size > 0) {
      tile.classList.add("tile-yellow");
      tile.classList.add("constraint-yellow");

      const letters = Array.from(cell.yellows).slice(0, 4);
      for (const letter of letters) {
        const span = document.createElement("span");
        span.className = "constraint-letter";
        span.textContent = letter;
        tile.appendChild(span);
      }
    }
    else {
      tile.classList.add("tile-gray");
    }

    container.appendChild(tile);
  }
};

