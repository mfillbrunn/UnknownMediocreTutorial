// constraints.js — NON-MODULE VERSION

window.renderPatternInto = function (el, pattern, revealInfo = null) {
  let html = "";

  for (let i = 0; i < pattern.length; i++) {
    const letter = pattern[i] === "-" ? "" : pattern[i];
    const isReveal = revealInfo && revealInfo.pos === i;

    if (isReveal) {
      html += `<span class="pattern-letter reveal-green-letter">${letter}</span> `;
    } else {
      html += `<span class="pattern-letter">${letter || "-"}</span> `;
    }
  }

  el.innerHTML = html.trim();
};


// Helper: should this tile be ignored due to vowelRefresh?
function isVowelRefreshDrop(state, pos, roundIndex) {
  const eff = state.powers?.vowelRefreshEffect;
  return (
    eff &&
    eff.guessIndex === roundIndex &&
    eff.indices.includes(pos)
  );
}


// ============================================================
// PATTERN LOGIC
// ============================================================
window.getPattern = function (state, isSetter) {

  if (!state.history || state.history.length === 0) {
    return ["-", "-", "-", "-", "-"];
  }

  const pattern = ["-", "-", "-", "-", "-"];

 // 1. Insert forced greens from extraConstraints
if (state.extraConstraints?.length) {
  for (const c of state.extraConstraints) {
    if (c.type === "GREEN") {
      pattern[c.index] = c.letter;
    }
  }
}


  // 2. Normal greens from history, except vowelRefresh drops
  const fbKey = isSetter ? "fb" : "fbGuesser";

  for (const h of state.history) {
    if (h.ignoreConstraints) continue;

    const fb = h[fbKey];
    if (!Array.isArray(fb) || fb.length !== 5) continue;
    const guess = h.guess.toUpperCase();

    for (let i = 0; i < 5; i++) {

      // VowelRefresh drops constraints for that tile
      if (isVowelRefreshDrop(state, i, h.roundIndex)) continue;

      if (fb[i] === "🟩") {
        // Do not overwrite forced greens
        if (pattern[i] === "-") {
          pattern[i] = guess[i];
        }
      }
    }
  }

  return pattern;
};


// ============================================================
// MUST-CONTAIN LOGIC
// ============================================================
window.getMustContainLetters = function (state, isSetter) {
  if (!state.history) return [];

  const fbKey = isSetter ? "fb" : "fbGuesser";

  const requiredCounts = {};
  const forbiddenPositions = {};
  const greenPositions = {};

  // 1. Scan history for yellows (but skip vowelRefresh positions)
  for (const h of state.history) {
    if (h.ignoreConstraints) continue;

    const fb = h[fbKey];
    if (!Array.isArray(fb) || fb.length !== 5) continue;

    const guess = h.guess.toUpperCase();

    // Greens for letter counting
    for (let i = 0; i < 5; i++) {

      if (isVowelRefreshDrop(state, i, h.roundIndex)) continue;

      if (fb[i] === "🟩") {
        const L = guess[i];
        greenPositions[L] = greenPositions[L] || new Set();
        greenPositions[L].add(i);
      }
    }

    // Yellows
    for (let i = 0; i < 5; i++) {

      if (isVowelRefreshDrop(state, i, h.roundIndex)) continue;

      const L = guess[i];
      if (fb[i] === "🟨") {
        requiredCounts[L] = (requiredCounts[L] || 0) + 1;
        forbiddenPositions[L] = forbiddenPositions[L] || new Set();
        forbiddenPositions[L].add(i);
      }
    }
  }

  // Build results
  const result = [];

  Object.keys(requiredCounts).forEach(letter => {
    const countNeeded = requiredCounts[letter];
    const greens = greenPositions[letter]?.size || 0;

    let entry = letter;

    if (greens >= countNeeded) {
      const diff = countNeeded - greens;
      if (diff > 0) entry = `${letter} (another ${letter})`;
      else return;
    }

    const forb = [...(forbiddenPositions[letter] || [])]
      .filter(pos => !(greenPositions[letter]?.has(pos)));

    if (forb.length > 0) {
      entry += ` (not ${forb.map(x => x + 1).join(", ")})`;
    }

    result.push(entry);
  });
    // Add forced greens from extraConstraints
    if (state.extraConstraints?.length) {
      for (const c of state.extraConstraints) {
        if (c.type === "GREEN") {
          result.push(`${c.letter} (${c.index + 1})`);
        }
      }
    }

  // Add forced greens to mustContain (fixed letters)
  return result;
};


window.formatPattern = arr => arr.join(" ");
