// /public/ui/constraints.js — MODULAR VERSION (no power logic inside)

window.getPattern = function (state, isSetterView) {
  let pattern = ["-", "-", "-", "-", "-"];

  if (!state?.history?.length) {
    return pattern;
  }

  for (const entry of state.history) {
    const fbArray = isSetterView ? entry.fb : entry.fbGuesser;

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
  return pattern.split("").join(" ");
};
